import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { unzip } from 'react-native-zip-archive';
import { getDb } from '../../db.js';

const CLASSIC_MANIFEST = require('../classic/manifest.json');
const DOOM_MANIFEST = require('../doom/manifest.json');
const NOEL_MANIFEST = require('../noel/manifest.json');

const META_KEY = 'active_visual_pack';
const LEGACY_META_KEY = 'app_theme_mode';
const ROOT_URI = `${FileSystem.documentDirectory || ''}visual-packs/`;
const CACHE_ROOT_URI = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}visual-pack-import/`;
const BUILTIN_IDS = new Set(['classic', 'doom', 'noel']);
const EFFECT_TYPES = new Set(['snow', 'sparkles', 'confetti', 'leaves']);
const PRESETS = new Set(['metra-classic', 'metra-doom', 'none']);
const PRESET_DURATIONS = { 'metra-classic': 2300, 'metra-doom': 2600, none: 0 };

const BUILTIN_PACKS = [CLASSIC_MANIFEST, DOOM_MANIFEST, NOEL_MANIFEST].map((manifest) => ({
  ...normalizeManifest(manifest),
  _builtin: true,
  _baseUri: null,
}));

function cleanRelativePath(value) {
  if (!value) return null;
  const path = String(value).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.includes('../') || path.includes('/..')) {
    throw new Error(`Chemin d'asset invalide: ${value}`);
  }
  return path;
}

function normalizePreset(startup) {
  const requested = String(startup?.preset || '').trim();
  if (PRESETS.has(requested)) return requested;

  // Compatibilité silencieuse avec les premiers packs créés avant le nettoyage de l'architecture.
  if (startup?.base === 'doom') return 'metra-doom';
  if (startup?.base === 'none') return 'none';
  return 'metra-classic';
}

function normalizeManifest(manifest, { builtin = false, baseUri = null } = {}) {
  const startup = manifest?.startup || {};
  return {
    ...manifest,
    schemaVersion: Number(manifest?.schemaVersion || 1),
    version: Number(manifest?.version || 1),
    id: String(manifest?.id || '').trim().toLowerCase(),
    name: String(manifest?.name || manifest?.id || '').trim(),
    description: String(manifest?.description || '').trim(),
    colors: {
      main: String(manifest?.colors?.main || '#F26426'),
      dark: String(manifest?.colors?.dark || '#D9531A'),
      light: String(manifest?.colors?.light || '#FFF1EA'),
    },
    startup: {
      ...startup,
      preset: normalizePreset(startup),
      durationMs: Math.max(0, Number(startup?.durationMs || 0)),
    },
    interface: { ...(manifest?.interface || {}) },
    _builtin: builtin,
    _baseUri: baseUri,
  };
}

export function validateVisualPackManifest(rawManifest) {
  const manifest = normalizeManifest(rawManifest);
  if (manifest.schemaVersion !== 1) throw new Error(`Version de manifest non supportée: ${manifest.schemaVersion}`);
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(manifest.id)) throw new Error('Identifiant de pack invalide. Utiliser 2 à 40 caractères: a-z, 0-9, _ ou -.');
  if (!manifest.name) throw new Error('Le nom du pack est obligatoire.');
  if (!Number.isFinite(manifest.version) || manifest.version < 1) throw new Error('La version du pack doit être supérieure ou égale à 1.');

  ['main', 'dark', 'light'].forEach((key) => {
    if (!/^#[0-9A-F]{6}$/i.test(manifest.colors[key])) throw new Error(`Couleur ${key} invalide dans le manifest.`);
  });

  if (rawManifest?.startup?.preset && !PRESETS.has(String(rawManifest.startup.preset))) {
    throw new Error(`Preset de démarrage non supporté: ${rawManifest.startup.preset}`);
  }
  if (manifest.startup.logo) cleanRelativePath(manifest.startup.logo);
  if (manifest.interface.headerLogo) cleanRelativePath(manifest.interface.headerLogo);
  if (manifest.interface.homeBackground) cleanRelativePath(manifest.interface.homeBackground);
  if (manifest.startup.layers !== undefined && !Array.isArray(manifest.startup.layers)) {
    throw new Error('startup.layers doit être une liste.');
  }
  (manifest.startup.layers || []).forEach((layer, index) => {
    if (!layer?.asset) throw new Error(`Asset manquant pour startup.layers[${index}].`);
    cleanRelativePath(layer.asset);
    if (layer.startMs !== undefined && !Number.isFinite(Number(layer.startMs))) throw new Error(`startMs invalide pour startup.layers[${index}].`);
    if (layer.durationMs !== undefined && !Number.isFinite(Number(layer.durationMs))) throw new Error(`durationMs invalide pour startup.layers[${index}].`);
  });

  const effect = manifest.startup.effect;
  if (effect?.type && !EFFECT_TYPES.has(effect.type)) {
    throw new Error(`Effet non supporté: ${effect.type}`);
  }
  return manifest;
}

