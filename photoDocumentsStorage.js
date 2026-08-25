import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';

const DOSSIER_META_KEY = 'photo_documents_folder_uri';
const PHOTO_META_PREFIX = 'photo_documents_uri::';
const DOSSIER_NOM = 'Visite Technique - Photos';
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

function estSousDossier(uri, nom) {
  try {
    const decode = decodeURIComponent(String(uri || ''));
    return decode.endsWith(`/${nom}`) || decode.endsWith(`:${nom}`);
  } catch {
    return false;
  }
}

async function trouverOuCreerSousDossier(baseUri) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF) return baseUri;

  try {
    const enfants = await SAF.readDirectoryAsync(baseUri);
    const existant = (enfants || []).find((uri) => estSousDossier(uri, DOSSIER_NOM));
    if (existant) return existant;
  } catch {}

  if (typeof SAF.makeDirectoryAsync === 'function') {
    try {
      return await SAF.makeDirectoryAsync(baseUri, DOSSIER_NOM);
    } catch {}
  }

  // Repli : le dossier choisi par l'utilisateur reste un emplacement Documents valide.
  return baseUri;
}

export async function obtenirDossierPhotosDocuments() {
  return lireMeta(DOSSIER_META_KEY);
}

export async function garantirDossierPhotosDocuments() {
  const deja = await obtenirDossierPhotosDocuments();
  if (deja) return deja;

  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) return null;

  let initialUri;
  try {
    initialUri = SAF.getUriForDirectoryInRoot?.('Documents');
  } catch {
    initialUri = undefined;
  }

  const permission = await SAF.requestDirectoryPermissionsAsync(initialUri);
  if (!permission?.granted || !permission?.directoryUri) return null;

  const dossier = await trouverOuCreerSousDossier(permission.directoryUri);
  await ecrireMeta(DOSSIER_META_KEY, dossier);
  return dossier;
}

export async function copierPhotoDansDocuments(uriSource, nomFichier) {
  if (!uriSource || !nomFichier) return null;
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.createFileAsync) return null;

  const dossier = await garantirDossierPhotosDocuments();
  if (!dossier) return null;

  try {
    const base64 = await FileSystem.readAsStringAsync(uriSource, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const destination = await SAF.createFileAsync(dossier, nomFichier, JPEG_MIME);
    await FileSystem.writeAsStringAsync(destination, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await ecrireMeta(`${PHOTO_META_PREFIX}${nomFichier}`, destination);
    return destination;
  } catch (error) {
    // Une autorisation SAF peut être révoquée par Android. On force alors une
    // nouvelle sélection au prochain cliché sans compromettre la copie interne.
    await supprimerMeta(DOSSIER_META_KEY).catch(() => {});
    console.warn('Copie photo vers Documents impossible', error);
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

  try {
    await FileSystem.deleteAsync(uriExterne, { idempotent: true });
  } catch (error) {
    console.warn('Suppression copie Documents impossible', error);
  }
  await supprimerMeta(key).catch(() => {});
  return true;
}
