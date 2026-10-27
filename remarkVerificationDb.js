/**
 * Pointage d'une réserve pendant LA visite, sans modifier son état de levée.
 * L'attribut est local, sauvegardé avec SQLite et absent du payload Intranet.
 * Pas de migration destructive : utilise attributs_libres (schema existant).
 */
import { getDb } from './db.js';
import { createId } from './database/ids.js';

const KEY = 'visite_verifiee';

export async function listerVerificationsRemarques(visiteId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT a.entite_id AS remarque_id,a.valeur AS verifie_le
       FROM attributs_libres a JOIN remarques r ON r.id=a.entite_id
      WHERE r.visite_id=? AND a.entite_type='remarque' AND a.cle=? AND a.valeur IS NOT NULL`,
    [visiteId, KEY]);
  return Object.fromEntries(rows.map((row) => [String(row.remarque_id), row.verifie_le]));
}

export async function marquerRemarqueVerifiee(visiteId, remarqueId, verifiee) {
  const db = await getDb();
  const linked = await db.getFirstAsync(
    'SELECT id FROM remarques WHERE id=? AND visite_id=?', [remarqueId, visiteId]);
  if (!linked?.id) throw new Error('Réserve absente de cette visite : pointage refusé.');
  if (!verifiee) {
    await db.runAsync(
      "DELETE FROM attributs_libres WHERE entite_type='remarque' AND entite_id=? AND cle=?",
      [remarqueId, KEY]);
    return null;
  }
  const date = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur)
      VALUES(?,'remarque',?,?,?,'texte')
      ON CONFLICT(entite_type,entite_id,cle)
      DO UPDATE SET valeur=excluded.valeur,modifie_le=datetime('now')`,
    [createId(), remarqueId, KEY, date]);
  return date;
}
