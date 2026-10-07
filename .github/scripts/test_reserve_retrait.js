/** Retrait des réserves reprises : supprimées de la visite, elles ne reviennent plus aux visites suivantes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) names.push(...match[1].split(',').map((s) => s.trim()).filter(Boolean));
  const script = source
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}

function databaseProcess(filename) {
  const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename]);
  const pending = new Map(); let seq = 0;
  child.stderr.pipe(process.stderr);
  child.on('error', (error) => { for (const waiter of pending.values()) waiter.reject(error); });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line); const waiter = pending.get(response.id); pending.delete(response.id);
    if (!waiter) return;
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params),
    execAsync: (sql) => send('exec', sql),
    withTransactionAsync: async (fn) => {
      await send('run', 'BEGIN');
      try { const result = await fn(); await send('run', 'COMMIT'); return result; }
      catch (error) { await send('run', 'ROLLBACK'); throw error; }
    },
  };
  return { db, send, close: () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end(); }) };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-reserve-retrait-'));
  const filename = path.join(dir, 'retrait.db');
  const server = databaseProcess(filename);
  let seq = 0; const createId = () => `retrait-${++seq}`;
  try {
    await server.send('migrate', '', [0, 46]);

    const data = load('data.js');
    const XLSX = require('xlsx');
    const rcu = load('reseauChaleurTrame.js', { TRAME_DATA: data.TRAME_DATA, TEMPLATE_RESEAU_CHALEUR_BASE64: 'fixture' });
    const registry = load('trameRegistry.js', {
      ...data, ...rcu, TEMPLATE_EXCEL_BASE64: 'fixture',
      ...load('vmcTrame.js', { XLSX }),
      ...load('preAllumageTrame.js', { XLSX }),
      ...load('trameValidation.js'),
    });
    const semantic = load('trameSemanticMesh.js');
    const carry = load('visitCarryForwardDb.js', {
      createId,
      DEFAULT_TRAME_ID: registry.DEFAULT_TRAME_ID,
      obtenirTrame: registry.obtenirTrame,
      construireIndexSemantiqueTrame: semantic.construireIndexSemantiqueTrame,
    });
    const photosSupprimees = [];
    const remarks = load('remarkDb.js', {
      openAppDatabase: async () => server.db,
      createId,
      supprimerPhotosEntiteComplete: async (visiteId, entiteKey) => { photosSupprimees.push(entiteKey); },
      clampReserveSeverity: (v) => v,
    });

    await server.db.execAsync(`
      INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','Site');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('local','s','chaufferie','Local A');
      INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('v1','s','local','icpe_v1','2026-01-10','terminee');
      INSERT INTO remarques(id,visite_id,poste,prestation,origine,criticite) VALUES('r-a','v1','Fuite','Réparer la fuite','ICPE',4);
      INSERT INTO remarques(id,visite_id,poste,prestation,origine,criticite) VALUES('r-b','v1','Calorifuge','Reprendre le calorifuge','ICPE',2);
      INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('v2','s','local','icpe_v1','2026-02-10','en_cours');
    `);
    const reprendre = async (id) => carry.carryForwardPreviousVisit(server.db, id, await server.db.getFirstAsync('SELECT * FROM visites WHERE id=?', [id]));
    const reserves = async (id) => server.db.getAllAsync('SELECT id,reference_type,reference_id,intranet_etat_avancement FROM remarques WHERE visite_id=? ORDER BY reference_id,id', [id]);

    assert.equal((await reprendre('v2')).copiedReserves, 2, 'les deux réserves ouvertes sont reprises');
    const v2 = await reserves('v2');
    const copieB = v2.find((r) => r.reference_id === 'r-b');
    await server.db.runAsync("UPDATE remarques SET intranet_etat_avancement='Terminé' WHERE id=?", [copieB.id]);
    await server.db.runAsync("INSERT INTO remarques(id,visite_id,poste,prestation,origine,criticite) VALUES('r-new','v2','Signalétique','Poser la signalétique','ICPE',2)");

    assert.equal(await remarks.supprimerReservesReprises('v2'), 1, 'seule la réserve reprise encore ouverte est retirée');
    assert.deepEqual((await reserves('v2')).map((r) => r.reference_id || r.id).sort(), ['r-b', 'r-new'], 'réserve créée et réserve levée pendant la visite conservées');
    assert.equal(photosSupprimees.length, 1, 'les photos de la réserve retirée sont nettoyées');
    assert.ok(await server.db.getFirstAsync("SELECT 1 AS ok FROM provenances WHERE entite_type='reserve_lignee' AND entite_id='r-a' AND origine='retrait_visite'"), 'lignée marquée retirée');
    assert.equal(await remarks.supprimerReservesReprises('v2'), 0, 'opération idempotente');

    await server.db.runAsync("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('v3','s','local','icpe_v1','2026-03-10','en_cours')");
    await reprendre('v3');
    assert.deepEqual((await reserves('v3')).map((r) => r.reference_id), ['r-new'], 'la réserve retirée ne revient pas depuis la visite plus ancienne');

    // Suppression unitaire d'une réserve reprise : même effet durable.
    const copieNew = (await reserves('v3'))[0];
    await remarks.supprimerRemarqueVisite(copieNew.id);
    await server.db.runAsync("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('v4','s','local','icpe_v1','2026-04-10','en_cours')");
    await reprendre('v4');
    assert.deepEqual(await reserves('v4'), [], 'suppression unitaire d’une réserve reprise durable');

    // Une réserve propre à la visite supprimée ne laisse pas de marque.
    await remarks.supprimerRemarqueVisite('r-new');
    assert.equal((await server.db.getFirstAsync("SELECT COUNT(*) AS n FROM provenances WHERE entite_type='reserve_lignee'")).n, 2);

    assert.deepEqual(await server.db.getAllAsync('PRAGMA foreign_key_check'), []);
    console.log('Reserve removal validated: carried reserves can be removed, visit reserves are kept, removed lineages are not carried again.');
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
