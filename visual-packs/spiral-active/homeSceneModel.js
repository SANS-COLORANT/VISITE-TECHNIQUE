/* Pure, dependency-free contract shared by the screen, scene and regression tests.
 * Coordinates are React Native layout units from the parent onLayout, not screenshot pixels.
 */
const IDS = Object.freeze(['haussmann', 'collectif', 'poste-municipal', 'building']);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const positive = (n, fallback) => Number.isFinite(n) && n > 0 ? n : fallback;

function validateSceneConfig(config, sources) {
  const errors = [];
  if (config?.mode !== 'four-independent-buildings') errors.push('Invalid scene mode');
  if (config?.motion?.type !== 'converge') errors.push('Invalid motion type');
  if (!Array.isArray(config?.canvas) || config.canvas.length !== 2 ||
      !config.canvas.every(n => Number.isInteger(n) && n > 0) ||
      config.canvas[0] * config.canvas[1] > 20000000) errors.push('Invalid canvas');
  if (!Number.isFinite(config?.entryDurationMs) || config.entryDurationMs < 1 ||
      config.entryDurationMs > 5000) errors.push('Invalid entry duration');
  if (!Number.isFinite(config?.motion?.travelFactor) || config.motion.travelFactor <= 0 ||
      config.motion.travelFactor > 1) errors.push('Invalid travel factor');
  if (!Number.isFinite(config?.motion?.verticalOffsetPx) || config.motion.verticalOffsetPx < 0 ||
      config.motion.verticalOffsetPx > 100) errors.push('Invalid vertical offset');
  const layers = Array.isArray(config?.layers) ? config.layers : [];
  if (layers.length !== 4) errors.push('Exactly four layers required');
  IDS.forEach((id, i) => {
    const layer = layers[i];
    if (!layer || layer.id !== id || !sources[id]) errors.push(`Missing/invalid layer: ${id}`);
    if (layer?.depth !== i + 1) errors.push(`Invalid depth: ${id}`);
    if (layer?.side !== (i < 2 ? 'left' : 'right')) errors.push(`Invalid side: ${id}`);
    if (!Number.isFinite(layer?.introStart) || !Number.isFinite(layer?.introEnd) ||
        layer.introStart < 0 || layer.introEnd > 1 || layer.introStart >= layer.introEnd) {
      errors.push(`Invalid timeline: ${id}`);
    }
  });
  return errors;
}

function timelineFor(layer) {
  // Never give Animated duplicate endpoints when introStart=0 or introEnd=1.
  const points = [[0, 0], [layer.introStart, 0], [layer.introEnd, 1], [1, 1]];
  const unique = points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0]);
  return { inputRange: unique.map(p => p[0]), outputRange: unique.map(p => p[1]), extrapolate: 'clamp' };
}

function layerTransform(layer, config, width, progress) {
  const p = clamp(progress, 0, 1);
  const remaining = 1 - p;
  return {
    translateX: (layer.side === 'left' ? -1 : 1) * width *
      (config.motion.travelFactor + layer.depth * 0.035) * remaining,
    translateY: (config.motion.verticalOffsetPx + layer.depth * 2) * remaining,
    scale: 1 - (0.04 - layer.depth * 0.003) * remaining,
  };
}

function initialLoadState() {
  return { phase: 'loading', loaded: [], failed: [], reason: null };
}

function reduceLoadState(state, event) {
  if (event.type === 'reset') return initialLoadState();
  // A later successful callback must never erase an error or timeout.
  if (state.phase === 'error') return state;
  if (event.type === 'timeout') {
    if (state.phase === 'ready') return state;
    return { ...state, phase: 'error', failed: IDS.filter(id => !state.loaded.includes(id)), reason: 'timeout' };
  }
  if (!IDS.includes(event.id)) return state;
  if (event.type === 'error') {
    return { ...state, phase: 'error', failed: [event.id], reason: 'decode' };
  }
  if (event.type !== 'loaded' || state.loaded.includes(event.id)) return state;
  const loaded = [...state.loaded, event.id];
  return { ...state, loaded, phase: loaded.length === IDS.length ? 'ready' : 'loading' };
}

function getHomeLayout({ width, height, fontScale = 1, canvas = [1024, 540] }) {
  const w = positive(width, 360);
  const h = positive(height, 640);
  const fs = positive(fontScale, 1);
  const ratio = canvas[0] / canvas[1];
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid layout canvas');
  const margin = w >= 800 ? 28 : 14;
  const contentWidth = Math.max(1, Math.min(w - margin * 2, 900));
  const gap = 10;
  // Conservative minimum widths. Real text remains free to wrap, never ellipsized.
  const minSector = Math.max(144, 62 + 90 * fs);
  const sectorColumns = contentWidth >= minSector * 4 + gap * 3 ? 4 :
    contentWidth >= minSector * 2 + gap ? 2 : 1;
  const secondaryColumns = contentWidth >= Math.max(220, 92 + 128 * fs) * 2 + 12 ? 2 : 1;
  const headerHeight = Math.max(72, 36 + 28 * fs);
  const bodyHeight = Math.max(1, h - headerHeight);
  const maxSceneHeight = Math.max(100, bodyHeight * (h > w ? 0.65 : 0.44));
  const sceneWidth = Math.min(w, 1180, maxSceneHeight * ratio);
  const sceneHeight = sceneWidth / ratio;
  const sceneTop = 6;
  return {
    contentWidth, margin, gap, sectorColumns, secondaryColumns,
    sectorWidth: (contentWidth - gap * (sectorColumns - 1)) / sectorColumns,
    headerHeight,
    bodyHeight,
    sceneFrame: { left: (w - sceneWidth) / 2, top: sceneTop, width: sceneWidth, height: sceneHeight },
    contentTop: sceneTop + sceneHeight * 0.78,
    // Includes the largest existing dock hit area (121 visible + 20 touch + 24 spacing).
    dockClearance: 166,
  };
}

module.exports = { IDS, validateSceneConfig, timelineFor, layerTransform, initialLoadState, reduceLoadState, getHomeLayout };
