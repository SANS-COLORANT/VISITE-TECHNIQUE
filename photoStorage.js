/** Stockage local persistant des photos de visite. */

import * as FileSystem from 'expo-file-system/legacy';

const PHOTO_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}metra-photos/` : null;

async function rendrePhotoPersistante(uri) {
  if (!PHOTO_DIR || !uri) return uri;
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  const extension = (String(uri).match(/\.([a-zA-Z0-9]+)(?:\?|$)/) || [])[1] || 'jpg';
  const nom = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const destination = PHOTO_DIR + nom;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

async function supprimerFichierPhoto(uri) {
  if (!PHOTO_DIR || !uri || !String(uri).startsWith(PHOTO_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Un fichier déjà absent ne doit jamais bloquer la visite.
  }
}

export { PHOTO_DIR, rendrePhotoPersistante, supprimerFichierPhoto };
