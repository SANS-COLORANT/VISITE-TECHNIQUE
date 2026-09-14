import * as FileSystem from 'expo-file-system';
import { getDb } from './db.js';
import { inspectIntranetCriterionCandidate } from './intranetVisitPayload.js';
import { createIntranetUploadId, protectedRequest } from './symfonyApi.js';

const listeners = new Set();
let revision = 0;
let processorPromise = null;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// Un passage du processeur n'envoie jamais plus de 10 photos. Les gros lots
// sont donc découpés en parties persistantes et reprennent là où ils se sont
// arrêtés. Dans chaque partie, trois transferts maximum sont simultanés.
export const PHOTO_UPLOAD_PART_SIZE = 10;
export const PHOTO_UPLOAD_CONCURRENCY = 3;
const RETRYABLE_HTTP = new Set([500, 502, 503, 504]);
const LOCAL_AUTH_ERRORS = new Set(['reactivation_required', 'dpop_key_missing', 'invalid_grant']);

function notify() {
  revision += 1;
  for (const listener of listeners) { try { listener(revision); } catch {} }
}
export function subscribeVisitPhotoOutbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getVisitPhotoOutboxRevision() { return revision; }

function isoAfter(milliseconds) { return new Date(Date.now() + Math.max(1000, milliseconds)).toISOString(); }
function retryAfterMs(value) {
  if (value == null || value === '') return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(1000, at - Date.now()) : 60_000;
}
function exponentialRetry(attempt) { return Math.min(15 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(6, Math.max(0, attempt - 1)))); }
function violationsJson(error) { return error?.violations?.length ? JSON.stringify(error.violations) : null; }
function clean(value) { return value == null ? '' : String(value).trim(); }
function photoDescription(label) {
  const value = clean(String(label || '').split('||')[0]);
  return (value || 'Photo de visite').slice(0, 255);
}
function safePositiveId(value) {
  const raw = clean(value);
  return /^\d+$/.test(raw) && Number(raw) > 0 ? raw : null;
}
function photoFile(uri) {
  const cleanUri = String(uri || '').split('?')[0].toLowerCase();
  if (cleanUri.endsWith('.png')) return { name: 'photo.png', type: 'image/png' };
  if (cleanUri.endsWith('.gif')) return { name: 'photo.gif', type: 'image/gif' };
  if (cleanUri.endsWith('.webp')) return { name: 'photo.webp', type: 'image/webp' };
  return { name: 'photo.jpg', type: 'image/jpeg' };
}

