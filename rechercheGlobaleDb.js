/** Sites et locaux locaux (hors client technique des visites rapides) pour la recherche globale. */
import { getDb } from './db.js';
import { QUICK_VISIT_CLIENT_ID } from './quickVisitDb.js';

export async function listerStructuresPourRecherche() {
  const db = await getDb();
  return (await db.getAllAsync(`
    SELECT c.id AS clientId, c.nom AS nomClient, s.id AS siteId, s.nom_site AS nomSite, i.id AS installationId, i.nom AS nomLocal
    FROM sites s JOIN clients c ON c.id=s.client_id LEFT JOIN installations i ON i.site_id=s.id
    WHERE c.id<>? ORDER BY c.nom, s.nom_site, i.nom`, [QUICK_VISIT_CLIENT_ID])) || [];
}
