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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-tournee-'));
  const server = databaseProcess(path.join(dir, 't.db'));
  try {
    await server.send('migrate', '', [0, 47]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s1','c','Site 1'),('s2','c','Site 2'),('s3','c','Site 3');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i1','s1','chaufferie','Chaufferie 1'),('i2','s1','chaufferie','Chaufferie 2');`);
    let n = 0;
    const source = fs.readFileSync(path.join(root, 'tourneeDb.js'), 'utf8').replace(/^import .*$/m, '').replace(/export (async )?function/g, '$1function')
      .replace(/export /g, '');
    const T = new Function('getDb', 'uuidv4', `${source}; return { listerTourneeClient, listerTourneeSite, ajouterCiblesTournee, retirerCiblesTournee, retirerCiblesFaites, viderTourneeClient, bilanTournee, indexerTournee };`)(
      async () => server.db, () => `id-${++n}`);

    // Ajout idempotent.
    assert.equal(await T.ajouterCiblesTournee('c', [{ siteId: 's1' }, { siteId: 's2' }, { siteId: 's1', installationId: 'i1' }]), 3);
    assert.equal(await T.ajouterCiblesTournee('c', [{ siteId: 's2' }]), 0, 'une cible déjà présente n’est pas dupliquée');
    let rows = await T.listerTourneeClient('c');
    assert.deepEqual(T.bilanTournee(rows), { total: 3, faits: 0, restants: 3 });

    // Une visite antérieure à la cible ne la coche pas.
    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id,cree_le) VALUES('old','s1','2020-01-01','terminee','icpe_v1','i1','2000-01-01 00:00:00');`);
    rows = await T.listerTourneeClient('c');
    assert.equal(T.bilanTournee(rows).faits, 0, 'visite plus ancienne que la cible : non cochée');

    // Créer une visite sur le local coche le local ET son site.
    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id,cree_le) VALUES('new','s1','2026-10-09','en_cours','icpe_v1','i1','2999-01-01 00:00:00');`);
    rows = await T.listerTourneeClient('c');
    const idx = T.indexerTournee(rows);
    assert.equal(Number(idx.locaux.get('i1').fait), 1);
    assert.equal(Number(idx.sites.get('s1').fait), 1, 'le site est fait dès qu’un de ses locaux a une visite');
    assert.equal(Number(idx.sites.get('s2').fait), 0);
    assert.deepEqual(T.bilanTournee(rows), { total: 3, faits: 2, restants: 1 });
    assert.equal((await T.listerTourneeSite('s1')).length, 1);

    // Supprimer la visite remet la cible à faire (état déduit, jamais figé).
    await server.db.runAsync(`DELETE FROM visites WHERE id='new'`);
    assert.equal(T.bilanTournee(await T.listerTourneeClient('c')).faits, 0);

    // Retrait ciblé, retrait des faites, vidage.
    await T.retirerCiblesTournee('c', [{ siteId: 's2' }]);
    assert.equal((await T.listerTourneeClient('c')).length, 2);
    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id,cree_le) VALUES('n2','s1','2026-10-09','en_cours','icpe_v1','i1','2999-01-01 00:00:00');`);
    assert.equal(await T.retirerCiblesFaites('c'), 2);
    assert.equal((await T.listerTourneeClient('c')).length, 0);
    await T.ajouterCiblesTournee('c', [{ siteId: 's3' }]);
    await T.viderTourneeClient('c');
    assert.equal((await T.listerTourneeClient('c')).length, 0);

    // Suppression d'un site : ses cibles disparaissent (clé étrangère).
    await T.ajouterCiblesTournee('c', [{ siteId: 's3' }]);
    await server.db.execAsync(`PRAGMA foreign_keys=ON; DELETE FROM sites WHERE id='s3';`);
    console.log('tournée : OK');
  } finally { await server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
