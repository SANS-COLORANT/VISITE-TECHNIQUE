import { openAppDatabase } from './database/index.js';
import { mapLatestVisitPhotos, photoFileKey, filterLatestVisitPhotos } from './latestVisitPhotoModel.js';

const clean = (value) => String(value ?? '').trim();
const list = (value) => Array.isArray(value) ? value : [];
const nullable = (value) => value == null || value === '' ? null : String(value);
const integer = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
};
const bool = (value) => value === true || value === 1 || value === '1';
const json = (value) => JSON.stringify(value ?? null);

let photoWrites = Promise.resolve();
function withPhotoTransaction(database, work) {
  const next = photoWrites.then(() => typeof database.withExclusiveTransactionAsync === 'function'
    ? database.withExclusiveTransactionAsync(work)
    : database.withTransactionAsync(() => work(database)));
  photoWrites = next.catch(() => {});
  return next;
}


function normalizePhoto(photo, context, fallbackOrder) {
  const id = clean(photo?.id);
  if (!id) return null;
  const remoteAvailable = bool(photo?.disponible);
  const downloadPath = remoteAvailable ? nullable(photo?.cheminTelechargement) : null;
  return {
    id,
    description: nullable(photo?.description),
    ordre: integer(photo?.ordre) ?? fallbackOrder,
    grandFormat: bool(photo?.grandFormat),
    disponible: remoteAvailable,
    typeMime: nullable(photo?.typeMime),
    tailleOctets: integer(photo?.tailleOctets),
    largeurPixels: integer(photo?.largeurPixels),
    hauteurPixels: integer(photo?.hauteurPixels),
    cheminTelechargement: downloadPath,
    site: context.site,
    local: context.local,
    derniereVisite: context.derniereVisite,
  };
}

export function normalizeLatestVisitPhotosManifest(payload = {}, expectedClientId = null) {
  const client = payload?.client && typeof payload.client === 'object' ? {
    ...payload.client,
    id: clean(payload.client.id),
    nom: nullable(payload.client.nom),
  } : { id: clean(expectedClientId), nom: null };
  if (!client.id) client.id = clean(expectedClientId);
  if (!client.id) throw new Error('Le manifeste des photos ne contient pas de client valide.');
  if (expectedClientId != null && clean(expectedClientId) !== client.id) {
    throw new Error('Le manifeste reçu ne correspond pas au client demandé.');
  }

  const sites = list(payload?.sites).map((entry, siteIndex) => {
    const siteSource = entry?.site && typeof entry.site === 'object' ? entry.site : {};
    const site = {
      ...siteSource,
      id: clean(siteSource.id),
      nom: nullable(siteSource.nom),
      adresse: nullable(siteSource.adresse),
      codePostal: nullable(siteSource.codePostal),
      ville: nullable(siteSource.ville),
    };
    const locaux = list(entry?.locaux).map((localEntry, localIndex) => {
      const localSource = localEntry?.local && typeof localEntry.local === 'object' ? localEntry.local : {};
      const local = {
        ...localSource,
        id: clean(localSource.id),
        designation: nullable(localSource.designation),
        ordre: integer(localSource.ordre) ?? localIndex,
      };
      const visitSource = localEntry?.derniereVisite && typeof localEntry.derniereVisite === 'object'
        ? localEntry.derniereVisite
        : null;
      const derniereVisite = visitSource ? {
        ...visitSource,
        id: clean(visitSource.id),
        date: nullable(visitSource.date),
        statut: nullable(visitSource.statut),
      } : null;
      const photos = list(localEntry?.photos)
        .map((photo, photoIndex) => normalizePhoto(photo, { site, local, derniereVisite }, photoIndex))
        .filter(Boolean)
        .sort((a, b) => a.ordre - b.ordre);
      return {
        local,
        derniereVisite,
        nombrePhotosDisponibles: photos.filter((photo) => photo.disponible).length,
        photos,
      };
    }).sort((a, b) => a.local.ordre - b.local.ordre);
    return {
      site,
      ordre: siteIndex,
      nombrePhotosDisponibles: locaux.reduce((total, local) => total + local.nombrePhotosDisponibles, 0),
      locaux,
    };
  });

  const photos = sites.flatMap((site) => site.locaux.flatMap((local) => local.photos));
  const availablePhotos = photos.filter((photo) => photo.disponible);
  return {
    client,
    nombreSites: sites.length,
    nombrePhotosDisponibles: availablePhotos.length,
    volumePhotosDisponibles: availablePhotos.reduce((total, photo) => total + Number(photo.tailleOctets || 0), 0),
    sites,
  };
}

