/** Politique unique des lignes utiles : PDF, Word et aperçu. */
export function marqueVideRapport(value) {
  const t = String(value == null ? '' : value).trim();
  if (!t || /^\/+$/.test(t)) return true;
  const s = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').toUpperCase();
  return /^(?:S\.?\s*O\.?|SANS OBJET\.?)$/.test(s);
}

export function ligneRapportRenseignee(row) {
  if (!row) return false;
  const avis = String(row.avis || '').trim().toUpperCase();
  if (/^(?:S\.?\s*O\.?|SANS OBJET\.?)$/.test(avis)) return false;
  return !marqueVideRapport(row.avis) || !marqueVideRapport(row.comment);
}

export function filtrerLignesRapport(rows, inclureVides = false) {
  return (rows || []).filter(row => row && (inclureVides || ligneRapportRenseignee(row)));
}
