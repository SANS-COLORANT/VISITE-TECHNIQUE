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
  const source = clean(text);
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
  const technical = lines.filter((line) => /\b(?:kw|mw|w|v|a|hz|bar|pa|kpa|m3\/h|m³\/h|l\/h|rpm|tr\/min)\b/i.test(line));

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
    caracteristiques: technical.slice(0, 5).join(' · '),
  };
}
