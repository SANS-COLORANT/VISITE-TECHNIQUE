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


(async () => {
  const m = await import('../../rechercheGlobale.js');
  assert.deepStrictEqual(m.motsRequete('a'), []);
  assert.deepStrictEqual(m.motsRequete('  Vent  bas '), ['vent', 'bas']);
  assert.ok(m.scorer('Ventilation basse', ['vent', 'bas']) > 0);
  assert.strictEqual(m.scorer('Chaufferie', ['vent']), 0);
  assert.ok(m.scorer('Éléments', ['elem']) > 0, 'accents ignorés');
  const source = {
    clients: [{ id: 'c1', nom: 'Résidence Les Lilas' }, { id: 'c2', nom: 'Horizon' }],
    structures: [
      { clientId: 'c1', nomClient: 'Résidence Les Lilas', siteId: 's1', nomSite: 'Bâtiment A', installationId: 'i1', nomLocal: 'Chaufferie B2' },
      { clientId: 'c1', nomClient: 'Résidence Les Lilas', siteId: 's1', nomSite: 'Bâtiment A', installationId: 'i2', nomLocal: 'Sous-station' },
      { clientId: 'c2', nomClient: 'Horizon', siteId: 's2', nomSite: 'Tour Horizon', installationId: null, nomLocal: null },
    ],
    themes: [{ id: 'ventilation', title: 'Ventilation haute et basse', scope: 'ICPE' }, { id: 'issues', title: 'Issues de secours', scope: 'ICPE' }],
  };
  let r = m.rechercherPartout('chauf', source);
  assert.deepStrictEqual(r.groupes.map((g) => g.id), ['locaux']);
  assert.strictEqual(r.groupes[0].items[0].cible.params.installationId, 'i1');
  assert.strictEqual(r.groupes[0].items[0].cible.ecran, 'SiteVisites');
  r = m.rechercherPartout('horizon', source);
  assert.deepStrictEqual(r.groupes.map((g) => g.id), ['clients', 'sites']);
  r = m.rechercherPartout('vent bas', source);
  assert.deepStrictEqual(r.groupes.map((g) => g.id), ['regles']);
  assert.strictEqual(r.groupes[0].items[0].cible.aide, 'ventilation');
  assert.strictEqual(m.rechercherPartout('zzzz', source).vide, true);
  assert.strictEqual(m.rechercherPartout('a', source).vide, true);
  assert.strictEqual(m.rechercherPartout('bat', source).groupes.find((g) => g.id === 'sites').items.length, 1, 'un site apparaît une fois malgré ses locaux');
  console.log('recherche globale modèle OK');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-rech-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','C'),('metra-visites-a-rattacher','Technique'); INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','S'),('q','metra-visites-a-rattacher','Rapide');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i','s','chaufferie','Ch1');`);
    const src = fs.readFileSync(path.join(root, 'rechercheGlobaleDb.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    const D = new Function('getDb', 'QUICK_VISIT_CLIENT_ID', `${src}; return { listerStructuresPourRecherche };`)(async () => server.db, 'metra-visites-a-rattacher');
    const rows = await D.listerStructuresPourRecherche();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nomLocal, 'Ch1');
    console.log('recherche globale SQL OK');
  } finally { await server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
