import { openAppDatabase } from './database/index.js';

const clean = (value) => String(value ?? '').trim();
const list = (value) => Array.isArray(value) ? value : [];
const nullable = (value) => value == null || value === '' ? null : String(value);
const integer = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
};
const bool = (value) => value === true || value === 1 || value === '1';
const json = (value) => JSON.stringify(value ?? null);

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

  await database.withTransactionAsync(async () => {
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

export async function getCachedLatestVisitPhotosManifest(remoteClientId) {
  const clientId = clean(remoteClientId);
  if (!clientId) return null;
  const database = await openAppDatabase();
  const [row, photoRows] = await Promise.all([
    database.getFirstAsync(
      `SELECT * FROM api_latest_visit_photo_manifests WHERE remote_client_id=?`,
      [clientId]
    ),
    database.getAllAsync(
      `SELECT * FROM api_latest_visit_photos
       WHERE remote_client_id=? AND manifest_present=1`,
      [clientId]
    ),
  ]);
  if (!row?.payload_json) return null;
  let manifest;
  try { manifest = normalizeLatestVisitPhotosManifest(JSON.parse(row.payload_json), clientId); }
  catch { return null; }
  const cacheByPhotoId = new Map(photoRows.map((photo) => [String(photo.remote_photo_id), photo]));
  for (const photo of flattenLatestVisitPhotos(manifest)) {
    const cached = cacheByPhotoId.get(String(photo.id));
    photo.localUri = cached?.local_uri || null;
    photo.downloadedBytes = integer(cached?.downloaded_bytes);
    photo.downloadStatus = cached?.download_status || (photo.disponible ? 'pending' : 'unavailable');
    photo.downloadError = cached?.last_error || null;
    photo.downloadedAt = cached?.downloaded_at || null;
  }
  manifest.syncedAt = row.synced_at;
  return manifest;
}

export async function markLatestVisitPhotoDownloaded(remoteClientId, remotePhotoId, localUri, sizeBytes) {
  await (await openAppDatabase()).runAsync(
    `UPDATE api_latest_visit_photos SET local_uri=?,downloaded_bytes=?,download_status='downloaded',
      last_error=NULL,downloaded_at=datetime('now')
     WHERE remote_client_id=? AND remote_photo_id=?`,
    [String(localUri), integer(sizeBytes), clean(remoteClientId), clean(remotePhotoId)]
  );
}

export async function markLatestVisitPhotoMissingLocally(remoteClientId, remotePhotoId) {
  await (await openAppDatabase()).runAsync(
    `UPDATE api_latest_visit_photos SET local_uri=NULL,downloaded_bytes=NULL,
      download_status=CASE WHEN remote_available=1 THEN 'pending' ELSE 'unavailable' END,
      last_error=NULL,downloaded_at=NULL
     WHERE remote_client_id=? AND remote_photo_id=?`,
    [clean(remoteClientId), clean(remotePhotoId)]
  );
}

export async function markLatestVisitPhotoError(remoteClientId, remotePhotoId, error) {
  await (await openAppDatabase()).runAsync(
    `UPDATE api_latest_visit_photos SET download_status='error',last_error=?
     WHERE remote_client_id=? AND remote_photo_id=?`,
    [String(error?.message || error || 'Téléchargement impossible'), clean(remoteClientId), clean(remotePhotoId)]
  );
}
