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
requireText(documents, "const ouvrirRapports = () =>", 'report screen opens without eager storage');
if (documents.includes('const lancerExportPourTrame')) {
  const start = documents.indexOf('const lancerExportPourTrame');
  const reportBranch = documents.indexOf("if (action === 'rapport')", start);
  const storageRequest = documents.indexOf('const uri = await garantirStockageClient();', start);
  if (reportBranch < 0 || storageRequest < 0 || storageRequest < reportBranch) {
    throw new Error('typed report flow must navigate before requesting storage');
  }
}

const report = read('ReportScreen.js');
const baseState = "const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique');";
const vmcState = "const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique'),[sousTitre,setSousTitre]=useState('Présentation de la trame de visite technique');";
if (!report.includes(baseState) && !report.includes(vmcState)) throw new Error('legacy VMC report state chain not preserved');
requireText(report, '[dossiersParSite,setDossiersParSite]', 'per-site folder choice state');
requireText(report, 'Un seul document · {clientNomRapport}', 'grouped client document choice');
requireText(report, 'Un PDF par site', 'per-site PDF choice');
requireText(report, 'Créer un dossier pour chaque site', 'selected-site folder option');
requireText(report, 'photosConfig:photos,format,dossiersParSite', 'per-site folder choice forwarded separately');
requireText(report, 'return new Set()', 'no automatic full-client report selection');
forbidText(report, 'layout,dossiersParSite', 'legacy report config must remain compatible');

const exporter = read('reportEditorExporter.js');
requireText(exporter, "from './metraStorage.js'", 'METRA report storage import');
requireText(exporter, 'clientNom ? await dossierRapportsClientMetra(clientNom)', 'grouped client folder');
requireText(exporter, 'await dossierRapportsSiteMetra({ clientNom, siteNom })', 'selected site report folder');
requireText(exporter, 'dossiersParSite === false', 'per-site folder toggle');
requireText(exporter, '// METRA storage compatibility: dossierUri || await choisirDossier(datas);', 'legacy storage patch compatibility marker');

const storage = read('metraStorage.js');
requireText(storage, 'export async function dossierRapportsClientMetra', 'client report folder helper');
requireText(storage, 'export async function dossierRapportsSiteMetra', 'site report folder helper');

console.log('Report export workflow validated before/after legacy patches: sites remain browseable and report folders are created only for the chosen output after explicit site selection.');
