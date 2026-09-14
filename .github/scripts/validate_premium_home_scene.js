/* Structural validation is not pixel decoding. Both gates are required. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateSceneConfig, SCENE_IDS } = require('../../visual-packs/spiral-active/homeSceneModel.js');
const EXPECTED = [
  ['background', '00_background.webp', false, [1280, 2048]],
  ['haussmann', '01_haussmann_left_far.webp', true, [1280, 2048]],
  ['collectif', '02_collectif_left_mid.webp', true, [1280, 2048]],
  ['poste-municipal', '03_poste_municipal_right_mid.webp', true, [1280, 2048]],
  ['building', '04_building_right_near.webp', true, [1280, 2048]],
  ['foliage-back', '10_foliage_back.webp', true, [1280, 2048]],
  ['foliage-mid', '11_foliage_mid.webp', true, [1280, 2048]],
  ['foliage-front', '12_foliage_front.webp', true, [1280, 2048]],
];
function check(condition, message) { if (!condition) throw new Error(message); }
function uint24(buffer, offset) { return buffer[offset] | buffer[offset + 1] << 8 | buffer[offset + 2] << 16; }
function inspectWebp(buffer) {
  check(Buffer.isBuffer(buffer) && buffer.length >= 20, 'Truncated WebP');
  check(buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP', 'Invalid RIFF/WEBP signature');
  check(buffer.readUInt32LE(4) + 8 === buffer.length, 'RIFF size mismatch');
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    check(offset + 8 <= buffer.length, 'Truncated chunk header');
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4), start = offset + 8, next = start + size + size % 2;
    check(/^[\x20-\x7e]{4}$/.test(type) && next <= buffer.length, 'Invalid/out-of-bounds chunk');
    chunks.push({ type, size, start }); offset = next;
  }
  check(!chunks.some(c => c.type === 'ANIM' || c.type === 'ANMF'), 'Animated layer not allowed');
  const images = chunks.filter(c => c.type === 'VP8 ' || c.type === 'VP8L');
  check(images.length === 1, 'Exactly one compressed image required');
  const image = images[0], alpha = chunks.filter(c => c.type === 'ALPH');
  let info;
  if (image.type === 'VP8L') {
    const bits = buffer.readUInt32LE(image.start + 1);
    info = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, hasAlpha: !!(bits & 0x10000000) };
  } else {
    info = { width: buffer.readUInt16LE(image.start + 6) & 0x3fff, height: buffer.readUInt16LE(image.start + 8) & 0x3fff, hasAlpha: alpha.length === 1 };
  }
  const extended = chunks.find(c => c.type === 'VP8X');
  if (extended) {
    const start = extended.start;
    check(uint24(buffer, start + 4) + 1 === info.width && uint24(buffer, start + 7) + 1 === info.height, 'Conflicting image/canvas dimensions');
  }
  return info;
}
function validate(root = path.resolve(__dirname, '..', '..')) {
  const pack = path.join(root, 'visual-packs/spiral-active');
  const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
  const config = manifest.homeScene;
  const sources = Object.fromEntries(EXPECTED.map(([id]) => [id, true]));
  const errors = validateSceneConfig(config, sources);
  if (manifest.version < 7) errors.push('Pack version must be >= 7');
  if (config?.canvas?.[0] !== 1280 || config?.canvas?.[1] !== 2048) errors.push('Expected 1280x2048 registered canvas');
  if (!config?.assetOutline?.baked || config.assetOutline.color !== '#0A0C0F' ||
      config.assetOutline.buildingRadiusPx !== 5 || config.assetOutline.foliageRadiusPx !== 4 ||
      config.assetOutline.preserveOriginalPixels !== true) errors.push('Strong baked outline contract missing');
  const configured = new Map([
    [config?.background?.id, config?.background?.asset],
    ...(config?.layers || []).map(x => [x.id, x.asset]),
    ...(config?.foliage || []).map(x => [x.id, x.asset]),
  ]);
  const hashes = new Set();
  let totalBytes = 0;
  EXPECTED.forEach(([id, name, alphaRequired, dimensions]) => {
    if (configured.get(id) !== `./home-scene/${name}`) errors.push(`Wrong asset for ${id}`);
    try {
      const bytes = fs.readFileSync(path.join(pack, 'home-scene', name));
      const info = inspectWebp(bytes);
      if (alphaRequired) check(info.hasAlpha, 'Missing alpha flag');
      check(info.width === dimensions[0] && info.height === dimensions[1], `Wrong dimensions ${info.width}x${info.height}`);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      check(!hashes.has(hash), 'Duplicate image bytes'); hashes.add(hash);
      totalBytes += bytes.length;
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  });
  if (totalBytes > 3 * 1024 * 1024) errors.push(`Scene asset budget exceeded: ${totalBytes} bytes`);
  if (SCENE_IDS.length !== EXPECTED.length) errors.push('Runtime scene IDs and validator disagree');
  const scene = fs.readFileSync(path.join(pack, 'HomeBuildingScene.js'), 'utf8');
  const startup = fs.readFileSync(path.join(pack, 'StartupAnimation.js'), 'utf8');
  for (const token of ['premium-layered-home-scene', 'premium-building-${layer.id}', 'premium-foliage-${layer.id}', 'SceneAsset', 'consumeHomeSceneEntryMode', 'onLoad=', 'onError='])
    if (!scene.includes(token)) errors.push(`Missing runtime contract: ${token}`);
  for (const forbidden of ['PremiumOutlinedImage', 'tintColor', 'home-composite.webp'])
    if (scene.includes(forbidden)) errors.push(`Forbidden runtime image mutation: ${forbidden}`);
  EXPECTED.forEach(([, name]) => { if (!scene.includes(name)) errors.push(`Missing bundled source: ${name}`); });
  for (const token of ['HomeBuildingScene', 'entryMode="startup"', 'markStartupHomeSceneComplete'])
    if (!startup.includes(token)) errors.push(`Missing startup scene contract: ${token}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Structural checks passed (${totalBytes} scene bytes). Native visual acceptance still required.`);
}
module.exports = { inspectWebp, validate };
if (require.main === module) {
  try { validate(); } catch (error) { console.error(`[PremiumHome] BLOCKED\n${error.message}`); process.exitCode = 1; }
}
