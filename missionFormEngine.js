/**
 * Trames Missions — moteur pur (aucun import React Native).
 *
 * Une trame est une liste ordonnée de champs. Chaque champ a une clé stable
 * (`key`, utilisée dans les valeurs, l'Excel et les balises Word), un type,
 * et peut être obligatoire, conditionnel (« afficher si ») ou calculé.
 * Les valeurs d'une fiche sont un objet { clé: valeur } ; une fiche peut
 * toujours être enregistrée incomplète (règle 10 : rien n'est bloquant).
 */

export const FORM_TARGETS = Object.freeze([
  { key: 'mission', label: 'La Mission', hint: 'Une fiche pour toute la Mission' },
  { key: 'site', label: 'Chaque site', hint: 'Une fiche par site' },
  { key: 'location', label: 'Chaque local', hint: 'Une fiche par local' },
  { key: 'equipment', label: 'Chaque équipement', hint: 'Une fiche par équipement' },
  { key: 'free', label: 'Fiches libres', hint: 'Autant de fiches que nécessaire' },
]);

export const VERDICTS = Object.freeze([
  { key: 'ok', label: 'Conforme', tone: 'accent' },
  { key: 'watch', label: 'À surveiller', tone: 'warning' },
  { key: 'nok', label: 'Non conforme', tone: 'danger' },
  { key: 'na', label: 'Sans objet', tone: 'neutral' },
]);

export const FIELD_TYPES = Object.freeze([
  { key: 'section', label: 'Titre de section', icon: 'list', group: 'Mise en page' },
  { key: 'text', label: 'Texte court', icon: 'edit', group: 'Saisie' },
  { key: 'longtext', label: 'Texte long', icon: 'note', group: 'Saisie' },
  { key: 'number', label: 'Nombre', icon: 'gauge', group: 'Saisie' },
  { key: 'date', label: 'Date', icon: 'clock', group: 'Saisie' },
  { key: 'yesno', label: 'Oui / Non', icon: 'check', group: 'Choix' },
  { key: 'select', label: 'Choix unique', icon: 'chevron-down', group: 'Choix' },
  { key: 'multiselect', label: 'Choix multiples', icon: 'list', group: 'Choix' },
  { key: 'verdict', label: 'Avis (conforme / non conforme)', icon: 'control', group: 'Choix' },
  { key: 'photo', label: 'Photos', icon: 'camera', group: 'Terrain' },
  { key: 'calc', label: 'Calcul', icon: 'calculator', group: 'Avancé' },
]);

export const FIELD_TYPE_BY_KEY = Object.freeze(Object.fromEntries(FIELD_TYPES.map((t) => [t.key, t])));

export const CONDITION_OPS = Object.freeze([
  { key: 'eq', label: 'est égal à' },
  { key: 'neq', label: 'est différent de' },
  { key: 'filled', label: 'est renseigné' },
  { key: 'empty', label: 'est vide' },
  { key: 'gt', label: 'est supérieur à' },
  { key: 'lt', label: 'est inférieur à' },
]);

const NO_VALUE_TYPES = new Set(['section']);
const NUMERIC_TYPES = new Set(['number', 'calc']);

const asArray = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (value == null ? '' : String(value)).trim();

/** Clé courte, stable et lisible tirée du libellé (« Pression de service » → pression_de_service). */
export function slugFieldKey(label, taken = []) {
  const base = str(label).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'champ';
  const safe = /^[a-z]/.test(base) ? base : `c_${base}`;
  const used = new Set(taken);
  if (!used.has(safe)) return safe;
  let i = 2;
  while (used.has(`${safe}_${i}`)) i += 1;
  return `${safe}_${i}`;
}

