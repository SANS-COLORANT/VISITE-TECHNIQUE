'use strict';
// Exercise METRA's actual JS photo-row classification on synthetic payloads.
// This test never reads customer photos or calls the production Intranet.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'intranetVisitPhotoOutboxDb.js'), 'utf8');
const start = source.indexOf('async function sendPhotoRow(db, row) {');
const between = source.indexOf('\nfunction shouldPause(results) {', start);
const stop = source.indexOf('\nexport async function processVisitPhotoOutbox(', between);
assert.ok(start >= 0 && between > start && stop > between, 'Production photo functions must exist');
const photoSource = source.slice(start, stop);
assert.match(photoSource, /LOCAL_PHOTO_ERRORS\.has\(String\(error\?\.code/);
assert.match(source, /status='validation_error' AND error_code IN/);
assert.match(source, /\[String\(visiteId\), \.\.\.localCodes\]/);
assert.ok(source.includes('envoiPhotoId: String(row.envoi_photo_id)'));

const local = new Set([
  'photo_missing', 'photo_too_large', 'photo_local_missing',
  'photo_local_empty', 'photo_local_too_large', 'photo_local_invalid_uri',
  'photo_local_permission_denied', 'photo_upload_invalid_metadata',
  'secure_photo_upload_missing',
]);
const row = {
  photo_id: 'photo-local-1', visite_id: 'visit-1', envoi_photo_id: 'frozen-uuid-1',
  remote_client_id: 'client-1', remote_visit_id: '123', uri: 'file:///private/photo.jpg',
  description: 'Photo de test', ordre: 1, grand_format: 0,
  categorie_id: null, sous_categorie_id: null, critere_id: null, attempt_count: 0,
};
const statuses = [];
let failure = null;
const deps = {
  FileSystem: { getInfoAsync: async () => ({ exists: true, size: 52 }) },
  MAX_PHOTO_BYTES: 10 * 1024 * 1024,
  LOCAL_AUTH_ERRORS: new Set(['reactivation_required', 'dpop_key_missing', 'invalid_grant']),
  LOCAL_PHOTO_ERRORS: local,
  RETRYABLE_HTTP: new Set([500, 502, 503, 504]),
  notify() {},
  photoFile() { return { name: 'photo.jpg', type: 'image/jpeg' }; },
  uploadProtectedVisitPhoto: async (_path, fields, _file) => {
    assert.equal(fields.envoiPhotoId, row.envoi_photo_id);
    if (failure) throw failure;
    return { envoiPhotoId: row.envoi_photo_id, rejoue: false, photo: { id: 'remote-photo-1', visiteId: row.remote_visit_id } };
  },
  markRetry: async (_db, _row, error) => statuses.push(['retry', error.code]),
  markTerminal: async (_db, _row, state, error) => statuses.push([state, error.code]),
  retryAfterMs: () => 60000,
  exponentialRetry: () => 15000,
};
const factory = new Function('deps', `
  const {FileSystem, MAX_PHOTO_BYTES, LOCAL_AUTH_ERRORS, LOCAL_PHOTO_ERRORS, RETRYABLE_HTTP,
    notify, photoFile, uploadProtectedVisitPhoto, markRetry, markTerminal,
    retryAfterMs, exponentialRetry} = deps;
  ${photoSource}
  return { sendPhotoRow, shouldPause };
`);
const { sendPhotoRow, shouldPause } = factory(deps);
const db = {
  getFirstAsync: async () => ({ inclure_export: 1 }),
  runAsync: async (sql) => { assert.ok(sql.includes('api_visit_photo_outbox')); return { changes: 1 }; },
};
(async () => {
  let checks = 0;
  for (const code of local) {
    statuses.length = 0;
    failure = Object.assign(new Error('synthetic local photo error'), { code });
    const result = await sendPhotoRow(db, row);
    assert.equal(result.status, 'error');
    assert.deepEqual(statuses, [['validation_error', code]]);
    assert.equal(shouldPause([result]), false, code + ' must not stop the next photo');
    checks += 1;
  }
  for (const [code, expected, pause, status] of [
    ['METRA_INTRANET_NETWORK_ERROR', 'retry', true, 0],
    ['server_busy', 'retry', true, 503],
    ['http_redirect_blocked', 'rejected', false, 307],
    ['invalid_photo_ack', 'rejected', false, 0],
    ['session_expired', 'auth_error', true, 401],
  ]) {
    statuses.length = 0;
    failure = Object.assign(new Error('synthetic transport error'), { code, status });
    const result = await sendPhotoRow(db, row);
    assert.equal(result.status, 'error');
    assert.deepEqual(statuses, [[expected, code]]);
    assert.equal(shouldPause([result]), pause);
    checks += 1;
  }
  statuses.length = 0;
  failure = null;
  const ok = await sendPhotoRow(db, row);
  assert.equal(ok.status, 'synced');
  assert.equal(statuses.length, 0);
  checks++;
  console.log('ASTRA24 photo outbox classification PASS:', checks, 'synthetic cases on production sendPhotoRow/shouldPause');
})().catch((error) => { console.error(error); process.exitCode = 1; });
