/* Container validation only. Full pixel decoding is a separate CI gate. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EXPECTED = [
  ['haussmann', '01_haussmann_left_far.webp', 'left', 1],
  ['collectif', '02_collectif_left_mid.webp', 'left', 2],
  ['poste-municipal', '03_poste_municipal_right_mid.webp', 'right', 3],
  ['building', '04_building_right_near.webp', 'right', 4],
];
function requireValid(condition, message) { if (!condition) throw new Error(message); }
function uint24(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}
function inspectWebp(buffer) {
  requireValid(Buffer.isBuffer(buffer) && buffer.length >= 30, 'Truncated WebP');
  requireValid(buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP', 'Invalid RIFF/WEBP signature');
  const declared = buffer.readUInt32LE(4) + 8;
  requireValid(declared === buffer.length, `RIFF size mismatch: header=${declared}, actual=${buffer.length}`);
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    requireValid(offset + 8 <= buffer.length, `Truncated chunk header at ${offset}`);
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const next = start + size + (size % 2);
    requireValid(/^[\x20-\x7e]{4}$/.test(type), `Invalid chunk identifier at ${offset}`);
    requireValid(next <= buffer.length, `Chunk ${type} exceeds file bounds at ${offset}`);
    if (size % 2) requireValid(buffer[start + size] === 0, `Non-zero padding after ${type}`);
    chunks.push({ type, start, size });
    offset = next;
  }
  const extended = chunks.filter((c) => c.type === 'VP8X');
  requireValid(extended.length === 1 && chunks[0].type === 'VP8X' && extended[0].size === 10, 'Expected one leading VP8X chunk');
  const { start } = extended[0];
  const flags = buffer[start];
  requireValid((flags & 0xc3) === 0, 'Invalid VP8X reserved/animation flags for a static layer');
  requireValid(buffer[start + 1] === 0 && buffer[start + 2] === 0 && buffer[start + 3] === 0, 'Invalid VP8X reserved bytes');
  const images = chunks.filter((c) => c.type === 'VP8 ' || c.type === 'VP8L');
  requireValid(images.length === 1, 'Expected exactly one compressed image chunk');
  requireValid(!chunks.some((c) => c.type === 'ANIM' || c.type === 'ANMF'), 'Animated image not allowed in a building layer');
  const image = images[0];
  const alpha = chunks.filter((c) => c.type === 'ALPH');
  if (image.type === 'VP8 ') {
    requireValid(image.size >= 10, 'Truncated VP8 bitstream');
    requireValid(buffer.subarray(image.start + 3, image.start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])), 'Invalid VP8 keyframe signature');
    requireValid(alpha.length === 1 && alpha[0].start < image.start && alpha[0].size > 1, 'Missing or misplaced alpha payload');
  } else {
    requireValid(image.size >= 5 && buffer[image.start] === 0x2f, 'Invalid VP8L bitstream');
    requireValid(alpha.length === 0, 'VP8L uses its own alpha channel');
  }
  return { width: uint24(buffer, start + 4) + 1, height: uint24(buffer, start + 7) + 1, hasAlpha: (flags & 0x10) !== 0 };
}
function validate(root = path.resolve(__dirname, '..', '..')) {
  const pack = path.join(root, 'visual-packs', 'spiral-active');
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
  const config = manifest.homeScene || {};
  const layers = config.layers || [];
  check(manifest.version >= 4, 'Pack version must be >= 4');
  check(config.mode === 'four-independent-buildings', 'Wrong scene mode');
  check(config.motion?.type === 'converge', 'Wrong scene motion');
  check(layers.length === 4, 'Exactly four layers are required');
  check(Array.isArray(config.canvas) && config.canvas.length === 2 && config.canvas.every((n) => Number.isInteger(n) && n > 0), 'Invalid canvas');
  check(!fs.existsSync(path.join(pack, 'home-scene', 'home-composite.webp')), 'Legacy composite is forbidden in this pack');
  const hashes = new Set();
  EXPECTED.forEach(([id, file, side, depth], i) => {
    const layer = layers[i];
    check(layer?.id === id && layer?.asset === `./home-scene/${file}` && layer?.side === side && layer?.depth === depth, `Invalid manifest entry for ${id}`);
    check(Number.isFinite(layer?.introStart) && Number.isFinite(layer?.introEnd) && layer.introStart >= 0 && layer.introStart < layer.introEnd && layer.introEnd <= 1, `Invalid timing for ${id}`);
    try {
      const bytes = fs.readFileSync(path.join(pack, 'home-scene', file));
      const info = inspectWebp(bytes);
      check(info.width === config.canvas?.[0] && info.height === config.canvas?.[1], `${file}: wrong canvas dimensions`);
      check(info.hasAlpha, `${file}: alpha flag missing`);
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      check(!hashes.has(digest), `${file}: duplicate image content`);
      hashes.add(digest);
      console.log(`[PremiumHome] Container OK: ${file} (${bytes.length} bytes)`);
    } catch (error) { errors.push(`${file}: ${error.message}`); }
  });
  const scene = fs.readFileSync(path.join(pack, 'HomeBuildingScene.js'), 'utf8');
  check(!scene.includes('home-composite.webp'), 'Scene still references legacy composite');
  check(scene.includes('premium-four-building-scene'), 'Missing scene testID');
  check(scene.includes('premium-building-${layer.id}'), 'Missing per-building testID');
  EXPECTED.forEach(([, file]) => check(scene.includes(file), `Scene does not reference ${file}`));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('[PremiumHome] Structural checks passed. Pixel decoding and Android visual acceptance are still required.');
}
module.exports = { inspectWebp, validate };
if (require.main === module) {
  try { validate(); } catch (error) { console.error(`[PremiumHome] BLOCKED\n${error.message}`); process.exitCode = 1; }
}
