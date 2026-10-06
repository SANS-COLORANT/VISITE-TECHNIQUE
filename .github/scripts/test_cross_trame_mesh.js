/** Cross-trame semantic mesh: ICPE -> RCU -> VMC on the same local. */
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-cross-trame-'));
  const filename = path.join(dir, 'mesh.db');
  const server = databaseProcess(filename);
  let seq = 0; const createId = () => `mesh-${++seq}`;
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
    const equipment = load('persistentEquipmentDb.js', { openAppDatabase: async () => server.db, createId });

    await server.db.execAsync(`
      INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','Site');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('local','s','chaufferie','Local A');

      INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut)
      VALUES('icpe','s','local','icpe_v1','2026-01-10','terminee');
      INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut)
      VALUES('rcu','s','local','reseau_chaleur_v1','2026-02-10','en_cours');
    `);

    const icpe = registry.obtenirTrame('icpe_v1');
    const rcuDef = registry.obtenirTrame('reseau_chaleur_v1');
    const find = (def, cle, type = null, section = null) => {
      const rows = def.excel.fieldMappings.filter((m) =>
        m.cle === cle && (!type || m.type === type) && (!section || m.section === section)
      );
      assert.ok(rows.length >= 1, `${def.id}: mapping attendu pour ${cle}${section ? ` / ${section}` : ''}`);
      return rows[0];
    };

    const srcExploitant = find(icpe, 'Exploitant - marché', 'champ');
    const srcProduction = find(icpe, 'Production primaire', 'champ');
    const srcPh = find(icpe, 'pH', 'controle');

    await server.db.runAsync(
      'INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
      ['icpe', srcExploitant.sectionCode, srcExploitant.cle, 'DALKIA']
    );
    await server.db.runAsync(
      'INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
      ['icpe', srcProduction.sectionCode, srcProduction.cle, 'Réseau de chaleur']
    );
    await server.db.runAsync(
      'INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)',
      ['icpe', srcPh.sectionCode, srcPh.cle, 'S', '7.4']
    );
    await server.db.runAsync(
      "INSERT INTO remarques(id,visite_id,poste,prestation,origine,criticite,intranet_etat_avancement) VALUES('r-open','icpe','Fuite','Réparer la fuite','ICPE',4,NULL)"
    );
    await server.db.runAsync(
      "INSERT INTO remarques(id,visite_id,poste,prestation,origine,criticite,intranet_etat_avancement) VALUES('r-closed','icpe','Ancienne','Déjà traité','ICPE',2,'Terminé')"
    );

    const rcuContext = await server.db.getFirstAsync('SELECT * FROM visites WHERE id=?', ['rcu']);
    const rcuResult = await carry.carryForwardPreviousVisit(server.db, 'rcu', rcuContext);
    assert.equal(rcuResult.previousVisitId, 'icpe', 'latest local visit may come from another trame');
    assert.ok(rcuResult.copiedFields >= 2, 'cross-trame fields copied');
    assert.ok(rcuResult.copiedControls >= 1, 'cross-trame controls copied');
    assert.equal(rcuResult.copiedReserves, 1, 'only unresolved reserve copied');

    const dstExploitant = find(rcuDef, 'Exploitant - marché', 'champ');
    const dstProduction = find(rcuDef, 'Production primaire', 'champ', 'Informations générales');
    const dstPh = find(rcuDef, 'pH', 'controle');
    assert.equal((await server.db.getFirstAsync(
      'SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?',
      ['rcu', dstExploitant.sectionCode, dstExploitant.cle]
    )).valeur, 'DALKIA');
    assert.equal((await server.db.getFirstAsync(
      'SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?',
      ['rcu', dstProduction.sectionCode, dstProduction.cle]
    )).valeur, 'Réseau de chaleur');
    const ph = await server.db.getFirstAsync(
      'SELECT avis,commentaire FROM controles_visite WHERE visite_id=? AND section_code=? AND cle=?',
      ['rcu', dstPh.sectionCode, dstPh.cle]
    );
    assert.deepEqual(ph, { avis: 'S', commentaire: '7.4' });

    const reserve = await server.db.getAllAsync(
      "SELECT poste,prestation,reference_type,reference_id FROM remarques WHERE visite_id='rcu' ORDER BY id"
    );
    assert.equal(reserve.length, 1);
    assert.equal(reserve[0].poste, 'Fuite');
    assert.equal(reserve[0].reference_type, 'reserve_historique');
    assert.equal(reserve[0].reference_id, 'r-open');

    // A later VMC visit reuses the same canonical operator even though the
    // source label is different ("Exploitant - marché" -> "Exploitant").
    await server.db.runAsync(
      "INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('vmc','s','local','vmc','2026-03-10','en_cours')"
    );
    const vmcContext = await server.db.getFirstAsync('SELECT * FROM visites WHERE id=?', ['vmc']);
    const vmcResult = await carry.carryForwardPreviousVisit(server.db, 'vmc', vmcContext);
    assert.ok(vmcResult.copiedFields >= 1);
    const vmcDef = registry.obtenirTrame('vmc');
    const vmcExploitant = find(vmcDef, 'Exploitant', 'champ');
    assert.equal((await server.db.getFirstAsync(
      'SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?',
      ['vmc', vmcExploitant.sectionCode, vmcExploitant.cle]
    )).valeur, 'DALKIA');

    const vmcReserves = await server.db.getAllAsync("SELECT reference_id FROM remarques WHERE visite_id='vmc'");
    assert.deepEqual(vmcReserves.map((r) => r.reference_id), ['r-open'], 'reserve lineage crosses trames without duplication');

    assert.equal(
      equipment.equipementCompatible({ type_code: 'Chaudière', designation: 'Chaudière 1', trames_explicit: 'icpe_v1', nb_trames: 1 }, 'reseau_chaleur_v1'),
      true,
      'heating equipment remains reusable outside its original trame'
    );
    assert.equal(
      equipment.equipementCompatible({ type_code: 'Caisson VMC', designation: 'Caisson 1', trames_explicit: 'vmc', nb_trames: 1 }, 'icpe_v1'),
      false,
      'VMC-only equipment does not leak into ICPE'
    );

    assert.deepEqual(await server.db.getAllAsync('PRAGMA foreign_key_check'), []);
    console.log('Cross-trame semantic mesh validated: fields, controls, open reserves and compatible equipment follow the local across trames.');
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
