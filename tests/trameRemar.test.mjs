import { before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import XLSX from 'xlsx';
import { REMAR } from '../remarTrame.js';
import { obtenirTrame, listerTramesDisponibles, registerLocalTrame } from '../trameRegistry.js';
import { validateLocalTrame, editableTrameCopy, addTramePoint, changeTramePoint, removeTramePoint, renameTrameSection, exportTramePackage, importTramePackage, readTrameManifest } from '../trameLibrary.js';
import { draftTrameFromWorkbook } from '../trameWorkbookImport.js';
import { migrateDatabase, verifyDatabaseIntegrity } from '../database/migrate.js';
import { construireIndexSemantiqueTrame } from '../trameSemanticMesh.js';
import { preremplirVisiteDepuisContexte } from '../visitPrefillDb.js';

const sqlite = new DatabaseSync(':memory:');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  async getAllAsync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { const r = await fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const champs = (id) => db.getAllAsync('SELECT * FROM champs_visite WHERE visite_id=?', [id]);
const controls = (id) => db.getAllAsync('SELECT * FROM controles_visite WHERE visite_id=?', [id]);
const visite = (id) => db.getFirstAsync('SELECT v.*,s.nom_site,s.adresse,c.nom AS nom_client,i.nom AS nom_installation FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id LEFT JOIN installations i ON i.id=v.installation_id WHERE v.id=?', [id]);
let sequence = 0;
mock.module('../db.js', { namedExports: {
  getDb: async () => db, uuidv4: () => `test-${++sequence}`, getVisite: visite,
  listerReseaux: (id) => db.getAllAsync('SELECT * FROM reseaux WHERE visite_id=? ORDER BY ordre', [id]),
  listerMateriel: (id) => db.getAllAsync('SELECT * FROM materiel WHERE visite_id=?', [id]),
  listerRemarques: (id) => db.getAllAsync('SELECT * FROM remarques WHERE visite_id=?', [id]),
  listerCompteurs: (id) => db.getAllAsync('SELECT * FROM compteurs WHERE visite_id=?', [id]),
  getNote: async (id) => (await db.getFirstAsync('SELECT contenu FROM notes WHERE visite_id=?', [id]))?.contenu || '',
} });
mock.module('expo-file-system', { namedExports: { EncodingType: { Base64: 'base64' }, cacheDirectory: '/tmp/' } });
mock.module('expo-sharing', { namedExports: { isAvailableAsync: async () => false } });
mock.module('expo-document-picker', { namedExports: {} });
mock.module('../preAllumageAliases.js', { namedExports: { libelleChamp: (s, c) => c, libelleSection: (p, s) => s, listerAliasesPreAllumage: async () => ({}) } });
mock.module('../preAllumageModularDb.js', { namedExports: { chargerPreAllumageModulaire: async () => null } });
mock.module('../metraStorage.js', { namedExports: { creerFichierSaf: async () => null, dossierVisiteMetra: async () => null } });
const { saveLocalTrame, loadLocalTrames, importLocalTrame, setLocalTrameActive } = await import('../trameLibraryDb.js');
const { construireClasseur } = await import('../excelExport.js');
const { analyserClasseur, importerAnalyseExcel } = await import('../excelImport.js');
const workbook = () => XLSX.read(REMAR.excel.templateBase64, { type: 'base64', cellStyles: true });
const roundtrip = (wb) => XLSX.read(XLSX.write(wb, { type: 'buffer' }), { type: 'buffer' });
async function newVisit(trameId = 'remar_v1', localId = 'local') {
  const id = `visit-${++sequence}`;
  await db.runAsync("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite) VALUES(?,'site',?,?,'2026-10-26')", [id, localId, trameId]);
  return id;
}
before(async () => {
  await migrateDatabase(db);
  await db.execAsync("PRAGMA foreign_keys=ON; INSERT INTO clients(id,nom) VALUES('client','Client témoin'); INSERT INTO sites(id,client_id,nom_site,adresse) VALUES('site','client','Site témoin','Adresse témoin'); INSERT INTO installations(id,site_id,type_code,nom) VALUES('local','site','chaufferie','Local A');");
});

test('RCU preserves historical general reserves without inventing a primary or secondary perimeter', async () => {
  const id = await newVisit('reseau_chaleur_v1');
  await db.runAsync(
    'INSERT INTO remarques(id,visite_id,poste,prestation,perimetre) VALUES(?,?,?,?,?)',
    [`remark-${++sequence}`, id, 'Sécurité incendie', 'Vérifier extincteurs', null]);
  await db.runAsync(
    'INSERT INTO remarques(id,visite_id,poste,prestation,perimetre) VALUES(?,?,?,?,?)',
    [`remark-${++sequence}`, id, 'Entretien P2', 'Nettoyer échangeur', 'Primaire']);
  const { wb } = await construireClasseur(id);
  assert.equal(wb.Sheets.REMARQUES.A4.v, 'Sécurité incendie');
  assert.equal(wb.Sheets.REMARQUES.B4.v, 'Vérifier extincteurs');
  assert.equal(wb.Sheets.REMARQUES.A5.v, 'Entretien P2');
  assert.equal(wb.Sheets['TRAME RÉSEAU DE CHALEUR'].C362.v, 'Nettoyer échangeur');
  assert.equal(wb.Sheets['TRAME RÉSEAU DE CHALEUR'].C366.v, 'Sans Objet.');
});

test('REMAR has its requested name, native panels and every workbook point', () => {
  validateLocalTrame(REMAR);
  assert.equal(REMAR.nom, 'TRAME REMAR');
  assert.equal(listerTramesDisponibles().find((t) => t.id === 'remar_v1').nom, 'TRAME REMAR');
  assert.equal(REMAR.excel.fieldMappings.length, 141);
  const sheet = workbook().Sheets[REMAR.excel.mainSheet];
  for (const m of REMAR.excel.fieldMappings) {
    const row = m.valueCell.match(/\d+$/)[0];
    assert.equal(String(sheet[`A${row}`].v).trim(), m.cle);
    const f = REMAR.ui.panels[m.panelId][m.section].find((f) => f.cle === m.cle);
    if (f.type === 'controle') for (const a of ['S','N.S','N.R','S.O','N.V']) assert.ok(f.presets[a][0].commentaire.includes(f.cle));
  }
  assert.deepEqual(REMAR.ui.specialPanels, ['p-equip', 'p-remarques', 'p-photos']);
});

test('all REMAR values survive serialized Excel export and native database import', async () => {
  const id = await newVisit(); let i = 0;
  for (const m of REMAR.excel.fieldMappings) {
    i++;
    if (m.type === 'champ') await db.runAsync('INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)', [id,m.sectionCode,m.cle,`Valeur ${i}`]);
    else await db.runAsync('INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)', [id,m.sectionCode,m.cle,'N.S',`Commentaire ${i}`]);
  }
  const { wb } = await construireClasseur(id);
  const output = roundtrip(wb);
  assert.equal(readTrameManifest(output).nom, 'TRAME REMAR');
  assert.equal(output.Sheets[REMAR.excel.mainSheet].B4.v, 'Valeur 4'); // Saved header remains the visit's value.
  const analysis = analyserClasseur(output, 'remar-complet.xlsx');
  assert.equal(analysis.trameId, 'remar_v1');
  assert.equal(analysis.champs.length + analysis.controles.length, 141);
  assert.equal(analysis.remarques.length, 0);
  const imported = await importerAnalyseExcel(analysis);
  assert.equal((await champs(imported.visiteId)).length, analysis.champs.length);
  assert.equal((await controls(imported.visiteId)).length, analysis.controles.length);
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk, true);
});

test('typed site building and dwelling counts survive ICPE export/import, legacy mixed cell unchanged', async () => {
  const id = await newVisit('icpe_v1');
  const section = 'infos.informations_g_n_rales';
  await db.runAsync('INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
    [id, section, 'Nombre de bâtiments', '2']);
  await db.runAsync('INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
    [id, section, 'Nombre de logements', '8']);
  await db.runAsync('INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
    [id, section, 'Nbr de bât / lgt', '8']);
  const { wb } = await construireClasseur(id);
  assert.ok(wb.Sheets.DONNEES_SITE_METRA, 'typed counts require their own reversible annex');
  assert.equal(wb.Sheets.DONNEES_SITE_METRA.B2.v, '2');
  assert.equal(wb.Sheets.DONNEES_SITE_METRA.B3.v, '8');
  assert.equal(wb.Sheets['TRAME ICPE'].C16.v, '8', 'legacy mixed field is not reinterpreted');
  const analysis = analyserClasseur(roundtrip(wb), 'icpe-nombres-distincts.xlsx');
  const values = Object.fromEntries(analysis.champs.filter((row) =>
    ['Nombre de bâtiments','Nombre de logements'].includes(row.cle)).map((row) => [row.cle,row.valeur]));
  assert.deepEqual(values, {'Nombre de bâtiments':'2','Nombre de logements':'8'});
  const imported = await importerAnalyseExcel(analysis);
  const restored = await db.getAllAsync(
    "SELECT cle,valeur FROM champs_visite WHERE visite_id=? AND cle IN ('Nombre de bâtiments','Nombre de logements')",
    [imported.visiteId]);
  assert.deepEqual(Object.fromEntries(restored.map((row) => [row.cle,row.valeur])), values);
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk, true);
});

