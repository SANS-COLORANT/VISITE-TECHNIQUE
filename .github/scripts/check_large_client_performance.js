const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`${label}: forbidden regression ${needle}`);
}

const report = read('ReportScreen.js');
requireText(report, 'Tout sélectionner', 'report bulk selection');
requireText(report, 'Tout désélectionner', 'report bulk deselection');
requireText(report, 'chargerDonneesRapportParLots(ids,4)', 'report bounded preparation');
requireText(report, 'Choisir les photos et la couverture', 'report photo action');
if (report.indexOf('Choisir les photos et la couverture') > report.indexOf('{visites.map')) {
  throw new Error('report photo action must stay above the long site list');
}

const documents = read('ClientDocumentsScreen.js');
forbidText(documents, 'await initialiserArborescenceClient(clientId)', 'lazy report storage');
requireText(documents, 'const uri = await garantirRacineMetra()', 'lazy report root');

const home = read('HomeScreen.js');
requireText(home, 'HOME_FAST_CACHE', 'home stale-while-revalidate cache');
requireText(home, 'const clientsPromise = listerClients()', 'home independent refresh');

const sites = read('ClientSitesScreen.js');
requireText(sites, 'CLIENT_SITES_FAST_CACHE', 'client site cache');
requireText(sites, 'removeClippedSubviews={false}', 'client site Android clipping guard');

const directoryScreen = read('MetraDirectoryScreen.js');
requireText(directoryScreen, 'METRA_DIRECTORY_FAST_CACHE', 'Intranet directory render cache');
requireText(directoryScreen, 'removeClippedSubviews={false}', 'Intranet long-list clipping guard');
const directoryDb = read('symfonyApiCacheDb.js');
requireText(directoryDb, 'let directorySnapshot = null;', 'Intranet directory query cache');
requireText(directoryDb, 'invalidateDirectorySnapshot()', 'Intranet directory cache invalidation');
requireText(directoryDb, 'const snapshot = directorySnapshot ||', 'Intranet in-memory filtering');

const groups = read('SiteGroupsManager.js');
requireText(groups, 'function SiteGroupVirtualList', 'site group virtualization');
requireText(groups, '<FlatList', 'site group FlatList');
forbidText(groups, 'await charger();\n      await onChanged?.();', 'site group full reload');

const patrimoine = read('patrimoineDb.js');
requireText(patrimoine, 'export async function getStatsSitesPatrimoine', 'bulk patrimoine stats');
requireText(patrimoine, 'async function synchroniserReservesClient', 'bulk reserve sync');
forbidText(patrimoine, 'for (const s of sites) await synchroniserReservesSite(s.id);', 'serial client reserve sync');

const health = read('siteHealth.js');
requireText(health, 'mapHealthAvecConcurrence', 'bounded LAB health work');
requireText(health, 'getClientHealth(clientId, statsBySite = null)', 'LAB stats reuse');

const pilotage = read('ClientPilotageScreen.js');
requireText(pilotage, 'getStatsSitesPatrimoine(clientId)', 'pilotage bulk stats');
requireText(pilotage, 'mapAvecConcurrence(cell.issues || [], 4', 'pilotage bounded photo reads');

const matrix = read('clientTechnicalMatrix.js');
requireText(matrix, 'const controlsByVisit = new Map();', 'technical matrix batched controls');
requireText(matrix, 'WHERE visite_id IN (${placeholders})', 'technical matrix IN query');

const database = read('db.js');
requireText(database, "SUM(CASE WHEN statut='en_cours' THEN 1 ELSE 0 END)", 'single visit count query');

const constants = read('database/constants.js');
requireText(constants, 'DATABASE_SCHEMA_VERSION = 32', 'performance schema version');
const migration = read('database/migrations/030_large_client_performance_indexes.js');
requireText(migration, 'idx_sites_client_nom', 'site navigation index');
requireText(migration, 'idx_visites_site_trame_install_date', 'visit carry-forward index');
requireText(migration, 'idx_api_client_site_client_present', 'API client/site index');

console.log('Large-client performance contract validated: report UX, lazy storage, cached navigation, virtualized lists, batched queries and SQLite indexes.');
