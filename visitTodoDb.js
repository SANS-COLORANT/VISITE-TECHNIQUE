/**
 * « Reste à faire » des visites en cours, affiché sur l'accueil :
 * N.S sans photo, index de compteur vides, signature client absente.
 */
import { getDb } from './db.js';

export async function resumerRestesAFaire(visites = []) {
  const ids = (visites || []).map((v) => v?.id).filter(Boolean).slice(0, 30);
  if (!ids.length) return {};
  const db = await getDb();
  const marks = ids.map(() => '?').join(',');
  const [ns, index, sign] = await Promise.all([
    db.getAllAsync(
      `SELECT c.visite_id id, COUNT(*) n FROM controles_visite c
        WHERE c.visite_id IN (${marks}) AND c.avis='N.S'
          AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.visite_id=c.visite_id AND p.entite_key=c.section_code || '||' || c.cle)
        GROUP BY c.visite_id`, ids),
    db.getAllAsync(
      `SELECT visite_id id, COUNT(*) n FROM compteurs
        WHERE visite_id IN (${marks}) AND TRIM(COALESCE(valeur,''))=''
        GROUP BY visite_id`, ids),
    db.getAllAsync(`SELECT key FROM _meta WHERE key IN (${marks})`, ids.map((id) => `signature_visite_${id}`)),
  ]);
  const signees = new Set((sign || []).map((r) => String(r.key).replace('signature_visite_', '')));
  const result = {};
  for (const v of visites) {
    if (!v?.id) continue;
    const parts = [];
    const n = Number((ns || []).find((r) => r.id === v.id)?.n || 0);
    const i = Number((index || []).find((r) => r.id === v.id)?.n || 0);
    if (n) parts.push(`${n} N.S sans photo`);
    if (i) parts.push(`${i} index à relever`);
    if (!signees.has(v.id) && Number(v.progression_pct || 0) >= 80) parts.push('à faire signer');
    if (parts.length) result[v.id] = parts.join(' · ');
  }
  return result;
}
