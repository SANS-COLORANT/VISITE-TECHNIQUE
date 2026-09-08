const fs = require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function requireText(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbidText(text,needle,label){if(text.includes(needle))throw new Error(`${label}: eager dependency regression ${needle}`);}

const app=read('App.js');
requireText(app,'DEFERRED_SCREEN_LOADERS','deferred screen registry');
requireText(app,"Report:()=>require('./ReportScreen.js').ReportScreen",'deferred report screen');
requireText(app,"Lab3D:()=>require('./Lab3DScreen.js').Lab3DScreen",'deferred LAB 3D screen');
forbidText(app,"import { ReportScreen } from './ReportScreen.js'",'report startup import');
forbidText(app,"import { Lab3DScreen } from './Lab3DScreen.js'",'LAB startup import');

const home=read('HomeScreen.js');
requireText(home,'chargerBatchExcelModule','lazy home Excel module');
forbidText(home,"from './batchExcel.js'",'home XLSX startup import');

const siteVisits=read('SiteVisitesScreen.js');
requireText(siteVisits,'chargerBatchExcelSiteModule','lazy site Excel module');
forbidText(siteVisits,"import { exporterVisitesExcelEnLot } from './batchExcel.js'",'site XLSX eager import');

const documents=read('ClientDocumentsScreen.js');
requireText(documents,'chargerExportClientModule','lazy client export module');
forbidText(documents,"import { exporterDernieresVisitesClient } from './clientBatchExport.js'",'client documents eager export');

const visit=read('VisiteScreen.js');
requireText(visit,'Promise.allSettled([','non-blocking visit warmup');
requireText(visit,'prechargerDonneesTrameGenerique(visiteId, false)','coalesced generic preload');
requireText(visit,'chargerExcelExportModule','lazy visit Excel exporter');
forbidText(visit,"import { exporterEtPartager } from './excelExport.js'",'visit eager Excel exporter');

const prefill=read('visitPrefillDb.js');
requireText(prefill,'const prefillTermines = new Set();','prefill memory cache');
requireText(prefill,'const prefillEnCours = new Map();','prefill in-flight coalescing');
requireText(prefill,'preremplirVisiteDepuisContexteInterne','prefill internal implementation');

const database=read('database/index.js');
requireText(database,'assurerReferentielsBase','version gated database bootstrap');
requireText(database,'chargeursEnrichissementCatalogue','lazy catalogue enrichment');
forbidText(database,"import { seedEquipmentCatalogDeep }",'deep catalogue startup import');
forbidText(database,"import { seedEquipmentCatalog }",'core catalogue startup import');

const reference=read('database/referenceCatalog.js');
requireText(reference,"REFERENCE_CATALOG_META_KEY = 'reference_catalog_icpe_v2'",'reference catalogue version marker');
const equipment=read('database/equipmentCatalogSeed.js');
requireText(equipment,"EQUIPMENT_CATALOG_CORE_META_KEY='equipment_catalog_core_v3'",'equipment catalogue core marker');

const map=read('ClientMapScreen.js');
requireText(map,'tracksViewChanges={false}','static Android map markers');
requireText(map,'synchroniserCoordonneesClient(clientId, { max: 12 })','bounded automatic geocoding');

const catalogue=read('EquipmentCatalogueBrowser.js');
requireText(catalogue,'setSearchDb(search.trim()),180','debounced catalogue search');

const visual=read('visual-packs/runtime/visualPackManager.js');
requireText(visual,"const DocumentPicker = require('expo-document-picker');",'lazy visual pack picker');
forbidText(visual,"import * as DocumentPicker from 'expo-document-picker'",'visual pack picker startup import');

const report=read('reportBuilder.js');
requireText(report,'mapAvecConcurrenceRapport(items, 2','bounded image pipeline');

const overview=read('SiteOverviewPanel.js');
requireText(overview,'}, [siteId, mode, sousMenu]);','site overview stable loader dependencies');

console.log('Runtime responsiveness v2 contract validated: heavy modules deferred, catalogues version-gated, visit warmup non-blocking, map/search/report work bounded.');
