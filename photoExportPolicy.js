/** Pure, conservative policy shared by reports and Intranet photo uploads. */
export function estPhotoLibre(photo) {
  return !String(photo?.entite_key || '').trim();
}
export function photoIncluseDansExports(photo) {
  if (!photo) return false;
  // Database migration 048 populates this column. Fallback is deliberate:
  // even an old free photo without migration metadata is private.
  if (photo.inclure_export != null) return Number(photo.inclure_export) === 1;
  return !estPhotoLibre(photo);
}
export function legendePhotoEditable(photo) {
  return String(photo?.label || '').split('||')[0].trim() || (estPhotoLibre(photo) ? 'Libre' : 'Photo');
}
export function photoLabelAvecNomFichier(photo, libelle) {
  const title = String(libelle || '').replace(/[\r\n]+/g, ' ').trim();
  if (!title || title.length > 160 || title.includes('||')) throw new Error('Libellé photo invalide (1 à 160 caractères).');
  const parts = String(photo?.label || '').split('||');
  return parts.length > 1 && parts[1] ? `${title}||${parts.slice(1).join('||')}` : title;
}
