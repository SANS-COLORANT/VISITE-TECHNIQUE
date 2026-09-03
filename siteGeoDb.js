import { getDb } from './db.js';

const GEOCODAGE_URL = 'https://data.geopf.fr/geocodage/search';

export function coordonneeValide(latitude, longitude) {
  if (
    latitude === null || latitude === undefined || latitude === '' ||
    longitude === null || longitude === undefined || longitude === ''
  ) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function adresseValide(adresse) {
  return String(adresse || '').trim().length >= 5;
}

export async function getSiteLocalisation(siteId) {
  return (await getDb()).getFirstAsync(
    `SELECT id,client_id,nom_site,adresse,statut,latitude,longitude,precision_gps,localisation_note,gps_modifie_le
     FROM sites WHERE id=?`,
    [siteId]
  );
}

async function geocoderAdresse(adresse) {
  const q = String(adresse || '').trim();
  if (!adresseValide(q)) throw new Error('Adresse incomplète');
  const url = `${GEOCODAGE_URL}?q=${encodeURIComponent(q)}&limit=1`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Service d'adresse indisponible (${response.status})`);
  const json = await response.json();
  const feature = Array.isArray(json?.features) ? json.features[0] : null;
  const coords = feature?.geometry?.coordinates;
  const longitude = Number(coords?.[0]);
  const latitude = Number(coords?.[1]);
  if (!coordonneeValide(latitude, longitude)) throw new Error('Adresse non positionnée');
  return {
    latitude,
    longitude,
    libelle: String(feature?.properties?.label || q).trim(),
  };
}

/**
 * Coordonnées techniques invisibles pour l'utilisateur.
 * Elles servent uniquement à placer une adresse sur la Carte METRA.
 * Aucune position de la tablette et aucune permission de localisation ne sont utilisées.
 */
export async function synchroniserCoordonneesSite(siteId, adresse, { force = false } = {}) {
  const db = await getDb();
  const site = await db.getFirstAsync(
    `SELECT id,adresse,latitude,longitude FROM sites WHERE id=?`,
    [siteId]
  );
  if (!site) throw new Error('Site introuvable');
  const adresseEffective = String(adresse ?? site.adresse ?? '').trim();
  if (!adresseValide(adresseEffective)) return { ok: false, raison: 'adresse_manquante' };
  if (!force && coordonneeValide(site.latitude, site.longitude) && adresseEffective === String(site.adresse || '').trim()) {
    return { ok: true, cached: true, latitude: Number(site.latitude), longitude: Number(site.longitude) };
  }

  try {
    const point = await geocoderAdresse(adresseEffective);
    await db.runAsync(
      `UPDATE sites
       SET latitude=?, longitude=?, precision_gps=NULL, gps_modifie_le=datetime('now')
       WHERE id=?`,
      [point.latitude, point.longitude, siteId]
    );
    return { ok: true, cached: false, ...point };
  } catch (error) {
    // Hors connexion ou adresse non reconnue : l'adresse reste enregistrée.
    // On ne transforme jamais un échec de géocodage en échec de saisie terrain.
    return { ok: false, raison: 'indisponible', error };
  }
}

export async function synchroniserCoordonneesClient(clientId, { force = false, max = 80 } = {}) {
  const db = await getDb();
  const sites = await db.getAllAsync(
    `SELECT id,adresse,latitude,longitude FROM sites
     WHERE client_id=? AND adresse IS NOT NULL AND TRIM(adresse)<>''
     ORDER BY nom_site COLLATE NOCASE`,
    [clientId]
  );
  const cibles = (sites || []).filter((s) => force || !coordonneeValide(s.latitude, s.longitude)).slice(0, max);
  let positionnes = 0;
  let indisponibles = 0;
  for (const site of cibles) {
    const r = await synchroniserCoordonneesSite(site.id, site.adresse, { force });
    if (r.ok) positionnes += 1;
    else indisponibles += 1;
    // Reste très largement sous la limite publique de l'API Géoplateforme.
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return { total: cibles.length, positionnes, indisponibles };
}

/** Compatibilité avec les anciennes données : ces fonctions restent internes. */
export async function enregistrerSiteLocalisation(siteId, { latitude, longitude, precisionGps = null, note = null }) {
  if (!coordonneeValide(latitude, longitude)) throw new Error('Coordonnées invalides');
  const precision = precisionGps === null || precisionGps === '' || precisionGps === undefined ? null : Number(precisionGps);
  await (await getDb()).runAsync(
    `UPDATE sites SET latitude=?, longitude=?, precision_gps=?, localisation_note=?, gps_modifie_le=datetime('now') WHERE id=?`,
    [Number(latitude), Number(longitude), Number.isFinite(precision) ? precision : null, note?.trim() || null, siteId]
  );
}

export async function enregistrerNoteLocalisation(siteId, note) {
  await (await getDb()).runAsync(
    `UPDATE sites SET localisation_note=? WHERE id=?`,
    [note?.trim() || null, siteId]
  );
}

export function sitesAvecGps(sites = []) {
  return sites.filter((site) => coordonneeValide(site.latitude, site.longitude));
}
