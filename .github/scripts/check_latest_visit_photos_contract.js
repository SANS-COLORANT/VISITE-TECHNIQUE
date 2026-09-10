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
requireText(api, "redirect: 'manual'", 'DPoP redirect protection');
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
requireText(constants, 'DATABASE_SCHEMA_VERSION = 32', 'database schema version');
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
