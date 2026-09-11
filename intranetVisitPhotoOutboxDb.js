import * as FileSystem from 'expo-file-system';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { inspectIntranetCriterionCandidate } from './intranetVisitPayload.js';
import { createIntranetUploadId, protectedRequest } from './symfonyApi.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const RETRYABLE_HTTP = new Set([500, 502, 503, 504]);
const LOCAL_AUTH_ERRORS = new Set(['reactivation_required', 'dpop_key_missing', 'invalid_grant']);
const PHOTO_TYPES = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
});

const listeners = new Set();
let revision = 0;
let processorPromise = null;
let lastPhotoRequestAt = 0;

function clean(value) { return value == null ? '' : String(value).trim(); }
function notify() { revision += 1; for (const listener of listeners) { try { listener(revision); } catch {} } }
export function subscribeVisitPhotoOutbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getVisitPhotoOutboxRevision() { return revision; }

function parseJson(value) { try { return JSON.parse(value || 'null'); } catch { return null; } }
function isoAfter(milliseconds) { return new Date(Date.now() + Math.max(1000, milliseconds)).toISOString(); }
function exponentialRetry(attempt) { return Math.min(15 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(6, Math.max(0, attempt - 1)))); }
function violationsJson(error) { return error?.violations?.length ? JSON.stringify(error.violations) : null; }
function retryAfterMs(value) {
  if (value == null || value === '') return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(1000, at - Date.now()) : 60_000;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function respectServerPhotoRate() {
  const wait = Math.max(0, 1050 - (Date.now() - lastPhotoRequestAt));
  if (wait) await sleep(wait);
  lastPhotoRequestAt = Date.now();
}
function photoDescription(label) {
  const value = clean(label);
  if (!value) return '';
  const human = value.includes('||') ? value.split('||')[0] : value;
  return human.slice(0, 255);
}
function extensionFromUri(uri, label = '') {
  const candidates = [clean(uri).split(/[?#]/)[0], clean(label).split('||').pop() || ''];
  for (const candidate of candidates) {
    const match = candidate.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (match && PHOTO_TYPES[match[1]]) return match[1] === 'jpeg' ? 'jpg' : match[1];
  }
  return null;
}
function contentTypeFrom(uri, label = '') {
  const ext = extensionFromUri(uri, label);
  return ext ? PHOTO_TYPES[ext] : null;
}
function snapshotRoot() { return `${FileSystem.documentDirectory}intranet-photo-outbox/`; }
async function ensureSnapshotRoot() {
  const root = snapshotRoot();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true }).catch(() => {});
  return root;
}
async function removeSnapshot(uri) {
  if (!uri) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

async function loadPhotoBindingContext(db, visiteId) {
  const visite = await db.getFirstAsync(`SELECT v.id,v.trame_id,v.api_remote_client_id,v.api_remote_local_id,v.api_content_revision,v.api_synced_revision FROM visites v WHERE v.id=?`, [String(visiteId)]);
  if (!visite) throw Object.assign(new Error('Visite METRA introuvable pour la synchronisation des photos.'), { code: 'visit_missing' });
  const provenanceRows = await db.getAllAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC,id DESC`, [String(visiteId)]);
  let details = null;
  for (const row of provenanceRows || []) {
    const candidate = parseJson(row.details_json);
    if (candidate?.sourceType === 'upload_binding') { details = candidate; break; }
    if (!details && candidate?.sourceType === 'preparation_visite') details = candidate;
  }
  return { visite, details };
}

async function dynamicPreAllumageCandidateMap(db, visiteId) {
  const rows = await db.getAllAsync(`SELECT r.panel_id,r.section_code,r.nom AS section_name,c.cle_stockage,c.libelle,c.type_code FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id WHERE r.visite_id=? ORDER BY r.ordre,c.ordre`, [String(visiteId)]).catch(() => []);
  const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const byLabel = new Map();
  for (const row of rows || []) {
    const key = normalize(row.libelle || row.cle_stockage);
    if (!key) continue;
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key).push(row);
  }
  return { byLabel, normalize };
}

async function buildLocalToRemoteCriterionMap(db, visiteId, trameId, details) {
  const remoteTrame = details?.trame;
  const categories = Array.isArray(remoteTrame?.categories) ? remoteTrame.categories : [];
  const result = new Map();
  const ambiguous = new Set();
  const dynamic = trameId === 'pre_allumage' ? await dynamicPreAllumageCandidateMap(db, visiteId) : null;

  const register = (localKey, triple) => {
    if (!localKey || ambiguous.has(localKey)) return;
    const previous = result.get(localKey);
    if (previous && `${previous.categorieId}:${previous.sousCategorieId}:${previous.critereId}` !== `${triple.categorieId}:${triple.sousCategorieId}:${triple.critereId}`) {
      result.delete(localKey);
      ambiguous.add(localKey);
      return;
    }
    result.set(localKey, triple);
  };

  for (const category of categories) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        const ids = [category?.id, subCategory?.id, criterion?.id].map((value) => clean(value));
        if (!ids.every((value) => /^\d+$/.test(value) && Number(value) > 0)) continue;
        const triple = { categorieId: ids[0], sousCategorieId: ids[1], critereId: ids[2] };
        const inspected = inspectIntranetCriterionCandidate(trameId, criterion, category?.nom, subCategory?.nom);
        if (inspected?.resolved?.sectionCode && inspected?.resolved?.cle) {
          register(`${inspected.resolved.sectionCode}||${inspected.resolved.cle}`, triple);
          continue;
        }
        if (dynamic) {
          const matches = dynamic.byLabel.get(dynamic.normalize(criterion?.nom)) || [];
          if (matches.length === 1) register(`${matches[0].section_code}||${matches[0].cle_stockage}`, triple);
          else if (matches.length > 1) {
            const subKey = dynamic.normalize(subCategory?.nom);
            const contextual = matches.filter((row) => dynamic.normalize(row.section_name) === subKey);
            if (contextual.length === 1) register(`${contextual[0].section_code}||${contextual[0].cle_stockage}`, triple);
          }
        }
      }
    }
  }
  return result;
}

async function localEntityKeyForPhoto(db, photo) {
  const key = clean(photo?.entite_key);
  if (!key) return null;
  if (!key.startsWith('remarque||')) return key;
  const remarqueId = key.slice('remarque||'.length);
  const row = await db.getFirstAsync(`SELECT controle_key FROM remarques WHERE id=? AND visite_id=?`, [remarqueId, photo.visite_id]);
  return clean(row?.controle_key) || null;
}

async function frozenPhotoMetadata(db, photo, localToRemote, order) {
  const sourceUri = clean(photo.uri);
  const contentType = contentTypeFrom(sourceUri, photo.label);
  if (!contentType) throw Object.assign(new Error(`Photo « ${photoDescription(photo.label) || photo.id} » : format non reconnu. JPEG, PNG, GIF ou WebP requis.`), { code: 'unsupported_photo_type' });
  const info = await FileSystem.getInfoAsync(sourceUri, { size: true });
  if (!info?.exists || info?.isDirectory) throw Object.assign(new Error(`Photo « ${photoDescription(photo.label) || photo.id} » introuvable dans le stockage local.`), { code: 'photo_file_missing' });
  const size = Number(info.size || 0);
  if (size <= 0) throw Object.assign(new Error(`Photo « ${photoDescription(photo.label) || photo.id} » vide ou illisible.`), { code: 'photo_file_empty' });
  if (size > MAX_PHOTO_BYTES) throw Object.assign(new Error(`Photo « ${photoDescription(photo.label) || photo.id} » trop volumineuse (${(size / 1048576).toFixed(1)} Mio, maximum 10 Mio).`), { code: 'photo_too_large' });

  const localKey = await localEntityKeyForPhoto(db, photo);
  const criterion = localKey ? localToRemote.get(localKey) || null : null;
  return {
    sourceUri,
    contentType,
    description: photoDescription(photo.label),
    order,
    criterion,
    extension: extensionFromUri(sourceUri, photo.label) || 'jpg',
  };
}

export async function getVisitPhotoSyncState(visiteId) {
  const db = await getDb();
  const visitRow = await db.getFirstAsync(`SELECT o.remote_visit_id,o.remote_client_id,o.status AS visit_status,v.api_content_revision,v.api_synced_revision FROM visites v LEFT JOIN api_visit_outbox o ON o.visite_id=v.id WHERE v.id=?`, [String(visiteId)]);
  if (!visitRow) return { ready: false, complete: false, localCount: 0, unscheduledCount: 0, pendingCount: 0, errorCount: 0, syncedCount: 0 };
  const remoteVisitId = clean(visitRow.remote_visit_id);
  const local = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM photos WHERE visite_id=?`, [String(visiteId)]);
  const localCount = Number(local?.n || 0);
  if (!remoteVisitId || visitRow.visit_status !== 'synced') {
    return { ready: false, complete: localCount === 0, localCount, unscheduledCount: localCount, pendingCount: 0, errorCount: 0, syncedCount: 0, remoteVisitId: remoteVisitId || null };
  }
  const [counts, unscheduled] = await Promise.all([
    db.getFirstAsync(`SELECT
      SUM(CASE WHEN status IN ('pending','sending','retry') THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status IN ('rejected','validation_error','auth_error') THEN 1 ELSE 0 END) AS error_count,
      SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) AS synced_count
      FROM api_visit_photo_outbox WHERE visite_id=? AND remote_visit_id=?`, [String(visiteId), remoteVisitId]),
    db.getFirstAsync(`SELECT COUNT(*) AS n FROM photos p WHERE p.visite_id=? AND NOT EXISTS(
      SELECT 1 FROM api_visit_photo_outbox po
      WHERE po.visite_id=p.visite_id AND po.remote_visit_id=? AND po.photo_id=p.id AND po.source_uri=p.uri
    )`, [String(visiteId), remoteVisitId]),
  ]);
  const pendingCount = Number(counts?.pending_count || 0);
  const errorCount = Number(counts?.error_count || 0);
  const syncedCount = Number(counts?.synced_count || 0);
  const unscheduledCount = Number(unscheduled?.n || 0);
  const cleanBusiness = Number(visitRow.api_content_revision || 0) === Number(visitRow.api_synced_revision || 0);
  return {
    ready: cleanBusiness,
    complete: cleanBusiness && unscheduledCount === 0 && pendingCount === 0 && errorCount === 0,
    localCount, unscheduledCount, pendingCount, errorCount, syncedCount,
    remoteVisitId,
    remoteClientId: clean(visitRow.remote_client_id) || null,
  };
}

export async function listVisitPhotoOutbox(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM api_visit_photo_outbox WHERE visite_id=? ORDER BY remote_visit_id,photo_order,queued_at`, [String(visiteId)]);
}

export async function queueVisitPhotosForSyncedVisit(visiteId, explicit = {}) {
  const db = await getDb();
  const outbox = await db.getFirstAsync(`SELECT status,remote_client_id,remote_visit_id FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
  const remoteClientId = clean(explicit.remoteClientId || outbox?.remote_client_id);
  const remoteVisitId = clean(explicit.remoteVisitId || outbox?.remote_visit_id);
  if (!remoteClientId || !remoteVisitId || (outbox?.status && outbox.status !== 'synced')) return { queued: 0, skipped: true, reason: 'visit_not_synced', errors: [] };

  const { visite, details } = await loadPhotoBindingContext(db, visiteId);
  if (Number(visite.api_content_revision || 0) !== Number(visite.api_synced_revision || 0)) return { queued: 0, skipped: true, reason: 'visit_business_dirty', errors: [] };

  const photos = await db.getAllAsync(`SELECT id,visite_id,uri,label,entite_key,cree_le FROM photos WHERE visite_id=? ORDER BY cree_le,id`, [String(visiteId)]);
  if (!photos.length) return { queued: 0, skipped: false, errors: [] };

  const [existing, localToRemote] = await Promise.all([
    db.getAllAsync(`SELECT photo_id,source_uri,photo_order,status FROM api_visit_photo_outbox WHERE visite_id=? AND remote_visit_id=? ORDER BY photo_order`, [String(visiteId), remoteVisitId]),
    buildLocalToRemoteCriterionMap(db, visiteId, visite.trame_id, details),
  ]);
  const existingKeys = new Set((existing || []).map((row) => `${row.photo_id}||${row.source_uri}`));
  let nextOrder = Math.max(0, ...(existing || []).map((row) => Number(row.photo_order || 0)));
  const initial = existing.length === 0;
  const errors = [];
  let queued = 0;

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    if (existingKeys.has(`${photo.id}||${photo.uri}`)) continue;
    const order = initial ? index + 1 : ++nextOrder;
    try {
      const metadata = await frozenPhotoMetadata(db, photo, localToRemote, order);
      const envoiPhotoId = await createIntranetUploadId();
      const root = await ensureSnapshotRoot();
      const snapshotUri = `${root}${envoiPhotoId}.${metadata.extension}`;
      await FileSystem.copyAsync({ from: metadata.sourceUri, to: snapshotUri });
      const snapshotInfo = await FileSystem.getInfoAsync(snapshotUri, { size: true });
      if (!snapshotInfo?.exists || Number(snapshotInfo.size || 0) <= 0) {
        await removeSnapshot(snapshotUri);
        throw Object.assign(new Error('Copie de sécurité de la photo impossible.'), { code: 'photo_snapshot_failed' });
      }
      const criterion = metadata.criterion;
      try {
        await db.runAsync(`INSERT INTO api_visit_photo_outbox(
          id,photo_id,visite_id,remote_client_id,remote_visit_id,envoi_photo_id,source_uri,snapshot_uri,
          content_type,description,photo_order,is_large_format,categorie_id,sous_categorie_id,critere_id,status
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`, [
          createId(), String(photo.id), String(visiteId), remoteClientId, remoteVisitId, envoiPhotoId,
          metadata.sourceUri, snapshotUri, metadata.contentType, metadata.description, metadata.order, 0,
          criterion?.categorieId || null, criterion?.sousCategorieId || null, criterion?.critereId || null,
        ]);
      } catch (error) {
        await removeSnapshot(snapshotUri);
        throw error;
      }
      existingKeys.add(`${photo.id}||${photo.uri}`);
      queued += 1;
    } catch (error) {
      errors.push({ photoId: String(photo.id), code: error?.code || 'photo_queue_failed', message: String(error?.message || error) });
    }
  }
  if (queued) notify();
  return { queued, skipped: false, errors };
}

export async function queueMissingPhotosForSyncedVisits({ limitVisits = 30 } = {}) {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT o.visite_id,o.remote_client_id,o.remote_visit_id FROM api_visit_outbox o JOIN visites v ON v.id=o.visite_id WHERE o.status='synced' AND o.remote_visit_id IS NOT NULL AND v.api_content_revision=v.api_synced_revision AND EXISTS(SELECT 1 FROM photos p WHERE p.visite_id=o.visite_id) ORDER BY o.synced_at DESC LIMIT ?`, [Math.max(1, Math.min(100, Number(limitVisits || 30)))]);
  const results = [];
  for (const row of rows || []) results.push(await queueVisitPhotosForSyncedVisit(row.visite_id, { remoteClientId: row.remote_client_id, remoteVisitId: row.remote_visit_id }));
  return results;
}

async function markRetry(db, row, error, delay) {
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='retry',next_attempt_at=?,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE id=?`, [isoAfter(delay), error?.status || null, error?.code || null, String(error?.message || 'Connexion indisponible'), violationsJson(error), row.id]);
}
async function markTerminal(db, row, status, error) {
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status=?,next_attempt_at=NULL,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE id=?`, [status, error?.status || null, error?.code || null, String(error?.message || 'Photo refusée'), violationsJson(error), row.id]);
}

export async function recoverInterruptedPhotoUploads() {
  const db = await getDb();
  const result = await db.runAsync(`UPDATE api_visit_photo_outbox SET status='retry',next_attempt_at=datetime('now'),error_code='interrupted',error_message='Envoi photo interrompu avant confirmation : reprise idempotente.',updated_at=datetime('now') WHERE status='sending'`);
  if (Number(result?.changes || 0) > 0) notify();
}

async function sendPhotoRow(db, row) {
  const info = row.snapshot_uri ? await FileSystem.getInfoAsync(row.snapshot_uri, { size: true }).catch(() => null) : null;
  if (!info?.exists || Number(info.size || 0) <= 0) {
    const error = Object.assign(new Error('Copie figée de la photo introuvable. METRA refuse de recréer la même idempotency key avec d’autres octets.'), { code: 'photo_snapshot_missing' });
    await markTerminal(db, row, 'validation_error', error); notify();
    return { status: 'error', row, error };
  }
  if (Number(info.size || 0) > MAX_PHOTO_BYTES) {
    const error = Object.assign(new Error('Photo supérieure à 10 Mio.'), { code: 'photo_too_large', status: 413 });
    await markTerminal(db, row, 'rejected', error); notify();
    return { status: 'error', row, error };
  }

  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='sending',attempt_count=attempt_count+1,last_attempt_at=datetime('now'),error_code=NULL,error_message=NULL,violations_json=NULL,updated_at=datetime('now') WHERE id=?`, [row.id]);
  notify();
  try {
    const form = new FormData();
    form.append('envoiPhotoId', row.envoi_photo_id);
    form.append('description', row.description || '');
    form.append('ordre', String(row.photo_order));
    form.append('grandFormat', Number(row.is_large_format || 0) ? 'true' : 'false');
    if (row.categorie_id && row.sous_categorie_id && row.critere_id) {
      form.append('categorieId', String(row.categorie_id));
      form.append('sousCategorieId', String(row.sous_categorie_id));
      form.append('critereId', String(row.critere_id));
    }
    const extension = extensionFromUri(row.snapshot_uri) || (row.content_type === 'image/png' ? 'png' : row.content_type === 'image/gif' ? 'gif' : row.content_type === 'image/webp' ? 'webp' : 'jpg');
    form.append('fichier', { uri: row.snapshot_uri, name: `photo.${extension}`, type: row.content_type });

    await respectServerPhotoRate();
    const response = await protectedRequest('POST', `/api/clients/${encodeURIComponent(row.remote_client_id)}/visites/${encodeURIComponent(row.remote_visit_id)}/photos`, { body: form });
    if (String(response?.envoiPhotoId || '') !== String(row.envoi_photo_id)) throw Object.assign(new Error('Accusé Intranet photo incohérent : envoiPhotoId différent.'), { code: 'invalid_photo_ack' });
    if (!response?.photo?.id) throw Object.assign(new Error('Accusé Intranet photo incomplet : identifiant photo absent.'), { code: 'invalid_photo_ack' });
    if (response?.photo?.visiteId != null && String(response.photo.visiteId) !== String(row.remote_visit_id)) throw Object.assign(new Error('Accusé Intranet photo incohérent : visite différente.'), { code: 'invalid_photo_ack' });
    const remoteCriterion = response?.photo?.localCritere;
    if (row.categorie_id && remoteCriterion) {
      if (String(remoteCriterion.categorieId) !== String(row.categorie_id) || String(remoteCriterion.sousCategorieId) !== String(row.sous_categorie_id) || String(remoteCriterion.critereId) !== String(row.critere_id)) throw Object.assign(new Error('Accusé Intranet photo incohérent : critère différent.'), { code: 'invalid_photo_ack' });
    }
    await db.runAsync(`UPDATE api_visit_photo_outbox SET status='synced',next_attempt_at=NULL,http_status=?,error_code=NULL,error_message=NULL,violations_json=NULL,remote_photo_id=?,replayed=?,snapshot_uri=NULL,synced_at=datetime('now'),updated_at=datetime('now') WHERE id=?`, [response?.rejoue ? 200 : 201, String(response.photo.id), response?.rejoue ? 1 : 0, row.id]);
    await removeSnapshot(row.snapshot_uri);
    notify();
    return { status: 'synced', row, response };
  } catch (error) {
    const status = Number(error?.status || 0);
    const localAuthFailure = LOCAL_AUTH_ERRORS.has(String(error?.code || ''));
    if (error?.code === 'invalid_photo_ack') await markTerminal(db, row, 'rejected', error);
    else if (localAuthFailure || status === 401) await markTerminal(db, row, 'auth_error', error);
    else if (!status || RETRYABLE_HTTP.has(status)) await markRetry(db, row, error, exponentialRetry(Number(row.attempt_count || 0) + 1));
    else if (status === 429) await markRetry(db, row, error, retryAfterMs(error.retryAfter));
    else if (status === 422) await markTerminal(db, row, 'validation_error', error);
    else await markTerminal(db, row, 'rejected', error);
    notify();
    return { status: 'error', row, error };
  }
}

