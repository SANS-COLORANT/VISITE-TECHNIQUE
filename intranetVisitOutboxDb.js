import { getDb } from './db.js';
import { buildIntranetVisitPayload, IntranetVisitValidationError } from './intranetVisitPayload.js';
import { createIntranetUploadId, sendClientVisits } from './symfonyApi.js';

const listeners = new Set();
let revision = 0;
let processorPromise = null;

function notify() {
  revision += 1;
  for (const listener of listeners) { try { listener(revision); } catch {} }
}
export function subscribeVisitOutbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getVisitOutboxRevision() { return revision; }

const RETRYABLE_HTTP = new Set([500, 502, 503, 504]);
const LOCAL_AUTH_ERRORS = new Set(['reactivation_required', 'dpop_key_missing', 'invalid_grant']);
function isoAfter(milliseconds) { return new Date(Date.now() + Math.max(1000, milliseconds)).toISOString(); }
function retryAfterMs(value) {
  if (value == null || value === '') return 60_000;
  const seconds = Number(value);
  // Le contrat serveur demande de respecter Retry-After. Ne pas raccourcir une
  // attente longue : cela provoquerait des 429 supplémentaires et consommerait
  // inutilement de nouvelles preuves DPoP.
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(1000, at - Date.now()) : 60_000;
}
function exponentialRetry(attempt) { return Math.min(15 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(6, Math.max(0, attempt - 1)))); }
function violationsJson(error) { return error?.violations?.length ? JSON.stringify(error.violations) : null; }

export async function getVisitUploadState(visiteId) {
  const db = await getDb();
  return db.getFirstAsync(`SELECT * FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
}
export async function listVisitOutbox({ includeSynced = false } = {}) {
  const db = await getDb();
  return db.getAllAsync(`SELECT o.*,v.date_visite,s.nom_site,c.nom AS nom_client
    FROM api_visit_outbox o JOIN visites v ON v.id=o.visite_id JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id
    ${includeSynced ? '' : "WHERE o.status<>'synced'"} ORDER BY o.queued_at`);
}

export async function finalizeVisitForUpload(visiteId) {
  const db = await getDb();
  const visit = await db.getFirstAsync(`SELECT id,statut FROM visites WHERE id=?`, [String(visiteId)]);
  if (!visit) throw new IntranetVisitValidationError(['Visite introuvable.']);
  if (['terminee', 'exportee'].includes(visit.statut)) return visit;
  if (!['en_cours', 'a_completer'].includes(visit.statut)) {
    throw new IntranetVisitValidationError([`Statut local « ${visit.statut} » non finalisable pour l’envoi Intranet.`]);
  }
  await db.runAsync(`UPDATE visites SET statut='terminee',modifie_le=datetime('now') WHERE id=?`, [String(visiteId)]);
  notify();
  return db.getFirstAsync(`SELECT id,statut FROM visites WHERE id=?`, [String(visiteId)]);
}

export async function previewVisitUpload(visiteId) {
  // UUID is required by the wire builder, but a preview must not allocate the
  // durable idempotency key. This fixed v4-shaped value is never persisted/sent.
  return buildIntranetVisitPayload(visiteId, '00000000-0000-4000-8000-000000000000');
}

export async function queueVisitUpload(visiteId, {
  confirmMaterialReplacement = false,
  // Compatibilité avec le nom utilisé par le premier build de l'upload.
  confirmMaterialClear = false,
  replaceTerminal = false,
} = {}) {
  const db = await getDb();
  const visit = await db.getFirstAsync(`SELECT id,statut FROM visites WHERE id=?`, [visiteId]);
  if (!visit) throw new IntranetVisitValidationError(['Visite introuvable.']);
  if (!['terminee', 'exportee'].includes(visit.statut)) {
    throw new IntranetVisitValidationError(['Finalise la visite avant de l’envoyer. Le POST Intranet crée une nouvelle visite serveur et ne permet pas de mettre à jour progressivement une visite déjà créée.']);
  }
  const existing = await getVisitUploadState(visiteId);
  if (existing) {
    if (['pending', 'sending', 'retry'].includes(existing.status) || existing.status === 'synced') return existing;
    if (!replaceTerminal) return existing;
  }
  const envoiId = await createIntranetUploadId();
  const prepared = await buildIntranetVisitPayload(visiteId, envoiId);
  if (prepared.destructiveMaterialChange && !confirmMaterialReplacement && !confirmMaterialClear) {
    const removed = Number(prepared.removedSourceMaterialCount || 0);
    const error = new Error(
      `Le listing Intranet de référence contient ${prepared.sourceMaterialCount} matériel(s) et METRA en enverra ${prepared.summary.materials}. `
      + `Le POST remplace le listing complet : ${removed} matériel(s) au minimum disparaîtront du local si cet envoi est confirmé.`
    );
    error.code = prepared.destructiveMaterialClear
      ? 'material_clear_confirmation_required'
      : 'material_replacement_confirmation_required';
    error.prepared = prepared;
    throw error;
  }
  if (existing && replaceTerminal) await db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id=?`, [visiteId]);
  await db.runAsync(`INSERT INTO api_visit_outbox(
      envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status,attempt_count,next_attempt_at
    ) VALUES(?,?,?,?,?,'pending',0,NULL)`,
    [envoiId, String(visiteId), prepared.remoteClientId, prepared.serialized, prepared.payloadBytes]);
  notify();
  return getVisitUploadState(visiteId);
}

