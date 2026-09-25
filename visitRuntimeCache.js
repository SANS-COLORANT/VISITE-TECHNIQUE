import { BoundedLruMap } from './boundedCache.js';

const HOT_LIMIT = 3;
const WARM_LIMIT = 12;

// HOT = contexte + aperçu prêt à être affiché immédiatement.
// WARM = métadonnées légères seulement. Les gros tableaux restent dans SQLite.
// COLD = aucune donnée conservée en RAM.
const hot = new BoundedLruMap(HOT_LIMIT);
const warm = new BoundedLruMap(WARM_LIMIT);

function keyOf(id) {
  return String(id || '').trim();
}

function compactPayload(value = {}) {
  const preview = value.preview || value.visite || value;
  return {
    id: keyOf(preview?.id || value?.id),
    preview: preview ? {
      id: preview.id,
      site_id: preview.site_id,
      installation_id: preview.installation_id || null,
      nom_site: preview.nom_site || '',
      nom_client: preview.nom_client || '',
      nom_installation: preview.nom_installation || '',
      date_visite: preview.date_visite || '',
      trame_id: preview.trame_id || null,
      mode_visite: preview.mode_visite || null,
      statut: preview.statut || null,
      progression_pct: Number(preview.progression_pct || 0),
      api_remote_local_id: preview.api_remote_local_id || null,
    } : null,
    ui: value.ui ? { ...value.ui } : {},
    touchedAt: Date.now(),
  };
}

function demoteOldestIfNeeded(nextKey) {
  if (!nextKey || hot.has(nextKey) || hot.size < HOT_LIMIT) return;
  const oldestKey = hot.keys().next().value;
  if (!oldestKey) return;
  const oldest = hot.get(oldestKey);
  hot.delete(oldestKey);
  if (oldest) warm.set(oldestKey, { ...compactPayload(oldest), touchedAt: Date.now() });
}

export function markVisitHot(id, patch = {}) {
  const key = keyOf(id || patch?.id || patch?.preview?.id);
  if (!key) return null;
  demoteOldestIfNeeded(key);
  const previous = hot.get(key) || warm.get(key) || { id: key, preview: null, ui: {} };
  warm.delete(key);
  const next = compactPayload({
    ...previous,
    ...patch,
    id: key,
    preview: patch.preview ? { ...(previous.preview || {}), ...patch.preview } : previous.preview,
    ui: { ...(previous.ui || {}), ...(patch.ui || {}) },
  });
  hot.set(key, next);
  return next;
}

export function markVisitWarm(id, patch = {}) {
  const key = keyOf(id || patch?.id || patch?.preview?.id);
  if (!key) return null;
  if (hot.has(key)) return markVisitHot(key, patch);
  const previous = warm.get(key) || { id: key, preview: null, ui: {} };
  const next = compactPayload({
    ...previous,
    ...patch,
    id: key,
    preview: patch.preview ? { ...(previous.preview || {}), ...patch.preview } : previous.preview,
    ui: { ...(previous.ui || {}), ...(patch.ui || {}) },
  });
  warm.set(key, next);
  return next;
}

export function getVisitRuntime(id) {
  const key = keyOf(id);
  if (!key) return null;
  const hotValue = hot.get(key);
  if (hotValue) return { ...hotValue, tier: 'HOT' };
  const warmValue = warm.get(key);
  if (warmValue) return { ...warmValue, tier: 'WARM' };
  return { id: key, tier: 'COLD', preview: null, ui: {} };
}

export function getVisitPreview(id) {
  return getVisitRuntime(id)?.preview || null;
}

export function patchVisitUiState(id, patch = {}) {
  const key = keyOf(id);
  if (!key) return;
  if (hot.has(key)) {
    const current = hot.get(key);
    hot.set(key, { ...current, ui: { ...(current?.ui || {}), ...patch }, touchedAt: Date.now() });
    return;
  }
  const current = warm.get(key) || { id: key, preview: null, ui: {} };
  warm.set(key, { ...current, ui: { ...(current.ui || {}), ...patch }, touchedAt: Date.now() });
}

export function getVisitUiState(id) {
  return getVisitRuntime(id)?.ui || {};
}

export function forgetVisitRuntime(id) {
  const key = keyOf(id);
  hot.delete(key);
  warm.delete(key);
}

export function visitRuntimeStats() {
  return {
    hot: hot.size,
    warm: warm.size,
    hotLimit: HOT_LIMIT,
    warmLimit: WARM_LIMIT,
  };
}

export const VISIT_HOT_LIMIT = HOT_LIMIT;
export const VISIT_WARM_LIMIT = WARM_LIMIT;
