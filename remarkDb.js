import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';
import { supprimerPhotosEntiteComplete } from './photoDb.js';

const normaliserNombreNullable = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

async function libelleElementControle(db, visiteId, controleKey) {
  const [sectionCode, cleBrute] = String(controleKey || '').split('||');
  const cle = String(cleBrute || '').trim() || 'Élément technique';
  const matchVmc = String(sectionCode || '').match(/^vmc-c([1-6])\./);
  if (!matchVmc) return cle;

  const index = Number(matchVmc[1]);
  const row = await db.getFirstAsync(
    `SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code='vmc.config' AND cle=?`,
    [visiteId, `caisson_${index}_nom`]
  );
  const nom = String(row?.valeur || `Caisson ${index}`).trim() || `Caisson ${index}`;
  return `${nom} · ${cle}`;
}

/**
 * Répare automatiquement les visites VMC saisies avec une version antérieure :
 * tout contrôle N.S doit avoir une ligne correspondante dans REMARQUES.
 * Cela garantit que la synthèse, l'Excel et le rapport ne perdent aucun N.S,
 * même si la réserve n'avait pas encore été matérialisée au moment de la saisie.
 */
async function materialiserReservesVmcManquantes(db, visiteId) {
  const visite = await db.getFirstAsync(`SELECT trame_id FROM visites WHERE id=?`, [visiteId]);
  if (visite?.trame_id !== 'vmc') return;

  const manquants = await db.getAllAsync(
    `SELECT c.section_code, c.cle, c.commentaire
     FROM controles_visite c
     WHERE c.visite_id=?
       AND c.avis='N.S'
       AND c.section_code LIKE 'vmc-c%.%'
       AND NOT EXISTS (
         SELECT 1 FROM remarques r
         WHERE r.visite_id=c.visite_id
           AND r.controle_key=(c.section_code || '||' || c.cle)
       )`,
    [visiteId]
  );

  for (const controle of manquants || []) {
    const controleKey = `${controle.section_code}||${controle.cle}`;
    const referenceLibelle = await libelleElementControle(db, visiteId, controleKey);
    const commentaire = String(controle.commentaire || '').trim();
    const prestation = commentaire || `Anomalie constatée sur ${controle.cle} — à préciser.`;
    await db.runAsync(
      `INSERT INTO remarques(
         id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,
         reference_type,reference_id,reference_libelle
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        createId(), visiteId, controleKey, 'VMC', prestation, null, null,
        `VMC — ${controle.cle} — Synchronisation N.S`,
        'controle', controleKey, referenceLibelle,
      ]
    );
  }
}

export async function listerRemarquesVisite(visiteId) {
  const db = await openAppDatabase();
  await materialiserReservesVmcManquantes(db, visiteId);
  return db.getAllAsync(
    `SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le, id`,
    [visiteId]
  );
}

/**
 * Copie une prescription dans la réserve DE LA VISITE.
 * La copie devient ensuite indépendante de la bibliothèque et peut être modifiée.
 */
export async function upsertRemarquePrescription(visiteId, controleKey, prescription = {}, origine = null) {
  const db = await openAppDatabase();
  const existante = await db.getFirstAsync(
    `SELECT id FROM remarques WHERE visite_id=? AND controle_key=? LIMIT 1`,
    [visiteId, controleKey]
  );
  const poste = prescription.poste || 'Observation';
  const prestation = prescription.prestation || '';
  const delai = normaliserNombreNullable(prescription.delai);
  const estimatif = normaliserNombreNullable(prescription.estimatif);
  const referenceLibelle = await libelleElementControle(db, visiteId, controleKey);

  if (existante?.id) {
    await db.runAsync(
      `UPDATE remarques
       SET poste=?, prestation=?, delai=?, estimatif=?, origine=?,
           reference_type=COALESCE(reference_type,'controle'),
           reference_id=COALESCE(reference_id,?),
           reference_libelle=CASE
             WHEN reference_libelle IS NULL OR TRIM(reference_libelle)='' THEN ?
             ELSE reference_libelle
           END
       WHERE id=?`,
      [poste, prestation, delai, estimatif, origine || null, controleKey, referenceLibelle, existante.id]
    );
    return existante.id;
  }

  const id = createId();
  await db.runAsync(
    `INSERT INTO remarques(
       id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,
       reference_type,reference_id,reference_libelle
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id, visiteId, controleKey, poste, prestation, delai, estimatif, origine || null, 'controle', controleKey, referenceLibelle]
  );
  return id;
}

export async function supprimerRemarqueControle(visiteId, controleKey) {
  const db = await openAppDatabase();
  const remarques = await db.getAllAsync(
    `SELECT id FROM remarques WHERE visite_id=? AND controle_key=?`,
    [visiteId, controleKey]
  );
  for (const remarque of remarques || []) {
    await supprimerPhotosEntiteComplete(visiteId, `remarque||${remarque.id}`);
  }
  await db.runAsync(
    `DELETE FROM remarques WHERE visite_id=? AND controle_key=?`,
    [visiteId, controleKey]
  );
}

export async function ajouterRemarqueVisite(visiteId, data = {}) {
  const db = await openAppDatabase();
  const id = createId();
  await db.runAsync(
    `INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine)
     VALUES(?,?,?,?,?,?,?,?)`,
    [
      id,
      visiteId,
      data.controleKey || null,
      data.poste || 'Observation',
      data.prestation || data.description || '',
      normaliserNombreNullable(data.delai),
      normaliserNombreNullable(data.estimatif ?? data.prix),
      data.origine || 'Manuelle',
    ]
  );
  return id;
}

/** Modifie uniquement la copie rattachée à la visite. */
export async function modifierRemarqueVisite(id, patch = {}) {
  const db = await openAppDatabase();
  const autorisees = ['poste', 'prestation', 'delai', 'estimatif'];
  const sets = [];
  const params = [];

  for (const cle of autorisees) {
    if (!Object.prototype.hasOwnProperty.call(patch, cle)) continue;
    sets.push(`${cle}=?`);
    params.push(
      cle === 'delai' || cle === 'estimatif'
        ? normaliserNombreNullable(patch[cle])
        : patch[cle]
    );
  }
  if (!sets.length) return;
  params.push(id);
  await db.runAsync(`UPDATE remarques SET ${sets.join(', ')} WHERE id=?`, params);
}

export async function supprimerRemarqueVisite(id) {
  const db = await openAppDatabase();
  const remarque = await db.getFirstAsync(`SELECT id, visite_id FROM remarques WHERE id=?`, [id]);
  if (!remarque) return;
  await supprimerPhotosEntiteComplete(remarque.visite_id, `remarque||${id}`);
  await db.runAsync(`DELETE FROM remarques WHERE id=?`, [id]);
}

export async function rattacherRemarqueVisite(id, cible = {}) {
  const db = await openAppDatabase();
  await db.runAsync(
    `UPDATE remarques
     SET reference_onglet=?, reference_type=?, reference_id=?, reference_libelle=?
     WHERE id=?`,
    [
      cible.onglet || null,
      cible.type || null,
      cible.id || null,
      cible.libelle || null,
      id,
    ]
  );
}

export async function ajouterRemarqueDepuisBibliotheque(visiteId, item = {}) {
  return ajouterRemarqueVisite(visiteId, {
    poste: item.poste || 'Observation',
    prestation: item.description || item.nom || '',
    delai: item.delai,
    estimatif: item.prix,
    origine: item.nom ? `Bibliothèque — ${item.nom}` : 'Bibliothèque',
  });
}
