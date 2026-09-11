/** Executable regression tests for automatic same-imported-client Intranet binding. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks += 1; console.log(`OK ${checks}: ${label}`); }
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}
function databaseProcess(filename) {
  const child = spawn('python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map(); let seq = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line), waiter = pending.get(response.id); if (!waiter) return; pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = { getAllAsync: (sql, params) => send('all', sql, params), getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql) };
  db.withExclusiveTransactionAsync = async (fn) => { await send('run', 'BEGIN'); try { const result = await fn(db); await send('run', 'COMMIT'); return result; } catch (e) { await send('run', 'ROLLBACK'); throw e; } };
  db.withTransactionAsync = (fn) => db.withExclusiveTransactionAsync(() => fn());
  return { db, send, close: () => child.stdin.end() };
}

const localTrame = { id: 'icpe_v1', ui: { labels: { 'p-test': 'Contrôles' }, panels: {
  'p-test': { Sous: [{ cle: 'Contrôle A', type: 'controle' }] },
} } };
const remoteTrame = { id: '3', nom: 'ICPE', categories: [{ id: '10', nom: 'Contrôles', sousCategories: [{ id: '20', nom: 'Sous', criteres: [
  { id: '100', nom: 'Contrôle A', avisApplicable: true },
] }] }] };
function reference(localId, designation = 'Chaufferie', trame = remoteTrame) {
  return { local: { id: String(localId), designation }, site: { id: '45', nom: 'Site Alpha' },
    derniereVisite: { id: '812', date: '2026-09-01', statut: 'Terminé' }, trame, materiels: [], remarques: [], notes: [] };
}
function mapRemoteTrameToLocal(remote) {
  const value = String(remote?.nom || '').toLowerCase();
  if (value.includes('vmc') || value.includes('ventilation')) return 'vmc';
  if (value.includes('pre') && value.includes('allum')) return 'pre_allumage';
  if (value.includes('icpe') || value.includes('chauffer') || value.includes('sous-station')) return 'icpe_v1';
  return null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-binding-test-'));
  const server = databaseProcess(path.join(dir, 'binding.db'));
  try {
    await server.send('migrate', '', [0, 33]);
    await server.db.execAsync(`
      INSERT INTO clients(id,nom,code_exploitant) VALUES('local-client','Client Alpha','CL-100');
      INSERT INTO clients(id,nom,code_exploitant) VALUES('other-local-client','Autre client','ZZ-999');
      INSERT INTO sites(id,client_id,nom_site) VALUES('local-site','local-client','Site Alpha');
      INSERT INTO sites(id,client_id,nom_site) VALUES('other-local-site','other-local-client','Autre site');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('ordinary-visit','local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('unimported-visit','other-local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('ordinary-visit','test.sous','Contrôle A','S','Fonctionnement satisfaisant');
      INSERT INTO materiel(id,visite_id,categorie,nombre,designation,etat) VALUES('ordinary-material','ordinary-visit','PRODUCTION CHAUD','1','Chaudière','Bon');

      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,code_everwin,autorise,payload_json) VALUES('12','local-client','Client Alpha','CL-100',1,'{}');
      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,code_everwin,autorise,payload_json) VALUES('99','other-local-client','Autre client','ZZ-999',1,'{}');
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','local-site','Site Alpha','{}');
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','local-site');
    `);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,criteria_count,reference_json)
      VALUES('501','45','Chaufferie','3','ICPE','812','2026-09-01',1,?)`, [JSON.stringify(reference('501'))]);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('503','45','Local sans trame',NULL,NULL,0,?)`, [JSON.stringify(reference('503', 'Local sans trame', null))]);

    let ids = 0;
    const binding = load('intranetVisitBindingDb.js', {
      getDb: async () => server.db,
      createId: () => `binding-prov-${++ids}`,
      mapRemoteTrameToLocal,
    });

    const options = await binding.getVisitIntranetBindingOptions('ordinary-visit');
    check(options.clients.length === 1 && options.clients[0].remote_client_id === '12', 'visit only sees the Intranet client imported into its METRA client');
    check(options.selectedClientId === '12', 'same imported client is resolved automatically');
    check(options.selectedSiteId === '45', 'same imported site is resolved from the durable local site link');
    check(options.suggestedLocalId === '501', 'sole compatible local is resolved automatically');
    check(options.locals.find((row) => row.remote_local_id === '503')?.compatible === false, 'local without a usable remote trame remains non-sendable');

    await assert.rejects(() => binding.bindVisitToIntranetTarget('ordinary-visit', { remoteClientId: '99', remoteSiteId: '45', remoteLocalId: '501' }), /ayant été importé|client Intranet/i);
    checks++; console.log(`OK ${checks}: explicit cross-client upload is rejected even when another client is authorized on the tablet`);

    await assert.rejects(() => binding.bindVisitToImportedClientTarget('unimported-visit'), /n’a pas été importé depuis l’Intranet/);
    checks++; console.log(`OK ${checks}: a purely local client cannot be silently redirected to an arbitrary authorized Intranet client`);

    const before = {
      controls: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id='ordinary-visit'`),
      materials: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM materiel WHERE visite_id='ordinary-visit'`),
    };
    const target = await binding.bindVisitToImportedClientTarget('ordinary-visit');
    check(target.remoteClientId === '12' && target.remoteSiteId === '45' && target.remoteLocalId === '501', 'one automatic action binds visit to its original imported client/site/local');
    const visit = await server.db.getFirstAsync(`SELECT api_remote_client_id,api_remote_local_id,api_remote_trame_id,api_source_remote_visit_id FROM visites WHERE id='ordinary-visit'`);
    check(visit.api_remote_client_id === '12' && visit.api_remote_local_id === '501' && visit.api_remote_trame_id === '3' && visit.api_source_remote_visit_id === '812', 'server identity is frozen on the visit before upload');
    const provenance = await server.db.getFirstAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id='ordinary-visit' ORDER BY importe_le DESC LIMIT 1`);
    const details = JSON.parse(provenance.details_json);
    check(details.sourceType === 'upload_binding' && details.binding?.policy === 'same_imported_client', 'binding provenance records the same-imported-client policy');
    const after = {
      controls: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id='ordinary-visit'`),
      materials: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM materiel WHERE visite_id='ordinary-visit'`),
    };
    check(Number(before.controls.n) === Number(after.controls.n) && Number(before.materials.n) === Number(after.materials.n), 'automatic binding does not rewrite visit observations');

    const payload = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
    const prepared = await payload.buildIntranetVisitPayload('ordinary-visit', '11111111-1111-4111-8111-111111111111');
    check(prepared.remoteClientId === '12' && prepared.payload.visites[0].localId === 501 && prepared.payload.visites[0].trameId === 3, 'wire payload stays on the imported client/local after automatic binding');
    check(prepared.payload.visites[0].criteres[0].avis === 'S' && prepared.payload.visites[0].criteres[0].commentaire === 'Fonctionnement satisfaisant', 'wire payload sends current METRA observation');

    await server.db.execAsync(`
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('ambiguous-visit','local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('ambiguous-visit','test.sous','Contrôle A','S','OK');
    `);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('505','45','Sous-station','3','ICPE',1,?)`, [JSON.stringify(reference('505', 'Sous-station'))]);
    await assert.rejects(() => binding.bindVisitToImportedClientTarget('ambiguous-visit'), /Plusieurs locaux Intranet compatibles/);
    checks++; console.log(`OK ${checks}: multiple compatible locals are never guessed when the visit has no installation link`);

    await server.db.runAsync(`INSERT INTO api_visit_outbox(envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ordinary-visit','12','{}',2,'pending')`);
    await assert.rejects(() => binding.bindVisitToImportedClientTarget('ordinary-visit'), /déjà un envoi|destination ne peut plus/i);
    checks++; console.log(`OK ${checks}: durable queued upload cannot be rebound after its idempotent payload is frozen`);

    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'binding leaves SQLite foreign keys valid');
    console.log(`\n${checks} imported-client binding checks passed (real SQLite, production binding/payload code).`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
