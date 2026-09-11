const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const manager = read('visual-packs/runtime/visualPackManager.js');
const loading = read('visual-packs/runtime/VisualPackLoadingScreen.js');
const app = read('App.js');
const home = read('HomeScreen.js');
const manifest = JSON.parse(read('visual-packs/spiral-active/manifest.json'));
const dock = read('visual-packs/spiral-active/SpiralActiveDock.js');
const startup = read('visual-packs/spiral-active/StartupAnimation.js');

if (manifest.id !== 'spiral-active') throw new Error('Spiral Active manifest id changed.');
if (manifest.startup?.preset !== 'metra-spiral-active') throw new Error('Spiral Active startup preset missing.');
if (manifest.interface?.experimentalSpiralDock !== true) throw new Error('Spiral Active dock flag missing.');

requireText(manager, "require('../spiral-active/manifest.json')", 'visual pack registration');
requireText(manager, "'metra-spiral-active'", 'startup preset registration');
requireText(loading, 'SpiralActiveStartupAnimation', 'loading screen binding');
requireText(app, 'SpiralActiveDock', 'global spiral dock binding');
requireText(app, 'spiralPreview={spiralActive}', 'home preview binding');
requireText(home, 'SpiralActiveHome', 'premium home binding');
requireText(dock, "selectMode('explore')", 'left gesture');
requireText(dock, "selectMode('actions')", 'right gesture');
requireText(dock, "selectMode('quick')", 'press gesture');
requireText(startup, 'SPIRAL_PATH_LENGTH', 'drawn startup spiral');
requireText(startup, 'travellingPoint', 'travelling point phase');
requireText(startup, 'bottomSpiral', 'bottom reconstruction phase');

console.log('Spiral Active UI contract validated: pack, startup animation, premium home and left/right/press dock gestures are wired.');
