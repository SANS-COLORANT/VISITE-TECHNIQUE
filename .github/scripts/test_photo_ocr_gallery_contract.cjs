// Protect the native Android plaque-gallery path against removed companion mode.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const file = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Plaque review never uses deleted companion or broad photo permissions', () => {
  const review = file('PhotoOcrReview.js');
  assert.doesNotMatch(review, /companionData|importCompanionPhoto/);
  assert.doesNotMatch(review, /requestMediaLibraryPermissionsAsync/);
  assert.match(review, /<PhotoButton visiteId=\{visiteId\} entiteKey=\{entiteKey\} label=\{label\} onPhotoSaved=\{lire\}\/>/);
});

test('Plaque gallery shares the durable compressed photo implementation', () => {
  const capture = file('PhotoButton.js');
  const gallery = file('photoGalleryImport.js');
  assert.match(capture, /choisirPhotoDansGalerie/);
  assert.match(capture, /compresserPhotoDeGalerie/);
  assert.match(capture, /onPhotoSaved\?\.\(/);
  assert.match(capture, /ajouterPhoto/);
  assert.match(gallery, /launchImageLibraryAsync/);
  assert.match(gallery, /GALERIE_MAX_OCTETS = 1500000/);
});
