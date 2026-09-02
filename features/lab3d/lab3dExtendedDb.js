import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';
import {
  LAB3D_DN,
  LAB3D_EQUIPMENT_PRESETS,
  LAB3D_NETWORK_TYPES,
  createEquipmentFromLab3d,
  createLab3dNetwork,
  loadLab3dSite,
  placeExistingEquipment,
  removeLab3dNetwork,
  removeLab3dObject,
  setMasonryBase,
  updateLab3dEquipmentData,
  updateLab3dNetwork,
  updateLab3dObject,
} from './lab3dDb.js';

export {
  LAB3D_DN,
  LAB3D_EQUIPMENT_PRESETS,
  LAB3D_NETWORK_TYPES,
  createEquipmentFromLab3d,
  createLab3dNetwork,
  placeExistingEquipment,
  removeLab3dNetwork,
  removeLab3dObject,
  setMasonryBase,
  updateLab3dEquipmentData,
  updateLab3dNetwork,
  updateLab3dObject,
};

const n = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
}

function parseOpening(row) {
  return { ...row, params: parseJson(row.params_json, {}) };
}

function parseObject(row) {
  return { ...row, params: parseJson(row.params_json, {}) };
}

function parseNetwork(row) {
  return { ...row, points: parseJson(row.points_json, []) };
}

export const LAB3D_ARCHITECTURE_PRESETS = Object.freeze([
  { code: 'room', label: 'Pièce rectangulaire', icon: '▭' },
  { code: 'stair', label: 'Escalier droit', icon: '▟' },
  { code: 'wall', label: 'Mur indépendant', icon: '▰' },
]);

export const LAB3D_OPENING_PRESETS = Object.freeze([
  { code: 'door', label: 'Porte', icon: '▯', width: 0.9, height: 2.05, sill: 0 },
  { code: 'window', label: 'Fenêtre', icon: '▣', width: 1.2, height: 1.0, sill: 1.0 },
  { code: 'bay', label: 'Baie / grande ouverture', icon: '▤', width: 2.0, height: 2.1, sill: 0 },
  { code: 'grille', label: 'Grille ventilation', icon: '▦', width: 0.6, height: 0.4, sill: 1.6 },
]);

export async function loadLab3dExtendedSite(args = {}) {
  const base = await loadLab3dSite(args);
  const db = await openAppDatabase();
  const openings = await db.getAllAsync(`SELECT * FROM lab3d_openings WHERE scene_id=? ORDER BY rowid`, [base.scene.id]);
  return { ...base, openings: openings.map(parseOpening) };
}

