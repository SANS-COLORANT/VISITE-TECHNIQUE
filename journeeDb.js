/**
 * Données de « Ma journée » (accueil) : itinéraire de tous les clients, visites
 * terminées pas encore envoyées, réserves ouvertes.
 */
import { getDb } from './db.js';
import { resumerItineraire } from './journeeModel.js';

const HISTORIQUE_SQL = `EXISTS(SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id AND p.origine='api_symfony' AND p.details_json LIKE '%"sourceType":"imported_latest_visit"%')`;

export async function chargerJournee() {
  const db = await getDb();
  const cibles = await db.getAllAsync(`
    SELECT t.id, t.client_id, t.site_id, t.installation_id, c.nom AS nom_client, s.nom_site, i.nom AS nom_local,
      CASE WHEN t.installation_id IS NULL
        THEN EXISTS(SELECT 1 FROM visites v WHERE v.site_id=t.site_id AND v.cree_le>=t.cree_le)
        ELSE EXISTS(SELECT 1 FROM visites v WHERE v.installation_id=t.installation_id AND v.cree_le>=t.cree_le)
      END AS fait
    FROM tournee_cibles t
    JOIN clients c ON c.id=t.client_id
    JOIN sites s ON s.id=t.site_id
    LEFT JOIN installations i ON i.id=t.installation_id
    ORDER BY t.cree_le, t.id`);
  const envoi = await db.getFirstAsync(`
    SELECT COUNT(*) AS n FROM visites v
    LEFT JOIN api_visit_outbox o ON o.visite_id=v.id
    WHERE v.statut IN ('terminee','exportee') AND COALESCE(o.status,'')<>'synced' AND NOT ${HISTORIQUE_SQL}
      AND (v.api_remote_local_id IS NOT NULL OR EXISTS(SELECT 1 FROM api_local_links l WHERE l.local_installation_id=v.installation_id AND l.remote_present=1))`);
  const reserves = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM reserves_suivi WHERE statut='ouverte'`);
  return { itineraire: resumerItineraire(cibles), aEnvoyer: Number(envoi?.n || 0), reserves: Number(reserves?.n || 0) };
}
