import { getDb } from './db.js';

const HYDRAULIC_SCHEMA_VISIBLE_KEY = 'feature_hydraulic_schema_visible';

export async function getHydraulicSchemaVisible() {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [HYDRAULIC_SCHEMA_VISIBLE_KEY]);
  return String(row?.value || '') === '1';
}

export async function setHydraulicSchemaVisible(enabled) {
  const db = await getDb();
  const value = enabled ? '1' : '0';
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [HYDRAULIC_SCHEMA_VISIBLE_KEY, value]
  );
  return enabled;
}
