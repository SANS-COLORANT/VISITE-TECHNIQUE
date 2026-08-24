import { getDb } from './db.js';

export function coordonneeValide(latitude, longitude) {
  if (
    latitude === null || latitude === undefined || latitude === '' ||
    longitude === null || longitude === undefined || longitude === ''
  ) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function getSiteLocalisation(siteId) {
  return (await getDb()).getFirstAsync(
    `SELECT id,client_id,nom_site,adresse,statut,latitude,longitude,precision_gps,localisation_note,gps_modifie_le
     FROM sites WHERE id=?`,
    [siteId]
  );
}

export async function enregistrerSiteLocalisation(siteId, { latitude, longitude, precisionGps = null, note = null }) {
  if (!coordonneeValide(latitude, longitude)) throw new Error('Coordonnées GPS invalides');
  const lat = Number(latitude);
  const lng = Number(longitude);
  const precision = precisionGps === null || precisionGps === '' || precisionGps === undefined
    ? null
    : Number(precisionGps);
  await (await getDb()).runAsync(
    `UPDATE sites
     SET latitude=?, longitude=?, precision_gps=?, localisation_note=?, gps_modifie_le=datetime('now')
     WHERE id=?`,
    [lat, lng, Number.isFinite(precision) ? precision : null, note?.trim() || null, siteId]
  );
}

export async function enregistrerNoteLocalisation(siteId, note) {
  await (await getDb()).runAsync(
    `UPDATE sites SET localisation_note=?, gps_modifie_le=datetime('now') WHERE id=?`,
    [note?.trim() || null, siteId]
  );
}

export function sitesAvecGps(sites = []) {
  return sites.filter((site) => coordonneeValide(site.latitude, site.longitude));
}
