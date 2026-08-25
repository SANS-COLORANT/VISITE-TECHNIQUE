import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

const maintenant = () => new Date().toISOString();

async function db() { return openAppDatabase(); }

export async function synchroniserReservesSite(siteId) {
  const base = await db();
  const sources = await base.getAllAsync(
    `SELECT r.id,r.visite_id,r.poste,r.prestation,r.cree_le,v.date_visite
     FROM remarques r
     JOIN visites v ON v.id=r.visite_id
     WHERE v.site_id=?
       AND NOT EXISTS(SELECT 1 FROM reserves_suivi s WHERE s.source_remarque_id=r.id)
     ORDER BY COALESCE(v.date_visite,''),r.cree_le,r.id`,
    [siteId]
  );
  for (const r of sources) {
    const reserveId = createId();
    const date = r.date_visite || r.cree_le || maintenant();
    await base.runAsync(
      `INSERT OR IGNORE INTO reserves_suivi
       (id,site_id,source_visite_id,source_remarque_id,poste,prestation,statut,cree_le,modifie_le)
       VALUES(?,?,?,?,?,?,'ouverte',?,?)`,
      [reserveId, siteId, r.visite_id, r.id, r.poste || 'Observation', r.prestation || '', date, maintenant()]
    );
    const creee = await base.getFirstAsync(`SELECT id FROM reserves_suivi WHERE source_remarque_id=?`, [r.id]);
    if (creee?.id === reserveId) {
      await base.runAsync(
        `INSERT INTO historique_reserves
         (id,reserve_id,type_evenement,date_evenement,nouveau_statut,commentaire,source_visite_id)
         VALUES(?,?, 'creation', ?, 'ouverte', ?, ?)`,
        [createId(), reserveId, date, 'Créée depuis une réserve de visite', r.visite_id]
      );
    }
  }
}

export async function listerReservesSite(siteId, options = {}) {
  await synchroniserReservesSite(siteId);
  const base = await db();
  const { statut = 'toutes', depuis = null, jusqua = null } = options;
  const where = ['r.site_id=?'];
  const params = [siteId];
  if (statut === 'ouvertes') where.push(`r.statut='ouverte'`);
  if (statut === 'levees') where.push(`r.statut='levee'`);
  if (statut === 'archivees') where.push(`r.statut='archivee'`);
  if (depuis) { where.push(`date(r.cree_le)>=date(?)`); params.push(depuis); }
  if (jusqua) { where.push(`date(r.cree_le)<=date(?)`); params.push(jusqua); }
  return base.getAllAsync(
    `SELECT r.*,
       v.date_visite AS date_visite_origine,
       (SELECT COUNT(*) FROM historique_reserves h WHERE h.reserve_id=r.id) AS nb_evenements,
       (SELECT MAX(h.date_evenement) FROM historique_reserves h WHERE h.reserve_id=r.id) AS derniere_activite
     FROM reserves_suivi r
     LEFT JOIN visites v ON v.id=r.source_visite_id
     WHERE ${where.join(' AND ')}
     ORDER BY date(r.cree_le) DESC,r.cree_le DESC,r.id DESC`,
    params
  );
}

export async function getHistoriqueReserve(reserveId) {
  const base = await db();
  return base.getAllAsync(
    `SELECT * FROM historique_reserves WHERE reserve_id=? ORDER BY date_evenement DESC,id DESC`,
    [reserveId]
  );
}

export async function leverReserve(reserveId, commentaire = '') {
  const base = await db();
  const r = await base.getFirstAsync(`SELECT * FROM reserves_suivi WHERE id=?`, [reserveId]);
  if (!r || r.statut === 'levee') return;
  const date = maintenant();
  await base.runAsync(`UPDATE reserves_suivi SET statut='levee',levee_le=?,modifie_le=? WHERE id=?`, [date, date, reserveId]);
  await base.runAsync(
    `INSERT INTO historique_reserves(id,reserve_id,type_evenement,date_evenement,ancien_statut,nouveau_statut,commentaire)
     VALUES(?,?, 'levee', ?, ?, 'levee', ?)`,
    [createId(), reserveId, date, r.statut, commentaire || null]
  );
}

