import verticesB64 from './vertices.js';
import indices1 from './indices1.js';
import indices2 from './indices2.js';
import groupsPacked from './groups.js';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const table = Object.create(null);
  for (let i = 0; i < B64.length; i += 1) table[B64[i]] = i;
  return table;
})();

function decodeBase64(text) {
  const clean = String(text || '').replace(/=+$/, '');
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = LOOKUP[clean[i]];
    if (value == null) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function decodeInt16Triples(base64) {
  const bytes = decodeBase64(base64);
  const values = new Array(bytes.length / 2);
  for (let i = 0, j = 0; i + 1 < bytes.length; i += 2, j += 1) {
    let value = bytes[i] | (bytes[i + 1] << 8);
    if (value & 0x8000) value -= 0x10000;
    values[j] = value / 10000;
  }
  const vertices = new Array(values.length / 3);
  for (let i = 0, j = 0; i < values.length; i += 3, j += 1) {
    vertices[j] = Object.freeze({ x: values[i], y: values[i + 1], z: values[i + 2] });
  }
  return Object.freeze(vertices);
}

function decodeUint16(base64) {
  const bytes = decodeBase64(base64);
  const values = new Array(bytes.length / 2);
  for (let i = 0, j = 0; i + 1 < bytes.length; i += 2, j += 1) values[j] = bytes[i] | (bytes[i + 1] << 8);
  return values;
}

const VERTICES = decodeInt16Triples(verticesB64);
const ALL_INDICES = decodeUint16(indices1 + indices2);
let cursor = 0;
const GROUPS = Object.freeze(groupsPacked.map(([part, nx, ny, nz, triangleCount]) => {
  const count = Number(triangleCount) * 3;
  const triangles = Object.freeze(ALL_INDICES.slice(cursor, cursor + count));
  cursor += count;
  return Object.freeze({ part, normal: Object.freeze([nx, ny, nz]), triangles });
}));

export const WILO_STRATOS_MAXO_65_2186282_MESH = Object.freeze({
  key: 'wilo-stratos-maxo-65-0_5-12-pn16-2186282-lod350',
  vertices: VERTICES,
  groups: GROUPS,
});
