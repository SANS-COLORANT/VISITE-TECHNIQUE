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

/** Editable photo captions are canonical for both PDF and Intranet upload. */
export async function renommerPhotoVisite(visiteId, photoId, libelle) {
  const db = await openAppDatabase();
  const photo = await db.getFirstAsync('SELECT * FROM photos WHERE id=? AND visite_id=?', [photoId, visiteId]);
  if (!photo) throw new Error('Photo introuvable dans cette visite.');
  const { photoLabelAvecNomFichier, legendePhotoEditable } = require('./photoExportPolicy.js');
  const label = photoLabelAvecNomFichier(photo, libelle);
  await db.runAsync('UPDATE photos SET label=? WHERE id=? AND visite_id=?', [label, photoId, visiteId]);
  await db.runAsync(`UPDATE api_visit_photo_outbox SET description=?,updated_at=datetime('now')
    WHERE photo_id=? AND status NOT IN ('synced','sending')`,
    [legendePhotoEditable({ label }).slice(0, 255), photoId]);
  const remote = await db.getFirstAsync(`SELECT status FROM api_visit_photo_outbox WHERE photo_id=?`, [photoId]);
  return { label, dejaEnvoyee: remote?.status === 'synced' };
}

/** Opt-in for free photos only; explicit user action is required before export. */
export async function reglerPublicationPhotoLibre(visiteId, photoId, inclure) {
  const db = await openAppDatabase();
  const photo = await db.getFirstAsync('SELECT * FROM photos WHERE id=? AND visite_id=?', [photoId, visiteId]);
  if (!photo) throw new Error('Photo introuvable dans cette visite.');
  if (String(photo.entite_key || '').trim()) throw new Error('Seules les photos libres ont ce réglage.');
  const remote = await db.getFirstAsync('SELECT status FROM api_visit_photo_outbox WHERE photo_id=?', [photoId]);
  if (!inclure && ['synced','sending'].includes(remote?.status))
    throw new Error('Cette photo est déjà envoyée ou en cours d’envoi sur l’Intranet. Elle ne peut pas être rendue locale rétroactivement.');
  await db.runAsync('UPDATE photos SET inclure_export=? WHERE id=? AND visite_id=?',
    [inclure ? 1 : 0, photoId, visiteId]);
  if (!inclure) await db.runAsync(`DELETE FROM api_visit_photo_outbox
    WHERE photo_id=? AND status NOT IN ('synced','sending')`, [photoId]);
  return { inclure_export: inclure ? 1 : 0 };
}
