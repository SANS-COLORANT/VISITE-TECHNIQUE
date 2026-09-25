const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../entityManagementDb.js'), 'utf8');
const start = source.indexOf('function estPhotoGereeParApplication');
const end = source.indexOf('async function supprimerDonneesVisite', start);
assert.ok(start >= 0 && end > start, 'visit photo cleanup source is available');

async function main() {
  const calls = [];
  const root = 'file:///docs/visite-technique/photos/';
  const FileSystem = {
    documentDirectory: 'file:///docs/',
    deleteAsync: async (uri) => {
      calls.push(`internal:${uri}`);
    }
  };
  const supprimerCopiePhotoDocuments = async (uri) => {
    calls.push(`documents:${uri}`);
  };
  const nettoyer = new Function(
    'FileSystem',
    'supprimerCopiePhotoDocuments',
    `${source.slice(start, end)}\nreturn supprimerFichiersPhotos;`
  )(FileSystem, supprimerCopiePhotoDocuments);

  await nettoyer([`${root}a.jpg`, `${root}a.jpg`, 'file:///outside.jpg']);
  assert.deepEqual(
    calls,
    [`documents:${root}a.jpg`, `internal:${root}a.jpg`],
    'visit deletion cleans each Documents copy before the managed file'
  );
  console.log('Visit photo cleanup: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