async function frozenPreparationDetails(db, visiteId) {
  const rows = await db.getAllAsync(`SELECT details_json FROM provenances
    WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [visiteId]);
  let preparation = null;
  for (const row of rows || []) {
    let details = null;
    try { details = JSON.parse(row.details_json || 'null'); } catch {}
    if (!details) continue;
    if (details.sourceType === 'imported_latest_visit') return null;
    if (details.sourceType === 'upload_binding') return details;
    if (details.sourceType === 'preparation_visite' && !preparation) preparation = details;
  }
  return preparation;
}

async function canonicalPhotoEntityKey(db, visiteId, entiteKey) {
  const key = clean(entiteKey);
  if (!key.startsWith('remarque||')) return key;
  const remarqueId = key.slice('remarque||'.length);
  if (!remarqueId) return key;
  const row = await db.getFirstAsync(`SELECT controle_key FROM remarques WHERE visite_id=? AND id=? LIMIT 1`, [visiteId, remarqueId]);
  return clean(row?.controle_key) || key;
}

async function resolvePhotoCriterion(db, visite, entiteKey) {
  const key = await canonicalPhotoEntityKey(db, visite.id, entiteKey);
  if (!key || !key.includes('||')) return null;
  const details = await frozenPreparationDetails(db, visite.id);
  const categories = Array.isArray(details?.trame?.categories) ? details.trame.categories : [];
  if (!categories.length) return null;
  const matches = [];
  for (const category of categories) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        const inspected = inspectIntranetCriterionCandidate(visite.trame_id, criterion, category?.nom, subCategory?.nom);
        const resolved = inspected?.resolved;
        if (!resolved || `${resolved.sectionCode}||${resolved.cle}` !== key) continue;
        const categorieId = safePositiveId(category?.id);
        const sousCategorieId = safePositiveId(subCategory?.id);
        const critereId = safePositiveId(criterion?.id);
        if (categorieId && sousCategorieId && critereId) matches.push({ categorieId, sousCategorieId, critereId });
      }
    }
  }
  const unique = new Map(matches.map((m) => [`${m.categorieId}:${m.sousCategorieId}:${m.critereId}`, m]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export async function getVisitPhotoUploadSummary(visiteId) {
  if (!visiteId) return { total: 0, queued: 0, unscheduled: 0, pending: 0, sending: 0, synced: 0, failed: 0 };
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT
      COUNT(p.id) AS total,
      SUM(CASE WHEN o.photo_id IS NOT NULL THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN o.photo_id IS NULL THEN 1 ELSE 0 END) AS unscheduled,
      SUM(CASE WHEN o.status IN ('pending','retry') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN o.status='sending' THEN 1 ELSE 0 END) AS sending,
      SUM(CASE WHEN o.status='synced' THEN 1 ELSE 0 END) AS synced,
      SUM(CASE WHEN o.status IN ('validation_error','rejected','auth_error') THEN 1 ELSE 0 END) AS failed
    FROM photos p LEFT JOIN api_visit_photo_outbox o ON o.photo_id=p.id WHERE p.visite_id=?`, [String(visiteId)]);
  return Object.fromEntries(['total','queued','unscheduled','pending','sending','synced','failed'].map((key) => [key, Number(row?.[key] || 0)]));
}

export async function listVisitPhotoOutbox({ includeSynced = false } = {}) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM api_visit_photo_outbox ${includeSynced ? '' : "WHERE status<>'synced'"} ORDER BY queued_at,ordre`);
}

export async function queueMissingVisitPhotos(visiteId) {
  const db = await getDb();
  const visitUpload = await db.getFirstAsync(`SELECT remote_client_id,remote_visit_id,status FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
  if (!visitUpload || visitUpload.status !== 'synced' || !visitUpload.remote_visit_id) return 0;
  const visite = await db.getFirstAsync(`SELECT * FROM visites WHERE id=?`, [String(visiteId)]);
  if (!visite) return 0;
  const photos = await db.getAllAsync(`SELECT * FROM photos WHERE visite_id=? ORDER BY cree_le,id`, [String(visiteId)]);
  const existing = await db.getAllAsync(`SELECT photo_id,ordre FROM api_visit_photo_outbox WHERE visite_id=?`, [String(visiteId)]);
  const existingIds = new Set((existing || []).map((row) => String(row.photo_id)));
  let ordre = Math.max(0, ...(existing || []).map((row) => Number(row.ordre || 0)));
  let queued = 0;
  for (const photo of photos || []) {
    if (existingIds.has(String(photo.id))) continue;
    ordre += 1;
    if (ordre > 10000) break;
    const envoiPhotoId = await createIntranetUploadId();
    const criterion = await resolvePhotoCriterion(db, visite, photo.entite_key);
    await db.runAsync(`INSERT OR IGNORE INTO api_visit_photo_outbox(
        photo_id,visite_id,envoi_photo_id,remote_client_id,remote_visit_id,uri,description,ordre,grand_format,
        categorie_id,sous_categorie_id,critere_id,status,attempt_count,next_attempt_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'pending',0,NULL)`, [
      String(photo.id), String(visiteId), envoiPhotoId, String(visitUpload.remote_client_id), String(visitUpload.remote_visit_id),
      String(photo.uri), photoDescription(photo.label), ordre, 0,
      criterion?.categorieId || null, criterion?.sousCategorieId || null, criterion?.critereId || null,
    ]);
    queued += 1;
  }
  if (queued) notify();
  return queued;
}

