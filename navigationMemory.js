import { AppState } from 'react-native';
import { BoundedLruMap } from './boundedCache.js';

const HOT_UI_LIMIT = 24;
const DURABLE_UI_LIMIT = 24;
const PREFIX = 'ui_state::';
const INDEX_KEY = 'ui_state_index::v1';

const states = new BoundedLruMap(HOT_UI_LIMIT);
const hydrated = new Set();
const dirty = new Set();
let flushTimer = null;
let flushPromise = null;
let appStateSubscription = null;

function keyOf(value) {
  return String(value || '').trim();
}

function normaliseState(value = {}) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    ...state,
    scrollY: Number.isFinite(Number(state.scrollY)) ? Math.max(0, Number(state.scrollY)) : 0,
    updatedAt: Number(state.updatedAt || Date.now())
  };
}

async function openDbLazy() {
  // Important pour le démarrage : la navigation légère ne doit pas charger
  // l'initialisation SQLite tant qu'une lecture/écriture durable n'est pas requise.
  const { openAppDatabase } = require('./database/index.js');
  return openAppDatabase();
}

function ensureBackgroundFlush() {
  if (appStateSubscription || !AppState?.addEventListener) return;
  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (next === 'inactive' || next === 'background') flushNavigationMemory().catch(() => {});
  });
}

function scheduleFlush() {
  ensureBackgroundFlush();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNavigationMemory().catch(() => {});
  }, 1200);
}

function remember(key, next, persist = true) {
  const id = keyOf(key);
  if (!id) return null;
  const state = normaliseState(next);
  states.set(id, state);
  if (persist) {
    dirty.add(id);
    scheduleFlush();
  }
  return state;
}

export function getNavigationState(key) {
  const id = keyOf(key);
  return id ? states.get(id) || null : null;
}

export function setNavigationState(key, patch = {}, { persist = true } = {}) {
  const id = keyOf(key);
  if (!id) return null;
  const previous = states.get(id) || {};
  return remember(id, { ...previous, ...patch, updatedAt: Date.now() }, persist);
}

export function getNavigationScrollOffset(key) {
  const value = Number(getNavigationState(key)?.scrollY || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setNavigationScrollOffset(key, offset) {
  const id = keyOf(key);
  if (!id) return;
  const value = Number(offset || 0);
  const next = Number.isFinite(value) && value > 0 ? value : 0;
  // Chaque événement remplace seulement la valeur mémoire et marque la même
  // clé dirty. Le timer unique (1,2 s) coalesce donc tout un geste de scroll
  // en une seule écriture SQLite avec la position la plus récente.
  setNavigationState(id, { scrollY: next }, { persist: true });
}

export async function hydrateNavigationState(key) {
  const id = keyOf(key);
  if (!id) return null;
  const inMemory = states.get(id);
  if (hydrated.has(id)) return inMemory || null;
  hydrated.add(id);
  try {
    const db = await openDbLazy();
    const row = await db.getFirstAsync('SELECT value FROM _meta WHERE key=? LIMIT 1', [PREFIX + id]);
    if (!row?.value) return inMemory || null;
    const durable = normaliseState(JSON.parse(row.value));
    const current = states.get(id);
    // Une saisie/navigation mémoire plus récente gagne toujours sur SQLite.
    if (!current || Number(durable.updatedAt || 0) > Number(current.updatedAt || 0)) {
      states.set(id, durable);
      return durable;
    }
    return current;
  } catch {
    return inMemory || null;
  }
}

export async function flushNavigationMemory() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!dirty.size) return;
  if (flushPromise) return flushPromise;

  const keys = [...dirty];
  dirty.clear();
  flushPromise = (async () => {
    const db = await openDbLazy();
    const entries = keys.map((key) => [key, states.get(key)]).filter(([, value]) => value);
    if (!entries.length) return;

    await db.withTransactionAsync(async () => {
      let index = [];
      try {
        const row = await db.getFirstAsync('SELECT value FROM _meta WHERE key=? LIMIT 1', [INDEX_KEY]);
        const parsed = JSON.parse(row?.value || '[]');
        if (Array.isArray(parsed)) index = parsed.map(String);
      } catch {}

      for (const [key, value] of entries) {
        await db.runAsync(
          `INSERT INTO _meta(key,value) VALUES(?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          [PREFIX + key, JSON.stringify(value)]
        );
        index = index.filter((x) => x !== key);
        index.push(key);
      }

      const overflow = index.length > DURABLE_UI_LIMIT ? index.splice(0, index.length - DURABLE_UI_LIMIT) : [];
      for (const oldKey of overflow) {
        await db.runAsync('DELETE FROM _meta WHERE key=?', [PREFIX + oldKey]);
      }
      await db.runAsync(
        `INSERT INTO _meta(key,value) VALUES(?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        [INDEX_KEY, JSON.stringify(index)]
      );
    });
  })()
    .catch((error) => {
      // Une écriture de contexte UI ne doit jamais bloquer une visite.
      for (const key of keys) dirty.add(key);
      throw error;
    })
    .finally(() => {
      flushPromise = null;
      if (dirty.size) scheduleFlush();
    });

  return flushPromise;
}

export async function forgetNavigationState(key) {
  const id = keyOf(key);
  if (!id) return;
  states.delete(id);
  hydrated.delete(id);
  dirty.delete(id);
  try {
    const db = await openDbLazy();
    await db.runAsync('DELETE FROM _meta WHERE key=?', [PREFIX + id]);
  } catch {}
}

// Compatibilité avec les appels existants.
export const forgetNavigationScrollOffset = forgetNavigationState;

ensureBackgroundFlush();
