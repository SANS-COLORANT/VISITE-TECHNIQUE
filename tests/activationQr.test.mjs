import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActivationCode, createActivationQrGate } from '../activationCode.js';

const code = '0123456789abcdef'.repeat(3); // synthetic test data, never a live code
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('QR format is exact: 48 lowercase hex characters, no normalization', () => {
  assert.equal(isActivationCode(code), true);
  for (const value of [null, undefined, 123, '', code.slice(1), code + '0', code.toUpperCase(), ' ' + code, code + '\n', 'https://example.invalid/' + code, 'g'.repeat(48)]) {
    assert.equal(isActivationCode(value), false);
  }
});

test('invalid QR pauses reading, retry permits valid scan, repeated events are ignored', () => {
  const gate = createActivationQrGate();
  assert.deepEqual(gate.read('not-a-code'), { kind: 'invalid' });
  assert.deepEqual(gate.read(code), { kind: 'ignored' });
  gate.retry();
  assert.deepEqual(gate.read(code), { kind: 'valid', code });
  assert.deepEqual(gate.read(code), { kind: 'ignored' });
  gate.retry();
  assert.deepEqual(gate.read(code), { kind: 'ignored' });
});

test('cancelled reader cannot accept a late event; a fresh reader can', () => {
  const gate = createActivationQrGate();
  gate.close();
  gate.retry();
  assert.deepEqual(gate.read(code), { kind: 'ignored' });
  assert.deepEqual(createActivationQrGate().read(code), { kind: 'valid', code });
});

test('scanner only returns a value; existing confirm action alone calls activation service', () => {
  const scanner = read('ActivationQrScanner.js');
  const screen = read('MetraDirectoryScreen.js');
  const api = read('symfonyApi.js');
  assert.match(scanner, /Camera\.requestCameraPermissionsAsync\(\)/);
  assert.match(scanner, /barcodeTypes: \['qr'\]/);
  assert.match(scanner, /onMountError=/);
  assert.match(scanner, /onRead\(result\.code\)/);
  assert.doesNotMatch(scanner, /activateTablet|fetch\(|console\.|SecureStore/);
  assert.match(screen, /setActivationCode\(value\)/);
  assert.match(screen, /onRead=\{acceptActivationQr\}/);
  assert.match(screen, /onPress=\{activate\}/);
  assert.match(screen, /onRequestClose=\{closeActivation\}/);
  assert.match(screen, /activationInFlightRef\.current = true/);
  assert.match(screen, /e\?\.code === 'invalid_grant'/);
  assert.match(api, /endpoint\('\/api\/tablettes\/activation'\)/);
  assert.match(api, /body: urlEncoded\(\{ code: activationCode \}\)/);
  assert.match(api, /'Content-Type': 'application\/x-www-form-urlencoded'/);
  assert.match(api, /DPoP: proof/);
});

test('native QR dependency is pinned in the lock and does not add audio permission', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const app = JSON.parse(read('app.json'));
  assert.equal(pkg.dependencies['expo-camera'], '~17.0.10');
  assert.equal(lock.packages[''].dependencies['expo-camera'], '~17.0.10');
  assert.equal(lock.packages['node_modules/expo-camera'].version, '17.0.10');
  const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-camera');
  assert.equal(plugin[1].recordAudioAndroid, false);
});
