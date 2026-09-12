const assert = require('node:assert/strict');
const { test } = require('node:test');
const { IDS, validateSceneConfig, timelineFor, layerTransform, initialLoadState, reduceLoadState, getHomeLayout } =
  require('../../visual-packs/spiral-active/homeSceneModel.js');
const config = {
  mode: 'four-independent-buildings', canvas: [1024, 540], entryDurationMs: 900,
  motion: { type: 'converge', travelFactor: 0.46, verticalOffsetPx: 14 },
  layers: IDS.map((id, i) => ({ id, side: i < 2 ? 'left' : 'right', depth: i + 1, introStart: i * .1, introEnd: .55 + i * .15 })),
};
const sources = Object.fromEntries(IDS.map((id, i) => [id, i + 1]));

test('valid scene and distinct expected identities', () => {
  assert.deepEqual(validateSceneConfig(config, sources), []);
  for (const id of IDS) assert.ok(validateSceneConfig(config, { ...sources, [id]: null }).length);
});
test('bad mode/canvas/timing/depth/side fail closed', () => {
  for (const key of ['mode', 'canvas', 'motion', 'layers', 'entryDurationMs'])
    assert.ok(validateSceneConfig({ ...config, [key]: null }, sources).length);
  for (const patch of [{ introEnd: 2 }, { introStart: .8, introEnd: .3 }, { depth: 9 }, { side: 'right' }, { id: IDS[1] }]) {
    assert.ok(validateSceneConfig({ ...config, layers: [{ ...config.layers[0], ...patch }, ...config.layers.slice(1)] }, sources).length);
  }
});
test('only four successful distinct decodes reveal the scene', () => {
  let state = initialLoadState();
  IDS.forEach((id, i) => { state = reduceLoadState(state, { type: 'loaded', id }); assert.equal(state.phase, i === 3 ? 'ready' : 'loading'); });
  assert.equal(reduceLoadState(state, { type: 'timeout' }), state);
});
test('duplicates and unknown callbacks cannot count as four images', () => {
  let state = initialLoadState();
  for (let i = 0; i < 8; i++) state = reduceLoadState(state, { type: 'loaded', id: IDS[3] });
  state = reduceLoadState(state, { type: 'loaded', id: 'unknown' });
  assert.equal(state.phase, 'loading'); assert.equal(state.loaded.length, 1);
});
test('each corrupt layer and late onLoad remain blocked until explicit remount/reset', () => {
  IDS.forEach(id => {
    let state = reduceLoadState(initialLoadState(), { type: 'error', id });
    for (const other of IDS) state = reduceLoadState(state, { type: 'loaded', id: other });
    assert.equal(state.phase, 'error'); assert.deepEqual(state.failed, [id]);
    assert.equal(reduceLoadState(state, { type: 'reset' }).phase, 'loading');
  });
});
test('timeout reports exactly the missing layers and never accepts late events', () => {
  let state = reduceLoadState(initialLoadState(), { type: 'loaded', id: IDS[3] });
  state = reduceLoadState(state, { type: 'timeout' });
  assert.deepEqual(state.failed, IDS.slice(0, 3));
  assert.equal(reduceLoadState(state, { type: 'loaded', id: IDS[0] }), state);
});
test('animation keyframes have strictly increasing endpoints, including zero and one', () => {
  for (const layer of config.layers) {
    const timeline = timelineFor(layer);
    assert.equal(timeline.inputRange[0], 0); assert.equal(timeline.inputRange.at(-1), 1);
    timeline.inputRange.slice(1).forEach((n, i) => assert.ok(n > timeline.inputRange[i]));
  }
});
test('four independent paths converge to exact neutral transforms without endpoint drift', () => {
  for (const width of [320, 384, 600, 800, 1024, 1180]) for (const layer of config.layers) {
    const from = layerTransform(layer, config, width, 0);
    assert.equal(Math.sign(from.translateX), layer.side === 'left' ? -1 : 1);
    const halfway = layerTransform(layer, config, width, .5);
    assert.ok(Math.abs(halfway.translateX) < Math.abs(from.translateX));
    const end = layerTransform(layer, config, width, 1);
    assert.ok(end.translateX === 0 && end.translateY === 0 && end.scale === 1);
  }
});
test('responsive geometry: 240 viewport/font-size combinations stay within parent width', () => {
  let count = 0;
  for (const width of [280, 320, 360, 384, 411, 600, 720, 800, 1024, 1366])
    for (const height of [320, 480, 720, 960, 1280, 1536]) for (const fontScale of [1, 1.3, 1.6, 2]) {
      const layout = getHomeLayout({ width, height, fontScale }); count++;
      assert.ok(layout.contentWidth <= width);
      assert.ok(layout.sectorWidth > 0);
      assert.ok(layout.sceneFrame.left >= 0);
      assert.ok(layout.sceneFrame.left + layout.sceneFrame.width <= width);
      assert.ok(Math.abs(layout.sceneFrame.width / layout.sceneFrame.height - 1024 / 540) < 1e-9);
      assert.ok(layout.contentTop >= 0 && layout.contentTop < layout.sceneFrame.top + layout.sceneFrame.height);
      assert.ok(layout.dockClearance >= 121 + 20 + 24);
    }
  assert.equal(count, 240);
});
test('small logical screen uses two sectors and stacked actions rather than truncation', () => {
  const layout = getHomeLayout({ width: 384, height: 780 });
  assert.equal(layout.sectorColumns, 2); assert.equal(layout.secondaryColumns, 1);
  assert.ok(layout.contentTop < 405);
});
test('wide tablet has four sectors and side-by-side actions', () => {
  const layout = getHomeLayout({ width: 1024, height: 768 });
  assert.equal(layout.sectorColumns, 4); assert.equal(layout.secondaryColumns, 2);
});
test('accessibility increases space by reducing columns, not by shrinking text', () => {
  const normal = getHomeLayout({ width: 800, height: 1280, fontScale: 1 });
  const large = getHomeLayout({ width: 800, height: 1280, fontScale: 2 });
  assert.ok(large.sectorColumns < normal.sectorColumns);
  assert.ok(large.headerHeight > normal.headerHeight);
});
test('short landscape keeps actions in the initial visible region', () => {
  for (const [width, height] of [[1024, 400], [800, 360], [1366, 600]]) {
    const layout = getHomeLayout({ width, height });
    assert.ok(layout.contentTop < layout.bodyHeight * .6);
  }
});
test('invalid measurements have a finite fallback until onLayout arrives', () => {
  const layout = getHomeLayout({ width: NaN, height: -1, fontScale: Infinity });
  assert.ok(Number.isFinite(layout.contentWidth) && layout.contentWidth > 0);
});
test('runtime wiring keeps load/error handling, measured flow, and no title ellipsis', () => {
  const fs = require('fs'), path = require('path');
  const pack = path.resolve(__dirname, '../../visual-packs/spiral-active');
  const scene = fs.readFileSync(path.join(pack, 'HomeBuildingScene.js'), 'utf8');
  const home = fs.readFileSync(path.join(pack, 'SpiralActiveHome.js'), 'utf8');
  for (const value of ['onLoad=', 'onError=', 'reduceLoadState', 'reduceMotionChanged', 'animation.stop()', 'zIndex: 10'])
    assert.ok(scene.includes(value), value);
  for (const value of ['onLayout={measure}', 'getHomeLayout', 'layout.contentTop', 'layout.dockClearance', 'removeClippedSubviews={false}'])
    assert.ok(home.includes(value), value);
  assert.ok(!home.includes('numberOfLines=') && !home.includes('adjustsFontSizeToFit'));
  assert.ok(!scene.includes('home-composite.webp') && !scene.includes('resizeMode="cover"'));
});
