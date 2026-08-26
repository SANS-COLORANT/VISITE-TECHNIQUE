const SPECIAL_VALUES = new Set(['sans objet', 's.o', 'so', 'non releve', 'n.r', 'nr', 'n.v', 'nv', '/']);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatMeterValue(compteur, original = '') {
  const raw = String(compteur?.valeur ?? '').trim();
  if (!raw) return '';
  if (SPECIAL_VALUES.has(normalizeText(raw))) return raw;

  // Valeur héritée d'un ancien import déjà formaté : ne jamais doubler le libellé
  // ou l'unité. Ex: "Compteur énergie : 9196.69 MWh" reste exactement cela.
  if (raw.includes(':') || /\s(m3|m³|MWh|kWh|bar|L|%)\s*$/i.test(raw)) return raw;
  if (/[a-zA-ZÀ-ÿ]/.test(raw) && !/^[-+]?\d+(?:[.,]\d+)?$/.test(raw)) return raw;

  const originalText = String(original || '').trim();
  const originalPrefix = originalText.includes(':') ? originalText.slice(0, originalText.indexOf(':')).trim() : '';
  const prefix = originalPrefix || String(compteur?.label || 'Compteur').trim();
  const unit = String(compteur?.unite || '').trim();
  return `${prefix} : ${raw}${unit ? ` ${unit}` : ''}`;
}

module.exports = { formatMeterValue, normalizeText, SPECIAL_VALUES };
