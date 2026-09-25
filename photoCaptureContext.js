import * as FileSystem from 'expo-file-system';
import { BoundedLruMap } from './boundedCache.js';
import { getVisite } from './db.js';

const contextCache = new BoundedLruMap(3);
const pending = new Map();

function nettoyerNomFichier(valeur = '', fallback = 'Photo') {
  const propre = String(valeur || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '')
    .slice(0, 70);
  return propre || fallback;
}

function keyOf(visiteId) {
  return String(visiteId || '').trim();
}

async function buildContext(visiteId) {
  const key = keyOf(visiteId);
  if (!key) throw new Error('Visite photo invalide');
  if (!FileSystem.documentDirectory) throw new Error('Stockage local Android indisponible');

  const visite = await getVisite(key);
  const client = nettoyerNomFichier(visite?.nom_client, 'Client');
  const site = nettoyerNomFichier(visite?.nom_site, 'Site');
  const date = nettoyerNomFichier(visite?.date_visite, 'Sans_date');
  const visiteDossier = `${date}__${nettoyerNomFichier(key, 'visite')}`;
  const directory = `${FileSystem.documentDirectory}visite-technique/photos/${client}/${site}/${visiteDossier}/`;

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  return {
    visiteId: key,
    client,
    site,
    siteName: visite?.nom_site || 'Site',
    directory,
    loadedAt: Date.now()
  };
}

export function peekPhotoCaptureContext(visiteId) {
  return contextCache.get(keyOf(visiteId)) || null;
}

export async function prewarmPhotoCaptureContext(visiteId, { force = false } = {}) {
  const key = keyOf(visiteId);
  if (!key) return null;
  if (!force) {
    const cached = contextCache.get(key);
    if (cached) return cached;
    if (pending.has(key)) return pending.get(key);
  }

  const promise = buildContext(key)
    .then((context) => {
      contextCache.set(key, context);
      return context;
    })
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
}

export function forgetPhotoCaptureContext(visiteId) {
  const key = keyOf(visiteId);
  contextCache.delete(key);
  pending.delete(key);
}

export { nettoyerNomFichier };
