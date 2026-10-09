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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-relecture-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','C'); INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','S');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('v','s','2026-10-09','en_cours','icpe_v1');
      INSERT INTO remarques(id,visite_id,poste) VALUES('r1','v','Fuite vase'),('r2','v','Extincteur périmé');
      INSERT INTO photos(id,visite_id,entite_key,uri) VALUES('p1','v','remarque||r1','file:///x.jpg');`);
    const src = fs.readFileSync(path.join(root, 'relectureDb.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    const R = new Function('getDb', 'listerCompteurs', `${src}; return { chargerElementsRelecture };`)(async () => server.db, async () => [{ label: 'Gaz', valeur: '10', valeur_precedente: '12', unite: 'm³' }]);
    const e = await R.chargerElementsRelecture('v');
    assert.deepStrictEqual(e.reservesSansPhoto, [{ id: 'r2', titre: 'Extincteur périmé' }]);
    assert.strictEqual(e.compteurs[0].precedent, '12');
    console.log('relecture SQL OK');
  } finally { await server.close(); }
}

(async () => {
  const m = await import('../../relectureModel.js');
  const onglets = { 'p-a': { state: 'done', total: 5, done: 5 }, 'p-b': { state: 'empty', total: 4, done: 0 }, 'p-c': { state: 'partial', total: 6, done: 2 }, 'p-releves': { state: 'done', total: 3, done: 3 } };
  const r = m.analyserRelecture({
    onglets, labels: { 'p-b': 'Extincteurs', 'p-c': 'Issues' }, ordre: Object.keys(onglets),
    compteurs: [{ label: 'Gaz', valeur: '12 210', precedent: '12 480', unite: 'm³' }, { label: 'Eau', valeur: '50', precedent: '50' }, { label: 'Élec', valeur: '', precedent: '5' }, { label: 'Fioul', valeur: '9', precedent: '3' }],
    reservesSansPhoto: [{ id: 'r', titre: 'Fuite' }],
  });
  assert.strictEqual(r.points[0].niveau, 'erreur');
  assert.match(r.points[0].titre, /Gaz : index plus bas/);
  assert.ok(r.points.some((p) => p.titre === 'Eau : index inchangé'));
  assert.ok(r.points.some((p) => p.titre === 'Élec : pas d’index'));
  assert.ok(!r.points.some((p) => /Fioul/.test(p.titre)), 'un index qui monte est correct');
  assert.ok(r.points.some((p) => p.titre === 'Onglet vide : Extincteurs'));
  assert.ok(r.points.some((p) => p.id === 'res:r'));
  assert.strictEqual(r.points[r.points.length - 1].niveau, 'info');
  assert.strictEqual(r.propre, false);
  const net = m.analyserRelecture({ onglets: { a: { state: 'done', total: 1, done: 1 }, b: { state: 'alert', total: 1, done: 1 } }, ordre: ['a', 'b'], compteurs: [{ label: 'Gaz', valeur: '20', precedent: '10' }] });
  assert.strictEqual(net.propre, true);
  assert.ok(net.ok.length >= 2);
  const beaucoup = {}; for (let i = 0; i < 7; i++) beaucoup['t' + i] = { state: 'empty', total: 2, done: 0 };
  const b = m.analyserRelecture({ onglets: beaucoup });
  assert.strictEqual(b.points.length, 5, '4 onglets vides + 1 ligne de synthèse');
  console.log('relecture modèle OK');
  await sqlPart();
})().catch((e) => { console.error(e); process.exit(1); });
