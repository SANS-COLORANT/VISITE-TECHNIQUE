const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function requireAnchor(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: anchor not found`);
}
function removeImport(text, symbol, modulePath) {
  const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`import\\s*\\{\\s*${symbol}\\s*\\}\\s*from\\s*['\"]${escaped}['\"];\\s*`, 'g');
  return text.replace(re, '');
}
function replaceTag(text, symbol, name) {
  const re = new RegExp(`<${symbol}\\b([^>]*)\\/>`, 'g');
  return text.replace(re, `<DeferredScreen name="${name}"$1/>`);
}

function patchAppDeferredScreens() {
  const path = 'App.js';
  let text = read(path);
  const deferred = [
    ['MetraDirectoryScreen', './MetraDirectoryScreen.js', 'MetraDirectory'],
    ['ClientSitesScreen', './ClientSitesScreen.js', 'ClientSites'],
    ['ClientMapScreen', './ClientMapScreen.js', 'ClientMap'],
    ['ClientPatrimoineScreen', './ClientPatrimoineScreen.js', 'ClientPatrimoine'],
    ['ClientTechnicalMatrixScreen', './ClientTechnicalMatrixScreen.js', 'ClientTechnicalMatrix'],
    ['ClientPilotageScreen', './ClientPilotageScreen.js', 'ClientPilotage'],
    ['ClientDocumentsScreen', './ClientDocumentsScreen.js', 'ClientDocuments'],
    ['VisiteScreen', './VisiteScreen.js', 'Visite'],
    ['SiteVisitesScreen', './SiteVisitesScreen.js', 'SiteVisites'],
    ['ReportScreen', './ReportScreen.js', 'Report'],
    ['Lab3DScreen', './Lab3DScreen.js', 'Lab3D'],
    ['VisualPacksSettingsScreen', './visual-packs/runtime/VisualPacksSettingsScreen.js', 'Parametres'],
  ];

  if (!text.includes('DEFERRED_SCREEN_LOADERS')) {
    for (const [symbol, modulePath] of deferred) text = removeImport(text, symbol, modulePath);
    requireAnchor(text, "const SPLASH_BG='#FBF0E1';", 'App deferred registry');
    text = text.replace(
      "const SPLASH_BG='#FBF0E1';",
      `const SPLASH_BG='#FBF0E1';\nconst DEFERRED_SCREEN_LOADERS=Object.freeze({\n MetraDirectory:()=>require('./MetraDirectoryScreen.js').MetraDirectoryScreen,\n ClientSites:()=>require('./ClientSitesScreen.js').ClientSitesScreen,\n ClientMap:()=>require('./ClientMapScreen.js').ClientMapScreen,\n ClientPatrimoine:()=>require('./ClientPatrimoineScreen.js').ClientPatrimoineScreen,\n ClientTechnicalMatrix:()=>require('./ClientTechnicalMatrixScreen.js').ClientTechnicalMatrixScreen,\n ClientPilotage:()=>require('./ClientPilotageScreen.js').ClientPilotageScreen,\n ClientDocuments:()=>require('./ClientDocumentsScreen.js').ClientDocumentsScreen,\n Visite:()=>require('./VisiteScreen.js').VisiteScreen,\n SiteVisites:()=>require('./SiteVisitesScreen.js').SiteVisitesScreen,\n Report:()=>require('./ReportScreen.js').ReportScreen,\n Lab3D:()=>require('./Lab3DScreen.js').Lab3DScreen,\n Parametres:()=>require('./visual-packs/runtime/VisualPacksSettingsScreen.js').VisualPacksSettingsScreen,\n});\nfunction DeferredScreen({name,...props}){const Component=DEFERRED_SCREEN_LOADERS[name]?.();return Component?<Component {...props}/>:null;}`
    );
    for (const [symbol, , name] of deferred) text = replaceTag(text, symbol, name);
  }

  // Le patch hydraulique de build repose encore sur cet import statique. Le garder
  // évite une régression de build tout en différant les écrans beaucoup plus lourds.
  if (!/import\s*\{\s*HydraulicSchemaWorkspace\s*\}\s*from\s*['"]\.\/HydraulicSchemaWorkspace\.js['"]/.test(text)) {
    throw new Error('App hydraulic compatibility import missing');
  }
  write(path, text);
}

function patchLazyActionModules() {
  let path = 'HomeScreen.js';
  let text = read(path);
  text = text.replace(/import\s*\{\s*choisirEtAnalyserExcels\s*,\s*importerAnalysesExcel\s*\}\s*from\s*['"]\.\/batchExcel\.js['"];\s*/g, '');
  if (!text.includes('function chargerBatchExcelModule()')) {
    const anchor = /(?:const|let) HOME_FAST_CACHE = \{ clients: null, visitesEnCours: null, stats: null \};/;
    if (!anchor.test(text)) throw new Error('Home runtime cache anchor not found');
    text = text.replace(anchor, (m) => `${m}\nfunction chargerBatchExcelModule(){return require('./batchExcel.js');}`);
  }
  text = text.replace(/\bchoisirEtAnalyserExcels\(\)/g, 'chargerBatchExcelModule().choisirEtAnalyserExcels()');
  text = text.replace(/\bimporterAnalysesExcel\(importBatch\.analyses\)/g, 'chargerBatchExcelModule().importerAnalysesExcel(importBatch.analyses)');
  write(path, text);

  path = 'ClientDocumentsScreen.js';
  text = read(path);
  text = text.replace(/import\s*\{\s*exporterDernieresVisitesClient\s*\}\s*from\s*['"]\.\/clientBatchExport\.js['"];\s*/g, '');
  if (!text.includes('function chargerExportClientModule()')) {
    const anchor = "import { garantirRacineMetra, obtenirRacineMetra } from './metraStorage.js';";
    requireAnchor(text, anchor, 'ClientDocuments lazy export');
    text = text.replace(anchor, `${anchor}\nfunction chargerExportClientModule(){return require('./clientBatchExport.js');}`);
  }
  text = text.replace(/\bexporterDernieresVisitesClient\(clientId\)/g, 'chargerExportClientModule().exporterDernieresVisitesClient(clientId)');
  write(path, text);

  path = 'VisiteScreen.js';
  text = read(path);
  text = text.replace(/import\s*\{\s*exporterEtPartager\s*\}\s*from\s*['"]\.\/excelExport\.js['"];\s*/g, '');
  text = text.replace(/import\s*\{\s*exporterRapportPreAllumage\s*\}\s*from\s*['"]\.\/preAllumageReportExporter\.js['"];\s*/g, '');
  if (!text.includes('function chargerExcelExportModule()')) {
    const anchor = "const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));";
    requireAnchor(text, anchor, 'Visite lazy exporters');
    text = text.replace(anchor, `${anchor}\nfunction chargerExcelExportModule(){return require('./excelExport.js');}\nfunction chargerPreAllumageReportModule(){return require('./preAllumageReportExporter.js');}`);
  }
  text = text.replace(/\bexporterEtPartager\(visiteId\)/g, 'chargerExcelExportModule().exporterEtPartager(visiteId)');
  text = text.replace(/\bexporterRapportPreAllumage\(visiteId,\s*format\)/g, 'chargerPreAllumageReportModule().exporterRapportPreAllumage(visiteId, format)');
  write(path, text);
}

function patchDatabaseBootstrap() {
  const path = 'database/index.js';
  let text = read(path);
  const staticSymbols = [
    ['syncReferenceCatalog', './referenceCatalog.js'],
    ['seedEquipmentCatalog', './equipmentCatalogSeed.js'],
    ['seedEquipmentCatalogExtra', './equipmentCatalogExtraSeed.js'],
    ['seedEquipmentCatalogBreadth', './equipmentCatalogBreadthSeed.js'],
    ['seedEquipmentCatalogDeep', './equipmentCatalogDeepSeed.js'],
    ['seedEquipmentCatalogDeep2', './equipmentCatalogDeepSeed2.js'],
    ['seedEquipmentCatalogDeep3', './equipmentCatalogDeepSeed3.js'],
    ['seedEquipmentCatalogDeep4', './equipmentCatalogDeepSeed4.js'],
    ['seedEquipmentCatalogAir', './equipmentCatalogAirSeed.js'],
    ['seedEquipmentCatalogVentilation', './equipmentCatalogVentilationSeed.js'],
    ['seedEquipmentCatalogHydronics', './equipmentCatalogHydronicsSeed.js'],
    ['seedEquipmentCatalogPeripheral', './equipmentCatalogPeripheralSeed.js'],
    ['seedEquipmentCatalogImages', './equipmentCatalogImageSeed.js'],
    ['seedEquipmentCatalogVisuals', './equipmentCatalogVisualSeed.js'],
  ];
  for (const [symbol, modulePath] of staticSymbols) text = removeImport(text, symbol, modulePath);

  if (!text.includes('CORE_REFERENCE_META_KEY')) {
    const anchor = 'let databasePromise = null;\nlet catalogueEnrichmentPromise = null;';
    requireAnchor(text, anchor, 'database bootstrap state');
    const helper = `let databasePromise = null;\nlet catalogueEnrichmentPromise = null;\nconst CORE_REFERENCE_META_KEY='reference_catalog_icpe_v2';\nconst CORE_EQUIPMENT_META_KEY='equipment_catalog_core_v3';\n\nasync function assurerReferentielsBase(db){\n  const rows=await db.getAllAsync(\`SELECT key FROM _meta WHERE key IN (?,?)\`,[CORE_REFERENCE_META_KEY,CORE_EQUIPMENT_META_KEY]);\n  const done=new Set((rows||[]).map((row)=>row.key));\n  if(!done.has(CORE_REFERENCE_META_KEY)){\n    await require('./referenceCatalog.js').syncReferenceCatalog(db);\n    await db.runAsync(\`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)\`,[CORE_REFERENCE_META_KEY,'1']);\n  }\n  if(!done.has(CORE_EQUIPMENT_META_KEY)){\n    await require('./equipmentCatalogSeed.js').seedEquipmentCatalog(db);\n    await db.runAsync(\`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)\`,[CORE_EQUIPMENT_META_KEY,'1']);\n  }\n}\n\nfunction chargeursEnrichissementCatalogue(){return [\n  ()=>require('./equipmentCatalogExtraSeed.js').seedEquipmentCatalogExtra,\n  ()=>require('./equipmentCatalogBreadthSeed.js').seedEquipmentCatalogBreadth,\n  ()=>require('./equipmentCatalogDeepSeed.js').seedEquipmentCatalogDeep,\n  ()=>require('./equipmentCatalogDeepSeed2.js').seedEquipmentCatalogDeep2,\n  ()=>require('./equipmentCatalogDeepSeed3.js').seedEquipmentCatalogDeep3,\n  ()=>require('./equipmentCatalogDeepSeed4.js').seedEquipmentCatalogDeep4,\n  ()=>require('./equipmentCatalogAirSeed.js').seedEquipmentCatalogAir,\n  ()=>require('./equipmentCatalogVentilationSeed.js').seedEquipmentCatalogVentilation,\n  ()=>require('./equipmentCatalogHydronicsSeed.js').seedEquipmentCatalogHydronics,\n  ()=>require('./equipmentCatalogPeripheralSeed.js').seedEquipmentCatalogPeripheral,\n  ()=>require('./equipmentCatalogImageSeed.js').seedEquipmentCatalogImages,\n  ()=>require('./equipmentCatalogVisualSeed.js').seedEquipmentCatalogVisuals,\n];}`;
    text = text.replace(anchor, helper);
  }

  const enrichmentRe = /      const db = await openAppDatabase\(\);\n(?:      await seedEquipmentCatalog[^\n]+\n)+      return db;/;
  if (enrichmentRe.test(text)) {
    text = text.replace(enrichmentRe, "      const db = await openAppDatabase();\n      for(const charger of chargeursEnrichissementCatalogue()) await charger()(db);\n      return db;");
  }
  text = text.replace(/      await syncReferenceCatalog\(db\);\n      await seedEquipmentCatalog\(db\);/g, '      await assurerReferentielsBase(db);');
  if (!text.includes('await assurerReferentielsBase(db);')) throw new Error('database core catalogue guard not applied');
  if (!text.includes('chargeursEnrichissementCatalogue')) throw new Error('database lazy enrichment not applied');
  write(path, text);
}

function patchVisitPrefillCoalescing() {
  const path = 'visitPrefillDb.js';
  let text = read(path);
  if (!text.includes('const prefillTermines = new Set();')) {
    const importAnchor = "import { carryForwardPreviousVisit } from './visitCarryForwardDb.js';";
    requireAnchor(text, importAnchor, 'visit prefill cache');
    text = text.replace(importAnchor, `${importAnchor}\n\nconst prefillTermines = new Set();\nconst prefillEnCours = new Map();`);
  }
  if (!text.includes('preremplirVisiteDepuisContexteInterne')) {
    const signature = 'export async function preremplirVisiteDepuisContexte(db, visiteId) {';
    requireAnchor(text, signature, 'visit prefill implementation');
    text = text.replace(signature, 'async function preremplirVisiteDepuisContexteInterne(db, visiteId) {');
    text += `\nexport async function preremplirVisiteDepuisContexte(db, visiteId) {\n  const key=String(visiteId||'');\n  if(!key)return;\n  if(prefillTermines.has(key))return;\n  const existant=prefillEnCours.get(key);\n  if(existant)return existant;\n  const promise=preremplirVisiteDepuisContexteInterne(db,visiteId)\n    .then((resultat)=>{prefillTermines.add(key);return resultat;})\n    .finally(()=>prefillEnCours.delete(key));\n  prefillEnCours.set(key,promise);\n  return promise;\n}\n`;
  }
  write(path, text);
}

function patchSiteOverviewReloads() {
  const path = 'SiteOverviewPanel.js';
  let text = read(path);
  text = text.replace('  }, [siteId, mode, sousMenu, visiteDebut, visiteFin]);', '  }, [siteId, mode, sousMenu]);');
  if (!text.includes('}, [siteId, mode, sousMenu]);')) throw new Error('site overview dependency optimization not applied');
  write(path, text);
}

function patchClientMap() {
  const path = 'ClientMapScreen.js';
  let text = read(path);
  if (!text.includes('synchroniserCoordonneesClient(clientId, { max: 12 })')) {
    const target = '        const r = await synchroniserCoordonneesClient(clientId);';
    requireAnchor(text, target, 'map automatic geocoding');
    text = text.replace(target, "        await new Promise((resolve) => setTimeout(resolve, 180));\n        const r = await synchroniserCoordonneesClient(clientId, { max: 12 });");
  }
  if (!text.includes('tracksViewChanges={false}')) {
    const target = '                  key={site.id}\n                  coordinate={{ latitude: Number(site.latitude), longitude: Number(site.longitude) }}';
    requireAnchor(text, target, 'map marker rendering');
    text = text.replace(target, '                  key={site.id}\n                  tracksViewChanges={false}\n                  coordinate={{ latitude: Number(site.latitude), longitude: Number(site.longitude) }}');
  }
  write(path, text);
}

function patchCatalogueSearch() {
  const path = 'EquipmentCatalogueBrowser.js';
  let text = read(path);
  if (!text.includes("const [searchDb,setSearchDb]=useState('')")) {
    const state = "const [tab,setTab]=useState('marques');const [brands,setBrands]=useState([]);const [cats,setCats]=useState([]);const [models,setModels]=useState([]);const [search,setSearch]=useState('');";
    requireAnchor(text, state, 'catalogue search state');
    text = text.replace(state, `${state}const [searchDb,setSearchDb]=useState('');`);
  }
  text = text.replace(/rechercherCatalogueIntelligent\(\{recherche:search\}\)/g, 'rechercherCatalogueIntelligent({recherche:searchDb})');
  text = text.replace(/\},\[search\]\);\n  useEffect\(\(\)=>\{refresh\(\);\},\[refresh\]\);/, '},[searchDb]);\n  useEffect(()=>{refresh();},[refresh]);\n  useEffect(()=>{const timer=setTimeout(()=>setSearchDb(search.trim()),180);return()=>clearTimeout(timer);},[search]);');
  if (!text.includes('setSearchDb(search.trim()),180')) throw new Error('catalogue search debounce not applied');
  write(path, text);
}

function patchVisualPackLazyTools() {
  const path = 'visual-packs/runtime/visualPackManager.js';
  let text = read(path);
  text = text.replace(/import \* as DocumentPicker from ['"]expo-document-picker['"];\s*/g, '');
  text = text.replace(/import \{ unzip \} from ['"]react-native-zip-archive['"];\s*/g, '');
  if (!text.includes("const DocumentPicker = require('expo-document-picker');")) {
    const signature = 'export async function importVisualPackZip() {';
    requireAnchor(text, signature, 'visual pack import');
    text = text.replace(signature, `${signature}\n  const DocumentPicker = require('expo-document-picker');\n  const { unzip } = require('react-native-zip-archive');`);
  }
  write(path, text);
}

patchAppDeferredScreens();
patchLazyActionModules();
patchDatabaseBootstrap();
patchVisitPrefillCoalescing();
patchSiteOverviewReloads();
patchClientMap();
patchCatalogueSearch();
patchVisualPackLazyTools();
console.log('Runtime responsiveness v3 applied: deferred screens/actions, version-gated catalogues, coalesced prefill, bounded map and debounced catalogue work.');
