/** Bibliothèque locale versionnée, sauvegardée avec la base METRA. */
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { registerLocalTrame, clearLocalTrames, listerTramesCatalogue } from './trameRegistry.js';
import { validateLocalTrame } from './trameLibrary.js';

const PREFIX = 'trame_library::';
export async function loadLocalTrames() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT key,value FROM _meta WHERE key LIKE ?', [`${PREFIX}%`]);
  const errors = [];
  clearLocalTrames();
  for (const row of rows) {
    try { registerLocalTrame(validateLocalTrame(JSON.parse(row.value))); }
    catch (e) { errors.push(`${row.key}: ${e.message}`); }
  }
  return errors;
}

export async function saveLocalTrame(draft, options = {}) {
  const db = await getDb();
  const familyId = draft.familyId || draft.id;
  const latest = listerTramesCatalogue().find((t) => (t.familyId || t.id) === familyId);
  const definition = JSON.parse(JSON.stringify(draft));
  definition.id = `local_${createId().replace(/[^a-z0-9]/gi, '').slice(0, 50)}`;
  definition.familyId = familyId;
  definition.version = Math.max(Number(latest?.version || 0), Number(draft.version || 0)) + 1;
  definition.libraryManaged = true;
  definition.actif = options.actif ?? true;
  validateLocalTrame(definition);
  await db.runAsync('INSERT INTO _meta(key,value) VALUES(?,?)', [PREFIX + definition.id, JSON.stringify(definition)]);
  registerLocalTrame(definition);
  return definition;
}

export async function importLocalTrame(definition) {
  validateLocalTrame(definition);
  const db = await getDb();
  const existing = await db.getFirstAsync('SELECT value FROM _meta WHERE key=?', [PREFIX + definition.id]);
  if (existing) {
    if (existing.value !== JSON.stringify(definition)) throw new Error('Cette version de trame existe avec un contenu différent. Crée une nouvelle version depuis Réglages.');
  } else {
    await db.runAsync('INSERT INTO _meta(key,value) VALUES(?,?)', [PREFIX + definition.id, JSON.stringify(definition)]);
  }
  registerLocalTrame(definition);
  return definition;
}

export async function setLocalTrameActive(definition, actif) {
  return saveLocalTrame(definition, { actif: Boolean(actif) });
}
