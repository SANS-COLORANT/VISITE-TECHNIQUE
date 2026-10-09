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
  const m = await import('../../releveHistorique.js');
  const h = [{ date: '2025-04-01', valeur: 1000 }, { date: '2025-10-01', valeur: 2000 }, { date: '2026-04-01', valeur: 3000 }];
  // Rythme habituel ~ 1000 sur ~183 j ; la période en cours consomme beaucoup plus.
  const haut = m.analyserHistorique(h, { valeur: '4770', date: '2026-09-30' });
  assert.strictEqual(haut.utile, true);
  assert.strictEqual(haut.ecart, 1770);
  assert.strictEqual(haut.jours, 182);
  assert.strictEqual(haut.niveau, 'haut');
  assert.match(m.libelleTaux(haut.tauxPct), /^\+\d+ % vs rythme habituel$/);
  const normal = m.analyserHistorique(h, { valeur: '4000', date: '2026-09-30' });
  assert.strictEqual(normal.niveau, 'normal');
  const bas = m.analyserHistorique(h, { valeur: '3100', date: '2026-09-30' });
  assert.strictEqual(bas.niveau, 'bas');
  // Moins de trois relevés : rien à afficher.
  assert.strictEqual(m.analyserHistorique(h.slice(0, 1), { valeur: '1500', date: '2026-01-01' }).utile, false);
  // Baisse (compteur remplacé) : pas de période, donc pas d'alerte.
  const rempl = m.analyserHistorique(h, { valeur: '10', date: '2026-09-30' });
  assert.strictEqual(rempl.ecart, null); assert.strictEqual(rempl.niveau, 'normal');
  // Saisie vide ou illisible : courbe sur l'historique seul.
  assert.strictEqual(m.analyserHistorique(h, { valeur: '', date: '2026-09-30' }).points.length, 3);
  assert.strictEqual(m.analyserHistorique(h, { valeur: 'abc', date: '2026-09-30' }).points.length, 3);
  const c = m.coordonneesCourbe(haut.points, 240, 64, 8);
  assert.strictEqual(c.length, 4); assert.strictEqual(c[0].x, 8); assert.strictEqual(c[3].x, 232);
  assert.ok(c[3].y < c[0].y, 'la valeur la plus haute est en haut');
  assert.strictEqual(c[3].courant, true);
  assert.deepStrictEqual(m.coordonneesCourbe([]), []);
  console.log('courbe relevés modèle OK');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-hist-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','C'); INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','S');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i','s','chaufferie','Ch');
      INSERT INTO compteurs_site(id,installation_id,type_code,libelle) VALUES('cs','i','compteur','Gaz');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id) VALUES('v1','s','2025-04-01','terminee','icpe_v1','i'),('v2','s','2025-10-01','terminee','icpe_v1','i'),('v3','s','2026-04-01','en_cours','icpe_v1','i');
      INSERT INTO releves_compteur(id,compteur_site_id,visite_id,valeur_texte,valeur_nombre) VALUES('r1','cs','v1','1 000',NULL),('r2','cs','v2',NULL,2000),('r3','cs','v3','3000',NULL);`);
    const src = fs.readFileSync(path.join(root, 'releveHistoriqueDb.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    const D = new Function('getDb', `${src}; return { listerHistoriqueReleves };`)(async () => server.db);
    const r = await D.listerHistoriqueReleves('cs', 'v3');
    assert.deepStrictEqual(r.map((x) => x.valeur), [1000, 2000], 'ordre chronologique, hors visite courante, texte et nombre lus');
    assert.deepStrictEqual(await D.listerHistoriqueReleves(null, 'v3'), []);
    console.log('courbe relevés SQL OK');
  } finally { await server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
