import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';
import { creerFichierSaf, dossierVisiteMetra } from './metraStorage.js';

const PHOTO_META_PREFIX = 'photo_documents_uri::';
const JPEG_MIME = 'image/jpeg';

async function lireMeta(key) {
  const db = await openAppDatabase();
  const row = await db.getFirstAsync('SELECT value FROM _meta WHERE key=?', [key]);
  return row?.value || null;
}

async function ecrireMeta(key, value) {
  const db = await openAppDatabase();
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, String(value || '')]
  );
}

async function supprimerMeta(key) {
  const db = await openAppDatabase();
  await db.runAsync('DELETE FROM _meta WHERE key=?', [key]);
}

function nomFichierDepuisUri(uri) {
  const brut = String(uri || '').split('?')[0];
  const morceaux = brut.split('/');
  return decodeURIComponent(morceaux[morceaux.length - 1] || '');
}

export async function copierPhotoDansDocuments(uriSource, visiteId, nomFichier) {
  if (!uriSource || !visiteId || !nomFichier) return null;
  try {
    const dossier = await dossierVisiteMetra(visiteId, 'Photos');
    if (!dossier) return null;
    const base64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
    const destination = await creerFichierSaf(dossier, nomFichier, JPEG_MIME, base64);
    await ecrireMeta(`${PHOTO_META_PREFIX}${nomFichier}`, destination);
    return destination;
  } catch (error) {
    // La copie interne de la photo reste canonique. Une autorisation Documents
    // refusée ou révoquée ne doit jamais faire perdre la photo terrain.
    console.warn('Copie photo vers Documents/METRA impossible', error);
    return null;
  }
}

export async function supprimerCopiePhotoDocuments(uriInterneOuNom) {
  const nomFichier = String(uriInterneOuNom || '').includes('/')
    ? nomFichierDepuisUri(uriInterneOuNom)
    : String(uriInterneOuNom || '');
  if (!nomFichier) return false;

  const key = `${PHOTO_META_PREFIX}${nomFichier}`;
  const uriExterne = await lireMeta(key);
  if (!uriExterne) return false;

  try { await FileSystem.deleteAsync(uriExterne, { idempotent: true }); }
  catch (error) { console.warn('Suppression copie Documents impossible', error); }
  await supprimerMeta(key).catch(() => {});
  return true;
}
