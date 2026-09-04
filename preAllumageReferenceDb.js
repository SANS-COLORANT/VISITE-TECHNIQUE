import { getDb } from './db.js';
import { createId } from './database/ids.js';

export const PREALLUMAGE_REFERENCE_CATEGORIES = Object.freeze({
  EXPLOITANT: 'exploitant',
  CHARGE_AFFAIRES: 'charge_affaires',
  REDACTEUR: 'redacteur',
});

function nettoyerCode(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export async function listerReferentielsPreAllumage(categorie, { inclureInactifs = false } = {}) {
  const db = await getDb();
  const where = inclureInactifs ? '' : 'AND actif=1';
  return db.getAllAsync(
    `SELECT * FROM pre_allumage_referentiels WHERE categorie=? ${where} ORDER BY ordre, code`,
    [categorie]
  );
}

export async function ajouterReferentielPreAllumage(categorie, code, libelle = null) {
  const db = await getDb();
  const propre = nettoyerCode(code);
  if (!propre) throw new Error('Le libellé est obligatoire.');
  const existe = await db.getFirstAsync(
    `SELECT id FROM pre_allumage_referentiels WHERE categorie=? AND upper(code)=upper(?) LIMIT 1`,
    [categorie, propre]
  );
  if (existe?.id) {
    await db.runAsync(`UPDATE pre_allumage_referentiels SET actif=1,modifie_le=datetime('now') WHERE id=?`, [existe.id]);
    return existe.id;
  }
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),0) n FROM pre_allumage_referentiels WHERE categorie=?`, [categorie]);
  const id = createId('pa-ref');
  await db.runAsync(
    `INSERT INTO pre_allumage_referentiels(id,categorie,code,libelle,ordre,actif) VALUES(?,?,?,?,?,1)`,
    [id, categorie, propre, String(libelle || propre).trim() || propre, Number(max?.n || 0) + 10]
  );
  return id;
}

export async function desactiverReferentielPreAllumage(id) {
  await (await getDb()).runAsync(
    `UPDATE pre_allumage_referentiels SET actif=0,modifie_le=datetime('now') WHERE id=?`,
    [id]
  );
}

export async function assurerValeurReferentielPreAllumage(categorie, code) {
  const propre = nettoyerCode(code);
  if (!propre) return null;
  return ajouterReferentielPreAllumage(categorie, propre, propre);
}
