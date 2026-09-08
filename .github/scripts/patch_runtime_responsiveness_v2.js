const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${label}: anchor not found`);
  return text.replace(from, to);
}
function removeOnce(text, needle, label) {
  if (!text.includes(needle)) return text;
  return text.replace(needle, '');
}

function patchAppDeferredScreens() {
  const path = 'App.js';
  let text = read(path);
  if (!text.includes('DEFERRED_SCREEN_LOADERS')) {
    text = replaceOnce(
      text,
      "import { getDb } from './db.js'; import { COLORS, styles } from './styles.js'; import { HomeScreen } from './HomeScreen.js'; import { MetraDirectoryScreen } from './MetraDirectoryScreen.js';\n",
      "import { getDb } from './db.js'; import { COLORS, styles } from './styles.js'; import { HomeScreen } from './HomeScreen.js';\n",
      'App deferred directory import'
    );
    text = removeOnce(text,
      "import { ClientSitesScreen } from './ClientSitesScreen.js'; import { ClientMapScreen } from './ClientMapScreen.js'; import { ClientPatrimoineScreen } from './ClientPatrimoineScreen.js'; import { ClientTechnicalMatrixScreen } from './ClientTechnicalMatrixScreen.js'; import { ClientPilotageScreen } from './ClientPilotageScreen.js'; import { ClientDocumentsScreen } from './ClientDocumentsScreen.js'; import { VisiteScreen } from './VisiteScreen.js'; import { SiteVisitesScreen } from './SiteVisitesScreen.js'; import { ReportScreen } from './ReportScreen.js'; import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';\n",
      'App deferred feature imports'
    );
    text = replaceOnce(
      text,
      "import { getHydraulicSchemaVisible,getLab3DVisible,subscribeLabFeatureChanges } from './featureSettings.js'; import { Lab3DScreen } from './Lab3DScreen.js'; import { AppErrorBoundary } from './AppErrorBoundary.js'; import { R1EasterEgg } from './R1EasterEgg.js'; import { VisualPackLoadingScreen } from './visual-packs/runtime/VisualPackLoadingScreen.js'; import { VisualPackAsset } from './visual-packs/runtime/VisualPackAsset.js'; import { VisualPacksSettingsScreen } from './visual-packs/runtime/VisualPacksSettingsScreen.js'; import { setRuntimeVisualPalette } from './visual-packs/runtime/visualPaletteRuntime.js'; import { getActiveVisualPack,getVisualPackStartupDuration,resolveVisualPackAssetUri } from './visual-packs/runtime/visualPackManager.js';\n",
      "import { getHydraulicSchemaVisible,getLab3DVisible,subscribeLabFeatureChanges } from './featureSettings.js'; import { AppErrorBoundary } from './AppErrorBoundary.js'; import { R1EasterEgg } from './R1EasterEgg.js'; import { VisualPackLoadingScreen } from './visual-packs/runtime/VisualPackLoadingScreen.js'; import { VisualPackAsset } from './visual-packs/runtime/VisualPackAsset.js'; import { setRuntimeVisualPalette } from './visual-packs/runtime/visualPaletteRuntime.js'; import { getActiveVisualPack,getVisualPackStartupDuration,resolveVisualPackAssetUri } from './visual-packs/runtime/visualPackManager.js';\n",
      'App deferred lab/settings imports'
    );
    const anchor = "const SPLASH_BG='#FBF0E1';\n";
    const loaders = `const SPLASH_BG='#FBF0E1';\nconst DEFERRED_SCREEN_LOADERS=Object.freeze({\n MetraDirectory:()=>require('./MetraDirectoryScreen.js').MetraDirectoryScreen,\n ClientSites:()=>require('./ClientSitesScreen.js').ClientSitesScreen,\n ClientMap:()=>require('./ClientMapScreen.js').ClientMapScreen,\n ClientPilotage:()=>require('./ClientPilotageScreen.js').ClientPilotageScreen,\n ClientDocuments:()=>require('./ClientDocumentsScreen.js').ClientDocumentsScreen,\n ClientPatrimoine:()=>require('./ClientPatrimoineScreen.js').ClientPatrimoineScreen,\n ClientTechnicalMatrix:()=>require('./ClientTechnicalMatrixScreen.js').ClientTechnicalMatrixScreen,\n SiteVisites:()=>require('./SiteVisitesScreen.js').SiteVisitesScreen,\n Visite:()=>require('./VisiteScreen.js').VisiteScreen,\n HydraulicSchema:()=>require('./HydraulicSchemaWorkspace.js').HydraulicSchemaWorkspace,\n Lab3D:()=>require('./Lab3DScreen.js').Lab3DScreen,\n Report:()=>require('./ReportScreen.js').ReportScreen,\n Parametres:()=>require('./visual-packs/runtime/VisualPacksSettingsScreen.js').VisualPacksSettingsScreen,\n});\nfunction DeferredScreen({name,...props}){const Component=DEFERRED_SCREEN_LOADERS[name]?.();return Component?<Component {...props}/>:null;}\n`;
    text = replaceOnce(text, anchor, loaders, 'App deferred loader registry');

    const tags = [
      ["<MetraDirectoryScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"MetraDirectory\" navigation={navigation} route={route}/>"],
      ["<ClientSitesScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientSites\" navigation={navigation} route={route}/>"],
      ["<ClientMapScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientMap\" navigation={navigation} route={route}/>"],
      ["<ClientPilotageScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientPilotage\" navigation={navigation} route={route}/>"],
      ["<ClientDocumentsScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientDocuments\" navigation={navigation} route={route}/>"],
      ["<ClientPatrimoineScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientPatrimoine\" navigation={navigation} route={route}/>"],
      ["<ClientTechnicalMatrixScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"ClientTechnicalMatrix\" navigation={navigation} route={route}/>"],
      ["<SiteVisitesScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"SiteVisites\" navigation={navigation} route={route}/>"],
      ["<VisiteScreen navigation={navigation} route={route} onBack={goBack}/>", "<DeferredScreen name=\"Visite\" navigation={navigation} route={route} onBack={goBack}/>"],
      ["<HydraulicSchemaWorkspace route={route}/>", "<DeferredScreen name=\"HydraulicSchema\" route={route}/>"],
      ["<Lab3DScreen navigation={navigation} route={route}/>", "<DeferredScreen name=\"Lab3D\" navigation={navigation} route={route}/>"],
      ["<ReportScreen route={route} onBack={goBack}/>", "<DeferredScreen name=\"Report\" route={route} onBack={goBack}/>"],
      ["<VisualPacksSettingsScreen visualPack={visualPack} onVisualPackChanged={handleVisualPackChanged}/>", "<DeferredScreen name=\"Parametres\" visualPack={visualPack} onVisualPackChanged={handleVisualPackChanged}/>"],
    ];
    for (const [from, to] of tags) text = replaceOnce(text, from, to, `App deferred ${to}`);
  }
  write(path, text);
}

function patchLazyActionModules() {
  let path = 'HomeScreen.js';
  let text = read(path);
  text = removeOnce(text, "import { choisirEtAnalyserExcels, importerAnalysesExcel } from './batchExcel.js';\n", 'Home lazy Excel import');
  if (!text.includes('function chargerBatchExcelModule()')) {
    const anchor = 'const HOME_FAST_CACHE = { clients: null, visitesEnCours: null, stats: null };\n';
    if (!text.includes(anchor)) throw new Error('Home runtime cache anchor not found');
    text = text.replace(anchor, `${anchor}function chargerBatchExcelModule(){return require('./batchExcel.js');}\n`);
  }
  text = text.replace('const lot = await choisirEtAnalyserExcels();', 'const lot = await chargerBatchExcelModule().choisirEtAnalyserExcels();');
  text = text.replace('const resultats = await importerAnalysesExcel(importBatch.analyses);', 'const resultats = await chargerBatchExcelModule().importerAnalysesExcel(importBatch.analyses);');
  write(path, text);

  path = 'SiteVisitesScreen.js';
  text = read(path);
  text = removeOnce(text, "import { exporterVisitesExcelEnLot } from './batchExcel.js';\n", 'SiteVisits lazy Excel import');
  if (!text.includes('function chargerBatchExcelSiteModule()')) {
    const anchor = "const STATUT_LABELS = { en_cours: 'En cours', terminee: 'Terminée', a_completer: 'À compléter', exportee: 'Exportée' };\n";
    if (!text.includes(anchor)) throw new Error('SiteVisits lazy module anchor not found');
    text = text.replace(anchor, `${anchor}function chargerBatchExcelSiteModule(){return require('./batchExcel.js');}\n`);
  }
  text = text.replace('const resultat = await exporterVisitesExcelEnLot([...visitesSelectionnees]);', 'const resultat = await chargerBatchExcelSiteModule().exporterVisitesExcelEnLot([...visitesSelectionnees]);');
  write(path, text);

  path = 'ClientDocumentsScreen.js';
  text = read(path);
  text = removeOnce(text, "import { exporterDernieresVisitesClient } from './clientBatchExport.js';\n", 'ClientDocuments lazy export import');
  if (!text.includes('function chargerExportClientModule()')) {
    const anchor = "import { garantirRacineMetra, obtenirRacineMetra } from './metraStorage.js';\n";
    if (!text.includes(anchor)) throw new Error('ClientDocuments lazy module anchor not found');
    text = text.replace(anchor, `${anchor}\nfunction chargerExportClientModule(){return require('./clientBatchExport.js');}\n`);
  }
  text = text.replace('const resultat = await exporterDernieresVisitesClient(clientId);', 'const resultat = await chargerExportClientModule().exporterDernieresVisitesClient(clientId);');
  write(path, text);

  path = 'VisiteScreen.js';
  text = read(path);
  text = removeOnce(text, "import { exporterEtPartager } from './excelExport.js';\n", 'Visite lazy Excel exporter');
  text = removeOnce(text, "import { exporterRapportPreAllumage } from './preAllumageReportExporter.js';\n", 'Visite lazy preallumage exporter');
  if (!text.includes('function chargerExcelExportModule()')) {
    const anchor = "const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n";
    if (!text.includes(anchor)) throw new Error('Visite lazy export module anchor not found');
    text = text.replace(anchor, `${anchor}function chargerExcelExportModule(){return require('./excelExport.js');}\nfunction chargerPreAllumageReportModule(){return require('./preAllumageReportExporter.js');}\n`);
  }
  text = text.replace('const resultat = await exporterEtPartager(visiteId);', 'const resultat = await chargerExcelExportModule().exporterEtPartager(visiteId);');
  text = text.replace('const resultat = await exporterRapportPreAllumage(visiteId, format);', 'const resultat = await chargerPreAllumageReportModule().exporterRapportPreAllumage(visiteId, format);');
  write(path, text);
}

function patchDatabaseBootstrap() {
  const path = 'database/index.js';
  let text = read(path);
  const imports = [
    "import { syncReferenceCatalog } from './referenceCatalog.js';\n",
    "import { seedEquipmentCatalog } from './equipmentCatalogSeed.js';\n",
    "import { seedEquipmentCatalogExtra } from './equipmentCatalogExtraSeed.js';\n",
    "import { seedEquipmentCatalogBreadth } from './equipmentCatalogBreadthSeed.js';\n",
    "import { seedEquipmentCatalogDeep } from './equipmentCatalogDeepSeed.js';\n",
    "import { seedEquipmentCatalogDeep2 } from './equipmentCatalogDeepSeed2.js';\n",
    "import { seedEquipmentCatalogDeep3 } from './equipmentCatalogDeepSeed3.js';\n",
    "import { seedEquipmentCatalogDeep4 } from './equipmentCatalogDeepSeed4.js';\n",
    "import { seedEquipmentCatalogAir } from './equipmentCatalogAirSeed.js';\n",
    "import { seedEquipmentCatalogVentilation } from './equipmentCatalogVentilationSeed.js';\n",
    "import { seedEquipmentCatalogHydronics } from './equipmentCatalogHydronicsSeed.js';\n",
    "import { seedEquipmentCatalogPeripheral } from './equipmentCatalogPeripheralSeed.js';\n",
    "import { seedEquipmentCatalogImages } from './equipmentCatalogImageSeed.js';\n",
    "import { seedEquipmentCatalogVisuals } from './equipmentCatalogVisualSeed.js';\n",
  ];
  for (const item of imports) text = removeOnce(text, item, 'database deferred catalog import');

  if (!text.includes('CORE_REFERENCE_META_KEY')) {
    const anchor = 'let databasePromise = null;\nlet catalogueEnrichmentPromise = null;\n';
    if (!text.includes(anchor)) throw new Error('database bootstrap state anchor not found');
    const helper = `let databasePromise = null;\nlet catalogueEnrichmentPromise = null;\nconst CORE_REFERENCE_META_KEY='reference_catalog_icpe_v2';\nconst CORE_EQUIPMENT_META_KEY='equipment_catalog_core_v3';\n\nasync function assurerReferentielsBase(db){\n  const rows=await db.getAllAsync(\`SELECT key FROM _meta WHERE key IN (?,?)\`,[CORE_REFERENCE_META_KEY,CORE_EQUIPMENT_META_KEY]);\n  const done=new Set((rows||[]).map((row)=>row.key));\n  if(!done.has(CORE_REFERENCE_META_KEY)) await require('./referenceCatalog.js').syncReferenceCatalog(db);\n  if(!done.has(CORE_EQUIPMENT_META_KEY)) await require('./equipmentCatalogSeed.js').seedEquipmentCatalog(db);\n}\n\nfunction chargeursEnrichissementCatalogue(){return [\n  ()=>require('./equipmentCatalogExtraSeed.js').seedEquipmentCatalogExtra,\n  ()=>require('./equipmentCatalogBreadthSeed.js').seedEquipmentCatalogBreadth,\n  ()=>require('./equipmentCatalogDeepSeed.js').seedEquipmentCatalogDeep,\n  ()=>require('./equipmentCatalogDeepSeed2.js').seedEquipmentCatalogDeep2,\n  ()=>require('./equipmentCatalogDeepSeed3.js').seedEquipmentCatalogDeep3,\n  ()=>require('./equipmentCatalogDeepSeed4.js').seedEquipmentCatalogDeep4,\n  ()=>require('./equipmentCatalogAirSeed.js').seedEquipmentCatalogAir,\n  ()=>require('./equipmentCatalogVentilationSeed.js').seedEquipmentCatalogVentilation,\n  ()=>require('./equipmentCatalogHydronicsSeed.js').seedEquipmentCatalogHydronics,\n  ()=>require('./equipmentCatalogPeripheralSeed.js').seedEquipmentCatalogPeripheral,\n  ()=>require('./equipmentCatalogImageSeed.js').seedEquipmentCatalogImages,\n  ()=>require('./equipmentCatalogVisualSeed.js').seedEquipmentCatalogVisuals,\n];}\n`;
    text = replaceOnce(text, anchor, helper, 'database bootstrap helpers');
  }

  const oldEnrichment = `      const db = await openAppDatabase();\n      await seedEquipmentCatalogExtra(db);\n      await seedEquipmentCatalogBreadth(db);\n      await seedEquipmentCatalogDeep(db);\n      await seedEquipmentCatalogDeep2(db);\n      await seedEquipmentCatalogDeep3(db);\n      await seedEquipmentCatalogDeep4(db);\n      await seedEquipmentCatalogAir(db);\n      await seedEquipmentCatalogVentilation(db);\n      await seedEquipmentCatalogHydronics(db);\n      await seedEquipmentCatalogPeripheral(db);\n      await seedEquipmentCatalogImages(db);\n      await seedEquipmentCatalogVisuals(db);\n      return db;`;
  const newEnrichment = `      const db = await openAppDatabase();\n      for(const charger of chargeursEnrichissementCatalogue()) await charger()(db);\n      return db;`;
  text = replaceOnce(text, oldEnrichment, newEnrichment, 'database lazy catalogue enrichment');
  text = replaceOnce(text,
    '      await syncReferenceCatalog(db);\n      await seedEquipmentCatalog(db);',
    '      await assurerReferentielsBase(db);',
    'database version-gated core catalogues'
  );
  write(path, text);

  const referencePath = 'database/referenceCatalog.js';
  text = read(referencePath);
  if (!text.includes("const REFERENCE_CATALOG_META_KEY = 'reference_catalog_icpe_v2';")) {
    text = replaceOnce(text, "const TEMPLATE_VERSION = 'ICPE-1';\n", "const TEMPLATE_VERSION = 'ICPE-1';\nconst REFERENCE_CATALOG_META_KEY = 'reference_catalog_icpe_v2';\n", 'reference catalog marker');
  }
  text = replaceOnce(text,
    'export async function syncReferenceCatalog(db) {\n  const entries = buildReferenceCatalog();',
    "export async function syncReferenceCatalog(db) {\n  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [REFERENCE_CATALOG_META_KEY]);\n  if (done) return 0;\n  const entries = buildReferenceCatalog();",
    'reference catalog guard'
  );
  if (!text.includes("[REFERENCE_CATALOG_META_KEY, '1']")) {
    text = replaceOnce(text,
      '  });\n  return entries.length;\n}',
      "    await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`, [REFERENCE_CATALOG_META_KEY, '1']);\n  });\n  return entries.length;\n}",
      'reference catalog marker commit'
    );
  }
  write(referencePath, text);

  const equipmentPath = 'database/equipmentCatalogSeed.js';
  text = read(equipmentPath);
  if (!text.includes("const EQUIPMENT_CATALOG_CORE_META_KEY='equipment_catalog_core_v3';")) {
    text = replaceOnce(text, "import { createId } from './ids.js';\n", "import { createId } from './ids.js';\nconst EQUIPMENT_CATALOG_CORE_META_KEY='equipment_catalog_core_v3';\n", 'equipment core marker');
  }
  text = replaceOnce(text,
    'export async function seedEquipmentCatalog(db){\n  const categoryIds=new Map(),brandIds=new Map();',
    "export async function seedEquipmentCatalog(db){\n  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`,[EQUIPMENT_CATALOG_CORE_META_KEY]);if(done)return 0;\n  const categoryIds=new Map(),brandIds=new Map();",
    'equipment core guard'
  );
  if (!text.includes("EQUIPMENT_CATALOG_CORE_META_KEY,'1'")) {
    text = replaceOnce(text,
      '  await seedRichVariants(db);\n}',
      "  await seedRichVariants(db);\n  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`,[EQUIPMENT_CATALOG_CORE_META_KEY,'1']);\n  return MODELS.length;\n}",
      'equipment core marker commit'
    );
  }
  write(equipmentPath, text);
}