test('multipoint curve and weekday schedule survive spreadsheet export and import without legacy overwrite', async () => {
  const model = await import('../networkProgramming.js');
  assert.deepEqual(model.pointsFromLegacy('-15\n-7\n0', '75\n65\n52'),
    [{ext:'-15',dep:'75'},{ext:'-7',dep:'65'},{ext:'0',dep:'52'}]);
  assert.throws(() => model.validateNetworkPoints([{ext:'3',dep:'55'},{ext:'3',dep:'56'}]), /même température/);
  const id = await newVisit();
  const reseauId = 'regulation-structuree-test';
  await db.runAsync("INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,consigne_programme_horaire) VALUES(?,?,1,'Radiateurs','7','62','1.4','Ancien programme libre')", [reseauId,id]);
  const points = [{ext:'-12',dep:'78'},{ext:'0',dep:'55'},{ext:'15',dep:'32'}];
  const schedule = model.emptyWeeklySchedule();
  schedule.allDays = true;
  schedule.days.Lun = [{start:'06:00',end:'22:00',comfort:'20',reduced:'16'}];
  for(const [key,value] of [[model.NETWORK_POINTS_KEY,points],[model.NETWORK_SCHEDULE_KEY,schedule]]) {
    await db.runAsync("INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,'reseau',?,?,?,'json')",
      ['attr-'+key,reseauId,key,JSON.stringify(value)]);
  }
  const { wb } = await construireClasseur(id);
  assert.equal(wb.Sheets.RESEAUX_DETAIL.C2.v,'-12\n0\n15');
  assert.equal(wb.Sheets.RESEAUX_DETAIL.D2.v,'78\n55\n32');
  assert.match(wb.Sheets.RESEAUX_DETAIL.G2.v,/Tous les jours/);
  assert.equal(wb.Sheets.PROGRAMMATION_RESEAUX.C2.v,JSON.stringify(points));
  const restored=analyserClasseur(roundtrip(wb),'regulation-structuree.xlsx');
  assert.equal(restored.reseaux.length,1);
  assert.deepEqual(restored.reseaux[0].points,points);
  assert.equal(restored.reseaux[0].schedule.allDays,true);
  const imported=await importerAnalyseExcel(restored);
  const newNetwork=await db.getFirstAsync('SELECT id,courbe_de_chauffe FROM reseaux WHERE visite_id=?',[imported.visiteId]);
  assert.equal(newNetwork.courbe_de_chauffe,'1.4','legacy slope remains available');
  const attrs=await db.getAllAsync("SELECT cle,valeur FROM attributs_libres WHERE entite_type='reseau' AND entite_id=?", [newNetwork.id]);
  assert.equal(attrs.length,2,'both independent structured values remain linked to imported network');
  const parsed=Object.fromEntries(attrs.map(a=>[a.cle,JSON.parse(a.valeur)]));
  assert.deepEqual(parsed[model.NETWORK_POINTS_KEY],points);
  assert.equal(parsed[model.NETWORK_SCHEDULE_KEY].days.Dim[0].comfort,'20',
    'same daily schedule expands with no loss of day semantics');
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk,true);
});

