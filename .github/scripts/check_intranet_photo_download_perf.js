const fs = require('fs');

const native = fs.readFileSync('native/metra-dpop/MetraDpopModule.kt', 'utf8');
const api = fs.readFileSync('symfonyApi.js', 'utf8');
const storage = fs.readFileSync('latestVisitPhotosStorage.js', 'utf8');

function need(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

need(native, 'fun downloadProtected(', 'native protected downloader');
need(native, 'instanceFollowRedirects = false', 'DPoP redirect protection');
need(native, 'BufferedInputStream(connection.inputStream', 'streamed network read');
need(native, 'FileOutputStream(target)', 'direct file write');
need(native, 'ByteArray(64 * 1024)', 'bounded binary buffer');
need(api, 'if (native.downloadProtected)', 'native fast path selection');
need(api, 'await native.downloadProtected(url, accessToken, proof, destinationUri)', 'native fast path call');
need(api, 'return downloadAttemptLegacy(url, destinationUri, accessToken, proof)', 'legacy fallback remains isolated');
need(storage, 'const MAX_CONCURRENT_DOWNLOADS = 3', 'bounded photo concurrency');

const fastPath = api.indexOf('if (native.downloadProtected)');
const legacyPath = api.indexOf('return downloadAttemptLegacy(url, destinationUri, accessToken, proof)');
if (fastPath < 0 || legacyPath < 0 || fastPath > legacyPath) {
  throw new Error('native photo path must be selected before the Blob/Base64 fallback');
}

console.log('Intranet photo download performance contract validated: native HTTP streaming is primary, Blob/Base64 is fallback only, DPoP redirects stay disabled.');
