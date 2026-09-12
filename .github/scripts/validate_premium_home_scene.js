/* Structural validation is not pixel decoding. Both gates are required. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateSceneConfig } = require('../../visual-packs/spiral-active/homeSceneModel.js');
const EXPECTED = [
  ['haussmann', '01_haussmann_left_far.webp'], ['collectif', '02_collectif_left_mid.webp'],
  ['poste-municipal', '03_poste_municipal_right_mid.webp'], ['building', '04_building_right_near.webp'],
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
    if (size % 2) check(buffer[start + size] === 0, 'Non-zero padding');
    chunks.push({ type, size, start }); offset = next;
  }
  check(!chunks.some(c => c.type === 'ANIM' || c.type === 'ANMF'), 'Animated layer not allowed');
  const images = chunks.filter(c => c.type === 'VP8 ' || c.type === 'VP8L');
  check(images.length === 1, 'Exactly one compressed image required');
  const image = images[0], alpha = chunks.filter(c => c.type === 'ALPH');
  let info;
  if (image.type === 'VP8L') {
    check(image.size >= 5 && buffer[image.start] === 0x2f, 'Invalid VP8L bitstream');
    const bits = buffer.readUInt32LE(image.start + 1);
    check(bits >>> 29 === 0 && alpha.length === 0, 'Invalid VP8L version/alpha chunk');
    info = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, hasAlpha: !!(bits & 0x10000000) };
  } else {
    check(image.size >= 10 && buffer.subarray(image.start + 3, image.start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])), 'Invalid VP8 keyframe');
    check(alpha.length === 1 && alpha[0].start < image.start && alpha[0].size > 1, 'Missing/misplaced alpha payload');
    info = { width: buffer.readUInt16LE(image.start + 6) & 0x3fff, height: buffer.readUInt16LE(image.start + 8) & 0x3fff, hasAlpha: true };
  }
  const extended = chunks.filter(c => c.type === 'VP8X');
  if (extended.length) {
    check(extended.length === 1 && chunks[0].type === 'VP8X' && extended[0].size === 10, 'Invalid VP8X chunk');
    const start = extended[0].start, flags = buffer[start];
    check((flags & 0xc3) === 0 && buffer[start + 1] === 0 && buffer[start + 2] === 0 && buffer[start + 3] === 0, 'Invalid static VP8X flags');
    check(uint24(buffer, start + 4) + 1 === info.width && uint24(buffer, start + 7) + 1 === info.height, 'Conflicting image/canvas dimensions');
    check(!!(flags & 0x10) === info.hasAlpha, 'Conflicting alpha flag');
  } else {
    // Valid lossless transparent WebP can use VP8L alone: never require VP8X unnecessarily.
    check(chunks.length === 1 && image.type === 'VP8L', 'Missing extended header');
  }
  return info;
}
function validate(root = path.resolve(__dirname, '..', '..')) {
  const pack = path.join(root, 'visual-packs/spiral-active');
  const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
  const config = manifest.homeScene;
  const errors = validateSceneConfig(config, Object.fromEntries(EXPECTED));
  if (manifest.version < 4) errors.push('Pack version must be >= 4');
  if (fs.existsSync(path.join(pack, 'home-scene/home-composite.webp'))) errors.push('Legacy composite is forbidden');
  const hashes = new Set();
  EXPECTED.forEach(([id, name], index) => {
    if (config?.layers?.[index]?.asset !== `./home-scene/${name}`) errors.push(`Wrong asset for ${id}`);
    try {
      const bytes = fs.readFileSync(path.join(pack, 'home-scene', name));
      const info = inspectWebp(bytes);
      check(info.hasAlpha, 'Missing alpha flag');
      check(info.width === config.canvas[0] && info.height === config.canvas[1], 'Wrong canvas dimensions');
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      check(!hashes.has(hash), 'Duplicate image bytes'); hashes.add(hash);
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  });
  const scene = fs.readFileSync(path.join(pack, 'HomeBuildingScene.js'), 'utf8');
  if (scene.includes('home-composite.webp')) errors.push('Legacy scene reference');
  for (const token of ['premium-four-building-scene', 'premium-building-${layer.id}', 'onLoad=', 'onError='])
    if (!scene.includes(token)) errors.push(`Missing runtime contract: ${token}`);
  EXPECTED.forEach(([, name]) => { if (!scene.includes(name)) errors.push(`Missing bundled source: ${name}`); });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Structural checks passed. Full decoding and native visual acceptance still required.');
}
module.exports = { inspectWebp, validate };
if (require.main === module) {
  try { validate(); } catch (error) { console.error(`[PremiumHome] BLOCKED\n${error.message}`); process.exitCode = 1; }
}