test('REMAR exports and reimports dynamic network/meter annexes without losing original points', async () => {
  const id = await newVisit();
  await db.runAsync(`INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire)
    VALUES('remar-r1',?,1,'Circuit radiateurs','7','61','1.2','18','Confort 6h-22h')`, [id]);
  await db.runAsync(`INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe)
    VALUES('remar-r2',?,2,'Circuit plancher','7','38','0.7')`, [id]);
  await db.runAsync(`INSERT INTO compteurs(id,visite_id,label,valeur,unite,destination)
    VALUES('remar-c1',?,'Compteur gaz chaufferie','12545.6','m³','Compteur Gaz (m³)')`, [id]);
  await db.runAsync(`INSERT INTO compteurs(id,visite_id,label,valeur,unite,destination)
    VALUES('remar-c2',?,'Sous-compteur annexe','63.4','MWh','supplementaire')`, [id]);
  await db.runAsync(`INSERT INTO photos(id,visite_id,entite_key,uri,label)
    VALUES('remar-photo',?,'reseau||remar-r1','file:///test-photo.jpg','Photo circuit radiateurs')`, [id]);
  const { wb } = await construireClasseur(id);
  assert.ok(wb.Sheets['TRAME REMAR']);
  assert.equal(wb.Sheets['TRAME REMAR'].C25.v, 'Circuit radiateurs');
  assert.equal(wb.Sheets['TRAME REMAR'].C26.v, 'Circuit plancher');
  assert.equal(wb.Sheets['TRAME REMAR'].C101.v, 'Compteur gaz chaufferie : 12545.6 m³');
  assert.equal(wb.Sheets.RESEAUX_DETAIL.B2.v, 'Circuit radiateurs');
  assert.equal(wb.Sheets.RESEAUX_DETAIL.H2.v, 'Photo circuit radiateurs');
  assert.equal(wb.Sheets.RESEAUX_DETAIL.B3.v, 'Circuit plancher');
  assert.equal(wb.Sheets.COMPTEURS_DETAIL.A3.v, 'Sous-compteur annexe');
  const analysis = analyserClasseur(roundtrip(wb), 'remar-reseaux-compteurs.xlsx');
  assert.equal(analysis.reseaux.length, 2);
  assert.equal(analysis.reseaux[0].tDep, '61');
  assert.equal(analysis.compteurs.length, 2);
  assert.equal(analysis.compteurs[1].destination, 'supplementaire');
  const imported = await importerAnalyseExcel(analysis);
  assert.equal((await db.getAllAsync('SELECT * FROM reseaux WHERE visite_id=?', [imported.visiteId])).length, 2);
  assert.equal((await db.getAllAsync('SELECT * FROM compteurs WHERE visite_id=?', [imported.visiteId])).length, 2);
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk, true);
});

