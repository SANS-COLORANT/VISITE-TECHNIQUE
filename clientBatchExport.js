/** Export de la dernière visite connue de chaque site d'un client. */
import { getDb } from './db.js';
import { exporterVisitesExcelEnLot } from './batchExcel.js';

export async function listerDernieresVisitesClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT s.id AS site_id, s.nom_site, v.id AS visite_id, v.date_visite
     FROM sites s
     JOIN visites v ON v.id = (
       SELECT v2.id
       FROM visites v2
       WHERE v2.site_id = s.id
       ORDER BY COALESCE(v2.date_visite, '') DESC, v2.rowid DESC
       LIMIT 1
     )
     WHERE s.client_id = ?
     ORDER BY s.nom_site COLLATE NOCASE`,
    [clientId]
  );
}

export async function exporterDernieresVisitesClient(clientId) {
  const visites = await listerDernieresVisitesClient(clientId);
  if (!visites.length) throw new Error("Aucune visite n'est disponible pour les sites de ce client.");
  const resultat = await exporterVisitesExcelEnLot(visites.map((v) => v.visite_id));
  return { ...resultat, visites };
}