export function flattenLatestVisitPhotos(manifest) {
  return list(manifest?.sites).flatMap((siteEntry) => list(siteEntry?.locaux).flatMap((localEntry) =>
    list(localEntry?.photos).map((photo) => ({
      ...photo,
      site: photo.site || siteEntry.site,
      local: photo.local || localEntry.local,
      derniereVisite: photo.derniereVisite || localEntry.derniereVisite,
    }))
  ));
}

export async function cacheLatestVisitPhotosManifest(remoteClientId, payload) {
  const clientId = clean(remoteClientId);
  const manifest = normalizeLatestVisitPhotosManifest(payload, clientId);
  const database = await openAppDatabase();
  const photos = flattenLatestVisitPhotos(manifest);

  await withPhotoTransaction(database, async (database) => {
    const previousFiles = await database.getAllAsync(
      `SELECT * FROM api_latest_visit_photos WHERE remote_client_id=? AND local_uri IS NOT NULL`, [clientId]);
    for (const row of previousFiles) {
      const previous = photoFromCacheRow(row);
      await database.runAsync(
        `INSERT OR IGNORE INTO api_photo_files(remote_client_id,remote_photo_id,file_key,local_uri,downloaded_bytes,downloaded_at)
         VALUES(?,?,?,?,?,?)`,
        [clientId, row.remote_photo_id, photoFileKey(previous), row.local_uri, Number(row.downloaded_bytes || 0), row.downloaded_at || new Date().toISOString()]);
    }
    await database.runAsync(
      `INSERT INTO api_latest_visit_photo_manifests(
        remote_client_id,client_name,site_count,available_photo_count,available_bytes,payload_json,synced_at
      ) VALUES(?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(remote_client_id) DO UPDATE SET
        client_name=excluded.client_name,site_count=excluded.site_count,
        available_photo_count=excluded.available_photo_count,available_bytes=excluded.available_bytes,
        payload_json=excluded.payload_json,synced_at=datetime('now')`,
      [clientId, manifest.client.nom, manifest.nombreSites, manifest.nombrePhotosDisponibles,
        manifest.volumePhotosDisponibles, json(manifest)]
    );
    await database.runAsync(
      `UPDATE api_latest_visit_photos SET manifest_present=0 WHERE remote_client_id=?`,
      [clientId]
    );

    for (const photo of photos) {
      await database.runAsync(
        `INSERT INTO api_latest_visit_photos(
          remote_client_id,remote_photo_id,remote_site_id,site_name,remote_local_id,local_designation,
          remote_visit_id,visit_date,visit_status,description,photo_order,is_large_format,
          remote_available,mime_type,expected_bytes,width_pixels,height_pixels,download_path,
          download_status,manifest_present,payload_json,synced_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
        ON CONFLICT(remote_client_id,remote_photo_id) DO UPDATE SET
          remote_site_id=excluded.remote_site_id,site_name=excluded.site_name,
          remote_local_id=excluded.remote_local_id,local_designation=excluded.local_designation,
          remote_visit_id=excluded.remote_visit_id,visit_date=excluded.visit_date,visit_status=excluded.visit_status,
          description=excluded.description,photo_order=excluded.photo_order,is_large_format=excluded.is_large_format,
          remote_available=excluded.remote_available,mime_type=excluded.mime_type,
          expected_bytes=excluded.expected_bytes,width_pixels=excluded.width_pixels,height_pixels=excluded.height_pixels,
          download_path=excluded.download_path,
          local_uri=CASE WHEN COALESCE(api_latest_visit_photos.remote_visit_id,'')=COALESCE(excluded.remote_visit_id,'')
            AND COALESCE(api_latest_visit_photos.expected_bytes,0)=COALESCE(excluded.expected_bytes,0)
            AND COALESCE(api_latest_visit_photos.mime_type,'')=COALESCE(excluded.mime_type,'')
            AND COALESCE(api_latest_visit_photos.width_pixels,0)=COALESCE(excluded.width_pixels,0)
            AND COALESCE(api_latest_visit_photos.height_pixels,0)=COALESCE(excluded.height_pixels,0)
            AND COALESCE(api_latest_visit_photos.remote_site_id,'')=COALESCE(excluded.remote_site_id,'')
            AND COALESCE(api_latest_visit_photos.remote_local_id,'')=COALESCE(excluded.remote_local_id,'')
            THEN api_latest_visit_photos.local_uri ELSE NULL END,
          download_status=CASE
            WHEN api_latest_visit_photos.local_uri IS NOT NULL THEN api_latest_visit_photos.download_status
            WHEN excluded.remote_available=1 THEN 'pending' ELSE 'unavailable' END,
          last_error=CASE WHEN api_latest_visit_photos.local_uri IS NOT NULL
            THEN api_latest_visit_photos.last_error ELSE NULL END,
          manifest_present=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [clientId, photo.id, photo.site?.id || null, photo.site?.nom || null,
          photo.local?.id || null, photo.local?.designation || null,
          photo.derniereVisite?.id || null, photo.derniereVisite?.date || null,
          photo.derniereVisite?.statut || null, photo.description, photo.ordre,
          photo.grandFormat ? 1 : 0, photo.disponible ? 1 : 0, photo.typeMime,
          photo.tailleOctets, photo.largeurPixels, photo.hauteurPixels,
          photo.cheminTelechargement, photo.disponible ? 'pending' : 'unavailable', json(photo)]
      );
    }
  });
  return getCachedLatestVisitPhotosManifest(clientId);
}

function photoFromCacheRow(row) {
  return { id: row.remote_photo_id, site: { id: row.remote_site_id }, local: { id: row.remote_local_id },
    derniereVisite: { id: row.remote_visit_id }, typeMime: row.mime_type, tailleOctets: row.expected_bytes,
    largeurPixels: row.width_pixels, hauteurPixels: row.height_pixels };
}

export async function hydratePhotoMetadata(remoteClientId, manifest) {
  if (!manifest) return null;
  const database = await openAppDatabase();
  const [rows, files] = await Promise.all([
    database.getAllAsync(`SELECT * FROM api_latest_visit_photos WHERE remote_client_id=?`, [clean(remoteClientId)]),
    database.getAllAsync(`SELECT * FROM api_photo_files WHERE remote_client_id=?`, [clean(remoteClientId)]),
  ]);
  const rowsByKey = new Map(rows.map((row) => [photoFileKey(photoFromCacheRow(row)), row]));
  const filesByKey = new Map(files.map((row) => [row.file_key, row]));
  return mapLatestVisitPhotos(manifest, (photo) => {
    const key = photoFileKey(photo), cached = rowsByKey.get(key), file = filesByKey.get(key);
    const uri = file?.local_uri || cached?.local_uri || null;
    return { ...photo, localUri: uri, localAvailable: false,
      downloadedBytes: integer(file?.downloaded_bytes ?? cached?.downloaded_bytes),
      downloadStatus: uri ? 'downloaded' : cached?.download_status || (photo.disponible ? 'pending' : 'unavailable'),
      downloadError: cached?.last_error || null, downloadedAt: file?.downloaded_at || cached?.downloaded_at || null };
  });
}

export async function getCachedLatestVisitPhotosManifest(remoteClientId) {
  const clientId = clean(remoteClientId);
  if (!clientId) return null;
  const database = await openAppDatabase();
  const row = await database.getFirstAsync(`SELECT * FROM api_latest_visit_photo_manifests WHERE remote_client_id=?`, [clientId]);
  if (!row?.payload_json) return null;
  let manifest;
  try { manifest = normalizeLatestVisitPhotosManifest(JSON.parse(row.payload_json), clientId); }
  catch { return null; }
  manifest.syncedAt = row.synced_at;
  return hydratePhotoMetadata(clientId, manifest);
}

export async function markLatestVisitPhotoDownloaded(remoteClientId, photo, localUri, sizeBytes) {
  const database = await openAppDatabase();
  await withPhotoTransaction(database, async (database) => {
    await database.runAsync(
      `INSERT INTO api_photo_files(remote_client_id,remote_photo_id,file_key,local_uri,downloaded_bytes)
       VALUES(?,?,?,?,?) ON CONFLICT(remote_client_id,remote_photo_id,file_key) DO UPDATE SET
       local_uri=excluded.local_uri,downloaded_bytes=excluded.downloaded_bytes,downloaded_at=datetime('now')`,
      [clean(remoteClientId), clean(photo.id), photoFileKey(photo), String(localUri), integer(sizeBytes)]);
    await database.runAsync(
      `UPDATE api_latest_visit_photos SET local_uri=?,downloaded_bytes=?,download_status='downloaded',
        last_error=NULL,downloaded_at=datetime('now')
       WHERE remote_client_id=? AND remote_photo_id=? AND COALESCE(remote_visit_id,'')=?
         AND COALESCE(expected_bytes,0)=? AND COALESCE(mime_type,'')=?
         AND COALESCE(remote_site_id,'')=? AND COALESCE(remote_local_id,'')=?
         AND COALESCE(width_pixels,0)=? AND COALESCE(height_pixels,0)=?`,
      [String(localUri), integer(sizeBytes), clean(remoteClientId), clean(photo.id),
        clean(photo.derniereVisite?.id), Number(photo.tailleOctets || 0), clean(photo.typeMime),
        clean(photo.site?.id), clean(photo.local?.id), Number(photo.largeurPixels || 0), Number(photo.hauteurPixels || 0)]);
  });
}

export async function markLatestVisitPhotoMissingLocally(remoteClientId, photo) {
  const database = await openAppDatabase();
  await database.runAsync(`DELETE FROM api_photo_files WHERE remote_client_id=? AND remote_photo_id=? AND file_key=?`,
    [clean(remoteClientId), clean(photo.id), photoFileKey(photo)]);
  await database.runAsync(
    `UPDATE api_latest_visit_photos SET local_uri=NULL,downloaded_bytes=NULL,
      download_status=CASE WHEN remote_available=1 THEN 'pending' ELSE 'unavailable' END,
      last_error=NULL,downloaded_at=NULL
     WHERE remote_client_id=? AND remote_photo_id=? AND local_uri=?`,
    [clean(remoteClientId), clean(photo.id), photo.localUri]);
}

export async function markLatestVisitPhotoError(remoteClientId, photo, error) {
  await (await openAppDatabase()).runAsync(
    `UPDATE api_latest_visit_photos SET download_status='error',last_error=?
     WHERE remote_client_id=? AND remote_photo_id=? AND COALESCE(remote_visit_id,'')=?`,
    [String(error?.message || error || 'Téléchargement impossible'), clean(remoteClientId), clean(photo.id), clean(photo.derniereVisite?.id)]);
}

/** A pinned reference is not an observation and cannot affect any export. */
export async function getVisitPhotoReference(visiteId, remoteClientId, remoteSiteId, candidate = null) {
  const database = await openAppDatabase();
  if (candidate) {
    const scope = filterLatestVisitPhotos(candidate, { siteIds: [remoteSiteId] });
    // Missing site in a partial/failed sync is not a known empty reference.
    if (scope?.sites.length) await database.runAsync(
      `INSERT OR IGNORE INTO api_visit_photo_references(visite_id,remote_client_id,remote_site_id,payload_json) VALUES(?,?,?,?)`,
      [String(visiteId), clean(remoteClientId), clean(remoteSiteId), json(normalizeLatestVisitPhotosManifest(scope, remoteClientId))]);
  }
  const row = await database.getFirstAsync(
    `SELECT * FROM api_visit_photo_references WHERE visite_id=? AND remote_client_id=? AND remote_site_id=?`,
    [String(visiteId), clean(remoteClientId), clean(remoteSiteId)]);
  if (!row) return null;
  const manifest = normalizeLatestVisitPhotosManifest(JSON.parse(row.payload_json), remoteClientId);
  manifest.pinnedAt = row.pinned_at;
  return hydratePhotoMetadata(remoteClientId, manifest);
}

/** Only explicit stable IDs are used; never infer a room from its display name. */
export async function resolvePhotoContexts({ visiteId = null, siteId = null, remoteLocalId = null, ignoreVisitLocal = false } = {}) {
  const database = await openAppDatabase();
  const visit = visiteId ? await database.getFirstAsync(`SELECT site_id,api_remote_local_id,installation_id FROM visites WHERE id=?`, [visiteId]) : null;
  const localSiteId = visit?.site_id || siteId;
  if (!localSiteId) return [];
  let localId = clean(remoteLocalId || (ignoreVisitLocal ? null : visit?.api_remote_local_id)) || null;
  if (!localId && !ignoreVisitLocal && visit?.installation_id) {
    const links = await database.getAllAsync(`SELECT remote_local_id FROM api_local_links WHERE local_installation_id=?`, [visit.installation_id]);
    if (links.length === 1) localId = clean(links[0].remote_local_id);
  }
  const rows = await database.getAllAsync(
    `SELECT DISTINCT cs.remote_client_id,cs.remote_site_id,c.nom AS client_name,s.nom AS site_name,
       CASE WHEN c.local_client_id=ls.client_id THEN 1 ELSE 0 END AS own_client
     FROM api_client_site_links cs JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id
     JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id JOIN sites ls ON ls.id=cs.local_site_id
     WHERE cs.local_site_id=? ORDER BY own_client DESC,c.nom`, [localSiteId]);
  const own = rows.filter((r) => r.own_client === 1);
  const candidates = own.length ? own : rows;
  const results = [];
  for (const row of candidates) {
    if (localId) {
      const room = await database.getFirstAsync(`SELECT remote_site_id FROM api_local_links WHERE remote_local_id=?`, [localId]);
      if (room && String(room.remote_site_id) !== String(row.remote_site_id)) continue;
    }
    results.push({ client: { remote_client_id: row.remote_client_id, nom: row.client_name },
      remoteSiteId: row.remote_site_id, remoteLocalId: localId, siteName: row.site_name });
  }
  return results;
}

export async function pinPhotoReferencesForVisit(visiteId) {
  const contexts = await resolvePhotoContexts({ visiteId });
  for (const context of contexts) {
    const candidate = await getCachedLatestVisitPhotosManifest(context.client.remote_client_id);
    await getVisitPhotoReference(visiteId, context.client.remote_client_id, context.remoteSiteId, candidate);
  }
}

export async function readPhotoLocalChoice(visiteId, contextKey, clientId, siteId) {
  if (!visiteId || !contextKey) return null;
  const row = await (await openAppDatabase()).getFirstAsync(
    `SELECT remote_local_id FROM api_visit_photo_local_choices WHERE visite_id=? AND context_key=? AND remote_client_id=? AND remote_site_id=?`,
    [String(visiteId), contextKey, clean(clientId), clean(siteId)]);
  return row?.remote_local_id || null;
}

export async function savePhotoLocalChoice(visiteId, contextKey, clientId, siteId, localId) {
  if (!visiteId || !contextKey || !localId) return;
  await (await openAppDatabase()).runAsync(
    `INSERT INTO api_visit_photo_local_choices(visite_id,context_key,remote_client_id,remote_site_id,remote_local_id) VALUES(?,?,?,?,?)
     ON CONFLICT(visite_id,context_key,remote_client_id,remote_site_id) DO UPDATE SET remote_local_id=excluded.remote_local_id`,
    [String(visiteId), contextKey, clean(clientId), clean(siteId), clean(localId)]);
}