export async function reouvrirReserve(reserveId, commentaire = '') {
  const base = await db();
  const r = await base.getFirstAsync(`SELECT * FROM reserves_suivi WHERE id=?`, [reserveId]);
  if (!r || r.statut === 'ouverte') return;
  const date = maintenant();
  await base.runAsync(`UPDATE reserves_suivi SET statut='ouverte',levee_le=NULL,archivee_le=NULL,modifie_le=? WHERE id=?`, [date, reserveId]);
  await base.runAsync(
    `INSERT INTO historique_reserves(id,reserve_id,type_evenement,date_evenement,ancien_statut,nouveau_statut,commentaire)
     VALUES(?,?, 'reouverture', ?, ?, 'ouverte', ?)`,
    [createId(), reserveId, date, r.statut, commentaire || null]
  );
}

export async function ajouterEvenementReserve(reserveId, commentaire) {
  if (!String(commentaire || '').trim()) return;
  const base = await db();
  await base.runAsync(
    `INSERT INTO historique_reserves(id,reserve_id,type_evenement,date_evenement,commentaire)
     VALUES(?,?, 'note', ?, ?)`,
    [createId(), reserveId, maintenant(), String(commentaire).trim()]
  );
  await base.runAsync(`UPDATE reserves_suivi SET modifie_le=? WHERE id=?`, [maintenant(), reserveId]);
}

export async function modifierReserveSuivi(reserveId, patch = {}) {
  const base = await db();
  const actuelle = await base.getFirstAsync(`SELECT * FROM reserves_suivi WHERE id=?`, [reserveId]);
  if (!actuelle) return;
  const poste = Object.prototype.hasOwnProperty.call(patch, 'poste') ? patch.poste : actuelle.poste;
  const prestation = Object.prototype.hasOwnProperty.call(patch, 'prestation') ? patch.prestation : actuelle.prestation;
  await base.runAsync(`UPDATE reserves_suivi SET poste=?,prestation=?,modifie_le=? WHERE id=?`, [poste, prestation, maintenant(), reserveId]);
  await base.runAsync(
    `INSERT INTO historique_reserves(id,reserve_id,type_evenement,date_evenement,commentaire,details_json)
     VALUES(?,?, 'modification', ?, 'Fiche de suivi modifiée', ?)`,
    [createId(), reserveId, maintenant(), JSON.stringify({ avant: { poste: actuelle.poste, prestation: actuelle.prestation }, apres: { poste, prestation } })]
  );
}

export async function listerVisitesDatesSite(siteId) {
  const base = await db();
  return base.getAllAsync(
    `SELECT id,date_visite,statut FROM visites WHERE site_id=? AND date_visite IS NOT NULL ORDER BY date(date_visite) DESC,cree_le DESC`,
    [siteId]
  );
}

export async function statsReservesPeriode(siteId, depuis = null, jusqua = null) {
  await synchroniserReservesSite(siteId);
  const base = await db();
  const fin = jusqua || new Date().toISOString().slice(0, 10);
  const debut = depuis || '0001-01-01';
  const row = await base.getFirstAsync(
    `SELECT
       SUM(CASE WHEN date(cree_le) BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS creees,
       SUM(CASE WHEN levee_le IS NOT NULL AND date(levee_le) BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS levees,
       SUM(CASE WHEN date(cree_le)<=date(?) AND (levee_le IS NULL OR date(levee_le)>date(?)) THEN 1 ELSE 0 END) AS ouvertes_debut,
       SUM(CASE WHEN date(cree_le)<=date(?) AND (levee_le IS NULL OR date(levee_le)>date(?)) THEN 1 ELSE 0 END) AS ouvertes_fin,
       COUNT(*) AS total_depuis_origine
     FROM reserves_suivi WHERE site_id=?`,
    [debut, fin, debut, fin, debut, debut, fin, fin, siteId]
  );
  return {
    creees: Number(row?.creees || 0),
    levees: Number(row?.levees || 0),
    ouvertesDebut: Number(row?.ouvertes_debut || 0),
    ouvertesFin: Number(row?.ouvertes_fin || 0),
    totalDepuisOrigine: Number(row?.total_depuis_origine || 0),
    depuis: debut,
    jusqua: fin,
  };
}

