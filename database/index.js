import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from './constants.js';
import { migrateDatabase, verifyDatabaseIntegrity } from './migrate.js';
import { syncReferenceCatalog } from './referenceCatalog.js';
import { seedEquipmentCatalog } from './equipmentCatalogSeed.js';
import { seedEquipmentCatalogExtra } from './equipmentCatalogExtraSeed.js';
import { seedEquipmentCatalogBreadth } from './equipmentCatalogBreadthSeed.js';
import { seedEquipmentCatalogDeep } from './equipmentCatalogDeepSeed.js';
import { seedEquipmentCatalogDeep2 } from './equipmentCatalogDeepSeed2.js';
import { seedEquipmentCatalogDeep3 } from './equipmentCatalogDeepSeed3.js';
import { seedEquipmentCatalogDeep4 } from './equipmentCatalogDeepSeed4.js';
import { seedEquipmentCatalogAir } from './equipmentCatalogAirSeed.js';
import { seedEquipmentCatalogHydronics } from './equipmentCatalogHydronicsSeed.js';
import { seedEquipmentCatalogPeripheral } from './equipmentCatalogPeripheralSeed.js';
import { seedEquipmentCatalogImages } from './equipmentCatalogImageSeed.js';

let databasePromise = null;

/**
 * L'ancien écran Visite utilise les résultats de champs_visite/controles_visite
 * à la fois comme tableau ET comme dictionnaire "section||clé". Expo SQLite
 * renvoie uniquement un tableau. On enrichit donc le tableau avec des propriétés
 * indexées, sans casser les autres consommateurs qui continuent à itérer dessus.
 */
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

export function openAppDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA busy_timeout = 3000;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      installerCompatibiliteVisite(db);
      await migrateDatabase(db);
      await syncReferenceCatalog(db);
      await seedEquipmentCatalog(db);
      await seedEquipmentCatalogExtra(db);
      await seedEquipmentCatalogBreadth(db);
      await seedEquipmentCatalogDeep(db);
      await seedEquipmentCatalogDeep2(db);
      await seedEquipmentCatalogDeep3(db);
      await seedEquipmentCatalogDeep4(db);
      await seedEquipmentCatalogAir(db);
      await seedEquipmentCatalogHydronics(db);
      await seedEquipmentCatalogPeripheral(db);
      await seedEquipmentCatalogImages(db);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export { verifyDatabaseIntegrity };
