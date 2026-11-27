/**
 * Fiche Mission modulable : registre des blocs, héritage des dispositions,
 * opérations d'édition et suggestions d'épinglage (fonctions pures).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHEET_BLOCKS,
  SHEET_PRESETS,
  SHEET_TOOLS,
  SHEET_TOOL_GROUPS,
  SHEET_INDICATORS,
  SHEET_MAX_PINNED,
  SHEET_FAMILY_DEFAULTS,
  SHEET_TYPE_DEFAULTS,
} from '../missionSheetRegistry.js';
import {
  applySheetPreset,
  availableSheetBlocks,
  availableSheetTools,
  buildSheetContext,
  defaultPinnedTools,
  defaultSheetLayout,
  hideSheetBlock,
  moveSheetBlock,
  moveSheetBlockTo,
  movePinnedSheetTool,
  normalizeSheetLayout,
  pickSheetToolSuggestion,
  registerSheetToolOpen,
  resolveSheetLayout,
  serializeSheetLayout,
  sheetLayoutsEqual,
  showSheetBlock,
  splitSheetColumns,
  toggleSheetBlockSize,
  togglePinnedSheetTool,
  toolKeyForPlaybookAction,
} from '../missionSheetLayout.js';
import { getMissionCapabilities } from '../missionRecipes.js';
import { getMissionFieldPlaybook } from '../missionFieldPlaybooks.js';

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

// Familles et types réels, lus dans missionsDb.js sans l'exécuter (il importe SQLite).
function missionTypes() {
  const db = source('missionsDb.js');
  const block = db.match(/export const MISSION_FAMILIES[\s\S]*?\]\);/)[0];
  const out = [];
  for (const part of block.split(/\{ key: '/).slice(1)) {
    const family = part.split("'")[0];
    for (const match of part.matchAll(/\['([a-z0-9_]+)',\s*'/g)) out.push({ family, type: match[1] });
  }
  return out;
}

const ALL = missionTypes();
const ctxFor = ({ family, type }) => buildSheetContext({
  family,
  type,
  capabilities: getMissionCapabilities(family, type),
  playbook: getMissionFieldPlaybook(type),
});

test('le registre couvre les 26 outils de l’ancienne grille + les trames, sans doublon', () => {
  const screen = source('MissionScreen.js');
  assert.equal(SHEET_TOOLS.length, 27);
  assert.equal(new Set(SHEET_TOOLS.map((tool) => tool.key)).size, 27);
  assert.equal(new Set(SHEET_TOOLS.map((tool) => tool.route)).size, 27);
  const groups = new Set(SHEET_TOOL_GROUPS.map((group) => group.key));
  for (const tool of SHEET_TOOLS) {
    assert.ok(groups.has(tool.group), `${tool.key} sans groupe`);
    assert.ok(tool.icon && tool.title && tool.subtitle, `${tool.key} incomplet`);
    assert.doesNotMatch(`${tool.title}${tool.subtitle}`, /\p{Extended_Pictographic}/u, `${tool.key} contient un emoji`);
  }
  assert.ok(ALL.length >= 37, 'types de Mission lus');
  assert.match(screen, /getMissionCapabilities/);
});

test('chaque bloc a une clé unique, un libellé, une icône et une description', () => {
  assert.equal(new Set(SHEET_BLOCKS.map((block) => block.key)).size, SHEET_BLOCKS.length);
  for (const block of SHEET_BLOCKS) assert.ok(block.label && block.icon && block.description, block.key);
  const locked = SHEET_BLOCKS.filter((block) => block.locked).map((block) => block.key);
  assert.deepEqual(locked, ['header', 'primary']);
  for (const list of [...Object.values(SHEET_FAMILY_DEFAULTS), ...Object.values(SHEET_TYPE_DEFAULTS)]) {
    for (const key of list) assert.ok(SHEET_BLOCKS.some((block) => block.key === key && !block.locked), key);
  }
});

test('disposition d’usine propre pour les 37 types : 4 à 6 outils épinglés, tous autorisés', () => {
  for (const item of ALL) {
    const ctx = ctxFor(item);
    const layout = defaultSheetLayout(ctx);
    const available = availableSheetBlocks(ctx);
    const keys = layout.blocks.map((block) => block.key);
    assert.ok(keys.includes('todo') && keys.includes('visits') && keys.includes('tools'), `${item.type} : blocs essentiels`);
    assert.ok(layout.blocks.length <= 8, `${item.type} : fiche trop chargée (${layout.blocks.length} blocs)`);
    assert.deepEqual([...keys, ...layout.hidden].sort(), available.slice().sort(), `${item.type} : chaque bloc visible ou masqué`);
    assert.ok(layout.pinnedTools.length >= 4 && layout.pinnedTools.length <= 6, `${item.type} : ${layout.pinnedTools.length} épingles`);
    const tools = availableSheetTools(ctx.capabilities);
    for (const key of layout.pinnedTools) assert.ok(tools.includes(key), `${item.type} : ${key} non autorisé`);
    // Les réserves n'apparaissent que là où elles ont un sens.
    if (keys.includes('reserves')) assert.ok(item.family === 'travaux_chantier' || ctx.capabilities.reserveClearance || ctx.capabilities.receptionBoard);
  }
});

test('l’ancienne grille affichait près de 30 boutons, la nouvelle fiche en garde moins de 10 avant les visites', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  const legacyTiles = availableSheetTools(ctx.capabilities).length;
  assert.equal(legacyTiles, 17);
  const layout = defaultSheetLayout(ctx);
  // En-tête (0 bouton) + action principale (2) + « À traiter » compte pour 1
  // accès + les visites arrivent en 2e bloc : au plus 2 + 1 + 1 éléments avant elles.
  const before = layout.blocks.findIndex((block) => block.key === 'visits');
  assert.ok(before <= 1, 'les visites suivent directement les points à traiter');
});

test('les épingles par défaut suivent le parcours recommandé', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  const pins = defaultPinnedTools(ctx);
  // Parcours « diagnostic chaufferie » : circuits, synoptique, inventaire, mesure, photo, plan.
  assert.deepEqual(pins, ['technicalStructure', 'synoptic', 'equipment', 'measurements', 'photoAnnotations', 'plans']);
  assert.equal(toolKeyForPlaybookAction({ kind: 'navigate', route: 'MissionScenarios' }), 'scenarios');
  assert.equal(toolKeyForPlaybookAction({ kind: 'point' }), null);
});

test('héritage mission → type → famille → usine', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  const mission = serializeSheetLayout({ blocks: [{ key: 'visits', size: 'detailed' }], hidden: ['todo'], pinnedTools: ['equipment'] });
  const type = serializeSheetLayout({ blocks: [{ key: 'tools', size: 'compact' }], hidden: [], pinnedTools: ['plans'] });
  const family = serializeSheetLayout({ blocks: [{ key: 'measures', size: 'detailed' }], hidden: [], pinnedTools: [] });
  assert.equal(resolveSheetLayout({ stored: { mission, type, family }, ctx }).source, 'mission');
  assert.equal(resolveSheetLayout({ stored: { type, family }, ctx }).source, 'type');
  assert.equal(resolveSheetLayout({ stored: { family }, ctx }).source, 'family');
  assert.equal(resolveSheetLayout({ stored: {}, ctx }).source, 'default');
  const fromMission = resolveSheetLayout({ stored: { mission }, ctx }).layout;
  assert.equal(fromMission.blocks[0].key, 'visits');
  assert.ok(fromMission.hidden.includes('todo'));
  assert.deepEqual(fromMission.pinnedTools, ['equipment']);
});

test('une disposition abîmée ou d’une autre version reste utilisable', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  assert.deepEqual(normalizeSheetLayout('{pas du json', ctx), defaultSheetLayout(ctx));
  const odd = normalizeSheetLayout({
    blocks: [{ key: 'inconnu' }, { key: 'header' }, { key: 'visits', size: 'géant' }, { key: 'visits' }, 'todo', { key: 'reserves' }],
    hidden: ['tools', 'deliverables', 'pasUnBloc'],
    pinnedTools: ['measurements', 'measurements', 'signature', 'nexistepas'],
  }, ctx);
  const keys = odd.blocks.map((block) => block.key);
  assert.deepEqual(keys.slice(0, 2), ['visits', 'todo']);
  assert.ok(!keys.includes('header') && !keys.includes('inconnu'));
  assert.ok(!keys.includes('reserves'), 'réserves non autorisées pour un diagnostic');
  assert.equal(odd.blocks[0].size, 'compact');
  assert.ok(keys.includes('tools'), 'outils jamais masqués');
  assert.ok(odd.hidden.includes('deliverables'));
  assert.deepEqual(odd.pinnedTools, ['measurements'], 'doublons et outils non autorisés retirés');
});

test('un bloc apparu dans une nouvelle version arrive à sa place, sans tout réinitialiser', () => {
  const ctx = ctxFor({ family: 'campagne_multisites', type: 'campagne_mesures' });
  const old = { blocks: [{ key: 'todo', size: 'compact' }, { key: 'visits', size: 'detailed' }, { key: 'tools', size: 'detailed' }], hidden: [], pinnedTools: ['map'] };
  const layout = normalizeSheetLayout(old, ctx);
  const keys = layout.blocks.map((block) => block.key);
  assert.equal(keys[0], 'sites', 'avancement multi-sites inséré en tête, comme dans l’ordre d’usine');
  assert.equal(layout.blocks.find((block) => block.key === 'visits').size, 'detailed', 'réglage existant conservé');
});

test('déplacer, masquer, afficher et changer la taille, sans jamais perdre un bloc', () => {
  const ctx = ctxFor({ family: 'travaux_chantier', type: 'opr_reception' });
  let layout = defaultSheetLayout(ctx);
  const first = layout.blocks[0].key;
  layout = moveSheetBlock(layout, first, 1);
  assert.equal(layout.blocks[1].key, first);
  assert.equal(moveSheetBlock(layout, layout.blocks[0].key, -1), layout, 'rien au-dessus du premier bloc');
  layout = moveSheetBlockTo(layout, 'deliverables', 'top');
  assert.equal(layout.blocks[0].key, 'deliverables');
  layout = moveSheetBlockTo(layout, 'deliverables', { after: 'visits' });
  const visitsIndex = layout.blocks.findIndex((block) => block.key === 'visits');
  assert.equal(layout.blocks[visitsIndex + 1].key, 'deliverables');
  layout = moveSheetBlockTo(layout, 'deliverables', 'bottom');
  assert.equal(layout.blocks.at(-1).key, 'deliverables');
  layout = hideSheetBlock(layout, 'todo');
  assert.ok(layout.hidden.includes('todo') && !layout.blocks.some((block) => block.key === 'todo'));
  assert.equal(hideSheetBlock(layout, 'tools'), layout, '« Tous les outils » reste toujours accessible');
  layout = showSheetBlock(layout, 'todo', ctx);
  assert.ok(layout.blocks.some((block) => block.key === 'todo') && !layout.hidden.includes('todo'));
  const before = layout.blocks.find((block) => block.key === 'visits').size;
  layout = toggleSheetBlockSize(layout, 'visits');
  assert.notEqual(layout.blocks.find((block) => block.key === 'visits').size, before);
  const all = [...layout.blocks.map((block) => block.key), ...layout.hidden].sort();
  assert.deepEqual(all, availableSheetBlocks(ctx).slice().sort());
});

test('épingler, désépingler et réordonner les outils', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  let layout = defaultSheetLayout(ctx);
  layout = togglePinnedSheetTool(layout, 'scenarios', ctx.capabilities);
  assert.equal(layout.pinnedTools.at(-1), 'scenarios');
  layout = movePinnedSheetTool(layout, 'scenarios', -1);
  assert.equal(layout.pinnedTools.at(-2), 'scenarios');
  layout = togglePinnedSheetTool(layout, 'scenarios', ctx.capabilities);
  assert.ok(!layout.pinnedTools.includes('scenarios'));
  assert.equal(togglePinnedSheetTool(layout, 'signature', ctx.capabilities), layout, 'outil non autorisé pour ce type');
  let full = { ...layout, pinnedTools: [] };
  for (const key of availableSheetTools(ctx.capabilities)) full = togglePinnedSheetTool(full, key, ctx.capabilities);
  assert.equal(full.pinnedTools.length, SHEET_MAX_PINNED);
});

test('les dispositions prêtes gardent les épingles et ne masquent jamais les outils', () => {
  const ctx = ctxFor({ family: 'travaux_chantier', type: 'opr_reception' });
  const base = defaultSheetLayout(ctx);
  for (const preset of SHEET_PRESETS) {
    const layout = applySheetPreset(base, preset.key, ctx);
    assert.deepEqual(layout.pinnedTools, base.pinnedTools, preset.key);
    assert.ok(layout.blocks.some((block) => block.key === 'tools'), preset.key);
    assert.deepEqual([...layout.blocks.map((block) => block.key), ...layout.hidden].sort(), availableSheetBlocks(ctx).slice().sort());
  }
  assert.deepEqual(applySheetPreset(base, 'minimal', ctx).blocks.map((block) => block.key), ['todo', 'visits', 'tools']);
});

test('sérialisation stable et comparaison', () => {
  const ctx = ctxFor({ family: 'suivi_ponctuel', type: 'suivi_technique' });
  const layout = defaultSheetLayout(ctx);
  const round = normalizeSheetLayout(serializeSheetLayout(layout), ctx);
  assert.ok(sheetLayoutsEqual(layout, round));
  assert.ok(!sheetLayoutsEqual(layout, toggleSheetBlockSize(layout, 'visits')));
});

test('deux colonnes sur tablette, l’ordre de chaque colonne est conservé', () => {
  const ctx = ctxFor({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  const { left, right } = splitSheetColumns(defaultSheetLayout(ctx).blocks);
  assert.deepEqual(left.map((block) => block.key), ['todo', 'visits', 'progress']);
  assert.deepEqual(right.map((block) => block.key), ['tools', 'measures', 'indicators', 'deliverables']);
});

test('suggestion d’épinglage : 3 ouvertures en 7 jours, jamais un outil déjà épinglé ni refusé', () => {
  const now = Date.parse('2026-11-26T10:00:00Z');
  const caps = getMissionCapabilities('etude_audit', 'diagnostic_chaufferie_ss');
  let row = null;
  for (const day of ['2026-11-20T09:00:00Z', '2026-11-24T09:00:00Z', '2026-11-25T09:00:00Z']) row = { tool_key: 'scenarios', ...registerSheetToolOpen(row, day) };
  assert.equal(row.open_count, 3);
  assert.deepEqual(pickSheetToolSuggestion({ usage: [row], pinnedTools: [], capabilities: caps, now }), { toolKey: 'scenarios', count: 3 });
  assert.equal(pickSheetToolSuggestion({ usage: [row], pinnedTools: ['scenarios'], capabilities: caps, now }), null);
  assert.equal(pickSheetToolSuggestion({ usage: [{ ...row, suggestion_state: 'never' }], capabilities: caps, now }), null);
  const later = { ...row, suggestion_state: 'later', suggestion_at: '2026-11-25T10:00:00Z' };
  assert.equal(pickSheetToolSuggestion({ usage: [later], capabilities: caps, now }), null, 'après « Plus tard », on recompte');
  const old = { tool_key: 'scenarios', ...registerSheetToolOpen(null, '2026-10-01T09:00:00Z') };
  assert.equal(pickSheetToolSuggestion({ usage: [old], capabilities: caps, now }), null);
  let many = null;
  for (let i = 0; i < 25; i += 1) many = registerSheetToolOpen(many, new Date(now - i * 3600 * 1000).toISOString());
  assert.equal(JSON.parse(many.recent_opens_json).length, 10, 'historique borné');
});

test('chaque indicateur ouvre un outil du registre', () => {
  for (const indicator of SHEET_INDICATORS) assert.ok(SHEET_TOOLS.some((tool) => tool.key === indicator.tool), indicator.key);
});