export async function processVisitPhotoOutbox({ limit = 6, visitIds = null, discover = true } = {}) {
  if (processorPromise) return processorPromise;
  processorPromise = (async () => {
    const db = await getDb();
    await recoverInterruptedPhotoUploads();
    if (discover) await queueMissingPhotosForSyncedVisits({ limitVisits: 30 });
    const ids = [...new Set((visitIds || []).map((id) => clean(id)).filter(Boolean))];
    const visitFilter = ids.length ? ` AND visite_id IN (${ids.map(() => '?').join(',')})` : '';
    const params = ids.length ? [...ids, Math.max(1, Math.min(20, Number(limit || 6)))] : [Math.max(1, Math.min(20, Number(limit || 6)))];
    const rows = await db.getAllAsync(`SELECT * FROM api_visit_photo_outbox WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))${visitFilter} ORDER BY queued_at,photo_order LIMIT ?`, params);
    const results = [];
    for (const row of rows || []) {
      const result = await sendPhotoRow(db, row);
      results.push(result);
      const http = Number(result?.error?.status || 0);
      const auth = LOCAL_AUTH_ERRORS.has(String(result?.error?.code || ''));
      if (result?.status === 'error' && (auth || !http || http === 401 || http === 429 || RETRYABLE_HTTP.has(http))) break;
    }
    return results;
  })().finally(() => { processorPromise = null; });
  return processorPromise;
}

export async function retryVisitPhotoUploadsNow(visiteId) {
  const db = await getDb();
  await db.runAsync(`UPDATE api_visit_photo_outbox SET status='pending',next_attempt_at=NULL,updated_at=datetime('now') WHERE visite_id=? AND status IN ('retry','auth_error')`, [String(visiteId)]);
  notify();
  await queueVisitPhotosForSyncedVisit(visiteId);
  await processVisitPhotoOutbox({ limit: 6, visitIds: [visiteId], discover: false });
  return getVisitPhotoSyncState(visiteId);
}
