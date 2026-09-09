import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from './constants.js';
import { migrateDatabase, verifyDatabaseIntegrity } from './migrate.js';
let databasePromise = null;
let catalogueEnrichmentPromise = null;
const CORE_REFERENCE_META_KEY='reference_catalog_icpe_v2';
const CORE_EQUIPMENT_META_KEY='equipment_catalog_core_v3';

async function assurerReferentielsBase(db){
  const rows=await db.getAllAsync(`SELECT key FROM _meta WHERE key IN (?,?)`,[CORE_REFERENCE_META_KEY,CORE_EQUIPMENT_META_KEY]);
  const done=new Set((rows||[]).map((row)=>row.key));
  if(!done.has(CORE_REFERENCE_META_KEY)){await require('./referenceCatalog.js').syncReferenceCatalog(db);await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`,[CORE_REFERENCE_META_KEY,'1']);}
  if(!done.has(CORE_EQUIPMENT_META_KEY)){await require('./equipmentCatalogSeed.js').seedEquipmentCatalog(db);await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`,[CORE_EQUIPMENT_META_KEY,'1']);}
}

function chargeursEnrichissementCatalogue(){return [
 ()=>require('./equipmentCatalogExtraSeed.js').seedEquipmentCatalogExtra,()=>require('./equipmentCatalogBreadthSeed.js').seedEquipmentCatalogBreadth,
 ()=>require('./equipmentCatalogDeepSeed.js').seedEquipmentCatalogDeep,()=>require('./equipmentCatalogDeepSeed2.js').seedEquipmentCatalogDeep2,
 ()=>require('./equipmentCatalogDeepSeed3.js').seedEquipmentCatalogDeep3,()=>require('./equipmentCatalogDeepSeed4.js').seedEquipmentCatalogDeep4,
 ()=>require('./equipmentCatalogAirSeed.js').seedEquipmentCatalogAir,()=>require('./equipmentCatalogVentilationSeed.js').seedEquipmentCatalogVentilation,
 ()=>require('./equipmentCatalogHydronicsSeed.js').seedEquipmentCatalogHydronics,()=>require('./equipmentCatalogPeripheralSeed.js').seedEquipmentCatalogPeripheral,
 ()=>require('./equipmentCatalogImageSeed.js').seedEquipmentCatalogImages,()=>require('./equipmentCatalogVisualSeed.js').seedEquipmentCatalogVisuals,
];}

function installerCompatibiliteVisite(db) {
  if (db.__visiteMapCompatInstalled) return;
  const getAllAsyncNatif = db.getAllAsync.bind(db);
  db.getAllAsync = async (sql, params = []) => {
    const rows = await getAllAsyncNatif(sql, params);
    const requete = String(sql || '').toLowerCase();
    if (Array.isArray(rows) && requete.includes('from champs_visite')) {
      for (const row of rows) rows[`${row.section_code}||${row.cle}`] = row.valeur;
    } else if (Array.isArray(rows) && requete.includes('from controles_visite')) {
      for (const row of rows) rows[`${row.section_code}||${row.cle}`] = { avis: row.avis, commentaire: row.commentaire };
    }
    return rows;
  };
  Object.defineProperty(db, '__visiteMapCompatInstalled', { value: true, enumerable: false });
}

async function configurerSQLitePourTablette(db) {
  // Un seul passage JS -> natif au démarrage au lieu de six appels successifs.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -16384;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 3000;
    PRAGMA foreign_keys = ON;
  `);
}

export async function ensureEquipmentCatalogReady() {
  if (!catalogueEnrichmentPromise) {
    catalogueEnrichmentPromise = (async () => {
      const db = await openAppDatabase();
      for(const charger of chargeursEnrichissementCatalogue()) await charger()(db);
      return db;
    })().catch((error) => {
      catalogueEnrichmentPromise = null;
      throw error;
    });
  }
  return catalogueEnrichmentPromise;
}

export function openAppDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await configurerSQLitePourTablette(db);
      installerCompatibiliteVisite(db);
      await migrateDatabase(db);
      await assurerReferentielsBase(db);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Ferme la connexion native afin de pouvoir remplacer la base pendant une restauration. */
export async function closeAppDatabase() {
  const promise = databasePromise;
  databasePromise = null;
  catalogueEnrichmentPromise = null;
  if (!promise) return;
  try {
    const db = await promise;
    await db.closeAsync();
  } catch {
    // La promesse peut déjà être en échec ; les références sont malgré tout remises à zéro.
  }
}

export { verifyDatabaseIntegrity };
