/** Base de données SQLite locale + repository (clients/sites/visites/champs...). */

import * as SQLite from 'expo-sqlite';
import { TRAME_DATA } from './data';

export function uuidv4() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ============================================================================
// 2. BASE DE DONNÉES — schéma générique (champs/contrôles en clé-valeur)
// ============================================================================

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, code_exploitant TEXT, adresse TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY, client_id TEXT NOT NULL, nom_site TEXT NOT NULL,
  adresse TEXT, statut TEXT DEFAULT 'Actif',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS visites (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL, date_visite TEXT, technicien TEXT,
  statut TEXT NOT NULL DEFAULT 'en_cours', progression_pct INTEGER NOT NULL DEFAULT 0,
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Champs "libres" (texte) : un enregistrement par (visite, section, cle)
CREATE TABLE IF NOT EXISTS champs_visite (
  visite_id TEXT NOT NULL, section_code TEXT NOT NULL, cle TEXT NOT NULL,
  valeur TEXT, PRIMARY KEY (visite_id, section_code, cle)
);
-- Contrôles de conformité (Avis + Commentaire)
CREATE TABLE IF NOT EXISTS controles_visite (
  visite_id TEXT NOT NULL, section_code TEXT NOT NULL, cle TEXT NOT NULL,
  avis TEXT, commentaire TEXT, PRIMARY KEY (visite_id, section_code, cle)
);
-- Réseaux de régulation — dynamiques (0..N par visite)
CREATE TABLE IF NOT EXISTS reseaux (
  id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, ordre INTEGER NOT NULL,
  nom_reseau TEXT, t_ext_c TEXT, t_dep_c TEXT, courbe_de_chauffe TEXT,
  tnc TEXT, consigne_programme_horaire TEXT
);
-- Compteurs relevés — dynamiques (feuille Relevés)
CREATE TABLE IF NOT EXISTS compteurs (
  id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, label TEXT, valeur TEXT, unite TEXT
);
-- Équipements (feuille MATERIEL)
CREATE TABLE IF NOT EXISTS materiel (
  id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, categorie TEXT, designation TEXT,
  marque TEXT, modele TEXT, annee TEXT, etat TEXT DEFAULT 'bon',
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Réserves (feuille REMARQUES) — générées automatiquement depuis les
-- préconisations choisies, ou ajoutées manuellement
CREATE TABLE IF NOT EXISTS remarques (
  id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, controle_key TEXT,
  poste TEXT, prestation TEXT, delai INTEGER, estimatif REAL, origine TEXT,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notes (
  visite_id TEXT PRIMARY KEY, contenu TEXT
);
-- Photos, rattachables à n'importe quelle entité
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, entite_key TEXT,
  uri TEXT NOT NULL, label TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('visite_technique.db');
  await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
  await dbInstance.execAsync(SCHEMA_SQL);
  await seedDemoSiNecessaire(dbInstance);
  return dbInstance;
}

async function seedDemoSiNecessaire(db) {
  const deja = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = 'demo_seeded'`);
  if (deja) return;
  const clientId = uuidv4();
  const siteId = uuidv4();
  await db.runAsync(`INSERT INTO clients (id, nom, code_exploitant, adresse) VALUES (?, ?, ?, ?)`,
    [clientId, 'Résidence Les Pins', 'RLP01', '12 rue des Tilleuls']);
  await db.runAsync(`INSERT INTO sites (id, client_id, nom_site, adresse, statut) VALUES (?, ?, ?, ?, ?)`,
    [siteId, clientId, 'Chaufferie centrale', '12 rue des Tilleuls', 'Actif']);
  await db.runAsync(`INSERT INTO clients (id, nom, code_exploitant, adresse) VALUES (?, ?, ?, ?)`,
    [uuidv4(), 'Office HLM Colombes', 'OHC08', '5 avenue de la République']);
  await db.runAsync(`INSERT INTO _meta (key, value) VALUES ('demo_seeded', '1')`);
}

// ---------------- Repository : clients / sites / visites ----------------

async function listerClients() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM clients ORDER BY nom`);
}
async function creerClient({ nom, codeExploitant, adresse }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(`INSERT INTO clients (id, nom, code_exploitant, adresse) VALUES (?, ?, ?, ?)`,
    [id, nom, codeExploitant || null, adresse || null]);
  return id;
}
async function listerSitesClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM sites WHERE client_id = ? ORDER BY nom_site`, [clientId]);
}
async function creerSite({ clientId, nomSite, adresse }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(`INSERT INTO sites (id, client_id, nom_site, adresse) VALUES (?, ?, ?, ?)`,
    [id, clientId, nomSite, adresse || null]);
  return id;
}
async function listerVisitesEnCours() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT v.id, v.date_visite, v.progression_pct, s.nom_site, c.nom AS nom_client
     FROM visites v JOIN sites s ON s.id = v.site_id JOIN clients c ON c.id = s.client_id
     WHERE v.statut = 'en_cours' ORDER BY v.modifie_le DESC`
  );
}
async function compterVisites() {
  const db = await getDb();
  const enCours = await db.getFirstAsync(`SELECT COUNT(*) as n FROM visites WHERE statut = 'en_cours'`);
  const terminees = await db.getFirstAsync(`SELECT COUNT(*) as n FROM visites WHERE statut = 'terminee'`);
  return { enCours: enCours.n, terminees: terminees.n };
}
const DEFAULT_VALEURS_CLASSIQUES = {
  'Matériaux tuyauterie': 'Acier noir',
  'Type de distribution': 'Bitube',
  'Equipement sur aller': 'Vanne papillon',
  'Equipement sur retour': 'Vanne 1/4 de tour',
  "Type d'émetteur": 'Radiateurs',
  'Type de robinetterie': 'Robinet thermostatique',
  'Calorifuge (type / état)': 'Laine de roche + revêtement PVC',
  'Variation de vitesse': 'Variable',
  'Présence mitigeur': 'Oui',
  'Type de régulation': 'Sonde extérieure',
  'Cycle anti-légionellose': 'Hebdomadaire',
  'Production primaire': 'Chaudière gaz',
  'Production ECS': 'Ballon',
  'Type de LT': 'Chaufferie gaz',
};

