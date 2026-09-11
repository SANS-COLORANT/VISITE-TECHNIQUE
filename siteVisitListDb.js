import { getDb } from './db.js';

function number(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }

/**
 * Liste des visites d'un site avec l'état Intranet complet (données + photos).
 * Toutes les informations sont chargées en lots pour préserver la fluidité de
 * la page Site : aucune requête SQLite n'est déclenchée par carte de visite.
 */
export async function listerVisitesSiteAvecEtatIntranet(siteId) {
  const db = await getDb();
  const id = String(siteId || '');
  const [rows, localPhotoRows, photoOutboxRows, unscheduledRows] = await Promise.all([
    db.getAllAsync(`SELECT v.*,
      o.status AS intranet_sync_status,
      o.remote_visit_id AS intranet_remote_visit_id,
      o.error_code AS intranet_sync_error,
      o.error_message AS intranet_sync_error_message,
      CASE WHEN EXISTS(
        SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id
          AND p.origine='api_symfony' AND p.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
      ) THEN 1 ELSE 0 END AS api_is_historical
      FROM visites v LEFT JOIN api_visit_outbox o ON o.visite_id=v.id
      WHERE v.site_id=? ORDER BY v.date_visite DESC,v.modifie_le DESC`, [id]),
    db.getAllAsync(`SELECT visite_id,COUNT(*) AS local_count FROM photos WHERE visite_id IN (SELECT id FROM visites WHERE site_id=?) GROUP BY visite_id`, [id]),
    db.getAllAsync(`SELECT po.visite_id,po.remote_visit_id,
        SUM(CASE WHEN po.status IN ('pending','sending','retry') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN po.status IN ('rejected','validation_error','auth_error') THEN 1 ELSE 0 END) AS error_count,
        SUM(CASE WHEN po.status='synced' THEN 1 ELSE 0 END) AS synced_count
      FROM api_visit_photo_outbox po JOIN visites v ON v.id=po.visite_id
      WHERE v.site_id=? GROUP BY po.visite_id,po.remote_visit_id`, [id]),
    db.getAllAsync(`SELECT p.visite_id,COUNT(*) AS unscheduled_count
      FROM photos p JOIN visites v ON v.id=p.visite_id
      JOIN api_visit_outbox o ON o.visite_id=v.id AND o.status='synced' AND o.remote_visit_id IS NOT NULL
      WHERE v.site_id=? AND NOT EXISTS(
        SELECT 1 FROM api_visit_photo_outbox po
        WHERE po.visite_id=p.visite_id AND po.remote_visit_id=o.remote_visit_id
          AND po.photo_id=p.id AND po.source_uri=p.uri
      ) GROUP BY p.visite_id`, [id]),
  ]);

  const localPhotos = new Map((localPhotoRows || []).map((row) => [String(row.visite_id), number(row.local_count)]));
  const unscheduled = new Map((unscheduledRows || []).map((row) => [String(row.visite_id), number(row.unscheduled_count)]));
  const outbox = new Map((photoOutboxRows || []).map((row) => [`${row.visite_id}||${row.remote_visit_id}`, row]));

  return (rows || []).map((row) => {
    const photo = outbox.get(`${row.id}||${row.intranet_remote_visit_id}`) || {};
    return {
      ...row,
      intranet_photo_local_count: localPhotos.get(String(row.id)) || 0,
      intranet_photo_unscheduled_count: unscheduled.get(String(row.id)) || 0,
      intranet_photo_pending_count: number(photo.pending_count),
      intranet_photo_error_count: number(photo.error_count),
      intranet_photo_synced_count: number(photo.synced_count),
    };
  });
}
