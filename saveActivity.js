let revision = 0;
let lastSavedAt = 0;
let lastError = null;
const dirty = new Set();
const saving = new Set();
const listeners = new Set();

function snapshot() {
  return {
    revision,
    dirty: dirty.size,
    saving: saving.size,
    pending: dirty.size + saving.size,
    lastSavedAt,
    lastError
  };
}

function emit() {
  revision += 1;
  const state = snapshot();
  for (const listener of [...listeners]) {
    try {
      listener(state);
    } catch {}
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
  lastError = null;
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
  const changed = dirty.delete(id) || saving.delete(id);
  lastSavedAt = Date.now();
  lastError = null;
  if (changed) emit();
}

export function markDraftError(key, error) {
  const id = String(key || '').trim();
  if (id) {
    saving.delete(id);
    dirty.add(id);
  }
  lastError = String(error?.message || error || 'Erreur de sauvegarde');
  emit();
}

export function beginExternalSave(key) {
  const id = String(key || '').trim();
  if (!id) return;
  saving.add(id);
  lastError = null;
  emit();
}

export function endExternalSave(key, error = null) {
  const id = String(key || '').trim();
  if (id) saving.delete(id);
  if (error) {
    lastError = String(error?.message || error);
  } else {
    lastSavedAt = Date.now();
    lastError = null;
  }
  emit();
}

export function getSaveActivity() {
  return snapshot();
}