/**
 * Pré-remplit les champs "classiques" d'une nouvelle visite avec la valeur
 * la plus courante, pour que le technicien n'ait qu'à confirmer ou changer
 * (via les chips), plutôt que de partir d'un formulaire vide. Parcourt
 * TRAME_DATA pour retrouver le bon section_code de chaque occurrence — un
 * même libellé de champ ("Type de distribution") existe par exemple à la
 * fois pour le chauffage et pour l'ECS, avec des section_code différents.
 */
async function preremplirValeursClassiques(visiteId) {
  const db = await getDb();
  const inserts = [];
  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sub, fields]) => {
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fields.forEach((f) => {
        if (f.type === 'champ' && DEFAULT_VALEURS_CLASSIQUES[f.cle]) {
          inserts.push([visiteId, sectionCode, f.cle, DEFAULT_VALEURS_CLASSIQUES[f.cle]]);
        }
      });
    });
  });
  for (const params of inserts) {
    await db.runAsync(
      `INSERT INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)
       ON CONFLICT(visite_id, section_code, cle) DO NOTHING`,
      params
    );
  }
}

async function creerVisite({ siteId, technicien }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO visites (id, site_id, date_visite, technicien, statut, progression_pct)
     VALUES (?, ?, date('now'), ?, 'en_cours', 0)`,
    [id, siteId, technicien || null]
  );
  await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id, contenu) VALUES (?, '')`, [id]);
  await preremplirValeursClassiques(id);
  await recalculerProgression(id);
  return id;
}
async function getVisite(visiteId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT v.*, s.nom_site, s.adresse AS site_adresse, c.nom AS nom_client
     FROM visites v JOIN sites s ON s.id = v.site_id JOIN clients c ON c.id = s.client_id
     WHERE v.id = ?`,
    [visiteId]
  );
}
async function toucherVisite(visiteId) {
  const db = await getDb();
  await db.runAsync(`UPDATE visites SET modifie_le = datetime('now') WHERE id = ?`, [visiteId]);
}

// ---------------- Repository : champs / contrôles génériques ----------------

async function getChampsVisite(visiteId) {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]);
  const map = {};
  rows.forEach((r) => { map[`${r.section_code}||${r.cle}`] = r.valeur; });
  return map;
}
async function upsertChamp(visiteId, sectionCode, cle, valeur) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)
     ON CONFLICT(visite_id, section_code, cle) DO UPDATE SET valeur = excluded.valeur`,
    [visiteId, sectionCode, cle, valeur]
  );
  await toucherVisite(visiteId);
  await recalculerProgression(visiteId);
}

