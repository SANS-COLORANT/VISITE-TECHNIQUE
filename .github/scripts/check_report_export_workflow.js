const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) { if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`); }
function forbidText(text, needle, label) { if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); }

const directory = read('MetraDirectoryScreen.js');
requireText(directory, "height: '86%', maxHeight: '86%', minHeight: 420", 'client modal visible height');
requireText(directory, 'minHeight: 220, maxHeight: 440', 'client site preview list');
requireText(directory, 'Touchez un site pour consulter sa fiche', 'client browse mode helper');

const documents = read('ClientDocumentsScreen.js');
forbidText(documents, 'initialiserArborescenceClient', 'eager client/site folder creation');
requireText(documents, "Aucun dossier de site n'est créé avant ton choix d'export.", 'lazy report folders message');

const report = read('ReportScreen.js');
requireText(report, '[dossiersParSite,setDossiersParSite]', 'per-site folder choice state');
requireText(report, 'Un seul document · {clientNomRapport}', 'grouped client document choice');
requireText(report, 'Un PDF par site', 'per-site PDF choice');
requireText(report, 'Créer un dossier pour chaque site', 'selected-site folder option');
requireText(report, 'layout,dossiersParSite', 'report output config');
requireText(report, 'return new Set()', 'no automatic full-client report selection');

const exporter = read('reportEditorExporter.js');
requireText(exporter, "from './metraStorage.js'", 'METRA report storage import');
requireText(exporter, 'clientNom ? await dossierRapportsClientMetra(clientNom)', 'grouped client folder');
requireText(exporter, 'await dossierRapportsSiteMetra({ clientNom, siteNom })', 'selected site report folder');
requireText(exporter, 'config?.dossiersParSite === false', 'per-site folder toggle');

const storage = read('metraStorage.js');
requireText(storage, 'export async function dossierRapportsClientMetra', 'client report folder helper');
requireText(storage, 'export async function dossierRapportsSiteMetra', 'site report folder helper');

console.log('Report export workflow validated: browsing sites remains visible and report folders are created only for the chosen output after explicit site selection.');
