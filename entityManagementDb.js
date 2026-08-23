import { getDb } from './db.js';

async function supprimerDonneesVisite(db, visiteId) {
  // Tables historiques/legacy sans FK explicites : nettoyage manuel pour ne laisser aucun orphelin.
  const tables = [
    'photos', 'remarques', 'notes', 'controles_visite', 'champs_visite',
    'reseaux', 'compteurs', 'materiel', 'mesures', 'controles',
    'observations_equipement', 'observations_reseau', 'releves_compteur',
  ];
  for (const table of tables) {
    await db.runAsync(`DELETE FROM ${table} WHERE visite_id=?`, [visiteId]);
  }
  await db.runAsync(`UPDATE journal_modifications SET visite_id=NULL WHERE visite_id=?`, [visiteId]);
  await db.runAsync(`DELETE FROM visites WHERE id=?`, [visiteId]);
}

export async function supprimerVisiteComplete(visiteId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await supprimerDonneesVisite(db, visiteId);
  });
}

export async function getResumeSuppressionSite(siteId) {
  const db = await getDb();
  const site = await db.getFirstAsync(`SELECT id,nom_site FROM sites WHERE id=?`, [siteId]);
  if (!site) return null;
  const visites = await db.getFirstAsync(`SELECT COUNT(*) n FROM visites WHERE site_id=?`, [siteId]);
  const installations = await db.getFirstAsync(`SELECT COUNT(*) n FROM installations WHERE site_id=?`, [siteId]);
  const equipements = await db.getFirstAsync(
    `SELECT COUNT(*) n FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=?`, [siteId]
  );
  return { ...site, visites: Number(visites?.n || 0), installations: Number(installations?.n || 0), equipements: Number(equipements?.n || 0) };
}

export async function supprimerSiteComplet(siteId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const visites = await db.getAllAsync(`SELECT id FROM visites WHERE site_id=?`, [siteId]);
    for (const visite of visites) await supprimerDonneesVisite(db, visite.id);

    const installations = await db.getAllAsync(`SELECT id FROM installations WHERE site_id=?`, [siteId]);
    for (const installation of installations) {
      const equipements = await db.getAllAsync(`SELECT id FROM equipements WHERE installation_id=?`, [installation.id]);
      for (const e of equipements) {
        await db.runAsync(`DELETE FROM observations_equipement WHERE equipement_id=?`, [e.id]);
        await db.runAsync(`DELETE FROM mesures WHERE equipement_id=?`, [e.id]);
        await db.runAsync(`DELETE FROM controles WHERE equipement_id=?`, [e.id]);
      }

      const reseaux = await db.getAllAsync(`SELECT id FROM reseaux_site WHERE installation_id=?`, [installation.id]);
      for (const r of reseaux) {
        await db.runAsync(`DELETE FROM observations_reseau WHERE reseau_site_id=?`, [r.id]);
        await db.runAsync(`DELETE FROM mesures WHERE reseau_id=?`, [r.id]);
        await db.runAsync(`DELETE FROM controles WHERE reseau_id=?`, [r.id]);
      }

      const compteurs = await db.getAllAsync(`SELECT id FROM compteurs_site WHERE installation_id=?`, [installation.id]);
      for (const c of compteurs) {
        await db.runAsync(`DELETE FROM releves_compteur WHERE compteur_site_id=?`, [c.id]);
        await db.runAsync(`DELETE FROM mesures WHERE compteur_id=?`, [c.id]);
      }

      await db.runAsync(`DELETE FROM equipements WHERE installation_id=?`, [installation.id]);
      await db.runAsync(`DELETE FROM reseaux_site WHERE installation_id=?`, [installation.id]);
      await db.runAsync(`DELETE FROM compteurs_site WHERE installation_id=?`, [installation.id]);
    }
    await db.runAsync(`DELETE FROM installations WHERE site_id=?`, [siteId]);
    await db.runAsync(`DELETE FROM attributs_libres WHERE entite_type='site' AND entite_id=?`, [siteId]);
    await db.runAsync(`DELETE FROM provenances WHERE entite_type='site' AND entite_id=?`, [siteId]);
    await db.runAsync(`DELETE FROM journal_modifications WHERE entite_type='site' AND entite_id=?`, [siteId]);
    await db.runAsync(`DELETE FROM sites WHERE id=?`, [siteId]);
  });
}

export async function getResumeSuppressionClient(clientId) {
  const db = await getDb();
  const client = await db.getFirstAsync(`SELECT id,nom FROM clients WHERE id=?`, [clientId]);
  if (!client) return null;
  const sites = await db.getFirstAsync(`SELECT COUNT(*) n FROM sites WHERE client_id=?`, [clientId]);
  const visites = await db.getFirstAsync(
    `SELECT COUNT(*) n FROM visites v JOIN sites s ON s.id=v.site_id WHERE s.client_id=?`, [clientId]
  );
  return { ...client, sites: Number(sites?.n || 0), visites: Number(visites?.n || 0) };
}

export async function supprimerClientComplet(clientId) {
  const db = await getDb();
  const sites = await db.getAllAsync(`SELECT id FROM sites WHERE client_id=?`, [clientId]);
  for (const site of sites) await supprimerSiteComplet(site.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM attributs_libres WHERE entite_type='client' AND entite_id=?`, [clientId]);
    await db.runAsync(`DELETE FROM provenances WHERE entite_type='client' AND entite_id=?`, [clientId]);
    await db.runAsync(`DELETE FROM journal_modifications WHERE entite_type='client' AND entite_id=?`, [clientId]);
    await db.runAsync(`DELETE FROM clients WHERE id=?`, [clientId]);
  });
}
