import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';

function estPhotoGeree(uri) {
  return !!uri && !!FileSystem.documentDirectory && String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`);
}

export async function supprimerPhotoComplete(photoId) {
  if (!photoId) return false;
  const db = await openAppDatabase();
  const photo = await db.getFirstAsync('SELECT id, uri FROM photos WHERE id=?', [photoId]);
  if (!photo) return false;

  await db.runAsync('DELETE FROM photos WHERE id=?', [photoId]);

  if (estPhotoGeree(photo.uri)) {
    try { await FileSystem.deleteAsync(photo.uri, { idempotent: true }); } catch {}
  }
  return true;
}