export async function createArchitectureObject(sceneId, subtype, values = {}) {
  const db = await openAppDatabase();
  const id = createId();
  const defaults = subtype === 'wall'
    ? { width: 4, depth: 0.18, height: 2.6, z: 0, anchor_type: 'floor' }
    : subtype === 'floor'
      ? { width: 4, depth: 4, height: 0.08, z: -0.08, anchor_type: 'floor' }
      : subtype === 'stair'
        ? { width: 1, depth: 2.2, height: 1.5, z: 0, anchor_type: 'floor' }
        : { width: 1, depth: 1, height: 1, z: 0, anchor_type: 'floor' };
  const data = { ...defaults, ...values };
  await db.runAsync(
    `INSERT INTO lab3d_objects(id,scene_id,equipment_id,kind,subtype,label,x,y,z,width,depth,height,rotation_deg,anchor_type,params_json)
     VALUES(?,?,NULL,'architecture',?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, sceneId, subtype, data.label || subtype,
      n(data.x), n(data.y), n(data.z), n(data.width, 1), n(data.depth, 1), n(data.height, 1),
      n(data.rotation_deg), data.anchor_type || 'floor', JSON.stringify(data.params || {}),
    ]
  );
  return parseObject(await db.getFirstAsync(`SELECT * FROM lab3d_objects WHERE id=?`, [id]));
}

export async function createRectangularRoom(sceneId, values = {}) {
  const width = Math.max(1.5, n(values.width, 5));
  const depth = Math.max(1.5, n(values.depth, 4));
  const height = Math.max(2, n(values.height, 2.6));
  const thickness = Math.max(0.08, n(values.thickness, 0.18));
  const originX = n(values.x, 0);
  const originY = n(values.y, 0);
  const roomId = createId();
  const common = { roomId, roomWidth: width, roomDepth: depth, roomHeight: height, wallThickness: thickness };
  const created = [];
  created.push(await createArchitectureObject(sceneId, 'floor', {
    label: values.label || 'Sol du local', x: originX, y: originY, z: -0.08,
    width, depth, height: 0.08, params: { ...common, side: 'floor' },
  }));
  created.push(await createArchitectureObject(sceneId, 'wall', {
    label: 'Mur Nord', x: originX, y: originY - depth / 2, width, depth: thickness, height,
    params: { ...common, side: 'north' },
  }));
  created.push(await createArchitectureObject(sceneId, 'wall', {
    label: 'Mur Sud', x: originX, y: originY + depth / 2, width, depth: thickness, height,
    params: { ...common, side: 'south' },
  }));
  created.push(await createArchitectureObject(sceneId, 'wall', {
    label: 'Mur Ouest', x: originX - width / 2, y: originY, width: thickness, depth, height,
    params: { ...common, side: 'west' },
  }));
  created.push(await createArchitectureObject(sceneId, 'wall', {
    label: 'Mur Est', x: originX + width / 2, y: originY, width: thickness, depth, height,
    params: { ...common, side: 'east' },
  }));
  return created;
}

export async function createOpeningOnWall(sceneId, wall, kind, values = {}) {
  if (!wall?.id || wall.kind !== 'architecture' || wall.subtype !== 'wall') throw new Error('Sélectionnez un mur');
  const preset = LAB3D_OPENING_PRESETS.find((item) => item.code === kind) || LAB3D_OPENING_PRESETS[0];
  const db = await openAppDatabase();
  const id = createId();
  const side = wall.params?.side || (n(wall.width) >= n(wall.depth) ? 'north' : 'east');
  const alongX = side === 'north' || side === 'south';
  const span = alongX ? n(wall.width, 4) : n(wall.depth, 4);
  const width = Math.min(Math.max(0.25, n(values.width, preset.width)), Math.max(0.3, span - 0.1));
  const height = Math.min(Math.max(0.25, n(values.height, preset.height)), Math.max(0.5, n(wall.height, 2.6) - 0.05));
  const sill = Math.max(0, n(values.sill, preset.sill));
  const maxOffset = Math.max(0, span / 2 - width / 2 - 0.05);
  const offset = Math.max(-maxOffset, Math.min(maxOffset, n(values.offset, 0)));
  const x = alongX ? n(wall.x) + offset : n(wall.x);
  const y = alongX ? n(wall.y) : n(wall.y) + offset;
  const rotation = alongX ? n(wall.rotation_deg) : n(wall.rotation_deg) + 90;
  const params = { offset, sill, side, wallThickness: Math.min(n(wall.width), n(wall.depth)), roomId: wall.params?.roomId || null };
  await db.runAsync(
    `INSERT INTO lab3d_openings(id,scene_id,wall_id,kind,x,y,z,width,height,rotation_deg,params_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id, sceneId, wall.id, kind, x, y, sill, width, height, rotation, JSON.stringify(params)]
  );
  return parseOpening(await db.getFirstAsync(`SELECT * FROM lab3d_openings WHERE id=?`, [id]));
}

export async function removeLab3dOpening(openingId) {
  const db = await openAppDatabase();
  await db.runAsync(`DELETE FROM lab3d_openings WHERE id=?`, [openingId]);
}

export function reflowOpeningsForWall(openings, wall) {
  if (!wall?.id) return openings || [];
  const side = wall.params?.side || (n(wall.width) >= n(wall.depth) ? 'north' : 'east');
  const alongX = side === 'north' || side === 'south';
  return (openings || []).map((opening) => {
    if (opening.wall_id !== wall.id) return opening;
    const offset = n(opening.params?.offset, 0);
    return {
      ...opening,
      x: alongX ? n(wall.x) + offset : n(wall.x),
      y: alongX ? n(wall.y) : n(wall.y) + offset,
      rotation_deg: alongX ? n(wall.rotation_deg) : n(wall.rotation_deg) + 90,
      params: { ...(opening.params || {}), side },
    };
  });
}

export async function persistOpeningsForWall(openings, wallId) {
  const db = await openAppDatabase();
  for (const opening of openings || []) {
    if (opening.wall_id !== wallId) continue;
    await db.runAsync(
      `UPDATE lab3d_openings SET x=?,y=?,z=?,width=?,height=?,rotation_deg=?,params_json=? WHERE id=?`,
      [n(opening.x), n(opening.y), n(opening.z), n(opening.width, 0.9), n(opening.height, 2.05), n(opening.rotation_deg), JSON.stringify(opening.params || {}), opening.id]
    );
  }
}

function equipmentConnector(object, other) {
  const dx = n(other?.x) - n(object?.x);
  const dy = n(other?.y) - n(object?.y);
  let x = n(object?.x);
  let y = n(object?.y);
  if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx || 1) * Math.max(0.1, n(object?.width, 1) / 2);
  else y += Math.sign(dy || 1) * Math.max(0.1, n(object?.depth, 0.6) / 2);
  const z = n(object?.z) + Math.max(0.22, n(object?.height, 1) * 0.62);
  return { x, y, z, objectId: object?.id };
}

