const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function requireText(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbidText(text,needle,label){if(text.includes(needle))throw new Error(`${label}: forbidden ${needle}`);}

const home=read('HomeScreen.js');
requireText(home,'chargerEntityManagementModule','lazy Home deletion module');
forbidText(home,"from './entityManagementDb.js'",'Home eager FileSystem deletion graph');
requireText(home,'chargerBatchExcelModule','lazy Home Excel module');
forbidText(home,"from './batchExcel.js'",'Home eager XLSX graph');

const db=read('db.js');
requireText(db,"function chargerDonneesLegacy(){return require('./data.js');}",'lazy ICPE data helper');
requireText(db,"function chargerMaterielPersistant(){return require('./persistentEquipmentDb.js');}",'lazy persistent equipment helper');
forbidText(db,"import { TRAME_DATA, PRESCRIPTIONS } from './data.js';",'eager ICPE data object');
forbidText(db,"from './persistentEquipmentDb.js'",'eager persistent equipment repository');
requireText(db,'const {PRESCRIPTIONS}=chargerDonneesLegacy()','on-demand prescriptions seed');
requireText(db,'const {TRAME_DATA}=chargerDonneesLegacy()','on-demand legacy visit defaults');
requireText(db,'chargerMaterielPersistant().listerMaterielPersistant','on-demand material listing');
requireText(db,'async function listerHistoriqueEquipement(...args){return chargerMaterielPersistant().listerHistoriqueEquipement(...args);}','lazy equipment history export binding');

const database=read('database/index.js');
requireText(database,'Un seul passage JS -> natif au démarrage','single SQLite startup bridge call');
forbidText(database,"await db.execAsync('PRAGMA synchronous = NORMAL;')",'separate SQLite pragma bridge call');
requireText(database,'PRAGMA journal_mode = WAL;','WAL retained');
requireText(database,'PRAGMA foreign_keys = ON;','foreign keys retained');

console.log('Startup dependency graph contract validated: Home avoids deletion/XLSX modules, db.js defers heavy data repositories with all exported bindings intact, and SQLite startup PRAGMAs use one native bridge call.');
