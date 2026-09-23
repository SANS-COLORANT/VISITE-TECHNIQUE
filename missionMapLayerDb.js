import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function safe(value = 'layer') {
  return String(value || 'layer')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 100) || 'layer';
}

function nativePath(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

function parse(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

async function missionMapFolder(missionId, child = '') {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const folder = root + 'metra-missions/' + safe(missionId) + '/map/' + child;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  return folder;
}

async function copyDurable(source, destination) {
  const info = await FileSystem.getInfoAsync(destination);
  if (info.exists) await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: source, to: destination });
  return destination;
}

async function findTileRoot(folder, depth = 0) {
  if (depth > 4) return folder;
  const names = await FileSystem.readDirectoryAsync(folder);
  if (names.some((name) => /^\d+$/.test(name))) return folder;
  const dirs = [];
  for (const name of names) {
    const uri = folder + (folder.endsWith('/') ? '' : '/') + name;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.isDirectory) dirs.push(uri + '/');
  }
  if (dirs.length === 1) return findTileRoot(dirs[0], depth + 1);
  for (const dir of dirs) {
    const nested = await FileSystem.readDirectoryAsync(dir);
    if (nested.some((name) => /^\d+$/.test(name))) return dir;
  }
  return folder;
}

async function inspectTileTree(root) {
  const names = await FileSystem.readDirectoryAsync(root);
  const zooms = names.map((name) => Number(name)).filter(Number.isFinite).sort((a,b) => a-b);
  if (!zooms.length) throw new Error('Le ZIP ne contient pas de dossiers XYZ numériques.');
  const z = String(zooms[0]);
  const zFolder = root + (root.endsWith('/') ? '' : '/') + z + '/';
  const xs = (await FileSystem.readDirectoryAsync(zFolder)).filter((name) => /^\d+$/.test(name));
  let extension = 'png';
  if (xs.length) {
    const xFolder = zFolder + xs[0] + '/';
    const files = await FileSystem.readDirectoryAsync(xFolder);
    const tile = files.find((name) => /\.(png|jpe?g|webp)$/i.test(name));
    if (tile) extension = tile.split('.').pop().toLowerCase();
  }
  return { minZoom: zooms[0], maxZoom: zooms[zooms.length - 1], extension };
}

export async function listerCouchesCarteMission(missionId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM mission_map_layers WHERE mission_id=? ORDER BY created_at',
    [missionId]
  );
  return rows.map((row) => ({ ...row, data: parse(row.data_json, {}), style: parse(row.style_json, {}) }));
}

export async function importerRasterMission({ missionId } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['image/png','image/jpeg','image/webp','image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Raster inaccessible.');

  const folder = await missionMapFolder(missionId, 'rasters/');
  const name = Date.now() + '__' + safe(asset.name || 'raster.png');
  const uri = await copyDurable(asset.uri, folder + name);
  const db = await getDb();
  const id = createId('mmap');
  await db.runAsync(
    'INSERT INTO mission_map_layers(id,mission_id,label,type,source_uri,data_json,visible,offline_available,style_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      id, missionId, asset.name || 'Raster local', 'raster', uri,
      JSON.stringify({ bounds: null }),
      1, 1, JSON.stringify({ opacity: 0.75 }),
    ]
  );
  return { id, label: asset.name || 'Raster local', sourceUri: uri };
}

export async function configurerRasterMission(layerId, {
  north,
  south,
  east,
  west,
  opacity = 0.75,
} = {}) {
  const nums = {
    north: Number(String(north).replace(',', '.')),
    south: Number(String(south).replace(',', '.')),
    east: Number(String(east).replace(',', '.')),
    west: Number(String(west).replace(',', '.')),
  };
  if (!Object.values(nums).every(Number.isFinite)) throw new Error('Coordonnées du raster incomplètes.');
  if (nums.north <= nums.south) throw new Error('La latitude Nord doit être supérieure à la latitude Sud.');
  if (nums.east <= nums.west) throw new Error('La longitude Est doit être supérieure à la longitude Ouest.');
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT data_json,style_json FROM mission_map_layers WHERE id=? AND type=?', [layerId, 'raster']);
  if (!row) throw new Error('Couche raster introuvable.');
  const data = { ...parse(row.data_json, {}), bounds: nums };
  const style = { ...parse(row.style_json, {}), opacity: Math.max(0, Math.min(1, Number(opacity) || 0.75)) };
  await db.runAsync(
    "UPDATE mission_map_layers SET data_json=?,style_json=?,updated_at=datetime('now') WHERE id=?",
    [JSON.stringify(data), JSON.stringify(style), layerId]
  );
}

export async function importerTuilesXyzMission({ missionId } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip','application/x-zip-compressed','application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Archive de tuiles inaccessible.');

  const base = await missionMapFolder(missionId, 'tiles/');
  const folder = base + Date.now() + '__' + safe(asset.name || 'xyz_tiles') + '/';
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  await unzip(nativePath(asset.uri), nativePath(folder));

  const root = await findTileRoot(folder);
  const info = await inspectTileTree(root);
  const template = root + (root.endsWith('/') ? '' : '/') + '{z}/{x}/{y}.' + info.extension;
  const db = await getDb();
  const id = createId('mmap');
  await db.runAsync(
    'INSERT INTO mission_map_layers(id,mission_id,label,type,source_uri,data_json,visible,offline_available,style_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      id,
      missionId,
      asset.name || 'Tuiles XYZ hors ligne',
      'xyz_tiles',
      root,
      JSON.stringify({ pathTemplate: template, minZoom: info.minZoom, maxZoom: info.maxZoom, tileSize: 256 }),
      1,
      1,
      JSON.stringify({ opacity: 1 }),
    ]
  );
  return { id, label: asset.name || 'Tuiles XYZ hors ligne', root, ...info };
}

export async function mettreAJourCoucheCarteMission(layerId, changes = {}) {
  const db = await getDb();
  const current = await db.getFirstAsync('SELECT * FROM mission_map_layers WHERE id=?', [layerId]);
  if (!current) throw new Error('Couche cartographique introuvable.');
  const setters = [];
  const values = [];
  if ('label' in changes) { setters.push('label=?'); values.push(clean(changes.label) || current.label); }
  if ('visible' in changes) { setters.push('visible=?'); values.push(changes.visible ? 1 : 0); }
  if ('data' in changes) { setters.push('data_json=?'); values.push(JSON.stringify(changes.data || {})); }
  if ('style' in changes) { setters.push('style_json=?'); values.push(JSON.stringify(changes.style || {})); }
  if (!setters.length) return;
  setters.push("updated_at=datetime('now')");
  values.push(layerId);
  await db.runAsync('UPDATE mission_map_layers SET ' + setters.join(',') + ' WHERE id=?', values);
}

export async function supprimerCoucheCarteMission(layerId) {
  const db = await getDb();
  const layer = await db.getFirstAsync('SELECT * FROM mission_map_layers WHERE id=?', [layerId]);
  if (!layer) return;
  await db.runAsync('DELETE FROM mission_map_layers WHERE id=?', [layerId]);
  const uri = layer.source_uri;
  if (uri && FileSystem.documentDirectory && String(uri).startsWith(FileSystem.documentDirectory)) {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  }
}
