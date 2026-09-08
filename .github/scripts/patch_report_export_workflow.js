const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function requireAnchor(text, needle, label) { if (!text.includes(needle)) throw new Error(`${label}: anchor not found`); }

function patchClientDocuments() {
  const path = 'ClientDocumentsScreen.js';
  let text = read(path);

  text = text.replace(
    "import { garantirRacineMetra, initialiserArborescenceClient, obtenirRacineMetra } from './metraStorage.js';",
    "import { garantirRacineMetra, obtenirRacineMetra } from './metraStorage.js';"
  );
  text = text.replace(/\n\s*\/\/ Matérialise immédiatement l'arborescence[\s\S]*?await initialiserArborescenceClient\(clientId\);\n/g, '\n');
  text = text.replace(/\n\s*await initialiserArborescenceClient\(clientId\);/g, '');
  if (text.includes('initialiserArborescenceClient')) throw new Error('ClientDocuments still creates the whole client tree eagerly');

  text = text.replace(
    'Photos, PDF, Word et Excel sont rangés dans Documents/METRA selon Client → Site → Visite.',
    'Les dossiers de rapport sont créés uniquement au moment de l’export, pour les sites réellement sélectionnés.'
  );
  text = text.replace(
    "Android demandera une seule fois l'accès au dossier Documents. Ensuite METRA crée uniquement les dossiers nécessaires au moment de l'export.",
    "Android demandera une seule fois l'accès au dossier Documents. Aucun dossier de site n'est créé avant ton choix d'export."
  );
  text = text.replace(
    "Android demandera une seule fois l'accès au dossier Documents. Ensuite METRA crée et utilise automatiquement toute l'arborescence.",
    "Android demandera une seule fois l'accès au dossier Documents. Aucun dossier de site n'est créé avant ton choix d'export."
  );
  text = text.replace(
    'Choisir les dernières visites, le contenu, les photos et le format. Les fichiers générés sont ensuite classés automatiquement dans le dossier du client ou de la visite.',
    'Sélectionner d’abord les sites, puis choisir un document unique au nom du client ou un PDF par site. Les dossiers ne sont créés qu’au moment de la génération.'
  );
  write(path, text);
}

function patchStorage() {
  const path = 'metraStorage.js';
  let text = read(path);
  if (!text.includes('export async function dossierRapportsClientMetra')) {
    const anchor = 'export async function dossierRapportMetra(datas = []) {';
    requireAnchor(text, anchor, 'METRA report folder helpers');
    const helpers = `export async function dossierRapportsClientMetra(clientNom) {\n  return garantirCheminMetra(['Clients', nettoyerSegment(clientNom, 'Client'), 'Rapports']);\n}\n\nexport async function dossierRapportsSiteMetra({ clientNom, siteNom }) {\n  return garantirCheminMetra([\n    'Clients', nettoyerSegment(clientNom, 'Client'),\n    'Rapports', nettoyerSegment(siteNom, 'Site'),\n  ]);\n}\n\n`;
    text = text.replace(anchor, helpers + anchor);
  }
  write(path, text);
}

function patchExporter() {
  const path = 'reportEditorExporter.js';
  let text = read(path);

  const brandImport = "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';";
  const storageImport = "import { dossierRapportsClientMetra, dossierRapportsSiteMetra } from './metraStorage.js';";
  if (!text.includes(storageImport)) {
    requireAnchor(text, brandImport, 'report storage import');
    text = text.replace(brandImport, `${brandImport}\n${storageImport}`);
  }

  const oldBase = "  const base = propre(`${config.chrono || 'Rapport'}_${datas.length === 1 ? datas[0].visite.nom_site : datas[0].visite.nom_client}_${config.objet || 'CRV'}`);";
  const newBase = `  const clientNom = datas[0]?.visite?.nom_client || 'Rapport';\n  const base = propre(datas.length > 1\n    ? \`${'${clientNom}'}_${'${config.chrono || \'Rapport\'}'}_${'${config.objet || \'CRV\'}'}\`\n    : \`${'${config.chrono || \'Rapport\'}'}_${'${datas[0]?.visite?.nom_site || clientNom}'}_${'${config.objet || \'CRV\'}'}\`);`;
  if (!text.includes("const clientNom = datas[0]?.visite?.nom_client || 'Rapport';")) {
    requireAnchor(text, oldBase, 'report filename base');
    text = text.replace(oldBase, newBase);
  }

  const oldSingle = `export async function exporterRapportEdite({ datas, config, photosConfig, format = 'pdf', dossierUri = null }) {\n  const dossier = dossierUri || await choisirDossier();\n  if (!dossier) return { annule: true };\n  return { annule: false, ...(await exporterUnFormatEdite({ datas, config, photosConfig, format, dossier })) };\n}`;
  const newSingle = `export async function exporterRapportEdite({ datas, config, photosConfig, format = 'pdf', dossierUri = null }) {\n  const clientNom = datas?.[0]?.visite?.nom_client || null;\n  const dossier = dossierUri || (clientNom ? await dossierRapportsClientMetra(clientNom) : await choisirDossier());\n  if (!dossier) return { annule: true };\n  return { annule: false, ...(await exporterUnFormatEdite({ datas, config, photosConfig, format, dossier })) };\n}`;
  if (!text.includes('clientNom ? await dossierRapportsClientMetra(clientNom)')) {
    requireAnchor(text, oldSingle, 'single/grouped report destination');
    text = text.replace(oldSingle, newSingle);
  }

  const start = text.indexOf('export async function exporterRapportsParSiteEdites');
  if (start < 0) throw new Error('per-site report exporter not found');
  let before = text.slice(0, start);
  let fn = text.slice(start);
  if (!fn.includes('dossierRapportsSiteMetra')) {
    const oldHead = `export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf' }) {\n  const dossier = await choisirDossier();\n  if (!dossier) return { annule: true, resultats: [] };`;
    const newHead = `export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf' }) {\n  const clientNom = datas?.[0]?.visite?.nom_client || null;\n  const dossierClient = clientNom ? await dossierRapportsClientMetra(clientNom) : await choisirDossier();\n  if (!dossierClient) return { annule: true, resultats: [] };`;
    requireAnchor(fn, oldHead, 'per-site report destination');
    fn = fn.replace(oldHead, newHead);

    const oldPush = '    resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format, dossierUri: dossier }));';
    const newPush = `    const siteNom = siteDatas[0]?.visite?.nom_site || 'Site';\n    const dossierSite = config?.dossiersParSite === false || !clientNom\n      ? dossierClient\n      : await dossierRapportsSiteMetra({ clientNom, siteNom });\n    resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format, dossierUri: dossierSite }));`;
    requireAnchor(fn, oldPush, 'per-site folder selection');
    fn = fn.replace(oldPush, newPush);
  }
  text = before + fn;
  write(path, text);
}

function patchReportScreen() {
  const path = 'ReportScreen.js';
  let text = read(path);

  const oldState = " const[mode,setMode]=useState('groupe'),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique');";
  const newState = " const[mode,setMode]=useState('groupe'),[dossiersParSite,setDossiersParSite]=useState(true),[chrono,setChrono]=useState(''),[objet,setObjet]=useState('Compte rendu de visite technique');";
  if (!text.includes('[dossiersParSite,setDossiersParSite]')) {
    requireAnchor(text, oldState, 'report output state');
    text = text.replace(oldState, newState);
  }

  text = text.replace(
    "return new Set(latest.filter(v=>v.statut==='terminee').map(v=>v.id))",
    'return new Set()'
  );

  const selectedRowsAnchor = ' const selectedRows=useMemo(()=>visites.filter(v=>selected.has(v.id)),[visites,selected]);';
  if (!text.includes('const clientNomRapport=')) {
    requireAnchor(text, selectedRowsAnchor, 'report client label');
    text = text.replace(selectedRowsAnchor, `${selectedRowsAnchor}\n const clientNomRapport=useMemo(()=>visites[0]?.nom_client||'Nom du client',[visites]);`);
  }

  text = text.replace('>Rapport groupé</Text>', '>Un seul document · {clientNomRapport}</Text>');
  text = text.replace('>Un rapport par site</Text>', '>Un PDF par site</Text>');

  const contentAnchor = "</View><Text style={[styles.fieldLabel,{marginTop:16}]}>Contenu</Text>";
  if (!text.includes('Créer un dossier pour chaque site')) {
    const modeIndex = text.indexOf("<Text style={[styles.fieldLabel,{marginTop:16}]}>Mode</Text>");
    const contentIndex = text.indexOf(contentAnchor, modeIndex);
    if (modeIndex < 0 || contentIndex < 0) throw new Error('report mode block anchor not found');
    const insert = `</View>{mode==='site'?<View style={{marginTop:10,padding:10,borderRadius:11,borderWidth:1,borderColor:COLORS.line,backgroundColor:'#fff'}}><Toggle label=\"Créer un dossier pour chaque site\" value={dossiersParSite} onChange={setDossiersParSite} sub=\"Uniquement pour les sites sélectionnés. Si désactivé, les PDF par site sont rangés ensemble dans le dossier Rapports du client.\"/></View>:<Text style={{marginTop:9,color:COLORS.inkSoft,fontSize:11.5}}>Un seul fichier sera généré pour tous les sites sélectionnés, avec le nom du client.</Text>}<Text style={[styles.fieldLabel,{marginTop:16}]}>Contenu</Text>`;
    text = text.slice(0, contentIndex) + text.slice(contentIndex).replace(contentAnchor, insert);
  }

  const oldConfig = ' const config={chrono,objet,dateRapport,afficherLignesVides,materiel,remarques,photos:inclurePhotos,coverUri,coverLabel,coverVisiteId,layout};';
  const newConfig = ' const config={chrono,objet,dateRapport,afficherLignesVides,materiel,remarques,photos:inclurePhotos,coverUri,coverLabel,coverVisiteId,layout,dossiersParSite};';
  if (!text.includes('layout,dossiersParSite')) {
    requireAnchor(text, oldConfig, 'report config output mode');
    text = text.replace(oldConfig, newConfig);
  }

  text = text.replace('rapport(s) enregistré(s) dans le dossier choisi.', 'rapport(s) enregistré(s) dans METRA.');
  text = text.replace("a été enregistré dans le dossier choisi.", "a été enregistré dans le dossier Rapports du client.");
  write(path, text);
}

patchClientDocuments();
patchStorage();
patchExporter();
patchReportScreen();
console.log('Report export workflow fixed: explicit site selection, no eager site folders, grouped client document or optional folder per selected site.');