function patchVisitPrefillCoalescing() {
  const path = 'visitPrefillDb.js';
  let text = read(path);
  if (!text.includes('const prefillTermines = new Set();')) {
    const anchor = "import { carryForwardPreviousVisit } from './visitCarryForwardDb.js';\n";
    if (!text.includes(anchor)) throw new Error('visit prefill cache anchor not found');
    text = text.replace(anchor, `${anchor}\nconst prefillTermines = new Set();\nconst prefillEnCours = new Map();\n`);
  }
  if (text.includes('export async function preremplirVisiteDepuisContexte(db, visiteId) {')) {
    text = text.replace('export async function preremplirVisiteDepuisContexte(db, visiteId) {', 'async function preremplirVisiteDepuisContexteInterne(db, visiteId) {');
  }
  if (!text.includes('export async function preremplirVisiteDepuisContexte(db, visiteId) {\n  const key = String(visiteId || \'\');')) {
    text += `\nexport async function preremplirVisiteDepuisContexte(db, visiteId) {\n  const key = String(visiteId || '');\n  if (!key) return;\n  if (prefillTermines.has(key)) return;\n  const existant = prefillEnCours.get(key);\n  if (existant) return existant;\n  const promise = preremplirVisiteDepuisContexteInterne(db, visiteId)\n    .then((resultat) => { prefillTermines.add(key); return resultat; })\n    .finally(() => prefillEnCours.delete(key));\n  prefillEnCours.set(key, promise);\n  return promise;\n}\n`;
  }
  write(path, text);
}

