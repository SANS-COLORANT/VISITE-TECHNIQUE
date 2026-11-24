/**
 * Pure METRA backup contracts; shared by the backup engine and regression tests.
 * Never log or persist user passwords, keys, or raw backup payloads.
 */
export const BACKUP_FORMAT = 'visite-technique-backup';
export const BACKUP_FORMAT_VERSION = 2;
export const BACKUP_ENCRYPTION = 'AES-256';
export const BACKUP_MAX_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024;

export function validerMotDePasseSauvegarde(value) {
  const password = String(value || '');
  if (password.length < 16 || password.length > 128) {
    throw new Error('Choisis un mot de passe entre 16 et 128 caractères pour chiffrer la sauvegarde.');
  }
  if (password.trim().length < 16) {
    throw new Error('Le mot de passe ne doit pas être constitué principalement d’espaces.');
  }
  return password;
}

export function normaliserCheminArchive(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) ||
    raw.includes('\0') || raw.includes('//') || raw.includes('?') || raw.includes('#')) {
    throw new Error('Chemin interdit dans la sauvegarde.');
  }
  const segments = raw.split('/');
  if (segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error('Cette archive contient un chemin non sûr.');
  }
  return raw;
}

export function validerManifesteSauvegarde(manifeste, databaseName, currentSchema) {
  if (!manifeste || manifeste.format !== BACKUP_FORMAT) {
    throw new Error('Ce fichier n’est pas une sauvegarde METRA valide.');
  }
  const formatVersion = Number(manifeste.formatVersion);
  if (![1, 2].includes(formatVersion)) throw new Error('Version du format de sauvegarde non prise en charge.');
  const schemaVersion = Number(manifeste.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > currentSchema) {
    throw new Error(schemaVersion > currentSchema
      ? 'Sauvegarde issue d’une version plus récente de METRA : mets à jour METRA avant restauration.'
      : 'Version de base SQLite absente ou invalide.');
  }
  const dbPath = normaliserCheminArchive(manifeste.database || '');
  if (dbPath !== 'database/' + databaseName) {
    throw new Error('Chemin de base SQLite inattendu dans la sauvegarde.');
  }
  const photoRoot = normaliserCheminArchive(manifeste.photosRoot || 'photos/');
  if (formatVersion === 1 && photoRoot !== 'photos/') throw new Error('Chemin photo inattendu dans une ancienne sauvegarde.');
  if (formatVersion === 2 && photoRoot !== 'data/visite-technique/photos/') {
    throw new Error('Chemin photo inattendu dans la sauvegarde chiffrée.');
  }
  if (formatVersion === 2 &&
    (manifeste.encryption !== BACKUP_ENCRYPTION ||
     !Array.isArray(manifeste.dataRoots) ||
     manifeste.dataRoots.length !== 2 ||
     manifeste.dataRoots[0] !== 'data/visite-technique/' ||
     manifeste.dataRoots[1] !== 'data/metra-missions/')) {
    throw new Error('La sauvegarde complète ne contient pas un manifeste chiffré valide.');
  }
  const visites = Number(manifeste.counts?.visites);
  const photos = Number(manifeste.counts?.photos);
  if (!Number.isInteger(visites) || visites < 0 || !Number.isInteger(photos) || photos < 0) {
    throw new Error('Nombre de visites ou de photos invalide dans le manifeste.');
  }
  return { formatVersion, schemaVersion, dbPath, photoRoot, visites, photos };
}

/** Resolve only known roots saved in app-private Android document storage. */
export function rebaserUriLocale(uri, documentDirectory) {
  const value = String(uri || '');
  for (const folder of ['visite-technique/', 'metra-missions/']) {
    const mark = '/' + folder;
    const index = value.indexOf(mark);
    if (index < 0) continue;
    const relative = value.slice(index + mark.length);
    if (!relative || relative.split('/').some(segment => segment === '..' || segment === '.')) continue;
    return String(documentDirectory || '') + folder + relative;
  }
  return value;
}

export function validerEntreesZip(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 100000) {
    throw new Error('Archive ZIP vide ou comportant trop d’entrées.');
  }
  let total = 0;
  const seen = new Map();
  for (const entry of entries) {
    const path = normaliserCheminArchive(entry.path);
    const key = path.replace(/\/$/, '');
    if (seen.has(key)) throw new Error('Entrée ZIP dupliquée : restauration refusée.');
    seen.set(key,entry.isDirectory===true || path.endsWith('/'));
    if (!path || (entry.isDirectory !== true && !entry.isEncrypted)) {
      // Legacy archives can be plaintext; caller explicitly approves those.
      if (!path) throw new Error('Entrée ZIP invalide.');
    }
    const bytes = Number(entry.size || 0);
    if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Taille de fichier ZIP invalide.');
    total += bytes;
    if (total > BACKUP_MAX_UNCOMPRESSED_BYTES) throw new Error('Archive trop volumineuse pour une restauration sûre.');
  }
  for(const key of seen.keys()) {
    const segments=key.split('/');
    for(let i=1;i<segments.length;i++) {
      const parent=segments.slice(0,i).join('/');
      if(seen.has(parent) && !seen.get(parent))throw new Error('Conflit fichier/dossier dans le ZIP.');
    }
  }
  return total;
}
