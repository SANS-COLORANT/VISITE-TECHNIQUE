
import { METRA_PLAY_SECURE_BUILD } from './playSecurityRuntime.generated.js';

function refuserExportNonChiffre() {
  if (METRA_PLAY_SECURE_BUILD) throw new Error('Sauvegarde non chiffrée désactivée dans METRA Google Play. Synchronisez les visites avec l’Intranet ; une sauvegarde chiffrée nécessitera un développement dédié.');
}
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { zipWithPassword, unzipWithPassword, unzip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { DATABASE_NAME, DATABASE_SCHEMA_VERSION } from './database/constants.js';
import { closeAppDatabase, openAppDatabase, verifyDatabaseIntegrity } from './database/index.js';

const BACKUP_FORMAT = 'visite-technique-backup';
const BACKUP_FORMAT_VERSION = 2;
const LEGACY_BACKUP_VERSION = 1;
const BACKUP_ENCRYPTION = 'AES-256';
const DURABLE_FOLDERS = Object.freeze([
  { source: 'visite-technique/', archive: 'visite-technique/' },
  { source: 'metra-missions/', archive: 'metra-missions/' },
]);
let backupBusy = false;

function verifierMotDePasse(password) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 256) throw new Error('Mot de passe de sauvegarde : 12 à 256 caractères requis. Il ne peut pas être récupéré par METRA.');
  return value;
}

function safeArchiveRelative(path, field) {
  const value = String(path || '').replace(/\\/g, '/');
  if (!value || value.startsWith('/') || value.startsWith('./') || value.includes('//') ||
      value.split('/').some(part => part === '..' || part === '.' || !part) ||
      /^[A-Za-z]:/.test(value) || /[\x00-\x1F]/.test(value)) throw new Error(`Chemin non sûr dans l’archive (${field}).`);
  return value;
}

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
  refuserExportNonChiffre();
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
export async function exporterSauvegardeComplete({ password } = {}) {
  const secret = verifierMotDePasse(password);
  if (backupBusy) throw new Error('Une sauvegarde ou restauration est déjà en cours.');
  backupBusy = true;
  try {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const controleSource = await verifyDatabaseIntegrity(db);
  if (!controleSource.integrityOk || !controleSource.foreignKeysOk) throw new Error('Base locale non intègre : sauvegarde arrêtée pour préserver les données.');
  const sourceDb = cheminBaseSQLite();
  if (!(await existe(sourceDb))) throw new Error('Fichier de base SQLite introuvable');

  const stamp = horodatageSauvegarde();
  const travail = `${FileSystem.cacheDirectory}vt-backup-${stamp}/`;
  const dossierDb = `${travail}database/`;
  const dossierPhotos = `${travail}visite-technique/photos/`;
  const archiveUri = `${FileSystem.cacheDirectory}METRA_Complete_AES256_${stamp}.zip`;

  await nettoyerDossier(travail);
  try {
    await FileSystem.makeDirectoryAsync(dossierDb, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceDb, to: `${dossierDb}${DATABASE_NAME}` });

    const archivesDisponibles = [];
    for (const folder of DURABLE_FOLDERS) {
      const from = `${FileSystem.documentDirectory}${folder.source}`;
      const to = `${travail}${folder.archive}`;
      if (await existe(from)) {
        await FileSystem.copyAsync({ from, to });
        archivesDisponibles.push(folder.archive);
      }
    }
    if (!(await existe(dossierPhotos))) await FileSystem.makeDirectoryAsync(dossierPhotos, { intermediates: true });

    const comptePhotos = await db.getFirstAsync('SELECT COUNT(*) AS n FROM photos');
    const compteVisites = await db.getFirstAsync('SELECT COUNT(*) AS n FROM visites');
    const manifeste = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: DATABASE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      database: `database/${DATABASE_NAME}`,
      photosRoot: 'visite-technique/photos/',
      durableRoots: archivesDisponibles,
      encryption: BACKUP_ENCRYPTION,
      counts: { visites: Number(compteVisites?.n || 0), photos: Number(comptePhotos?.n || 0) },
    };
    await FileSystem.writeAsStringAsync(`${travail}manifest.json`, JSON.stringify(manifeste, null, 2));

    if (await existe(archiveUri)) await FileSystem.deleteAsync(archiveUri, { idempotent: true });
    await zipWithPassword(cheminNatif(travail), cheminNatif(archiveUri), secret, BACKUP_ENCRYPTION);
    const archiveInfo = await FileSystem.getInfoAsync(archiveUri, { size: true });
    if (!archiveInfo.exists || Number(archiveInfo.size || 0) < 128) throw new Error('Archive ZIP chiffrée incomplète : aucun partage effectué.');
    await partagerFichier(archiveUri, 'Sauvegarde complète Visite Technique', 'application/zip');
    return { uri: null, nom: archiveUri.split('/').pop(), manifeste, partage: true, encryption: BACKUP_ENCRYPTION };
  } finally {
    await FileSystem.deleteAsync(travail, { idempotent: true }).catch(()=>{});
    await FileSystem.deleteAsync(archiveUri, { idempotent: true }).catch(()=>{});
  }
  } finally { backupBusy = false; }
}