export async function queueMissingSyncedVisitPhotos({ limitVisits = 40 } = {}) {
  const db = await getDb();
  const visits = await db.getAllAsync(`SELECT visite_id FROM api_visit_outbox WHERE status='synced' AND remote_visit_id IS NOT NULL ORDER BY synced_at DESC LIMIT ?`, [Math.max(1, Math.min(200, Number(limitVisits || 40)))]);
  let queued = 0;
  for (const row of visits || []) queued += await queueMissingVisitPhotos(row.visite_id);
  return queued;
}

async function markRetry(db, row, error, delay) {
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='retry',next_attempt_at=?,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE photo_id=?`,
    [isoAfter(delay), error?.status || null, error?.code || null, String(error?.message || 'Connexion indisponible'), violationsJson(error), row.photo_id]);
}
async function markTerminal(db, row, status, error) {
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status=?,next_attempt_at=NULL,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE photo_id=?`,
    [status, error?.status || null, error?.code || null, String(error?.message || 'Photo refusée'), violationsJson(error), row.photo_id]);
}

export async function recoverInterruptedVisitPhotoUploads() {
  const db = await getDb();
  const result = await db.runAsync(`UPDATE api_visit_photo_outbox SET status='retry',next_attempt_at=datetime('now'),error_code='interrupted',error_message='Envoi photo interrompu avant confirmation : reprise idempotente.',updated_at=datetime('now') WHERE status='sending'`);
  if (Number(result?.changes || 0) > 0) notify();
}

