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
    const response = JSON.parse(line), waiter = pending.get(response.id); if (!waiter) return;
    pending.delete(response.id); if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
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
  'p-test': { Sous: [{ cle: 'Contrôle A', type: 'controle' }, { cle: 'Champ B', type: 'champ' }] },
} } };
const remoteTrame = { id: '3', nom: 'ICPE', categories: [{ id: '10', nom: 'Contrôles', sousCategories: [{ id: '20', nom: 'Sous', criteres: [
  { id: '100', nom: 'Contrôle A', avisApplicable: true },
  { id: '101', nom: 'Champ B', avisApplicable: false },
] }] }] };
const context = {
  schemaVersion: 3, sourceType: 'preparation_visite', remoteLocalId: '501',
  site: { id: '45', nom: 'Site A' }, derniereVisite: { id: '812', date: '2026-09-01', statut: 'Terminé' },
  trame: remoteTrame, materiels: [{ id: 'm1' }], remarques: [], notes: [],
};

async function seed(db, id = 'visit-1', sourceType = 'preparation_visite') {
  await db.execAsync(`
    INSERT OR IGNORE INTO clients(id,nom) VALUES('client-local','Client test');
    INSERT OR IGNORE INTO sites(id,client_id,nom_site) VALUES('site-local','client-local','Site A');
    INSERT OR IGNORE INTO api_client_links(remote_client_id,local_client_id,nom,autorise,payload_json) VALUES('12','client-local','Client test',1,'{}');
    INSERT OR IGNORE INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,remote_present,payload_json) VALUES('45','12','site-local','Site A',1,'{}');
    INSERT OR IGNORE INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id,remote_present) VALUES('12','45','site-local',1);
    INSERT OR IGNORE INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,remote_present,criteria_count,material_count,reference_json)
      VALUES('501','45','Chaufferie','3','ICPE',1,2,1,'{}');
    INSERT INTO visites(id,site_id,date_visite,statut,trame_id,api_remote_local_id,api_remote_client_id,api_remote_trame_id,api_source_remote_visit_id)
      VALUES('${id}','site-local','2026-09-10','terminee','icpe_v1','501','12','3','812');
    INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('${id}','test.sous','Contrôle A','N.S','');
    INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES('${id}','test.sous','Champ B','Valeur actuelle');
    INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,marque,etat)
      VALUES('material-${id}','${id}','PRODUCTION CHAUD','1','Chaudière gaz','CHA-001','Exemple','Bon');
    INSERT INTO remarques(id,visite_id,poste,prestation,estimatif,origine,intranet_date_reserve,intranet_delai,intranet_etat_avancement)
      VALUES('remark-${id}','${id}','Chaufferie','Remplacer le vase','1500','Manuelle','2026-09-10','2026-10-15','En cours');
    INSERT OR REPLACE INTO notes(visite_id,contenu) VALUES('${id}','Prévoir accès');
  `);
  const details = { ...context, sourceType };
  await db.runAsync(`UPDATE api_local_links SET reference_json=? WHERE remote_local_id='501'`, [JSON.stringify(context)]);
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?, 'visite', ?, 'api_symfony', '501', ?)`,
    [`prov-${id}`, id, JSON.stringify(details)]);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-upload-test-'));
  const upgrade = databaseProcess(path.join(dir, 'upgrade.db'));
  try {
    await upgrade.send('migrate', '', [0, 32]);
    await upgrade.db.execAsync(`INSERT INTO clients(id,nom) VALUES('old-client','Ancien'); INSERT INTO sites(id,client_id,nom_site) VALUES('old-site','old-client','Ancien site'); INSERT INTO visites(id,site_id,statut,trame_id) VALUES('old-visit','old-site','terminee','icpe_v1'); INSERT INTO remarques(id,visite_id,poste,prestation,delai,origine) VALUES('old-remark','old-visit','Poste','Réserve existante',3,'Manuelle');`);
    await upgrade.send('migrate', '', [32, 36]);
    const old = await upgrade.db.getFirstAsync(`SELECT v.id,r.prestation,r.delai,r.intranet_delai FROM visites v JOIN remarques r ON r.visite_id=v.id WHERE v.id='old-visit'`);
    check(old?.prestation === 'Réserve existante' && Number(old.delai) === 3 && old.intranet_delai == null, 'upgrade 32 -> 36 preserves existing reserves and historical delay meaning');
    check((await upgrade.db.getAllAsync("SELECT name FROM sqlite_master WHERE name='api_visit_photo_outbox'")).length === 1, 'upgrade reaches durable photo outbox schema');
  } finally { upgrade.close(); }

  const server = databaseProcess(path.join(dir, 'upload.db'));
  try {
    await server.send('migrate', '', [0, 36]);
    check((await server.db.getAllAsync("SELECT name FROM sqlite_master WHERE name='api_visit_outbox'")).length === 1, 'fresh database migrates through current visit outbox schema');
    await seed(server.db);
    const payloadModule = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
    const prepared = await payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111');
    check(Object.keys(prepared.payload).join(',') === 'envoiId,visites', 'root contains only the exact visit contract keys');
    const wire = prepared.payload.visites[0];
    check(Object.keys(wire).join(',') === 'localId,trameId,derniereVisiteIdSource,date,statut,criteres,remarques,materiels,notes', 'visit contains only the exact wire keys');
    check(wire.localId === 501 && wire.trameId === 3 && wire.derniereVisiteIdSource === 812, 'frozen Symfony ids are used');
    check(wire.criteres.length === 2 && wire.criteres[0].avis === 'N.S' && wire.criteres[0].commentaire === '/', 'applicable control uses current avis and slash placeholder');
    check(wire.criteres[1].avis === null && wire.criteres[1].commentaire === 'Valeur actuelle', 'information criterion uses current METRA value');
    check(wire.remarques[0].dateReserve === '2026-09-10' && wire.remarques[0].delai === '2026-10-15', 'remark dates use dedicated Intranet fields');
    check(wire.materiels[0].numeroMateriel === 'CHA-001' && wire.materiels[0].etat === 'Bon', 'material contract is preserved');
    check(wire.notes[0].contenu === 'Prévoir accès', 'note is serialized');
    check(prepared.summary.photosExcluded && prepared.summary.conclusionExcluded, 'photos/conclusion stay outside visit JSON route');
    check(prepared.payloadBytes === Buffer.byteLength(prepared.serialized, 'utf8'), 'payload byte guard uses UTF-8 size');

    await seed(server.db, 'missing-control');
    await server.db.runAsync(`DELETE FROM controles_visite WHERE visite_id='missing-control'`);
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('missing-control', '22222222-2222-4222-8222-222222222222'), /avis obligatoire/);
    checks++; console.log(`OK ${checks}: missing required avis blocks HTTP preparation`);

    await seed(server.db, 'historical', 'imported_latest_visit');
    const historicalAligned = await server.db.getFirstAsync(`SELECT api_content_revision,api_synced_revision FROM visites WHERE id='historical'`);
    check(Number(historicalAligned.api_content_revision) === Number(historicalAligned.api_synced_revision), 'import provenance aligns historical revision with server state');
    await assert.rejects(() => payloadModule.buildIntranetVisitPayload('historical', '33333333-3333-4333-8333-333333333333'), /déjà Online|aucune modification/i);
    checks++; console.log(`OK ${checks}: unchanged imported historical visit cannot be duplicated`);
    await server.db.runAsync(`UPDATE controles_visite SET avis='S' WHERE visite_id='historical'`);
    const historicalDirty = await server.db.getFirstAsync(`SELECT api_content_revision,api_synced_revision FROM visites WHERE id='historical'`);
    check(Number(historicalDirty.api_content_revision) > Number(historicalDirty.api_synced_revision), 'business edit immediately makes imported visit dirty/Offline');
    const historicalPayload = await payloadModule.buildIntranetVisitPayload('historical', '44444444-4444-4444-8444-444444444444');
    check(historicalPayload.payload.visites[0].derniereVisiteIdSource === 812, 'dirty historical visit can create a successor linked to its source visit');

    const calls = []; let mode = 'network'; let uuidIndex = 0;
    const uuids = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    ];
    const sender = async (_client, serialized) => {
      calls.push(serialized);
      if (mode === 'network') throw new Error('offline');
      const body = JSON.parse(serialized);
      if (mode === 'success') return { envoiId: body.envoiId, rejoue: false, visites: [{ index: 0, id: 987, localId: 501 }] };
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
    check(queued.envoi_id === uuids[0] && queued.status === 'pending', 'queue persists UUID before HTTP');
    await outbox.processVisitOutbox({ limit: 1 });
    let row = await outbox.getVisitUploadState('visit-1');
    check(row.status === 'retry' && calls.length === 1, 'network failure keeps immutable payload for retry');
    const firstPayload = calls[0];
    mode = 'success';
    await outbox.retryVisitUploadNow('visit-1');
    row = await outbox.getVisitUploadState('visit-1');
    check(row.status === 'synced' && row.remote_visit_id === '987', 'valid ack marks visit synchronized');
    check(calls[1] === firstPayload && JSON.parse(calls[1]).envoiId === uuids[0], 'retry sends byte-identical JSON and UUID');
    const aligned = await server.db.getFirstAsync(`SELECT api_content_revision,api_synced_revision,api_source_remote_visit_id FROM visites WHERE id='visit-1'`);
    check(Number(aligned.api_content_revision) === Number(aligned.api_synced_revision) && aligned.api_source_remote_visit_id === '987', 'ack aligns exactly the sent content revision and advances source id');

    await server.db.runAsync(`UPDATE notes SET contenu='Modification après Online' WHERE visite_id='visit-1'`);
    const dirty = await server.db.getFirstAsync(`SELECT api_content_revision,api_synced_revision FROM visites WHERE id='visit-1'`);
    check(Number(dirty.api_content_revision) > Number(dirty.api_synced_revision), 'edit after Online immediately creates a newer local revision');
    const secondQueued = await outbox.queueVisitUpload('visit-1');
    check(secondQueued.envoi_id === uuids[1] && secondQueued.status === 'pending', 'dirty Online visit receives a new idempotent upload');
    const secondWire = JSON.parse(secondQueued.payload_json).visites[0];
    check(secondWire.derniereVisiteIdSource === 987, 'successor upload references last acknowledged server visit');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='visit-1'`);

    await seed(server.db, 'rate-limit'); mode = '429';
    await outbox.queueVisitUpload('rate-limit'); await outbox.processVisitOutbox({ limit: 1 });
    row = await outbox.getVisitUploadState('rate-limit');
    check(row.status === 'retry' && row.error_code === 'rate_limit_exceeded' && row.next_attempt_at, '429 keeps durable deferred retry');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='rate-limit'`);

    await seed(server.db, 'conflict'); mode = '409';
    await outbox.queueVisitUpload('conflict'); await outbox.processVisitOutbox({ limit: 1 });
    row = await outbox.getVisitUploadState('conflict');
    check(row.status === 'conflict' && row.next_attempt_at == null, '409 synchronization conflict is terminal');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='conflict'`);

    await seed(server.db, 'validation'); mode = '422';
    await outbox.queueVisitUpload('validation'); await outbox.processVisitOutbox({ limit: 1 });
    row = await outbox.getVisitUploadState('validation');
    check(row.status === 'validation_error' && JSON.parse(row.violations_json)[0].path.includes('criteres'), '422 violations remain persisted');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='validation'`);

    await seed(server.db, 'bad-ack'); mode = 'bad-ack';
    await outbox.queueVisitUpload('bad-ack'); await outbox.processVisitOutbox({ limit: 1 });
    row = await outbox.getVisitUploadState('bad-ack');
    check(row.status === 'rejected' && row.error_code === 'invalid_ack' && Number(row.attempt_count) === 1, 'incoherent 2xx acknowledgement is terminal and not auto-replayed');

    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'latest upload schema and outboxes preserve foreign keys');
    console.log(`\n${checks} Intranet visit upload checks passed (real SQLite, latest schema, production serializer/outbox, mocked HTTP/UUID).`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
