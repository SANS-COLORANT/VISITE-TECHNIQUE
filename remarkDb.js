import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';
import { supprimerPhotosEntiteComplete } from './photoDb.js';
import { clampReserveSeverity } from './reserveSeverity.js';

const normaliserNombreNullable = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

async function libelleElementControle(db, visiteId, controleKey) {
  const [sectionCode, cleBrute] = String(controleKey || '').split('||');
  const cle = String(cleBrute || '').trim() || 'Élément technique';
  const matchVmc = String(sectionCode || '').match(/^vmc-c(\d+)\./);
  if (!matchVmc) return cle;
  const index = Number(matchVmc[1]);
  const row = await db.getFirstAsync(`SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code='vmc.config' AND cle=?`, [visiteId, `caisson_${index}_nom`]);
  const brut = String(row?.valeur || '').trim();
  const defaut = `Caisson n°${index}`;
  const nom = !brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut) ? defaut : `${defaut} - ${brut}`;
  return `${nom} · ${cle}`;
}

async function materialiserReservesVmcManquantes(db, visiteId) {
  const visite = await db.getFirstAsync(`SELECT trame_id FROM visites WHERE id=?`, [visiteId]);
  if (visite?.trame_id !== 'vmc') return;
  const manquants = await db.getAllAsync(`SELECT c.section_code,c.cle,c.commentaire FROM controles_visite c WHERE c.visite_id=? AND c.avis='N.S' AND c.section_code LIKE 'vmc-c%.%' AND NOT EXISTS (SELECT 1 FROM remarques r WHERE r.visite_id=c.visite_id AND r.controle_key=(c.section_code || '||' || c.cle))`, [visiteId]);
  for (const controle of manquants || []) {
    const controleKey = `${controle.section_code}||${controle.cle}`;
    const referenceLibelle = await libelleElementControle(db, visiteId, controleKey);
    const commentaire = String(controle.commentaire || '').trim();
    const prestation = commentaire || `Anomalie constatée sur ${controle.cle} — à préciser.`;
    await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle,criticite,criticite_defaut,criticite_modifiee) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [createId(), visiteId, controleKey, 'VMC', prestation, null, null, `VMC — ${controle.cle} — Synchronisation N.S`, 'controle', controleKey, referenceLibelle, 2, 2, 0]);
  }
}