test('library edits create an immutable version and preserve old visits and mappings', async () => {
  const sourceId = await newVisit();
  let draft = editableTrameCopy(REMAR);
  draft = addTramePoint(draft, 'p-remar-vmc', 'Caisson', { cle: 'Vibrations moteur', type: 'controle', presets: { S: [{ commentaire: 'Absence de vibration anormale.' }] } });
  draft = changeTramePoint(draft, 'p-remar-vmc', 'Caisson', 'Vibrations moteur', { cle: 'Vibrations du moteur' });
  draft = removeTramePoint(draft, 'p-conf-local', 'Conformité Local', 'BAES');
  const saved = await saveLocalTrame(draft);
  assert.notEqual(saved.id, REMAR.id);
  assert.equal(obtenirTrame((await visite(sourceId)).trame_id).excel.fieldMappings.length, 141);
  assert.ok(saved.ui.panels['p-remar-vmc'].Caisson.some((f) => f.cle === 'Vibrations du moteur'));
  assert.ok(!saved.ui.panels['p-conf-local']['Conformité Local'].some((f) => f.cle === 'BAES'));
  const id = await newVisit(saved.id);
  const mapping = saved.excel.fieldMappings.find((m) => m.cle === 'Vibrations du moteur');
  await db.runAsync('INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)', [id,mapping.sectionCode,mapping.cle,'S','Absence de vibration anormale.']);
  const out = roundtrip((await construireClasseur(id)).wb);
  assert.equal(out.Sheets[saved.excel.mainSheet][mapping.commentCell].v, 'Absence de vibration anormale.');
  const restored = readTrameManifest(out);
  assert.equal(restored.id, saved.id);
  assert.equal(analyserClasseur(out, 'edition.xlsx').trameId, saved.id);
  assert.deepEqual(await loadLocalTrames(), []);
});

test('trame packages transfer editable definitions and reject broken or conflicting mappings', () => {
  assert.equal(importTramePackage(exportTramePackage(REMAR)).nom, 'TRAME REMAR');
  const broken = editableTrameCopy(REMAR);
  broken.excel.fieldMappings[1].valueCell = broken.excel.fieldMappings[0].valueCell;
  assert.throws(() => validateLocalTrame(broken), /Cellule Excel/);
  assert.throws(() => importTramePackage('{"format":"javascript"}'), /Format/);
  assert.throws(() => removeTramePoint(REMAR,'p-infos','Général','Nom du site'), /en-tête/);
});

