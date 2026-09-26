/**
 * Préférences d'interface lues de façon synchrone (base SQLite dédiée, très
 * petite) : elles doivent être connues avant la création des styles, par
 * exemple le mode « Plein soleil ». En cas d'échec, valeurs par défaut.
 */
import * as SQLite from 'expo-sqlite';

let db = null;
const memory = new Map();

function open() {
  if (db) return db;
  try {
    db = SQLite.openDatabaseSync('metra-ui-prefs.db');
    db.execSync('CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY NOT NULL, value TEXT)');
  } catch (e) {
    db = null;
  }
  return db;
}

export function getPrefSync(key, fallback = null) {
  if (memory.has(key)) return memory.get(key);
  try {
    const row = open()?.getFirstSync('SELECT value FROM prefs WHERE key=?', [key]);
    const value = row?.value ?? fallback;
    memory.set(key, value);
    return value;
  } catch (e) {
    return fallback;
  }
}

export function setPrefSync(key, value) {
  memory.set(key, value == null ? null : String(value));
  try {
    open()?.runSync('INSERT INTO prefs(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value == null ? null : String(value)]);
  } catch (e) {
    console.warn('Préférence non enregistrée', key, e);
  }
}

export const PREFS = Object.freeze({
  pleinSoleil: 'ui.pleinSoleil',
  ongletsEnBas: 'ui.ongletsEnBas',
  dossierSauvegardeAuto: 'backup.autoDirUri',
  derniereSauvegardeAuto: 'backup.autoLastAt',
});
