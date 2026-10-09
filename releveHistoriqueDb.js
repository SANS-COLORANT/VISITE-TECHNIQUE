/** Relevés précédents d'un compteur permanent (hors visite courante). */
import { getDb } from './db.js';

export async function listerHistoriqueReleves(compteurSiteId, visiteId, limite = 8) {
  if (!compteurSiteId) return [];
  const db = await getDb();
  const rows = await db.getAllAsync(`
    SELECT v.date_visite AS date, r.valeur_nombre, r.valeur_texte
    FROM releves_compteur r JOIN visites v ON v.id=r.visite_id
    WHERE r.compteur_site_id=? AND r.visite_id<>?
    ORDER BY v.date_visite DESC, v.rowid DESC LIMIT ?`, [String(compteurSiteId), String(visiteId || ''), limite]);
  return rows.map((r) => {
    const brut = r.valeur_nombre != null ? Number(r.valeur_nombre) : Number(String(r.valeur_texte ?? '').replace(/[\s  ]/g, '').replace(',', '.'));
    return { date: r.date, valeur: brut };
  }).filter((r) => Number.isFinite(r.valeur)).reverse();
}
