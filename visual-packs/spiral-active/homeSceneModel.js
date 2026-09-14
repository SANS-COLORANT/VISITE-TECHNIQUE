/* Pure, dependency-free contract shared by the premium home, startup and tests. */
const BUILDING_IDS = Object.freeze(['haussmann', 'collectif', 'poste-municipal', 'building']);
const FOLIAGE_IDS = Object.freeze(['foliage-back', 'foliage-mid', 'foliage-front']);
const SCENE_IDS = Object.freeze(['background', ...BUILDING_IDS, ...FOLIAGE_IDS]);
const IDS = BUILDING_IDS;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const positive = (n, fallback) => Number.isFinite(n) && n > 0 ? n : fallback;

function validTimeline(layer) {
  return Number.isFinite(layer?.introStart) && Number.isFinite(layer?.introEnd) &&
    layer.introStart >= 0 && layer.introEnd <= 1 && layer.introStart < layer.introEnd;
}

function validateSceneConfig(config, sources) {
  const errors = [];
  if (config?.mode !== 'layered-architectural-home') errors.push('Invalid scene mode');
  if (!Array.isArray(config?.canvas) || config.canvas.length !== 2 ||
      !config.canvas.every(n => Number.isInteger(n) && n > 0) ||
      config.canvas[0] * config.canvas[1] > 20000000) errors.push('Invalid canvas');
  if (!Number.isFinite(config?.entryDurationMs) || config.entryDurationMs < 1 || config.entryDurationMs > 5000)
    errors.push('Invalid entry duration');
  if (!Number.isFinite(config?.returnDurationMs) || config.returnDurationMs < 1 || config.returnDurationMs > 1500)
    errors.push('Invalid return duration');
  if (!Number.isFinite(config?.startupDelayMs) || config.startupDelayMs < 0 || config.startupDelayMs > 5000)
    errors.push('Invalid startup delay');
  if (config?.motion?.type !== 'converge') errors.push('Invalid motion type');
  if (!Number.isFinite(config?.motion?.travelFactor) || config.motion.travelFactor < 0 || config.motion.travelFactor > 1)
    errors.push('Invalid travel factor');
  if (!Number.isFinite(config?.motion?.verticalOffsetPx) || config.motion.verticalOffsetPx < 0 || config.motion.verticalOffsetPx > 100)
    errors.push('Invalid vertical offset');
  if (!Number.isFinite(config?.motion?.foliageRisePx) || config.motion.foliageRisePx < 0 || config.motion.foliageRisePx > 160)
    errors.push('Invalid foliage rise');

  if (!config?.background || config.background.id !== 'background' || !sources?.background || !validTimeline(config.background))
    errors.push('Missing/invalid background');

  const buildings = Array.isArray(config?.layers) ? config.layers : [];
  if (buildings.length !== BUILDING_IDS.length) errors.push('Exactly four building layers required');
  BUILDING_IDS.forEach((id, i) => {
    const layer = buildings[i];
    if (!layer || layer.id !== id || !sources?.[id]) errors.push(`Missing/invalid layer: ${id}`);
    if (!['left', 'center', 'right'].includes(layer?.side)) errors.push(`Invalid side: ${id}`);
    if (!Number.isFinite(layer?.depth)) errors.push(`Invalid depth: ${id}`);
    if (!validTimeline(layer)) errors.push(`Invalid timeline: ${id}`);
  });

  const foliage = Array.isArray(config?.foliage) ? config.foliage : [];
  if (foliage.length !== FOLIAGE_IDS.length) errors.push('Exactly three foliage layers required');
  FOLIAGE_IDS.forEach((id, i) => {
    const layer = foliage[i];
    if (!layer || layer.id !== id || !sources?.[id]) errors.push(`Missing/invalid foliage: ${id}`);
    if (!Number.isFinite(layer?.depth)) errors.push(`Invalid foliage depth: ${id}`);
    if (!validTimeline(layer)) errors.push(`Invalid foliage timeline: ${id}`);
  });
  return errors;
}

