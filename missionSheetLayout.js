/**
 * Fiche Mission modulable — calcul de la disposition affichée et opérations
 * d'édition. Fonctions pures, testées sous Node (tests/missionSheetLayout.test.mjs).
 *
 * Une disposition enregistrée a la forme :
 *   { v: 1, blocks: [{ key, size }], hidden: [key], pinnedTools: [toolKey] }
 * `blocks` = blocs visibles dans l'ordre ; `hidden` = blocs masqués par
 * l'utilisateur. Les deux blocs verrouillés (en-tête, action principale) ne
 * sont jamais enregistrés : l'écran les place toujours en tête.
 *
 * Héritage : mission → type → famille → réglage d'usine. Un bloc apparu dans
 * une version plus récente est ajouté à sa place par défaut ; un bloc que le
 * type n'autorise plus est retiré ; une clé inconnue est ignorée.
 */
import {
  SHEET_BLOCKS,
  SHEET_BLOCK_BY_KEY,
  SHEET_DEFAULT_SIZES,
  SHEET_FAMILY_DEFAULTS,
  SHEET_FAMILY_TOOL_FILL,
  SHEET_LAYOUT_VERSION,
  SHEET_MAX_PINNED,
  SHEET_MIN_PINNED,
  SHEET_PRESETS,
  SHEET_SCOPES,
  SHEET_SIZES,
  SHEET_TOOLS,
  SHEET_TOOL_BY_KEY,
  SHEET_TOOL_BY_ROUTE,
  SHEET_TYPE_DEFAULTS,
} from './missionSheetRegistry.js';

const unique = (items) => [...new Set(items)];

/** Contexte figé d'une Mission : famille, type, capacités et parcours recommandé. */
export function buildSheetContext({ family = null, type = null, capabilities = null, playbook = null } = {}) {
  return {
    family: family || null,
    type: type || null,
    capabilities: capabilities || {},
    playbook: playbook || null,
  };
}

export function isSheetBlockAvailable(key, ctx) {
  const block = SHEET_BLOCK_BY_KEY[key];
  if (!block || block.locked) return false;
  return typeof block.requires === 'function' ? Boolean(block.requires(ctx)) : true;
}

/** Blocs déplaçables proposés pour cette Mission, dans l'ordre du registre. */
export function availableSheetBlocks(ctx) {
  return SHEET_BLOCKS.filter((block) => isSheetBlockAvailable(block.key, ctx)).map((block) => block.key);
}

export function isSheetBlockHideable(key) {
  return SHEET_BLOCK_BY_KEY[key]?.hideable !== false;
}

export function isSheetToolAvailable(key, capabilities = {}) {
  return Boolean(SHEET_TOOL_BY_KEY[key]) && capabilities?.[key] !== false;
}

/** Outils proposés, dans l'ordre du registre (le même filtre que l'ancienne grille). */
export function availableSheetTools(capabilities = {}) {
  return SHEET_TOOLS.filter((tool) => isSheetToolAvailable(tool.key, capabilities)).map((tool) => tool.key);
}

function defaultOrder(ctx) {
  const base = SHEET_TYPE_DEFAULTS[ctx?.type] || SHEET_FAMILY_DEFAULTS[ctx?.family] || SHEET_FAMILY_DEFAULTS.default;
  return unique(base).filter((key) => isSheetBlockAvailable(key, ctx));
}

/** Clé d'outil correspondant à une action rapide du parcours recommandé. */
export function toolKeyForPlaybookAction(action) {
  if (!action) return null;
  if (action.kind === 'navigate') return SHEET_TOOL_BY_ROUTE[action.route] || null;
  if (action.kind === 'measure') return 'measurements';
  if (action.kind === 'document') return 'documents';
  if (action.kind === 'photo') return 'photoAnnotations';
  return null;
}

