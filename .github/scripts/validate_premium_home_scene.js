const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const packDir = path.join(root, 'visual-packs', 'spiral-active');
const manifestPath = path.join(packDir, 'manifest.json');
const scenePath = path.join(packDir, 'HomeBuildingScene.js');
const legacyCompositePath = path.join(packDir, 'home-scene', 'home-composite.webp');

const EXPECTED = [
  { id: 'haussmann', asset: './home-scene/01_haussmann_left_far.webp', side: 'left', depth: 1 },
  { id: 'collectif', asset: './home-scene/02_collectif_left_mid.webp', side: 'left', depth: 2 },
  { id: 'poste-municipal', asset: './home-scene/03_poste_municipal_right_mid.webp', side: 'right', depth: 3 },
  { id: 'building', asset: './home-scene/04_building_right_near.webp', side: 'right', depth: 4 },
];

function fail(message) {
  console.error(`[PremiumHome] ${message}`);
  process.exit(1);
}

function readUInt24LE(buffer, offset) {
  if (offset + 2 >= buffer.length) fail('En-tête WebP tronqué.');
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectWebp(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 30) fail(`${path.basename(filePath)} est trop petit pour être un WebP valide.`);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    fail(`${path.basename(filePath)} n'est pas un WebP RIFF valide.`);
  }

  const vp8x = buffer.indexOf(Buffer.from('VP8X'));
  if (vp8x < 0) fail(`${path.basename(filePath)} doit utiliser un conteneur VP8X avec transparence.`);
  const flagsOffset = vp8x + 8;
  const widthOffset = vp8x + 12;
  const heightOffset = vp8x + 15;
  if (heightOffset + 2 >= buffer.length) fail(`${path.basename(filePath)} possède un en-tête VP8X incomplet.`);

  const flags = buffer[flagsOffset];
  const width = readUInt24LE(buffer, widthOffset) + 1;
  const height = readUInt24LE(buffer, heightOffset) + 1;
  return { width, height, hasAlpha: (flags & 0x10) !== 0 };
}

if (!fs.existsSync(manifestPath)) fail('manifest.json du pack spiral-active introuvable.');
if (!fs.existsSync(scenePath)) fail('HomeBuildingScene.js introuvable.');
if (fs.existsSync(legacyCompositePath)) {
  fail('home-composite.webp est interdit : la scène premium doit rester composée de quatre bâtiments indépendants.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const homeScene = manifest.homeScene || {};
const layers = Array.isArray(homeScene.layers) ? homeScene.layers : [];
const canvas = Array.isArray(homeScene.canvas) ? homeScene.canvas : [];

if (manifest.version < 4) fail('Le pack premium doit être en version 4 ou supérieure.');
if (homeScene.mode !== 'four-independent-buildings') fail('homeScene.mode doit être four-independent-buildings.');
if (homeScene.motion?.type !== 'converge') fail('La scène premium doit utiliser le mouvement converge.');
if (layers.length !== 4) fail(`Quatre calques sont requis, ${layers.length} trouvé(s).`);
if (canvas.length !== 2 || Number(canvas[0]) <= 0 || Number(canvas[1]) <= 0) fail('Canvas premium invalide.');

const ids = new Set();
for (let index = 0; index < EXPECTED.length; index += 1) {
  const expected = EXPECTED[index];
  const layer = layers[index];
  if (!layer) fail(`Calque ${index + 1} absent.`);
  if (layer.id !== expected.id) fail(`Ordre/identité de calque invalide à la position ${index + 1}: ${layer.id}.`);
  if (layer.asset !== expected.asset) fail(`Asset invalide pour ${expected.id}: ${layer.asset}.`);
  if (layer.side !== expected.side) fail(`Côté invalide pour ${expected.id}: ${layer.side}.`);
  if (Number(layer.depth) !== expected.depth) fail(`Profondeur invalide pour ${expected.id}: ${layer.depth}.`);
  if (ids.has(layer.id)) fail(`Identifiant de calque dupliqué: ${layer.id}.`);
  ids.add(layer.id);

  const assetPath = path.resolve(packDir, layer.asset);
  if (!fs.existsSync(assetPath)) fail(`Asset manquant pour ${layer.id}: ${layer.asset}.`);
  if (fs.statSync(assetPath).size < 1024) fail(`Asset anormalement petit pour ${layer.id}: ${layer.asset}.`);

  const info = inspectWebp(assetPath);
  if (info.width !== Number(canvas[0]) || info.height !== Number(canvas[1])) {
    fail(`${layer.asset} doit mesurer exactement ${canvas[0]}x${canvas[1]} px, trouvé ${info.width}x${info.height}.`);
  }
  if (!info.hasAlpha) fail(`${layer.asset} doit conserver un canal alpha pour rester un bâtiment indépendant.`);
}

const sceneSource = fs.readFileSync(scenePath, 'utf8');
if (sceneSource.includes('home-composite.webp')) fail('HomeBuildingScene.js référence encore home-composite.webp.');
if (!sceneSource.includes('premium-four-building-scene')) fail('Le testID de contrat premium-four-building-scene est absent.');
if (!sceneSource.includes('BUILDING_SOURCES')) fail('HomeBuildingScene.js doit utiliser BUILDING_SOURCES.');
for (const expected of EXPECTED) {
  const fileName = path.basename(expected.asset);
  if (!sceneSource.includes(fileName)) fail(`HomeBuildingScene.js ne référence pas ${fileName}.`);
  if (!sceneSource.includes(`premium-building-${'${layer.id}'}`)) {
    fail('Les quatre bâtiments doivent rester adressables individuellement par testID.');
  }
}

console.log(
  `Premium home scene validated: 4 independent transparent ${canvas[0]}x${canvas[1]} WebP layers, converging motion, no legacy composite fallback.`,
);
