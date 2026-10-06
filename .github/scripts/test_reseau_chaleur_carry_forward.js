/** Import Excel -> close database -> new visit, with real SQLite and runtime modules. */
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
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}

function databaseProcess(filename) {
  const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename]);
  const pending = new Map(); let seq = 0;
  child.stderr.pipe(process.stderr);
  child.on('error', (error) => { for (const waiter of pending.values()) waiter.reject(error); });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line); const waiter = pending.get(response.id); pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql),
    withTransactionAsync: async (fn) => {
      await send('run', 'BEGIN');
      try { const result = await fn(); await send('run', 'COMMIT'); return result; }
      catch (error) { await send('run', 'ROLLBACK'); throw error; }
    },
  };
  return { db, send, close: () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end(); }) };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-rcu-'));
  const filename = path.join(dir, 'rcu.db');
  let server;
  let sequence = 0; const createId = () => `rcu-${++sequence}`;
  const data = load('data.js');
  const rcu = load('reseauChaleurTrame.js', { TRAME_DATA: data.TRAME_DATA, TEMPLATE_RESEAU_CHALEUR_BASE64: 'fixture' });
  const XLSX = require('xlsx');
  const registry = load('trameRegistry.js', { ...data, ...rcu, TEMPLATE_EXCEL_BASE64: 'fixture',
    ...load('vmcTrame.js', { XLSX }), ...load('preAllumageTrame.js', { XLSX }), ...load('trameValidation.js') });
  const { obtenirTrame } = registry;
  const definition = obtenirTrame('reseau_chaleur_v1');
  server = databaseProcess(filename);
  try {
    await server.send('migrate', '', [0, 100]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('client','Client Alpha');
      INSERT INTO sites(id,client_id,nom_site) VALUES('site','client','Site Alpha');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('local','site','sous_station','SST 1'),('other','site','sous_station','SST 2');`);
    const importer = load('excelImport.js', { XLSX, DocumentPicker: {}, FileSystem: {}, detecterTrameDepuisClasseur: registry.detecterTrameDepuisClasseur, getDb: async () => server.db, uuidv4: createId });
    const analyse = { client: 'Client', site: 'Site', trameId: definition.id, nomFichier: 'RCU.xlsx', dateVisite: '2026-01-01',
      champs: [
        { sectionCode: 'infos.informations_g_n_rales', cle: 'Energie - pression', valeur: 'RCU 8 bar' },
        { sectionCode: 'distrib.distribution_chauffage', cle: 'Matériaux tuyauterie', valeur: 'Acier' },
        { sectionCode: 'regulation.cascade', cle: 'Paramètres cascade chaudières', valeur: 'Référence cascade' },
        { sectionCode: 'regulation.cascade', cle: 'T°ext(°C)', valeur: '4' },
        { sectionCode: 'releves.compteurs', cle: 'Index compteur énergie (MWh)', valeur: '123' },
      ], controles: [{ sectionCode: 'releves.temperatures', cle: 'pH', avis: 'S', commentaire: '7.2' }],
      reseaux: [{ ordre: 1, nom: 'Chauffage', tExt: '4', tDep: '70', courbe: '1.5', tnc: '20', programme: '6h-22h' }],
      compteurs: [{ label: 'Énergie', unite: 'MWh', valeur: '123' }],
      materiel: [{ categorie: 'echangeur', designation: 'Échangeur', perimetre: 'Primaire', nombre: '2', numero: 'SN-1', caracteristiques: '200 kW', marque: 'Marque', modele: 'Modèle', etat: 'Mauvais' }],
      remarques: [{ poste: 'Fuite', prestation: 'Réparer', perimetre: 'Primaire' }], note: 'Conclusion historique',
    };
    const sheet = { B1: { t: 's', v: 'Client Alpha' }, B2: { t: 's', v: 'Site Alpha' }, B5: { t: 's', v: '2026-01-01' } };
    for (const field of [...analyse.champs, ...analyse.controles]) {
      const mapping = definition.excel.fieldMappings.find((m) => m.sectionCode === field.sectionCode && m.cle === field.cle);
      assert.ok(mapping, `real Excel mapping ${field.cle}`);
      sheet[mapping.valueCell] = { t: 's', v: field.valeur || field.avis };
      if (mapping.commentCell) sheet[mapping.commentCell] = { t: 's', v: field.commentaire };
    }
    const network = analyse.reseaux[0];
    for (const [key, offset] of Object.entries(definition.excel.networks.importOffsets)) sheet[`C${91 + offset}`] = { t: 's', v: network[key] };
    sheet['!ref'] = 'A1:J377';
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, definition.excel.mainSheet);
    const material = XLSX.utils.aoa_to_sheet([[], [], [], ['echangeur', '2', 'Échangeur', 'SN-1', 'Primaire', 'Marque', 'Modèle', '200 kW', '', 'Mauvais']]);
    XLSX.utils.book_append_sheet(wb, material, 'MATERIEL');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], ['Conclusion historique']]), 'NOTE');
    const parsed = importer.analyserClasseur(XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }), 'RCU.xlsx');
    // Include a historical reserve to verify its visit isolation.
    parsed.remarques = analyse.remarques;
    await assert.rejects(importer.importerAnalyseExcel(parsed), /Plusieurs locaux/);
    const imported = await importer.importerAnalyseExcel(parsed, { installationId: 'local' });
    assert.equal((await server.db.getFirstAsync('SELECT installation_id FROM visites WHERE id=?', [imported.visiteId])).installation_id, 'local');
    await server.db.runAsync("UPDATE visites SET statut='terminee' WHERE id=?", [imported.visiteId]);
    await server.close(); server = databaseProcess(filename);
    const semantic = load('trameSemanticMesh.js');
    const carry = load('visitCarryForwardDb.js', { createId, obtenirTrame, DEFAULT_TRAME_ID: 'icpe_v1', construireIndexSemantiqueTrame: semantic.construireIndexSemantiqueTrame });
    const prefill = load('visitPrefillDb.js', { obtenirTrame, DEFAULT_TRAME_ID: 'icpe_v1', carryForwardPreviousVisit: carry.carryForwardPreviousVisit, BoundedLruMap: load('boundedCache.js').BoundedLruMap });
    const equipment = load('persistentEquipmentDb.js', { openAppDatabase: async () => server.db, createId });
    const creation = load('visitCreationDb.js', { getDb: async () => server.db, createId, obtenirTrame, DEFAULT_TRAME_ID: 'icpe_v1',
      preremplirVisiteDepuisContexte: prefill.preremplirVisiteDepuisContexte, dossierVisiteMetra: async () => {}, obtenirRacineMetra: async () => null,
      importApiReferenceForVisit: async () => {}, importLatestApiVisitForLocal: async () => {}, pinPhotoReferencesForVisit: async () => {},
      assurerStructureSitePreAllumage: async () => {}, chargerPreAllumageModulaire: async () => {} });
    const next = () => creation.creerVisiteProduction({ siteId: 'site', installationId: 'local', trameId: definition.id });
    async function verify(id, nomReseau = 'Chauffage') {
      const champs = await server.db.getAllAsync('SELECT cle,valeur FROM champs_visite WHERE visite_id=?', [id]);
      assert.equal(champs.find((c) => c.cle === 'Energie - pression')?.valeur, 'RCU 8 bar');
      assert.equal(champs.find((c) => c.cle === 'Matériaux tuyauterie')?.valeur, 'Acier');
      assert.equal(champs.find((c) => c.cle === 'Paramètres cascade chaudières')?.valeur, 'Référence cascade');
      assert.equal(champs.find((c) => c.cle === 'T°ext(°C)')?.valeur, '4');
      assert.equal(champs.find((c) => c.cle === 'Index compteur énergie (MWh)')?.valeur, '123');
      const network = await server.db.getFirstAsync('SELECT * FROM reseaux WHERE visite_id=?', [id]);
      assert.equal(network.nom_reseau, nomReseau); assert.equal(network.courbe_de_chauffe, '1.5');
      assert.equal(String(network.t_ext_c), '4'); assert.equal(String(network.t_dep_c), '70');
      const meter = await server.db.getFirstAsync('SELECT * FROM compteurs WHERE visite_id=?', [id]);
      assert.equal(meter.label, parsed.compteurs[0].label); assert.equal(meter.unite, 'MWh'); assert.equal(String(meter.valeur), '123');
      const material = await equipment.listerMaterielPersistant(id);
      assert.equal(material.length, 1); assert.equal(material[0].perimetre, 'Primaire'); assert.equal(material[0].nombre, '2');
      assert.equal(material[0].numero_materiel, 'SN-1'); assert.equal(material[0].caracteristiques, '200 kW'); assert.equal(material[0].etat, null);
      const control = await server.db.getFirstAsync('SELECT avis,commentaire FROM controles_visite WHERE visite_id=? AND cle=?', [id, 'pH']);
      assert.equal(control.avis, 'S'); assert.equal(control.commentaire, '7.2');
      const carriedReserves = await server.db.getAllAsync('SELECT poste,prestation,reference_type,intranet_etat_avancement FROM remarques WHERE visite_id=?', [id]);
      assert.equal(carriedReserves.length, 1, 'unresolved reserve is carried into the new visit');
      assert.equal(carriedReserves[0].poste, 'Fuite');
      assert.equal(carriedReserves[0].prestation, 'Réparer');
      assert.equal(carriedReserves[0].reference_type, 'reserve_historique');
      for (const table of ['photos','observations_equipement','releves_compteur']) {
        assert.equal((await server.db.getFirstAsync(`SELECT count(*) n FROM ${table} WHERE visite_id=?`, [id])).n, 0, `${table} isolated`);
      }
      assert.equal((await server.db.getFirstAsync('SELECT contenu FROM notes WHERE visite_id=?', [id])).contenu, '');
    }
    const second = await next();
    await verify(second);
    const meter = await server.db.getFirstAsync('SELECT destination,valeur FROM compteurs WHERE visite_id=?', [second]);
    assert.equal(meter.destination, 'Index compteur énergie (MWh)');
    assert.equal(String(meter.valeur), '123', 'latest meter reading is proposed in the new visit');
    await server.db.runAsync("UPDATE reseaux SET nom_reseau='Chauffage renommé' WHERE visite_id=?", [second]);
    // Simule une tablette existante : import non lié + dernière visite vide.
    await server.db.runAsync('UPDATE visites SET installation_id=NULL WHERE id=?', [imported.visiteId]);
    await server.db.execAsync("INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite) VALUES('broken','site','local','reseau_chaleur_v1','terminee','2027-01-01')");
    await verify(await next(), 'Chauffage renommé');
    const other = await creation.creerVisiteProduction({ siteId: 'site', installationId: 'other', trameId: definition.id });
    assert.equal((await server.db.getAllAsync('SELECT * FROM reseaux WHERE visite_id=?', [other])).length, 0);
    assert.equal((await equipment.listerMaterielPersistant(other)).length, 0);
    assert.ok(!data.TRAME_DATA['p-distrib']['Distribution chauffage'][0].carryForward, 'ICPE definition unchanged');
    assert.equal((await server.db.getFirstAsync('SELECT valeur FROM compteurs WHERE visite_id=?', [imported.visiteId])).valeur, '123');
    assert.deepEqual(await server.db.getAllAsync('PRAGMA foreign_key_check'), []);
    console.log('RCU regression validated: import, close/reopen, production creation, complete prefill, unresolved reserve carry-forward, isolated photos/observations, local isolation.');
  } finally { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
