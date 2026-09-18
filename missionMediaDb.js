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

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
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

async function resolveMissionContext(db, {
  missionId,
  siteId = null,
  visitId = null,
  pointId = null,
  equipmentId = null,
  locationId = null,
  actionId = null,
  geometryId = null,
} = {}) {
  if (!missionId) throw new Error('Mission requise.');
  const mission = await db.getFirstAsync('SELECT id,label FROM missions WHERE id=?', [missionId]);
  if (!mission) throw new Error('Mission introuvable.');

  const ctx = {
    missionId,
    siteId: clean(siteId),
    visitId: clean(visitId),
    pointId: clean(pointId),
    equipmentId: clean(equipmentId),
    locationId: clean(locationId),
    actionId: clean(actionId),
    geometryId: clean(geometryId),
  };

  if (ctx.geometryId) {
    const row = await db.getFirstAsync(
      'SELECT mission_id,site_id,location_id,equipment_id,point_id,action_id FROM mission_geometries WHERE id=?',
      [ctx.geometryId]
    );
    if (row && String(row.mission_id) === String(missionId)) {
      ctx.siteId = ctx.siteId || row.site_id || null;
      ctx.locationId = ctx.locationId || row.location_id || null;
      ctx.equipmentId = ctx.equipmentId || row.equipment_id || null;
      ctx.pointId = ctx.pointId || row.point_id || null;
      ctx.actionId = ctx.actionId || row.action_id || null;
    }
  }

  if (ctx.actionId) {
    const row = await db.getFirstAsync(
      'SELECT mission_id,site_id,location_id,equipment_id,source_point_id FROM mission_actions WHERE id=?',
      [ctx.actionId]
    );
    if (!row || String(row.mission_id) !== String(missionId)) throw new Error('Action Mission introuvable.');
    ctx.siteId = ctx.siteId || row.site_id || null;
    ctx.locationId = ctx.locationId || row.location_id || null;
    ctx.equipmentId = ctx.equipmentId || row.equipment_id || null;
    ctx.pointId = ctx.pointId || row.source_point_id || null;
  }

  if (ctx.pointId) {
    const row = await db.getFirstAsync(
      'SELECT mission_id,site_id,visit_origin_id,location_id,equipment_id FROM mission_points WHERE id=?',
      [ctx.pointId]
    );
    if (!row || String(row.mission_id) !== String(missionId)) throw new Error('Point Mission introuvable.');
    ctx.siteId = ctx.siteId || row.site_id || null;
    ctx.visitId = ctx.visitId || row.visit_origin_id || null;
    ctx.locationId = ctx.locationId || row.location_id || null;
    ctx.equipmentId = ctx.equipmentId || row.equipment_id || null;
  }

  if (ctx.equipmentId) {
    const row = await db.getFirstAsync(
      'SELECT e.site_id,e.location_id FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
      [ctx.equipmentId, missionId]
    );
    if (!row) throw new Error('Équipement Mission introuvable.');
    ctx.siteId = ctx.siteId || row.site_id || null;
    ctx.locationId = ctx.locationId || row.location_id || null;
  }

  if (ctx.locationId) {
    const row = await db.getFirstAsync(
      'SELECT l.site_id FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id WHERE l.id=? AND ml.mission_id=?',
      [ctx.locationId, missionId]
    );
    if (!row) throw new Error('Localisation Mission introuvable.');
    ctx.siteId = ctx.siteId || row.site_id || null;
  }

  if (ctx.visitId) {
    const row = await db.getFirstAsync('SELECT mission_id,site_id FROM mission_visits WHERE id=?', [ctx.visitId]);
    if (!row || String(row.mission_id) !== String(missionId)) throw new Error('Visite Mission introuvable.');
    ctx.siteId = ctx.siteId || row.site_id || null;
  }

  if (ctx.siteId) {
    const linked = await db.getFirstAsync('SELECT 1 AS ok FROM mission_site_links WHERE mission_id=? AND site_id=?', [missionId, ctx.siteId]);
    if (!linked) throw new Error('Le Site ne correspond pas à cette Mission.');
  }

  return { mission, ...ctx };
}

