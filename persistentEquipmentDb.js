import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

let dbInstance = null;
async function getDb() {
  if (!dbInstance) dbInstance = await openAppDatabase();
  return dbInstance;
}
const uuidv4 = () => createId();

async function getVisiteSite(db, visiteId) {
  const visite = await db.getFirstAsync(`SELECT id, site_id FROM visites WHERE id=?`, [visiteId]);
  if (!visite) throw new Error('Visite introuvable');
  return visite.site_id;
}

async function ensureInstallation(db, siteId) {
  let installation = await db.getFirstAsync(
    `SELECT id FROM installations WHERE site_id=? AND actif=1 ORDER BY cree_le LIMIT 1`,
    [siteId]
  );
  if (installation) return installation.id;
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`,
    [id, siteId, 'installation_technique', 'Installation technique', 'Créée automatiquement depuis une visite']
  );
  return id;
}

async function upsertObservation(db, equipementId, visiteId, { etat = null, commentaire = null, present = 1 } = {}) {
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO observations_equipement(id,equipement_id,visite_id,etat,commentaire,present)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(equipement_id,visite_id) DO UPDATE SET
       etat=COALESCE(excluded.etat,observations_equipement.etat),
       commentaire=COALESCE(excluded.commentaire,observations_equipement.commentaire),
       present=excluded.present,
       observe_le=datetime('now')`,
    [id, equipementId, visiteId, etat, commentaire, present ? 1 : 0]
  );
}

async function convertirMaterielLegacy(db, visiteId, installationId) {
  const lignes = await db.getAllAsync(`SELECT * FROM materiel WHERE visite_id=? AND equipement_id IS NULL`, [visiteId]);
  for (const m of lignes) {
    const equipementId = uuidv4();
    await db.runAsync(
      `INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,annee,statut)
       VALUES(?,?,?,?,?,?,?,'actif')`,
      [equipementId, installationId, m.categorie || 'equipement', m.designation || 'Équipement', m.marque || null, m.modele || null, m.annee ? Number(m.annee) || null : null]
    );
    await db.runAsync(`UPDATE materiel SET equipement_id=? WHERE id=?`, [equipementId, m.id]);
    await upsertObservation(db, equipementId, visiteId, { etat: m.etat || 'Bon', present: 1 });
  }
}

