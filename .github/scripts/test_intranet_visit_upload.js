/** Executable contract tests for METRA -> Intranet visit uploads.
 * Production serializer/outbox code is executed against real SQLite. Network
 * and Android UUID generation are mocked so CI does not need the real server.
 */
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
const localTrame = { id: 'icpe_v1', ui: { labels: { 'p-test': 'Contrôles', 'p-releves': 'Relevés' }, panels: {
  'p-test': { Sous: [{ cle: 'Contrôle A', type: 'controle' }, { cle: 'Champ B', type: 'champ' }] },
  'p-releves': { 'Relevés': [{ cle: 'Index Gaz (m³)', type: 'champ' }] },
} } };
const remoteTrame = { id: '3', nom: 'ICPE', categories: [
  { id: '10', nom: 'Contrôles', sousCategories: [{ id: '20', nom: 'Sous', criteres: [
    { id: '100', nom: 'Contrôle A', avisApplicable: true }, { id: '101', nom: 'Champ B', avisApplicable: false },
  ] }] },
  { id: '11', nom: 'Régulation', sousCategories: [
    { id: '21', nom: 'Réseau n°1', criteres: [
      { id: '102', nom: 'T ext °C', avisApplicable: false }, { id: '103', nom: 'T dep °C', avisApplicable: false },
    ] },
    { id: '23', nom: 'Réseau n°2', criteres: [
      { id: '105', nom: 'T ext °C', avisApplicable: false }, { id: '106', nom: 'T dep °C', avisApplicable: false },
    ] },
    { id: '24', nom: 'Réseau n°3', criteres: [
      { id: '107', nom: 'T ext °C', avisApplicable: false }, { id: '108', nom: 'T dep °C', avisApplicable: false },
    ] },
  ] },
  { id: '12', nom: 'Relevés', sousCategories: [{ id: '22', nom: 'Relevés', criteres: [
    { id: '104', nom: 'Index Gaz (m³)', avisApplicable: false },
  ] }] },
] };
const context = { schemaVersion: 3, sourceType: 'preparation_visite', remoteLocalId: '501', site: { id: '45', nom: 'Site A' },
  derniereVisite: { id: '812', date: '2026-09-01' }, trame: remoteTrame, materiels: [{ id: 1 }] };

