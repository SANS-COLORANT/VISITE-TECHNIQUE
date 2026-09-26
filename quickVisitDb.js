/**
 * Visite rapide (bouton + de la barre du bas) : démarre une visite sans client.
 *
 * Le schéma impose visite → site → client. La visite rapide est donc rangée
 * sous un client local unique « À rattacher » (identifiant fixe), avec un site
 * par visite. Ce client n'a aucun identifiant Intranet : tant que la visite
 * n'est pas rattachée à un vrai client, elle reste locale et n'est jamais
 * proposée à l'envoi Intranet.
 */
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { creerVisiteProduction } from './visitCreationDb.js';

export const QUICK_VISIT_CLIENT_ID = 'metra-visites-a-rattacher';
export const QUICK_VISIT_CLIENT_NAME = 'À rattacher';

async function assurerClientARattacher(db) {
  await db.runAsync(
    `INSERT OR IGNORE INTO clients (id, nom, code_exploitant, adresse) VALUES (?, ?, NULL, NULL)`,
    [QUICK_VISIT_CLIENT_ID, QUICK_VISIT_CLIENT_NAME]
  );
}

function nomParDefaut() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Visite rapide du ${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

export async function creerVisiteRapide({ trameId, nom = '' } = {}) {
  const db = await getDb();
  await assurerClientARattacher(db);
  const siteId = createId();
  const nomSite = String(nom || '').trim() || nomParDefaut();
  await db.runAsync(
    `INSERT INTO sites (id, client_id, nom_site, adresse, statut) VALUES (?, ?, ?, NULL, 'Actif')`,
    [siteId, QUICK_VISIT_CLIENT_ID, nomSite]
  );
  const visiteId = await creerVisiteProduction({ siteId, trameId, mode: 'complete' });
  return { visiteId, siteId, nomSite };
}

export async function listerIdsVisitesARattacher() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT v.id FROM visites v JOIN sites s ON s.id=v.site_id WHERE s.client_id=?`,
    [QUICK_VISIT_CLIENT_ID]
  );
  return new Set((rows || []).map((r) => r.id));
}

export async function estVisiteARattacher(visiteId) {
  if (!visiteId) return false;
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT 1 AS ok FROM visites v JOIN sites s ON s.id=v.site_id WHERE v.id=? AND s.client_id=?`,
    [visiteId, QUICK_VISIT_CLIENT_ID]
  );
  return Boolean(row?.ok);
}

// ---------------------------------------------------------------------------
// Rattachement d'une visite rapide à un vrai client / site.
// ---------------------------------------------------------------------------

export async function rechercherClientsRattachement(query = '') {
  const db = await getDb();
  const q = `%${String(query || '').trim()}%`;
  return db.getAllAsync(
    `SELECT id, nom, code_exploitant FROM clients
     WHERE id<>? AND (nom LIKE ? OR IFNULL(code_exploitant,'') LIKE ?)
     ORDER BY nom COLLATE NOCASE LIMIT 60`,
    [QUICK_VISIT_CLIENT_ID, q, q]
  );
}

export async function listerSitesRattachement(clientId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT id, nom_site, adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE`, [clientId]);
}

/** Supprime les sites techniques « À rattacher » devenus vides. */
export async function nettoyerSitesARattacherVides() {
  const db = await getDb();
  const vides = await db.getAllAsync(
    `SELECT s.id FROM sites s WHERE s.client_id=? AND NOT EXISTS (SELECT 1 FROM visites v WHERE v.site_id=s.id)`,
    [QUICK_VISIT_CLIENT_ID]
  );
  if (!vides?.length) return 0;
  const { supprimerSiteComplet } = require('./entityManagementDb.js');
  for (const row of vides) await supprimerSiteComplet(row.id);
  return vides.length;
}

/**
 * Déplace la visite rapide vers un site existant (siteId) ou vers un nouveau
 * site créé chez le client choisi (nouveauSiteNom). Les champs « Nom du
 * client » / « Nom du site » préremplis avec les valeurs provisoires sont
 * mis à jour ; les autres saisies restent intactes.
 */
export async function rattacherVisiteRapide({ visiteId, clientId, siteId = null, nouveauSiteNom = '' }) {
  if (!visiteId || !clientId) throw new Error('Client requis pour rattacher la visite.');
  if (clientId === QUICK_VISIT_CLIENT_ID) throw new Error('Choisis un vrai client.');
  const db = await getDb();
  const actuelle = await db.getFirstAsync(
    `SELECT v.site_id, s.nom_site, s.client_id FROM visites v JOIN sites s ON s.id=v.site_id WHERE v.id=?`,
    [visiteId]
  );
  if (!actuelle) throw new Error('Visite introuvable.');
  if (actuelle.client_id !== QUICK_VISIT_CLIENT_ID) throw new Error('Cette visite est déjà rattachée à un client.');
  const client = await db.getFirstAsync(`SELECT id, nom FROM clients WHERE id=?`, [clientId]);
  if (!client) throw new Error('Client introuvable.');

  let cibleId = siteId;
  let cibleNom = null;
  await db.withTransactionAsync(async () => {
    if (cibleId) {
      const site = await db.getFirstAsync(`SELECT id, nom_site FROM sites WHERE id=? AND client_id=?`, [cibleId, clientId]);
      if (!site) throw new Error('Site introuvable pour ce client.');
      cibleNom = site.nom_site;
    } else {
      cibleId = createId();
      cibleNom = String(nouveauSiteNom || '').trim() || actuelle.nom_site;
      await db.runAsync(`INSERT INTO sites (id, client_id, nom_site, adresse, statut) VALUES (?, ?, ?, NULL, 'Actif')`, [cibleId, clientId, cibleNom]);
    }
    await db.runAsync(`UPDATE visites SET site_id=?, modifie_le=datetime('now') WHERE id=?`, [cibleId, visiteId]);
    await db.runAsync(
      `UPDATE champs_visite SET valeur=? WHERE visite_id=? AND cle='Nom du client' AND (valeur IS NULL OR trim(valeur)='' OR valeur=?)`,
      [client.nom, visiteId, QUICK_VISIT_CLIENT_NAME]
    );
    await db.runAsync(
      `UPDATE champs_visite SET valeur=? WHERE visite_id=? AND cle IN ('Nom du site','Référence du site') AND (valeur IS NULL OR trim(valeur)='' OR valeur=?)`,
      [cibleNom, visiteId, actuelle.nom_site]
    );
  });
  await nettoyerSitesARattacherVides().catch((e) => console.warn('Nettoyage des sites « À rattacher » incomplet', e));
  return { siteId: cibleId, nomSite: cibleNom, nomClient: client.nom };
}
