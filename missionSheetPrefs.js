/**
 * Fiche Mission modulable — enregistrement des dispositions, des usages
 * d'outils et des réglages d'ergonomie.
 *
 * Cœur pur : il reçoit un stockage clé / valeur synchrone `{ get, set }`.
 * L'application le branche sur la petite base de préférences d'interface
 * (missionSheetStore.js → uiPrefs.js) :
 * - aucune migration de la base métier, aucune donnée terrain touchée ;
 * - lecture synchrone : la fiche s'affiche directement dans sa disposition,
 *   sans passer par la disposition d'usine ;
 * - une disposition n'est jamais exportée dans un Excel, un ZIP ou un rapport.
 */
import { SHEET_LAYOUT_VERSION } from './missionSheetRegistry.js';
import { registerSheetToolOpen, serializeSheetLayout } from './missionSheetLayout.js';

const PREFIX = `mission.sheet.v${SHEET_LAYOUT_VERSION}`;

export const SHEET_PREF_KEYS = Object.freeze({
  layout: (scope, id) => `${PREFIX}.layout.${scope}.${id}`,
  usage: (missionId) => `${PREFIX}.usage.${missionId}`,
  neverSuggest: `${PREFIX}.suggest.never`,
  gloves: `${PREFIX}.gloves`,
  customizeHint: `${PREFIX}.hint.customize`,
});

const SCOPE_IDS = Object.freeze({
  mission: (ctx) => ctx?.missionId || null,
  type: (ctx) => ctx?.type || null,
  family: (ctx) => ctx?.family || null,
});

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    const value = JSON.parse(String(raw));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function createMissionSheetPrefs({ get, set }) {
  const read = (key) => {
    try { return get(key) ?? null; } catch { return null; }
  };
  const write = (key, value) => {
    try { set(key, value == null ? null : String(value)); } catch { /* préférence perdue, la fiche reste utilisable */ }
  };

  const scopeKey = (scope, ids) => {
    const id = SCOPE_IDS[scope]?.(ids);
    return id ? SHEET_PREF_KEYS.layout(scope, id) : null;
  };

  return {
    /** Dispositions brutes enregistrées pour cette Mission, son type et sa famille. */
    readStoredLayouts(ids) {
      const out = {};
      for (const scope of Object.keys(SCOPE_IDS)) {
        const key = scopeKey(scope, ids);
        out[scope] = key ? read(key) : null;
      }
      return out;
    },

    /** Enregistre une disposition ; renvoie la valeur précédente (pour « Annuler »). */
    saveLayout(scope, ids, layout) {
      const key = scopeKey(scope, ids);
      if (!key) return { key: null, previous: null };
      const previous = read(key);
      write(key, serializeSheetLayout(layout));
      return { key, previous };
    },

    /** Oublie la disposition d'une portée ; renvoie la valeur précédente. */
    clearLayout(scope, ids) {
      const key = scopeKey(scope, ids);
      if (!key) return { key: null, previous: null };
      const previous = read(key);
      write(key, null);
      return { key, previous };
    },

    /** Remet une valeur brute telle qu'elle était (annulation). */
    restoreRaw(key, raw) {
      if (key) write(key, raw ?? null);
    },

    /** Lignes d'usage au format attendu par pickSheetToolSuggestion. */
    readUsage(missionId) {
      if (!missionId) return [];
      const map = parseJson(read(SHEET_PREF_KEYS.usage(missionId)), {});
      const never = new Set(parseJson(read(SHEET_PREF_KEYS.neverSuggest), []));
      return Object.entries(map && typeof map === 'object' ? map : {}).map(([toolKey, row]) => ({
        tool_key: toolKey,
        open_count: Number(row?.open_count || 0),
        recent_opens_json: row?.recent_opens_json || '[]',
        last_opened_at: row?.last_opened_at || null,
        suggestion_state: never.has(toolKey) ? 'never' : (row?.suggestion_state || null),
        suggestion_at: row?.suggestion_at || null,
      }));
    },

    recordToolOpen(missionId, toolKey, nowIso = new Date().toISOString()) {
      if (!missionId || !toolKey) return;
      const key = SHEET_PREF_KEYS.usage(missionId);
      const map = parseJson(read(key), {});
      const current = map[toolKey] || {};
      map[toolKey] = { ...current, ...registerSheetToolOpen(current, nowIso) };
      write(key, JSON.stringify(map));
    },

    /** `state` : 'later' (on recompte à partir de maintenant) ou 'never' (pour tous les dossiers). */
    setSuggestionState(missionId, toolKey, state, nowIso = new Date().toISOString()) {
      if (!toolKey) return;
      if (state === 'never') {
        const never = new Set(parseJson(read(SHEET_PREF_KEYS.neverSuggest), []));
        never.add(toolKey);
        write(SHEET_PREF_KEYS.neverSuggest, JSON.stringify([...never]));
        return;
      }
      if (!missionId) return;
      const key = SHEET_PREF_KEYS.usage(missionId);
      const map = parseJson(read(key), {});
      map[toolKey] = { ...(map[toolKey] || {}), suggestion_state: state, suggestion_at: nowIso };
      write(key, JSON.stringify(map));
    },

    getGloves() {
      return read(SHEET_PREF_KEYS.gloves) === '1';
    },

    setGloves(enabled) {
      write(SHEET_PREF_KEYS.gloves, enabled ? '1' : '0');
    },

    customizeHintSeen() {
      return read(SHEET_PREF_KEYS.customizeHint) === '1';
    },

    markCustomizeHintSeen() {
      write(SHEET_PREF_KEYS.customizeHint, '1');
    },
  };
}
