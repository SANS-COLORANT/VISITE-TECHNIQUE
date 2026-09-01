import { getDb } from './db.js';
import { createId } from './database/ids.js';

const PREFIX = 'pre_allumage.alias.';

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function sectionAliasDescriptor(panelId, title) {
  const brut = String(title || '');
  const entity = /^(SST\s+\d+|Centre commercial|Église|Commerces|Bureaux|Piscine)(\s+—.*)?$/i.exec(brut);
  if (entity) return { key: `entity.${slug(entity[1])}`, base: entity[1], suffix: entity[2] || '' };
  return { key: `section.${slug(panelId)}.${slug(brut)}`, base: brut, suffix: '' };
}

export function fieldAliasKey(sectionCode, cle) {
  return `field.${slug(sectionCode)}.${slug(cle)}`;
}

export function libelleSection(panelId, title, aliases = {}) {
  const d = sectionAliasDescriptor(panelId, title);
  return `${aliases[d.key] || d.base}${d.suffix}`;
}

export function libelleChamp(sectionCode, cle, aliases = {}) {
  return aliases[fieldAliasKey(sectionCode, cle)] || cle;
}

export async function listerAliasesPreAllumage(visiteId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT a.cle,a.valeur FROM attributs_libres a
     JOIN visites v ON v.site_id=a.entite_id
     WHERE v.id=? AND a.entite_type='site' AND a.cle LIKE ?`,
    [visiteId, `${PREFIX}%`]
  );
  return Object.fromEntries(rows.map((r) => [String(r.cle).slice(PREFIX.length), r.valeur || '']));
}

export async function enregistrerAliasPreAllumage(visiteId, key, valeur, valeurParDefaut = '') {
  const db = await getDb();
  const contexte = await db.getFirstAsync(`SELECT site_id FROM visites WHERE id=?`, [visiteId]);
  if (!contexte?.site_id) throw new Error('Site introuvable pour cette visite.');
  const propre = String(valeur || '').trim();
  const cle = `${PREFIX}${key}`;
  if (!propre || propre === String(valeurParDefaut || '').trim()) {
    await db.runAsync(`DELETE FROM attributs_libres WHERE entite_type='site' AND entite_id=? AND cle=?`, [contexte.site_id, cle]);
    return '';
  }
  await db.runAsync(
    `INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur)
     VALUES(?,?,?,?,?,'texte')
     ON CONFLICT(entite_type,entite_id,cle) DO UPDATE SET valeur=excluded.valeur,modifie_le=datetime('now')`,
    [createId('alias'), 'site', contexte.site_id, cle, propre]
  );
  return propre;
}
