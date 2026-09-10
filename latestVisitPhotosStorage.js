import * as FileSystem from 'expo-file-system';
import { downloadProtectedPhoto, fetchClientLatestVisitPhotosManifest } from './symfonyApi.js';
import {
  cacheLatestVisitPhotosManifest,
  flattenLatestVisitPhotos,
  getCachedLatestVisitPhotosManifest,
  markLatestVisitPhotoDownloaded,
  markLatestVisitPhotoError,
  markLatestVisitPhotoMissingLocally,
} from './latestVisitPhotosDb.js';

const ROOT_DIRECTORY = 'visite-technique/intranet-photos/';
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_RATE_LIMIT_RETRIES = 2;

function safeSegment(value, fallback) {
  const result = String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '')
    .slice(0, 80);
  return result || fallback;
}

function extensionFor(photo) {
  const mime = String(photo?.typeMime || '').toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.jpg';
}

function headerValue(headers, name) {
  const expected = String(name).toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => String(key).toLowerCase() === expected);
  return entry?.[1] == null ? null : String(entry[1]);
}

function retryAfterMilliseconds(value) {
  if (value == null || value === '') return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(300000, seconds * 1000));
  const at = new Date(String(value)).getTime();
  return Number.isFinite(at) ? Math.max(0, Math.min(300000, at - Date.now())) : 1000;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

