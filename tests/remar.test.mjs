import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import XLSX from 'xlsx';
import { TRAME_REMAR_CROUS } from '../remarData.js';
import { TEMPLATE_REMAR_BASE64 } from '../templateExcelRemar.js';
import { getTrameData, getTrameLabel, getTabOrder, getExcelLayout, findExcelRow, normalizeTrameCode } from '../trames.js';
import { getVisitTrameData, sectionCodeFor } from '../visitFields.js';

// Exercise the production repository against real SQL, replacing only native device APIs.
const sql = new DatabaseSync(':memory:');
const adapter = {
  async execAsync(statement) { sql.exec(statement); },
  async runAsync(statement, params = []) {
    const r = sql.prepare(statement).run(...params);
    return { changes: r.changes, lastInsertRowId: r.lastInsertRowid };
  },
  async getAllAsync(statement, params = []) { return sql.prepare(statement).all(...params); },
  async getFirstAsync(statement, params = []) { return sql.prepare(statement).get(...params) || null; },
  async withTransactionAsync(fn) {
    sql.exec('BEGIN');
    try { await fn(); sql.exec('COMMIT'); }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  },
};
mock.module('expo-sqlite', { namedExports: { openDatabaseAsync: async () => adapter } });
mock.module('expo-file-system', { namedExports: { cacheDirectory: '/tmp/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async () => {}, readAsStringAsync: async () => '' } });
mock.module('expo-sharing', { namedExports: { isAvailableAsync: async () => false } });
mock.module('expo-document-picker', { namedExports: { getDocumentAsync: async () => ({ canceled: true }) } });
const db = await import('../db.js');
const { getVisitFieldOverrides, saveVisitFieldOverride } = await import('../visitCustomization.js');
const { construireClasseur } = await import('../excelExport.js');
const { analyserClasseur, importerAnalyseExcel } = await import('../excelImport.js');
let siteId;
before(async () => {
  await db.getDb();
  siteId = (await adapter.getFirstAsync('SELECT id FROM sites LIMIT 1')).id;
});
const create = () => db.creerVisite({ siteId, technicien: 'Test', trameCode: 'REMAR_CROUS' });
const workbook = () => XLSX.read(TEMPLATE_REMAR_BASE64, { type: 'base64', cellStyles: true });

test('all REMAR points map to the actual workbook, including repeated labels', () => {
  const sheet = workbook().Sheets['TRAME REMAR CLASSIQUE'];
  const rows = new Set();
  for (const [panel, sections] of Object.entries(TRAME_REMAR_CROUS)) {
    assert.ok(getTabOrder('REMAR_CROUS').includes(panel));
    for (const [section, fields] of Object.entries(sections)) for (const f of fields) {
      const row = findExcelRow(sheet, 'REMAR_CROUS', panel, section, f.cle);
      assert.ok(row, `${panel}/${section}/${f.cle}`);
      assert.equal(String(sheet[`A${row}`].v).trim(), f.cle);
      assert.ok(!rows.has(row)); rows.add(row);
    }
  }
  assert.equal(rows.size, 137);
  assert.equal(normalizeTrameCode('REMAR CLASSIQUE'), 'REMAR_CROUS');
  assert.equal(getTrameLabel('REMAR_CROUS'), 'REMAR · CROUS');
  assert.equal(getExcelLayout('ICPE').sheetName, 'TRAME ICPE');
  assert.equal(getExcelLayout('RESEAU_CHALEUR').sheetName, 'TRAME RÉSEAU DE CHALEUR');
  assert.equal(getTrameData('unknown'), getTrameData('ICPE'));
});

test('the supplied blank model is recognized as REMAR rather than ICPE', () => {
  const analysis = analyserClasseur(workbook(), 'Trame_REMAR_CROUS.xlsx');
  assert.equal(analysis.trameCode, 'REMAR_CROUS');
  assert.equal(analysis.champs.length, 0);
  assert.equal(analysis.controles.length, 0);
});

test('database migration is repeatable and preserves existing visits', async () => {
  const { migrateDatabase, verifyDatabaseIntegrity } = await import('../database/migrate.js');
  const visit = await create();
  await migrateDatabase(adapter);
  assert.ok(await db.getVisite(visit));
  assert.equal((await adapter.getFirstAsync('SELECT count(*) AS n FROM schema_migrations')).n, 9);
  assert.equal((await verifyDatabaseIntegrity(adapter)).integrityOk, true);
});

test('export and import preserve every default information and control', async () => {
  const id = await create();
  let i = 0;
  for (const [panel, sections] of Object.entries(TRAME_REMAR_CROUS)) {
    for (const [section, fields] of Object.entries(sections)) for (const f of fields) {
      const code = sectionCodeFor(panel, section); i++;
      if (f.type === 'champ') await db.upsertChamp(id, code, f.cle, `Mesure ${i}`);
      else await db.upsertControle(id, code, f.cle, { avis: 'N.S', commentaire: `Observation ${i}` });
    }
  }
  await db.upsertNote(id, 'Note après visite');
  const { wb } = await construireClasseur(id);
  // Serialize and read, so !ref errors cannot hide from the test.
  const readback = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const analysis = analyserClasseur(readback, 'REMAR-rempli.xlsx');
  assert.equal(analysis.trameCode, 'REMAR_CROUS');
  assert.equal(analysis.champs.length + analysis.controles.length, 137);
  assert.equal(analysis.note, 'Note après visite');
  assert.equal(readback.Sheets['TRAME REMAR CLASSIQUE'].B4.v, 'REMAR CLASSIQUE');
  assert.equal(readback.Sheets['TRAME REMAR CLASSIQUE']['!merges'].length, workbook().Sheets['TRAME REMAR CLASSIQUE']['!merges'].length);
  for (const item of analysis.champs) assert.match(item.valeur, /^Mesure /);
  for (const item of analysis.controles) { assert.equal(item.avis, 'N.S'); assert.match(item.commentaire, /^Observation /); }
  const imported = await importerAnalyseExcel(analysis);
  assert.equal(Object.keys(await db.getChampsVisite(imported.visiteId)).length, analysis.champs.length);
  assert.equal(Object.keys(await db.getControlesVisite(imported.visiteId)).length, analysis.controles.length);
});

test('added and removed points survive export/import and can be restored', async () => {
  const id = await create();
  const custom = { panel_id: 'p-remar-vmc', section: 'Caisson', cle: 'Vibrations moteur', type: 'controle' };
  const removed = { panel_id: 'p-conf-local', section: 'Conformité Local', cle: 'BAES', type: 'controle' };
  await saveVisitFieldOverride(id, { ...custom, masque: 0 });
  await db.upsertControle(id, sectionCodeFor(custom.panel_id, custom.section), custom.cle, { avis: 'N.S', commentaire: 'Vibrations à corriger' });
  await db.upsertControle(id, sectionCodeFor(removed.panel_id, removed.section), removed.cle, { avis: 'S', commentaire: 'Bon état' });
  await saveVisitFieldOverride(id, { ...removed, masque: 1 });
  const overrides = await getVisitFieldOverrides(id);
  const visible = getVisitTrameData('REMAR_CROUS', overrides);
  assert.ok(visible[custom.panel_id][custom.section].some((f) => f.cle === custom.cle));
  assert.ok(!visible[removed.panel_id][removed.section].some((f) => f.cle === removed.cle));
  const { wb } = await construireClasseur(id);
  assert.equal(wb.Sheets['TRAME REMAR CLASSIQUE'].B39?.v ?? '', '');
  assert.ok(wb.Sheets.PERSONNALISATION);
  const analysis = analyserClasseur(XLSX.read(XLSX.write(wb, { type: 'buffer' }), { type: 'buffer' }), 'personnalisation.xlsx');
  const imported = await importerAnalyseExcel(analysis);
  const importedOverrides = await getVisitFieldOverrides(imported.visiteId);
  assert.equal(importedOverrides.length, 2);
  assert.equal(importedOverrides.find((r) => r.cle === 'BAES').masque, 1);
  const saved = await db.getControlesVisite(imported.visiteId);
  assert.equal(saved[`${sectionCodeFor(custom.panel_id, custom.section)}||${custom.cle}`].commentaire, 'Vibrations à corriger');
  assert.equal(saved[`${sectionCodeFor(removed.panel_id, removed.section)}||BAES`].avis, 'S');
  await saveVisitFieldOverride(imported.visiteId, { ...removed, masque: 0 });
  assert.ok(getVisitTrameData('REMAR_CROUS', await getVisitFieldOverrides(imported.visiteId))[removed.panel_id][removed.section].some((f) => f.cle === 'BAES'));
});

test('customization validates sections and preserves the original field type', async () => {
  const id = await create();
  await assert.rejects(saveVisitFieldOverride(id, { panel_id: 'bad', section: 'bad', cle: 'X', type: 'champ' }));
  await assert.rejects(saveVisitFieldOverride(id, { panel_id: 'p-conf-local', section: 'Conformité Local', cle: 'BAES', type: 'champ' }));
});

test('express visits retain REMAR customization without changing the source', async () => {
  const localSite = db.uuidv4();
  const client = (await adapter.getFirstAsync('SELECT id FROM clients LIMIT 1')).id;
  await adapter.runAsync('INSERT INTO sites (id, client_id, nom_site) VALUES (?, ?, ?)', [localSite, client, 'Site Express REMAR']);
  const id = await db.creerVisite({ siteId: localSite, trameCode: 'REMAR_CROUS' });
  const f = { panel_id: 'p-remar-froid', section: 'Réseaux', cle: 'Température réseau froid (°C)', type: 'champ', masque: 0 };
  await saveVisitFieldOverride(id, f);
  await db.upsertChamp(id, sectionCodeFor(f.panel_id, f.section), f.cle, '7');
  await db.upsertChamp(id, 'remar-releves.compteur', 'Compteur Gaz (m³)', '4500');
  await db.upsertChamp(id, 'remar-cta-mesures.temp_ratures', 'Air neuf', '11');
  const express = await db.creerVisite({ siteId: localSite, mode: 'express' });
  const expressFields = await db.getChampsVisite(express);
  assert.equal(expressFields['remar-releves.compteur||Compteur Gaz (m³)'], undefined);
  assert.equal(expressFields['remar-cta-mesures.temp_ratures||Air neuf'], undefined);
  assert.equal(expressFields['infos.informations_du_site||Date de visite'], (await db.getVisite(express)).date_visite);
  assert.equal((await db.getVisite(express)).trame_code, 'REMAR_CROUS');
  assert.equal((await getVisitFieldOverrides(express)).length, 1);
  await saveVisitFieldOverride(express, { ...f, masque: 1 });
  assert.equal((await getVisitFieldOverrides(id))[0].masque, 0);
});

test('deleted visits remove their customization without orphan rows', async () => {
  const id = await create();
  await saveVisitFieldOverride(id, { panel_id: 'p-remar-froid', section: 'Réseaux', cle: 'Test', type: 'champ' });
  await db.supprimerVisite(id);
  assert.equal((await getVisitFieldOverrides(id)).length, 0);
  assert.equal((await adapter.getAllAsync('PRAGMA foreign_key_check')).length, 0);
});

test('equipment and reserve columns from the original model survive a real round trip', async () => {
  const wb = workbook();
  const material = ['Pompe', '2', 'Pompe double', 'P-42', 'Réseau nord', 'Grundfos', 'MAGNA3', '230 V / 120 W', '2020', 'À surveiller'];
  XLSX.utils.sheet_add_aoa(wb.Sheets.MATERIEL, [material, material.map((v, i) => i === 3 ? 'P-43' : v)], { origin: 'A4' });
  XLSX.utils.sheet_add_aoa(wb.Sheets.REMARQUES, [['P2', 'Contrôler la pompe', '2026-10-26', 3, 'À programmer', 1250]], { origin: 'A4' });
  const analysis = analyserClasseur(wb, 'materiel-remar.xlsx');
  // Separate site so permanent equipment from other fixtures cannot interfere.
  analysis.site = 'Site matériel REMAR';
  const { visiteId } = await importerAnalyseExcel(analysis);
  const items = await db.listerMateriel(visiteId);
  assert.equal(items.length, 2);
  assert.notEqual(items[0].equipement_id, items[1].equipement_id);
  await db.upsertMaterielChamp(items[0].id, 'caracteristiques', '400 V / 200 W');
  const output = (await construireClasseur(visiteId)).wb;
  const serialized = XLSX.read(XLSX.write(output, { type: 'buffer' }), { type: 'buffer' });
  const after = analyserClasseur(serialized, 'materiel-remar-export.xlsx');
  assert.equal(after.materiel.length, 2);
  assert.equal(after.materiel[0].nombre, '2');
  assert.equal(after.materiel[0].numero, 'P-42');
  assert.equal(after.materiel[0].reseau, 'Réseau nord');
  assert.equal(after.materiel[0].caracteristiques, '400 V / 200 W');
  assert.equal(after.remarques[0].dateReserve, '2026-10-26');
  assert.equal(after.remarques[0].etatAvancement, 'À programmer');
  assert.equal(after.remarques[0].estimatif, '1250');
  const expressId = await db.creerVisite({ siteId: (await db.getVisite(visiteId)).site_id, mode: 'express' });
  const expressItems = await db.listerMateriel(expressId);
  assert.equal(expressItems[0].numero_materiel, 'P-42');
  assert.equal((await db.listerRemarques(expressId))[0].etat_avancement, 'À programmer');
});

test('progress ignores retired points and counts newly added points', async () => {
  const id = await create();
  // Fill all active points; the original template has no implicit answered controls.
  for (const [panel, sections] of Object.entries(TRAME_REMAR_CROUS)) {
    for (const [section, fields] of Object.entries(sections)) for (const f of fields) {
      if (f.type === 'champ') await db.upsertChamp(id, sectionCodeFor(panel, section), f.cle, 'Renseigné');
      else await db.upsertControle(id, sectionCodeFor(panel, section), f.cle, { avis: 'S' });
    }
  }
  assert.equal((await db.getVisite(id)).progression_pct, 100);
  const f = { panel_id: 'p-remar-vmc', section: 'Caisson', cle: 'Nouveau contrôle', type: 'controle' };
  await saveVisitFieldOverride(id, f);
  assert.equal((await db.getVisite(id)).progression_pct, 99);
  await saveVisitFieldOverride(id, { ...f, masque: 1 });
  assert.equal((await db.getVisite(id)).progression_pct, 100);
  await saveVisitFieldOverride(id, { ...f, masque: 0 });
  assert.equal((await db.getVisite(id)).progression_pct, 99);
});

test('ICPE and district-heating exports still use their own templates', async () => {
  for (const code of ['ICPE', 'RESEAU_CHALEUR']) {
    const id = await db.creerVisite({ siteId, trameCode: code });
    const { wb } = await construireClasseur(id);
    assert.ok(wb.Sheets[getExcelLayout(code).sheetName]);
    assert.equal(analyserClasseur(wb, `${code}.xlsx`).trameCode, code);
  }
});

test('upgrade from schema 8 preserves existing visit observations', async () => {
  const { MIGRATIONS } = await import('../database/migrations/index.js');
  const old = new DatabaseSync(':memory:');
  old.exec('PRAGMA foreign_keys=ON');
  for (const migration of MIGRATIONS.slice(0, 8)) old.exec(migration.sql);
  old.exec("INSERT INTO clients (id, nom) VALUES ('client', 'Client historique')");
  old.exec("INSERT INTO sites (id, client_id, nom_site) VALUES ('site', 'client', 'Site historique')");
  old.exec("INSERT INTO visites (id, site_id, trame_code) VALUES ('visite', 'site', 'ICPE')");
  old.exec("INSERT INTO champs_visite (visite_id, section_code, cle, valeur) VALUES ('visite', 'infos.test', 'Ancienne valeur', 'Conservée')");
  old.exec(MIGRATIONS[8].sql);
  assert.equal(old.prepare('SELECT valeur FROM champs_visite').get().valeur, 'Conservée');
  assert.equal(old.prepare('SELECT trame_code FROM visites').get().trame_code, 'ICPE');
  assert.ok(old.prepare('PRAGMA table_info(materiel)').all().some((c) => c.name === 'numero_materiel'));
  assert.equal(old.prepare('PRAGMA foreign_key_check').all().length, 0);
  old.close();
});
