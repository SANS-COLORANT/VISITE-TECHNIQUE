// Android legacy guard: FlashList v2 requires Fabric (New Architecture).
// Run before signing every Google Play bundle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const project = path.resolve(__dirname, '..', '..');
const source = (name) => fs.readFileSync(path.join(project,name),'utf8');

test('Play remains on legacy Android architecture', () => {
  const app = JSON.parse(source('app.json'));
  assert.equal(app.expo.newArchEnabled,false);
  assert.equal(app.expo.android.package,'com.visitetechnique.tablet');
});

test('FlashList v2 cannot be rendered on legacy: FastList uses native FlatList', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.dependencies['@shopify/flash-list'].startsWith('2.'),true);
  const code = source('FastList.js');
  assert.match(code,/import \{ FlatList \} from 'react-native'/);
  assert.doesNotMatch(code,/import .*FlashList.*from/);
  assert.doesNotMatch(code,/<FlashList/);
  assert.match(code,/<FlatList/);
  assert.match(code,/columnWrapperStyle=\{numColumns > 1 \? columnWrapperStyle : undefined\}/);
});

test('Equipment settings opens guarded catalog with asynchronous query errors surfaced', () => {
  const settings = source('ParametresScreen.js');
  const catalogue = source('EquipmentCatalogueBrowser.js');
  assert.match(settings, /function EquipmentCatalogueBrowser\(props\)/);
  assert.match(catalogue, /<FastList/);
  assert.match(catalogue, /setCatalogueError\(String\(error\?\.message \|\| error\)\)/);
  assert.match(catalogue, /Réessayer sans supprimer les données/);
});
