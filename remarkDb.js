import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

const normaliserNombreNullable = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(String(valeur).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export async function listerRemarquesVisite(visiteId) {
  const db = await openAppDatabase();
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

  if (existante?.id) {
    await db.runAsync(
      `UPDATE remarques
       SET poste=?, prestation=?, delai=?, estimatif=?, origine=?
       WHERE id=?`,
      [poste, prestation, delai, estimatif, origine || null, existante.id]
    );
    return existante.id;
  }

  const id = createId();
  await db.runAsync(
    `INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine)
     VALUES(?,?,?,?,?,?,?,?)`,
    [id, visiteId, controleKey, poste, prestation, delai, estimatif, origine || null]
  );
  return id;
}

export async function supprimerRemarqueControle(visiteId, controleKey) {
  const db = await openAppDatabase();
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
