/**
 * Tournée d'un client : liste des sites ou locaux à faire.
 *
 * L'état « fait » est déduit des visites (voir migration 047) : créer une
 * visite sur le local coche la cible du local et celle de son site.
 */
import { getDb, uuidv4 } from './db.js';

const cleCible = (siteId, installationId) => `${siteId}:${installationId || ''}`;

const SELECT_CIBLES = `
  SELECT t.id, t.client_id, t.site_id, t.installation_id, t.cree_le,
    CASE WHEN t.installation_id IS NULL
      THEN EXISTS(SELECT 1 FROM visites v WHERE v.site_id=t.site_id AND v.cree_le>=t.cree_le)
      ELSE EXISTS(SELECT 1 FROM visites v WHERE v.installation_id=t.installation_id AND v.cree_le>=t.cree_le)
    END AS fait
  FROM tournee_cibles t`;

/** Cibles d'un client avec leur état `fait` (0/1). */
export async function listerTourneeClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(`${SELECT_CIBLES} WHERE t.client_id=? ORDER BY t.cree_le, t.id`, [String(clientId)]);
}

/** Cibles de locaux d'un site. */
export async function listerTourneeSite(siteId) {
  const db = await getDb();
  return db.getAllAsync(`${SELECT_CIBLES} WHERE t.site_id=? AND t.installation_id IS NOT NULL ORDER BY t.cree_le, t.id`, [String(siteId)]);
}

/** Ajoute des cibles ({ siteId, installationId? }) ; une cible déjà présente est conservée. */
export async function ajouterCiblesTournee(clientId, cibles) {
  const db = await getDb();
  let ajoutees = 0;
  for (const cible of cibles || []) {
    if (!cible?.siteId) continue;
    const res = await db.runAsync(
      `INSERT OR IGNORE INTO tournee_cibles(id,client_id,site_id,installation_id,cle) VALUES(?,?,?,?,?)`,
      [uuidv4(), String(clientId), String(cible.siteId), cible.installationId || null, cleCible(cible.siteId, cible.installationId)],
    );
    ajoutees += Number(res?.changes || 0);
  }
  return ajoutees;
}

export async function retirerCiblesTournee(clientId, cibles) {
  const db = await getDb();
  for (const cible of cibles || []) {
    await db.runAsync(`DELETE FROM tournee_cibles WHERE client_id=? AND cle=?`, [String(clientId), cleCible(cible.siteId, cible.installationId)]);
  }
}

/** Vide la tournée du client (nouvelle campagne). */
export async function viderTourneeClient(clientId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tournee_cibles WHERE client_id=?`, [String(clientId)]);
}

/** Retire seulement les cibles déjà faites : on repart sur ce qui reste. */
export async function retirerCiblesFaites(clientId) {
  const db = await getDb();
  const rows = await listerTourneeClient(clientId);
  const faites = rows.filter((r) => Number(r.fait) === 1).map((r) => r.id);
  for (const id of faites) await db.runAsync(`DELETE FROM tournee_cibles WHERE id=?`, [id]);
  return faites.length;
}

/** Bilan d'une liste de cibles : { total, faits, restants }. */
export function bilanTournee(rows = []) {
  const total = rows.length;
  const faits = rows.filter((r) => Number(r.fait) === 1).length;
  return { total, faits, restants: total - faits };
}

/** Index par site (cible de site) et par local (cible de local). */
export function indexerTournee(rows = []) {
  const sites = new Map();
  const locaux = new Map();
  for (const r of rows) {
    if (r.installation_id) locaux.set(r.installation_id, r);
    else sites.set(r.site_id, r);
  }
  return { sites, locaux };
}
