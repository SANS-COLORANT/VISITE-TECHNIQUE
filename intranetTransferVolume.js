/** METRA : volume réellement confirmé par l'Intranet (JSON + fichiers photos).
 * Les tailles sont celles des fichiers locaux, hors overhead multipart/TLS.
 * Aucune estimation inventée : les tailles indisponibles sont signalées.
 */
import * as FileSystem from 'expo-file-system';
import { getDb } from './db.js';

const CACHE_MAX = 6000;
const photoSizeCache = new Map();
const BAD_PHOTO_STATUSES = new Set(['validation_error', 'rejected', 'auth_error']);

export function formatTransferBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2).replace('.', ',')} Go`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(2).replace('.', ',')} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} Ko`;
  return `${Math.round(bytes)} octets`;
}

export function calculateTransferVolume(visits, photos) {
  const result = {
    totalBytes: 0, confirmedBytes: 0,
    visitsTotal: visits.length, visitsSynced: 0, visitsUnknownSize: 0, visitsFailed: 0,
    photosTotal: photos.length, photosSynced: 0, photosUnknownSize: 0, photosFailed: 0,
  };
  for (const visit of visits) {
    const size = Number(visit.payload_bytes);
    const known = Number.isFinite(size) && size > 0;
    if (known) {
      result.totalBytes += size;
      if (visit.status === 'synced') result.confirmedBytes += size;
    } else result.visitsUnknownSize += 1;
    if (visit.status === 'synced') result.visitsSynced += 1;
    else if (BAD_PHOTO_STATUSES.has(visit.status) || visit.status === 'conflict') result.visitsFailed += 1;
  }
  for (const photo of photos) {
    const size = Number(photo.sizeBytes);
    const known = photo.sizeBytes != null && Number.isFinite(size) && size >= 0;
    if (known) {
      result.totalBytes += size;
      if (photo.status === 'synced') result.confirmedBytes += size;
    } else result.photosUnknownSize += 1;
    if (photo.status === 'synced') result.photosSynced += 1;
    else if (BAD_PHOTO_STATUSES.has(photo.status)) result.photosFailed += 1;
  }
  result.finished = result.visitsSynced === result.visitsTotal &&
    result.photosSynced === result.photosTotal;
  result.pourcentage = result.totalBytes > 0
    ? Math.min(result.finished ? 100 : 99, Math.round(result.confirmedBytes * 100 / result.totalBytes))
    : (result.finished ? 100 : 0);
  result.incompleteEstimate = result.visitsUnknownSize > 0 || result.photosUnknownSize > 0;
  return result;
}

async function photoBytes(photo) {
  const key = `${photo.id}|${photo.uri}`;
  if (photoSizeCache.has(key)) return photoSizeCache.get(key);
  let size = null;
  try {
    const info = await FileSystem.getInfoAsync(String(photo.uri || ''));
    if (info?.exists && Number.isFinite(Number(info.size)) && info.size != null)
      size = Math.max(0, Number(info.size));
  } catch {}
  if (photoSizeCache.size >= CACHE_MAX) photoSizeCache.clear();
  photoSizeCache.set(key, size);
  return size;
}

async function sizePhotoGroup(photos) {
  const rows = [];
  // Éviter une vague d'accès filesystem parallèles sur une grosse visite.
  for (let start = 0; start < photos.length; start += 8) {
    const chunk = photos.slice(start, start + 8);
    rows.push(...await Promise.all(chunk.map(async photo => ({
      ...photo, sizeBytes: await photoBytes(photo),
    }))));
  }
  return rows;
}

/** Inclut toutes les photos choisies pour l'export même avant leur mise en
 * attente et les JSON des visites déjà gelés en outbox. Sans payload gelé,
 * son poids reste inconnu : l'UI indique une estimation incomplète.
 */
export async function getClientTransferVolume(visiteIds = []) {
  const ids = [...new Set((visiteIds || []).map(String).filter(Boolean))];
  if (!ids.length) return calculateTransferVolume([], []);
  const db = await getDb(), visits = [], photos = [];
  // Paramètres SQL bornés, y compris pour un client avec beaucoup de locaux.
  for (let start = 0; start < ids.length; start += 250) {
    const subset = ids.slice(start, start + 250);
    const marks = subset.map(() => '?').join(',');
    const [v, p] = await Promise.all([
      db.getAllAsync(`SELECT v.id,o.status,o.payload_bytes FROM visites v
        LEFT JOIN api_visit_outbox o ON o.visite_id=v.id
        WHERE v.id IN (${marks})`, subset),
      db.getAllAsync(`SELECT p.id,p.visite_id,p.uri,o.status FROM photos p
        LEFT JOIN api_visit_photo_outbox o ON o.photo_id=p.id
        WHERE p.inclure_export=1 AND p.visite_id IN (${marks})`, subset),
    ]);
    visits.push(...v); photos.push(...p);
  }
  return calculateTransferVolume(visits, await sizePhotoGroup(photos));
}
