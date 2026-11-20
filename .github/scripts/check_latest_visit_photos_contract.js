const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const api = read('symfonyApi.js');
requireText(api, '/dernieres-visites/photos', 'manifest endpoint');
requireText(api, "createProof('GET', url, accessToken)", 'fresh DPoP proof per photo request');
// React Native fetch ignores redirect:manual. The secure transport is native.
requireText(api, 'native.secureHistoricalPhotoDownload(url', 'native streamed DPoP photo download');
forbidText(api, 'payload.base64', 'Base64 bridge must not carry photo bytes');
forbidText(api, 'FileSystem.writeAsStringAsync(destinationUri', 'Historical photos must not pass Base64 through JS');
requireText(api, 'secureHttpRequest(method, url, headers, body, format)', 'native DPoP HTTP entrypoint');
forbidText(api, 'await fetch(', 'Intranet must not use fetch polyfill for DPoP');
const dpopNative = read('native/metra-dpop/MetraDpopModule.kt');
requireText(dpopNative, '.followRedirects(false)', 'native no-redirect HTTP');
requireText(dpopNative, '.followSslRedirects(false)', 'native no-redirect HTTPS');
requireText(dpopNative, 'protectedHttpUrl(url)', 'fixed HTTPS Intranet origin');
requireText(dpopNative, 'fun secureHistoricalPhotoDownload(', 'native HTTP-to-file download');
requireText(dpopNative, 'FileOutputStream(file, false)', 'stream into private temporary file');
requireText(dpopNative, 'size > maxBytes', 'streamed photo transfer has byte quota');
requireText(dpopNative, 'result.code in 200..299 && result.code != 200', 'reject HTTP 206 and all other non-200 2xx without writing');
requireText(dpopNative, 'announcedLength >= 0L && size != announcedLength', 'verify known HTTP body length');
requireText(api, 'historical_photo_partial_response', 'JS rejects partial image even if bytesWritten present');
requireText(api, 'response.status !== 200', 'complete historical images require exactly HTTP 200');
requireText(dpopNative, 'file.delete()', 'failed stream must remove its temporary file');
requireText(api, 'invalid_dpop_proof', 'DPoP retry');
requireText(api, 'Retry-After', 'rate limit metadata');

const storage = read('latestVisitPhotosStorage.js');
requireText(storage, 'FileSystem.documentDirectory', 'private application storage');
requireText(storage, 'const MAX_CONCURRENT_DOWNLOADS = 3', 'download concurrency');
requireText(storage, 'error?.status === 429', 'rate limit handling');
requireText(storage, 'error.retryAfter', 'Retry-After delay');
requireText(storage, 'content-type', 'downloaded image MIME validation');
requireText(storage, 'tailleOctets', 'downloaded image size validation');
requireText(storage, 'validatedDownloadPath(remoteClientId, photo)', 'manifest client/photo path validation');
forbidText(storage, 'StorageAccessFramework', 'historical photos must not use shared storage');
forbidText(storage, 'ajouterPhoto(', 'historical photos must not become visit observations');

const database = read('latestVisitPhotosDb.js');
requireText(database, 'api_latest_visit_photo_manifests', 'offline manifest cache');
requireText(database, 'api_latest_visit_photos', 'offline photo metadata cache');
requireText(database, 'manifest_present=0', 'latest manifest reconciliation');
forbidText(database, 'INSERT INTO photos', 'visit photo isolation');

const migration = read('database/migrations/031_latest_visit_photos.js');
requireText(migration, 'version: 31', 'migration version');
requireText(migration, 'download_status', 'download recovery state');
requireText(migration, 'local_uri', 'offline file link');

const screen = read('MetraDirectoryScreen.js');
requireText(screen, 'Charger les photos des dernières visites', 'client action');
requireText(screen, 'ClientLatestVisitPhotosModal', 'gallery wiring');

const modal = read('ClientLatestVisitPhotosModal.js');
requireText(modal, 'volume total', 'pre-download volume summary');
requireText(modal, 'Cache historique séparé', 'historical isolation explanation');
requireText(modal, 'viewerPhoto', 'full-screen viewer');
requireText(modal, 'localAvailable', 'offline thumbnail state');

const constants = read('database/constants.js');
const migrationIndex = read('database/migrations/index.js');
const schemaMatch = constants.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/);
const schemaVersion = Number(schemaMatch?.[1] || 0);
if (!Number.isInteger(schemaVersion) || schemaVersion < 31) throw new Error(`database schema version: invalid ${schemaVersion}`);
requireText(migrationIndex, 'migration031', 'migration registration');

console.log('Latest-visit photo contract validated: explicit manifest preview, DPoP downloads (max 3), private offline cache, retry handling, thumbnails/viewer, and strict separation from new visit observations.');

const access = read('PhotoReferenceAccess.js');
requireText(access, 'ClientLatestVisitPhotosModal', 'contextual gallery');
requireText(read('VisiteScreen.js'), 'PhotoReferenceAccess visiteId={visiteId}', 'visit access');
requireText(read('SiteVisitesScreen.js'), 'PhotoReferenceAccess siteId={siteId}', 'site access');
requireText(screen, 'SitePhotoPreparationOption', 'selected sites preparation');
requireText(read('latestVisitPhotoTasks.js'), 'pausePhotoDownload', 'non-blocking queue');
requireText(database, 'api_visit_photo_references', 'stable visit reference');
requireText(read('ReferencePhotoViewer.js'), 'PanResponder', 'zoom and pan');
forbidText(modal, '!manifest && (syncing || activated)', 'infinite offline loading');
forbidText(modal, 'if (!downloading) onClose', 'blocking download modal');
