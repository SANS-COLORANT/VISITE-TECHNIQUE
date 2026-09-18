const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Contrat Missions manquant: ${label} (${needle})`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Contrat Missions violé: ${label} (${needle})`);
};

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migration40 = read('database/migrations/040_missions_core.js');
const migration41 = read('database/migrations/041_missions_architecture.js');
const settings = read('featureSettings.js');
const lab = read('LabMetraPanel.js');
const settingsScreen = read('visual-packs/runtime/VisualPacksSettingsScreen.js');
const home = read('HomeScreen.js');
const missionsHome = read('MissionsHomeScreen.js');
const app = read('App.js');
const theme = read('missionTheme.js');
const db = read('missionsDb.js');
const visit = read('MissionVisitScreen.js');
const exportFile = read('missionExcelExport.js');
const importFile = read('missionExcelImport.js');
const excelSchema = read('missionExcelSchema.js');

requireText(constants, 'DATABASE_SCHEMA_VERSION = 41', 'schema v41');
requireText(migrations, "import { migration040 } from './040_missions_core.js';", 'migration 040 registered');
requireText(migrations, 'migration039, migration040', 'migration ordering 39 -> 40');
requireText(migrations, 'migration041', 'migration 041 registered');
requireText(migration41, "name: 'missions_architecture_v2'", 'mission architecture v2');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_actions', 'mission actions');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_references', 'mission references');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_test_protocols', 'mission tests');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_scenarios', 'mission scenarios');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_geometries', 'mission geometries');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_import_rows', 'raw Excel preservation');
requireText(migration41, 'CREATE TABLE IF NOT EXISTS mission_report_sections', 'editable report sections');
requireText(migration40, "name: 'missions_core'", 'migration identity');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS missions', 'missions table');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS mission_points', 'mission points');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS mission_template_values', 'generic template values');
requireText(migration40, "status TEXT NOT NULL DEFAULT 'draft'", 'draft visit persistence');

for (const forbidden of ['api_remote_', 'remote_client_id', 'remote_site_id', 'api_structure_outbox']) {
  if (migration40.includes(forbidden) || migration41.includes(forbidden)) throw new Error(`Le schéma Missions ne doit pas dépendre de l'Intranet: ${forbidden}`);
}

requireText(settings, "key: 'missions'", 'missions feature flag');
requireText(settings, 'hiddenUntilUnlocked: true', 'missions hidden before unlock');
requireText(settings, "const LAB_MISSIONS_UNLOCKED_KEY = 'lab_missions_unlocked'", 'local unlock key');
requireText(settings, "if (!row) return false", 'LAB defaults to disabled');
requireText(settings, 'getMissionsLabUnlocked()', 'unlock guard');
requireText(lab, 'delayLongPress={2000}', '2 second LAB long press');
requireText(lab, 'setMissionsVisible(false)', 'unlock does not activate Missions');
requireText(settingsScreen, "import { LabMetraPanel } from '../../LabMetraPanel.js';", 'LAB embedded in Settings');
requireText(settingsScreen, '<LabMetraPanel />', 'LAB rendered only inside Settings');
forbidText(home, 'LAB METRA', 'LAB must not be visible on home');
forbidText(home, "navigation.navigate('LabMetra')", 'home must not route to LAB');
requireText(home, 'PanResponder.create', 'home swipe responder');
requireText(home, "navigation.navigate('Missions', { enteredBySwipe: true })", 'right swipe opens Missions');
requireText(missionsHome, 'Piloter les dossiers ponctuels', 'mission-specific dashboard');
requireText(missionsHome, 'technicalVisitSwipeResponder', 'reverse swipe from Missions');
requireText(theme, "accent: '#2F7D58'", 'dedicated green Missions palette');
requireText(app, 'getMissionsVisible()', 'runtime Missions flag');
requireText(app, "current.name === 'Missions' && missionsVisible", 'guarded Missions route');
requireText(app, 'function MissionHeader', 'dedicated Missions header');
forbidText(app, "name: 'LabMetra'", 'LAB must not have a standalone route');
requireText(db, "'draft'", 'draft mission creation');
requireText(visit, 'Aucun champ de cette visite n’est obligatoire.', 'non-blocking field UX');
requireText(visit, 'Terminer sans tout remplir', 'incomplete visit completion');
requireText(visit, '>＋ Point<', 'free point creation');
requireText(exportFile, "'00_Meta'", 'versioned Excel workbook metadata');
requireText(exportFile, 'MISSION_EXCEL_SHEETS', 'complete Excel schema export');
requireText(importFile, 'choisirEtImporterMissionExcel', 'Excel import picker');
requireText(importFile, 'raw_external', 'arbitrary workbook preservation');
requireText(importFile, 'canonical_roundtrip', 'canonical Excel round-trip');
requireText(excelSchema, "['48_Lignes_Import_Brut', 'mission_import_rows']", 'all mission data exported');
requireText(excelSchema, 'MISSION_TABLE_IMPORT_ORDER', 'relational import ordering');
requireText(visit, 'MISSION_CAPTURE_MODES', 'Rapide Standard Expert modes');
requireText(visit, '📷 Photo', 'mission photo quick capture');
requireText(visit, '＋ Mesure', 'mission measurement quick capture');
forbidText(read('missionRecipes.js'), 'pre_allumage', 'Missions must not reuse recurring pre-allumage recipe points');
forbidText(read('missionRecipes.js'), 'vmc-c', 'Missions must not reuse recurring VMC recipe point identifiers');

console.log('Missions LAB contract validated: schema v41, Intranet isolation, non-blocking visits, mission-specific UX and complete Excel import/export round-trip.');