/** Épingles par défaut : les outils du parcours recommandé, complétés par ceux de la famille. */
export function defaultPinnedTools(ctx) {
  const capabilities = ctx?.capabilities || {};
  const picks = [];
  const add = (key) => {
    if (key && !picks.includes(key) && isSheetToolAvailable(key, capabilities) && picks.length < SHEET_MAX_PINNED) picks.push(key);
  };
  for (const action of ctx?.playbook?.quickActions || []) add(toolKeyForPlaybookAction(action));
  const fill = SHEET_FAMILY_TOOL_FILL[ctx?.family] || SHEET_FAMILY_TOOL_FILL.default;
  for (const key of fill) {
    if (picks.length >= Math.max(SHEET_MIN_PINNED, 6)) break;
    add(key);
  }
  for (const key of SHEET_FAMILY_TOOL_FILL.default) {
    if (picks.length >= SHEET_MIN_PINNED) break;
    add(key);
  }
  return picks.slice(0, 6);
}

/** Disposition « réglage d'usine » calculée pour cette Mission. */
export function defaultSheetLayout(ctx) {
  const order = defaultOrder(ctx);
  const available = availableSheetBlocks(ctx);
  return {
    v: SHEET_LAYOUT_VERSION,
    blocks: order.map((key) => ({ key, size: SHEET_DEFAULT_SIZES[key] || 'compact' })),
    hidden: available.filter((key) => !order.includes(key)),
    pinnedTools: defaultPinnedTools(ctx),
  };
}

/** Lecture tolérante d'une disposition stockée (chaîne JSON ou objet). */
export function parseStoredSheetLayout(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validSize(key, size) {
  return SHEET_SIZES.includes(size) ? size : (SHEET_DEFAULT_SIZES[key] || 'compact');
}

/**
 * Insère `key` dans `blocks` à sa place par défaut : juste après le dernier
 * bloc qui le précède dans l'ordre d'usine, sinon en tête.
 */
function insertAtDefaultPosition(blocks, key, ctx, size = null) {
  const order = unique([...defaultOrder(ctx), ...availableSheetBlocks(ctx)]);
  const rank = order.indexOf(key);
  let insertAt = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const otherRank = order.indexOf(blocks[i].key);
    if (otherRank !== -1 && otherRank < rank) insertAt = i + 1;
  }
  const next = blocks.slice();
  next.splice(insertAt, 0, { key, size: validSize(key, size) });
  return next;
}

/** Rend une disposition stockée sûre pour cette Mission (voir l'en-tête du fichier). */
export function normalizeSheetLayout(raw, ctx) {
  const stored = parseStoredSheetLayout(raw);
  if (!stored) return defaultSheetLayout(ctx);
  const available = availableSheetBlocks(ctx);
  const seen = new Set();
  let blocks = [];
  for (const entry of Array.isArray(stored.blocks) ? stored.blocks : []) {
    const key = typeof entry === 'string' ? entry : entry?.key;
    if (!available.includes(key) || seen.has(key)) continue;
    seen.add(key);
    blocks.push({ key, size: validSize(key, entry?.size) });
  }
  const hidden = [];
  for (const key of Array.isArray(stored.hidden) ? stored.hidden : []) {
    if (!available.includes(key) || seen.has(key) || !isSheetBlockHideable(key)) continue;
    seen.add(key);
    hidden.push(key);
  }
  const defaults = defaultOrder(ctx);
  for (const key of available) {
    if (seen.has(key)) continue;
    // Bloc nouveau pour cette disposition : à sa place s'il fait partie des
    // blocs visibles par défaut (ou s'il ne peut pas être masqué), sinon masqué.
    if (defaults.includes(key) || !isSheetBlockHideable(key)) blocks = insertAtDefaultPosition(blocks, key, ctx);
    else hidden.push(key);
    seen.add(key);
  }
  const capabilities = ctx?.capabilities || {};
  const pinnedTools = Array.isArray(stored.pinnedTools)
    ? unique(stored.pinnedTools.filter((key) => isSheetToolAvailable(key, capabilities))).slice(0, SHEET_MAX_PINNED)
    : defaultPinnedTools(ctx);
  return { v: SHEET_LAYOUT_VERSION, blocks, hidden, pinnedTools };
}

