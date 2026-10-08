import { getDb, ajouterMateriel, upsertMaterielChamp, uuidv4 } from './db.js';
import { listerMaterielPersistant, equipementCompatible } from './persistentEquipmentDb.js';

export async function listerEquipementsPointage(visiteId) {
  const db = await getDb();
  const rows = await listerMaterielPersistant(visiteId);
  const history = await db.getAllAsync(`SELECT DISTINCT m.equipement_id FROM materiel m JOIN visites v ON v.id=m.visite_id
    JOIN visites current ON current.id=? WHERE m.equipement_id IS NOT NULL AND m.visite_id<>current.id
    AND (v.date_visite<current.date_visite OR (v.date_visite=current.date_visite AND v.rowid<current.rowid))`, [visiteId]);
  const known = new Set(history.map((m) => m.equipement_id));
  return rows.map((m) => ({ ...m, deja_reference: known.has(m.equipement_id) || !m.ajoute_pendant_visite }));
}
export async function creerEquipementVisite(visiteId) {
  const db = await getDb();
  const id = await ajouterMateriel(visiteId);
  await db.runAsync('UPDATE materiel SET ajoute_pendant_visite=1,confirme_le=NULL,etat=NULL WHERE id=? AND visite_id=?', [id, visiteId]);
  await db.runAsync('DELETE FROM observations_equipement WHERE visite_id=? AND equipement_id=(SELECT equipement_id FROM materiel WHERE id=?)', [visiteId,id]);
  return id;
}
/** Annule le pointage « présent » de cette visite (geste « Annuler » ou second toucher). */
export async function annulerPresenceEquipements(visiteId, materielIds) {
  if (!materielIds?.length) return;
  const db = await getDb();
  for (const id of materielIds) {
    await db.runAsync('UPDATE materiel SET confirme_le=NULL WHERE id=? AND visite_id=?', [id, visiteId]);
  }
}