test('Excel model integration detects sections and clears previous observations', () => {
  const wb = workbook();
  wb.Sheets[REMAR.excel.mainSheet].B36 = { t: 's', v: 'S' };
  wb.Sheets[REMAR.excel.mainSheet].C101 = { t: 'n', v: 999999 };
  const draft = draftTrameFromWorkbook(wb);
  assert.equal(draft.nom, 'TRAME REMAR');
  assert.equal(draft.excel.fieldMappings.length, 141);
  const clean = XLSX.read(draft.excel.templateBase64, { type: 'base64' }).Sheets[REMAR.excel.mainSheet];
  assert.equal(clean.B36, undefined);
  assert.equal(clean.C101, undefined);
  assert.ok(Object.values(draft.ui.panels).some((s) => Object.keys(s).includes('Conformité ECS')));
});

test('prefill uses real context and the same-local semantic mesh without fabricated defaults', async () => {
  await db.runAsync("INSERT INTO installations(id,site_id,type_code,nom) VALUES('fresh-local','site','chaufferie','Local A')");
  const id = await newVisit('remar_v1', 'fresh-local');
  await preremplirVisiteDepuisContexte(db, id);
  const values = new Map((await champs(id)).map((r) => [`${r.section_code}||${r.cle}`, r.valeur]));
  assert.equal(values.get('infos.g_n_ral||Nom du client'), 'Client témoin');
  assert.equal(values.get('infos.g_n_ral||Nom du local'), 'Local A');
  assert.equal(values.get('infos.g_n_ral||Trame utilisée'), 'TRAME REMAR');
  assert.equal(values.get('infos.informations_g_n_rales||Date de visite'), '2026-10-26');
  assert.equal(values.get('distrib.distribution_chauffage||Matériaux tuyauterie'), undefined);
  const index = construireIndexSemantiqueTrame(REMAR);
  assert.equal(index.byStorage.get('remar-releves.temp_rature_chaufferie||Chauffage aller (°C)').semanticKey, 'mesure.chauffage.depart');
});

test('hiding a family does not delete its historical definitions or observations', async () => {
  const current = listerTramesDisponibles().find((t) => (t.familyId || t.id) === REMAR.id);
  const saved = await setLocalTrameActive(current, false);
  assert.ok(!listerTramesDisponibles().some((t) => (t.familyId || t.id) === REMAR.id));
  assert.equal(obtenirTrame(current.id).id, current.id);
  await setLocalTrameActive(saved, true);
  assert.ok(listerTramesDisponibles().some((t) => (t.familyId || t.id) === REMAR.id));
  assert.ok((await db.getAllAsync('SELECT * FROM visites')).length);
});

test('previous built-in trames retain their own Excel identities', async () => {
  for (const trameId of ['icpe_v1', 'vmc', 'pre_allumage', 'reseau_chaleur_v1']) {
    const trame = obtenirTrame(trameId);
    const id = await newVisit(trameId);
    const wb = (await construireClasseur(id)).wb;
    assert.ok(wb.Sheets[trame.excel.mainSheet]);
    assert.equal(wb.Sheets.METRA_TRAME, undefined);
  }
});

test('copies of every original trame have valid noncolliding generic mappings', () => {
  for (const id of ['icpe_v1', 'vmc', 'reseau_chaleur_v1', 'pre_allumage']) {
    const original = obtenirTrame(id);
    const draft = editableTrameCopy(original);
    validateLocalTrame(draft);
    assert.notEqual(draft.familyId, original.id);
    assert.deepEqual(draft.ui.specialPanels, ['p-equip', 'p-remarques', 'p-photos']);
    assert.equal(obtenirTrame(id).id, id);
  }
});

test('malformed point choices are rejected before entering the runtime registry', () => {
  const draft = editableTrameCopy(REMAR);
  const control = draft.ui.panels['p-conf-local']['Conformité Local'][0];
  control.presets.S = 'not a list';
  assert.throws(() => validateLocalTrame(draft), /Commentaires/);
  delete control.presets;
  control.cle = { value: 'invalid label' };
  assert.throws(() => validateLocalTrame(draft), /Point/);
});

