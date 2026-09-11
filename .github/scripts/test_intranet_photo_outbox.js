/** Real-SQLite regression tests for durable Intranet photo synchronization. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function databaseProcess(filename) {
  const child = spawn('python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let seq = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line);
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  return {
    send,
    all: (sql, params) => send('all', sql, params),
    first: async (sql, params) => (await send('all', sql, params))[0] || null,
    exec: (sql) => send('exec', sql),
    close: () => child.stdin.end(),
  };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-photo-outbox-'));
  const database = databaseProcess(path.join(dir, 'photo-outbox.db'));
  let checks = 0;
  const check = (value, label) => { assert.ok(value, label); checks += 1; console.log(`OK ${checks}: ${label}`); };
  try {
    await database.send('migrate', '', [0, 35]);
    await database.exec(`
      INSERT INTO clients(id,nom) VALUES('c1','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s1','c1','Site');
      INSERT INTO visites(id,site_id,statut,api_content_revision,api_synced_revision)
        VALUES('vh','s1','terminee',4,4),('vm','s1','terminee',7,7);
      INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
        VALUES('prov-h','visite','vh','api_symfony','900','{"sourceType":"imported_latest_visit"}');
    `);

    await database.send('migrate', '', [35, 36]);
    const columns = await database.all(`PRAGMA table_info(api_visit_photo_outbox)`);
    check(columns.some((row) => row.name === 'source_entity_key'), 'v36 stores the frozen local attachment key');

    const beforeHistorical = await database.first(`SELECT api_content_revision,api_synced_revision FROM visites WHERE id='vh'`);
    await database.exec(`INSERT INTO photos(id,visite_id,entite_key,uri,label) VALUES('ph','vh','conf.chauffage||Etat','file:///historical.jpg','Avant');`);
    const afterHistorical = await database.first(`SELECT api_content_revision,api_synced_revision FROM visites WHERE id='vh'`);
    check(Number(afterHistorical.api_content_revision) === Number(beforeHistorical.api_content_revision) + 1, 'adding a photo to an imported historical visit makes it dirty');
    check(Number(afterHistorical.api_content_revision) !== Number(afterHistorical.api_synced_revision), 'historical photo edit produces Offline revision state');

    await database.exec(`
      INSERT INTO api_visit_outbox(envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status,remote_visit_id,content_revision)
        VALUES('11111111-1111-4111-8111-111111111111','vm','12','{}',2,'synced','987',7);
      INSERT INTO photos(id,visite_id,entite_key,uri,label)
        VALUES('pm','vm','conf.chauffage||Etat','file:///photo.jpg','Etat initial');
      INSERT INTO api_visit_photo_outbox(
        id,photo_id,visite_id,remote_client_id,remote_visit_id,envoi_photo_id,source_uri,source_entity_key,
        content_type,description,photo_order,is_large_format,status,remote_photo_id
      ) VALUES(
        'po1','pm','vm','12','987','22222222-2222-4222-8222-222222222222','file:///photo.jpg','conf.chauffage||Etat',
        'image/jpeg','Etat initial',1,0,'synced','1205'
      );
    `);
    const beforeReplace = await database.first(`SELECT api_content_revision FROM visites WHERE id='vm'`);
    await database.exec(`UPDATE photos SET label='Etat modifié' WHERE id='pm';`);
    const afterReplace = await database.first(`SELECT api_content_revision FROM visites WHERE id='vm'`);
    check(Number(afterReplace.api_content_revision) === Number(beforeReplace.api_content_revision) + 1, 'editing metadata of an already-synced photo requires a new visit revision');

    await database.exec(`UPDATE visites SET api_synced_revision=api_content_revision WHERE id='vm';`);
    const beforeDelete = await database.first(`SELECT api_content_revision FROM visites WHERE id='vm'`);
    await database.exec(`DELETE FROM photos WHERE id='pm';`);
    const afterDelete = await database.first(`SELECT api_content_revision FROM visites WHERE id='vm'`);
    check(Number(afterDelete.api_content_revision) === Number(beforeDelete.api_content_revision) + 1, 'deleting an already-synced photo requires a new visit revision');

    let invalidTripleRejected = false;
    try {
      await database.exec(`INSERT INTO api_visit_photo_outbox(
        id,photo_id,visite_id,remote_client_id,remote_visit_id,envoi_photo_id,source_uri,content_type,description,photo_order,is_large_format,categorie_id,status
      ) VALUES('bad','x','vm','12','987','33333333-3333-4333-8333-333333333333','file:///x.jpg','image/jpeg','',2,0,'10','pending');`);
    } catch { invalidTripleRejected = true; }
    check(invalidTripleRejected, 'criterion ids remain all-or-none at SQLite level');
    check((await database.all('PRAGMA foreign_key_check')).length === 0, 'v36 photo synchronization keeps SQLite foreign keys valid');

    console.log(`\n${checks} Intranet photo outbox checks passed (real SQLite).`);
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });