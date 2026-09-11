/** Real-SQLite regression test for Intranet LOCAL -> METRA installation names. */
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-local-name-'));
  const database = databaseProcess(path.join(dir, 'name-sync.db'));
  let checks = 0;
  const check = (value, label) => { assert.ok(value, label); checks += 1; console.log(`OK ${checks}: ${label}`); };
  try {
    await database.send('migrate', '', [0, 33]);
    await database.exec(`
      INSERT INTO clients(id,nom) VALUES('c1','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s1','c1','Site');
      INSERT INTO installations(id,site_id,type_code,nom,actif) VALUES('i1','s1','installation_technique','Ancien nom',1);
      INSERT INTO installations(id,site_id,type_code,nom,actif) VALUES('i2','s1','installation_technique','Nom provisoire',1);
      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('12','c1','Client','{}');
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','s1','Site','{}');
      INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,local_installation_id,reference_json)
        VALUES('501','45','Chaufferie Intranet','i1','{}');
    `);

    await database.send('migrate', '', [33, 34]);
    check((await database.first(`SELECT nom FROM installations WHERE id='i1'`))?.nom === 'Chaufferie Intranet', 'v34 aligns an already-linked installation with the Intranet LOCAL name');

    await database.exec(`UPDATE api_local_links SET designation='Sous-station A' WHERE remote_local_id='501';`);
    check((await database.first(`SELECT nom FROM installations WHERE id='i1'`))?.nom === 'Sous-station A', 'a refreshed Intranet LOCAL designation updates the linked installation name');

    await database.exec(`UPDATE api_local_links SET designation='' WHERE remote_local_id='501';`);
    check((await database.first(`SELECT nom FROM installations WHERE id='i1'`))?.nom === 'Sous-station A', 'an empty remote designation never erases the METRA installation name');

    await database.exec(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,local_installation_id,reference_json)
      VALUES('502','45','Local VMC Intranet','i2','{}');`);
    check((await database.first(`SELECT nom FROM installations WHERE id='i2'`))?.nom === 'Local VMC Intranet', 'a newly linked remote LOCAL immediately gives its name to the METRA installation');
    check((await database.all('PRAGMA foreign_key_check')).length === 0, 'v34 LOCAL name synchronization keeps SQLite foreign keys valid');

    console.log(`\n${checks} Intranet LOCAL name synchronization checks passed (real SQLite).`);
  } finally {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
