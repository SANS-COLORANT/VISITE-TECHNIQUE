const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function requireText(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbidText(text,needle,label){if(text.includes(needle))throw new Error(`${label}: forbidden ${needle}`);}

const app=read('App.js');
requireText(app,'DEFERRED_SCREEN_LOADERS','deferred screen registry');
requireText(app,"Report:()=>require('./ReportScreen.js').ReportScreen",'deferred report');
requireText(app,"Lab3D:()=>require('./Lab3DScreen.js').Lab3DScreen",'deferred LAB3D');
requireText(app,"ClientDocuments:()=>require('./ClientDocumentsScreen.js').ClientDocumentsScreen",'deferred client documents');
requireText(app,"import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';",'hydraulic build compatibility');
forbidText(app,"import { ReportScreen } from './ReportScreen.js';",'eager report screen');
forbidText(app,"import { Lab3DScreen } from './Lab3DScreen.js';",'eager LAB3D screen');

const home=read('HomeScreen.js');
requireText(home,'chargerBatchExcelModule','lazy home Excel');
forbidText(home,"from './batchExcel.js';",'eager home XLSX graph');

// En source, l'import ne contient que l'exporteur. Le prépatch Android de type
// ajoute ensuite listerTypesVisitesClient. Les deux formes sont légitimes.
const docs=read('ClientDocumentsScreen.js');
if(!/import\s*\{\s*exporterDernieresVisitesClient(?:\s*,\s*listerTypesVisitesClient)?\s*\}\s*from\s*['"]\.\/clientBatchExport\.js['"]\s*;/.test(docs)){
  throw new Error('client typed export build compatibility: exporter import missing');
}

const visit=read('VisiteScreen.js');
requireText(visit,'chargerExcelExportModule','lazy visit Excel export');
requireText(visit,'chargerPreAllumageReportModule','lazy preallumage report export');
requireText(visit,'const VisitPanelHost = memo','memoized visit panel host');
requireText(visit,'const pagerX = useRef(new Animated.Value(0)).current','single native visit pager track');
requireText(visit,'mountedPanelIds','small mounted panel window');
requireText(visit,'HEAVY_LAZY_PANELS','heavy panel lazy policy');
requireText(visit,'if (!swipeHandlers.current)','stable PanResponder allocation');
requireText(visit,"gestureModeRef.current = localMode ? 'preallumage-local' : 'tabs'",'preallumage local swipe separated from tab pager');
requireText(visit,'preAllumageLocalSwipeRef.current?.(direction, false)','preallumage local dry-run before animation');
requireText(visit,"onRegisterLocalSwipe={trame.id === 'pre_allumage'",'preallumage local handler registration');
requireText(visit,'left: index * pagerWidth','neighbor panel positioning');
requireText(visit,'pointerEvents={panelId === activeTab ? \'auto\' : \'none\'}','inactive panel touch isolation');
forbidText(visit,'basculerApresSortie','two-phase swipe transition removed');
forbidText(visit,'translateX.setValue(direction > 0 ? width : -width)','old enter animation reset removed');
forbidText(visit,"import { exporterEtPartager } from './excelExport.js';",'eager visit Excel export');
forbidText(visit,"import { exporterRapportPreAllumage } from './preAllumageReportExporter.js';",'eager PRE report export');

const siteVisits=read('SiteVisitesScreen.js');
requireText(siteVisits,'function chargerBatchExcel(){return require(\'./batchExcel.js\');}','lazy site batch Excel');
forbidText(siteVisits,"import { exporterVisitesExcelEnLot } from './batchExcel.js';",'eager site batch Excel');
requireText(siteVisits,'SITE_VISITS_FAST_CACHE','site visit instant cache');
requireText(siteVisits,'listerVisitesSiteAvecEtatIntranet','batched site visit Intranet state');

const database=read('database/index.js');
requireText(database,'CORE_REFERENCE_META_KEY','reference version gate');
requireText(database,'CORE_EQUIPMENT_META_KEY','equipment core version gate');
requireText(database,'assurerReferentielsBase','catalogue warm-start guard');
requireText(database,'chargeursEnrichissementCatalogue','lazy catalogue enrichments');
forbidText(database,"import { seedEquipmentCatalogDeep }",'eager deep catalogue seed');
forbidText(database,"import { seedEquipmentCatalog }",'eager core catalogue seed');

const prefill=read('visitPrefillDb.js');
requireText(prefill,'const prefillTermines = new Set();','prefill completed cache');
requireText(prefill,'const prefillEnCours = new Map();','prefill in-flight cache');
requireText(prefill,'visit_prefill_v','durable prefill marker');
requireText(prefill,"SELECT value FROM _meta WHERE key=? LIMIT 1",'prefill survives app restart');
requireText(prefill,'preremplirVisiteDepuisContexteInterne','prefill coalescing wrapper');

const carry=read('visitCarryForwardDb.js');
requireText(carry,'function chunks(rows, size)','carry-forward batch helper');
requireText(carry,'VALUES ${placeholders}','batched carry-forward inserts');
requireText(carry,"entite_id IN (${placeholders})",'batched network provenance lookup');

const overview=read('SiteOverviewPanel.js');
requireText(overview,'SITE_OVERVIEW_FAST_CACHE','site overview instant cache');
requireText(overview,'Promise.all([','site overview parallel reads');
requireText(overview,'}, [siteId, mode, sousMenu]);','stable site overview loader');

const clientSites=read('ClientSitesScreen.js');
requireText(clientSites,'CLIENT_SITES_FAST_CACHE','client sites instant cache');
requireText(clientSites,'appliquerSites([...sites','optimistic site creation');

const map=read('ClientMapScreen.js');
requireText(map,'synchroniserCoordonneesClient(clientId, { max: 12 })','bounded automatic geocoding');
requireText(map,'tracksViewChanges={false}','static Android map markers');
requireText(map,'synchroniserCoordonneesClient(clientId, { force: true })','full manual geocoding preserved');

const catalogue=read('EquipmentCatalogueBrowser.js');
requireText(catalogue,"const [searchDb,setSearchDb]=useState('')",'catalogue debounced state');
requireText(catalogue,'setSearchDb(search.trim()),180','catalogue debounce');
requireText(catalogue,'rechercherCatalogueIntelligent({recherche:searchDb})','catalogue DB search uses debounce');

const visual=read('visual-packs/runtime/visualPackManager.js');
requireText(visual,"const DocumentPicker = require('expo-document-picker');",'lazy visual pack picker');
requireText(visual,"const { unzip } = require('react-native-zip-archive');",'lazy visual pack unzip');
forbidText(visual,"import * as DocumentPicker from 'expo-document-picker';",'eager visual pack picker');

console.log('Runtime responsiveness v5 contract validated: visit swipe uses a stable native pager with warm neighbours and memoized panels; PRE local swipes remain isolated; startup modules and Excel paths are deferred, new-visit prefill is durable/coalesced, network/meter carry-forward is batched, page caches paint before background refresh, map/search work stays bounded.');