function patchVisitOpening() {
  const path = 'VisiteScreen.js';
  let text = read(path);
  const oldLoad = `    const db = await getDb();\n    await preremplirVisiteDepuisContexte(db, visiteId);\n    const v = await getVisite(visiteId);\n    const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';\n    const caissons = estVmc ? await chargerCaissonsVmc(visiteId) : [];\n    const progression = await recalculerProgressionVisite(db, visiteId);\n    invaliderCacheTrameGenerique(visiteId);\n    invaliderCacheRegulation(visiteId);\n    await Promise.all([\n      prechargerDonneesTrameGenerique(visiteId, true),\n      prechargerRegulation(visiteId, true),\n    ]);\n    setVmcCaissons(caissons);\n    setVisite(v ? { ...v, progression_pct: progression } : v);`;
  const newLoad = `    const db = await getDb();\n    await preremplirVisiteDepuisContexte(db, visiteId);\n    const v = await getVisite(visiteId);\n    const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';\n    const caissons = estVmc ? await chargerCaissonsVmc(visiteId) : [];\n    invaliderCacheTrameGenerique(visiteId);\n    invaliderCacheRegulation(visiteId);\n    // Afficher la visite dès que son contexte essentiel est prêt. Les agrégats et\n    // préchargements sont ensuite effectués sans bloquer le premier rendu.\n    setVmcCaissons(caissons);\n    setVisite(v);\n    setTimeout(() => {\n      Promise.allSettled([\n        recalculerProgressionVisite(db, visiteId).then((progression) => setVisite((courante) => courante ? { ...courante, progression_pct: progression } : courante)),\n        prechargerDonneesTrameGenerique(visiteId, false),\n        prechargerRegulation(visiteId, false),\n      ]).catch(() => {});\n    }, 0);`;
  text = replaceOnce(text, oldLoad, newLoad, 'visit non-blocking warmup');
  write(path, text);
}

