import { getDb } from './db.js';
import { createId } from './database/ids.js';

function parse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function listerPhotosAvecAnnotationsMission(missionId) {
  const db = await getDb();
  const photos = await db.getAllAsync(
    'SELECT * FROM mission_photos WHERE mission_id=? ORDER BY COALESCE(taken_at,created_at) DESC',
    [missionId]
  );
  const annotations = await db.getAllAsync(
    `SELECT a.* FROM mission_photo_annotations a
     JOIN mission_photos p ON p.id=a.photo_id WHERE p.mission_id=?
     ORDER BY a.created_at`,
    [missionId]
  );
  return photos.map((photo) => ({
    ...photo,
    annotations: annotations
      .filter((a) => a.photo_id === photo.id)
      .map((a) => ({
        ...a,
        geometry: parse(a.geometry_json, {}),
        style: parse(a.style_json, {})
      }))
  }));
}

export async function ajouterAnnotationPhotoMission({
  photoId,
  annotationType,
  geometry,
  text = null,
  style = null
} = {}) {
  const db = await getDb();
  const id = createId('mphotoann');
  await db.runAsync(
    'INSERT INTO mission_photo_annotations(id,photo_id,annotation_type,geometry_json,text,style_json) VALUES(?,?,?,?,?,?)',
    [
      id,
      photoId,
      annotationType || 'circle',
      JSON.stringify(geometry || {}),
      text ? String(text) : null,
      style ? JSON.stringify(style) : null
    ]
  );
  return id;
}

export async function supprimerAnnotationPhotoMission(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM mission_photo_annotations WHERE id=?', [id]);
}
