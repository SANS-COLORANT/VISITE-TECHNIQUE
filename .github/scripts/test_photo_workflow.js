/** Executable regression tests: real SQLite + mocked Android filesystem/HTTP.
 * The production JS repositories are executed, not reimplemented in the test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; console.log(`OK ${checks}: ${label}`); }
function load(file, dependencies = {}, sourceOverride = null) {
  const source = sourceOverride == null ? fs.readFileSync(path.join(root, file), 'utf8') : sourceOverride;
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) names.push(...match[1].split(',').map((n) => n.trim()).filter(Boolean));
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}
function databaseProcess(filename) {
  const child = spawn('python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map(); let seq = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line), waiter = pending.get(response.id);
    if (!waiter) return; pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  child.on('error', (error) => { for (const p of pending.values()) p.reject(error); pending.clear(); });
  child.on('exit', () => { for (const p of pending.values()) p.reject(new Error('SQLite adapter exited')); pending.clear(); });
  function send(method, sql = '', params = []) { return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  }); }
  const db = { getAllAsync: (sql, params) => send('all', sql, params), getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql) };
  db.withExclusiveTransactionAsync = async (fn) => { await send('run', 'BEGIN'); try { const result = await fn(db); await send('run', 'COMMIT'); return result; } catch (e) { await send('run', 'ROLLBACK'); throw e; } };
  db.withTransactionAsync = (fn) => db.withExclusiveTransactionAsync(() => fn());
  return { db, send, close: () => child.stdin.end() };
}
const photo = (id, extra = {}) => ({ id, description: `Photo ${id}`, ordre: id, disponible: true, typeMime: 'image/jpeg', tailleOctets: 10, largeurPixels: 1600, hauteurPixels: 1200,
  cheminTelechargement: `/api/clients/12/dernieres-visites/photos/${id}`, ...extra });
const payload = () => ({ client: { id: 12, nom: 'Client test' }, sites: [
  { site: { id: 45, nom: 'Site A' }, locaux: [
    { local: { id: 501, designation: 'Chaufferie', ordre: 1 }, derniereVisite: { id: 812, date: '2026-08-28', statut: 'Terminee' }, photos: [photo(9001), photo(9002)] },
    { local: { id: 502, designation: 'SST', ordre: 2 }, derniereVisite: { id: 813, date: '2026-08-29' }, photos: [photo(9003)] },
  ] },
  { site: { id: 46, nom: 'Site B' }, locaux: [
    { local: { id: 503, designation: 'VMC' }, derniereVisite: { id: 814, date: '2026-08-30' }, photos: [photo(9004), photo(9005, { disponible: false, cheminTelechargement: null })] },
    { local: { id: 504, designation: 'Local sans visite' }, derniereVisite: null, photos: [] },
  ] },
] });

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-photo-test-'));
  let server = databaseProcess(path.join(dir, 'test.db'));
  try {
    // Upgrade path first: preserve a pre-existing v31 installation and its photos.
    await server.send('migrate', '', [0, 31]);
    await server.db.execAsync(`
      INSERT INTO clients(id,nom) VALUES('client-local','Client test');
      INSERT INTO sites(id,client_id,nom_site) VALUES('site-local','client-local','Site A');
      INSERT INTO visites(id,site_id,trame_id) VALUES('visit-icpe','site-local','icpe_v1');
      INSERT INTO visites(id,site_id,trame_id) VALUES('visit-vmc','site-local','vmc');
      INSERT INTO visites(id,site_id,trame_id) VALUES('visit-pre','site-local','pre_allumage');
      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('12','client-local','Client test','{}');
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','site-local','Site A','{}');
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','site-local');
      INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json) VALUES('501','45','Chaufferie','{}');
      INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json) VALUES('502','45','SST','{}');
      UPDATE visites SET api_remote_local_id='501' WHERE id='visit-icpe';
    `);
    await server.send('migrate', '', [31, 32]);
    await server.send('migrate', '', [31, 32]);
    check((await server.db.getAllAsync('SELECT id FROM visites')).length === 3, 'v31 -> v32 upgrade preserves ICPE/VMC/PRE visits; v32 is idempotent');
    const model = load('latestVisitPhotoModel.js');
    let repository = load('latestVisitPhotosDb.js', { openAppDatabase: async () => server.db, ...model });
    const files = new Map(), calls = []; let running = 0, maximum = 0, rateLimited = false;
    let failMime = null, failSize = null, failPath = null, failDirectory = false, diskBytes = 10 ** 10, delay = 8;
    const FileSystem = {
      documentDirectory: 'file:///private/',
      makeDirectoryAsync: async () => { if (failDirectory) throw new Error('disk unavailable'); },
      getFreeDiskStorageAsync: async () => diskBytes,
      getInfoAsync: async (uri) => ({ exists: files.has(uri), size: files.get(uri) || 0 }),
      deleteAsync: async (uri) => { files.delete(uri); },
      moveAsync: async ({ from, to }) => { assert.ok(files.has(from)); files.set(to, files.get(from)); files.delete(from); },
    };
    const transport = async (route, target) => {
      const id = Number(route.split('/').pop()); calls.push(id); running++; maximum = Math.max(maximum, running);
      try {
        await new Promise((r) => setTimeout(r, delay));
        if (id === failPath) throw Object.assign(new Error('Photo no longer in latest visit'), { status: 404 });
        if (id === 9003 && !rateLimited) { rateLimited = true; throw Object.assign(new Error('rate limited'), { status: 429, retryAfter: '0' }); }
        files.set(target, id === failSize ? 8 : 10);
        return { headers: { 'content-type': id === failMime ? 'text/html' : 'image/jpeg' } };
      } finally { running--; }
    };
    const createStorage = () => load('latestVisitPhotosStorage.js', { FileSystem, ...repository, ...model,
      downloadProtectedPhoto: transport, fetchClientLatestVisitPhotosManifest: async () => payload() });
    let storage = createStorage();
    let manifest = await repository.cacheLatestVisitPhotosManifest('12', payload());
    check(model.photoSummary(manifest).total === 5, 'normalization preserves site/local/photo structure including unavailable references');
    check(model.photoSummary(model.filterLatestVisitPhotos(manifest, { siteIds: [] })).total === 0, 'empty site selection never downloads the whole client');
    check(model.photoSummary(model.filterLatestVisitPhotos(manifest, { siteIds: ['45'], localIds: ['502'] })).total === 1, 'site and local scopes select exactly the right photos');
    assert.throws(() => repository.normalizeLatestVisitPhotosManifest(payload(), '99'));
    checks++; console.log(`OK ${checks}: mismatched client rejected`);
    const initial = repository.flattenLatestVisitPhotos(manifest)[0];
    files.set('file:///private/old.jpg', 10);
    await repository.markLatestVisitPhotoDownloaded('12', initial, 'file:///private/old.jpg', 10);
    manifest = await storage.loadCachedLatestVisitPhotos('12');
    check(manifest.sites[0].locaux[0].photos[0].localUri === 'file:///private/old.jpg' && manifest.sites[0].locaux[0].photos[0].localAvailable, 'cached metadata and file existence reach the NESTED gallery photo (clone regression)');
    check(model.photoSummary(manifest).saved === 1, 'offline badge reflects the actual file, not only activation');
    files.delete('file:///private/old.jpg');
    manifest = await storage.loadCachedLatestVisitPhotos('12');
    check(!manifest.sites[0].locaux[0].photos[0].localUri && model.photoSummary(manifest).saved === 0, 'missing local file clears availability instead of claiming offline readiness');
    let result = await storage.downloadClientLatestVisitPhotos('12', model.filterLatestVisitPhotos(manifest, { siteIds: ['45'] }));
    check(result.downloaded === 3 && result.failed === 0 && !calls.includes(9004), 'only selected-site files downloaded; 429 retry succeeds');
    check(maximum <= 3, 'download concurrency is bounded at three');
    const firstCalls = calls.length;
    await storage.downloadClientLatestVisitPhotos('12', model.filterLatestVisitPhotos(manifest, { siteIds: ['45'] }));
    check(calls.length === firstCalls, 'retry skips files already downloaded and verified');
    manifest = await storage.loadCachedLatestVisitPhotos('12');
    const pinned = await repository.getVisitPhotoReference('visit-icpe', '12', '45', manifest);
    check(pinned.sites.length === 1 && pinned.pinnedAt, 'reference pinned to a visit, scoped to its site');
    const updated = payload(); updated.sites[0].locaux[0].derniereVisite = { id: 999, date: '2026-09-10' }; updated.sites[0].locaux[0].photos = [];
    await repository.cacheLatestVisitPhotosManifest('12', updated);
    const old = await storage.hydrateLatestVisitPhotosCache('12', await repository.getVisitPhotoReference('visit-icpe', '12', '45', updated));
    check(old.sites[0].locaux[0].derniereVisite.id === '812' && old.sites[0].locaux[0].photos[0].localAvailable, 'new latest visit WITHOUT photos does not erase the prepared reference or its files');
    check(model.referenceSignature(old) !== model.referenceSignature(model.filterLatestVisitPhotos(await storage.loadCachedLatestVisitPhotos('12'), { siteIds: ['45'] })), 'newer reference can be indicated without replacing the pinned version');
    const changed = payload(); changed.sites[0].locaux[0].photos[0].tailleOctets = 20;
    await repository.cacheLatestVisitPhotosManifest('12', changed);
    const current = await storage.loadCachedLatestVisitPhotos('12');
    check(!current.sites[0].locaux[0].photos[0].localAvailable, 'same photo ID with different metadata does not reuse an older file');
    check((await storage.hydrateLatestVisitPhotosCache('12', await repository.getVisitPhotoReference('visit-icpe', '12', '45'))).sites[0].locaux[0].photos[0].localAvailable, 'older version remains available for pinned reference');
    await repository.cacheLatestVisitPhotosManifest('12', payload());
    check((await repository.resolvePhotoContexts({ visiteId: 'visit-icpe' }))[0].remoteLocalId === '501', 'bound visit resolves exact remote local ID');
    check((await repository.resolvePhotoContexts({ visiteId: 'visit-icpe', ignoreVisitLocal: true }))[0].remoteLocalId === null, 'multi-local PRE context does not silently use another room bound to the visit');
    await repository.savePhotoLocalChoice('visit-pre', 'preallumage-local:one', '12', '45', '502');
    check(await repository.readPhotoLocalChoice('visit-pre', 'preallumage-local:one', '12', '45') === '502', 'explicit room choice is persisted per PRE local and visit');
    check(await repository.readPhotoLocalChoice('visit-pre', 'preallumage-local:two', '12', '45') === null, 'room choices do not leak to another PRE local');
    await repository.pinPhotoReferencesForVisit('visit-vmc'); await repository.pinPhotoReferencesForVisit('visit-pre');
    const fieldTables = ['photos', 'remarques', 'controles_visite', 'champs_visite'];
    for (const name of fieldTables) check((await server.db.getFirstAsync(`SELECT COUNT(*) n FROM ${name}`)).n === 0, `${name} not populated by historical photos`);
    server.close(); server = databaseProcess(path.join(dir, 'test.db'));
    repository = load('latestVisitPhotosDb.js', { openAppDatabase: async () => server.db, ...model }); storage = createStorage();
    check((await storage.hydrateLatestVisitPhotosCache('12', await repository.getVisitPhotoReference('visit-icpe', '12', '45'))).sites[0].locaux[0].photos[0].localAvailable, 'reference and file associations survive database close/reopen');
    // Error isolation, security and storage are verified with production code.
    manifest = await storage.loadCachedLatestVisitPhotos('12');
    const siteB = model.filterLatestVisitPhotos(manifest, { siteIds: ['46'], photoIds: ['9004'] });
    failMime = 9004;
    result = await storage.downloadClientLatestVisitPhotos('12', siteB);
    check(result.failed === 1 && !model.photoSummary(result.manifest).saved, 'non-image response is rejected and not exposed as cached');
    failMime = null; failSize = 9004;
    check((await storage.downloadClientLatestVisitPhotos('12', siteB)).failed === 1, 'wrong-size image rejected');
    failSize = null; failDirectory = true;
    check((await storage.downloadClientLatestVisitPhotos('12', siteB)).failed === 1, 'destination failure is contained in file result, not an unhandled worker rejection');
    failDirectory = false;
    const unsafe = structuredClone(siteB); unsafe.sites[0].locaux[0].photos[0].cheminTelechargement = '/api/clients/99/dernieres-visites/photos/9004';
    const beforeUnsafe = calls.length;
    check((await storage.downloadClientLatestVisitPhotos('12', unsafe)).failed === 1 && calls.length === beforeUnsafe, 'cross-client download path rejected before HTTP request');
    diskBytes = 1; await assert.rejects(() => storage.downloadClientLatestVisitPhotos('12', siteB), /Espace insuffisant/); diskBytes = 10 ** 10;
    checks++; console.log(`OK ${checks}: insufficient disk space reported before download`);
    const tasks = load('latestVisitPhotoTasks.js', { ...model, require: () => storage });
    let events = 0;
    const unsubscribe = tasks.subscribePhotoDownloads(() => events++);
    const task = tasks.startPhotoDownload({ clientId: '12', manifest: siteB, label: 'Site B' });
    const duplicate = tasks.startPhotoDownload({ clientId: '12', manifest: siteB, label: 'Site B' });
    check(task.id === duplicate.id, 'double tap coalesces identical pending request');
    unsubscribe();
    await task.completion;
    check(model.photoSummary(await storage.hydrateLatestVisitPhotosCache('12', siteB)).saved === 1 && events > 0, 'closing/unsubscribing UI does not cancel the download');
    // A pending task can be paused while another task owns the global workers.
    const more = payload(); more.sites[0].locaux[0].photos = Array.from({ length: 8 }, (_, i) => photo(9100 + i));
    await repository.cacheLatestVisitPhotosManifest('12', more);
    const all = model.filterLatestVisitPhotos(await storage.loadCachedLatestVisitPhotos('12'), { siteIds: ['45'], localIds: ['501'] });
    delay = 30;
    const job = tasks.startPhotoDownload({ clientId: '12', manifest: all, label: 'Eight files' });
    await new Promise((r) => setTimeout(r, 12)); tasks.pausePhotoDownload(job.id);
    const stopped = await job.completion;
    check(stopped.paused && stopped.downloaded <= 3, 'pause allows in-flight files to finish and prevents further scheduling');
    const resume = tasks.resumePhotoDownload(job.id); await resume.completion;
    check(model.photoSummary(await storage.hydrateLatestVisitPhotosCache('12', all)).saved === 8, 'resume downloads missing files to completion');
    check(maximum <= 3, 'global task queue still respects concurrency after resume');
    await server.db.runAsync(`DELETE FROM visites WHERE id='visit-icpe'`);
    check((await server.db.getFirstAsync(`SELECT COUNT(*) n FROM api_visit_photo_references WHERE visite_id='visit-icpe'`)).n === 0, 'deleting a visit removes its reference association, not shared cached files');
    check((await server.db.getFirstAsync(`SELECT COUNT(*) n FROM api_photo_files`)).n > 0, 'shared private cache survives deletion of one visit');
    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'all foreign keys remain valid');
    const fresh = databaseProcess(path.join(dir, 'fresh.db'));
    try { await fresh.send('migrate', '', [0, 32]); check((await fresh.db.getAllAsync("SELECT name FROM sqlite_master WHERE name='api_visit_photo_references'")).length === 1, 'brand-new database migrates through v32'); } finally { fresh.close(); }
    console.log(`\n${checks} photo workflow checks passed (real SQLite; mocked filesystem and transport).`);
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
