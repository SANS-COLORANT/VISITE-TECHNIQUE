import { getDb } from './db.js';

export const THEME_CLASSIC = 'classic';
export const THEME_ANIMATED = 'animated';

const META_KEY = 'app_theme_mode';

export async function getAppThemeMode() {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = ?`, [META_KEY]);
  return row?.value === THEME_ANIMATED ? THEME_ANIMATED : THEME_CLASSIC;
}

export async function setAppThemeMode(mode) {
  const value = mode === THEME_ANIMATED ? THEME_ANIMATED : THEME_CLASSIC;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [META_KEY, value]
  );
  return value;
}