export async function listerEquipementsSitePatrimoine(siteId, statut = 'actuels') {
  const base = await db();
  const filtre = statut === 'historique' ? `e.statut<>'actif'` : statut === 'tous' ? '1=1' : `e.statut='actif'`;
  return base.getAllAsync(
    `SELECT e.*,
       COALESCE(
         (SELECT h.etat_apres FROM historique_equipements h WHERE h.equipement_id=e.id AND h.etat_apres IS NOT NULL ORDER BY h.date_evenement DESC LIMIT 1),
         (SELECT o.etat FROM observations_equipement o JOIN visites v ON v.id=o.visite_id WHERE o.equipement_id=e.id ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1),
         'Non renseigné'
       ) AS dernier_etat,
       (SELECT MAX(h.date_evenement) FROM historique_equipements h WHERE h.equipement_id=e.id) AS derniere_activite,
       (SELECT COUNT(*) FROM observations_equipement o WHERE o.equipement_id=e.id) +
       (SELECT COUNT(*) FROM historique_equipements h WHERE h.equipement_id=e.id) AS nb_evenements
     FROM equipements e
     JOIN installations i ON i.id=e.installation_id
     WHERE i.site_id=? AND i.actif=1 AND ${filtre}
     ORDER BY e.type_code,e.designation,e.marque,e.modele`,
    [siteId]
  );
}

export async function getHistoriqueEquipementPatrimoine(equipementId) {
  const base = await db();
  return base.getAllAsync(
    `SELECT * FROM (
       SELECT o.id AS id,'visite' AS type_evenement,
              COALESCE(v.date_visite,o.observe_le) AS date_evenement,
              o.etat AS etat_apres,NULL AS statut_apres,o.commentaire AS commentaire,
              v.id AS source_visite_id,NULL AS remplace_par_id
       FROM observations_equipement o JOIN visites v ON v.id=o.visite_id WHERE o.equipement_id=?
       UNION ALL
       SELECT h.id,h.type_evenement,h.date_evenement,h.etat_apres,h.statut_apres,h.commentaire,h.source_visite_id,h.remplace_par_id
       FROM historique_equipements h WHERE h.equipement_id=?
     ) x ORDER BY date_evenement DESC,id DESC`,
    [equipementId, equipementId]
  );
}

export async function declarerEtatEquipement(equipementId, etat, commentaire = '') {
  const base = await db();
  const e = await base.getFirstAsync(
    `SELECT e.*,
       COALESCE((SELECT h.etat_apres FROM historique_equipements h WHERE h.equipement_id=e.id AND h.etat_apres IS NOT NULL ORDER BY h.date_evenement DESC LIMIT 1),
       (SELECT o.etat FROM observations_equipement o JOIN visites v ON v.id=o.visite_id WHERE o.equipement_id=e.id ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1)) AS dernier_etat
     FROM equipements e WHERE e.id=?`,
    [equipementId]
  );
  if (!e) return;
  const date = maintenant();
  await base.runAsync(
    `INSERT INTO historique_equipements(id,equipement_id,type_evenement,date_evenement,etat_avant,etat_apres,statut_avant,statut_apres,commentaire)
     VALUES(?,?, 'etat', ?, ?, ?, ?, ?, ?)`,
    [createId(), equipementId, date, e.dernier_etat || null, etat || null, e.statut, e.statut, commentaire || null]
  );
  await base.runAsync(`UPDATE equipements SET modifie_le=? WHERE id=?`, [date, equipementId]);
}