export async function discardTerminalVisitUpload(visiteId) {
  const db = await getDb();
  const row = await getVisitUploadState(visiteId);
  if (!row || ['pending', 'sending', 'retry', 'synced'].includes(row.status)) return false;
  await db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id=?`, [visiteId]);
  notify();
  return true;
}

async function markRetry(db, row, error, delay) {
  await db.runAsync(`UPDATE api_visit_outbox SET status='retry',next_attempt_at=?,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE envoi_id=?`,
    [isoAfter(delay), error?.status || null, error?.code || null, String(error?.message || 'Connexion indisponible'), violationsJson(error), row.envoi_id]);
}
async function markTerminal(db, row, status, error) {
  await db.runAsync(`UPDATE api_visit_outbox SET status=?,next_attempt_at=NULL,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE envoi_id=?`,
    [status, error?.status || null, error?.code || null, String(error?.message || 'Envoi refusé'), violationsJson(error), row.envoi_id]);
}

async function assertRowTargetsImportedClient(db, row) {
  const linked = await db.getFirstAsync(`SELECT c.remote_client_id
    FROM visites v
    JOIN sites s ON s.id=v.site_id
    JOIN api_client_links c ON c.local_client_id=s.client_id
    WHERE v.id=? AND c.remote_client_id=? LIMIT 1`, [String(row.visite_id), String(row.remote_client_id)]);
  if (linked) return null;
  const error = Object.assign(new Error(
    'Cet envoi a été préparé pour un autre client Intranet que le client importé lié à la visite. METRA bloque cet ancien envoi avant tout appel réseau.'
  ), { code: 'wrong_imported_client' });
  await markTerminal(db, row, 'rejected', error);
  notify();
  return error;
}

export async function recoverInterruptedVisitUploads() {
  const db = await getDb();
  const result = await db.runAsync(`UPDATE api_visit_outbox SET status='retry',next_attempt_at=datetime('now'),error_code='interrupted',error_message='Envoi interrompu avant confirmation : reprise idempotente.',updated_at=datetime('now') WHERE status='sending'`);
  if (Number(result?.changes || 0) > 0) notify();
}

async function sendRow(db, row) {
  const ownershipError = await assertRowTargetsImportedClient(db, row);
  if (ownershipError) return { status: 'error', row: await getVisitUploadState(row.visite_id), error: ownershipError };

  await db.runAsync(`UPDATE api_visit_outbox SET status='sending',attempt_count=attempt_count+1,last_attempt_at=datetime('now'),error_code=NULL,error_message=NULL,violations_json=NULL,updated_at=datetime('now') WHERE envoi_id=?`, [row.envoi_id]);
  notify();
  try {
    const response = await sendClientVisits(row.remote_client_id, row.payload_json);
    if (String(response?.envoiId || '') !== String(row.envoi_id)) throw Object.assign(new Error('Accusé de réception Intranet incohérent : envoiId différent.'), { code: 'invalid_ack' });
    const visits = Array.isArray(response?.visites) ? response.visites : [];
    if (typeof response?.rejoue !== 'boolean') throw Object.assign(new Error('Accusé de réception Intranet incomplet : indicateur rejoue absent.'), { code: 'invalid_ack' });
    if (visits.length !== 1 || visits[0]?.index !== 0 || visits[0]?.id == null || visits[0]?.localId == null) throw Object.assign(new Error('Accusé de réception Intranet incomplet : visite, index ou local absent.'), { code: 'invalid_ack' });
    let expectedLocalId = null;
    try { expectedLocalId = JSON.parse(row.payload_json)?.visites?.[0]?.localId; } catch {}
    if (String(visits[0].localId) !== String(expectedLocalId)) throw Object.assign(new Error('Accusé de réception Intranet incohérent : localId différent.'), { code: 'invalid_ack' });
    await db.runAsync(`UPDATE api_visit_outbox SET status='synced',next_attempt_at=NULL,http_status=?,error_code=NULL,error_message=NULL,violations_json=NULL,remote_visit_id=?,replayed=?,synced_at=datetime('now'),updated_at=datetime('now') WHERE envoi_id=?`,
      [response?.rejoue ? 200 : 201, String(visits[0].id), response?.rejoue ? 1 : 0, row.envoi_id]);
    notify();
    return { status: 'synced', row: await getVisitUploadState(row.visite_id), response };
  } catch (error) {
    const status = Number(error?.status || 0);
    const localAuthFailure = LOCAL_AUTH_ERRORS.has(String(error?.code || ''));
    if (error?.code === 'invalid_ack') await markTerminal(db, row, 'rejected', error);
    else if (localAuthFailure || status === 401) await markTerminal(db, row, 'auth_error', error);
    else if (!status || RETRYABLE_HTTP.has(status)) await markRetry(db, row, error, exponentialRetry(Number(row.attempt_count || 0) + 1));
    else if (status === 429) await markRetry(db, row, error, retryAfterMs(error.retryAfter));
    else if (status === 409 && error?.code === 'synchronization_conflict') await markTerminal(db, row, 'conflict', error);
    else if (status === 409) await markTerminal(db, row, 'rejected', error);
    else if (status === 422) await markTerminal(db, row, 'validation_error', error);
    else await markTerminal(db, row, 'rejected', error);
    notify();
    return { status: 'error', row: await getVisitUploadState(row.visite_id), error };
  }
}

export async function processVisitOutbox({ limit = 3 } = {}) {
  if (processorPromise) return processorPromise;
  processorPromise = (async () => {
    const db = await getDb();
    await recoverInterruptedVisitUploads();
    const rows = await db.getAllAsync(`SELECT * FROM api_visit_outbox
      WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))
      ORDER BY queued_at LIMIT ?`, [Math.max(1, Math.min(10, Number(limit || 3)))]);
    const results = [];
    // Sequential by design: safely below the server's 10 visit-send requests/minute
    // and simpler idempotent recovery after an uncertain mobile connection.
    for (const row of rows) {
      const result = await sendRow(db, row);
      results.push(result);
      const http = Number(result?.error?.status || 0);
      const auth = LOCAL_AUTH_ERRORS.has(String(result?.error?.code || ''));
      if (result?.status === 'error' && (auth || !http || http === 401 || http === 429 || RETRYABLE_HTTP.has(http))) break;
    }
    return results;
  })().finally(() => { processorPromise = null; });
  return processorPromise;
}

export async function retryVisitUploadNow(visiteId) {
  const db = await getDb();
  const row = await getVisitUploadState(visiteId);
  if (!row || !['retry', 'pending', 'auth_error'].includes(row.status)) return row;
  await db.runAsync(`UPDATE api_visit_outbox SET next_attempt_at=NULL,status='pending',updated_at=datetime('now') WHERE visite_id=?`, [visiteId]);
  notify();
  await processVisitOutbox({ limit: 1 });
  return getVisitUploadState(visiteId);
}