/**
 * Disposition à afficher. `stored` = { mission, type, family } (JSON ou objets),
 * lu par `lireDispositionsFiche`. Renvoie aussi la portée d'où elle vient.
 */
export function resolveSheetLayout({ stored = {}, ctx } = {}) {
  for (const scope of SHEET_SCOPES) {
    const raw = parseStoredSheetLayout(stored?.[scope]);
    if (raw) return { layout: normalizeSheetLayout(raw, ctx), source: scope };
  }
  return { layout: defaultSheetLayout(ctx), source: 'default' };
}

export function serializeSheetLayout(layout) {
  return JSON.stringify({
    v: SHEET_LAYOUT_VERSION,
    blocks: (layout?.blocks || []).map((block) => ({ key: block.key, size: block.size })),
    hidden: layout?.hidden || [],
    pinnedTools: layout?.pinnedTools || [],
  });
}

export function sheetLayoutsEqual(a, b) {
  return serializeSheetLayout(a) === serializeSheetLayout(b);
}

// ---------------------------------------------------------------------------
// Opérations d'édition (toutes renvoient une nouvelle disposition)
// ---------------------------------------------------------------------------

export function moveSheetBlock(layout, key, delta) {
  const blocks = layout.blocks.slice();
  const from = blocks.findIndex((block) => block.key === key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= blocks.length) return layout;
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...layout, blocks };
}

/** `target` : 'top', 'bottom' ou { after: cléDUnBloc }. */
export function moveSheetBlockTo(layout, key, target) {
  const current = layout.blocks.find((block) => block.key === key);
  if (!current) return layout;
  const rest = layout.blocks.filter((block) => block.key !== key);
  let index = rest.length;
  if (target === 'top') index = 0;
  else if (target && typeof target === 'object' && target.after) {
    const anchor = rest.findIndex((block) => block.key === target.after);
    if (anchor === -1) return layout;
    index = anchor + 1;
  }
  rest.splice(index, 0, current);
  return { ...layout, blocks: rest };
}

export function hideSheetBlock(layout, key) {
  if (!isSheetBlockHideable(key) || !layout.blocks.some((block) => block.key === key)) return layout;
  return {
    ...layout,
    blocks: layout.blocks.filter((block) => block.key !== key),
    hidden: unique([...layout.hidden, key]),
  };
}

export function showSheetBlock(layout, key, ctx) {
  if (!isSheetBlockAvailable(key, ctx) || layout.blocks.some((block) => block.key === key)) return layout;
  return {
    ...layout,
    blocks: insertAtDefaultPosition(layout.blocks, key, ctx),
    hidden: layout.hidden.filter((hiddenKey) => hiddenKey !== key),
  };
}

export function setSheetBlockSize(layout, key, size) {
  if (!SHEET_SIZES.includes(size)) return layout;
  return { ...layout, blocks: layout.blocks.map((block) => (block.key === key ? { ...block, size } : block)) };
}

export function toggleSheetBlockSize(layout, key) {
  const block = layout.blocks.find((item) => item.key === key);
  if (!block) return layout;
  return setSheetBlockSize(layout, key, block.size === 'detailed' ? 'compact' : 'detailed');
}

export function togglePinnedSheetTool(layout, toolKey, capabilities = {}) {
  const pinned = layout.pinnedTools || [];
  if (pinned.includes(toolKey)) return { ...layout, pinnedTools: pinned.filter((key) => key !== toolKey) };
  if (!isSheetToolAvailable(toolKey, capabilities) || pinned.length >= SHEET_MAX_PINNED) return layout;
  return { ...layout, pinnedTools: [...pinned, toolKey] };
}

