/**
 * Missions à la carte — briques d'une Mission.
 *
 * Le type de Mission propose un jeu d'outils (getMissionCapabilities). Chaque
 * Mission peut ensuite **ajouter** un outil que son type n'a pas ou en
 * **retirer** un qu'elle n'utilise pas. Seule la différence est stockée
 * (missions.modules_json) : si les recettes d'un type évoluent, les Missions
 * existantes en profitent, sauf pour les briques réglées à la main.
 *
 * Format : { v: 1, added: [toolKey], removed: [toolKey] }. Module pur.
 */
import { SHEET_TOOLS, SHEET_TOOL_BY_KEY } from './missionSheetRegistry.js';

export const MODULES_VERSION = 1;
const EMPTY = Object.freeze({ v: MODULES_VERSION, added: [], removed: [] });

export function parseMissionModules(raw) {
  if (!raw) return EMPTY;
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return EMPTY; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY;
  const clean = (list) => [...new Set((Array.isArray(list) ? list : []).filter((key) => SHEET_TOOL_BY_KEY[key]))];
  const added = clean(value.added);
  const removed = clean(value.removed).filter((key) => !added.includes(key));
  return { v: MODULES_VERSION, added, removed };
}

export function serializeMissionModules(modules) {
  const m = parseMissionModules(modules);
  return m.added.length || m.removed.length ? JSON.stringify(m) : null;
}

/** Capacités effectives : celles du type, plus les ajouts, moins les retraits. */
export function resolveMissionCapabilities(baseCapabilities = {}, modules = null) {
  const m = parseMissionModules(modules);
  const out = { ...baseCapabilities };
  for (const key of m.added) out[key] = true;
  for (const key of m.removed) out[key] = false;
  return out;
}

/**
 * Active ou désactive une brique. Le résultat reste minimal : ce qui revient
 * à l'état du type disparaît des listes `added` / `removed`.
 */
export function setMissionModule(modules, key, enabled, baseCapabilities = {}) {
  if (!SHEET_TOOL_BY_KEY[key]) return parseMissionModules(modules);
  const m = parseMissionModules(modules);
  const inType = baseCapabilities?.[key] === true;
  const added = m.added.filter((item) => item !== key);
  const removed = m.removed.filter((item) => item !== key);
  if (enabled && !inType) added.push(key);
  if (!enabled && inType) removed.push(key);
  return { v: MODULES_VERSION, added, removed };
}

/** État d'une brique pour l'affichage : du type, ajoutée, retirée ou non proposée. */
export function missionModuleState(key, baseCapabilities = {}, modules = null) {
  const m = parseMissionModules(modules);
  if (m.added.includes(key)) return 'added';
  if (m.removed.includes(key)) return 'removed';
  return baseCapabilities?.[key] === true ? 'type' : 'off';
}

export function isMissionModuleOn(state) {
  return state === 'type' || state === 'added';
}

export function countActiveModules(baseCapabilities = {}, modules = null) {
  const caps = resolveMissionCapabilities(baseCapabilities, modules);
  return SHEET_TOOLS.filter((tool) => caps[tool.key] === true).length;
}

/** Résumé lisible : « 14 briques · 2 ajoutées · 1 retirée ». */
export function describeMissionModules(baseCapabilities = {}, modules = null) {
  const m = parseMissionModules(modules);
  const parts = [`${countActiveModules(baseCapabilities, m)} briques`];
  if (m.added.length) parts.push(`${m.added.length} ajoutée${m.added.length > 1 ? 's' : ''}`);
  if (m.removed.length) parts.push(`${m.removed.length} retirée${m.removed.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