function normalizeOptions(options) {
  const seen = new Set();
  const out = [];
  for (const raw of asArray(options)) {
    const label = str(typeof raw === 'object' ? raw?.label : raw);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}

function toNumber(value) {
  if (value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Champ propre et complet à partir d'une saisie partielle ou ancienne. */
export function normalizeField(raw, taken = []) {
  const type = FIELD_TYPE_BY_KEY[raw?.type] ? raw.type : 'text';
  const label = str(raw?.label) || FIELD_TYPE_BY_KEY[type].label;
  const key = /^[a-z][a-z0-9_]{0,40}$/.test(raw?.key || '') && !taken.includes(raw.key) ? raw.key : slugFieldKey(label, taken);
  const field = { key, type, label };
  if (str(raw?.help)) field.help = str(raw.help);
  if (raw?.required && !NO_VALUE_TYPES.has(type) && type !== 'calc') field.required = true;
  if (type === 'select' || type === 'multiselect') {
    field.options = normalizeOptions(raw?.options);
    if (str(raw?.listId)) field.listId = str(raw.listId);
  }
  if (type === 'number' || type === 'calc') {
    if (str(raw?.unit)) field.unit = str(raw.unit);
    const min = toNumber(raw?.min);
    const max = toNumber(raw?.max);
    if (min != null) field.min = min;
    if (max != null) field.max = max;
    const decimals = toNumber(raw?.decimals);
    if (decimals != null) field.decimals = Math.max(0, Math.min(6, Math.round(decimals)));
  }
  if (type === 'calc') field.formula = str(raw?.formula);
  if (type === 'verdict' && raw?.reserveOnNok) field.reserveOnNok = true;
  if (raw?.showIf && str(raw.showIf.field) && CONDITION_OPS.some((op) => op.key === raw.showIf.op)) {
    field.showIf = { field: str(raw.showIf.field), op: raw.showIf.op };
    if (!['filled', 'empty'].includes(raw.showIf.op)) field.showIf.value = raw.showIf.value ?? '';
  }
  return field;
}

/** Liste de champs propre : clés uniques, types connus. Accepte une chaîne JSON. */
export function normalizeFormFields(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { list = []; }
  }
  const out = [];
  for (const item of asArray(list)) {
    out.push(normalizeField(item, out.map((f) => f.key)));
  }
  return out;
}

export function createField(type, fields = [], label = null) {
  return normalizeField({ type, label: label || FIELD_TYPE_BY_KEY[type]?.label || 'Champ' }, fields.map((f) => f.key));
}

// ---------------------------------------------------------------------------
// Formules : + - * / ( ), nombres, références {clé}, min max abs round sqrt
// ---------------------------------------------------------------------------

const FUNCTIONS = Object.freeze({
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  round: (x, n = 0) => { const f = 10 ** Math.round(n); return Math.round(x * f) / f; },
});

function tokenize(formula) {
  // Virgule décimale acceptée (« 1,5 ») sauf entre les arguments d'une fonction (« max(1, 2) »).
  const tokens = [];
  const src = String(formula || '');
  const parens = []; // true = parenthèse d'appel de fonction
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const inCall = parens.length && parens[parens.length - 1];
      if (!inCall && src[j] === ',' && /[0-9]/.test(src[j + 1] || '')) {
        j += 1;
        while (j < src.length && /[0-9]/.test(src[j])) j += 1;
      }
      const v = Number(src.slice(i, j).replace(',', '.'));
      if (!Number.isFinite(v)) throw new Error(`Nombre invalide : ${src.slice(i, j)}`);
      tokens.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (c === ',' || c === ';') { tokens.push({ t: 'comma' }); i += 1; continue; }
    if (c === '{') {
      const j = src.indexOf('}', i);
      if (j === -1) throw new Error('Accolade non fermée');
      tokens.push({ t: 'ref', v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      let k = j;
      while (/\s/.test(src[k] || '')) k += 1;
      tokens.push(FUNCTIONS[word.toLowerCase()] && src[k] === '(' ? { t: 'fn', v: word.toLowerCase() } : { t: 'ref', v: word });
      i = j;
      continue;
    }
    if (c === '(') { parens.push(tokens.length > 0 && tokens[tokens.length - 1].t === 'fn'); tokens.push({ t: 'op', v: c }); i += 1; continue; }
    if (c === ')') { parens.pop(); tokens.push({ t: 'op', v: c }); i += 1; continue; }
    if ('+-*/'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
    throw new Error(`Caractère non reconnu : ${c}`);
  }
  return tokens;
}

/** Références {clé} utilisées par une formule. */
export function formulaRefs(formula) {
  try {
    return [...new Set(tokenize(formula).filter((t) => t.t === 'ref').map((t) => t.v))];
  } catch {
    return [];
  }
}

/**
 * Évalue une formule. `resolve(clé)` renvoie un nombre ou null. Renvoie null
 * si une référence manque ou si le calcul n'a pas de sens (division par 0).
 */
export function evaluateFormula(formula, resolve) {
  const tokens = tokenize(formula);
  let pos = 0;
  let missing = false;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (v) => {
    const tok = take();
    if (!tok || tok.v !== v) throw new Error(`« ${v} » attendu`);
  };
  function primary() {
    const tok = take();
    if (!tok) throw new Error('Formule incomplète');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'ref') {
      const value = resolve(tok.v);
      if (value == null || !Number.isFinite(value)) { missing = true; return 0; }
      return value;
    }
    if (tok.t === 'fn') {
      expect('(');
      const args = [expr()];
      while (peek()?.t === 'comma') { take(); args.push(expr()); }
      expect(')');
      return FUNCTIONS[tok.v](...args);
    }
    if (tok.v === '(') { const v = expr(); expect(')'); return v; }
    if (tok.v === '-') return -primary();
    if (tok.v === '+') return primary();
    throw new Error('Formule invalide');
  }
  function term() {
    let v = primary();
    while (peek()?.t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = take().v;
      const r = primary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = take().v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (pos < tokens.length) throw new Error('Formule invalide');
  return missing || !Number.isFinite(result) ? null : result;
}

// ---------------------------------------------------------------------------
// Valeurs, conditions, validation
// ---------------------------------------------------------------------------

export function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function conditionHolds(cond, value) {
  if (cond.op === 'filled') return !isEmptyValue(value);
  if (cond.op === 'empty') return isEmptyValue(value);
  const target = cond.value;
  if (cond.op === 'gt' || cond.op === 'lt') {
    const a = toNumber(value);
    const b = toNumber(target);
    if (a == null || b == null) return false;
    return cond.op === 'gt' ? a > b : a < b;
  }
  const same = Array.isArray(value)
    ? value.map(String).includes(String(target))
    : String(value ?? '').trim().toLowerCase() === String(target ?? '').trim().toLowerCase();
  return cond.op === 'eq' ? same : !same;
}

/** Valeurs complétées des champs calculés (dans l'ordre de la trame). */
export function computeFormValues(fields, values = {}) {
  const out = { ...values };
  for (const field of fields) {
    if (field.type !== 'calc') continue;
    let result = null;
    try {
      result = evaluateFormula(field.formula, (key) => toNumber(out[key]));
    } catch {
      result = null;
    }
    if (result != null && field.decimals != null) result = Number(result.toFixed(field.decimals));
    out[field.key] = result;
  }
  return out;
}

/** Champs visibles selon les conditions (un champ caché masque ceux qui dépendent de lui). */
export function visibleFields(fields, values = {}) {
  const visible = new Set();
  const out = [];
  for (const field of fields) {
    const cond = field.showIf;
    if (cond && (!visible.has(cond.field) || !conditionHolds(cond, values[cond.field]))) continue;
    visible.add(field.key);
    out.push(field);
  }
  return out;
}

export function isOutOfRange(field, value) {
  if (!NUMERIC_TYPES.has(field.type)) return false;
  const n = toNumber(value);
  if (n == null) return false;
  return (field.min != null && n < field.min) || (field.max != null && n > field.max);
}

/**
 * Bilan d'une fiche : champs obligatoires manquants, valeurs hors seuil,
 * avis non conformes, progression. Jamais bloquant : l'écran affiche, la
 * fiche s'enregistre quand même.
 */
export function summarizeEntry(fields, values = {}) {
  const computed = computeFormValues(fields, values);
  const shown = visibleFields(fields, computed);
  const answerable = shown.filter((f) => !NO_VALUE_TYPES.has(f.type) && f.type !== 'calc');
  const filled = answerable.filter((f) => !isEmptyValue(computed[f.key]));
  return {
    values: computed,
    visible: shown,
    missing: answerable.filter((f) => f.required && isEmptyValue(computed[f.key])).map((f) => f.key),
    outOfRange: shown.filter((f) => isOutOfRange(f, computed[f.key])).map((f) => f.key),
    nonConform: shown.filter((f) => f.type === 'verdict' && computed[f.key] === 'nok').map((f) => f.key),
    filled: filled.length,
    total: answerable.length,
    progress: answerable.length ? filled.length / answerable.length : 1,
  };
}

/** Problèmes de conception d'une trame (affichés dans le constructeur). */
export function validateFormDefinition(fields, { lists = [] } = {}) {
  const issues = [];
  const seen = new Map();
  const listIds = new Set(lists.map((l) => l.id));
  fields.forEach((field, index) => {
    seen.set(field.key, { field, index });
    if ((field.type === 'select' || field.type === 'multiselect') && !field.options?.length && !(field.listId && listIds.has(field.listId))) {
      issues.push({ key: field.key, message: `« ${field.label} » : ajoute des choix ou une liste de référence.` });
    }
    if (field.showIf) {
      const parent = seen.get(field.showIf.field);
      if (!parent || parent.index >= index) issues.push({ key: field.key, message: `« ${field.label} » : la condition doit porter sur un champ placé au-dessus.` });
    }
    if (field.type === 'calc') {
      if (!field.formula) issues.push({ key: field.key, message: `« ${field.label} » : écris la formule.` });
      else {
        try {
          evaluateFormula(field.formula, () => 1);
          for (const ref of formulaRefs(field.formula)) {
            const target = seen.get(ref);
            if (!target || target.index >= index) issues.push({ key: field.key, message: `« ${field.label} » : {${ref}} doit être un champ placé au-dessus.` });
            else if (!NUMERIC_TYPES.has(target.field.type)) issues.push({ key: field.key, message: `« ${field.label} » : {${ref}} n’est pas un nombre.` });
          }
        } catch (e) {
          issues.push({ key: field.key, message: `« ${field.label} » : ${e.message}.` });
        }
      }
    }
  });
  if (!fields.some((f) => !NO_VALUE_TYPES.has(f.type))) issues.push({ key: null, message: 'Ajoute au moins un champ à remplir.' });
  return issues;
}

/** Choix proposés pour un champ (choix saisis + liste de référence). */
export function fieldOptions(field, lists = []) {
  const list = field.listId ? lists.find((l) => l.id === field.listId) : null;
  const fromList = list ? normalizeOptions(typeof list.items_json === 'string' ? safeJson(list.items_json, []) : list.items) : [];
  return normalizeOptions([...(field.options || []), ...fromList]);
}

function safeJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** Valeur lisible pour l'Excel, le rapport et les balises Word. */
export function formatFieldValue(field, value) {
  if (isEmptyValue(value)) return '';
  switch (field.type) {
    case 'yesno': return value === true || value === 'yes' ? 'Oui' : value === false || value === 'no' ? 'Non' : String(value);
    case 'verdict': return VERDICTS.find((v) => v.key === value)?.label || String(value);
    case 'multiselect': return asArray(value).join(', ');
    case 'number':
    case 'calc': {
      const n = toNumber(value);
      if (n == null) return String(value);
      const text = n.toLocaleString('fr-FR', { maximumFractionDigits: field.decimals ?? 3 });
      return field.unit ? `${text} ${field.unit}` : text;
    }
    case 'photo': return `${asArray(value).length} photo(s)`;
    case 'date': return String(value).slice(0, 10).split('-').reverse().join('/');
    default: return String(value);
  }
}

/** Fiche à plat : [{ key, label, value }] des champs visibles qui ont une valeur. */
export function flattenEntry(fields, values = {}) {
  const { values: computed, visible } = summarizeEntry(fields, values);
  return visible
    .filter((f) => !NO_VALUE_TYPES.has(f.type))
    .map((f) => ({ key: f.key, label: f.label, value: formatFieldValue(f, computed[f.key]) }));
}

/** Les champs d'une trame dont les valeurs ont changé de sens (pour décider d'une nouvelle version). */
export function fieldsChanged(before, after) {
  return JSON.stringify(normalizeFormFields(before)) !== JSON.stringify(normalizeFormFields(after));
}

export function moveField(fields, key, delta) {
  const from = fields.findIndex((f) => f.key === key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= fields.length) return fields;
  const next = fields.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Lignes d'un tableau (Excel client) : une ligne par fiche, une colonne par champ. */
export function entriesToRows(fields, entries = []) {
  const columns = fields.filter((f) => !NO_VALUE_TYPES.has(f.type));
  return entries.map((entry) => {
    const values = typeof entry.values_json === 'string' ? (safeJson(entry.values_json, {}) || {}) : (entry.values || {});
    const computed = computeFormValues(fields, values);
    const shown = new Set(visibleFields(fields, computed).map((f) => f.key));
    const row = { Cible: entry.target_label || '', Statut: entry.status === 'done' ? 'Terminée' : 'Brouillon', Mise_a_jour: String(entry.updated_at || '').slice(0, 16).replace('T', ' ') };
    for (const field of columns) {
      let name = field.label;
      while (name in row) name = `${name} `;
      row[name] = shown.has(field.key) ? formatFieldValue(field, computed[field.key]) : '';
    }
    return row;
  });
}

/** Nom d'onglet Excel valide (31 caractères, sans : \ / ? * [ ]). */
export function excelSheetName(prefix, label) {
  return `${prefix}_${String(label || 'Trame').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, '_')}`.slice(0, 31);
}