async function injecterEquipementsActifsDuSite(db, visiteId, siteId) {
  const actifs = await db.getAllAsync(
    `SELECT e.*,
      (SELECT o.etat FROM observations_equipement o JOIN visites v2 ON v2.id=o.visite_id
       WHERE o.equipement_id=e.id AND o.present=1 AND v2.id<>?
       ORDER BY COALESCE(v2.date_visite,'') DESC,o.observe_le DESC LIMIT 1) dernier_etat
     FROM equipements e
     JOIN installations i ON i.id=e.installation_id
     WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'
       AND NOT EXISTS(SELECT 1 FROM materiel m WHERE m.visite_id=? AND m.equipement_id=e.id)
     ORDER BY e.designation,e.marque,e.modele`,
    [visiteId, siteId, visiteId]
  );
  for (const e of actifs) {
    const materielId = uuidv4();
    const etat = e.dernier_etat || 'Bon';
    await db.runAsync(
      `INSERT INTO materiel(id,visite_id,categorie,designation,marque,modele,annee,etat,equipement_id)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [materielId, visiteId, e.type_code || 'Équipement', e.designation || 'Équipement', e.marque || null, e.modele || null, e.annee ? String(e.annee) : null, etat, e.id]
    );
    await upsertObservation(db, e.id, visiteId, { etat, present: 1 });
  }
}

export async function listerMaterielPersistant(visiteId) {
  const db = await getDb();
  const siteId = await getVisiteSite(db, visiteId);
  const installationId = await ensureInstallation(db, siteId);
  await convertirMaterielLegacy(db, visiteId, installationId);
  await injecterEquipementsActifsDuSite(db, visiteId, siteId);
  return db.getAllAsync(
    `SELECT m.*,
      e.statut AS statut_equipement,
      COALESCE(o.etat,m.etat,'Bon') AS etat,
      COALESCE(o.commentaire,'') AS observation_commentaire,
      (SELECT COUNT(*) FROM observations_equipement h WHERE h.equipement_id=m.equipement_id) AS nb_observations,
      (SELECT MAX(v.date_visite) FROM observations_equipement h JOIN visites v ON v.id=h.visite_id
       WHERE h.equipement_id=m.equipement_id AND h.visite_id<>m.visite_id) AS derniere_visite
     FROM materiel m
     LEFT JOIN equipements e ON e.id=m.equipement_id
     LEFT JOIN observations_equipement o ON o.equipement_id=m.equipement_id AND o.visite_id=m.visite_id
     WHERE m.visite_id=?
     ORDER BY m.cree_le,m.id`,
    [visiteId]
  );
}

export async function ajouterMaterielPersistant(visiteId) {
  const db = await getDb();
  const siteId = await getVisiteSite(db, visiteId);
  const installationId = await ensureInstallation(db, siteId);
  const equipementId = uuidv4();
  const materielId = uuidv4();
  await db.runAsync(
    `INSERT INTO equipements(id,installation_id,type_code,designation,statut) VALUES(?,?,?,?, 'actif')`,
    [equipementId, installationId, 'Équipement', 'Équipement']
  );
  await db.runAsync(
    `INSERT INTO materiel(id,visite_id,categorie,designation,etat,equipement_id) VALUES(?,?,?,?,?,?)`,
    [materielId, visiteId, 'Équipement', 'Équipement', 'Bon', equipementId]
  );
  await upsertObservation(db, equipementId, visiteId, { etat: 'Bon', present: 1 });
  return materielId;
}

const CHAMP_EQUIPEMENT = {
  categorie: 'type_code', designation: 'designation', marque: 'marque', modele: 'modele', annee: 'annee',
};

export async function upsertMaterielPersistant(materielId, cle, valeur) {
  const db = await getDb();
  const m = await db.getFirstAsync(`SELECT * FROM materiel WHERE id=?`, [materielId]);
  if (!m) return;
  const champsAutorises = new Set(['categorie','designation','marque','modele','annee','etat']);
  if (!champsAutorises.has(cle)) throw new Error(`Champ matériel non autorisé: ${cle}`);
  await db.runAsync(`UPDATE materiel SET ${cle}=? WHERE id=?`, [valeur, materielId]);
  if (!m.equipement_id) return;
  if (cle === 'etat') {
    await upsertObservation(db, m.equipement_id, m.visite_id, { etat: valeur || 'Bon', present: 1 });
    return;
  }
  const colonne = CHAMP_EQUIPEMENT[cle];
  const persist = cle === 'annee' ? (valeur ? Number(valeur) || null : null) : (valeur || null);
  await db.runAsync(`UPDATE equipements SET ${colonne}=?,modifie_le=datetime('now') WHERE id=?`, [persist, m.equipement_id]);
}

export async function retirerMaterielPersistant(materielId) {
  const db = await getDb();
  const m = await db.getFirstAsync(`SELECT * FROM materiel WHERE id=?`, [materielId]);
  if (!m) return;
  if (m.equipement_id) {
    await db.runAsync(`UPDATE equipements SET statut='retire',modifie_le=datetime('now') WHERE id=?`, [m.equipement_id]);
    await upsertObservation(db, m.equipement_id, m.visite_id, {
      etat: m.etat || 'Hors service', commentaire: 'Équipement déclaré retiré pendant cette visite', present: 0,
    });
  }
  await db.runAsync(`DELETE FROM materiel WHERE id=?`, [materielId]);
}

export async function listerHistoriqueEquipement(equipementId) {
  if (!equipementId) return [];
  const db = await getDb();
  return db.getAllAsync(
    `SELECT o.id,o.etat,o.commentaire,o.present,o.observe_le,
            v.id AS visite_id,v.date_visite,v.statut AS statut_visite,s.nom_site,
            (SELECT COUNT(*) FROM remarques r
             WHERE r.visite_id=v.id AND r.reference_type='equipement' AND r.reference_id=o.equipement_id) AS nb_remarques,
            (SELECT COUNT(*) FROM photos p WHERE p.entite_key='equipement||' || o.equipement_id) AS nb_photos
     FROM observations_equipement o
     JOIN visites v ON v.id=o.visite_id
     JOIN sites s ON s.id=v.site_id
     WHERE o.equipement_id=?
     ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC`,
    [equipementId]
  );
}
