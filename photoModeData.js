const stripAccents = (value) => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const clean = (value) => String(value == null ? '' : value).trim();

// La lecture automatique des index (compteurs, températures) a été retirée : voir docs/DECISION_OCR_COMPTEURS.md.
// Seule la plaque signalétique (texte imprimé) est analysée ici.
function valueAfterLabel(lines, pattern) {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match && clean(match[1])) return clean(match[1]).replace(/^[\s:#-]+/, '');
  }
  return '';
}

export function extraireChampsPlaque(text) {
  const lines = clean(text).split(/\r?\n/).map(clean).filter(Boolean);
  if (!lines.length) return {};

  const serial = valueAfterLabel(lines, /(?:s\/?n|serial|n[°o]?\s*de\s*s[eé]rie|s[eé]rie)\s*[:#-]?\s*(.+)$/i);
  const model = valueAfterLabel(lines, /(?:mod[eè]le|model|type|r[eé]f(?:[eé]rence)?|ref)\s*[:#-]?\s*(.+)$/i);
  const yearMatch = lines.join(' ').match(/\b(19\d{2}|20\d{2})\b/);
  const technical = lines.filter((line) => /\b(?:kw|mw|w|v|a|hz|bar|pa|kpa|m3\/h|m³\/h|l\/h|rpm|tr\/min|combustible|gaz|fioul)\b|°\s*c/i.test(line));

  let brand = '';
  for (const line of lines.slice(0, 4)) {
    const normal = stripAccents(line).toLowerCase();
    if (/(model|modele|type|serial|serie|ref|kw|volt|hz|bar)/.test(normal)) continue;
    if (/^[A-Za-zÀ-ÿ0-9&+.' -]{2,32}$/.test(line) && /[A-Za-zÀ-ÿ]/.test(line)) {
      brand = line;
      break;
    }
  }

  return {
    marque: brand,
    modele: model,
    numero_materiel: serial,
    annee: yearMatch ? yearMatch[1] : '',
    caracteristiques: technical.slice(0, 8).join(' · '),
  };
}
