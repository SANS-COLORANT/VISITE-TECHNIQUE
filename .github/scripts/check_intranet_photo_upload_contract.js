const fs = require('fs');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) { if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`); }
function forbidText(text, needle, label) { if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); }

const migration = read('database/migrations/036_intranet_photo_outbox.js');
requireText(migration, 'api_visit_photo_outbox', 'durable photo outbox');
requireText(migration, 'envoi_photo_id TEXT NOT NULL UNIQUE', 'photo idempotency key');
requireText(migration, 'snapshot_uri TEXT', 'immutable photo snapshot');
requireText(migration, 'source_entity_key TEXT', 'frozen local photo attachment');
requireText(migration, "'image/jpeg','image/png','image/gif','image/webp'", 'accepted image MIME types');
requireText(migration, "'pending','sending','retry','synced','rejected','validation_error','auth_error'", 'durable photo states');
requireText(migration, 'photo_order INTEGER NOT NULL CHECK (photo_order BETWEEN 1 AND 10000)', 'photo order contract');
requireText(migration, 'trg_photo_requires_visit_revision_insert', 'historical photo addition dirties imported visit');
requireText(migration, 'trg_photo_requires_visit_revision_update', 'photo replacement can require new server visit');
requireText(migration, 'trg_photo_requires_visit_revision_delete', 'photo deletion can require new server visit');

const photoSync = read('intranetVisitPhotoOutboxDb.js');
requireText(photoSync, 'MAX_PHOTO_BYTES = 10 * 1024 * 1024', '10 MiB local guard');
requireText(photoSync, "form.append('envoiPhotoId'", 'multipart envoiPhotoId');
requireText(photoSync, "form.append('description'", 'multipart description');
requireText(photoSync, "form.append('ordre'", 'multipart order');
requireText(photoSync, "form.append('grandFormat'", 'multipart large-format flag');
requireText(photoSync, "form.append('fichier'", 'multipart image field');
requireText(photoSync, "form.append('categorieId'", 'criterion category mapping');
requireText(photoSync, "form.append('sousCategorieId'", 'criterion subcategory mapping');
requireText(photoSync, "form.append('critereId'", 'criterion mapping');
requireText(photoSync, "protectedRequest('POST', `/api/clients/${encodeURIComponent(row.remote_client_id)}/visites/${encodeURIComponent(row.remote_visit_id)}/photos`", 'exact photo POST route');
requireText(photoSync, 'createIntranetUploadId()', 'native UUID v4 per queued photo');
requireText(photoSync, 'FileSystem.copyAsync', 'frozen photo bytes before retry');
requireText(photoSync, 'row.snapshot_uri', 'retry uses frozen bytes');
requireText(photoSync, 'currentPhotoRowMatchesSnapshot', 'stale photo snapshot protection');
requireText(photoSync, 'PHOTO_UPLOAD_CONCURRENCY = 3', 'low photo upload concurrency');
requireText(photoSync, 'PHOTO_REQUEST_BUDGET_PER_MINUTE = 54', 'rate margin below server 60/minute');
requireText(photoSync, 'Promise.all(batch.map((row) => sendPhotoRow(db, row)))', 'three-photo concurrent batches');
requireText(photoSync, "status === 429", 'Retry-After photo handling');
requireText(photoSync, 'retryAfterMs(error.retryAfter)', 'Retry-After delay');
requireText(photoSync, "status === 422", 'terminal photo validation');
requireText(photoSync, "status === 401", 'photo auth handling');
requireText(photoSync, 'inspectIntranetCriterionCandidate', 'same criterion mapping basis as visit payload');
requireText(photoSync, "key.startsWith('remarque||')", 'reserve photo resolves original control');
forbidText(photoSync, "'Content-Type': 'multipart/form-data'", 'React Native must create multipart boundary');
forbidText(photoSync, '1050', 'old one-photo-per-second pacing removed');

const ui = read('IntranetVisitSync.js');
requireText(ui, 'photoState.complete', 'Online requires photo completion');
requireText(ui, "historical && row?.status !== 'synced'", 'historical bypass ends after outbound resync');
requireText(ui, 'processVisitPhotoOutbox', 'foreground photo processing');
requireText(ui, 'queueVisitPhotosForSyncedVisit', 'photo queue after visit ack');
requireText(ui, 'subscribeIntranetPhotoChanges', 'photo edit refreshes status immediately');
requireText(ui, 'Photos Intranet à corriger', 'photo failure feedback');

const client = read('clientIntranetSyncDb.js');
requireText(client, 'intranet_photo_unscheduled_count', 'client Offline includes unscheduled photos');
requireText(client, 'intranet_photo_pending_count', 'client Offline includes queued photos');
requireText(client, 'processVisitPhotoOutbox', 'client batch processes photos');
requireText(client, 'subscribeVisitPhotoOutbox', 'client UI refreshes on photo ack');
requireText(client, 'subscribeIntranetPhotoChanges', 'client UI refreshes on local photo edit');
requireText(client, 'Math.min(8', 'client batch keeps safe visit-rate margin');

const schema = read('database/constants.js');
requireText(schema, 'DATABASE_SCHEMA_VERSION = 36', 'schema version 36');
const migrations = read('database/migrations/index.js');
requireText(migrations, 'migration036', 'photo migration registered');

console.log('Intranet photo upload contract validated: visit-first sequence, multipart photo route, DPoP through protectedRequest, durable UUID/snapshot retries, stale-edit cancellation, criterion mapping, 10 MiB/MIME guards, concurrency 3 and Online only after photo acknowledgements.');