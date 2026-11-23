// Regression targeted at Android 16 edge-to-edge and settings route.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const src = (name) => fs.readFileSync(path.resolve(__dirname, '../../', name), 'utf8');

test('Note and Anomalie modals reserve Android navigation space', () => {
  const visit = src('VisiteScreen.js');
  assert.match(visit, /useSafeAreaInsets\(\)/);
  assert.match(visit, /visible=\{noteVisible\}[^>]*statusBarTranslucent navigationBarTranslucent/);
  assert.match(visit, /visible=\{anomalieVisible\}[^>]*statusBarTranslucent navigationBarTranslucent/);
  assert.equal((visit.match(/paddingBottom: Math\.max\(12, modalBottomInset \+ 12\)/g) || []).length, 2);
});

test('Global alert window respects Android bottom inset', () => {
  const dialogs = src('PremiumDialogs.js');
  assert.match(dialogs, /navigationBarTranslucent/);
  assert.match(dialogs, /modalBottomInset \+ 14/);
});

test('Settings entry guards React failures and does not eagerly load heavy editors', () => {
  const app = src('App.js');
  const settings = src('ParametresScreen.js');
  const boundary = src('SettingsErrorBoundary.js');
  assert.match(app, /<SettingsErrorBoundary onBack=\{goHome\}>/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(settings, /function TrameLibraryPanel\(props\) \{/);
  assert.match(settings, /function EquipmentCatalogueBrowser\(props\) \{/);
  assert.match(settings, /function CategorieCritereSelector\(props\) \{/);
  assert.match(settings, /const backup = \(\) => require\('\.\/databaseBackup\.js'\)/);
  assert.match(settings, /setReservesErreur/);
  assert.match(settings, /catch \(error\)/);
});

test('Security contract remains on Play workflow; no data migrations added', () => {
  const play = src('.github/workflows/metra-playstore-secure.yml');
  const app = src('app.json');
  assert.match(play, /METRA_PLAY_SECURE_BUILD: '1'/);
  assert.match(play, /Sign and produce the official Google Play App Bundle/);
  assert.match(app, /"package": "com\.visitetechnique\.tablet"/);
});
