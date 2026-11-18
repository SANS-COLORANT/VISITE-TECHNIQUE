/**
 * Standalone local-only photo capture. Used by the bottom bar and Photos tab.
 * A cancelled camera never creates an empty photo or a reserve.
 */
import { ajouterPhoto } from './db.js';
import { prendrePhoto, preparerPhotoNommee } from './PhotoButton.js';
import { confirmerPhotoJournalisee, journaliserPhotoEnAttente } from './photoPersistenceJournal.js';
import { beginExternalSave, endExternalSave } from './saveActivity.js';
import { upsertRuntimePhoto, removeRuntimePhoto, replaceRuntimePhoto } from './photoRuntimeCache.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { prewarmPhotoCaptureContext } from './photoCaptureContext.js';
import { feedback } from './fieldFeedback.js';

const ongoingCapture = new Set();
export async function capturerPhotoLibre(visiteId, onError = null, context = null, options = null) {
  // The origin is opt-in and visit-scoped. A global free photo keeps null.
  const candidate = String(context?.entiteKey || '');
  // Match only a real equipment ID; preserve the privacy of every other photo.
  const entiteKey = /^equipement\|\|[^|]+$/.test(candidate)
    ? candidate : null;
  const labelParDefaut = entiteKey
    ? (String(context?.label || 'Photo CTA').trim() || 'Photo CTA') : 'Libre';
  const titreImporte = String(options?.titre || '').trim();
  const labelPhoto = titreImporte || labelParDefaut;
  const uriImportee = String(options?.uri || '').trim();
  const id = String(visiteId || '');
  if (!id || ongoingCapture.has(id)) return false;
  ongoingCapture.add(id);
  try {
    if (!uriImportee) prewarmCameraRuntime().catch(() => {});
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    const captureUri = uriImportee || await prendrePhoto();
    if (!captureUri) return false;
    const tempId = `photo-pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      id: tempId, visite_id: visiteId, entite_key: entiteKey,
      uri: captureUri, label: labelPhoto, inclure_export: entiteKey ? 1 : 0,
      cree_le: new Date().toISOString(), pending: true,
    };
    upsertRuntimePhoto(visiteId, optimistic);
    // Return to the photo gallery straight away. File copy, SQLite journaling
    // and thumbnails can complete while another capture is prepared.
    const savePromise = (async () => {
      let saveKey = `photo-libre:${visiteId}:${Date.now()}`;
      let journalKey = null;
      beginExternalSave(saveKey);
      try {
        const photo = await preparerPhotoNommee({ visiteId, entiteKey, label: labelPhoto, uri: captureUri, titreImporte: titreImporte || null });
        if (!photo.uri) throw new Error('Photo libre non préparée.');
        const labelDb = photo.nom ? `${labelPhoto}||${photo.nom}` : labelPhoto;
        replaceRuntimePhoto(visiteId, tempId, { ...optimistic, uri: photo.uri, label: labelDb });
        journalKey = await journaliserPhotoEnAttente({ visiteId, entiteKey, uri: photo.uri, labelDb });
        const photoId = await ajouterPhoto(visiteId, entiteKey, photo.uri, labelDb);
        await confirmerPhotoJournalisee(journalKey).catch(() => {});
        journalKey = null;
        replaceRuntimePhoto(visiteId, tempId, { ...optimistic, id: photoId, uri: photo.uri, label: labelDb, pending: false });
        feedback(entiteKey?'Photo CTA enregistrée et rattachée':'Photo libre enregistrée · locale uniquement');
        endExternalSave(saveKey);
        saveKey = null;
        return true;
      } catch (error) {
        if (tempId && !journalKey) removeRuntimePhoto(visiteId, tempId);
        if (saveKey) endExternalSave(saveKey, error);
        onError?.(error);
        return false;
      }
    })();
    // Gallery imports are awaited so their compressed temporary file can be
    // cleaned only after the durable METRA copy and SQLite insert finish.
    if (uriImportee) return await savePromise;
    void savePromise;
    return true;
  } finally {
    ongoingCapture.delete(id);
  }
}
