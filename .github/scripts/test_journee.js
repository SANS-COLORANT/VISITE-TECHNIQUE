/** Tournée : cibles site/local, état « fait » déduit des visites (migration 047). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');

function databaseProcess(filename) {
  const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename]);
  const pending = new Map(); let seq = 0;
  child.stderr.pipe(process.stderr);
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const r = JSON.parse(line); const w = pending.get(r.id); pending.delete(r.id);
    if (r.error) w.reject(new Error(r.error)); else w.resolve(r.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = { getAllAsync: (s, p) => send('all', s, p), getFirstAsync: async (s, p) => (await send('all', s, p))[0] || null,
    runAsync: (s, p) => send('run', s, p), execAsync: (s) => send('exec', s) };
  return { db, send, close: () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end(); }) };
}


async function sqlPart() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-journee-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s1','c','Site 1');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i1','s1','chaufferie','Chaufferie 1'),('i2','s1','chaufferie','Chaufferie 2');
      INSERT INTO tournee_cibles(id,client_id,site_id,installation_id,cle) VALUES('t1','c','s1','i1','s1:i1'),('t2','c','s1','i2','s1:i2');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id,cree_le) VALUES('v1','s1','2026-10-09','terminee','icpe_v1','i1','2999-01-01 00:00:00');
      INSERT INTO reserves_suivi(id,site_id,statut) VALUES('r1','s1','ouverte'),('r2','s1','levee');`);
    const model = fs.readFileSync(path.join(root, 'journeeModel.js'), 'utf8').replace(/export /g, '');
    const src = fs.readFileSync(path.join(root, 'journeeDb.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    const J = new Function('getDb', `${model}; ${src}; return { chargerJournee };`)(async () => server.db);
    const j = await J.chargerJournee();
    assert.strictEqual(j.itineraire.total, 2);
    assert.strictEqual(j.itineraire.faits, 1);
    assert.strictEqual(j.itineraire.prochain.nomLocal, 'Chaufferie 2');
    assert.strictEqual(j.reserves, 1);
    assert.strictEqual(typeof j.aEnvoyer, 'number');
    console.log('journee SQL OK');
  } finally { await server.close(); }
}

(async () => {
  const m = await import('../../journeeModel.js');
  const cibles = [
    { client_id: 'a', nom_client: 'Les Lilas', site_id: 's1', nom_site: 'Bât A', installation_id: 'l1', nom_local: 'Chaufferie', fait: 1 },
    { client_id: 'a', nom_client: 'Les Lilas', site_id: 's1', nom_site: 'Bât A', installation_id: 'l2', nom_local: 'Sous-station', fait: 0 },
    { client_id: 'b', nom_client: 'Horizon', site_id: 's2', nom_site: 'Tour', installation_id: null, nom_local: null, fait: 0 },
    { client_id: 'b', nom_client: 'Horizon', site_id: 's3', nom_site: 'Annexe', installation_id: null, nom_local: null, fait: 0 },
  ];
  const r = m.resumerItineraire(cibles);
  assert.strictEqual(r.total, 4); assert.strictEqual(r.faits, 1); assert.strictEqual(r.restants, 3); assert.strictEqual(r.pct, 25);
  assert.strictEqual(r.prochain.nomLocal, 'Sous-station');
  assert.strictEqual(m.libelleReprise(r), 'Reprendre · Bât A · Sous-station');
  assert.strictEqual(r.clients[0].nomClient, 'Horizon'); // le plus de restes en premier
  assert.strictEqual(m.libelleCible({ nomSite: 'Tour', nomLocal: '' }), 'Tour');
  const vide = m.resumerItineraire([]);
  assert.strictEqual(vide.pct, 0); assert.strictEqual(vide.prochain, null);
  assert.strictEqual(m.journeeUtile({ itineraire: vide }), false);
  assert.strictEqual(m.journeeUtile({ itineraire: vide, aEnvoyer: 2 }), true);
  assert.strictEqual(m.libelleReprise(vide), '');
  console.log('journee OK');
  await sqlPart();
})().catch((e) => { console.error(e); process.exit(1); });