export async function remplacerEquipement(equipementId, nouveau = {}, commentaire = '') {
  const base = await db();
  const ancien = await base.getFirstAsync(`SELECT * FROM equipements WHERE id=?`, [equipementId]);
  if (!ancien) throw new Error('Équipement introuvable');
  const nouveauId = createId();
  const date = maintenant();
  await base.runAsync(
    `INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,numero_serie,annee,statut,cree_le,modifie_le)
     VALUES(?,?,?,?,?,?,?,?, 'actif', ?, ?)`,
    [nouveauId, ancien.installation_id, nouveau.type_code || ancien.type_code, nouveau.designation || ancien.designation || 'Équipement', nouveau.marque || null, nouveau.modele || null, nouveau.numero_serie || null, nouveau.annee ? Number(nouveau.annee) || null : null, date, date]
  );
  await base.runAsync(`UPDATE equipements SET statut='remplace',modifie_le=? WHERE id=?`, [date, equipementId]);
  await base.runAsync(
    `INSERT INTO historique_equipements(id,equipement_id,type_evenement,date_evenement,statut_avant,statut_apres,commentaire,remplace_par_id)
     VALUES(?,?, 'remplacement', ?, ?, 'remplace', ?, ?)`,
    [createId(), equipementId, date, ancien.statut, commentaire || 'Équipement remplacé', nouveauId]
  );
  await base.runAsync(
    `INSERT INTO historique_equipements(id,equipement_id,type_evenement,date_evenement,statut_apres,commentaire)
     VALUES(?,?, 'mise_en_service', ?, 'actif', ?)`,
    [createId(), nouveauId, date, `Remplace ${ancien.designation || 'un équipement précédent'}`]
  );
  return nouveauId;
}

export async function getStatsSitePatrimoine(siteId) {
  await synchroniserReservesSite(siteId);
  const base = await db();
  const r = await base.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN statut='ouverte' THEN 1 ELSE 0 END) AS ouvertes,
      SUM(CASE WHEN statut='levee' THEN 1 ELSE 0 END) AS levees
     FROM reserves_suivi WHERE site_id=?`, [siteId]
  );
  const e = await base.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN e.statut='actif' THEN 1 ELSE 0 END) AS actifs,
      SUM(CASE WHEN e.statut='remplace' THEN 1 ELSE 0 END) AS remplaces,
      SUM(CASE WHEN COALESCE(
        (SELECT h.etat_apres FROM historique_equipements h WHERE h.equipement_id=e.id AND h.etat_apres IS NOT NULL ORDER BY h.date_evenement DESC LIMIT 1),
        (SELECT o.etat FROM observations_equipement o JOIN visites v ON v.id=o.visite_id WHERE o.equipement_id=e.id ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1),'')
        IN ('Vétuste','Dégradé','Hors service','À surveiller') THEN 1 ELSE 0 END) AS a_surveiller
     FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=?`, [siteId]
  );
  return {
    reserves: { total: Number(r?.total || 0), ouvertes: Number(r?.ouvertes || 0), levees: Number(r?.levees || 0) },
    equipements: { total: Number(e?.total || 0), actifs: Number(e?.actifs || 0), remplaces: Number(e?.remplaces || 0), aSurveiller: Number(e?.a_surveiller || 0) },
  };
}

export async function getStatsClientPatrimoine(clientId) {
  const base = await db();
  const sites = await base.getAllAsync(`SELECT id FROM sites WHERE client_id=?`, [clientId]);
  for (const s of sites) await synchroniserReservesSite(s.id);
  const r = await base.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN r.statut='ouverte' THEN 1 ELSE 0 END) AS ouvertes,
      SUM(CASE WHEN r.statut='levee' THEN 1 ELSE 0 END) AS levees
     FROM reserves_suivi r JOIN sites s ON s.id=r.site_id WHERE s.client_id=?`, [clientId]
  );
  const e = await base.getFirstAsync(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN e.statut='actif' THEN 1 ELSE 0 END) AS actifs,
      SUM(CASE WHEN e.statut='remplace' THEN 1 ELSE 0 END) AS remplaces
     FROM equipements e JOIN installations i ON i.id=e.installation_id JOIN sites s ON s.id=i.site_id WHERE s.client_id=?`, [clientId]
  );
  return {
    sites: sites.length,
    reserves: { total: Number(r?.total || 0), ouvertes: Number(r?.ouvertes || 0), levees: Number(r?.levees || 0) },
    equipements: { total: Number(e?.total || 0), actifs: Number(e?.actifs || 0), remplaces: Number(e?.remplaces || 0) },
  };
}
