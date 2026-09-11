import { getDb } from './db.js';
import {
  discardTerminalVisitUpload,
  finalizeVisitForUpload,
  getVisitUploadState,
  processVisitOutbox,
  queueVisitUpload,
  retryVisitUploadNow,
  subscribeVisitOutbox as subscribeBaseVisitOutbox,
} from './intranetVisitOutboxDb.js';
import {
  getVisitPhotoSyncState,
  processVisitPhotoOutbox,
  queueVisitPhotosForSyncedVisit,
  subscribeVisitPhotoOutbox,
} from './intranetVisitPhotoOutboxDb.js';
import { subscribeIntranetPhotoChanges } from './intranetPhotoEvents.js';
import { bindVisitToImportedClientTarget } from './intranetVisitBindingDb.js';
import { syncClientPreparation } from './symfonyApi.js';

const FINAL_STATUSES = new Set(['terminee', 'exportee']);
const LOCKED_ERRORS = new Set(['idempotency_conflict', 'invalid_ack']);
const REBUILDABLE_STATUSES = new Set(['validation_error', 'rejected', 'conflict']);
const RETRYABLE_LOCAL_STATUSES = new Set(['pending', 'retry', 'auth_error']);
const REFRESHABLE_BINDING_ERRORS = new Set(['imported_site_missing', 'intranet_reference_refresh_required', 'wrong_imported_site']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function number(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }

export function clientVisitIsDirty(row) {
  return number(row?.api_content_revision) !== number(row?.api_synced_revision);
}

export function clientVisitIsOnline(row) {
  const historical = Number(row?.api_is_historical || 0) === 1;
  // Une visite importée est Online sans outbox car elle existe déjà sur le serveur.
  // Dès qu'elle a été réexportée par METRA, son nouvel accusé de visite ne suffit
  // plus : les photos locales doivent elles aussi être acquittées avant Online.
  const historicalOnly = historical && row?.intranet_sync_status !== 'synced';
  if (historicalOnly) return !clientVisitIsDirty(row);
  const photoIncomplete = number(row?.intranet_photo_unscheduled_count) > 0
    || number(row?.intranet_photo_pending_count) > 0
    || number(row?.intranet_photo_error_count) > 0;
  return row?.intranet_sync_status === 'synced' && !clientVisitIsDirty(row) && !photoIncomplete;
}

/**
 * Chargement en lots : visites + compteurs photos sont lus par quatre requêtes
 * groupées, jamais par une requête par ligne. L'état Client reste instantané
 * même quand le patrimoine contient beaucoup de visites et de photos.
 */
export async function listerEtatsIntranetVisitesClient(clientId) {
  const id = clean(clientId);
  if (!id) return { linked: false, remoteClientIds: [], visits: [] };
  const db = await getDb();
  const links = await db.getAllAsync(`SELECT remote_client_id,nom FROM api_client_links
    WHERE local_client_id=? AND autorise=1 ORDER BY remote_client_id`, [id]);
  if (!links.length) return { linked: false, remoteClientIds: [], visits: [] };

  const [rows, localPhotoRows, photoOutboxRows, unscheduledRows] = await Promise.all([
    db.getAllAsync(`SELECT
      v.id,v.date_visite,v.statut,v.trame_id,v.progression_pct,v.installation_id,
      v.api_remote_client_id,v.api_remote_local_id,v.api_remote_trame_id,v.api_source_remote_visit_id,
      v.api_content_revision,v.api_synced_revision,
      s.id AS site_id,s.nom_site,
      i.nom AS nom_installation,
      o.status AS intranet_sync_status,o.remote_visit_id AS intranet_remote_visit_id,
      o.error_code AS intranet_sync_error,o.error_message AS intranet_sync_error_message,
      CASE WHEN EXISTS(
        SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id
          AND p.origine='api_symfony' AND p.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
      ) THEN 1 ELSE 0 END AS api_is_historical
    FROM visites v
    JOIN sites s ON s.id=v.site_id
    LEFT JOIN installations i ON i.id=v.installation_id
    LEFT JOIN api_visit_outbox o ON o.visite_id=v.id
    WHERE s.client_id=?
    ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC,v.id`, [id]),
    db.getAllAsync(`SELECT p.visite_id,COUNT(*) AS local_count
      FROM photos p JOIN visites v ON v.id=p.visite_id JOIN sites s ON s.id=v.site_id
      WHERE s.client_id=? GROUP BY p.visite_id`, [id]),
    db.getAllAsync(`SELECT po.visite_id,po.remote_visit_id,
        SUM(CASE WHEN po.status IN ('pending','sending','retry') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN po.status IN ('rejected','validation_error','auth_error') THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN po.status='synced' THEN 1 ELSE 0 END) AS synced_count
      FROM api_visit_photo_outbox po JOIN visites v ON v.id=po.visite_id JOIN sites s ON s.id=v.site_id
      WHERE s.client_id=? GROUP BY po.visite_id,po.remote_visit_id`, [id]),
    db.getAllAsync(`SELECT p.visite_id,COUNT(*) AS unscheduled_count
      FROM photos p
      JOIN visites v ON v.id=p.visite_id
      JOIN sites s ON s.id=v.site_id
      JOIN api_visit_outbox o ON o.visite_id=v.id AND o.status='synced' AND o.remote_visit_id IS NOT NULL
      WHERE s.client_id=? AND NOT EXISTS(
        SELECT 1 FROM api_visit_photo_outbox po
        WHERE po.visite_id=p.visite_id AND po.remote_visit_id=o.remote_visit_id
          AND po.photo_id=p.id AND po.source_uri=p.uri
      ) GROUP BY p.visite_id`, [id]),
  ]);

  const localPhotos = new Map((localPhotoRows || []).map((row) => [String(row.visite_id), number(row.local_count)]));
  const unscheduled = new Map((unscheduledRows || []).map((row) => [String(row.visite_id), number(row.unscheduled_count)]));
  const byRemoteVisit = new Map((photoOutboxRows || []).map((row) => [`${row.visite_id}||${row.remote_visit_id}`, row]));

  const visits = (rows || []).map((row) => {
    const photo = byRemoteVisit.get(`${row.id}||${row.intranet_remote_visit_id}`) || {};
    const enriched = {
      ...row,
      intranet_photo_local_count: localPhotos.get(String(row.id)) || 0,
      intranet_photo_unscheduled_count: unscheduled.get(String(row.id)) || 0,
      intranet_photo_pending_count: number(photo.pending_count),
      intranet_photo_error_count: number(photo.error_count),
      intranet_photo_synced_count: number(photo.synced_count),
    };
    const online = clientVisitIsOnline(enriched);
    return {
      ...enriched,
      intranet_dirty: clientVisitIsDirty(enriched) ? 1 : 0,
      intranet_online: online ? 1 : 0,
      intranet_offline: online ? 0 : 1,
      finalisable: FINAL_STATUSES.has(enriched.statut) || ['en_cours', 'a_completer'].includes(enriched.statut),
    };
  });
  return { linked: true, remoteClientIds: links.map((row) => String(row.remote_client_id)), visits };
}

async function bindWithRefresh(visiteId) {
  try {
    return await bindVisitToImportedClientTarget(visiteId);
  } catch (error) {
    if (!error?.remoteClientId || !REFRESHABLE_BINDING_ERRORS.has(error?.code)) throw error;
    await syncClientPreparation(error.remoteClientId);
    return bindVisitToImportedClientTarget(visiteId);
  }
}

async function prepareOne(visiteId, { finalizeInProgress = false } = {}) {
  const db = await getDb();
  const visit = await db.getFirstAsync(`SELECT id,statut,api_content_revision,api_synced_revision FROM visites WHERE id=?`, [String(visiteId)]);
  if (!visit) throw Object.assign(new Error('Visite METRA introuvable.'), { code: 'visit_missing' });
  const existing = await getVisitUploadState(visiteId);

  if (existing?.status === 'synced' && !clientVisitIsDirty(visit)) {
    const queuedPhotos = await queueVisitPhotosForSyncedVisit(visiteId);
    const photoState = await getVisitPhotoSyncState(visiteId);
    if (photoState.complete && !queuedPhotos?.errors?.length) return { visiteId, state: 'online' };
    return { visiteId, state: 'photos_pending', photoErrors: queuedPhotos?.errors || [] };
  }
  if (LOCKED_ERRORS.has(String(existing?.error_code || ''))) {
    throw Object.assign(new Error('Cet ancien envoi est verrouillé par sécurité et doit être contrôlé individuellement.'), { code: existing.error_code });
  }
  if (existing && RETRYABLE_LOCAL_STATUSES.has(existing.status)) {
    if (existing.status === 'auth_error') {
      await retryVisitUploadNow(visiteId);
      return { visiteId, state: 'retried' };
    }
    return { visiteId, state: 'already_queued' };
  }
  if (existing && REBUILDABLE_STATUSES.has(existing.status)) {
    if (existing.status === 'conflict' && existing.remote_client_id) await syncClientPreparation(existing.remote_client_id);
    const discarded = await discardTerminalVisitUpload(visiteId);
    if (!discarded) throw Object.assign(new Error('Cet envoi ne peut pas être reconstruit automatiquement.'), { code: 'terminal_upload_locked' });
  }

  await bindWithRefresh(visiteId);
  if (!FINAL_STATUSES.has(visit.statut)) {
    if (!finalizeInProgress) throw Object.assign(new Error('La visite doit être finalisée avant son envoi.'), { code: 'finalization_required' });
    await finalizeVisitForUpload(visiteId);
  }

  const queued = await queueVisitUpload(visiteId);
  return { visiteId, state: queued?.status || 'pending' };
}

/**
 * Prépare 1, plusieurs ou toutes les visites sélectionnées. Les données visite
 * partent d'abord ; dès que Symfony renvoie l'id de la visite, les photos sont
 * mises en file et envoyées séparément avec leur propre idempotence.
 */
export async function envoyerVisitesIntranetClient(visitIds, {
  finalizeInProgress = false,
  processImmediately = true,
  immediateLimit = 8,
} = {}) {
  const ids = [...new Set((visitIds || []).map((id) => clean(id)).filter(Boolean))];
  const prepared = [];
  const errors = [];
  for (const visiteId of ids) {
    try {
      prepared.push(await prepareOne(visiteId, { finalizeInProgress }));
    } catch (error) {
      errors.push({ visiteId, code: error?.code || 'send_failed', message: String(error?.message || error) });
    }
  }

  const visitQueuedCount = prepared.filter((row) => ['pending', 'already_queued', 'retry', 'retried'].includes(row.state)).length;
  const photoQueuedCount = prepared.filter((row) => row.state === 'photos_pending').length;
  let processed = [];
  let processedPhotos = [];
  if (processImmediately && visitQueuedCount) {
    // Le serveur autorise 10 POST visites/minute/tablette. On traite au plus 8
    // immédiatement pour garder une marge aux actions manuelles et aux reprises.
    processed = await processVisitOutbox({ limit: Math.max(1, Math.min(8, Number(immediateLimit || 8))) }).catch(() => []);
  }
  if (processImmediately && (visitQueuedCount || photoQueuedCount)) {
    processedPhotos = await processVisitPhotoOutbox({
      limit: Math.max(1, Math.min(20, Math.max(6, Number(immediateLimit || 8) * 2))),
      visitIds: ids,
      discover: true,
    }).catch(() => []);
  }
  return { requested: ids.length, prepared, errors, processed, processedPhotos };
}

export function subscribeVisitOutbox(listener) {
  const a = subscribeBaseVisitOutbox(listener);
  const b = subscribeVisitPhotoOutbox(listener);
  const c = subscribeIntranetPhotoChanges(listener);
  return () => { a(); b(); c(); };
}