export function getNetworkRouteMeta(network, objects = []) {
  const points = network?.points || [];
  const startId = points[0]?.objectId || null;
  const endId = points[points.length - 1]?.objectId || null;
  const start = objects.find((item) => item.id === startId);
  const end = objects.find((item) => item.id === endId);
  const a = start ? equipmentConnector(start, end) : points[0] || { x: 0, y: 0, z: 1 };
  const b = end ? equipmentConnector(end, start) : points[points.length - 1] || { x: 1, y: 1, z: 1 };
  const embedded = points[0]?.routeMeta || {};
  const middle = points[Math.floor(points.length / 2)] || {};
  return {
    startId,
    endId,
    offsetX: n(embedded.offsetX, n(middle.x) - (n(a.x) + n(b.x)) / 2),
    offsetY: n(embedded.offsetY, n(middle.y) - (n(a.y) + n(b.y)) / 2),
    elevation: Math.max(0.1, n(embedded.elevation, Math.max(n(a.z), n(b.z)) + 0.25)),
  };
}

export function buildAttachedNetworkPoints(network, objects, metaPatch = {}) {
  const current = getNetworkRouteMeta(network, objects);
  const meta = { ...current, ...metaPatch };
  const start = objects.find((item) => item.id === meta.startId);
  const end = objects.find((item) => item.id === meta.endId);
  if (!start || !end) return network?.points || [];
  const a = equipmentConnector(start, end);
  const b = equipmentConnector(end, start);
  const elevation = Math.max(Math.max(a.z, b.z) + 0.05, n(meta.elevation, Math.max(a.z, b.z) + 0.25));
  const midX = (a.x + b.x) / 2 + n(meta.offsetX);
  const midY = (a.y + b.y) / 2 + n(meta.offsetY);
  const routeMeta = { offsetX: n(meta.offsetX), offsetY: n(meta.offsetY), elevation };
  return [
    { ...a, role: 'start', routeMeta },
    { x: a.x, y: a.y, z: elevation, role: 'riserStart' },
    { x: midX, y: a.y, z: elevation, role: 'trunkX1' },
    { x: midX, y: midY, z: elevation, role: 'trunkY' },
    { x: b.x, y: midY, z: elevation, role: 'trunkX2' },
    { x: b.x, y: b.y, z: elevation, role: 'riserEnd' },
    { ...b, role: 'end' },
  ];
}

export function normalizeAttachedNetwork(network, objects) {
  const points = network?.points || [];
  const startId = points[0]?.objectId;
  const endId = points[points.length - 1]?.objectId;
  if (!startId || !endId) return network;
  return { ...network, points: buildAttachedNetworkPoints(network, objects) };
}

export function reflowNetworksForObject(networks, objects, objectId) {
  return (networks || []).map((network) => {
    const points = network.points || [];
    const startId = points[0]?.objectId;
    const endId = points[points.length - 1]?.objectId;
    if (startId !== objectId && endId !== objectId) return network;
    return { ...network, points: buildAttachedNetworkPoints(network, objects) };
  });
}

export function moveNetworkRoute(network, objects, axis, delta) {
  const meta = getNetworkRouteMeta(network, objects);
  if (axis === 'X') meta.offsetX += n(delta);
  else if (axis === 'Y') meta.offsetY += n(delta);
  else meta.elevation = Math.max(0.1, meta.elevation + n(delta));
  return { ...network, points: buildAttachedNetworkPoints(network, objects, meta) };
}

export function reverseNetworkDirection(network) {
  const reversed = [...(network.points || [])].reverse().map((point) => ({ ...point, routeMeta: undefined }));
  if (reversed.length) {
    const oldMeta = network.points?.[0]?.routeMeta || {};
    reversed[0] = { ...reversed[0], role: 'start', routeMeta: { ...oldMeta } };
    reversed[reversed.length - 1] = { ...reversed[reversed.length - 1], role: 'end' };
  }
  return { ...network, points: reversed };
}

export async function persistLab3dNetwork(network) {
  if (!network?.id) return;
  await updateLab3dNetwork(network.id, { points: network.points || [] });
}

export async function persistNetworksForObject(networks, objectId) {
  for (const network of networks || []) {
    const points = network.points || [];
    if (points[0]?.objectId === objectId || points[points.length - 1]?.objectId === objectId) {
      await persistLab3dNetwork(network);
    }
  }
}

export async function upgradeNetworkGeometry(sceneId, objects) {
  const db = await openAppDatabase();
  const rows = await db.getAllAsync(`SELECT * FROM lab3d_networks WHERE scene_id=?`, [sceneId]);
  const upgraded = [];
  for (const row of rows) {
    const network = parseNetwork(row);
    const normalized = normalizeAttachedNetwork(network, objects);
    upgraded.push(normalized);
    if (normalized !== network && normalized.points !== network.points) {
      await updateLab3dNetwork(network.id, { points: normalized.points });
    }
  }
  return upgraded;
}
