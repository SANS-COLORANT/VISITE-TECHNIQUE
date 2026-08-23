import { openAppDatabase } from './database/index.js';

/**
 * Met à jour partiellement un contrôle sans effacer l'avis lorsque seul le
 * commentaire change (et inversement). Compatible avec l'API utilisée par
 * ControleGenerique : { avis } / { commentaire }.
 */
export async function upsertControlePartiel(visiteId, sectionCode, cle, patch = {}) {
  const db = await openAppDatabase();
  const actuel = await db.getFirstAsync(
    `SELECT avis, commentaire FROM controles_visite
     WHERE visite_id=? AND section_code=? AND cle=?`,
    [visiteId, sectionCode, cle]
  );

  const avis = Object.prototype.hasOwnProperty.call(patch, 'avis') ? patch.avis : (actuel?.avis ?? null);
  const commentaire = Object.prototype.hasOwnProperty.call(patch, 'commentaire') ? patch.commentaire : (actuel?.commentaire ?? null);

  await db.runAsync(
    `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
     VALUES(?,?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle)
     DO UPDATE SET avis=excluded.avis, commentaire=excluded.commentaire`,
    [visiteId, sectionCode, cle, avis, commentaire]
  );
}
