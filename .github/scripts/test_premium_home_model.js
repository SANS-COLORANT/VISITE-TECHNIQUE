const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  BUILDING_IDS, FOLIAGE_IDS, SCENE_IDS, validateSceneConfig, timelineFor,
  layerTransform, foliageTransform, initialLoadState, reduceLoadState, getHomeLayout,
} = require('../../visual-packs/spiral-active/homeSceneModel.js');

const config = {
  mode: 'layered-architectural-home', canvas: [1280, 2048], entryDurationMs: 1450,
  returnDurationMs: 420, startupDelayMs: 3100,
  motion: { type: 'converge', travelFactor: 0.085, verticalOffsetPx: 12, foliageRisePx: 24 },
  background: { id: 'background', depth: 0, introStart: 0, introEnd: .18 },
  layers: BUILDING_IDS.map((id, i) => ({ id, side: ['left', 'left', 'center', 'right'][i], depth: 10 + i, introStart: .06 + i * .06, introEnd: .5 + i * .08 })),
  foliage: FOLIAGE_IDS.map((id, i) => ({ id, depth: 30 + i, introStart: .4 + i * .12, introEnd: .76 + i * .12 })),
};
const sources = Object.fromEntries(SCENE_IDS.map((id, i) => [id, i + 1]));

test('valid layered scene and all expected identities', () => {
  assert.deepEqual(validateSceneConfig(config, sources), []);
  for (const id of SCENE_IDS) assert.ok(validateSceneConfig(config, { ...sources, [id]: null }).length);
});

test('bad mode/canvas/timing/motion fail closed', () => {
  for (const key of ['mode', 'canvas', 'motion', 'layers', 'foliage', 'entryDurationMs', 'returnDurationMs', 'startupDelayMs'])
    assert.ok(validateSceneConfig({ ...config, [key]: null }, sources).length);
});

test('all eight successful distinct decodes reveal the scene', () => {
  let state = initialLoadState();
  SCENE_IDS.forEach((id, i) => {
    state = reduceLoadState(state, { type: 'loaded', id });
    assert.equal(state.phase, i === SCENE_IDS.length - 1 ? 'ready' : 'loading');
  });
});

test('duplicate and unknown callbacks cannot fake readiness', () => {
  let state = initialLoadState();
  for (let i = 0; i < 8; i++) state = reduceLoadState(state, { type: 'loaded', id: 'building' });
  state = reduceLoadState(state, { type: 'loaded', id: 'unknown' });
  assert.equal(state.phase, 'loading'); assert.equal(state.loaded.length, 1);
});

test('timeout reports exactly missing layers', () => {
  let state = reduceLoadState(initialLoadState(), { type: 'loaded', id: 'background' });
  state = reduceLoadState(state, { type: 'timeout' });
  assert.deepEqual(state.failed, SCENE_IDS.slice(1));
});

test('all timelines have strict endpoints', () => {
  for (const layer of [config.background, ...config.layers, ...config.foliage]) {
    const timeline = timelineFor(layer);
    assert.equal(timeline.inputRange[0], 0); assert.equal(timeline.inputRange.at(-1), 1);
    timeline.inputRange.slice(1).forEach((n, i) => assert.ok(n > timeline.inputRange[i]));
  }
});

test('building and foliage motion converge exactly to neutral', () => {
  for (const width of [320, 600, 800, 1024]) for (const layer of config.layers) {
    const start = layerTransform(layer, config, width, 0), end = layerTransform(layer, config, width, 1);
    if (layer.side === 'left') assert.ok(start.translateX < 0);
    if (layer.side === 'right') assert.ok(start.translateX > 0);
    if (layer.side === 'center') assert.equal(start.translateX, 0);
    assert.equal(Math.abs(end.translateX), 0); assert.equal(end.translateY, 0); assert.equal(end.scale, 1);
  }
  for (const layer of config.foliage) {
    const start = foliageTransform(layer, config, 0), end = foliageTransform(layer, config, 1);
    assert.ok(start.translateY > 0 && start.scale > 1);
    assert.deepEqual(end, { translateY: 0, scale: 1 });
  }
});

test('responsive layout keeps scene registered to viewport and controls inside width', () => {
  for (const width of [320, 384, 600, 800, 1024, 1366]) for (const height of [480, 720, 960, 1280, 1536]) {
    const layout = getHomeLayout({ width, height, fontScale: 1 });
    assert.equal(layout.sceneFrame.left, 0); assert.equal(layout.sceneFrame.top, 0);
    assert.equal(layout.sceneFrame.width, width);
    assert.equal(layout.sceneFrame.height, height);
    assert.ok(layout.contentWidth <= width && layout.contentTop >= 0);
    assert.ok(layout.dockClearance >= 165);
  }
});

test('settled startup handoff paints the final scene immediately', () => {
  const fs = require('fs'), path = require('path');
  const scene = fs.readFileSync(path.resolve(__dirname, '../../visual-packs/spiral-active/HomeBuildingScene.js'), 'utf8');
  const home = fs.readFileSync(path.resolve(__dirname, '../../visual-packs/spiral-active/SpiralActiveHome.js'), 'utf8');
  assert.ok(scene.includes("new Animated.Value(mode === 'settled' ? 1 : 0)"));
  assert.ok(scene.includes('paintImmediately || ready ? 1 : 0'));
  assert.ok(home.includes("position: 'absolute', top: 0, left: 0, right: 0"));
  assert.ok(home.includes("backgroundColor: 'transparent'"));
});

test('runtime uses the exact baked outlined assets without recoloring architecture', () => {
  const fs = require('fs'), path = require('path');
  const scene = fs.readFileSync(path.resolve(__dirname, '../../visual-packs/spiral-active/HomeBuildingScene.js'), 'utf8');
  for (const token of ['SceneAsset', '10_foliage_back.webp', '11_foliage_mid.webp', '12_foliage_front.webp'])
    assert.ok(scene.includes(token), token);
  assert.ok(!scene.includes('tintColor'));
  assert.ok(!scene.includes('PremiumOutlinedImage'));
  assert.ok(!scene.includes('home-composite.webp'));
});