async function getControlesVisite(visiteId) {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]);
  const map = {};
  rows.forEach((r) => { map[`${r.section_code}||${r.cle}`] = r; });
  return map;
}
async function upsertControle(visiteId, sectionCode, cle, { avis, commentaire }) {
  const db = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT * FROM controles_visite WHERE visite_id = ? AND section_code = ? AND cle = ?`,
    [visiteId, sectionCode, cle]
  );
  if (existing) {
    await db.runAsync(
      `UPDATE controles_visite SET avis = COALESCE(?, avis), commentaire = COALESCE(?, commentaire)
       WHERE visite_id = ? AND section_code = ? AND cle = ?`,
      [avis ?? null, commentaire ?? null, visiteId, sectionCode, cle]
    );
  } else {
    await db.runAsync(
      `INSERT INTO controles_visite (visite_id, section_code, cle, avis, commentaire) VALUES (?, ?, ?, ?, ?)`,
      [visiteId, sectionCode, cle, avis ?? null, commentaire ?? null]
    );
  }
  await toucherVisite(visiteId);
  await recalculerProgression(visiteId);
}

async function recalculerProgression(visiteId) {
  const db = await getDb();
  let total = 0, remplis = 0;
  Object.values(TRAME_DATA).forEach((sections) => {
    Object.values(sections).forEach((fields) => {
      fields.forEach((f) => { total++; });
    });
  });
  const champs = await db.getAllAsync(`SELECT valeur FROM champs_visite WHERE visite_id = ?`, [visiteId]);
  const controles = await db.getAllAsync(`SELECT avis FROM controles_visite WHERE visite_id = ?`, [visiteId]);
  remplis = champs.filter((c) => c.valeur && c.valeur.trim() !== '').length
          + controles.filter((c) => c.avis).length;
  const pct = total > 0 ? Math.min(100, Math.round((remplis / total) * 100)) : 0;
  await db.runAsync(`UPDATE visites SET progression_pct = ? WHERE id = ?`, [pct, visiteId]);
}

// ---------------- Repository : réseaux dynamiques ----------------

async function listerReseaux(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM reseaux WHERE visite_id = ? ORDER BY ordre`, [visiteId]);
}
async function ajouterReseau(visiteId, nom) {
  const db = await getDb();
  const { n } = await db.getFirstAsync(`SELECT COUNT(*) as n FROM reseaux WHERE visite_id = ?`, [visiteId]);
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO reseaux (id, visite_id, ordre, nom_reseau) VALUES (?, ?, ?, ?)`,
    [id, visiteId, n + 1, nom || `Réseau ${n + 1}`]
  );
  return id;
}
async function upsertReseauChamp(reseauId, champ, valeur) {
  const CHAMPS = ['nom_reseau', 't_ext_c', 't_dep_c', 'courbe_de_chauffe', 'tnc', 'consigne_programme_horaire'];
  if (!CHAMPS.includes(champ)) return;
  const db = await getDb();
  await db.runAsync(`UPDATE reseaux SET ${champ} = ? WHERE id = ?`, [valeur, reseauId]);
}
async function supprimerReseau(reseauId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reseaux WHERE id = ?`, [reseauId]);
}

// ---------------- Repository : compteurs dynamiques ----------------

async function listerCompteurs(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM compteurs WHERE visite_id = ?`, [visiteId]);
}
async function ajouterCompteur(visiteId, label) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(`INSERT INTO compteurs (id, visite_id, label, unite) VALUES (?, ?, ?, ?)`,
    [id, visiteId, label || '', 'm³']);
  return id;
}
async function upsertCompteurChamp(compteurId, champ, valeur) {
  if (!['label', 'valeur', 'unite'].includes(champ)) return;
  const db = await getDb();
  await db.runAsync(`UPDATE compteurs SET ${champ} = ? WHERE id = ?`, [valeur, compteurId]);
}
async function supprimerCompteur(compteurId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM compteurs WHERE id = ?`, [compteurId]);
}

