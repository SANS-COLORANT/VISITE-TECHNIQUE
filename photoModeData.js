const stripAccents = (value) => String(value == null ? '' : value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const clean = (value) => String(value == null ? '' : value).trim();

function lineScore(line, contextTokens) {
  const normal = stripAccents(line).toLowerCase();
  let score = 0;
  for (const token of contextTokens) {
    if (token && normal.includes(token)) score += 2;
  }
  return score;
}

function parseNumber(raw) {
  const source = clean(raw).replace(/\u00a0/g, ' ');
  if (!source) return null;
  let normalized = source.replace(/\s+/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    const comma = normalized.lastIndexOf(',');
    const dot = normalized.lastIndexOf('.');
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    normalized = normalized.replace(thousands, '').replace(decimal, '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function preserveReading(raw) {
  const source = clean(raw).replace(/\u00a0/g, ' ').replace(/\s+/g, '');
  if (!source) return '';
  if (source.includes(',') && source.includes('.')) {
    const comma = source.lastIndexOf(',');
    const dot = source.lastIndexOf('.');
    if (comma > dot) return source.replace(/\./g, '');
    return source.replace(/,/g, '');
  }
  return source;
}

export function extraireValeurOcr(text, context = {}) {
  if (/^(meter|counter|meters)$/.test(clean(context.kind).toLowerCase())) {
    return extraireIndexCompteur(text, context);
  }
  const source = clean(typeof text === 'string' ? text : text?.text);
  if (!source) return null;
  const kind = clean(context.kind).toLowerCase();
  const unit = stripAccents(clean(context.unit)).toLowerCase();
  const labelTokens = stripAccents(clean(context.label)).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2).slice(0, 4);
  const contextTokens = [...labelTokens, unit].filter(Boolean);
  const lines = source.split(/\r?\n/).map(clean).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    const matches = line.match(/[-+]?\d[\d\s.,]{0,18}\d|[-+]?\d/g) || [];
    for (const raw of matches) {
      const numeric = parseNumber(raw);
      if (numeric == null) continue;
      const kept = preserveReading(raw);
      const digits = kept.replace(/\D/g, '').length;
      let score = lineScore(line, contextTokens);
      if (digits >= 4) score += 2;
      if (digits >= 6) score += 1;

      const normalLine = stripAccents(line).toLowerCase();
      if (kind === 'meter' || kind === 'counter' || kind === 'meters') {
        if (digits >= 4) score += 4;
        if (/\b(?:m3|m³|kwh|mwh|wh)\b/i.test(normalLine)) score += 4;
        if (numeric >= 1900 && numeric <= 2100 && digits === 4) score -= 5;
        if (numeric < 0) score -= 5;
      } else if (kind === 'temperature' || kind === 'temperatures') {
        if (numeric >= -80 && numeric <= 180) score += 4;
        else score -= 6;
        if (/°\s*c|\bcelsius\b|\btemp/i.test(normalLine)) score += 4;
      } else if (kind === 'pressure') {
        if (numeric >= 0 && numeric <= 100) score += 3;
        if (/\bbar\b|\bpa\b|\bkpa\b/i.test(normalLine)) score += 4;
      }

      candidates.push({ value: kept, numeric, raw: clean(raw), line, score, digits });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.digits - a.digits);
  const best = candidates[0];
  if (!best || best.score < 3) return null;
  return best;
}

// An index needs evidence from the display. A long number on a nameplate is
// never a fallback. Keep the image geometry and every pass from the native OCR.
export function extraireIndexCompteur(input, context = {}) {
  const result = typeof input === 'string' ? { text: input } : (input || {});
  const passes = result.passes?.length ? result.passes : [result];
  const expected = clean(context.unit).toLowerCase().replace('³', '3');
  const technical = /\b(?:s\/?n|serial|serie|type|cfg|cfa|prog|classe|multical|cf\s*800|h71|en\s*\d|pt\s*\d|ip\s*\d|q[pst]|imp|poids|position|coefficient|tension)\b|\d\s*(?:v|hz|°c|m[³3]\s*\/\s*h)\b|\d{1,2}\/\d{1,2}\/\d{2,4}/i;
  // Keep full-photo geometry even when an enhancement loses the main digits.
  // A small unit label misread as "1Wh" must not become a separate index.
  const displayNumbers = passes.flatMap(pass => pass.lines || []).filter(line =>
    line.box && /^\d{2,}(?:[.,]\d+)?$/.test(clean(line.text)));
  const candidates = [];
  for (let passIndex = 0; passIndex < passes.length; passIndex++) {
    const pass = passes[passIndex];
    const lines = pass.lines?.length ? pass.lines : clean(pass.text).split(/\r?\n/).map(text => ({ text }));
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const text = clean(line.text);
      // A fallback window can cut the leading digit while still producing a
      // plausible number. Such lines cannot vote against the complete display.
      if (line.box && pass.crop) {
        const a = line.box, c = pass.crop, margin = (a.bottom - a.top) * 0.5;
        if (a.left - c.left < margin || c.right - a.right < margin
          || a.top - c.top < margin || c.bottom - a.bottom < margin) continue;
      }
      if (technical.test(stripAccents(text))) continue;
      const ownUnit = text.match(/(?<![A-Za-z])([km]?wh)(?![A-Za-z])|(?<![A-Za-z])m\s*[³3](?!\s*\/)/i);
      let detectedUnit = ownUnit?.[0].toLowerCase().replace(/\s/g, '').replace('³', '3');
      // A unit on its own line may be associated only with an adjacent number.
      if (!detectedUnit && /^[\d\s.,]+$/.test(text)) {
        const next = lines[index + 1];
        const nextText = clean(next?.text);
        if (/^(m\s*[³3]|[km]?wh)$/i.test(nextText)) {
          const a = line.box, b = next?.box;
          if (!a || !b || (b.top >= a.top && b.top - a.bottom < 2 * (a.bottom - a.top)
            && b.left < a.right + (a.right - a.left) && b.right > a.left)) {
            detectedUnit = nextText.toLowerCase().replace(/\s/g, '').replace('³', '3');
          }
        }
      }
      if (!detectedUnit) continue;
      const numberText = ownUnit ? text.slice(0, ownUnit.index).trim() : text;
      if (ownUnit && line.box && displayNumbers.some(other => {
        const a = other.box, b = line.box;
        const height = a.bottom - a.top;
        return height > 1.6 * (b.bottom - b.top) && b.top >= a.bottom
          && b.top - a.bottom < 2 * height && b.left < a.right && b.right > a.left;
      })) continue;
      // Reject damaged digits and ambiguous whitespace, never reconstruct them.
      if (!/^\d+(?:[.,]\d+)?$/.test(numberText.replace(/(?<=\d)[ \u00a0](?=\d{3}(?:[.,]|$))/g, ''))) continue;
      const value = preserveReading(numberText);
      if (value.replace(/\D/g, '').length > 10) continue;
      const numeric = parseNumber(value);
      if (numeric == null) continue;
      candidates.push({ value, numeric, unit: detectedUnit === 'm3' ? 'm³' : detectedUnit === 'mwh' ? 'MWh' : detectedUnit === 'kwh' ? 'kWh' : 'Wh',
        unitMismatch: Boolean(expected && expected !== detectedUnit), line: text, box: line.box || null,
        passIndex, score: 10 + (/[.,]/.test(value) ? 2 : 0) });
    }
  }
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.numeric}:${candidate.unit}`;
    const group = groups.get(key) || { ...candidate, votes: new Set() };
    group.votes.add(candidate.passIndex); groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.votes.size - a.votes.size || b.score - a.score);
  if (!ranked.length) return null;
  // A clear full-photo reading remains useful if enhancements find nothing.
  // A lone enhanced/cropped result can invent or omit digits: keep its guard.
  if (result.passes?.length > 1 && ranked[0].votes.size < 2 && !ranked[0].votes.has(0)) return null;
  // Disagreement cannot be resolved by picking the longest number.
  if (ranked.length > 1 && ranked[0].votes.size < ranked[1].votes.size + 2) return null;
  const best = ranked[0];
  return { ...best, observations: best.votes.size, requiresReview: best.votes.size < 2, votes: undefined };
}

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
