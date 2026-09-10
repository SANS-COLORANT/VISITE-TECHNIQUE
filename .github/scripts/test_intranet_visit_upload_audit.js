/** Focused executable regression tests found during the post-implementation upload audit. */
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
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql),
  };
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
function preparationReference({ trame = remoteTrame, materials = [{ id: 'm1' }], latest = { id: '812', date: '2026-09-01', statut: 'Terminé' } } = {}) {
  return { local: { id: '501', designation: 'Chaufferie' }, site: { id: '45', nom: 'Site A' }, derniereVisite: latest,
    trame, materiels: materials, remarques: [], notes: [] };
}
async function seedVisit(db, id, reference = preparationReference()) {
  await db.execAsync(`
    INSERT OR IGNORE INTO clients(id,nom,code_exploitant) VALUES('client-local','Client test','C-1');
    INSERT OR IGNORE INTO sites(id,client_id,nom_site) VALUES('site-local','client-local','Site A');
    INSERT OR IGNORE INTO api_client_links(remote_client_id,local_client_id,nom,autorise,payload_json) VALUES('12','client-local','Client test',1,'{}');
    INSERT OR IGNORE INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','site-local','Site A','{}');
    INSERT OR IGNORE INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','site-local');
    INSERT OR IGNORE INTO visites(id,site_id,date_visite,statut,trame_id,api_remote_local_id,api_remote_client_id,api_remote_trame_id,api_source_remote_visit_id)
      VALUES('${id}','site-local','2026-09-10','terminee','icpe_v1','501','12','3','812');
    INSERT OR IGNORE INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('${id}','test.sous','Contrôle A','S','OK');
    INSERT OR IGNORE INTO materiel(id,visite_id,categorie,nombre,designation,etat) VALUES('mat-${id}','${id}','Production','1','Chaudière','Bon');
  `);
  await db.runAsync(`INSERT OR REPLACE INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,reference_json,criteria_count,material_count,remote_present)
    VALUES('501','45','Chaufferie','3','ICPE',?,?,?,1)`, [JSON.stringify(reference), 1, Array.isArray(reference.materiels) ? reference.materiels.length : 0]);
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?, 'visite', ?, 'api_symfony', '501', ?)`,
    [`prov-${id}`, id, JSON.stringify({ ...reference, schemaVersion: 3, sourceType: 'preparation_visite', remoteLocalId: '501' })]);
}
function mapRemoteTrameToLocal(remote) {
  const v = String(remote?.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (v.includes('vmc') || v.includes('ventilation')) return 'vmc';
  if (v.includes('pre') && v.includes('allum')) return 'pre_allumage';
  if (v.includes('icpe') || v.includes('chauffer') || v.includes('sous-station')) return 'icpe_v1';
  return null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-upload-audit-'));
  const server = databaseProcess(path.join(dir, 'audit.db'));
  try {
    await server.send('migrate', '', [0, 33]);
    const payloadModule = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });

    // Full-state material semantics: a partial reduction is destructive too.
    await seedVisit(server.db, 'partial-material', preparationReference({ materials: [{ id: 'm1' }, { id: 'm2' }] }));
    const partial = await payloadModule.buildIntranetVisitPayload('partial-material', '11111111-1111-4111-8111-111111111111');
    check(partial.destructiveMaterialChange && !partial.destructiveMaterialClear && partial.removedSourceMaterialCount === 1,
      'partial material reduction is detected before the full-state server replacement');

    let mode = 'success'; let uuidIndex = 0;
    const uuids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
    const sender = async (_client, serialized) => {
      const body = JSON.parse(serialized);
      if (mode === '429-long') throw Object.assign(new Error('rate limit'), { status: 429, code: 'rate_limit_exceeded', retryAfter: '1800' });
      return { envoiId: body.envoiId, rejoue: false, visites: [{ index: 0, id: 990 + uuidIndex, localId: 501 }] };
    };
    const outbox = load('intranetVisitOutboxDb.js', {
      getDb: async () => server.db, buildIntranetVisitPayload: payloadModule.buildIntranetVisitPayload,
      IntranetVisitValidationError: payloadModule.IntranetVisitValidationError,
      createIntranetUploadId: async () => uuids[uuidIndex++], sendClientVisits: sender,
    });
    await assert.rejects(() => outbox.queueVisitUpload('partial-material'), (error) => error?.code === 'material_replacement_confirmation_required');
    checks++; console.log(`OK ${checks}: partial remote material deletion requires explicit confirmation`);
    const partialQueued = await outbox.queueVisitUpload('partial-material', { confirmMaterialReplacement: true });
    check(partialQueued.status === 'pending', 'explicit confirmation permits an intentional full material replacement');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='partial-material'`);

    // Retry-After must never be shortened by a client-side maximum.
    await seedVisit(server.db, 'long-rate-limit');
    mode = '429-long';
    await outbox.queueVisitUpload('long-rate-limit');
    const before429 = Date.now();
    await outbox.processVisitOutbox({ limit: 1 });
    const rateRow = await outbox.getVisitUploadState('long-rate-limit');
    const retryAt = Date.parse(rateRow.next_attempt_at);
    check(rateRow.status === 'retry' && retryAt - before429 >= 1_790_000,
      'Retry-After 1800 seconds is preserved instead of being capped at 15 minutes');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='long-rate-limit'`);

    // Corrupt/duplicated remote branches must be a local validation error, never a raw TypeError or an avoidable HTTP 422.
    await seedVisit(server.db, 'duplicate-branch');
    const duplicate = JSON.parse(JSON.stringify(remoteTrame));
    duplicate.categories[0].sousCategories[0].criteres.push({ ...duplicate.categories[0].sousCategories[0].criteres[0] });
    await server.db.runAsync(`UPDATE provenances SET details_json=? WHERE entite_id='duplicate-branch'`, [JSON.stringify({ ...preparationReference({ trame: duplicate }), schemaVersion: 3, sourceType: 'preparation_visite' })]);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('duplicate-branch', '33333333-3333-4333-8333-333333333333'),
      (error) => error?.code === 'local_validation_failed' && error.issues.some((issue) => /dupliquée/.test(issue)));
    checks++; console.log(`OK ${checks}: duplicate remote criterion branch is rejected locally`);

    await seedVisit(server.db, 'corrupt-trame');
    await server.db.runAsync(`UPDATE provenances SET details_json=? WHERE entite_id='corrupt-trame'`, [JSON.stringify({ ...preparationReference({ trame: { id: '3', nom: 'ICPE', categories: {} } }), schemaVersion: 3, sourceType: 'preparation_visite' })]);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('corrupt-trame', '44444444-4444-4444-8444-444444444444'),
      (error) => error?.code === 'local_validation_failed' && error.issues.some((issue) => /aucun critère/.test(issue)));
    checks++; console.log(`OK ${checks}: malformed cached trame becomes an actionable local validation error, not a runtime crash`);

    // Binding accepts a valid cached trame id fallback, but only after validating the full reference graph.
    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('bind-fallback','site-local','2026-09-10','terminee','icpe_v1');`);
    const fallbackReference = preparationReference({ trame: { ...remoteTrame, id: null } });
    await server.db.runAsync(`UPDATE api_local_links SET remote_trame_id='3',remote_trame_nom='ICPE',reference_json=? WHERE remote_local_id='501'`, [JSON.stringify(fallbackReference)]);
    let ids = 0;
    const binding = load('intranetVisitBindingDb.js', { getDb: async () => server.db, createId: () => `audit-binding-${++ids}`, mapRemoteTrameToLocal });
    const options = await binding.getVisitIntranetBindingOptions('bind-fallback', { remoteClientId: '12', remoteSiteId: '45' });
    check(options.locals[0]?.compatible === true && options.locals[0]?.remoteTrameId === '3', 'cached remote trame id safely repairs a missing nested trame.id');
    await binding.bindVisitToIntranetTarget('bind-fallback', { remoteClientId: '12', remoteSiteId: '45', remoteLocalId: '501' });
    const bound = await server.db.getFirstAsync(`SELECT api_remote_trame_id FROM visites WHERE id='bind-fallback'`);
    check(bound.api_remote_trame_id === '3', 'the repaired remote trame id is frozen on the visit instead of an empty id');

    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('bind-invalid','site-local','2026-09-10','terminee','icpe_v1');`);
    const badCriterion = preparationReference({ trame: { ...remoteTrame, categories: [{ ...remoteTrame.categories[0], sousCategories: [{ ...remoteTrame.categories[0].sousCategories[0], criteres: [{ id: 'bad', nom: 'Contrôle A', avisApplicable: true }] }] }] } });
    await server.db.runAsync(`UPDATE api_local_links SET reference_json=? WHERE remote_local_id='501'`, [JSON.stringify(badCriterion)]);
    const badOptions = await binding.getVisitIntranetBindingOptions('bind-invalid', { remoteClientId: '12', remoteSiteId: '45' });
    check(badOptions.locals[0]?.compatible === false && /critère sans identifiant valide/.test(badOptions.locals[0]?.compatibilityReason || ''),
      'invalid nested criterion id disables the destination before the user can bind it');

    console.log(`\n${checks} focused Intranet upload audit checks passed.`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
