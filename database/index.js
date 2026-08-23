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
