import { WILO_STRATOS_MAXO_65_2186282_MESH } from './wilo/wiloStratosMaxo65_2186282.mesh.js';

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const LAB3D_MANUFACTURER_MODELS = Object.freeze([
  Object.freeze({
    key: 'wilo-stratos-maxo-65-0_5-12-pn16-2186282-lod350',
    skinKey: 'wilo-stratos-maxo-65-2186282-lod350',
    manufacturer: 'Wilo',
    model: 'Stratos MAXO 65/0,5-12 PN16',
    reference: '2186282',
    type: 'pompe',
    sourceFormat: 'STEP',
    sourceLod: 350,
    dimensions: Object.freeze({ width: 0.375, depth: 0.492, height: 0.289 }),
    ports: Object.freeze([
      Object.freeze({ name: 'PORT_INLET', position: Object.freeze({ x: -0.17, y: 0, z: 0.165 }), direction: Object.freeze([-1, 0, 0]), dn: 65, pn: 16 }),
      Object.freeze({ name: 'PORT_OUTLET', position: Object.freeze({ x: 0.17, y: 0, z: 0.165 }), direction: Object.freeze([1, 0, 0]), dn: 65, pn: 16 }),
    ]),
    mesh: WILO_STRATOS_MAXO_65_2186282_MESH,
  }),
]);

export function getManufacturerModel(key) {
  return LAB3D_MANUFACTURER_MODELS.find((item) => item.key === key || item.skinKey === key) || null;
}

export function resolveManufacturerModel(equipment = {}, object = {}) {
  const explicit = getManufacturerModel(object?.params?.manufacturerModelKey || object?.params?.visualSkinKey);
  if (explicit) return explicit;

  const brand = normalize(equipment.marque);
  const model = normalize([equipment.modele, equipment.designation].filter(Boolean).join(' '));
  if (!brand.includes('wilo')) return null;

  return LAB3D_MANUFACTURER_MODELS.find((item) => {
    if (normalize(item.manufacturer) !== 'wilo') return false;
    if (model.includes(item.reference)) return true;
    return model.includes('stratos maxo') && model.includes('65')
      && (model.includes('0 5 12') || model.includes('0 5 12 pn16'));
  }) || null;
}
