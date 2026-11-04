let revision = 0;
let lastSavedAt = 0;
const errors = new Map();
const dirty = new Set();
const saving = new Set();
const listeners = new Set();

function snapshot() {
  const lastError = [...errors.values()].at(-1) || null;
  return {
    revision,
    dirty: dirty.size,
    saving: saving.size,
    pending: new Set([...dirty, ...saving]).size,
    lastSavedAt,
    lastError,
  };
}

function emit() {
  revision += 1;
  const state = snapshot();
  for (const listener of [...listeners]) {
    try { listener(state); } catch {}
  }
}

export function subscribeSaveActivity(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

export function markDraftDirty(key) {
  const id = String(key || '').trim();
  if (!id || dirty.has(id)) return;
  dirty.add(id);
  // A new edit must not hide a failed save on another field.
  emit();
}

export function markDraftSaving(key) {
  const id = String(key || '').trim();
  if (!id) return;
  const changed = dirty.delete(id) || !saving.has(id);
  saving.add(id);
  if (changed) emit();
}

export function markDraftSaved(key) {
  const id = String(key || '').trim();
  if (!id) return;
  const wasDirty = dirty.delete(id);
  const wasSaving = saving.delete(id);
  const hadError = errors.delete(id);
  lastSavedAt = Date.now();
  if (wasDirty || wasSaving || hadError) emit();
}

export function markDraftError(key, error) {
  const id = String(key || '').trim();
  if (id) {
    saving.delete(id);
    dirty.add(id);
    errors.delete(id);
    errors.set(id, String(error?.message || error || 'Erreur de sauvegarde'));
  }
  emit();
}

export function beginExternalSave(key) {
  const id = String(key || '').trim();
  if (!id) return;
  saving.add(id);
  emit();
}

export function endExternalSave(key, error = null) {
  const id = String(key || '').trim();
  if (id) saving.delete(id);
  if (error) {
    if (id) {
      errors.delete(id);
      errors.set(id, String(error?.message || error));
    }
  } else {
    if (id) errors.delete(id);
    lastSavedAt = Date.now();
  }
  emit();
}

export function getSaveActivity() {
  return snapshot();
}
