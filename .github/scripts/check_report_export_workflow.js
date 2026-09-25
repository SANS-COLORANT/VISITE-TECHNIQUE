const fs = require('fs');
function read(path) {
  return fs.readFileSync(path, 'utf8');
}
// Compare en ignorant les espaces/retours à la ligne : le contrôle vérifie une
// structure de code, pas un formatage exact (survit à un passage Prettier).
function norm(s) {
  return s.replace(/\s+/g, '');
}
function requireText(text, needle, label) {
  if (!norm(text).includes(norm(needle))) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(text, needle, label) {
  if (norm(text).includes(norm(needle))) throw new Error(`${label}: forbidden ${needle}`);
}

const directory = read('MetraDirectoryScreen.js');
requireText(directory, "height: '92%', maxHeight: '92%'", 'client modal full height');
requireText(directory, 'style={{ flex: 1 }}', 'client site flexible scroll list');
requireText(
  directory,
  'contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}',
  'client site list bottom spacing'
);
forbidText(directory, 'minHeight: 220, maxHeight: 440', 'legacy fixed client site list height');
requireText(directory, 'Touchez un site pour consulter sa fiche', 'client browse mode helper');

const documents = read('ClientDocumentsScreen.js');
forbidText(documents, 'initialiserArborescenceClient', 'eager client/site folder creation');
requireText(documents, "Aucun dossier de site n'est créé avant ton choix d'export.", 'lazy report folders message');
requireText(documents, 'const ouvrirRapports = () =>', 'report screen opens without eager storage');
if (documents.includes('const lancerExportPourTrame')) {
  const start = documents.indexOf('const lancerExportPourTrame');
  const reportBranch = documents.indexOf("if (action === 'rapport')", start);
  const storageRequest = documents.indexOf('const uri = await garantirStockageClient();', start);
  if (reportBranch < 0 || storageRequest < 0 || storageRequest < reportBranch) {
    throw new Error('typed report flow must navigate before requesting storage');
  }
}

const report = read('ReportScreen.js');
const baseState =
  "const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique');";
const vmcState =
  "const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique'),[sousTitre,setSousTitre]=useState('Présentation de la trame de visite technique');";
if (!norm(report).includes(norm(baseState)) && !norm(report).includes(norm(vmcState)))
  throw new Error('legacy VMC report state chain not preserved');
requireText(report, '[dossiersParSite,setDossiersParSite]', 'per-site folder choice state');
requireText(report, 'Un seul document · {clientNomRapport}', 'grouped client document choice');
requireText(report, 'Un document par site', 'per-site document choice');
requireText(report, 'Créer un dossier pour chaque site', 'selected-site folder option');
requireText(report, 'photosConfig:photos,format,dossiersParSite', 'per-site folder choice forwarded separately');
requireText(report, '[dossiersParLocal,setDossiersParLocal]', 'per-local folder choice state');
requireText(report, 'Un document par local', 'per-local document choice');
requireText(report, 'Créer un dossier pour chaque local', 'selected-local folder option');
requireText(report, 'exporterRapportsParLocalEdites', 'per-local exporter');
requireText(report, 'Synthèse du patrimoine en début de rapport', 'patrimoine report toggle');
requireText(report, 'patrimoineScope', 'patrimoine report scope');
requireText(report, 'return new Set()', 'no automatic full-client report selection');
forbidText(report, 'layout,dossiersParSite', 'legacy report config must remain compatible');

const exporter = read('reportEditorExporter.js');
requireText(exporter, "from './metraStorage.js'", 'METRA report storage import');
requireText(exporter, 'clientNom ? await dossierRapportsClientMetra(clientNom)', 'grouped client folder');
requireText(exporter, 'await dossierRapportsSiteMetra({ clientNom, siteNom })', 'selected site report folder');
requireText(exporter, 'dossiersParSite === false', 'per-site folder toggle');
requireText(exporter, 'export async function exporterRapportsParLocalEdites', 'per-local exporter implementation');
requireText(exporter, 'dossiersParLocal !== false', 'per-local folder toggle');
requireText(
  exporter,
  'await dossierRapportsLocalMetra({ clientNom, siteNom, localNom })',
  'selected local report folder'
);
requireText(
  exporter,
  '// METRA storage compatibility: dossierUri || await choisirDossier(datas);',
  'legacy storage patch compatibility marker'
);

const storage = read('metraStorage.js');
requireText(storage, 'export async function dossierRapportsClientMetra', 'client report folder helper');
requireText(storage, 'export async function dossierRapportsSiteMetra', 'site report folder helper');
requireText(storage, 'export async function dossierRapportsLocalMetra', 'local report folder helper');

const builder = read('reportBuilder.js');
requireText(builder, 'getStatsPatrimoineSelection', 'patrimoine summary data source');
requireText(builder, 'SYNTHÈSE DU PATRIMOINE', 'patrimoine summary report section');
requireText(builder, 'LEFT JOIN installations i ON i.id=v.installation_id', 'report local identity');

console.log(
  'Report export workflow validated: site/local selection, grouped/site/local outputs, lazy METRA folders and patrimoine summary are wired.'
);
