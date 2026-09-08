const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8');}
function write(path,text){fs.writeFileSync(path,text);}
function requireAnchor(text,needle,label){if(!text.includes(needle))throw new Error(`${label}: anchor not found`);}

function patchHome(){
  const path='HomeScreen.js';
  let text=read(path);
  text=text.replace("import { supprimerVisiteComplete, getResumeSuppressionClient, supprimerClientComplet } from './entityManagementDb.js';\n",'');
  if(!text.includes('function chargerEntityManagementModule()')){
    const anchor="function chargerBatchExcelModule(){return require('./batchExcel.js');}";
    requireAnchor(text,anchor,'Home lazy entity module');
    text=text.replace(anchor,`${anchor}\nfunction chargerEntityManagementModule(){return require('./entityManagementDb.js');}`);
  }
  text=text.replace(/await supprimerVisiteComplete\(v\.id\)/g,"await chargerEntityManagementModule().supprimerVisiteComplete(v.id)");
  text=text.replace(/await getResumeSuppressionClient\(client\.id\)/g,"await chargerEntityManagementModule().getResumeSuppressionClient(client.id)");
  text=text.replace(/await supprimerClientComplet\(client\.id\)/g,"await chargerEntityManagementModule().supprimerClientComplet(client.id)");
  write(path,text);
}

function patchDb(){
  const path='db.js';
  let text=read(path);
  text=text.replace("import { TRAME_DATA, PRESCRIPTIONS } from './data.js';\n",'');
  const persistentImport=`import {\n  listerMaterielPersistant,\n  ajouterMaterielPersistant,\n  upsertMaterielPersistant,\n  retirerMaterielPersistant,\n  listerHistoriqueEquipement,\n} from './persistentEquipmentDb.js';\n`;
  text=text.replace(persistentImport,'');
  if(!text.includes('function chargerDonneesLegacy()')){
    const anchor="import { createId } from './database/ids.js';\n";
    requireAnchor(text,anchor,'db lazy dependency helpers');
    text=text.replace(anchor,`${anchor}\nfunction chargerDonneesLegacy(){return require('./data.js');}\nfunction chargerMaterielPersistant(){return require('./persistentEquipmentDb.js');}\n`);
  }
  text=text.replace(
    "async function seedBibliothequeSiNecessaire(db){const deja=await db.getFirstAsync(`SELECT value FROM _meta WHERE key = 'biblio_seeded'`);if(deja)return;for(const[cle,options]of Object.entries(PRESCRIPTIONS))",
    "async function seedBibliothequeSiNecessaire(db){const deja=await db.getFirstAsync(`SELECT value FROM _meta WHERE key = 'biblio_seeded'`);if(deja)return;const {PRESCRIPTIONS}=chargerDonneesLegacy();for(const[cle,options]of Object.entries(PRESCRIPTIONS))"
  );
  text=text.replace(
    "async function preremplirValeursClassiques(visiteId){const db=await getDb(),inserts=[];Object.entries(TRAME_DATA)",
    "async function preremplirValeursClassiques(visiteId){const db=await getDb(),inserts=[];const {TRAME_DATA}=chargerDonneesLegacy();Object.entries(TRAME_DATA)"
  );
  text=text.replace('async function listerMateriel(id){return listerMaterielPersistant(id);}',"async function listerMateriel(id){return chargerMaterielPersistant().listerMaterielPersistant(id);}");
  text=text.replace('async function ajouterMateriel(visiteId){return ajouterMaterielPersistant(visiteId);}',"async function ajouterMateriel(visiteId){return chargerMaterielPersistant().ajouterMaterielPersistant(visiteId);}");
  text=text.replace('async function upsertMaterielChamp(id,cle,valeur){return upsertMaterielPersistant(id,cle,valeur);}',"async function upsertMaterielChamp(id,cle,valeur){return chargerMaterielPersistant().upsertMaterielPersistant(id,cle,valeur);}");
  text=text.replace('async function supprimerMateriel(id){return retirerMaterielPersistant(id);}',"async function supprimerMateriel(id){return chargerMaterielPersistant().retirerMaterielPersistant(id);}");
  text=text.replace(/return listerHistoriqueEquipement\(([^)]*)\);/g,"return chargerMaterielPersistant().listerHistoriqueEquipement($1);");
  if(text.includes("from './data.js'"))throw new Error('db data.js eager import still present');
  if(text.includes("from './persistentEquipmentDb.js'"))throw new Error('db persistent equipment eager import still present');
  if(!text.includes('const {PRESCRIPTIONS}=chargerDonneesLegacy()'))throw new Error('db prescriptions lazy load not applied');
  if(!text.includes('const {TRAME_DATA}=chargerDonneesLegacy()'))throw new Error('db trame lazy load not applied');
  write(path,text);
}

function patchDatabasePragmas(){
  const path='database/index.js';
  let text=read(path);
  const old=`async function configurerSQLitePourTablette(db) {\n  await db.execAsync('PRAGMA journal_mode = WAL;');\n  await db.execAsync('PRAGMA synchronous = NORMAL;');\n  await db.execAsync('PRAGMA cache_size = -16384;');\n  await db.execAsync('PRAGMA temp_store = MEMORY;');\n  await db.execAsync('PRAGMA busy_timeout = 3000;');\n  await db.execAsync('PRAGMA foreign_keys = ON;');\n}`;
  const next=`async function configurerSQLitePourTablette(db) {\n  // Un seul passage JS -> natif au démarrage au lieu de six appels successifs.\n  await db.execAsync(\`\n    PRAGMA journal_mode = WAL;\n    PRAGMA synchronous = NORMAL;\n    PRAGMA cache_size = -16384;\n    PRAGMA temp_store = MEMORY;\n    PRAGMA busy_timeout = 3000;\n    PRAGMA foreign_keys = ON;\n  \`);\n}`;
  if(!text.includes(next)){
    requireAnchor(text,old,'SQLite startup pragmas');
    text=text.replace(old,next);
  }
  write(path,text);
}

patchHome();
patchDb();
patchDatabasePragmas();
console.log('Startup dependency graph trimmed and SQLite startup bridge calls collapsed: fewer modules and native round-trips before first interactive screen.');
