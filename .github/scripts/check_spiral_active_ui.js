const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function requireFile(path, label) {
  if (!fs.existsSync(path)) throw new Error(`${label}: missing file ${path}`);
}

const manager = read('visual-packs/runtime/visualPackManager.js');
const loading = read('visual-packs/runtime/VisualPackLoadingScreen.js');
const app = read('App.js');
const home = read('HomeScreen.js');
const manifest = JSON.parse(read('visual-packs/spiral-active/manifest.json'));
const dock = read('visual-packs/spiral-active/SpiralActiveDock.js');
const startup = read('visual-packs/spiral-active/StartupAnimation.js');
const premiumHome = read('visual-packs/spiral-active/SpiralActiveHome.js');
const buildingScene = read('visual-packs/spiral-active/HomeBuildingScene.js');

if (manifest.id !== 'spiral-active') throw new Error('Spiral Active manifest id changed.');
if (manifest.startup?.preset !== 'metra-spiral-active') throw new Error('Spiral Active startup preset missing.');
if (manifest.startup?.replaceable !== true) throw new Error('Spiral Active startup must stay replaceable.');
if (manifest.interface?.experimentalSpiralDock !== true) throw new Error('Spiral Active dock flag missing.');
if (manifest.interface?.experimentalBuildingScene !== true) throw new Error('Spiral Active building scene flag missing.');
if (manifest.spiralDock?.replaceable !== true) throw new Error('Spiral Active dock appearance must stay replaceable.');
if (Number(manifest.spiralDock?.diameterTablet || 0) < 160) throw new Error('Spiral Active tablet dock became too small.');
if (manifest.homeScene?.enabled !== true) throw new Error('Spiral Active home scene disabled unexpectedly.');
if (manifest.homeScene?.replaceable !== true) throw new Error('Spiral Active home scene must stay replaceable.');
if (!Array.isArray(manifest.homeScene?.layers) || manifest.homeScene.layers.length !== 4) throw new Error('Spiral Active home scene must expose exactly four building layers.');

const expectedLayers = [
  ['haussmann', 'left', 1],
  ['collectif', 'left', 2],
  ['poste-municipal', 'right', 3],
  ['building', 'right', 4],
];
for (let index = 0; index < expectedLayers.length; index += 1) {
  const [id, side, depth] = expectedLayers[index];
  const layer = manifest.homeScene.layers[index];
  if (layer?.id !== id || layer?.side !== side || Number(layer?.depth) !== depth) {
    throw new Error(`Spiral Active layer ${index + 1} changed: expected ${id}/${side}/depth-${depth}.`);
  }
  const assetPath = String(layer?.asset || '').replace(/^\.\//, '');
  requireFile(`visual-packs/spiral-active/${assetPath}`, `home scene asset ${id}`);
}

requireText(manager, "require('../spiral-active/manifest.json')", 'visual pack registration');
requireText(manager, "'metra-spiral-active'", 'startup preset registration');
requireText(loading, 'SpiralActiveStartupAnimation', 'loading screen binding');
requireText(app, 'SpiralActiveDock', 'global spiral dock binding');
requireText(app, 'spiralPreview={spiralActive}', 'home preview binding');
requireText(home, 'SpiralActiveHome', 'premium home binding');
requireText(premiumHome, 'HomeBuildingScene', 'architectural home scene binding');
requireText(premiumHome, 'onTouchMove={scene.onTouchMove}', 'two-finger pinch binding');
requireText(buildingScene, 'OPEN_THRESHOLD', 'pinch threshold');
requireText(buildingScene, 'touchDistance', 'pinch distance calculation');
requireText(buildingScene, "Vibration.vibrate(10)", 'pinch threshold haptic');
requireText(buildingScene, "01_haussmann_left_far.webp", 'Haussmann layer');
requireText(buildingScene, "02_collectif_left_mid.webp", 'Collectif layer');
requireText(buildingScene, "03_poste_municipal_right_mid.webp", 'Poste municipal layer');
requireText(buildingScene, "04_building_right_near.webp", 'Building layer');
requireText(dock, "selectMode('explore')", 'left gesture');
requireText(dock, "selectMode('actions')", 'right gesture');
requireText(dock, "selectMode('quick')", 'press gesture');
requireText(startup, 'SPIRAL_PATH_LENGTH', 'drawn startup spiral');
requireText(startup, 'travellingPoint', 'travelling point phase');
requireText(startup, 'bottomSpiral', 'bottom reconstruction phase');

console.log('Spiral Active UI contract validated: replaceable startup/dock/home scene, four building layers, pinch opening and spiral gestures are wired.');
