/**
 * Enrichissements par réseau et par visite, schéma SQLite existant.
 * Aucune écriture lors de l'ouverture du formulaire.
 */
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { NETWORK_POINTS_KEY, NETWORK_SCHEDULE_KEY, parseNetworkPoints, parseWeeklySchedule } from './networkProgramming.js';
const ALLOWED = new Set([NETWORK_POINTS_KEY, NETWORK_SCHEDULE_KEY]);
export async function getNetworkProgramming(reseauId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT cle,valeur FROM attributs_libres WHERE entite_type=? AND entite_id=? AND cle IN (?,?)',
    ['reseau',reseauId,NETWORK_POINTS_KEY,NETWORK_SCHEDULE_KEY]);
  const map = new Map(rows.map(row=>[row.cle,row.valeur]));
  return {
    points: parseNetworkPoints(map.get(NETWORK_POINTS_KEY)),
    schedule: parseWeeklySchedule(map.get(NETWORK_SCHEDULE_KEY)),
    hasPoints: map.has(NETWORK_POINTS_KEY),
    hasSchedule: map.has(NETWORK_SCHEDULE_KEY),
  };
}
export async function saveNetworkProgrammingDraft(reseauId, kind, raw) {
  const key = kind === 'points' ? NETWORK_POINTS_KEY :
    kind === 'schedule' ? NETWORK_SCHEDULE_KEY : null;
  if (!ALLOWED.has(key)) throw new Error('Type de programme de réseau inconnu.');
  const db = await getDb();
  const exists = await db.getFirstAsync('SELECT id FROM reseaux WHERE id=?', [reseauId]);
  if (!exists?.id) throw new Error('Réseau supprimé ou introuvable.');
  const source = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let parsed;
  try { parsed = JSON.parse(source); } catch { throw new Error('Brouillon de régulation JSON invalide.'); }
  if (kind === 'points' && !Array.isArray(parsed)) throw new Error('Les points doivent être une liste.');
  if (kind === 'schedule' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)))
    throw new Error('Le programme doit être un objet.');
  const empty = kind === 'points' ? parsed.length === 0 :
    Object.values(parsed.days || {}).every(arr => !Array.isArray(arr) || arr.length === 0);
  if (empty) {
    await db.runAsync('DELETE FROM attributs_libres WHERE entite_type=? AND entite_id=? AND cle=?',
      ['reseau', reseauId, key]);
    return;
  }
  await db.runAsync(
    "INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,'reseau',?,?,?,'json') ON CONFLICT(entite_type,entite_id,cle) DO UPDATE SET valeur=excluded.valeur,modifie_le=datetime('now')",
    [createId(),reseauId,key,source]);
}
export async function readNetworkProgrammingForVisit(db, visiteId) {
  const sql = "SELECT r.id AS reseau_id,a.cle,a.valeur FROM reseaux r " +
    "JOIN attributs_libres a ON a.entite_type='reseau' AND a.entite_id=r.id " +
    "WHERE r.visite_id=? AND a.cle IN (?,?)";
  const rows = await db.getAllAsync(sql,[visiteId,NETWORK_POINTS_KEY,NETWORK_SCHEDULE_KEY]);
  const result = new Map();
  for (const row of rows) {
    const entry = result.get(row.reseau_id) || {};
    let raw;
    try { raw = JSON.parse(row.valeur); }
    catch { throw new Error('Programme de réseau endommagé : JSON illisible, export refusé.'); }
    if (row.cle === NETWORK_POINTS_KEY) {
      if (!Array.isArray(raw)) throw new Error('Courbe de réseau endommagée : liste de points absente.');
      entry.points = parseNetworkPoints(raw);
    } else if (row.cle === NETWORK_SCHEDULE_KEY) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('Programme de réseau endommagé : objet absent.');
      entry.schedule = parseWeeklySchedule(raw);
    }
    result.set(row.reseau_id, entry);
  }
  return result;
}
export async function copyNetworkProgramming(db, oldNetworkId, newNetworkId) {
  if (!oldNetworkId || !newNetworkId || oldNetworkId === newNetworkId) return 0;
  const rows = await db.getAllAsync(
    'SELECT cle,valeur FROM attributs_libres WHERE entite_type=? AND entite_id=? AND cle IN (?,?)',
    ['reseau',oldNetworkId,NETWORK_POINTS_KEY,NETWORK_SCHEDULE_KEY]);
  let count=0;
  for(const row of rows) {
    if (!ALLOWED.has(row.cle)) continue;
    const result = await db.runAsync(
      "INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,'reseau',?,?,?,'json') ON CONFLICT(entite_type,entite_id,cle) DO NOTHING",
      [createId(),newNetworkId,row.cle,String(row.valeur || '')]);
    count+=Number(result?.changes || 0);
  }
  return count;
}
