import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { zip, unzip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { DATABASE_NAME, DATABASE_SCHEMA_VERSION } from './database/constants.js';
import { closeAppDatabase, openAppDatabase, verifyDatabaseIntegrity } from './database/index.js';

const BACKUP_FORMAT = 'visite-technique-backup';
const BACKUP_FORMAT_VERSION = 1;
const PHOTOS_RELATIVE_ROOT = 'visite-technique/photos/';

function horodatageSauvegarde(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}`;
}

function cheminBaseSQLite() {
  return `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
}

function cheminPhotos() {
  return `${FileSystem.documentDirectory}${PHOTOS_RELATIVE_ROOT}`;
}

function cheminNatif(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

async function existe(uri) {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

async function nettoyerDossier(uri) {
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function nettoyerJournauxSQLite(baseUri = cheminBaseSQLite()) {
  await Promise.all([
    FileSystem.deleteAsync(`${baseUri}-wal`, { idempotent: true }).catch(()=>{}),
    FileSystem.deleteAsync(`${baseUri}-shm`, { idempotent: true }).catch(()=>{}),
    FileSystem.deleteAsync(`${baseUri}-journal`, { idempotent: true }).catch(()=>{}),
  ]);
}

async function partagerFichier(uri, titre, mimeType = 'application/octet-stream') {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Le partage de fichiers est indisponible sur cet appareil.');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: titre });
}

/**
 * Exporte la base seule dans le cache Android, ouvre la feuille de partage puis
 * détruit la copie temporaire. La sauvegarde durable est celle choisie par
 * l'utilisateur dans Drive, OneDrive, mail ou stockage externe.
 */
export async function exporterSauvegardeBase() {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const source = cheminBaseSQLite();
  if (!(await existe(source))) throw new Error('Fichier de base SQLite introuvable');

  const dossier = `${FileSystem.cacheDirectory}vt-share/`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = `${dossier}Visite_Technique_${horodatageSauvegarde()}.db`;
  try {
    await FileSystem.copyAsync({ from: source, to: destination });
    await partagerFichier(destination, 'Sauvegarder les données Visite Technique');
    return { nom: destination.split('/').pop(), partage: true };
  } finally {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(()=>{});
  }
}

/** Archive complète, générée nativement sans charger les JPEG en mémoire JS. */
export async function exporterSauvegardeComplete() {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const sourceDb = cheminBaseSQLite();
  if (!(await existe(sourceDb))) throw new Error('Fichier de base SQLite introuvable');

  const stamp = horodatageSauvegarde();
  const travail = `${FileSystem.cacheDirectory}vt-backup-${stamp}/`;
  const dossierDb = `${travail}database/`;
  const dossierPhotos = `${travail}photos/`;
  const archiveUri = `${FileSystem.cacheDirectory}Visite_Technique_Complet_${stamp}.zip`;

  await nettoyerDossier(travail);
  try {
    await FileSystem.makeDirectoryAsync(dossierDb, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceDb, to: `${dossierDb}${DATABASE_NAME}` });

    const photosSource = cheminPhotos();
    if (await existe(photosSource)) await FileSystem.copyAsync({ from: photosSource, to: dossierPhotos });
    else await FileSystem.makeDirectoryAsync(dossierPhotos, { intermediates: true });

    const comptePhotos = await db.getFirstAsync('SELECT COUNT(*) AS n FROM photos');
    const compteVisites = await db.getFirstAsync('SELECT COUNT(*) AS n FROM visites');
    const manifeste = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: DATABASE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      database: `database/${DATABASE_NAME}`,
      photosRoot: 'photos/',
      counts: { visites: Number(compteVisites?.n || 0), photos: Number(comptePhotos?.n || 0) },
    };
    await FileSystem.writeAsStringAsync(`${travail}manifest.json`, JSON.stringify(manifeste, null, 2));

    if (await existe(archiveUri)) await FileSystem.deleteAsync(archiveUri, { idempotent: true });
    await zip(cheminNatif(travail), cheminNatif(archiveUri));
    await partagerFichier(archiveUri, 'Sauvegarde complète Visite Technique', 'application/zip');
    return { uri: null, nom: archiveUri.split('/').pop(), manifeste, partage: true };
  } finally {
    await FileSystem.deleteAsync(travail, { idempotent: true }).catch(()=>{});
    await FileSystem.deleteAsync(archiveUri, { idempotent: true }).catch(()=>{});
  }
}

async function lireEtVerifierManifeste(dossier) {
  const uri = `${dossier}manifest.json`;
  if (!(await existe(uri))) throw new Error('Cette archive ne contient pas de manifeste Visite Technique.');
  const manifeste = JSON.parse(await FileSystem.readAsStringAsync(uri));
  if (manifeste?.format !== BACKUP_FORMAT || Number(manifeste?.formatVersion) !== BACKUP_FORMAT_VERSION) throw new Error('Format de sauvegarde non reconnu.');
  const version = Number(manifeste.schemaVersion || 0);
  if (!Number.isFinite(version) || version < 1) throw new Error('Version de base absente ou invalide.');
  if (version > DATABASE_SCHEMA_VERSION) throw new Error(`Cette sauvegarde utilise une base plus récente (v${version}) que l’application (v${DATABASE_SCHEMA_VERSION}).`);
  const dbBackup = `${dossier}${manifeste.database || `database/${DATABASE_NAME}`}`;
  if (!(await existe(dbBackup))) throw new Error('Base SQLite absente de la sauvegarde.');
  return { manifeste, dbBackup, photosBackup: `${dossier}${manifeste.photosRoot || 'photos/'}` };
}

async function rebaserUrisPhotos(db) {
  const rows = await db.getAllAsync('SELECT id, uri FROM photos');
  const nouvelleRacine = cheminPhotos();
  for (const row of rows) {
    const uri = String(row.uri || '');
    const marqueur = `/${PHOTOS_RELATIVE_ROOT}`;
    const position = uri.indexOf(marqueur);
    if (position < 0) continue;
    const relatif = uri.slice(position + marqueur.length);
    await db.runAsync('UPDATE photos SET uri=? WHERE id=?', [`${nouvelleRacine}${relatif}`, row.id]);
  }
}

export async function choisirEtRestaurerSauvegardeComplete() {
  const selection = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;
  const asset = selection.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier de sauvegarde inaccessible.');

  const restauration = `${FileSystem.cacheDirectory}vt-restore-${Date.now()}/`;
  await nettoyerDossier(restauration);
  await unzip(cheminNatif(asset.uri), cheminNatif(restauration));
  const { manifeste, dbBackup, photosBackup } = await lireEtVerifierManifeste(restauration);

  const dbCourante = await getDb();
  await dbCourante.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const sourceActuelle = cheminBaseSQLite();
  const securite = `${FileSystem.cacheDirectory}vt-before-restore-${Date.now()}/`;
  await nettoyerDossier(securite);
  await FileSystem.copyAsync({ from: sourceActuelle, to: `${securite}${DATABASE_NAME}` });
  const photosActuelles = cheminPhotos();
  if (await existe(photosActuelles)) await FileSystem.copyAsync({ from: photosActuelles, to: `${securite}photos/` });

  let remplacementCommence = false;
  try {
    await closeAppDatabase();
    remplacementCommence = true;
    await nettoyerJournauxSQLite(sourceActuelle);

    await FileSystem.copyAsync({ from: dbBackup, to: sourceActuelle });
    await FileSystem.deleteAsync(photosActuelles, { idempotent: true });
    if (await existe(photosBackup)) await FileSystem.copyAsync({ from: photosBackup, to: photosActuelles });
    else await FileSystem.makeDirectoryAsync(photosActuelles, { intermediates: true });

    const dbRestauree = await openAppDatabase();
    await rebaserUrisPhotos(dbRestauree);
    const controle = await verifyDatabaseIntegrity(dbRestauree);
    if (!controle.integrityOk || !controle.foreignKeysOk) throw new Error('La base restaurée n’a pas passé le contrôle d’intégrité.');
    await dbRestauree.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    await closeAppDatabase();
    await nettoyerJournauxSQLite(sourceActuelle);

    await FileSystem.deleteAsync(restauration, { idempotent: true });
    await FileSystem.deleteAsync(securite, { idempotent: true });
    return { manifeste, controle, restartRequired: true };
  } catch (error) {
    if (remplacementCommence) {
      try {
        await closeAppDatabase();
        await nettoyerJournauxSQLite(sourceActuelle);
        await FileSystem.copyAsync({ from: `${securite}${DATABASE_NAME}`, to: sourceActuelle });
        await FileSystem.deleteAsync(photosActuelles, { idempotent: true });
        if (await existe(`${securite}photos/`)) await FileSystem.copyAsync({ from: `${securite}photos/`, to: photosActuelles });
      } catch {}
    }
    throw error;
  } finally {
    try { await FileSystem.deleteAsync(restauration, { idempotent: true }); } catch {}
  }
}