async function sendPhotoRow(db, row) {
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='sending',attempt_count=attempt_count+1,last_attempt_at=datetime('now'),error_code=NULL,error_message=NULL,violations_json=NULL,updated_at=datetime('now') WHERE photo_id=?`, [row.photo_id]);
  notify();
  try {
    const info = await FileSystem.getInfoAsync(row.uri);
    if (!info?.exists) throw Object.assign(new Error('Le fichier photo local est introuvable.'), { code: 'photo_missing' });
    if (Number(info.size || 0) > MAX_PHOTO_BYTES) throw Object.assign(new Error('La photo dépasse la limite Intranet de 10 Mio.'), { code: 'photo_too_large', status: 413 });

    const form = new FormData();
    form.append('envoiPhotoId', String(row.envoi_photo_id));
    form.append('description', String(row.description || ''));
    form.append('ordre', String(row.ordre));
    form.append('grandFormat', Number(row.grand_format) === 1 ? 'true' : 'false');
    const criterionIds = [row.categorie_id, row.sous_categorie_id, row.critere_id];
    if (criterionIds.every((value) => value != null && value !== '')) {
      form.append('categorieId', String(row.categorie_id));
      form.append('sousCategorieId', String(row.sous_categorie_id));
      form.append('critereId', String(row.critere_id));
    }
    form.append('fichier', { uri: row.uri, ...photoFile(row.uri) });

    const clientId = encodeURIComponent(String(row.remote_client_id));
    const visitId = encodeURIComponent(String(row.remote_visit_id));
    const response = await protectedRequest('POST', `/api/clients/${clientId}/visites/${visitId}/photos`, { body: form });
    if (String(response?.envoiPhotoId || '') !== String(row.envoi_photo_id)) throw Object.assign(new Error('Accusé photo Intranet incohérent : envoiPhotoId différent.'), { code: 'invalid_photo_ack' });
    if (typeof response?.rejoue !== 'boolean' || response?.photo?.id == null || String(response?.photo?.visiteId || '') !== String(row.remote_visit_id)) {
      throw Object.assign(new Error('Accusé photo Intranet incomplet ou rattaché à une autre visite.'), { code: 'invalid_photo_ack' });
    }
    await db.runAsync(`UPDATE api_visit_photo_outbox SET status='synced',next_attempt_at=NULL,http_status=?,error_code=NULL,error_message=NULL,violations_json=NULL,remote_photo_id=?,replayed=?,synced_at=datetime('now'),updated_at=datetime('now') WHERE photo_id=?`,
      [response.rejoue ? 200 : 201, String(response.photo.id), response.rejoue ? 1 : 0, row.photo_id]);
    notify();
    return { status: 'synced', response };
  } catch (error) {
    const status = Number(error?.status || 0);
    const localAuthFailure = LOCAL_AUTH_ERRORS.has(String(error?.code || ''));
    if (error?.code === 'invalid_photo_ack') await markTerminal(db, row, 'rejected', error);
    else if (localAuthFailure || status === 401) await markTerminal(db, row, 'auth_error', error);
    else if (!status && error?.code !== 'photo_missing') await markRetry(db, row, error, exponentialRetry(Number(row.attempt_count || 0) + 1));
    else if (RETRYABLE_HTTP.has(status)) await markRetry(db, row, error, exponentialRetry(Number(row.attempt_count || 0) + 1));
    else if (status === 429) await markRetry(db, row, error, retryAfterMs(error.retryAfter));
    else if (status === 422) await markTerminal(db, row, 'validation_error', error);
    else await markTerminal(db, row, 'rejected', error);
    notify();
    return { status: 'error', error };
  }
}

function shouldPause(results) {
  return (results || []).some((result) => {
    if (result?.status !== 'error') return false;
    const status = Number(result?.error?.status || 0);
    const code = String(result?.error?.code || '');
    return LOCAL_AUTH_ERRORS.has(code) || !status || status === 401 || status === 429 || RETRYABLE_HTTP.has(status);
  });
}

export async function processVisitPhotoOutbox({ limit = PHOTO_UPLOAD_PART_SIZE, visiteId = null } = {}) {
  if (processorPromise) return processorPromise;
  processorPromise = (async () => {
    const db = await getDb();
    await recoverInterruptedVisitPhotoUploads();
    const params = [];
    let filter = "status IN ('pending','retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))";
    if (visiteId) { filter += ' AND visite_id=?'; params.push(String(visiteId)); }

    // Même si un ancien appelant demande 30 ou 60 éléments, un passage reste
    // volontairement limité à une seule partie de 10 photos maximum.
    const requested = Math.max(1, Math.min(PHOTO_UPLOAD_PART_SIZE, Number(limit || PHOTO_UPLOAD_PART_SIZE)));
    params.push(requested);
    const rows = await db.getAllAsync(`SELECT * FROM api_visit_photo_outbox WHERE ${filter} ORDER BY queued_at,ordre LIMIT ?`, params);
    const results = [];
    for (let i = 0; i < rows.length; i += PHOTO_UPLOAD_CONCURRENCY) {
      const batch = await Promise.all(rows.slice(i, i + PHOTO_UPLOAD_CONCURRENCY).map((row) => sendPhotoRow(db, row)));
      results.push(...batch);
      if (shouldPause(batch)) break;
    }
    return results;
  })().finally(() => { processorPromise = null; });
  return processorPromise;
}

export async function syncVisitPhotosNow(visiteId) {
  await queueMissingVisitPhotos(visiteId);
  // Premier lot immédiat. Les lots suivants sont repris automatiquement par
  // IntranetVisitSyncRuntime sans recréer la visite Symfony.
  return processVisitPhotoOutbox({ visiteId, limit: PHOTO_UPLOAD_PART_SIZE });
}

export async function retryVisitPhotoUploadsNow(visiteId) {
  const db = await getDb();
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='pending',next_attempt_at=NULL,updated_at=datetime('now') WHERE visite_id=? AND status IN ('retry','auth_error')`, [String(visiteId)]);
  notify();
  return syncVisitPhotosNow(visiteId);
}
