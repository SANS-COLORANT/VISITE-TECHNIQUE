import { getDb, uuidv4 } from './db.js';
import { coordonneeValide } from './siteGeoDb.js';

function normaliserTexte(v = '') {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

function cleNom(v = '') {
  return normaliserTexte(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export async function modifierSiteRapide(siteId, data = {}) {
  const db = await getDb();
  const champs = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(data, 'nomSite')) { champs.push('nom_site=?'); params.push(normaliserTexte(data.nomSite)); }
  if (Object.prototype.hasOwnProperty.call(data, 'adresse')) { champs.push('adresse=?'); params.push(normaliserTexte(data.adresse) || null); }
  if (Object.prototype.hasOwnProperty.call(data, 'note')) { champs.push('localisation_note=?'); params.push(normaliserTexte(data.note) || null); }
  if (Object.prototype.hasOwnProperty.call(data, 'latitude') || Object.prototype.hasOwnProperty.call(data, 'longitude')) {
    if (!coordonneeValide(data.latitude, data.longitude)) throw new Error('Coordonnées GPS invalides');
    champs.push('latitude=?', 'longitude=?', "gps_modifie_le=datetime('now')");
    params.push(Number(data.latitude), Number(data.longitude));
  }
  if (!champs.length) return;
  params.push(siteId);
  await db.runAsync(`UPDATE sites SET ${champs.join(', ')} WHERE id=?`, params);
}

export async function preparerImportSites(clientId, lignes = []) {
  const db = await getDb();
  const existants = await db.getAllAsync(`SELECT * FROM sites WHERE client_id=? ORDER BY nom_site`, [clientId]);
  const parNom = new Map();
  for (const s of existants) {
    const k = cleNom(s.nom_site);
    if (!parNom.has(k)) parNom.set(k, []);
    parNom.get(k).push(s);
  }

  const apercu = [];
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i] || {};
    const nomSite = normaliserTexte(l.nomSite);
    if (!nomSite) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Nom du site manquant', ...l });
      continue;
    }
    const candidats = parNom.get(cleNom(nomSite)) || [];
    if (candidats.length > 1) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Plusieurs sites existants portent ce nom', ...l, nomSite });
      continue;
    }

    const latitude = l.latitude === '' || l.latitude === null || l.latitude === undefined ? null : Number(l.latitude);
    const longitude = l.longitude === '' || l.longitude === null || l.longitude === undefined ? null : Number(l.longitude);
    if ((latitude !== null || longitude !== null) && !coordonneeValide(latitude, longitude)) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Latitude/longitude invalides', ...l, nomSite });
      continue;
    }

    const adresse = normaliserTexte(l.adresse) || null;
    const note = normaliserTexte(l.note) || null;
    const existant = candidats[0] || null;
    if (!existant) {
      apercu.push({ index: i, action: 'creer', nomSite, adresse, latitude, longitude, note });
      continue;
    }

    const changements = [];
    if (adresse !== null && adresse !== (existant.adresse || null)) changements.push('adresse');
    if (note !== null && note !== (existant.localisation_note || null)) changements.push('note');
    if (latitude !== null && longitude !== null && (Number(existant.latitude) !== latitude || Number(existant.longitude) !== longitude)) changements.push('gps');
    apercu.push({
      index: i,
      action: changements.length ? 'modifier' : 'identique',
      siteId: existant.id,
      nomSite,
      adresse,
      latitude,
      longitude,
      note,
      changements,
    });
  }
  return apercu;
}

export async function appliquerImportSites(clientId, apercu = []) {
  const db = await getDb();
  let crees = 0, modifies = 0, ignores = 0;
  for (const item of apercu) {
    if (item.action === 'erreur' || item.action === 'identique') { ignores += 1; continue; }
    if (item.action === 'creer') {
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO sites(id,client_id,nom_site,adresse,statut,latitude,longitude,localisation_note,gps_modifie_le)
         VALUES(?,?,?,?, 'Actif', ?,?,?, CASE WHEN ? IS NOT NULL AND ? IS NOT NULL THEN datetime('now') ELSE NULL END)`,
        [id, clientId, item.nomSite, item.adresse || null, item.latitude, item.longitude, item.note || null, item.latitude, item.longitude]
      );
      crees += 1;
      continue;
    }
    if (item.action === 'modifier' && item.siteId) {
      const champs = [];
      const params = [];
      if (item.adresse !== null) { champs.push('adresse=?'); params.push(item.adresse); }
      if (item.note !== null) { champs.push('localisation_note=?'); params.push(item.note); }
      if (item.latitude !== null && item.longitude !== null) {
        champs.push('latitude=?', 'longitude=?', "gps_modifie_le=datetime('now')");
        params.push(item.latitude, item.longitude);
      }
      if (champs.length) {
        params.push(item.siteId);
        await db.runAsync(`UPDATE sites SET ${champs.join(', ')} WHERE id=?`, params);
        modifies += 1;
      } else ignores += 1;
    }
  }
  return { crees, modifies, ignores };
}
