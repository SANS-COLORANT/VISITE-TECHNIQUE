const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Contrat Missions manquant: ${label} (${needle})`);
};

const constants = read('database/constants.js');
const migrations = read('database/migrations/index.js');
const migration40 = read('database/migrations/040_missions_core.js');
const settings = read('featureSettings.js');
const lab = read('LabMetraPanel.js');
const home = read('HomeScreen.js');
const app = read('App.js');
const db = read('missionsDb.js');
const visit = read('MissionVisitScreen.js');
const exportFile = read('missionExcelExport.js');

requireText(constants, 'DATABASE_SCHEMA_VERSION = 40', 'schema v40');
requireText(migrations, "import { migration040 } from './040_missions_core.js';", 'migration 040 registered');
requireText(migrations, 'migration039, migration040', 'migration ordering 39 -> 40');
requireText(migration40, "name: 'missions_core'", 'migration identity');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS missions', 'missions table');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS mission_points', 'mission points');
requireText(migration40, 'CREATE TABLE IF NOT EXISTS mission_template_values', 'generic template values');

for (const forbidden of ['api_remote_', 'remote_client_id', 'remote_site_id', 'api_structure_outbox']) {
  if (migration40.includes(forbidden)) throw new Error(`Le schéma Missions ne doit pas dépendre de l'Intranet: ${forbidden}`);
}

requireText(settings, "key: 'missions'", 'missions feature flag');
requireText(settings, 'hiddenUntilUnlocked: true', 'missions hidden before unlock');
requireText(settings, "const LAB_MISSIONS_UNLOCKED_KEY = 'lab_missions_unlocked'", 'local unlock key');
requireText(settings, "if (!row) return false", 'LAB defaults to disabled');
requireText(settings, 'getMissionsLabUnlocked()', 'unlock guard');
requireText(lab, 'delayLongPress={2000}', '2 second LAB long press');
requireText(lab, 'setMissionsVisible(false)', 'unlock does not activate Missions');
requireText(home, 'delayLongPress={2000}', 'home LAB long press');
requireText(home, 'missionsEnabled ?', 'Missions entry hidden while disabled');
requireText(app, "getMissionsVisible()", 'runtime Missions flag');
requireText(app, "current.name === 'Missions' && missionsVisible", 'guarded Missions route');
requireText(db, "status: 'draft'", 'draft mission support');
requireText(db, "'draft'", 'draft persistence');
requireText(visit, 'Aucun champ de cette visite n’est obligatoire.', 'non-blocking field UX');
requireText(visit, 'Terminer sans tout remplir', 'incomplete visit completion');
requireText(visit, '＋ Point non prévu', 'free point creation');
requireText(exportFile, "'17_Valeurs_Trames'", 'structured template values export');
requireText(exportFile, "'14_Photos'", 'photo metadata export');

console.log('Missions LAB contract validated: opt-in, hidden unlock, Intranet isolation, incomplete visits, free points and structured Excel export.');
