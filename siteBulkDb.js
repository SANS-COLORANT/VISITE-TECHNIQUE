import { getDb, uuidv4 } from './db.js';

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
  if (Object.prototype.hasOwnProperty.call(data, 'nomSite')) {
    champs.push('nom_site=?');
    params.push(normaliserTexte(data.nomSite));
  }
  if (Object.prototype.hasOwnProperty.call(data, 'adresse')) {
    // Dès qu'une adresse change, l'ancienne position calculée est invalidée.
    // Le géocodage silencieux la recalculera quand Internet sera disponible.
    champs.push('adresse=?', 'latitude=NULL', 'longitude=NULL', 'precision_gps=NULL', 'gps_modifie_le=NULL');
    params.push(normaliserTexte(data.adresse) || null);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'note')) {
    champs.push('localisation_note=?');
    params.push(normaliserTexte(data.note) || null);
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

  const occurrencesImport = new Map();
  for (const l of lignes) {
    const k = cleNom(l?.nomSite);
    if (k) occurrencesImport.set(k, (occurrencesImport.get(k) || 0) + 1);
  }

  const apercu = [];
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i] || {};
    const nomSite = normaliserTexte(l.nomSite);
    if (!nomSite) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Nom du site manquant', ...l });
      continue;
    }
    const nomKey = cleNom(nomSite);
    if ((occurrencesImport.get(nomKey) || 0) > 1) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Site présent plusieurs fois dans le fichier', ...l, nomSite });
      continue;
    }
    const candidats = parNom.get(nomKey) || [];
    if (candidats.length > 1) {
      apercu.push({ index: i, action: 'erreur', erreur: 'Plusieurs sites existants portent ce nom', ...l, nomSite });
      continue;
    }

    const adresse = normaliserTexte(l.adresse) || null;
    const note = normaliserTexte(l.note) || null;
    const existant = candidats[0] || null;
    if (!existant) {
      apercu.push({ index: i, action: 'creer', nomSite, adresse, note });
      continue;
    }

    const changements = [];
    if (adresse !== null && adresse !== (existant.adresse || null)) changements.push('adresse');
    if (note !== null && note !== (existant.localisation_note || null)) changements.push('note');
    apercu.push({
      index: i,
      action: changements.length ? 'modifier' : 'identique',
      siteId: existant.id,
      nomSite,
      adresse,
      note,
      changements,
    });
  }
  return apercu;
}

export async function appliquerImportSites(clientId, apercu = []) {
  const db = await getDb();
  let crees = 0, modifies = 0, ignores = 0;
  const siteIds = [];
  for (const item of apercu) {
    if (item.action === 'erreur' || item.action === 'identique') { ignores += 1; continue; }
    if (item.action === 'creer') {
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO sites(id,client_id,nom_site,adresse,statut,localisation_note)
         VALUES(?,?,?,?, 'Actif', ?)`,
        [id, clientId, item.nomSite, item.adresse || null, item.note || null]
      );
      siteIds.push(id);
      crees += 1;
      continue;
    }
    if (item.action === 'modifier' && item.siteId) {
      const champs = [];
      const params = [];
      if (item.adresse !== null) {
        champs.push('adresse=?', 'latitude=NULL', 'longitude=NULL', 'precision_gps=NULL', 'gps_modifie_le=NULL');
        params.push(item.adresse);
      }
      if (item.note !== null) {
        champs.push('localisation_note=?');
        params.push(item.note);
      }
      if (champs.length) {
        params.push(item.siteId);
        await db.runAsync(`UPDATE sites SET ${champs.join(', ')} WHERE id=?`, params);
        siteIds.push(item.siteId);
        modifies += 1;
      } else ignores += 1;
    }
  }
  return { crees, modifies, ignores, siteIds };
}