async function seed(db, id = 'visit-1') {
  await db.execAsync(`
    INSERT OR IGNORE INTO clients(id,nom) VALUES('client-local','Client test');
    INSERT OR IGNORE INTO sites(id,client_id,nom_site) VALUES('site-local','client-local','Site A');
    INSERT INTO visites(id,site_id,date_visite,statut,trame_id,api_remote_local_id,api_remote_client_id,api_remote_trame_id,api_source_remote_visit_id)
      VALUES('${id}','site-local','2026-09-10','terminee','icpe_v1','501','12','3','812');
    INSERT OR IGNORE INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('12','client-local','Client test','{}');
    INSERT OR IGNORE INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','site-local','Site A','{}');
    INSERT OR IGNORE INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','site-local');
    INSERT OR IGNORE INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json) VALUES('501','45','Chaufferie','{}');
    INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('${id}','test.sous','Contrôle A','N.S','');
    INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES('${id}','test.sous','Champ B','Valeur actuelle');
    INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES('${id}','releves.relevs','Index Gaz (m³)','ANCIEN INDEX');
    INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c) VALUES('network-${id}','${id}',0,'Chauffage bâtiment A','5','55');
    INSERT INTO compteurs(id,visite_id,label,unite,valeur) VALUES('meter-${id}','${id}','Index Gaz','m³','456');
    INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat)
      VALUES('material-${id}','${id}','PRODUCTION CHAUD','2','Chaudière gaz','CHA-001','Bâtiment A','Exemple','G500','500 kW','2019','Bon');
    INSERT INTO remarques(id,visite_id,poste,prestation,estimatif,origine,intranet_date_reserve,intranet_delai,intranet_etat_avancement)
      VALUES('remark-${id}','${id}','Chaufferie','Remplacer le vase','1500','Manuelle','2026-09-10','2026-10-15','En cours');
    INSERT OR REPLACE INTO notes(visite_id,contenu) VALUES('${id}','Prévoir accès');
  `);
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?, 'visite', ?, 'api_symfony', '501', ?)`,
    [`prov-${id}`, id, JSON.stringify(context)]);
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?, 'reseau', ?, 'api_symfony', ?, ?)`,
    [`prov-network-${id}`, `network-${id}`, `812:network:11:21`, JSON.stringify({ sourceType: 'latest_known_preparation_network', remoteCategoryId: '11', remoteSubCategoryId: '21' })]);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-upload-test-'));
  const upgrade = databaseProcess(path.join(dir, 'upgrade.db'));
  try {
    await upgrade.send('migrate', '', [0, 32]);
    await upgrade.db.execAsync(`INSERT INTO clients(id,nom) VALUES('old-client','Ancien'); INSERT INTO sites(id,client_id,nom_site) VALUES('old-site','old-client','Ancien site'); INSERT INTO visites(id,site_id,statut,trame_id) VALUES('old-visit','old-site','terminee','icpe_v1'); INSERT INTO remarques(id,visite_id,poste,prestation,delai,origine) VALUES('old-remark','old-visit','Poste','Réserve existante',3,'Manuelle');`);
    await upgrade.send('migrate', '', [32, 33]);
    const old = await upgrade.db.getFirstAsync(`SELECT v.id,r.prestation,r.delai,r.intranet_delai FROM visites v JOIN remarques r ON r.visite_id=v.id WHERE v.id='old-visit'`);
    check(old?.prestation === 'Réserve existante' && Number(old.delai) === 3 && old.intranet_delai == null, 'migration 32 -> 33 preserves existing visits/reserves and does not reinterpret delay months');
  } finally { upgrade.close(); }

  const server = databaseProcess(path.join(dir, 'upload.db'));
  try {
    await server.send('migrate', '', [0, 33]);
    check((await server.db.getAllAsync("SELECT name FROM sqlite_master WHERE name='api_visit_outbox'")).length === 1, 'fresh database migrates through version 033');
    await seed(server.db);
    const payloadModule = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
    const prepared = await payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111');
    check(Object.keys(prepared.payload).join(',') === 'envoiId,visites', 'root contains only the exact contract keys');
    const wire = prepared.payload.visites[0];
    check(Object.keys(wire).join(',') === 'localId,trameId,derniereVisiteIdSource,date,statut,criteres,remarques,materiels,notes', 'visit contains only the exact contract keys');
    check(wire.localId === 501 && wire.trameId === 3 && wire.derniereVisiteIdSource === 812, 'frozen Symfony identifiers are sent as API IDs');
    check(wire.statut === 'Terminé' && wire.date === '2026-09-10', 'local final status/date use wire values');
    check(wire.criteres.length === 9 && wire.criteres.map((c) => c.critereId).join(',') === '100,101,102,103,105,106,107,108,104', 'every remote criterion is emitted once in reference order');
    check(wire.criteres[0].avis === 'N.S' && wire.criteres[0].commentaire === '/', 'applicable control uses current opinion and slash for empty comment');
    check(wire.criteres[1].avis === null && wire.criteres[1].commentaire === 'Valeur actuelle', 'non-applicable criterion uses current field value');
    check(wire.criteres[2].commentaire === '5' && wire.criteres[3].commentaire === '55', 'network criteria use current reseaux values');
    check(wire.criteres[4].commentaire === '/' && wire.criteres[5].commentaire === '/' && wire.criteres[6].commentaire === '/' && wire.criteres[7].commentaire === '/', 'unused remote network branches are emitted as slash without guessing a local network');
    check(wire.criteres[8].commentaire === '456', 'counter criterion uses current compteur value, not stale champs_visite value');
    check(wire.remarques[0].dateReserve === '2026-09-10' && wire.remarques[0].delai === '2026-10-15' && wire.remarques[0].etatAvancement === 'En cours', 'remark wire dates/progress use dedicated Intranet fields');
    check(wire.materiels[0].numeroMateriel === 'CHA-001' && wire.materiels[0].etat === 'Bon', 'complete material wire fields are preserved');
    check(wire.notes[0].contenu === 'Prévoir accès', 'visit note is serialized');
    check(prepared.summary.photosExcluded && prepared.summary.conclusionExcluded, 'unsupported photos/conclusion remain explicitly outside JSON route');
    check(prepared.payloadBytes === Buffer.byteLength(prepared.serialized, 'utf8'), '5 MiB guard counts UTF-8 bytes correctly');

    await server.db.runAsync(`UPDATE materiel SET etat='Dégradé' WHERE visite_id='visit-1'`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111'), /empêchent|état/);
    checks++; console.log(`OK ${checks}: material state outside Symfony enum blocks upload instead of being silently converted`);
    await server.db.runAsync(`UPDATE materiel SET etat='Bon' WHERE visite_id='visit-1'`);
    await server.db.runAsync(`UPDATE materiel SET nombre=NULL WHERE visite_id='visit-1'`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111'), /nombre.*obligatoire/i);
    checks++; console.log(`OK ${checks}: non-nullable material fields are validated before upload`);
    await server.db.runAsync(`UPDATE materiel SET nombre='2' WHERE visite_id='visit-1'`);
    await server.db.runAsync(`UPDATE remarques SET intranet_date_reserve='2026-09-10foo' WHERE visite_id='visit-1'`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111'), /date réserve/i);
    checks++; console.log(`OK ${checks}: malformed explicit reserve date is not silently truncated`);
    await server.db.runAsync(`UPDATE remarques SET intranet_date_reserve='2026-09-10' WHERE visite_id='visit-1'`);
    await server.db.runAsync(`DELETE FROM materiel WHERE visite_id='visit-1'`);
    const emptyMaterial = await payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111');
    check(emptyMaterial.destructiveMaterialClear && emptyMaterial.sourceMaterialCount === 1, 'empty local listing is flagged as destructive when remote reference had material');
    await server.db.runAsync(`INSERT INTO materiel(id,visite_id,categorie,nombre,designation,etat) VALUES('material-restored','visit-1','Chaudière','1','Chaudière','Bon')`);

    await seed(server.db, 'historical');
    await server.db.runAsync(`UPDATE provenances SET details_json=? WHERE entite_id='historical'`, [JSON.stringify({ ...context, sourceType: 'imported_latest_visit' })]);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('historical', '22222222-2222-4222-8222-222222222222'), /historique importée/);
    checks++; console.log(`OK ${checks}: imported historical visit cannot be resent as a new visit`);

    await seed(server.db, 'missing-control');
    await server.db.runAsync(`DELETE FROM controles_visite WHERE visite_id='missing-control'`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('missing-control', '33333333-3333-4333-8333-333333333333'), /avis obligatoire/);
    checks++; console.log(`OK ${checks}: missing required opinion blocks server upload before HTTP`);

    await seed(server.db, 'pre-multi');
    await server.db.runAsync(`UPDATE visites SET trame_id='pre_allumage' WHERE id='pre-multi'`);
    await server.db.execAsync(`INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre) VALUES('pre-l1','pre-multi','Chaufferie','chaufferie',0); INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre) VALUES('pre-l2','pre-multi','SST 1','sous_station',1);`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('pre-multi', '33333333-3333-4333-8333-333333333333'), (error) => Array.isArray(error?.issues) && error.issues.some((issue) => /plusieurs locaux/.test(issue)));
    checks++; console.log(`OK ${checks}: multi-local PRE visit is blocked because the server contract accepts one local per visit`);

    const calls = []; let mode = 'network';
    const uuids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '12345678-1234-4234-8234-123456789abc', '87654321-4321-4321-8321-cba987654321'];
    let uuidIndex = 0;
    const sender = async (_client, serialized) => {
      calls.push(serialized);
      if (mode === 'network') throw new Error('offline');
      const body = JSON.parse(serialized);
      if (mode === 'success') return { envoiId: body.envoiId, rejoue: false, visites: [{ index: 0, id: 987, localId: 501 }] };
      if (mode === 'replay') return { envoiId: body.envoiId, rejoue: true, visites: [{ index: 0, id: 987, localId: 501 }] };
      if (mode === '429') throw Object.assign(new Error('rate limit'), { status: 429, code: 'rate_limit_exceeded', retryAfter: '120' });
      if (mode === '409') throw Object.assign(new Error('newer visit'), { status: 409, code: 'synchronization_conflict' });
      if (mode === '422') throw Object.assign(new Error('validation'), { status: 422, code: 'validation_failed', violations: [{ path: 'visites[0].criteres[0].avis', message: 'invalid' }] });
      if (mode === 'bad-ack') return { envoiId: body.envoiId, rejoue: false, visites: [{ index: 1, id: 999, localId: 501 }] };
      throw new Error('unexpected mode');
    };
    const outbox = load('intranetVisitOutboxDb.js', {
      getDb: async () => server.db, buildIntranetVisitPayload: payloadModule.buildIntranetVisitPayload,
      IntranetVisitValidationError: payloadModule.IntranetVisitValidationError,
      createIntranetUploadId: async () => uuids[uuidIndex++], sendClientVisits: sender,
    });
    const queued = await outbox.queueVisitUpload('visit-1');
    check(queued.envoi_id === uuids[0] && queued.status === 'pending', 'queue persists one UUID v4 before any HTTP attempt');
    await outbox.processVisitOutbox({ limit: 1 });
    let row = await outbox.getVisitUploadState('visit-1');
    check(row.status === 'retry' && calls.length === 1, 'network failure keeps immutable payload pending for retry');
    const firstPayload = calls[0];
    mode = 'success';
    await outbox.retryVisitUploadNow('visit-1');
    row = await outbox.getVisitUploadState('visit-1');
    check(row.status === 'synced' && row.remote_visit_id === '987', '201-style acknowledgement marks local outbox synchronized');
    check(calls[1] === firstPayload && JSON.parse(calls[1]).envoiId === uuids[0], 'retry sends byte-identical JSON and the same envoiId');

    await seed(server.db, 'clear-list');
    await server.db.runAsync(`DELETE FROM materiel WHERE visite_id='clear-list'`);
    await assert.rejects(() => outbox.queueVisitUpload('clear-list'), (error) => error?.code === 'material_clear_confirmation_required');
    check(!(await outbox.getVisitUploadState('clear-list')), 'destructive empty material listing is not queued before explicit confirmation');
    const cleared = await outbox.queueVisitUpload('clear-list', { confirmMaterialClear: true });
    check(cleared.status === 'pending', 'explicit confirmation allows intentional remote material-list clearing');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='clear-list'`);

    await seed(server.db, 'rate-limit'); mode = '429';
    await outbox.queueVisitUpload('rate-limit'); await outbox.processVisitOutbox({ limit: 3 });
    row = await outbox.getVisitUploadState('rate-limit');
    check(row.status === 'retry' && row.error_code === 'rate_limit_exceeded' && row.next_attempt_at, '429 honors a deferred retry instead of failing the visit');

    await seed(server.db, 'conflict'); mode = '409';
    await outbox.queueVisitUpload('conflict'); await server.db.runAsync(`UPDATE api_visit_outbox SET next_attempt_at=NULL WHERE visite_id='rate-limit'`);
    await server.db.runAsync(`UPDATE api_visit_outbox SET next_attempt_at=datetime('now','+1 day') WHERE visite_id='rate-limit'`);
    await outbox.processVisitOutbox({ limit: 3 });
    row = await outbox.getVisitUploadState('conflict');
    check(row.status === 'conflict' && row.error_code === 'synchronization_conflict' && row.next_attempt_at == null, '409 synchronization conflict is terminal and never auto-retried');

    await seed(server.db, 'validation'); mode = '422';
    await outbox.queueVisitUpload('validation'); await outbox.processVisitOutbox({ limit: 3 });
    row = await outbox.getVisitUploadState('validation');
    check(row.status === 'validation_error' && JSON.parse(row.violations_json)[0].path.includes('criteres'), '422 violations are persisted for field correction');

    await seed(server.db, 'interrupted'); mode = 'network';
    await outbox.queueVisitUpload('interrupted'); await server.db.runAsync(`UPDATE api_visit_outbox SET status='sending' WHERE visite_id='interrupted'`);
    await outbox.recoverInterruptedVisitUploads(); row = await outbox.getVisitUploadState('interrupted');
    check(row.status === 'retry' && row.error_code === 'interrupted', 'process death during an uncertain send resumes idempotently on next startup');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='interrupted'`);

    await seed(server.db, 'bad-ack'); mode = 'bad-ack';
    await outbox.queueVisitUpload('bad-ack');
    await outbox.processVisitOutbox({ limit: 1 }); row = await outbox.getVisitUploadState('bad-ack');
    check(row.status === 'rejected' && row.error_code === 'invalid_ack' && row.next_attempt_at == null, 'incoherent 2xx acknowledgement is terminal because the server may already have created the visit');
    await outbox.processVisitOutbox({ limit: 3 }); row = await outbox.getVisitUploadState('bad-ack');
    check(Number(row.attempt_count) === 1, 'invalid acknowledgement is never automatically replayed or replaced with a new envoiId');

    await server.db.runAsync(`UPDATE visites SET statut='en_cours' WHERE id='missing-control'`);
    await assert.rejects(() => outbox.queueVisitUpload('missing-control'), /Finalise la visite/);
    checks++; console.log(`OK ${checks}: UI queue policy does not create progressive duplicate server visits`);
    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'outbox migration and queued rows preserve SQLite foreign keys');
    console.log(`\n${checks} Intranet upload checks passed (real SQLite, production serializer/outbox, mocked HTTP/UUID).`);
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
