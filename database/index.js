import * as SQLite from 'expo-sqlite';
import { DATABASE_NAME } from './constants.js';
import { migrateDatabase, verifyDatabaseIntegrity } from './migrate.js';
import { syncReferenceCatalog } from './referenceCatalog.js';
import { seedEquipmentCatalog } from './equipmentCatalogSeed.js';
import { seedEquipmentCatalogExtra } from './equipmentCatalogExtraSeed.js';
import { seedEquipmentCatalogBreadth } from './equipmentCatalogBreadthSeed.js';
import { seedEquipmentCatalogImages } from './equipmentCatalogImageSeed.js';

let databasePromise = null;

export function openAppDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA busy_timeout = 3000;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await migrateDatabase(db);
      await syncReferenceCatalog(db);
      await seedEquipmentCatalog(db);
      await seedEquipmentCatalogExtra(db);
      await seedEquipmentCatalogBreadth(db);
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
