/**
 * Explicit lifecycle for a site already linked to the E&S Intranet.
 * Never guess identity from a site name or propagate a local DELETE silently.
 */
import { getDb } from './db.js';
import { protectedRequest } from './symfonyApi.js';

const text = value => String(value ?? '').trim();
const positive = value => /^[1-9][0-9]*$/.test(text(value));

export async function getSiteIntranetLink(siteId) {
  const db = await getDb();
  const rows = await db.getAllAsync(`
    SELECT cs.remote_client_id,cs.remote_site_id,sl.nom
    FROM sites s
    JOIN api_client_links cl ON cl.local_client_id=s.client_id AND cl.autorise=1
    JOIN api_client_site_links cs ON cs.remote_client_id=cl.remote_client_id AND cs.local_site_id=s.id AND cs.remote_present=1
    JOIN api_site_links sl ON sl.remote_site_id=cs.remote_site_id AND sl.remote_client_id=cs.remote_client_id
      AND sl.local_site_id=s.id AND sl.remote_present=1
    WHERE s.id=?
    ORDER BY cs.remote_client_id,cs.remote_site_id`, [String(siteId)]);
  if (rows.length > 1) throw new Error("Plusieurs sites Intranet sont associés à ce site METRA : suppression distante interdite tant que l'association n'est pas clarifiée.");
  return rows[0] || null;
}

export async function listSiteIntranetStatuses(clientId) {
  const db = await getDb();
  return db.getAllAsync(`
    SELECT s.id AS site_id,
      (SELECT sl.remote_site_id FROM api_site_links sl
        WHERE sl.local_site_id=s.id AND sl.remote_present=1
        ORDER BY sl.synced_at DESC LIMIT 1) AS remote_site_id,
      (SELECT o.status FROM api_structure_outbox o
        WHERE o.resource_type='site' AND o.local_site_id=s.id
        ORDER BY o.queued_at DESC LIMIT 1) AS sync_status
    FROM sites s WHERE s.client_id=?`, [String(clientId)]);
}

/**
 * Remote-first, explicit DELETE. If Symfony rejects/does not expose the
 * endpoint, local data is NOT removed and the user receives the real error.
 * The endpoint is not assumed to exist simply because POST exists.
 */
export async function supprimerSiteIntranetLie(siteId) {
  const db = await getDb();
  const linked = await getSiteIntranetLink(siteId);
  if (!linked || !positive(linked.remote_client_id) || !positive(linked.remote_site_id))
    throw new Error("Aucun rattachement Intranet unique et validé : suppression distante impossible.");
  const shared = await db.getFirstAsync(`
    SELECT COUNT(*) AS n FROM api_client_site_links
    WHERE remote_site_id=? AND remote_present=1`, [text(linked.remote_site_id)]);
  if (Number(shared?.n || 0) !== 1)
    throw new Error("Ce site Intranet est lié à plusieurs clients. La suppression distante est bloquée par sécurité.");
  const pending = await db.getFirstAsync(`
    SELECT operation_id FROM api_structure_outbox WHERE local_site_id=?
      AND status IN ('pending','retry','sending') LIMIT 1`, [String(siteId)]);
  if (pending)
    throw new Error("Une création Intranet est encore en attente ou en cours pour ce site. Termine ou annule-la avant une suppression distante.");
  try {
    await protectedRequest('DELETE',
      `/api/clients/${encodeURIComponent(linked.remote_client_id)}/sites/${encodeURIComponent(linked.remote_site_id)}`);
  } catch (error) {
    if ([404, 405, 501].includes(Number(error?.status || 0))) {
      throw new Error("Le serveur Intranet ne confirme pas la suppression de ce site par API. Aucune suppression locale n'a été effectuée. Fais valider l'opération côté Intranet. Détail : " + String(error?.message || error));
    }
    throw error;
  }
  // Remote confirmed: keep cached IDs for audit, but do not present them as live.
  await db.runAsync("UPDATE api_site_links SET remote_present=0,synced_at=datetime('now') WHERE remote_site_id=? AND remote_client_id=?",
    [text(linked.remote_site_id),text(linked.remote_client_id)]);
  await db.runAsync("UPDATE api_client_site_links SET remote_present=0,synced_at=datetime('now') WHERE remote_site_id=? AND remote_client_id=?",
    [text(linked.remote_site_id),text(linked.remote_client_id)]);
  await db.runAsync("UPDATE api_local_links SET remote_present=0 WHERE remote_site_id=?", [text(linked.remote_site_id)]);
  return { remoteClientId: text(linked.remote_client_id), remoteSiteId: text(linked.remote_site_id) };
}
