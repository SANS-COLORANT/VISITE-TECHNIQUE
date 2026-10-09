/** Éléments de la relecture avant envoi qui ne se déduisent pas de l'état des onglets. */
import { getDb, listerCompteurs } from './db.js';

export async function chargerElementsRelecture(visiteId) {
  const db = await getDb();
  const [compteurs, remarques, photos] = await Promise.all([
    listerCompteurs(visiteId).catch(() => []),
    db.getAllAsync(`SELECT id, poste, prestation FROM remarques WHERE visite_id=? ORDER BY rowid`, [visiteId]),
    db.getAllAsync(`SELECT DISTINCT entite_key FROM photos WHERE visite_id=? AND entite_key LIKE 'remarque||%'`, [visiteId]),
  ]);
  const avecPhoto = new Set((photos || []).map((p) => String(p.entite_key).split('||')[1]));
  return {
    compteurs: (compteurs || []).map((c) => ({ label: c.label, valeur: c.valeur, precedent: c.valeur_precedente, unite: c.unite })),
    reservesSansPhoto: (remarques || []).filter((r) => !avecPhoto.has(String(r.id))).map((r) => ({ id: r.id, titre: String(r.poste || r.prestation || 'Réserve').trim() })),
  };
}
