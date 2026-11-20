import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { importerMissionDepuisExcelUri } from './missionExcelImport.js';

const PACKAGE_FORMAT = 'METRA_MISSION_PACKAGE_V1';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function safe(value = 'item') {
  return String(value || 'item')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 110) || 'item';
}

function native(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

function ensureSlash(uri) {
  return String(uri || '').endsWith('/') ? String(uri) : String(uri || '') + '/';
}

async function readJson(uri, fallback = null) {
  try {
    const raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function exists(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info : null;
  } catch {
    return null;
  }
}

async function locateFile(root, filename, depth = 0) {
  if (depth > 4) return null;
  const folder = ensureSlash(root);
  const direct = folder + filename;
  if (await exists(direct)) return direct;
  const names = await FileSystem.readDirectoryAsync(folder);
  for (const name of names) {
    const child = folder + name;
    const info = await exists(child);
    if (!info?.isDirectory) continue;
    const nested = await locateFile(child, filename, depth + 1);
    if (nested) return nested;
  }
  return null;
}

async function locatePackageRoot(extractRoot) {
  const manifestUri = await locateFile(extractRoot, 'manifest.json');
  if (!manifestUri) throw new Error('manifest.json absent du dossier METRA.');
  return {
    root: manifestUri.slice(0, manifestUri.length - 'manifest.json'.length),
    manifestUri,
  };
}

function validatedPackageUri(root, relativePath) {
  const rel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('../') || rel.includes('/..') || /^[a-zA-Z]+:/.test(rel)) {
    throw new Error('Chemin de fichier non sûr dans le dossier Mission.');
  }
  return ensureSlash(root) + rel;
}

async function ensureMissionFolder(missionId, child) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const folder = root + 'metra-missions/' + safe(missionId) + '/' + child + '/';
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  return folder;
}

async function copyFileDurable(sourceUri, destinationUri) {
  const info = await exists(sourceUri);
  if (!info || info.isDirectory) return false;
  const existing = await exists(destinationUri);
  if (existing) await FileSystem.deleteAsync(destinationUri, { idempotent: true });
  await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
  return true;
}

async function copyDirectoryDurable(sourceUri, destinationUri) {
  const info = await exists(sourceUri);
  if (!info?.isDirectory) return false;
  await FileSystem.makeDirectoryAsync(destinationUri, { intermediates: true });
  const names = await FileSystem.readDirectoryAsync(ensureSlash(sourceUri));
  for (const name of names) {
    const sourceChild = ensureSlash(sourceUri) + name;
    const destinationChild = ensureSlash(destinationUri) + name;
    const childInfo = await exists(sourceChild);
    if (!childInfo) continue;
    if (childInfo.isDirectory) await copyDirectoryDurable(sourceChild, destinationChild);
    else await copyFileDurable(sourceChild, destinationChild);
  }
  return true;
}

function extensionFromName(value, fallback = '') {
  const match = String(value || '').match(/(\.[a-zA-Z0-9]{1,8})$/);
  return match?.[1] || fallback;
}

async function restorePhotos(db, missionId, packageRoot) {
  const indexUri = validatedPackageUri(packageRoot, 'Photos/index.json');
  const index = await readJson(indexUri, []);
  if (!Array.isArray(index)) return { total: 0, restored: 0, missing: 0 };

  const folder = await ensureMissionFolder(missionId, 'photos');
  let restored = 0;
  let missing = 0;

  for (const row of index) {
    if (!row?.id || !row?.package_file) continue;
    const source = validatedPackageUri(packageRoot, row.package_file);
    const ext = extensionFromName(row.package_file, '.jpg');
    const destination = folder + safe(row.id) + '__restored' + ext;
    if (await copyFileDurable(source, destination)) {
      await db.runAsync(
        "UPDATE mission_photos SET file_uri=?,preview_uri=?,thumbnail_uri=?,updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [destination, destination, destination, row.id, missionId]
      );
      restored += 1;
    } else {
      missing += 1;
    }
  }
  return { total: index.length, restored, missing };
}

