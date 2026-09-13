const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
// Stub ONLY the build-plugin registration functions; runtime sources remain untouched.
const originalLoad = Module._load;
let patchMainApplication;
try {
  Module._load = function (name, ...args) {
    if (name === '@expo/config-plugins') return { withDangerousMod: c => c, withMainApplication: c => c };
    return originalLoad.call(this, name, ...args);
  };
  ({ patchMainApplication } = require('../../plugins/withMetraVelvet.js'));
} finally { Module._load = originalLoad; }

test('velvet package is idempotent and preserves existing DPoP registration', () => {
  const source = 'import android.app.Application\nval packages = PackageList(this).packages.apply { add(MetraDpopPackage()) }';
  const patched = patchMainApplication(source);
  assert.equal(patchMainApplication(patched), patched);
  assert.ok(patched.includes('add(MetraDpopPackage())'));
  assert.equal(patched.split('add(MetraVelvetPackage())').length - 1, 1);
});
test('unknown native template fails closed rather than silently omitting registration', () => {
  assert.throws(() => patchMainApplication('import android.app.Application\nunknown packages'));
  assert.throws(() => patchMainApplication('public class MainApplication {}', 'java'));
});
test('startup completion is driven by native callback, with separate failure escape', () => {
  const app = read('App.js'), startup = read('visual-packs/spiral-active/StartupAnimation.js');
  assert.ok(app.includes("if(pack?.startup?.preset!=='metra-spiral-active')"));
  assert.ok(app.includes('onComplete={()=>setDbReady(true)}'));
  assert.ok(startup.includes("nativeEvent.reason === 'completed'"));
  assert.ok(startup.includes("finish('media-timeout')"));
  assert.ok(startup.includes("finish('interrupted')"));
  assert.ok(startup.includes('completed.current = true'));
});
test('native media uses one pass, real end event, and lifecycle cleanup', () => {
  const native = read('native/metra-velvet/MetraVelvetView.kt');
  for (const value of ['ImageDecoder.decodeDrawable', 'decoded.repeatCount = 0', 'override fun onAnimationEnd',
    'ticket == generation', 'clearAnimationCallbacks()', 'removeLifecycleEventListener(this)', 'Build.VERSION.SDK_INT < 28']) assert.ok(native.includes(value), value);
});
test('rotating dock no longer uses a flat SVG or a clipped final image', () => {
  const dock = read('visual-packs/spiral-active/SpiralActiveDock.js');
  assert.ok(dock.includes('<VelvetArt mode="dock"'));
  assert.ok(!dock.includes('SpiralSvg'));
  assert.ok(dock.includes('transform: [{ rotate }]'));
  assert.ok(dock.includes('onPanResponderRelease'));
});
test('normal app never auto-enables preview pack', () => {
  assert.ok(read('previewBuild.generated.js').includes('PREMIUM_PREVIEW_BUILD = false'));
  assert.ok(read('visual-packs/runtime/visualPackManager.js').includes("if (PREMIUM_PREVIEW_BUILD) return getVisualPackById('spiral-active')"));
});
