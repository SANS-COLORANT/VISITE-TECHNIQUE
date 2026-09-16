const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbid(text, needle, label) {
  if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const preallumage = read('preAllumageStructureDb.js');
need(preallumage, 'chargerSectionsAvecDonnees', 'pre-allumage section snapshot');
need(preallumage, 'SELECT DISTINCT section_code FROM champs_visite', 'pre-allumage batched field scan');
need(preallumage, 'SELECT DISTINCT section_code FROM controles_visite', 'pre-allumage batched control scan');
need(preallumage, 'preparationEnCours', 'pre-allumage concurrent preparation coalescing');
forbid(preallumage, 'async function sectionHasData', 'pre-allumage per-section N+1 scan');
forbid(preallumage, 'async function localHasData', 'pre-allumage per-local N+1 scan');

const prefill = read('visitPrefillDb.js');
need(prefill, 'SELECT section_code,cle,valeur FROM champs_visite', 'prefill previous fields snapshot');
need(prefill, 'const anciensMap = new Map', 'prefill in-memory field lookup');
forbid(prefill, 'SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?', 'prefill SELECT per stable field');

const photos = read('PhotoButton.js');
need(photos, 'PHOTO_SNAPSHOT_TTL_MS', 'shared photo visit snapshot');
need(photos, 'chargerPhotosVisitePartagees', 'photo buttons share one visit query');
need(photos, 'invaliderPhotoSnapshot', 'photo cache invalidation after mutations');
need(photos, 'void copierPhotoDansDocuments', 'secondary Documents copy does not block camera flow');
need(photos, 'resizeMethod="resize"', 'small local photo thumbnail decoding');
forbid(photos, 'const existante = await FileSystem.getInfoAsync(destination)', 'redundant destination stat before unique photo copy');

const photoOutbox = read('intranetVisitPhotoOutboxDb.js');
need(photoOutbox, 'buildPhotoCriterionMap', 'photo criterion mapping built once per visit');
need(photoOutbox, 'mapWithConcurrency(candidates, 8', 'bounded UUID/mapping preparation');
need(photoOutbox, 'await db.withTransactionAsync', 'photo outbox batch insert transaction');
need(photoOutbox, 'AND EXISTS(', 'background photo scheduler skips completed visits');
need(photoOutbox, 'NOT EXISTS(SELECT 1 FROM api_visit_photo_outbox po WHERE po.photo_id=p.id)', 'background unscheduled-photo filter');
need(photoOutbox, 'SELECT p.* FROM photos p', 'queue reads only missing photo candidates');
need(photoOutbox, 'const context = { details, criterionMap, remarkControls }', 'photo mapping context reused for all photos');

const latestPhotos = read('latestVisitPhotosDb.js');
need(latestPhotos, 'current?.payload_json === serializedManifest', 'unchanged remote photo manifest fast path');
need(latestPhotos, "UPDATE api_latest_visit_photo_manifests SET synced_at=datetime('now')", 'unchanged manifest only refreshes timestamp');

const native = read('native/metra-dpop/MetraDpopModule.kt');
need(native, 'fun downloadProtected(', 'native protected downloader remains active');
need(native, 'BufferedInputStream(connection.inputStream', 'remote photos remain native-streamed');

console.log('Global METRA runtime hot-path contract validated: no pre-allumage/prefill query storms, shared local photo reads, idle outbox filtering, reused photo criterion mapping, unchanged-manifest fast path and native binary streaming.');
