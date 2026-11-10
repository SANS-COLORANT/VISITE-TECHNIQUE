/**
 * La date officielle d'une visite pilote l'historique, les listes et les
 * rapports. Une saisie dans un formulaire doit modifier cette date en SQLite.
 */
import { getDb } from './db.js';
import { canonicalKnownCode } from './intranetStorageAliases.js';
import { invalidateLocalVisits, invalidateSiteLocals } from './navigationPrewarm.js';
import { markVisitHot } from './visitRuntimeCache.js';

export function estChampDateVisite(cle) {
  return /^(?:date de la visite|date de visite)$/i.test(String(cle || '').trim());
}

export function dateVisiteIso(value) {
  const text = String(value || '').trim();
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!fr && !iso) return null;
  const y = Number(fr ? fr[3] : iso[1]);
  const m = Number(fr ? fr[2] : iso[2]);
  const d = Number(fr ? fr[1] : iso[3]);
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

export async function enregistrerDateVisite(visiteId, sectionCode, cle, valeur) {
  if (!estChampDateVisite(cle)) throw new Error('Ce champ ne correspond pas à la date de visite.');
  const iso = dateVisiteIso(valeur);
  if (!iso) throw new Error('Date de visite invalide (JJ/MM/AAAA ou AAAA-MM-JJ).');
  const fr = iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const db = await getDb();
  const visite = await db.getFirstAsync('SELECT id,site_id,installation_id FROM visites WHERE id=?', [visiteId]);
  if (!visite) throw new Error('Visite introuvable : date inchangée.');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur',
      [visiteId, canonicalKnownCode(sectionCode), cle, fr]
    );
    await db.runAsync(
      "UPDATE champs_visite SET valeur=? WHERE visite_id=? AND cle IN ('Date de la visite','Date de visite')",
      [fr, visiteId]
    );
    await db.runAsync("UPDATE visites SET date_visite=?,modifie_le=datetime('now') WHERE id=?",
      [iso, visiteId]);
  });
  invalidateLocalVisits(visite.site_id, visite.installation_id, false);
  invalidateLocalVisits(visite.site_id, null, false);
  invalidateLocalVisits(visite.site_id, null, true);
  invalidateSiteLocals(visite.site_id);
  markVisitHot(visiteId, { preview: { date_visite: iso } });
  return iso;
}
