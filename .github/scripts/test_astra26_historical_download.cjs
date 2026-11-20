'use strict';
// Contract tests on the *production* JS download path with an isolated native
// stub. Does not contact any server or require photos from real clients.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const api = fs.readFileSync(path.join(root, 'symfonyApi.js'), 'utf8');
const kotlin = fs.readFileSync(path.join(root, 'native/metra-dpop/MetraDpopModule.kt'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'latestVisitPhotosStorage.js'), 'utf8');
function part(start, end) {
  const a = api.indexOf(start), b = api.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Cannot extract production function: ' + start);
  return api.slice(a, b);
}
const code = [
  part('async function parseResponse(response)', 'function protectedDownloadUrl(path)'),
  part('function protectedDownloadUrl(path)', 'function secureTransport()'),
  part('function nativeResponse(result)', 'async function downloadAttempt('),
  part('async function downloadAttempt(', 'async function clearLegacyAccessStorage()'),
].join('\n');
const nativeResponses = [];
const invocations = [];
let available = true;
const dependencies = {
  METRA_API_BASE_URL: 'https://intranet-energieetservice.com',
  endpoint: (p) => 'https://intranet-energieetservice.com' + p,
  localAuthError(message, code) { return Object.assign(new Error(message), { code }); },
  createProof: async (method, url) => {
    assert.equal(method, 'GET');
    assert.match(url, /^https:\/\/intranet-energieetservice\.com\/api\/clients\//);
    return 'fictitious-dpop-proof';
  },
  secureTransport() {
    if (!available) return {};
    return { secureHistoricalPhotoDownload: async (...args) => {
      invocations.push(args);
      return nativeResponses.shift();
    } };
  },
};
const factory = new Function('d', 'const {METRA_API_BASE_URL,endpoint,localAuthError,createProof,secureTransport}=d;\n' +
  code + '\nreturn downloadAttempt;');
const download = factory(dependencies);
const remote = '/api/clients/123/dernieres-visites/photos/456';
const dest = 'file:///data/user/0/com.visitetechnique.tablet/files/visite-technique/intranet-photos/test/.photo.jpg.part';
(async () => {
  let checks = 0;
  nativeResponses.push({ status: 200, headers: {'content-type': 'image/jpeg'}, bytesWritten: 654321 });
  const success = await download(remote, dest, 'fictitious-token');
  assert.equal(success.uri, dest);
  assert.equal(success.status, 200);
  assert.equal(success.mimeType, 'image/jpeg');
  assert.equal(invocations[0][2], dest);
  assert.equal(invocations[0][1].DPoP, 'fictitious-dpop-proof');
  assert.equal(invocations[0][1].Authorization, 'DPoP fictitious-token');
  checks++;
  nativeResponses.push({ status: 307, headers: {}, text: '' });
  await assert.rejects(download(remote, dest, 'fictitious-token'), (error) =>
    error.code === 'http_redirect_blocked' && error.retryable === false && error.status === 307);
  checks++;
  nativeResponses.push({ status: 401, headers: {}, text: JSON.stringify({error:'invalid_dpop_proof'}) });
  await assert.rejects(download(remote, dest, 'fictitious-token'), (error) =>
    error.status === 401 && error.code === 'invalid_dpop_proof');
  checks++;
  nativeResponses.push({ status: 429, headers: {'retry-after':'60'}, text: JSON.stringify({error:'rate_limited'}) });
  await assert.rejects(download(remote, dest, 'fictitious-token'), (error) =>
    error.status === 429 && error.retryAfter === '60');
  checks++;
  nativeResponses.push({ status: 200, headers: {'content-type':'image/jpeg'}, bytesWritten: 0 });
  await assert.rejects(download(remote, dest, 'fictitious-token'), /incomplète/);
  checks++;
  await assert.rejects(download('/api/unapproved/photo', dest, 'fictitious-token'), /Chemin de téléchargement/);
  checks++;
  available=false;
  await assert.rejects(download(remote, dest, 'fictitious-token'), (error) =>
    error.code === 'secure_historical_photo_download_missing');
  checks++;
  assert.match(kotlin, /\.followRedirects\(false\)/);
  assert.match(kotlin, /\.followSslRedirects\(false\)/);
  assert.match(kotlin, /FileOutputStream\(file, false\)/);
  assert.match(kotlin, /file\.path\.startsWith\(root\.path \+ File\.separator\)/);
  assert.match(kotlin, /size > maxBytes/);
  assert.doesNotMatch(api, /payload\.base64|writeAsStringAsync\(destinationUri/);
  assert.match(storage, /\.temporaryUri/);
  assert.match(storage, /FileSystem\.deleteAsync\(temporaryUri/);
  assert.match(storage, /FileSystem\.moveAsync\(\{ from: temporaryUri, to: finalUri \}\)/);
  assert.match(storage, /markLatestVisitPhotoDownloaded\(remoteClientId, photo, finalUri/);
  checks++;
  console.log('ASTRA26 streamed historical photos: PASS', checks, 'source and JS request/error scenarios');
})().catch((e) => { console.error(e); process.exitCode=1; });