export async function capturerPhotoMission({
  missionId,
  siteId = null,
  visitId = null,
  pointId = null,
  equipmentId = null,
  locationId = null,
  actionId = null,
  geometryId = null,
  phaseRole = null,
  label = 'Photo',
  type = 'terrain',
} = {}) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("L'accès à l'appareil photo est nécessaire.");
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false, base64: false });
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const db = await getDb();
  const ctx = await resolveMissionContext(db, { missionId, siteId, visitId, pointId, equipmentId, locationId, actionId, geometryId });

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
    `INSERT INTO mission_photos(
      id,mission_id,site_id,visit_id,point_id,equipment_id,location_id,geometry_id,action_id,phase_role,
      label,type,file_uri,preview_uri,thumbnail_uri,taken_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, missionId, ctx.siteId, ctx.visitId, ctx.pointId, ctx.equipmentId, ctx.locationId, ctx.geometryId, ctx.actionId, clean(phaseRole),
      label, type, originalUri, previewUri, thumbnailUri, now,
    ]
  );
  return {
    id,
    fileUri: originalUri,
    previewUri,
    thumbnailUri,
    takenAt: now,
    context: {
      siteId: ctx.siteId,
      visitId: ctx.visitId,
      pointId: ctx.pointId,
      equipmentId: ctx.equipmentId,
      locationId: ctx.locationId,
      actionId: ctx.actionId,
      geometryId: ctx.geometryId,
      phaseRole: clean(phaseRole),
    },
  };
}

export async function listerPhotosMission({
  missionId,
  visitId = null,
  siteId = null,
  locationId = null,
  pointId = null,
  equipmentId = null,
  actionId = null,
  phaseRole = null,
  limit = 200,
} = {}) {
  const db = await getDb();
  const where = ['mission_id=?'];
  const params = [missionId];
  if (visitId) { where.push('visit_id=?'); params.push(visitId); }
  if (siteId) { where.push('site_id=?'); params.push(siteId); }
  if (locationId) { where.push('location_id=?'); params.push(locationId); }
  if (pointId) { where.push('point_id=?'); params.push(pointId); }
  if (equipmentId) { where.push('equipment_id=?'); params.push(equipmentId); }
  if (actionId) { where.push('action_id=?'); params.push(actionId); }
  if (phaseRole) { where.push('phase_role=?'); params.push(phaseRole); }
  params.push(Math.max(1, Math.min(1000, Number(limit) || 200)));
  return db.getAllAsync(
    `SELECT * FROM mission_photos WHERE ${where.join(' AND ')} ORDER BY COALESCE(taken_at,created_at) DESC LIMIT ?`,
    params
  );
}

export async function supprimerPhotoMission(photoId) {
  const db = await getDb();
  const photo = await db.getFirstAsync('SELECT * FROM mission_photos WHERE id=?', [photoId]);
  if (!photo) return;
  await db.runAsync('DELETE FROM mission_photos WHERE id=?', [photoId]);
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
  equipmentId = null,
  locationId = null,
  type = 'source',
  visibility = 'internal',
} = {}) {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Document non accessible.');

  const db = await getDb();
  const ctx = await resolveMissionContext(db, { missionId, siteId, visitId, pointId, equipmentId, locationId });
  const id = createId('mdoc');
  const folder = await missionFolder(missionId, 'documents');
  const filename = `${stamp()}__${safe(asset.name || 'document')}`;
  const destination = await copyDurable(asset.uri, `${folder}${filename}`);
  await db.runAsync(
    `INSERT INTO mission_documents(
      id,mission_id,site_id,visit_id,point_id,location_id,equipment_id,type,name,source,file_uri,visibility,offline_state,document_date
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, missionId, ctx.siteId, ctx.visitId, ctx.pointId, ctx.locationId, ctx.equipmentId,
      type, asset.name || filename, 'terrain', destination, visibility, 'available_offline', new Date().toISOString().slice(0, 10),
    ]
  );
  return {
    id,
    name: asset.name || filename,
    fileUri: destination,
    context: {
      siteId: ctx.siteId,
      visitId: ctx.visitId,
      pointId: ctx.pointId,
      equipmentId: ctx.equipmentId,
      locationId: ctx.locationId,
    },
  };
}

export async function listerDocumentsMission({
  missionId,
  visitId = null,
  siteId = null,
  locationId = null,
  pointId = null,
  equipmentId = null,
  limit = 200,
} = {}) {
  const db = await getDb();
  const where = ['mission_id=?'];
  const params = [missionId];
  if (visitId) { where.push('visit_id=?'); params.push(visitId); }
  if (siteId) { where.push('site_id=?'); params.push(siteId); }
  if (locationId) { where.push('location_id=?'); params.push(locationId); }
  if (pointId) { where.push('point_id=?'); params.push(pointId); }
  if (equipmentId) { where.push('equipment_id=?'); params.push(equipmentId); }
  params.push(Math.max(1, Math.min(1000, Number(limit) || 200)));
  return db.getAllAsync(
    `SELECT * FROM mission_documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
    params
  );
}
