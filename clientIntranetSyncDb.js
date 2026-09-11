import { getDb } from './db.js';
import {
  discardTerminalVisitUpload,
  finalizeVisitForUpload,
  getVisitUploadState,
  processVisitOutbox,
  queueVisitUpload,
  retryVisitUploadNow,
  subscribeVisitOutbox,
} from './intranetVisitOutboxDb.js';
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
  return (historical || row?.intranet_sync_status === 'synced') && !clientVisitIsDirty(row);
}

/**
 * Une seule requête charge tous les états Online/Offline d'un client.
 * Aucun composant par ligne ne s'abonne séparément à l'outbox : on évite le N+1
 * SQLite sur les gros patrimoines.
 */
export async function listerEtatsIntranetVisitesClient(clientId) {
  const id = clean(clientId);
  if (!id) return { linked: false, remoteClientIds: [], visits: [] };
  const db = await getDb();
  const links = await db.getAllAsync(`SELECT remote_client_id,nom FROM api_client_links
    WHERE local_client_id=? AND autorise=1 ORDER BY remote_client_id`, [id]);
  if (!links.length) return { linked: false, remoteClientIds: [], visits: [] };

  const rows = await db.getAllAsync(`SELECT
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
    ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC,v.id`, [id]);

  const visits = (rows || []).map((row) => ({
    ...row,
    intranet_dirty: clientVisitIsDirty(row) ? 1 : 0,
    intranet_online: clientVisitIsOnline(row) ? 1 : 0,
    intranet_offline: clientVisitIsOnline(row) ? 0 : 1,
    finalisable: FINAL_STATUSES.has(row.statut) || ['en_cours', 'a_completer'].includes(row.statut),
  }));
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

  if (existing?.status === 'synced' && !clientVisitIsDirty(visit)) return { visiteId, state: 'online' };
  if (LOCKED_ERRORS.has(String(existing?.error_code || ''))) {
    throw Object.assign(new Error('Cet ancien envoi est verrouillé par sécurité et doit être contrôlé individuellement.'), { code: existing.error_code });
  }
  if (existing && RETRYABLE_LOCAL_STATUSES.has(existing.status)) {
    // Pour auth_error, la fonction existante réactive l'envoi puis traite une ligne.
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
 * Prépare 1, plusieurs ou toutes les visites sélectionnées puis laisse l'outbox
 * durable assurer les reprises. Les envois HTTP restent séquentiels et bornés :
 * la règle de débit serveur n'est jamais contournée pour gagner quelques secondes.
 */
export async function envoyerVisitesIntranetClient(visitIds, {
  finalizeInProgress = false,
  processImmediately = true,
  immediateLimit = 3,
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

  const queuedCount = prepared.filter((row) => ['pending', 'already_queued', 'retry'].includes(row.state)).length;
  let processed = [];
  if (processImmediately && queuedCount) {
    processed = await processVisitOutbox({ limit: Math.max(1, Math.min(3, Number(immediateLimit || 3))) }).catch(() => []);
  }
  return { requested: ids.length, prepared, errors, processed };
}

export { subscribeVisitOutbox };