function patchSiteOverviewReloads() {
  const path = 'SiteOverviewPanel.js';
  let text = read(path);
  text = replaceOnce(text,
    '  }, [siteId, mode, sousMenu, visiteDebut, visiteFin]);',
    '  }, [siteId, mode, sousMenu]);',
    'site overview avoid period full reload'
  );
  write(path, text);
}

function patchClientMap() {
  const path = 'ClientMapScreen.js';
  let text = read(path);
  text = replaceOnce(text,
    '        const r = await synchroniserCoordonneesClient(clientId);',
    "        await new Promise((resolve) => setTimeout(resolve, 180));\n        const r = await synchroniserCoordonneesClient(clientId, { max: 12 });",
    'map bounded automatic geocoding'
  );
  if (!text.includes('tracksViewChanges={false}')) {
    text = replaceOnce(text,
      '                  key={site.id}\n                  coordinate={{ latitude: Number(site.latitude), longitude: Number(site.longitude) }}',
      '                  key={site.id}\n                  tracksViewChanges={false}\n                  coordinate={{ latitude: Number(site.latitude), longitude: Number(site.longitude) }}',
      'map static marker rendering'
    );
  }
  write(path, text);
}

function patchCatalogueSearch() {
  const path = 'EquipmentCatalogueBrowser.js';
  let text = read(path);
  const state = "const [tab,setTab]=useState('marques');const [brands,setBrands]=useState([]);const [cats,setCats]=useState([]);const [models,setModels]=useState([]);const [search,setSearch]=useState('');";
  const stateNext = "const [tab,setTab]=useState('marques');const [brands,setBrands]=useState([]);const [cats,setCats]=useState([]);const [models,setModels]=useState([]);const [search,setSearch]=useState('');const [searchDb,setSearchDb]=useState('');";
  text = replaceOnce(text, state, stateNext, 'catalogue debounced search state');
  text = text.replace('rechercherCatalogueIntelligent({recherche:search})', 'rechercherCatalogueIntelligent({recherche:searchDb})');
  text = text.replace('},[search]);\n  useEffect(()=>{refresh();},[refresh]);', '},[searchDb]);\n  useEffect(()=>{refresh();},[refresh]);\n  useEffect(()=>{const timer=setTimeout(()=>setSearchDb(search.trim()),180);return()=>clearTimeout(timer);},[search]);');
  if (!text.includes('setSearchDb(search.trim())')) throw new Error('catalogue debounce effect not applied');
  write(path, text);
}