async function lireEtVerifierManifeste(dossier) {
  const uri = `${dossier}manifest.json`;
  if (!(await existe(uri))) throw new Error('Cette archive ne contient pas de manifeste Visite Technique.');
  const manifeste = JSON.parse(await FileSystem.readAsStringAsync(uri));
  const archiveVersion = Number(manifeste?.formatVersion);
  if (manifeste?.format !== BACKUP_FORMAT || ![BACKUP_FORMAT_VERSION, LEGACY_BACKUP_VERSION].includes(archiveVersion)) throw new Error('Format de sauvegarde non reconnu.');
  if (archiveVersion === BACKUP_FORMAT_VERSION && manifeste?.encryption !== BACKUP_ENCRYPTION) throw new Error('Le manifeste de sauvegarde chiffrée est invalide.');
  const version = Number(manifeste.schemaVersion || 0);
  if (!Number.isFinite(version) || version < 1) throw new Error('Version de base absente ou invalide.');
  if (version > DATABASE_SCHEMA_VERSION) throw new Error(`Cette sauvegarde utilise une base plus récente (v${version}) que l’application (v${DATABASE_SCHEMA_VERSION}).`);
  const dbRelative = safeArchiveRelative(manifeste.database || `database/${DATABASE_NAME}`, 'database');
  if (dbRelative !== `database/${DATABASE_NAME}`) throw new Error('Emplacement SQLite inattendu dans l’archive.');
  const photosRelative = safeArchiveRelative(manifeste.photosRoot || 'photos/', 'photosRoot');
  if (![ 'photos/', 'visite-technique/photos/' ].includes(photosRelative.endsWith('/') ? photosRelative : `${photosRelative}/`)) throw new Error('Emplacement photos inattendu.');
  const dbBackup = `${dossier}${dbRelative}`;
  if (!(await existe(dbBackup))) throw new Error('Base SQLite absente de la sauvegarde.');
  return { manifeste, dbBackup, photosBackup: `${dossier}${photosRelative}`, archiveVersion };
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
  refuserExportNonChiffre();
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
    // Indiquer au panneau appelant si SQLite et les photos ont pu être touchées.
    // Une erreur avant sélection/validation de l'archive ne justifie jamais
    // d'imposer la fermeture de METRA.
    if (remplacementCommence && error && typeof error === 'object') {
      error.restoreTouchedDatabase = true;
    }
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

/*
 * Sauvegarde automatique quotidienne de la base (sans les photos) dans un
 * dossier du téléphone choisi une fois (Téléchargements, carte SD, dossier
 * synchronisé…) : elle survit à une désinstallation de l'application.
 * Les 7 dernières copies sont conservées.
 */
const AUTO_PREFIX = 'Visite_Technique_auto_';
const AUTO_KEEP = 7;
const AUTO_MAX_BYTES = 80 * 1024 * 1024;
let autoEnCours = false;

export async function choisirDossierSauvegardeAuto() {
  refuserExportNonChiffre();
  const { getPrefSync, setPrefSync, PREFS } = require('./uiPrefs.js');
  const saf = FileSystem.StorageAccessFramework;
  if (!saf) throw new Error('Choix de dossier indisponible sur cet appareil.');
  const perm = await saf.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  setPrefSync(PREFS.dossierSauvegardeAuto, perm.directoryUri);
  setPrefSync(PREFS.derniereSauvegardeAuto, null);
  await sauvegardeAutoSiNecessaire({ force: true });
  return { dossier: perm.directoryUri, derniere: getPrefSync(PREFS.derniereSauvegardeAuto, null) };
}

export function desactiverSauvegardeAuto() {
  const { setPrefSync, PREFS } = require('./uiPrefs.js');
  setPrefSync(PREFS.dossierSauvegardeAuto, null);
}

export function etatSauvegardeAuto() {
  const { getPrefSync, PREFS } = require('./uiPrefs.js');
  const dossier = getPrefSync(PREFS.dossierSauvegardeAuto, null);
  let libelle = null;
  try { libelle = decodeURIComponent(String(dossier || '').split('/tree/')[1] || '').replace(/^primary:/, 'Stockage interne/'); } catch {}
  return { actif: Boolean(dossier), dossier: libelle || dossier, derniere: getPrefSync(PREFS.derniereSauvegardeAuto, null) };
}

export async function sauvegardeAutoSiNecessaire({ force = false } = {}) {
  if (METRA_PLAY_SECURE_BUILD) return false;
  const { getPrefSync, setPrefSync, PREFS } = require('./uiPrefs.js');
  const dossier = getPrefSync(PREFS.dossierSauvegardeAuto, null);
  const saf = FileSystem.StorageAccessFramework;
  if (!dossier || !saf || autoEnCours) return { fait: false };
  const derniere = getPrefSync(PREFS.derniereSauvegardeAuto, null);
  if (!force && derniere && Date.now() - Date.parse(derniere) < 20 * 3600 * 1000) return { fait: false };
  autoEnCours = true;
  try {
    const db = await getDb();
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
    const source = cheminBaseSQLite();
    const info = await FileSystem.getInfoAsync(source, { size: true });
    if (!info.exists) return { fait: false };
    if (info.size > AUTO_MAX_BYTES) throw new Error('Base trop volumineuse pour la sauvegarde automatique : utilise la sauvegarde complète.');
    const contenu = await FileSystem.readAsStringAsync(source, { encoding: FileSystem.EncodingType.Base64 });
    const jour = horodatageSauvegarde().slice(0, 10);
    const existants = await saf.readDirectoryAsync(dossier).catch(() => []);
    const memeJour = existants.filter((u) => decodeURIComponent(u).includes(`${AUTO_PREFIX}${jour}`));
    const cible = await saf.createFileAsync(dossier, `${AUTO_PREFIX}${jour}.db`, 'application/octet-stream');
    await saf.writeAsStringAsync(cible, contenu, { encoding: FileSystem.EncodingType.Base64 });
    for (const ancien of memeJour) await saf.deleteAsync(ancien, { idempotent: true }).catch(() => {});
    const autos = existants
      .filter((u) => decodeURIComponent(u).includes(AUTO_PREFIX) && !memeJour.includes(u))
      .sort((a, b) => decodeURIComponent(b).localeCompare(decodeURIComponent(a)));
    for (const ancien of autos.slice(AUTO_KEEP - 1)) await saf.deleteAsync(ancien, { idempotent: true }).catch(() => {});
    setPrefSync(PREFS.derniereSauvegardeAuto, new Date().toISOString());
    return { fait: true };
  } catch (e) {
    console.warn('Sauvegarde automatique impossible', e);
    if (force) throw e;
    return { fait: false, erreur: String(e?.message || e) };
  } finally {
    autoEnCours = false;
  }
}