function validatedDownloadPath(remoteClientId, photo) {
  const path = String(photo?.cheminTelechargement || '');
  const match = path.match(/^\/api\/clients\/([^/?#]+)\/dernieres-visites\/photos\/([^/?#]+)$/);
  let pathClientId = null;
  let pathPhotoId = null;
  try {
    pathClientId = match ? decodeURIComponent(match[1]) : null;
    pathPhotoId = match ? decodeURIComponent(match[2]) : null;
  } catch {}
  if (!match || String(pathClientId) !== String(remoteClientId) || String(pathPhotoId) !== String(photo?.id)) {
    throw new Error('Le chemin reçu ne correspond pas au client et à la photo du manifeste.');
  }
  return path;
}

async function ensureDestination(photo, remoteClientId) {
  if (!FileSystem.documentDirectory) throw new Error('Stockage privé Android indisponible.');
  const directory = `${FileSystem.documentDirectory}${ROOT_DIRECTORY}${safeSegment(remoteClientId, 'client')}/${safeSegment(photo.site?.id, 'site')}/${safeSegment(photo.local?.id, 'local')}/${safeSegment(photo.derniereVisite?.id, 'visite')}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const filename = `${safeSegment(photo.id, 'photo')}${extensionFor(photo)}`;
  return { finalUri: `${directory}${filename}`, temporaryUri: `${directory}.${filename}.part` };
}

async function existingLocalPhoto(photo) {
  if (!photo?.localUri) return false;
  try {
    const info = await FileSystem.getInfoAsync(photo.localUri);
    return Boolean(info?.exists && Number(info.size || photo.downloadedBytes || 0) > 0);
  } catch { return false; }
}

export async function hydrateLatestVisitPhotosCache(remoteClientId, manifest = null) {
  const hydrated = manifest || await getCachedLatestVisitPhotosManifest(remoteClientId);
  if (!hydrated) return null;
  const photos = flattenLatestVisitPhotos(hydrated);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, Math.max(1, photos.length)) }, async () => {
    while (cursor < photos.length) {
      const photo = photos[cursor]; cursor += 1;
      photo.localAvailable = await existingLocalPhoto(photo);
      if (photo.localUri && !photo.localAvailable) {
        photo.localUri = null;
        photo.downloadStatus = photo.disponible ? 'pending' : 'unavailable';
        await markLatestVisitPhotoMissingLocally(remoteClientId, photo.id);
      }
    }
  });
  await Promise.all(workers);
  hydrated.localPhotoCount = photos.filter((photo) => photo.localAvailable).length;
  hydrated.missingDownloadCount = photos.filter((photo) => photo.disponible && !photo.localAvailable).length;
  hydrated.unavailablePhotoCount = photos.filter((photo) => !photo.disponible && !photo.localAvailable).length;
  return hydrated;
}

export async function loadCachedLatestVisitPhotos(remoteClientId) {
  return hydrateLatestVisitPhotosCache(remoteClientId);
}

export async function syncLatestVisitPhotosManifest(remoteClientId) {
  const payload = await fetchClientLatestVisitPhotosManifest(remoteClientId);
  const manifest = await cacheLatestVisitPhotosManifest(remoteClientId, payload);
  return hydrateLatestVisitPhotosCache(remoteClientId, manifest);
}

async function downloadOne(remoteClientId, photo, rateLimit) {
  if (await existingLocalPhoto(photo)) {
    photo.localAvailable = true;
    return { status: 'cached', photo };
  }
  if (!photo.disponible || !photo.cheminTelechargement) return { status: 'unavailable', photo };

  const { finalUri, temporaryUri } = await ensureDestination(photo, remoteClientId);
  let retryCount = 0;
  while (true) {
    const gateDelay = rateLimit.until - Date.now();
    if (gateDelay > 0) await wait(gateDelay);
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
    try {
      const result = await downloadProtectedPhoto(validatedDownloadPath(remoteClientId, photo), temporaryUri);
      const contentType = headerValue(result.headers, 'content-type') || result.mimeType;
      if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
        throw new Error('Le serveur n’a pas renvoyé une image valide.');
      }
      const receivedMime = contentType.split(';')[0].trim().toLowerCase();
      const expectedMime = String(photo.typeMime || '').trim().toLowerCase();
      if (expectedMime && receivedMime !== expectedMime) {
        throw new Error(`Type d’image inattendu (${receivedMime}).`);
      }
      const info = await FileSystem.getInfoAsync(temporaryUri);
      if (!info?.exists || Number(info.size || 0) <= 0) throw new Error('Le fichier téléchargé est vide.');
      const expectedSize = Number(photo.tailleOctets || 0);
      if (expectedSize > 0 && Number(info.size) !== expectedSize) {
        throw new Error('La taille de la photo téléchargée ne correspond pas au manifeste.');
      }
      await FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
      await FileSystem.moveAsync({ from: temporaryUri, to: finalUri });
      await markLatestVisitPhotoDownloaded(remoteClientId, photo.id, finalUri, info.size);
      photo.localUri = finalUri;
      photo.localAvailable = true;
      photo.downloadStatus = 'downloaded';
      photo.downloadError = null;
      return { status: 'downloaded', photo };
    } catch (error) {
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
      if (error?.status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
        retryCount += 1;
        rateLimit.until = Math.max(rateLimit.until, Date.now() + retryAfterMilliseconds(error.retryAfter));
        continue;
      }
      await markLatestVisitPhotoError(remoteClientId, photo.id, error);
      photo.downloadStatus = 'error';
      photo.downloadError = String(error?.message || error);
      return { status: 'error', photo, error };
    }
  }
}

export async function downloadClientLatestVisitPhotos(remoteClientId, manifest, onProgress = null) {
  const candidates = flattenLatestVisitPhotos(manifest).filter((photo) => photo.disponible && !photo.localAvailable);
  const summary = { total: candidates.length, completed: 0, downloaded: 0, cached: 0, failed: 0, errors: [] };
  const rateLimit = { until: 0 };
  let cursor = 0;
  const notify = (photo = null) => onProgress?.({ ...summary, currentPhoto: photo });
  notify();

  const worker = async () => {
    while (cursor < candidates.length) {
      const photo = candidates[cursor]; cursor += 1;
      const result = await downloadOne(remoteClientId, photo, rateLimit);
      summary.completed += 1;
      if (result.status === 'downloaded') summary.downloaded += 1;
      else if (result.status === 'cached') summary.cached += 1;
      else if (result.status === 'error') {
        summary.failed += 1;
        summary.errors.push({ photoId: photo.id, message: String(result.error?.message || result.error) });
      }
      notify(photo);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_DOWNLOADS, Math.max(1, candidates.length)) }, worker));
  // Recharge depuis SQLite pour fournir de nouvelles références React et faire
  // apparaître immédiatement les miniatures qui viennent d'être téléchargées.
  return { ...summary, manifest: await hydrateLatestVisitPhotosCache(remoteClientId) };
}

export { MAX_CONCURRENT_DOWNLOADS };
