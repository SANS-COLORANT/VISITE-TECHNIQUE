import { openAppDatabase } from './database/index.js';

function estNombreTexte(value) {
  return /^[-+]?\d+(?:[.,]\d+)?$/.test(String(value ?? '').trim());
}

function controleCommentaireNumerique(cle) {
  return /(?:nombre|\bnb\b|nb cellules|nb déclencheurs|nb sirènes|nb gyrophares)/i.test(String(cle || ''));
}

/**
 * Met à jour partiellement un contrôle sans effacer l'avis lorsque seul le
 * commentaire change (et inversement).
 *
 * Les anciennes trames ICPE utilisent parfois la colonne « Commentaire » pour
 * une mesure numérique (ex. Extincteurs: Nombre = 2). Une préconisation de
 * réserve ne doit jamais remplacer cette mesure par son texte de prestation.
 */
export async function upsertControlePartiel(visiteId, sectionCode, cle, patch = {}) {
  const db = await openAppDatabase();
  const actuel = await db.getFirstAsync(
    `SELECT avis, commentaire FROM controles_visite
     WHERE visite_id=? AND section_code=? AND cle=?`,
    [visiteId, sectionCode, cle]
  );

  const avis = Object.prototype.hasOwnProperty.call(patch, 'avis') ? patch.avis : (actuel?.avis ?? null);
  let commentaire = Object.prototype.hasOwnProperty.call(patch, 'commentaire') ? patch.commentaire : (actuel?.commentaire ?? null);

  if (
    Object.prototype.hasOwnProperty.call(patch, 'commentaire') &&
    controleCommentaireNumerique(cle) &&
    estNombreTexte(actuel?.commentaire) &&
    !estNombreTexte(patch.commentaire)
  ) {
    commentaire = actuel.commentaire;
  }

  await db.runAsync(
    `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
     VALUES(?,?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle)
     DO UPDATE SET avis=excluded.avis, commentaire=excluded.commentaire`,
    [visiteId, sectionCode, cle, avis, commentaire]
  );
}