async function restoreDocuments(db, missionId, packageRoot) {
  const indexUri = validatedPackageUri(packageRoot, 'Documents_sources/index.json');
  const index = await readJson(indexUri, []);
  if (!Array.isArray(index)) return { total: 0, restored: 0, missing: 0 };

  const folder = await ensureMissionFolder(missionId, 'documents');
  let restored = 0;
  let missing = 0;
  for (const row of index) {
    if (!row?.id || !row?.package_file) continue;
    const source = validatedPackageUri(packageRoot, row.package_file);
    const ext = extensionFromName(row.name || row.package_file, '');
    const destination = folder + safe(row.id) + '__' + safe(row.name || 'document') + (ext && !safe(row.name || '').toLowerCase().endsWith(ext.toLowerCase()) ? ext : '');
    if (await copyFileDurable(source, destination)) {
      await db.runAsync(
        "UPDATE mission_documents SET file_uri=?,offline_state='available_offline',updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [destination, row.id, missionId]
      );
      restored += 1;
    } else {
      missing += 1;
    }
  }
  return { total: index.length, restored, missing };
}

async function restorePlans(db, missionId, packageRoot) {
  const indexUri = validatedPackageUri(packageRoot, 'Plans/Sources/index.json');
  const index = await readJson(indexUri, []);
  if (!Array.isArray(index)) return { total: 0, restored: 0, missing: 0 };

  const folder = await ensureMissionFolder(missionId, 'plans');
  let restored = 0;
  let missing = 0;
  for (const row of index) {
    if (!row?.id || !row?.package_file) continue;
    const source = validatedPackageUri(packageRoot, row.package_file);
    const ext = extensionFromName(row.name || row.package_file, '');
    const destination = folder + safe(row.id) + '__' + safe(row.name || 'plan') + (ext && !safe(row.name || '').toLowerCase().endsWith(ext.toLowerCase()) ? ext : '');
    if (await copyFileDurable(source, destination)) {
      await db.runAsync(
        "UPDATE mission_documents SET file_uri=?,offline_state='available_offline',updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [destination, row.id, missionId]
      );
      restored += 1;
    } else {
      missing += 1;
    }
  }
  return { total: index.length, restored, missing };
}

function updateTileTemplate(data, destinationRoot) {
  const current = data && typeof data === 'object' ? { ...data } : {};
  const oldTemplate = String(current.pathTemplate || '');
  const extMatch = oldTemplate.match(/\{y\}(\.[a-zA-Z0-9]+)$/);
  const extension = extMatch?.[1] || '.png';
  current.pathTemplate = ensureSlash(destinationRoot) + '{z}/{x}/{y}' + extension;
  return current;
}

async function restoreMapLayers(db, missionId, packageRoot) {
  const indexUri = validatedPackageUri(packageRoot, 'Map_layers/index.json');
  const index = await readJson(indexUri, []);
  if (!Array.isArray(index)) return { total: 0, restored: 0, missing: 0 };

  const folder = await ensureMissionFolder(missionId, 'map');
  let restored = 0;
  let missing = 0;

  for (const row of index) {
    if (!row?.id || !row?.package_file) continue;
    const source = validatedPackageUri(packageRoot, row.package_file);
    const sourceInfo = await exists(source);
    if (!sourceInfo) {
      missing += 1;
      continue;
    }

    if (row.type === 'xyz_tiles' && sourceInfo.isDirectory) {
      const destinationRoot = folder + 'tiles/' + safe(row.id) + '/';
      await FileSystem.makeDirectoryAsync(destinationRoot, { intermediates: true });
      if (await copyDirectoryDurable(source, destinationRoot)) {
        const data = updateTileTemplate(typeof row.data_json === 'string' ? (() => { try { return JSON.parse(row.data_json); } catch { return {}; } })() : row.data, destinationRoot);
        await db.runAsync(
          "UPDATE mission_map_layers SET source_uri=?,data_json=?,offline_available=1,updated_at=datetime('now') WHERE id=? AND mission_id=?",
          [destinationRoot, JSON.stringify(data), row.id, missionId]
        );
        restored += 1;
      } else {
        missing += 1;
      }
      continue;
    }

    const ext = extensionFromName(row.package_file, '.png');
    const destination = folder + 'rasters/' + safe(row.id) + ext;
    await FileSystem.makeDirectoryAsync(folder + 'rasters/', { intermediates: true });
    if (await copyFileDurable(source, destination)) {
      await db.runAsync(
        "UPDATE mission_map_layers SET source_uri=?,offline_available=1,updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [destination, row.id, missionId]
      );
      restored += 1;
    } else {
      missing += 1;
    }
  }

  return { total: index.length, restored, missing };
}