function patchVisualPackLazyTools() {
  const path = 'visual-packs/runtime/visualPackManager.js';
  let text = read(path);
  text = removeOnce(text, "import * as DocumentPicker from 'expo-document-picker';\n", 'visual pack lazy document picker');
  text = removeOnce(text, "import { unzip } from 'react-native-zip-archive';\n", 'visual pack lazy unzip');
  if (!text.includes("const DocumentPicker = require('expo-document-picker');")) {
    text = replaceOnce(text,
      'export async function importVisualPackZip() {\n  const picked = await DocumentPicker.getDocumentAsync({',
      "export async function importVisualPackZip() {\n  const DocumentPicker = require('expo-document-picker');\n  const { unzip } = require('react-native-zip-archive');\n  const picked = await DocumentPicker.getDocumentAsync({",
      'visual pack deferred import tools'
    );
  }
  write(path, text);
}

function patchReportImagePipeline() {
  const path = 'reportBuilder.js';
  let text = read(path);
  if (!text.includes('async function mapAvecConcurrenceRapport')) {
    const anchor = 'function chunk(array, taille) {\n';
    if (!text.includes(anchor)) throw new Error('report concurrency helper anchor not found');
    const helper = `async function mapAvecConcurrenceRapport(items, limite, worker) {\n  const resultats = new Array(items.length); let curseur = 0;\n  const workers = Array.from({ length: Math.min(Math.max(1, limite), items.length) }, async () => {\n    while (true) { const index = curseur++; if (index >= items.length) return; resultats[index] = await worker(items[index], index); }\n  });\n  await Promise.all(workers); return resultats;\n}\n\n`;
    text = text.replace(anchor, helper + anchor);
  }
  const oldPhotos = `  const prepared = [];\n  for (const p of items) {\n    const src = await imageRapportBase64(p.uri);\n    if (src) prepared.push({ ...p, src });\n  }`;
  const newPhotos = `  const prepared = (await mapAvecConcurrenceRapport(items, 2, async (p) => {\n    const src = await imageRapportBase64(p.uri);\n    return src ? { ...p, src } : null;\n  })).filter(Boolean);`;
  text = replaceOnce(text, oldPhotos, newPhotos, 'report bounded image preparation');
  write(path, text);
}

patchAppDeferredScreens();
patchLazyActionModules();
patchDatabaseBootstrap();
patchVisitPrefillCoalescing();
patchVisitOpening();
patchSiteOverviewReloads();
patchClientMap();
patchCatalogueSearch();
patchVisualPackLazyTools();
patchReportImagePipeline();
console.log('Runtime responsiveness v2 applied: deferred screens/modules, warm-start catalogues, non-blocking visit warmup, bounded map/search/report work.');
