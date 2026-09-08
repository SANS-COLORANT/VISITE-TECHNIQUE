const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function requireText(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbidText(text,needle,label){if(text.includes(needle))throw new Error(`${label}: forbidden ${needle}`);}

const app=read('App.js');
requireText(app,'DEFERRED_SCREEN_LOADERS','deferred screen registry');
requireText(app,"Report:()=>require('./ReportScreen.js').ReportScreen",'deferred report');
requireText(app,"Lab3D:()=>require('./Lab3DScreen.js').Lab3DScreen",'deferred LAB3D');
requireText(app,"import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';",'hydraulic build compatibility');
forbidText(app,"import { ReportScreen } from './ReportScreen.js';",'eager report screen');
forbidText(app,"import { Lab3DScreen } from './Lab3DScreen.js';",'eager LAB3D screen');

const home=read('HomeScreen.js');
requireText(home,'chargerBatchExcelModule','lazy home Excel');
forbidText(home,"from './batchExcel.js';",'eager home XLSX graph');

const docs=read('ClientDocumentsScreen.js');
requireText(docs,'chargerExportClientModule','lazy client export');
forbidText(docs,"import { exporterDernieresVisitesClient } from './clientBatchExport.js';",'eager client export');

const visit=read('VisiteScreen.js');
requireText(visit,'chargerExcelExportModule','lazy visit Excel export');
requireText(visit,'chargerPreAllumageReportModule','lazy preallumage report export');
forbidText(visit,"import { exporterEtPartager } from './excelExport.js';",'eager visit Excel export');
forbidText(visit,"import { exporterRapportPreAllumage } from './preAllumageReportExporter.js';",'eager PRE report export');

// Le build historique s'appuie encore sur cet import pour patcher l'export typé.
const siteVisits=read('SiteVisitesScreen.js');
requireText(siteVisits,"import { exporterVisitesExcelEnLot } from './batchExcel.js';",'site export build compatibility');

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
requireText(prefill,'preremplirVisiteDepuisContexteInterne','prefill coalescing wrapper');

const overview=read('SiteOverviewPanel.js');
requireText(overview,'}, [siteId, mode, sousMenu]);','stable site overview loader');

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

console.log('Runtime responsiveness v3 contract validated: startup modules deferred, catalogue warm starts gated, prefill coalesced, map/search work bounded, build compatibility preserved.');