export async function confirmerEquipementVisite(visiteId, materielId) {
  const db = await getDb();
  const item = await db.getFirstAsync('SELECT id,perimetre FROM materiel WHERE id=? AND visite_id=?', [materielId, visiteId]);
  if (!item) throw new Error('Cet équipement ne fait pas partie de cette visite.');
  const visit = await db.getFirstAsync('SELECT trame_id FROM visites WHERE id=?', [visiteId]);
  if (visit?.trame_id === 'reseau_chaleur_v1' && !item.perimetre) throw new Error('Choisis Primaire ou Secondaire dans la fiche avant de confirmer.');
  // Le pointage confirme la présence, sans inventer un état satisfaisant.
  await db.runAsync("UPDATE materiel SET confirme_le=datetime('now') WHERE id=? AND visite_id=?", [materielId, visiteId]);
}
export async function dupliquerEquipementVisite(visiteId, sourceId) {
  const db = await getDb();
  const source = await db.getFirstAsync('SELECT * FROM materiel WHERE id=? AND visite_id=?', [sourceId, visiteId]);
  if (!source) throw new Error('Équipement source introuvable dans cette visite.');
  const id = await creerEquipementVisite(visiteId);
  for (const key of ['categorie', 'marque', 'modele', 'perimetre', 'reseau_desservi', 'caracteristiques']) {
    if (source[key]) await upsertMaterielChamp(id, key, source[key]);
  }
  await upsertMaterielChamp(id, 'designation', `${source.designation || source.categorie || 'Équipement'} · copie`);
  // La série, l'année et l'état doivent être vérifiés sur le nouvel appareil.
  await db.runAsync('UPDATE materiel SET etat=NULL,confirme_le=NULL WHERE id=?', [id]);
  await db.runAsync('DELETE FROM observations_equipement WHERE visite_id=? AND equipement_id=(SELECT equipement_id FROM materiel WHERE id=?)', [visiteId, id]);
  return id;
}
export async function listerAnomaliesPrecedentes(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT r.*,v.date_visite AS date_source FROM remarques r JOIN visites v ON v.id=r.visite_id
    JOIN visites current ON current.id=? WHERE current.installation_id IS NOT NULL
    AND v.installation_id=current.installation_id AND v.trame_id=current.trame_id
    AND v.id=(SELECT old.id FROM visites old WHERE old.installation_id=current.installation_id AND old.trame_id=current.trame_id
      AND (old.date_visite<current.date_visite OR (old.date_visite=current.date_visite AND old.rowid<current.rowid))
      ORDER BY old.date_visite DESC,old.rowid DESC LIMIT 1)
    ORDER BY r.criticite DESC,r.cree_le`, [visiteId]);
}
export async function listerEquipementsAutresLocaux(visiteId) {
  const db = await getDb();
  const visit = await db.getFirstAsync('SELECT site_id,installation_id,trame_id FROM visites WHERE id=?', [visiteId]);
  if (!visit?.installation_id) return [];
  const rows = await db.getAllAsync(`SELECT e.*,i.nom AS nom_local,
    (SELECT GROUP_CONCAT(et.trame_id) FROM equipement_trames et WHERE et.equipement_id=e.id AND et.actif=1) AS trames_explicit,
    (SELECT COUNT(*) FROM equipement_trames et WHERE et.equipement_id=e.id) AS nb_trames
    FROM equipements e JOIN installations i ON i.id=e.installation_id
    WHERE i.site_id=? AND i.id<>? AND i.actif=1 AND e.statut='actif'
      AND NOT EXISTS(SELECT 1 FROM materiel m WHERE m.visite_id=? AND m.equipement_id=e.id) ORDER BY e.designation`, [visit.site_id,visit.installation_id,visiteId]);
  return rows.filter(e=>equipementCompatible(e,visit.trame_id));
}
export async function rattacherEquipementAuLocal(visiteId, equipementId) {
  const db = await getDb();
  const available = await listerEquipementsAutresLocaux(visiteId);
  if (!available.some(e=>e.id===equipementId)) throw new Error('Équipement indisponible ou incompatible avec ce local et cette trame.');
  const visit = await db.getFirstAsync('SELECT installation_id FROM visites WHERE id=?', [visiteId]);
  await db.withTransactionAsync(async()=>{
    await db.runAsync("UPDATE equipements SET installation_id=?,modifie_le=datetime('now') WHERE id=?", [visit.installation_id,equipementId]);
    await listerMaterielPersistant(visiteId);
  });
}
export async function listerPointsMesureVisite(visiteId) {
  return (await getDb()).getAllAsync('SELECT * FROM points_mesure_visite WHERE visite_id=? ORDER BY cree_le,id', [visiteId]);
}
export async function ajouterPointMesureVisite(visiteId, libelle, unite) {
  const name = String(libelle || '').trim();
  if (!name) throw new Error('Donne un nom au point de mesure.');
  if (!['°C', 'bar', 'pH'].includes(unite)) throw new Error('Unité de mesure invalide.');
  const id = uuidv4();
  await (await getDb()).runAsync('INSERT INTO points_mesure_visite(id,visite_id,libelle,unite) VALUES(?,?,?,?)', [id,visiteId,name,unite]);
  return id;
}
export async function modifierPointMesureVisite(visiteId, id, cle, valeur) {
  if (!['libelle', 'valeur'].includes(cle)) throw new Error('Champ de mesure invalide.');
  const text = String(valeur ?? '').trim();
  if (cle === 'libelle' && !text) throw new Error('Le nom du point est obligatoire.');
  if (cle === 'valeur' && text && !/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) throw new Error('Saisis une valeur numérique.');
  if (cle === 'valeur' && text && !Number.isFinite(Number(text.replace(',','.')))) throw new Error('Valeur numérique hors plage.');
  await (await getDb()).runAsync(`UPDATE points_mesure_visite SET ${cle}=? WHERE id=? AND visite_id=?`, [text||null,id,visiteId]);
}
