import * as FileSystem from 'expo-file-system';
import { downloadProtectedPhoto, fetchClientLatestVisitPhotosManifest } from './symfonyApi.js';
import {
  cacheLatestVisitPhotosManifest,
  hydratePhotoMetadata,
  flattenLatestVisitPhotos,
  getCachedLatestVisitPhotosManifest,
  markLatestVisitPhotoDownloaded,
  markLatestVisitPhotoError,
  markLatestVisitPhotoMissingLocally,
} from './latestVisitPhotosDb.js';

import { mapLatestVisitPhotos, photoFileKey, photoSummary } from './latestVisitPhotoModel.js';

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
  const revision = [photo.tailleOctets || 0, photo.largeurPixels || 0, photo.hauteurPixels || 0, safeSegment(photo.typeMime, 'image')].join('-');
  const filename = `${safeSegment(photo.id, 'photo')}-${revision}${extensionFor(photo)}`;
  return { finalUri: `${directory}${filename}`, temporaryUri: `${directory}.${filename}.part` };
}

async function existingLocalPhoto(photo) {
  if (!photo?.localUri) return false;
  try {
    const info = await FileSystem.getInfoAsync(photo.localUri);
    const size = Number(info?.size || 0), expected = Number(photo.tailleOctets || photo.downloadedBytes || 0);
    return Boolean(info?.exists && size > 0 && (!expected || expected === size));
  } catch { return false; }
}

export async function hydrateLatestVisitPhotosCache(remoteClientId, manifest = null) {
  const hydrated = manifest ? await hydratePhotoMetadata(remoteClientId, manifest) : await getCachedLatestVisitPhotosManifest(remoteClientId);
  if (!hydrated) return null;
  const photos = flattenLatestVisitPhotos(hydrated), availability = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, photos.length) }, async () => {
    while (cursor < photos.length) {
      const photo = photos[cursor++];
      const localAvailable = await existingLocalPhoto(photo);
      availability.set(photoFileKey(photo), localAvailable);
      if (photo.localUri && !localAvailable) await markLatestVisitPhotoMissingLocally(remoteClientId, photo);
    }
  }));
  const result = mapLatestVisitPhotos(hydrated, (photo) => {
    const localAvailable = Boolean(availability.get(photoFileKey(photo)));
    return { ...photo, localAvailable, localUri: localAvailable ? photo.localUri : null,
      downloadStatus: localAvailable ? 'downloaded' : photo.downloadStatus === 'downloaded' ? (photo.disponible ? 'pending' : 'unavailable') : photo.downloadStatus };
  });
  const summary = photoSummary(result);
  return { ...result, localPhotoCount: summary.saved, missingDownloadCount: summary.missing, unavailablePhotoCount: summary.unavailable };
}

export async function loadCachedLatestVisitPhotos(remoteClientId) {
  return hydrateLatestVisitPhotosCache(remoteClientId);
}

const manifestRequests = new Map();
export async function syncLatestVisitPhotosManifest(remoteClientId) {
  const id = String(remoteClientId);
  if (manifestRequests.has(id)) return manifestRequests.get(id);
  const request = (async () => {
    const payload = await fetchClientLatestVisitPhotosManifest(id);
    const manifest = await cacheLatestVisitPhotosManifest(id, payload);
    return hydrateLatestVisitPhotosCache(id, manifest);
  })();
  manifestRequests.set(id, request);
  try { return await request; } finally { if (manifestRequests.get(id) === request) manifestRequests.delete(id); }
}

async function waitUnlessPaused(milliseconds, control) {
  const until = Date.now() + milliseconds;
  while (!control.paused && Date.now() < until) await wait(Math.min(200, until - Date.now()));
}

async function downloadOne(remoteClientId, photo, rateLimit, control) {
  if (await existingLocalPhoto(photo)) {
    photo.localAvailable = true;
    return { status: 'cached', photo };
  }
  if (!photo.disponible || !photo.cheminTelechargement) return { status: 'unavailable', photo };

  let temporaryUri = null;
  let retryCount = 0;
  while (true) {
    const gateDelay = rateLimit.until - Date.now();
    if (gateDelay > 0) await waitUnlessPaused(gateDelay, control);
    if (control.paused) return { status: 'paused', photo };
    try {
      const destination = await ensureDestination(photo, remoteClientId);
      temporaryUri = destination.temporaryUri;
      const finalUri = destination.finalUri;
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
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
      await markLatestVisitPhotoDownloaded(remoteClientId, photo, finalUri, info.size);
      photo.localUri = finalUri;
      photo.localAvailable = true;
      photo.downloadStatus = 'downloaded';
      photo.downloadError = null;
      return { status: 'downloaded', photo };
    } catch (error) {
      if (temporaryUri) await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
      if (error?.status === 429 && retryCount < MAX_RATE_LIMIT_RETRIES) {
        retryCount += 1;
        rateLimit.until = Math.max(rateLimit.until, Date.now() + retryAfterMilliseconds(error.retryAfter));
        continue;
      }
      await markLatestVisitPhotoError(remoteClientId, photo, error).catch(() => {});
      photo.downloadStatus = 'error';
      photo.downloadError = String(error?.message || error);
      return { status: 'error', photo, error };
    }
  }
}

export async function downloadClientLatestVisitPhotos(remoteClientId, manifest, onProgress = null, control = { paused: false }) {
  manifest = await hydrateLatestVisitPhotosCache(remoteClientId, manifest);
  const candidates = flattenLatestVisitPhotos(manifest).filter((photo) => photo.disponible && !photo.localAvailable);
  const summary = { total: candidates.length, completed: 0, downloaded: 0, cached: 0, failed: 0, errors: [] };
  const expectedBytes = candidates.reduce((n, p) => n + Number(p.tailleOctets || 0), 0);
  let freeBytes = null;
  try { freeBytes = await FileSystem.getFreeDiskStorageAsync(); } catch {}
  if (Number.isFinite(freeBytes) && expectedBytes + 16 * 1024 * 1024 > freeBytes) {
    throw new Error('Espace insuffisant sur la tablette. Libère du stockage ou choisis moins de photos.');
  }
  const rateLimit = { until: 0 };
  let consecutiveErrors = 0;
  let cursor = 0;
  const notify = (photo = null) => onProgress?.({ ...summary, currentPhoto: photo });
  notify();

  const worker = async () => {
    while (!control.paused && cursor < candidates.length) {
      const photo = candidates[cursor]; cursor += 1;
      const result = await downloadOne(remoteClientId, photo, rateLimit, control);
      if (result.status === 'paused') break;
      summary.completed += 1;
      if (result.status === 'downloaded') { summary.downloaded += 1; consecutiveErrors = 0; }
      else if (result.status === 'cached') summary.cached += 1;
      else if (result.status === 'error') {
        summary.failed += 1;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3 || result.error?.status === 401 || result.error?.status === 403) control.paused = true;
        summary.errors.push({ photoId: photo.id, message: String(result.error?.message || result.error) });
      }
      notify(photo);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_DOWNLOADS, Math.max(1, candidates.length)) }, worker));
  // Recharge depuis SQLite pour fournir de nouvelles références React et faire
  // apparaître immédiatement les miniatures qui viennent d'être téléchargées.
  return { ...summary, paused: Boolean(control.paused), manifest: await hydrateLatestVisitPhotosCache(remoteClientId, manifest) };
}

export { MAX_CONCURRENT_DOWNLOADS };