export function movePinnedSheetTool(layout, toolKey, delta) {
  const pinned = (layout.pinnedTools || []).slice();
  const from = pinned.indexOf(toolKey);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= pinned.length) return layout;
  pinned.splice(from, 1);
  pinned.splice(to, 0, toolKey);
  return { ...layout, pinnedTools: pinned };
}

/** Applique une disposition prête à l'emploi en gardant les outils épinglés. */
export function applySheetPreset(layout, presetKey, ctx) {
  const preset = SHEET_PRESETS.find((item) => item.key === presetKey);
  if (!preset) return layout;
  const available = availableSheetBlocks(ctx);
  const blocks = [];
  for (const [key, size] of preset.blocks) {
    if (available.includes(key) && !blocks.some((block) => block.key === key)) blocks.push({ key, size: validSize(key, size) });
  }
  // Un bloc qui ne peut pas être masqué reste présent, en bas.
  for (const key of available) {
    if (!isSheetBlockHideable(key) && !blocks.some((block) => block.key === key)) blocks.push({ key, size: SHEET_DEFAULT_SIZES[key] || 'compact' });
  }
  return {
    v: SHEET_LAYOUT_VERSION,
    blocks,
    hidden: available.filter((key) => !blocks.some((block) => block.key === key)),
    pinnedTools: (layout?.pinnedTools || defaultPinnedTools(ctx)).slice(),
  };
}

/**
 * Répartition tablette : deux colonnes en gardant l'ordre de chaque colonne.
 * Les blocs `left` vont à gauche, les autres à droite.
 */
export function splitSheetColumns(blocks) {
  const left = [];
  const right = [];
  for (const block of blocks) {
    if ((SHEET_BLOCK_BY_KEY[block.key]?.column || 'left') === 'left') left.push(block);
    else right.push(block);
  }
  return { left, right };
}

// ---------------------------------------------------------------------------
// Suggestions d'épinglage : METRA propose, l'utilisateur décide
// ---------------------------------------------------------------------------

const RECENT_OPENS_KEPT = 10;

function parseOpens(json) {
  try {
    const list = JSON.parse(json || '[]');
    return Array.isArray(list) ? list.filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))) : [];
  } catch {
    return [];
  }
}

/** Compteurs mis à jour après l'ouverture d'un outil (stockés par missionSheetDb.js). */
export function registerSheetToolOpen(row, nowIso = new Date().toISOString()) {
  const recent = parseOpens(row?.recent_opens_json).slice(-(RECENT_OPENS_KEPT - 1));
  recent.push(nowIso);
  return {
    open_count: Number(row?.open_count || 0) + 1,
    recent_opens_json: JSON.stringify(recent),
    last_opened_at: nowIso,
  };
}

/**
 * Outil à proposer d'épingler : ouvert au moins `minOpens` fois en
 * `windowDays` jours, non épinglé, disponible, et jamais refusé
 * définitivement. Après « Plus tard », seules les ouvertures suivantes
 * comptent. Ne déplace jamais rien : c'est une proposition.
 */
export function pickSheetToolSuggestion({ usage = [], pinnedTools = [], capabilities = {}, now = Date.now(), minOpens = 3, windowDays = 7 } = {}) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const since = nowMs - windowDays * 24 * 3600 * 1000;
  let best = null;
  for (const row of usage || []) {
    const key = row?.tool_key;
    if (!key || pinnedTools.includes(key) || !isSheetToolAvailable(key, capabilities)) continue;
    if (row.suggestion_state === 'never' || row.suggestion_state === 'accepted') continue;
    const dismissedAt = row.suggestion_state === 'later' && row.suggestion_at ? Date.parse(row.suggestion_at) : 0;
    const floor = Math.max(since, Number.isNaN(dismissedAt) ? 0 : dismissedAt);
    const count = parseOpens(row.recent_opens_json).filter((value) => Date.parse(value) > floor).length;
    if (count >= minOpens && (!best || count > best.count)) best = { toolKey: key, count };
  }
  return best;
}
