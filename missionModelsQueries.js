/**
 * Missions à la carte — briques d'une Mission et modèles enregistrés.
 * Fonctions pures recevant la connexion `db` (testées sous Node avec node:sqlite).
 * Tables Missions uniquement : aucune donnée Intranet.
 */
import { parseMissionModules, serializeMissionModules } from './missionModules.js';

const text = (value) => {
  const out = String(value ?? '').trim();
  return out || null;
};

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function queryMissionModules(db, missionId) {
  const row = await db.getFirstAsync('SELECT modules_json FROM missions WHERE id=?', [missionId]);
  return parseMissionModules(row?.modules_json);
}

/** Enregistre les briques d'une Mission ; renvoie la valeur précédente (pour « Annuler »). */
export async function saveMissionModules(db, missionId, modules) {
  const row = await db.getFirstAsync('SELECT modules_json FROM missions WHERE id=?', [missionId]);
  if (!row) throw new Error('Mission introuvable.');
  await db.runAsync('UPDATE missions SET modules_json=?, updated_at=? WHERE id=?', [serializeMissionModules(modules), new Date().toISOString(), missionId]);
  return row.modules_json ?? null;
}

export async function restoreMissionModulesRaw(db, missionId, raw) {
  await db.runAsync('UPDATE missions SET modules_json=?, updated_at=? WHERE id=?', [raw ?? null, new Date().toISOString(), missionId]);
}

export async function queryMissionModels(db) {
  return db.getAllAsync(
    `SELECT * FROM mission_models
      ORDER BY CASE WHEN last_used_at IS NULL THEN 1 ELSE 0 END, last_used_at DESC, label COLLATE NOCASE`
  );
}

/** Crée un modèle depuis une Mission (famille, type, briques, disposition). */
export async function insertMissionModel(db, { label, description = null, family = null, type = null, modules = null, layoutJson = null, formIds = [] }) {
  const name = text(label);
  if (!name) throw new Error('Nom du modèle requis.');
  const id = newId('mmod');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO mission_models(id,label,description,family,type,modules_json,layout_json,forms_json,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id, name, text(description), text(family), text(type), serializeMissionModules(modules), layoutJson || null, formIds?.length ? JSON.stringify([...new Set(formIds)]) : null, now, now]
  );
  return id;
}

export async function removeMissionModel(db, modelId) {
  await db.runAsync('DELETE FROM mission_models WHERE id=?', [modelId]);
}

export async function markMissionModelUsed(db, modelId) {
  await db.runAsync('UPDATE mission_models SET use_count=use_count+1, last_used_at=? WHERE id=?', [new Date().toISOString(), modelId]);
}

/** Trames d'un modèle (identifiants), tolérant aux valeurs anciennes. */
export function modelFormIds(model) {
  try {
    const list = JSON.parse(model?.forms_json || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
