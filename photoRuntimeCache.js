import { BoundedLruMap } from './boundedCache.js';
import { listerPhotos } from './db.js';
import { getPhotoVariant, preparePhotoVariants } from './photoVariantCache.js';

const cache = new BoundedLruMap(3);
const pending = new Map();
const listeners = new Map();

function visitKey(visiteId) {
  return String(visiteId || '').trim();
}

function entityKey(value) {
  return value == null ? '' : String(value);
}

function cloneRows(rows) {
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
}

function emit(visiteId) {
  const key = visitKey(visiteId);
  const value = cache.get(key);
  const subs = listeners.get(key);
  if (!subs?.size) return;
  const snapshot = value ? cloneRows(value.rows) : [];
  for (const fn of [...subs]) {
    try { fn(snapshot); } catch {}
  }
}

function write(visiteId, rows) {
  const key = visitKey(visiteId);
  if (!key) return [];
  const next = { rows: cloneRows(rows), loadedAt: Date.now() };
  cache.set(key, next);
  emit(key);
  return next.rows;
}

export function peekVisitPhotos(visiteId, entiteKey = undefined) {
  const entry = cache.get(visitKey(visiteId));
  if (!entry) return null;
  if (entiteKey === undefined) return cloneRows(entry.rows);
  const wanted = entityKey(entiteKey);
  return cloneRows(entry.rows.filter((row) => entityKey(row.entite_key) === wanted));
}

export async function loadVisitPhotos(visiteId, { force = false, prewarm = true } = {}) {
  const key = visitKey(visiteId);
  if (!key) return [];
  if (!force) {
    const cached = cache.get(key);
    if (cached) return cloneRows(cached.rows);
    if (pending.has(key)) return pending.get(key);
  }

  const promise = listerPhotos(key)
    .then((rows) => {
      const stored = write(key, rows || []);
      if (prewarm) prewarmVisitPhotoVariants(key, stored).catch(() => {});
      return cloneRows(stored);
    })
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
}

export async function prewarmVisitPhotoVariants(visiteId, rows = null) {
  const all = rows || peekVisitPhotos(visiteId) || await loadVisitPhotos(visiteId, { prewarm: false });
  // On borne le travail de fond : les 24 premières miniatures sont les plus
  // probables à être affichées, et seulement 4 aperçus sont préparés.
  const thumbs = all.slice(0, 24).map((photo) => getPhotoVariant(photo.uri, 'thumb'));
  const previews = all.slice(0, 4).map((photo) => getPhotoVariant(photo.uri, 'preview'));
  await Promise.allSettled([...thumbs, ...previews]);
}

export function upsertRuntimePhoto(visiteId, photo) {
  const key = visitKey(visiteId);
  if (!key || !photo) return;
  const current = peekVisitPhotos(key) || [];
  const id = String(photo.id || '');
  const index = current.findIndex((row) => String(row.id || '') === id);
  if (index >= 0) current[index] = { ...current[index], ...photo };
  else current.push({ ...photo });
  write(key, current);
  if (photo.uri && !photo.pending) preparePhotoVariants(photo.uri).catch(() => {});
}

export function replaceRuntimePhoto(visiteId, tempId, photo) {
  const key = visitKey(visiteId);
  if (!key || !photo) return;
  const current = peekVisitPhotos(key) || [];
  const index = current.findIndex((row) => String(row.id || '') === String(tempId || ''));
  if (index >= 0) current[index] = { ...photo };
  else current.push({ ...photo });
  write(key, current);
  if (photo.uri && !photo.pending) preparePhotoVariants(photo.uri).catch(() => {});
}

export function removeRuntimePhoto(visiteId, photoId) {
  const key = visitKey(visiteId);
  if (!key) return;
  const current = peekVisitPhotos(key);
  if (!current) return;
  write(key, current.filter((row) => String(row.id || '') !== String(photoId || '')));
}

export function subscribeVisitPhotos(visiteId, listener) {
  const key = visitKey(visiteId);
  if (!key || typeof listener !== 'function') return () => {};
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  const current = cache.get(key);
  if (current) {
    try { listener(cloneRows(current.rows)); } catch {}
  }
  return () => {
    const set = listeners.get(key);
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(key);
  };
}

export function forgetVisitPhotos(visiteId) {
  const key = visitKey(visiteId);
  cache.delete(key);
  pending.delete(key);
}

export function photoRuntimeStats() {
  return {
    visits: cache.size,
    pendingLoads: pending.size,
    subscriptions: [...listeners.values()].reduce((n, set) => n + set.size, 0),
    visitLimit: 3,
  };
}
