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
  const m = await import('../../depuisDerniereVisite.js');
  assert.strictEqual(m.dateCourte('2026-04-14'), '14 avr. 2026');
  assert.strictEqual(m.dateCourte('nimporte'), '');
  assert.strictEqual(m.resumerDepuisDerniereVisite({}), null, 'pas de visite précédente : rien à résumer');
  const r = m.resumerDepuisDerniereVisite({
    derniere: { date_visite: '2026-04-14' },
    reserves: [{ poste: 'Vase' }, { poste: 'Extincteur' }, { poste: 'Fuite' }],
    equipementsSurveilles: [{ designation: 'Chaudière 2', etat: 'Vétuste' }, { designation: 'Pompe', etat: 'Hors service' }],
    equipementsAjoutes: 1, equipementsTotal: 15,
    releves: [{ label: 'Gaz', valeur: '12 210', unite: 'm³' }, { label: 'Vide', valeur: '' }],
  });
  assert.strictEqual(r.aSurveiller[0].titre, '3 réserves non levées');
  assert.match(r.aSurveiller[0].detail, /\+1$/);
  assert.strictEqual(r.aSurveiller[2].niveau, 'erreur');
  assert.strictEqual(r.releves.length, 1);
  assert.deepStrictEqual(r.equipements, { inchanges: 12, surveilles: 2, ajoutes: 1, total: 15 });
  assert.strictEqual(r.rien, false);
  assert.strictEqual(m.resumerDepuisDerniereVisite({ derniere: { date_visite: '2026-01-01' } }).rien, true);
  console.log('dernière visite modèle OK');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-dernvis-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','C'); INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','S');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i1','s','chaufferie','Ch1'),('i2','s','chaufferie','Ch2');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id) VALUES('old','s','2025-04-01','terminee','icpe_v1','i1'),('v1','s','2026-04-14','terminee','icpe_v1','i1'),('autre','s','2026-05-01','terminee','icpe_v1','i2');
      INSERT INTO materiel(id,visite_id,categorie,designation,etat,ajoute_pendant_visite) VALUES('m1','v1','Chaudière','Chaudière 2','Vétuste',0),('m2','v1','Pompe','Pompe P1','Bon',0),('m3','v1','Pompe','Pompe P2','Bon',1),('m4','autre','Pompe','Ailleurs','Hors service',0);
      INSERT INTO compteurs(id,visite_id,label,valeur,unite) VALUES('c1','v1','Gaz','12210','m³');
      INSERT INTO reserves_suivi(id,site_id,source_visite_id,poste,statut) VALUES('r1','s','v1','Vase','ouverte'),('r2','s','v1','Levée','levee'),('r3','s','autre','Autre local','ouverte');`);
    const model = fs.readFileSync(path.join(root, 'depuisDerniereVisite.js'), 'utf8').replace(/export /g, '');
    const src = fs.readFileSync(path.join(root, 'depuisDerniereVisiteDb.js'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    const D = new Function('getDb', `${model}; ${src}; return { chargerDepuisDerniereVisite };`)(async () => server.db);
    const x = await D.chargerDepuisDerniereVisite({ siteId: 's', installationId: 'i1' });
    assert.strictEqual(x.date, '14 avr. 2026');
    assert.strictEqual(x.aSurveiller.filter((p) => /réserve/.test(p.titre)).length, 1);
    assert.match(x.aSurveiller[0].titre, /^1 réserve non levée$/, 'seulement les réserves nées dans ce local');
    assert.strictEqual(x.equipements.surveilles, 1);
    assert.strictEqual(x.equipements.ajoutes, 1);
    assert.strictEqual(x.equipements.total, 3);
    assert.strictEqual(x.releves[0].valeur, '12210');
    assert.strictEqual(await D.chargerDepuisDerniereVisite({ siteId: 's', installationId: 'inconnu' }), null);
    console.log('dernière visite SQL OK');
  } finally { await server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