export async function listerRemarquesVisite(visiteId) {
  const db = await openAppDatabase();
  await materialiserReservesVmcManquantes(db, visiteId);
  return db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? ORDER BY criticite DESC, cree_le, id`, [visiteId]);
}

export async function upsertRemarquePrescription(visiteId, controleKey, prescription = {}, origine = null) {
  const db = await openAppDatabase();
  const existante = await db.getFirstAsync(`SELECT id,criticite,criticite_defaut,criticite_modifiee,perimetre FROM remarques WHERE visite_id=? AND controle_key=? LIMIT 1`, [visiteId, controleKey]);
  const aPerimetre = Object.prototype.hasOwnProperty.call(prescription, 'perimetre');
  const perimetre = prescription.perimetre === 'Primaire' || prescription.perimetre === 'Secondaire' ? prescription.perimetre : null;
  const poste = prescription.poste || 'Observation';
  const prestation = prescription.prestation || '';
  const delai = normaliserNombreNullable(prescription.delai);
  const estimatif = normaliserNombreNullable(prescription.estimatif);
  const criticiteDefaut = clampReserveSeverity(prescription.criticiteDefaut ?? prescription.criticite ?? existante?.criticite_defaut ?? 2);
  const criticite = existante?.criticite_modifiee ? clampReserveSeverity(existante.criticite) : criticiteDefaut;
  const referenceLibelle = await libelleElementControle(db, visiteId, controleKey);
  if (existante?.id) {
    await db.runAsync(`UPDATE remarques SET poste=?,prestation=?,delai=?,estimatif=?,origine=?,criticite=?,criticite_defaut=?,reference_type=COALESCE(reference_type,'controle'),reference_id=COALESCE(reference_id,?),reference_libelle=CASE WHEN reference_libelle IS NULL OR TRIM(reference_libelle)='' THEN ? ELSE reference_libelle END,perimetre=CASE WHEN ?=1 THEN ? ELSE perimetre END WHERE id=?`, [poste, prestation, delai, estimatif, origine || null, criticite, criticiteDefaut, controleKey, referenceLibelle, aPerimetre ? 1 : 0, perimetre, existante.id]);
    return existante.id;
  }
  const id = createId();
  await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle,criticite,criticite_defaut,criticite_modifiee,perimetre) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, visiteId, controleKey, poste, prestation, delai, estimatif, origine || null, 'controle', controleKey, referenceLibelle, criticite, criticiteDefaut, 0, perimetre]);
  return id;
}

export async function modifierCriticiteRemarque(id, criticite) {
  const db = await openAppDatabase();
  const value = clampReserveSeverity(criticite);
  await db.runAsync(`UPDATE remarques SET criticite=?,criticite_modifiee=CASE WHEN criticite_defaut=? THEN 0 ELSE 1 END WHERE id=?`, [value, value, id]);
  return value;
}

export async function supprimerRemarqueControle(visiteId, controleKey) {
  const db = await openAppDatabase();
  const remarques = await db.getAllAsync(`SELECT id FROM remarques WHERE visite_id=? AND controle_key=?`, [visiteId, controleKey]);
  for (const remarque of remarques || []) await supprimerPhotosEntiteComplete(visiteId, `remarque||${remarque.id}`);
  await db.runAsync(`DELETE FROM remarques WHERE visite_id=? AND controle_key=?`, [visiteId, controleKey]);
}

export async function ajouterRemarqueVisite(visiteId, data = {}) {
  const db = await openAppDatabase();
  const id = createId();
  const criticite = clampReserveSeverity(data.criticite ?? 2);
  const perimetre = data.perimetre === 'Primaire' || data.perimetre === 'Secondaire' ? data.perimetre : null;
  await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,criticite,criticite_defaut,criticite_modifiee,perimetre) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [id, visiteId, data.controleKey || null, data.poste || 'Observation', data.prestation || data.description || '', normaliserNombreNullable(data.delai), normaliserNombreNullable(data.estimatif ?? data.prix), data.origine || 'Manuelle', criticite, criticite, 0, perimetre]);
  return id;
}

export async function modifierRemarqueVisite(id, patch = {}) {
  const db = await openAppDatabase();
  const autorisees = ['poste', 'prestation', 'delai', 'estimatif', 'criticite', 'perimetre', 'intranet_date_reserve', 'intranet_delai', 'intranet_etat_avancement'];
  const sets = []; const params = [];
  for (const cle of autorisees) {
    if (!Object.prototype.hasOwnProperty.call(patch, cle)) continue;
    sets.push(`${cle}=?`);
    let value = patch[cle];
    if (cle === 'delai' || cle === 'estimatif') value = normaliserNombreNullable(value);
    else if (cle === 'criticite') value = clampReserveSeverity(value);
    else if (cle === 'perimetre') value = value === 'Primaire' || value === 'Secondaire' ? value : null;
    else if (cle.startsWith('intranet_')) value = value == null || String(value).trim() === '' ? null : String(value).trim();
    params.push(value);
    // Revenir à la criticité proposée n'est plus compté comme une modification.
    if (cle === 'criticite') { sets.push('criticite_modifiee=CASE WHEN COALESCE(criticite_defaut,2)=? THEN 0 ELSE 1 END'); params.push(value); }
  }
  if (!sets.length) return;
  params.push(id);
  await db.runAsync(`UPDATE remarques SET ${sets.join(', ')} WHERE id=?`, params);
}

export async function supprimerRemarqueVisite(id) {
  const db = await openAppDatabase();
  const remarque = await db.getFirstAsync(`SELECT id,visite_id FROM remarques WHERE id=?`, [id]);
  if (!remarque) return;
  await supprimerPhotosEntiteComplete(remarque.visite_id, `remarque||${id}`);
  await db.runAsync(`DELETE FROM remarques WHERE id=?`, [id]);
}

export async function rattacherRemarqueVisite(id, cible = {}) {
  const db = await openAppDatabase();
  const aPerimetre = cible.perimetre === 'Primaire' || cible.perimetre === 'Secondaire';
  await db.runAsync(
    `UPDATE remarques SET reference_onglet=?,reference_type=?,reference_id=?,reference_libelle=?,
      perimetre=CASE WHEN ?=1 THEN ? ELSE perimetre END WHERE id=?`,
    [cible.onglet || null, cible.type || null, cible.id || null, cible.libelle || null, aPerimetre ? 1 : 0, aPerimetre ? cible.perimetre : null, id]
  );
}

export async function ajouterRemarqueDepuisBibliotheque(visiteId, item = {}) {
  return ajouterRemarqueVisite(visiteId, { poste: item.poste || 'Observation', prestation: item.description || item.nom || '', delai: item.delai, estimatif: item.prix, criticite: item.criticite, origine: item.nom ? `Bibliothèque — ${item.nom}` : 'Bibliothèque' });
}