test('library reload restores exact historical versions from the same SQLite backup', async () => {
  const saved = await saveLocalTrame(editableTrameCopy(REMAR));
  const id = await newVisit(saved.id);
  const { clearLocalTrames } = await import('../trameRegistry.js');
  clearLocalTrames();
  assert.throws(() => obtenirTrame(saved.id), /Modèle/);
  assert.deepEqual(await loadLocalTrames(), []);
  assert.equal(obtenirTrame((await visite(id)).trame_id).id, saved.id);
  assert.equal((await verifyDatabaseIntegrity(db)).integrityOk, true);
});

test('renaming a section preserves semantic links and updates the Excel heading', () => {
  const draft = editableTrameCopy(REMAR);
  const source = construireIndexSemantiqueTrame(draft);
  const renamed = renameTrameSection(draft, 'p-conf-local', 'Conformité Local', 'Sécurité du local');
  validateLocalTrame(renamed);
  const after = construireIndexSemantiqueTrame(renamed);
  const old = source.byStorage.get('conf-local.conformit_local||BAES');
  const current = after.byStorage.get('conf-local.s_curit_du_local||BAES');
  assert.equal(current.semanticKey, old.semanticKey);
  const wb = XLSX.read(renamed.excel.templateBase64, { type: 'base64' });
  assert.equal(wb.Sheets.TRAME_REMAR, undefined);
  assert.equal(wb.Sheets['TRAME REMAR'].A33.v, 'Sécurité du local');
});

test('the original REMAR CLASSIQUE workbook remains importable after the displayed rename', () => {
  const wb = workbook();
  wb.Sheets['TRAME REMAR CLASSIQUE'] = wb.Sheets['TRAME REMAR'];
  delete wb.Sheets['TRAME REMAR'];
  wb.SheetNames = wb.SheetNames.map((name) => name === 'TRAME REMAR' ? 'TRAME REMAR CLASSIQUE' : name);
  wb.Sheets['TRAME REMAR CLASSIQUE'].C101 = { t: 'n', v: 12.4 };
  const analysis = analyserClasseur(wb, 'ancien-modele.xlsx');
  assert.equal(analysis.trameNom, 'TRAME REMAR');
  assert.equal(analysis.champs.find((c) => c.cle === 'Compteur Gaz (m³)').valeur, '12.4');
});


test('REMAR exports and reimports multiple named meters in one unchanged Excel cell', async () => {
  const id = await newVisit();
  const mapping = REMAR.excel.fieldMappings.find((m) =>
    m.panelId === 'p-remar-releves' && m.cle === 'Compteur Gaz (m³)');
  assert.ok(mapping && /^C\d+$/.test(mapping.valueCell), 'official REMAR meter value cell exists');
  const records = [
    ['gaz-a', 'Gaz chaudière A', '12345,6'],
    ['gaz-b', 'Gaz chaudière B', '987'],
  ];
  for (const [meterId, label, valeur] of records) {
    await db.runAsync('INSERT INTO compteurs(id,visite_id,label,valeur,unite,destination) VALUES(?,?,?,?,?,?)',
      [meterId, id, label, valeur, 'm³', mapping.cle]);
  }
  await db.runAsync('INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)',
    [id, mapping.sectionCode, mapping.cle, 'VALEUR_HISTORIQUE_OBSOLETE']);
  const exported = roundtrip((await construireClasseur(id)).wb);
  const original = exported.Sheets[REMAR.excel.mainSheet][mapping.valueCell].v;
  assert.equal(original, 'Gaz chaudière A : 12345,6 m³\nGaz chaudière B : 987 m³');
  assert.equal((original.match(/\n/g) || []).length, 1);
  const analysed = analyserClasseur(exported, 'remar-compteurs-multi.xlsx');
  const readings = analysed.compteurs.filter((m) => m.destination === mapping.cle);
  assert.deepEqual(readings.map((r) => [r.label, r.valeur]),
    [['Gaz chaudière A', '12345,6'], ['Gaz chaudière B', '987']]);
  // Explicit local binding is required once prior tests created several
  // installations. Keep the production guard against an unsafe guess.
  const imported = await importerAnalyseExcel(analysed, { installationId: 'local' });
  const rows = await db.getAllAsync('SELECT label,valeur,destination FROM compteurs WHERE visite_id=? AND destination=? ORDER BY rowid',
    [imported.visiteId, mapping.cle]);
  assert.deepEqual(rows.map((r) => [r.label, r.valeur]),
    [['Gaz chaudière A', '12345,6'], ['Gaz chaudière B', '987']]);
  const roundtripped = (await construireClasseur(imported.visiteId)).wb;
  assert.equal(roundtripped.Sheets[REMAR.excel.mainSheet][mapping.valueCell].v, original);
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk, true);
});