function timelineFor(layer) {
  const points = [[0, 0], [layer.introStart, 0], [layer.introEnd, 1], [1, 1]];
  const unique = points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0]);
  return { inputRange: unique.map(p => p[0]), outputRange: unique.map(p => p[1]), extrapolate: 'clamp' };
}

function layerTransform(layer, config, width, progress) {
  const p = clamp(progress, 0, 1);
  const remaining = 1 - p;
  const direction = layer.side === 'left' ? -1 : layer.side === 'right' ? 1 : 0;
  return {
    translateX: direction * width * (config.motion.travelFactor + Math.max(0, layer.depth - 10) * 0.008) * remaining,
    translateY: (config.motion.verticalOffsetPx + Math.max(0, layer.depth - 10) * 1.5) * remaining,
    scale: 1 - (0.026 - Math.min(0.012, Math.max(0, layer.depth - 10) * 0.002)) * remaining,
  };
}

function foliageTransform(layer, config, progress) {
  const p = clamp(progress, 0, 1);
  const remaining = 1 - p;
  const order = Math.max(0, layer.depth - 30);
  return {
    translateY: (config.motion.foliageRisePx + order * 7) * remaining,
    scale: 1 + (0.012 + order * 0.004) * remaining,
  };
}

function initialLoadState() {
  return { phase: 'loading', loaded: [], failed: [], reason: null };
}

function reduceLoadState(state, event) {
  if (event.type === 'reset') return initialLoadState();
  if (state.phase === 'error') return state;
  if (event.type === 'timeout') {
    if (state.phase === 'ready') return state;
    return { ...state, phase: 'error', failed: SCENE_IDS.filter(id => !state.loaded.includes(id)), reason: 'timeout' };
  }
  if (!SCENE_IDS.includes(event.id)) return state;
  if (event.type === 'error') return { ...state, phase: 'error', failed: [event.id], reason: 'decode' };
  if (event.type !== 'loaded' || state.loaded.includes(event.id)) return state;
  const loaded = [...state.loaded, event.id];
  return { ...state, loaded, phase: loaded.length === SCENE_IDS.length ? 'ready' : 'loading' };
}

function getHomeLayout({ width, height, fontScale = 1 }) {
  const w = positive(width, 360);
  const h = positive(height, 640);
  const fs = positive(fontScale, 1);
  const margin = w >= 800 ? 28 : 14;
  const contentWidth = Math.max(1, Math.min(w - margin * 2, 900));
  const gap = 10;
  const minSector = Math.max(144, 62 + 90 * fs);
  const sectorColumns = contentWidth >= minSector * 4 + gap * 3 ? 4 : contentWidth >= minSector * 2 + gap ? 2 : 1;
  const secondaryColumns = contentWidth >= Math.max(220, 92 + 128 * fs) * 2 + 12 ? 2 : 1;
  const headerHeight = Math.max(72, 36 + 28 * fs);
  const bodyHeight = Math.max(1, h - headerHeight);
  const portrait = h >= w;
  const contentTop = clamp(bodyHeight * (portrait ? 0.49 : 0.30), 150, Math.max(150, bodyHeight * 0.68));
  return {
    contentWidth, margin, gap, sectorColumns, secondaryColumns,
    sectorWidth: (contentWidth - gap * (sectorColumns - 1)) / sectorColumns,
    headerHeight, bodyHeight,
    sceneFrame: { left: 0, top: 0, width: w, height: bodyHeight },
    contentTop,
    dockClearance: 166,
  };
}

module.exports = {
  IDS, BUILDING_IDS, FOLIAGE_IDS, SCENE_IDS,
  validateSceneConfig, timelineFor, layerTransform, foliageTransform,
  initialLoadState, reduceLoadState, getHomeLayout,
};