function normalizeBaseUri(uri) {
  if (!uri) return null;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

async function ensureDirectory(uri) {
  if (!uri) throw new Error('Stockage local indisponible.');
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function pathExists(uri) {
  if (!uri) return false;
  const info = await FileSystem.getInfoAsync(uri);
  return !!info.exists;
}

async function readManifestFromDirectory(directoryUri) {
  const baseUri = normalizeBaseUri(directoryUri);
  const manifestUri = `${baseUri}manifest.json`;
  if (!(await pathExists(manifestUri))) return null;
  const text = await FileSystem.readAsStringAsync(manifestUri);
  const raw = JSON.parse(text);
  const validated = validateVisualPackManifest(raw);
  return normalizeManifest(validated, { builtin: false, baseUri });
}

async function listCustomVisualPacks() {
  if (!ROOT_URI) return [];
  await ensureDirectory(ROOT_URI);
  const names = await FileSystem.readDirectoryAsync(ROOT_URI);
  const packs = [];
  for (const name of names) {
    try {
      const dir = `${ROOT_URI}${name}/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists || !info.isDirectory) continue;
      const pack = await readManifestFromDirectory(dir);
      if (pack && !BUILTIN_IDS.has(pack.id)) packs.push(pack);
    } catch (_) {
      // Un dossier invalide est ignoré : il ne doit jamais bloquer le démarrage de METRA.
    }
  }
  return packs;
}

export function getVisualPacksRootUri() {
  return ROOT_URI;
}

export async function listVisualPacks() {
  const custom = await listCustomVisualPacks();
  return [...BUILTIN_PACKS.map((pack) => ({ ...pack })), ...custom].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function getVisualPackById(id) {
  const wanted = String(id || '').trim().toLowerCase();
  const builtin = BUILTIN_PACKS.find((pack) => pack.id === wanted);
  if (builtin) return { ...builtin };
  const custom = await listCustomVisualPacks();
  return custom.find((pack) => pack.id === wanted) || null;
}

async function persistActiveVisualPack(db, packId) {
  await db.runAsync(
    `INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [META_KEY, packId]
  );
}

export async function getActiveVisualPack() {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = ?`, [META_KEY]);
  if (row?.value) {
    const stored = await getVisualPackById(row.value);
    if (stored) return stored;
  }

  // Migration unique des anciennes installations classic/animated vers le nouveau système de packs.
  const legacy = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = ?`, [LEGACY_META_KEY]);
  const fallbackId = legacy?.value === 'animated' ? 'doom' : 'classic';
  const fallback = await getVisualPackById(fallbackId);
  if (fallback) await persistActiveVisualPack(db, fallback.id);
  return fallback || getVisualPackById('classic');
}

export async function activateVisualPack(packId) {
  const pack = await getVisualPackById(packId);
  if (!pack) throw new Error('Pack visuel introuvable.');
  const db = await getDb();
  await persistActiveVisualPack(db, pack.id);
  return pack;
}

export function resolveVisualPackAssetUri(pack, relativePath) {
  if (!pack?._baseUri || !relativePath) return null;
  const clean = cleanRelativePath(relativePath);
  return `${normalizeBaseUri(pack._baseUri)}${clean}`;
}

export function getVisualPackStartupDuration(pack) {
  const presetDuration = PRESET_DURATIONS[pack?.startup?.preset] || 0;
  const layerDuration = (Array.isArray(pack?.startup?.layers) ? pack.startup.layers : []).reduce((max, layer) => {
    const end = Math.max(0, Number(layer?.startMs || 0)) + Math.max(0, Number(layer?.durationMs || 0));
    return Math.max(max, end);
  }, 0);
  return Math.max(presetDuration, Number(pack?.startup?.durationMs || 0), layerDuration);
}

async function findImportedPackDirectory(tempRootUri) {
  const rootManifest = `${normalizeBaseUri(tempRootUri)}manifest.json`;
  if (await pathExists(rootManifest)) return normalizeBaseUri(tempRootUri);

  const entries = await FileSystem.readDirectoryAsync(tempRootUri);
  const directories = [];
  for (const entry of entries) {
    const candidate = `${normalizeBaseUri(tempRootUri)}${entry}/`;
    const info = await FileSystem.getInfoAsync(candidate);
    if (info.exists && info.isDirectory) directories.push(candidate);
  }
  if (directories.length === 1 && await pathExists(`${directories[0]}manifest.json`)) return directories[0];
  throw new Error('Le ZIP doit contenir manifest.json à sa racine ou dans un unique dossier de premier niveau.');
}

async function assertDeclaredAssetsExist(pack, directoryUri) {
  const paths = [
    pack.startup?.logo,
    pack.interface?.headerLogo,
    pack.interface?.homeBackground,
    ...(Array.isArray(pack.startup?.layers) ? pack.startup.layers.map((layer) => layer?.asset) : []),
  ].filter(Boolean);
  for (const relativePath of paths) {
    const clean = cleanRelativePath(relativePath);
    if (!(await pathExists(`${normalizeBaseUri(directoryUri)}${clean}`))) {
      throw new Error(`Fichier déclaré introuvable dans le pack: ${clean}`);
    }
  }
}

function nativePath(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

export async function importVisualPackZip() {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;

  await ensureDirectory(ROOT_URI);
  if (await pathExists(CACHE_ROOT_URI)) await FileSystem.deleteAsync(CACHE_ROOT_URI, { idempotent: true });
  await ensureDirectory(CACHE_ROOT_URI);

  try {
    await unzip(nativePath(picked.assets[0].uri), nativePath(CACHE_ROOT_URI));
    const sourceDir = await findImportedPackDirectory(CACHE_ROOT_URI);
    const pack = await readManifestFromDirectory(sourceDir);
    if (!pack) throw new Error('manifest.json absent ou illisible.');
    if (BUILTIN_IDS.has(pack.id)) throw new Error(`L'identifiant ${pack.id} est réservé à un pack intégré.`);
    await assertDeclaredAssetsExist(pack, sourceDir);

    const destination = `${ROOT_URI}${pack.id}/`;
    if (await pathExists(destination)) await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.copyAsync({ from: sourceDir, to: destination });
    return readManifestFromDirectory(destination);
  } finally {
    if (await pathExists(CACHE_ROOT_URI)) await FileSystem.deleteAsync(CACHE_ROOT_URI, { idempotent: true });
  }
}
