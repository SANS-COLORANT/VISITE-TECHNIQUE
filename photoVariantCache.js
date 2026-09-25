import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { BoundedLruMap } from './boundedCache.js';

const ROOT = `${FileSystem.cacheDirectory || ''}metra-photo-variants/`;
const CONFIG = Object.freeze({
  thumb: { width: 320, compress: 0.56, limit: 160 },
  preview: { width: 1280, compress: 0.74, limit: 36 }
});

const memory = new BoundedLruMap(96);
const pending = new Map();
const jobs = [];
let active = 0;
let generatedSincePrune = 0;

function hash(value) {
  let h = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function safeKind(kind) {
  return kind === 'preview' ? 'preview' : 'thumb';
}

async function ensureDir(kind) {
  if (!FileSystem.cacheDirectory) throw new Error('Cache photo Android indisponible');
  const dir = `${ROOT}${safeKind(kind)}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function targetFor(uri, kind) {
  const dir = await ensureDir(kind);
  return `${dir}${hash(uri)}.jpg`;
}

function pump() {
  while (active < 2 && jobs.length) {
    const job = jobs.shift();
    active += 1;
    Promise.resolve()
      .then(job.work)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function enqueue(work) {
  return new Promise((resolve, reject) => {
    jobs.push({ work, resolve, reject });
    pump();
  });
}

async function pruneKind(kind) {
  const cfg = CONFIG[safeKind(kind)];
  const dir = await ensureDir(kind);
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  if (names.length <= cfg.limit) return;

  const entries = await Promise.all(
    names.map(async (name) => {
      const uri = dir + name;
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      return { uri, time: Number(info?.modificationTime || 0) };
    })
  );
  entries.sort((a, b) => a.time - b.time);
  const excess = entries.slice(0, Math.max(0, entries.length - cfg.limit));
  await Promise.allSettled(excess.map((entry) => FileSystem.deleteAsync(entry.uri, { idempotent: true })));
}

async function maybePrune() {
  generatedSincePrune += 1;
  if (generatedSincePrune < 18) return;
  generatedSincePrune = 0;
  await Promise.allSettled([pruneKind('thumb'), pruneKind('preview')]);
}

export async function getPhotoVariant(uri, kind = 'thumb') {
  const source = String(uri || '').trim();
  if (!source) return null;
  if (kind === 'original') return source;

  const resolvedKind = safeKind(kind);
  const key = `${resolvedKind}|${source}`;
  const cached = memory.get(key);
  if (cached) {
    const info = await FileSystem.getInfoAsync(cached).catch(() => null);
    if (info?.exists) return cached;
    memory.delete(key);
  }
  if (pending.has(key)) return pending.get(key);

  const promise = enqueue(async () => {
    const target = await targetFor(source, resolvedKind);
    const existing = await FileSystem.getInfoAsync(target).catch(() => null);
    if (existing?.exists) {
      memory.set(key, target);
      return target;
    }

    const cfg = CONFIG[resolvedKind];
    const result = await ImageManipulator.manipulateAsync(source, [{ resize: { width: cfg.width } }], {
      compress: cfg.compress,
      format: ImageManipulator.SaveFormat.JPEG
    });
    if (!result?.uri) throw new Error('Miniature photo non générée');
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: result.uri, to: target });
    memory.set(key, target);
    maybePrune().catch(() => {});
    return target;
  }).finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
}

export async function preparePhotoVariants(uri) {
  if (!uri) return;
  await Promise.allSettled([getPhotoVariant(uri, 'thumb'), getPhotoVariant(uri, 'preview')]);
}

export async function forgetPhotoVariants(uri) {
  const source = String(uri || '').trim();
  if (!source) return;
  for (const kind of ['thumb', 'preview']) {
    const key = `${kind}|${source}`;
    memory.delete(key);
    try {
      const target = await targetFor(source, kind);
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {}
  }
}

export function photoVariantStats() {
  return { memory: memory.size, pending: pending.size, queued: jobs.length, active };
}
