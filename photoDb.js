import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';
import { supprimerCopiePhotoDocuments } from './photoDocumentsStorage.js';

function estPhotoGeree(uri) {
  return !!uri && !!FileSystem.documentDirectory && String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`);
}

export async function supprimerPhotoComplete(photoId) {
  if (!photoId) return false;
  const db = await openAppDatabase();
  const photo = await db.getFirstAsync('SELECT id, uri FROM photos WHERE id=?', [photoId]);
  if (!photo) return false;

  await db.runAsync('DELETE FROM photos WHERE id=?', [photoId]);
  await supprimerCopiePhotoDocuments(photo.uri).catch(() => {});

  if (estPhotoGeree(photo.uri)) {
    try { await FileSystem.deleteAsync(photo.uri, { idempotent: true }); } catch {}
  }
  return true;
}

export async function supprimerPhotosEntiteComplete(visiteId, entiteKey) {
  if (!visiteId || !entiteKey) return 0;
  const db = await openAppDatabase();
  const photos = await db.getAllAsync(
    'SELECT id FROM photos WHERE visite_id=? AND entite_key=?',
    [visiteId, entiteKey]
  );
  for (const photo of photos || []) await supprimerPhotoComplete(photo.id);
  return photos?.length || 0;
}