async function copyReferenceOutputs(missionId, packageRoot, manifest) {
  const folder = await ensureMissionFolder(missionId, 'restored_outputs');
  const candidates = (manifest?.files || []).filter((rel) => (
    String(rel).startsWith('Rapport/')
    || String(rel).startsWith('Plans/Annotes/')
    || String(rel).startsWith('Export_SIG/')
    || String(rel).startsWith('Synoptiques/')
  ));
  let copied = 0;
  for (const rel of candidates) {
    if (String(rel).endsWith('/')) continue;
    const source = validatedPackageUri(packageRoot, rel);
    const info = await exists(source);
    if (!info || info.isDirectory) continue;
    const destination = folder + safe(String(rel).replace(/\//g, '__'));
    if (await copyFileDurable(source, destination)) copied += 1;
  }
  return copied;
}

function canonicalExcelRelativePath(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  return files.find((rel) => /^Data\/.*\.xlsx$/i.test(String(rel))) || null;
}

export async function importerPackageMissionUri({ uri, name = 'Mission_METRA.zip' } = {}) {
  if (!uri) throw new Error('Archive Mission manquante.');
  const cache = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cache) throw new Error('Stockage temporaire indisponible.');

  const extractRoot = cache + 'metra-package-import-' + Date.now() + '/';
  await FileSystem.makeDirectoryAsync(extractRoot, { intermediates: true });

  try {
    await unzip(native(uri), native(extractRoot));
    const located = await locatePackageRoot(extractRoot);
    const manifest = await readJson(located.manifestUri, null);
    if (!manifest || manifest.format !== PACKAGE_FORMAT) {
      throw new Error('Cette archive n’est pas un dossier METRA Mission compatible.');
    }

    const excelRel = canonicalExcelRelativePath(manifest);
    if (!excelRel) throw new Error('Export Excel structuré absent du dossier Mission.');
    const excelUri = validatedPackageUri(located.root, excelRel);
    if (!await exists(excelUri)) throw new Error('Le fichier Excel structuré annoncé dans le manifeste est absent.');

    const imported = await importerMissionDepuisExcelUri({
      uri: excelUri,
      name: String(excelRel).split('/').pop() || 'Export_METRA.xlsx',
    });
    if (!imported?.canonical || !imported?.missionId) {
      throw new Error('Le classeur du dossier n’est pas un export relationnel METRA valide.');
    }

    const db = await getDb();
    const missionId = imported.missionId;
    const [photos, documents, plans, mapLayers] = await Promise.all([
      restorePhotos(db, missionId, located.root),
      restoreDocuments(db, missionId, located.root),
      restorePlans(db, missionId, located.root),
      restoreMapLayers(db, missionId, located.root),
    ]);
    const referenceOutputs = await copyReferenceOutputs(missionId, located.root, manifest);

    const summary = {
      missionId,
      packageName: clean(name),
      structuredRows: imported.counts || {},
      photos,
      documents,
      plans,
      mapLayers,
      referenceOutputs,
    };

    const mission = await db.getFirstAsync('SELECT id,label,reference FROM missions WHERE id=?', [missionId]);
    return { ...summary, mission };
  } finally {
    try { await FileSystem.deleteAsync(extractRoot, { idempotent: true }); } catch {}
  }
}

export async function choisirEtImporterPackageMission() {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Archive ZIP inaccessible.');
  return importerPackageMissionUri({ uri: asset.uri, name: asset.name || 'Mission_METRA.zip' });
}