test('REMAR Excel importer ignores blank lines and creates separate meters', () => {
  const wb = workbook();
  const mapping = REMAR.excel.fieldMappings.find((m) =>
    m.panelId === 'p-remar-releves' && m.cle === "Compteur d'énergie (MWh)");
  assert.ok(mapping);
  wb.Sheets[REMAR.excel.mainSheet][mapping.valueCell] = { t: 's', v: 'Énergie A : 52,3 MWh\n\n\nÉnergie B : 100 MWh' };
  const analysed = analyserClasseur(roundtrip(wb), 'remar-comptage-ancienne-visite.xlsx');
  const readings = analysed.compteurs.filter((m) => m.destination === mapping.cle);
  assert.equal(readings.length, 2);
  assert.deepEqual(readings.map((m) => [m.label, m.valeur, m.unite]),
    [['Énergie A', '52,3', 'MWh'], ['Énergie B', '100', 'MWh']]);
});


test('REMAR_DETAIL restitue 2 CTA, filtres, mesures, VMC, froid et temperatures sans perdre le contexte', async () => {
  const localId='remar-detail-audit-local';
  await db.runAsync(
    "INSERT INTO installations(id,site_id,type_code,nom,actif) VALUES(?,'site','chaufferie','Audit multi CTA',1)",
    [localId]);
  const source=await newVisit('remar_v1',localId);
  const equip=[
    ['audit-cta-1','CTA','CTA des bureaux'],['audit-cta-2','CTA','CTA gymnase'],
    ['audit-vmc','VMC','Caisson VMC toiture'],['audit-cold','Froid','Production froid local'],
  ];
  for(const [id,type,nom] of equip){
    await db.runAsync(
      "INSERT INTO equipements(id,installation_id,type_code,designation,statut) VALUES(?,?,?,?,'actif')",
      [id,localId,type,nom]);
    await db.runAsync(
      'INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1)',
      [id,'remar_v1']);
    await db.runAsync(
      "INSERT INTO materiel(id,visite_id,equipement_id,categorie,nombre,designation,etat) VALUES(?,?,?,?,?,?,?)",
      ['mat-'+id,source,id,type,'1',nom,'Bon']);
  }
  const items=[
    ['audit-filtre-a','filtre_cta','audit-cta-1','Filtre bureaux G4',''],
    ['audit-filtre-b','filtre_cta','audit-cta-2','Filtre gymnase F7',''],
    ['audit-mesure-a','mesure_cta','audit-cta-1','Air neuf','°C'],
    ['audit-mesure-b','mesure_cta','audit-cta-2','Soufflage','°C'],
    ['audit-froid-res','reseau_froid','audit-cold','Réseau glacé',''],
    ['audit-t-chaud','temperature_chaufferie',null,'Chauffage aller (°C)','°C'],
  ];
  for(const [id,type,parent,nom,unite] of items){
    await db.runAsync(
      'INSERT INTO remar_items(id,installation_id,parent_equipement_id,type_code,nom,unite,ordre) VALUES(?,?,?,?,?,?,?)',
      [id,localId,parent,type,nom,unite||null,1]);
    await db.runAsync('INSERT INTO remar_item_visits(visite_id,item_id) VALUES(?,?)',[source,id]);
  }
  const record=async(ownerType,ownerId,panel,section,cle,valeur,avis,commentaire,origin=null)=>{
    await db.runAsync(
      'INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,source_visite_id,confirme_le) '+
      "VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IS NULL THEN datetime('now') ELSE NULL END)",
      [source,ownerType,ownerId,panel,section,cle,valeur,avis,commentaire,origin,origin]);
  };
  await record('equipement','audit-cta-1','p-remar-cta','Informations techniques','Année CTA','2019',null,null);
  await record('equipement','audit-cta-2','p-remar-cta','Informations techniques','Année CTA','2025',null,null);
  await record('equipement','audit-vmc','p-remar-vmc','Caisson','Etat du caisson',null,'N.S','Courroie usée observée sur la toiture.');
  await record('equipement','audit-cold','p-remar-froid','Informations du site','Production froid','Groupe eau glacée',null,null);
  await record('item','audit-filtre-a','p-remar-filtres','filtre_cta','Classe de filtration','G4',null,null);
  await record('item','audit-filtre-b','p-remar-filtres','filtre_cta','Classe de filtration','F7',null,null);
  await record('item','audit-filtre-b','p-remar-filtres','filtre_cta','Etat du filtre',null,'S','Filtre propre et installé.');
  await record('item','audit-mesure-a','p-remar-cta-mesures','mesure_cta','Valeur','12,5',null,null);
  await record('item','audit-mesure-b','p-remar-cta-mesures','mesure_cta','Valeur','19,2',null,null);
  await record('item','audit-t-chaud','p-remar-releves','temperature_chaufferie','Valeur','58',null,null,'visite-historique-externe');
  await record('item','audit-froid-res','p-remar-froid','reseau_froid','Valeur','4 bar',null,null);

  await db.runAsync('INSERT INTO remar_report_focus(visite_id,famille,equipement_id) VALUES(?,?,?)',
    [source,'cta','audit-cta-1']);
  const sourceBook=roundtrip((await construireClasseur(source)).wb);
  assert.equal(sourceBook.Sheets['TRAME REMAR'].C133.v,'2019');
  assert.ok(sourceBook.Sheets.REMAR_DETAIL,'independent CTA/VMC/froid captured in detail sheet');
  assert.ok(sourceBook.Sheets.REMAR_AVERTISSEMENTS,'lossy V1 detected rather than silently flattened');
  const detailRows=XLSX.utils.sheet_to_json(sourceBook.Sheets.REMAR_DETAIL,{header:1,defval:''});
  assert.equal(detailRows[0][14],'Unité');
  assert.ok(detailRows.some(row=>row[3]==='CTA gymnase'&&row[8]==='Année CTA'&&row[9]==='2025'));
  assert.ok(detailRows.some(row=>row[3]==='Air neuf'&&row[14]==='°C'));
  const parsed=analyserClasseur(sourceBook,'remar-audit-toutes-instances.xlsx');
  assert.ok(parsed.remarDetail.length >= 14);
  const imported=await importerAnalyseExcel(parsed,{installationId:localId});
  const restored=await db.getAllAsync(
    'SELECT rv.*, e.designation AS equipement FROM remar_values rv '+
    'LEFT JOIN equipements e ON rv.owner_type=\'equipement\' AND e.id=rv.owner_id WHERE rv.visite_id=?',
    [imported.visiteId]);
  assert.ok(restored.some(row=>row.equipement==='CTA gymnase'&&row.cle==='Année CTA'&&row.valeur==='2025'));
  assert.ok(restored.some(row=>row.equipement==='Caisson VMC toiture'&&row.avis==='N.S'&&row.commentaire.includes('Courroie')));
  assert.ok(restored.some(row=>row.cle==='Etat du filtre'&&row.avis==='S'));
  assert.ok(restored.some(row=>row.cle==='Valeur'&&row.valeur==='19,2'));
  assert.ok(restored.some(row=>row.cle==='Valeur'&&row.valeur==='58'&&row.confirme_le===null&&row.source_visite_id==='visite-historique-externe'));
  assert.equal((await db.getAllAsync("SELECT * FROM remar_items WHERE installation_id=? AND actif=1",[localId])).length,6,
    'no duplicate durable child definitions after import');
  const reexport=roundtrip((await construireClasseur(imported.visiteId)).wb);
  assert.ok(reexport.Sheets.REMAR_DETAIL,'all dynamic records remain in the second export');
  const second=XLSX.utils.sheet_to_json(reexport.Sheets.REMAR_DETAIL,{header:1,defval:''});
  assert.ok(second.some(row=>row[3]==='CTA gymnase'&&row[8]==='Année CTA'&&row[9]==='2025'));
  assert.ok(second.some(row=>row[3]==='Chauffage aller (°C)'&&row[13]==='Historique à confirmer'));
  assert.equal((await verifyDatabaseIntegrity(db)).foreignKeysOk,true);

  const invalid=roundtrip(sourceBook);
  const records=XLSX.utils.sheet_to_json(invalid.Sheets.REMAR_DETAIL,{header:1,defval:''});
  const contradict=[...records.find(row=>row[3]==='CTA gymnase'&&row[8]==='Année CTA')];
  contradict[9]='1900';
  records.push(contradict);
  invalid.Sheets.REMAR_DETAIL=XLSX.utils.aoa_to_sheet(records);
  assert.throws(()=>analyserClasseur(invalid,'remar-corrompu.xlsx'),/doublon contradictoire/,
    'a contradicting second record with same stable identity is rejected before import');
});
