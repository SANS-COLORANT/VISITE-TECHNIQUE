/**
 * Four field categories chosen for METRA. Raw legacy poste values (especially
 * "Entretien / P3") are NEVER silently overwritten or reclassified as P2/P3;
 * until the technician explicitly assigns a category, such records remain in
 * general remarks with their legacy label visible in the editor.
 *
 * Urgency is a separate severity (criticite 0..5), not a fifth poste.
 */
export const REMARK_CATEGORIES = Object.freeze([
  'Remarques générales',
  'Entretien P2',
  'Travaux de conformité',
  'Travaux d’amélioration',
]);
const normal = v => String(v ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();

export function categoryForRemark(poste) {
  const key=normal(poste);
  if (['entretien p2','travaux p2','travaux d entretien p2','maintenance p2'].includes(key))
    return 'Entretien P2';
  if (['travaux de conformite','conformite','mise en conformite','conformite local','conformite chauffage'].includes(key))
    return 'Travaux de conformité';
  if (['travaux d amelioration','travaux amelioration','amelioration'].includes(key))
    return 'Travaux d’amélioration';
  // Unrecognized legacy P3 must NOT automatically be billed as P2 or a new
  // investment. Keep it visible as general until a user chooses its new poste.
  return 'Remarques générales';
}
export function categoryRank(poste) {
  return REMARK_CATEGORIES.indexOf(categoryForRemark(poste));
}
export function storedCategory(poste) {
  const category=categoryForRemark(poste);
  return category==='Remarques générales'?'Observation':category;
}
