import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { getDb } from './db.js';
import { createId } from './database/ids.js';

function safe(value, fallback = 'item') {
  const out = String(value || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 80);
  return out || fallback;
}

function stamp(date = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

async function missionFolder(missionId, child) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const folder = `${root}metra-missions/${safe(missionId, 'mission')}/${child}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  return folder;
}

async function copyDurable(sourceUri, destination) {
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists) await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}

export async function capturerPhotoMission({
  missionId,
  siteId = null,
  visitId = null,
  pointId = null,
  equipmentId = null,
  label = 'Photo',
  type = 'terrain',
} = {}) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("L'accès à l'appareil photo est nécessaire.");
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false, base64: false });
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const db = await getDb();
  const mission = await db.getFirstAsync(`SELECT id,label FROM missions WHERE id=?`, [missionId]);
  if (!mission) throw new Error('Mission introuvable.');

  const id = createId('mphoto');
  const base = `${safe(label, 'Photo')}__${stamp()}__${safe(id)}`;
  const folder = await missionFolder(missionId, 'photos');
  const originalUri = await copyDurable(result.assets[0].uri, `${folder}${base}.jpg`);

  let previewUri = null;
  let thumbnailUri = null;
  try {
    const preview = await ImageManipulator.manipulateAsync(originalUri, [{ resize: { width: 1280 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG });
    previewUri = await copyDurable(preview.uri, `${folder}${base}__preview.jpg`);
    const thumb = await ImageManipulator.manipulateAsync(originalUri, [{ resize: { width: 360 } }], { compress: 0.62, format: ImageManipulator.SaveFormat.JPEG });
    thumbnailUri = await copyDurable(thumb.uri, `${folder}${base}__thumb.jpg`);
  } catch {
    previewUri = originalUri;
    thumbnailUri = originalUri;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO mission_photos(id,mission_id,site_id,visit_id,point_id,equipment_id,label,type,file_uri,preview_uri,thumbnail_uri,taken_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, siteId, visitId, pointId, equipmentId, label, type, originalUri, previewUri, thumbnailUri, now]
  );
  return { id, fileUri: originalUri, previewUri, thumbnailUri, takenAt: now };
}

export async function listerPhotosMission({ missionId, visitId = null, pointId = null, equipmentId = null, limit = 200 } = {}) {
  const db = await getDb();
  const where = ['mission_id=?'];
  const params = [missionId];
  if (visitId) { where.push('visit_id=?'); params.push(visitId); }
  if (pointId) { where.push('point_id=?'); params.push(pointId); }
  if (equipmentId) { where.push('equipment_id=?'); params.push(equipmentId); }
  params.push(Math.max(1, Math.min(500, Number(limit) || 200)));
  return db.getAllAsync(
    `SELECT * FROM mission_photos WHERE ${where.join(' AND ')} ORDER BY COALESCE(taken_at,created_at) DESC LIMIT ?`,
    params
  );
}

export async function supprimerPhotoMission(photoId) {
  const db = await getDb();
  const photo = await db.getFirstAsync(`SELECT * FROM mission_photos WHERE id=?`, [photoId]);
  if (!photo) return;
  await db.runAsync(`DELETE FROM mission_photos WHERE id=?`, [photoId]);
  for (const uri of [photo.file_uri, photo.preview_uri, photo.thumbnail_uri]) {
    if (!uri || !FileSystem.documentDirectory || !String(uri).startsWith(FileSystem.documentDirectory)) continue;
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  }
}

export async function choisirEtAjouterDocumentMission({
  missionId,
  siteId = null,
  visitId = null,
  pointId = null,
  type = 'source',
  visibility = 'internal',
} = {}) {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Document non accessible.');

  const db = await getDb();
  const id = createId('mdoc');
  const folder = await missionFolder(missionId, 'documents');
  const filename = `${stamp()}__${safe(asset.name || 'document')}`;
  const destination = await copyDurable(asset.uri, `${folder}${filename}`);
  await db.runAsync(
    `INSERT INTO mission_documents(id,mission_id,site_id,visit_id,point_id,type,name,source,file_uri,visibility,offline_state,document_date)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, siteId, visitId, pointId, type, asset.name || filename, 'terrain', destination, visibility, 'available_offline', new Date().toISOString().slice(0, 10)]
  );
  return { id, name: asset.name || filename, fileUri: destination };
}

export async function listerDocumentsMission({ missionId, visitId = null, pointId = null, limit = 200 } = {}) {
  const db = await getDb();
  const where = ['mission_id=?'];
  const params = [missionId];
  if (visitId) { where.push('visit_id=?'); params.push(visitId); }
  if (pointId) { where.push('point_id=?'); params.push(pointId); }
  params.push(Math.max(1, Math.min(500, Number(limit) || 200)));
  return db.getAllAsync(`SELECT * FROM mission_documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`, params);
}