// ---------------- Repository : équipements ----------------

async function listerMateriel(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM materiel WHERE visite_id = ? ORDER BY cree_le`, [visiteId]);
}
async function ajouterMateriel(visiteId) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO materiel (id, visite_id, categorie, designation, etat) VALUES (?, ?, '', '', 'bon')`,
    [id, visiteId]
  );
  return id;
}
async function upsertMaterielChamp(materielId, champ, valeur) {
  if (!['categorie', 'designation', 'marque', 'modele', 'annee', 'etat'].includes(champ)) return;
  const db = await getDb();
  await db.runAsync(`UPDATE materiel SET ${champ} = ? WHERE id = ?`, [valeur, materielId]);
}
async function supprimerMateriel(materielId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM materiel WHERE id = ?`, [materielId]);
}

// ---------------- Repository : réserves (remarques) ----------------

async function listerRemarques(visiteId) {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM remarques WHERE visite_id = ? ORDER BY cree_le`, [visiteId]);
}
async function upsertRemarqueDepuisPrescription(visiteId, controleKey, opt, origine) {
  const db = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT * FROM remarques WHERE visite_id = ? AND controle_key = ?`,
    [visiteId, controleKey]
  );
  if (existing) {
    await db.runAsync(
      `UPDATE remarques SET poste = ?, prestation = ?, delai = ?, estimatif = ?, origine = ? WHERE id = ?`,
      [opt.poste, opt.prestation, opt.delai, opt.estimatif, origine, existing.id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO remarques (id, visite_id, controle_key, poste, prestation, delai, estimatif, origine)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), visiteId, controleKey, opt.poste, opt.prestation, opt.delai, opt.estimatif, origine]
    );
  }
}
async function supprimerRemarqueParControle(visiteId, controleKey) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM remarques WHERE visite_id = ? AND controle_key = ?`, [visiteId, controleKey]);
}
async function ajouterRemarqueManuelle(visiteId) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO remarques (id, visite_id, controle_key, poste, prestation, origine)
     VALUES (?, ?, NULL, 'Observation', 'Nouvelle réserve — à préciser', 'Ajout manuel')`,
    [id, visiteId]
  );
}

// ---------------- Repository : notes / photos ----------------

async function getNote(visiteId) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT contenu FROM notes WHERE visite_id = ?`, [visiteId]);
  return row ? row.contenu : '';
}
async function upsertNote(visiteId, contenu) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (visite_id, contenu) VALUES (?, ?)
     ON CONFLICT(visite_id) DO UPDATE SET contenu = excluded.contenu`,
    [visiteId, contenu]
  );
}
async function listerPhotos(visiteId, entiteKey) {
  const db = await getDb();
  if (entiteKey) {
    return db.getAllAsync(`SELECT * FROM photos WHERE visite_id = ? AND entite_key = ? ORDER BY cree_le`, [visiteId, entiteKey]);
  }
  return db.getAllAsync(`SELECT * FROM photos WHERE visite_id = ? ORDER BY cree_le DESC`, [visiteId]);
}
async function ajouterPhoto(visiteId, entiteKey, uri, label) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO photos (id, visite_id, entite_key, uri, label) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), visiteId, entiteKey || null, uri, label || null]
  );
}


export {
  getDb,
  listerClients, creerClient, listerSitesClient, creerSite,
  listerVisitesEnCours, compterVisites, creerVisite, getVisite, toucherVisite,
  getChampsVisite, upsertChamp, getControlesVisite, upsertControle, recalculerProgression,
  listerReseaux, ajouterReseau, upsertReseauChamp, supprimerReseau,
  listerCompteurs, ajouterCompteur, upsertCompteurChamp, supprimerCompteur,
  listerMateriel, ajouterMateriel, upsertMaterielChamp, supprimerMateriel,
  listerRemarques, upsertRemarqueDepuisPrescription, supprimerRemarqueParControle, ajouterRemarqueManuelle,
  getNote, upsertNote, listerPhotos, ajouterPhoto,
};
