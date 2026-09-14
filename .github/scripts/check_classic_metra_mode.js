const fs = require('fs');

const manager = fs.readFileSync('visual-packs/runtime/visualPackManager.js', 'utf8');
const classic = JSON.parse(fs.readFileSync('visual-packs/classic/manifest.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(classic.id === 'classic', 'Le pack classique METRA doit rester disponible.');
assert(classic.startup?.preset === 'metra-classic', 'Le démarrage classique METRA doit rester actif.');
assert(!manager.includes("const SPIRAL_ACTIVE_MANIFEST = require('../spiral-active/manifest.json')"), 'Le pack architectural ne doit plus être chargé comme pack intégré.');
assert(!/BUILTIN_PACKS\s*=\s*\[[^\]]*SPIRAL_ACTIVE_MANIFEST/s.test(manager), 'Le pack architectural ne doit plus être proposé dans les thèmes intégrés.');
assert(manager.includes("=== 'spiral-active'"), 'La migration des tablettes déjà configurées en spiral-active doit être conservée.');
assert(manager.includes("persistActiveVisualPack(db, classic.id)"), 'La migration doit enregistrer définitivement le retour au pack classique.');

console.log('Classic METRA guard: OK');
