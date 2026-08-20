/** Base de données SQLite locale + repository (clients/sites/visites/champs...). */

import { TRAME_DATA, PRESCRIPTIONS } from './data.js';
import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

export function uuidv4() {
  return createId();
}

// ============================================================================
// 2. BASE DE DONNÉES — schéma générique (champs/contrôles en clé-valeur)
// ============================================================================

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await openAppDatabase();
  await seedDemoSiNecessaire(dbInstance);
  await seedBibliothequeSiNecessaire(dbInstance);
  await seedEquipementsBibliothequeSiNecessaire(dbInstance);
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

/**
 * Pré-remplit la bibliothèque de réserves avec les 142 préconisations
 * réelles extraites de la trame ICPE (mêmes données que PRESCRIPTIONS,
 * utilisées aussi pour les suggestions automatiques sur N.S). Ça donne un
 * point de départ tout de suite exploitable, sans repartir de zéro — tout
 * reste ensuite modifiable/supprimable depuis l'écran Paramètres.
 */
async function seedBibliothequeSiNecessaire(db) {
  const deja = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = 'biblio_seeded'`);
  if (deja) return;
  for (const [cle, options] of Object.entries(PRESCRIPTIONS)) {
    for (const opt of options) {
      const nom = cle + (opt.critere ? ' — ' + opt.critere : '');
      await db.runAsync(
        `INSERT INTO reserves_bibliotheque (id, nom, description, prix, poste, delai) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), nom, opt.prestation, opt.estimatif ?? null, opt.poste ?? null, opt.delai ?? null]
      );
    }
  }
  await db.runAsync(`INSERT INTO _meta (key, value) VALUES ('biblio_seeded', '1')`);
}

/** Combinaisons catégorie/marque/modèle courantes en chauffage/plomberie,
 * pour que la bibliothèque équipements ne parte pas vide au premier lancement. */
const EQUIPEMENTS_SEED = [
  { categorie: 'Chaudière', marque: 'De Dietrich', modele: 'C310 ECO' },
  { categorie: 'Chaudière', marque: 'De Dietrich', modele: 'Naneo' },
  { categorie: 'Chaudière', marque: 'Viessmann', modele: 'Vitodens 200-W' },
  { categorie: 'Chaudière', marque: 'Viessmann', modele: 'Vitodens 100-W' },
  { categorie: 'Chaudière', marque: 'Saunier Duval', modele: 'ThemaPlus Condens' },
  { categorie: 'Chaudière', marque: 'Frisquet', modele: 'Prestige Condensation' },
  { categorie: 'Chaudière', marque: 'Chappée', modele: 'Roseo' },
  { categorie: 'Chaudière', marque: 'Elm Leblanc', modele: 'Megalis' },
  { categorie: 'Chaudière', marque: 'Atlantic', modele: 'Alfea Excellia' },
  { categorie: 'Pompe', marque: 'Grundfos', modele: 'Alpha2' },
  { categorie: 'Pompe', marque: 'Grundfos', modele: 'Magna3' },
  { categorie: 'Pompe', marque: 'Wilo', modele: 'Stratos PICO' },
  { categorie: 'Pompe', marque: 'Wilo', modele: 'Yonos PICO' },
  { categorie: 'Circulateur', marque: 'Grundfos', modele: 'UPS2' },
  { categorie: 'Circulateur', marque: 'Wilo', modele: 'Stratos' },
  { categorie: 'Ballon ECS', marque: 'Atlantic', modele: 'Héliomax' },
  { categorie: 'Ballon ECS', marque: 'De Dietrich', modele: 'Corhydro' },
  { categorie: 'Échangeur', marque: 'Alfa Laval', modele: 'M6' },
  { categorie: 'Échangeur', marque: 'Alfa Laval', modele: 'M10' },
  { categorie: 'Adoucisseur', marque: 'Culligan', modele: 'HE' },
  { categorie: 'Adoucisseur', marque: 'BWT', modele: 'AQA perla' },
  { categorie: 'Désemboueur', marque: 'Fernox', modele: 'TF1 Omega' },
  { categorie: 'Désemboueur', marque: 'Spirotech', modele: 'SpiroTrap' },
  { categorie: 'Vase d\'expansion', marque: 'Zilmet', modele: 'Hydro-Pro' },
  { categorie: 'Vase d\'expansion', marque: 'Reflex', modele: 'N' },
  { categorie: 'Filtre', marque: 'Honeywell', modele: 'FF06' },
  { categorie: 'Détendeur', marque: 'Honeywell', modele: 'D06F' },
  { categorie: 'Manomètre', marque: 'Wika', modele: '111.10' },
  { categorie: 'Extincteur', marque: 'Desautel', modele: 'Poudre ABC 6kg' },
  { categorie: 'Armoire électrique', marque: 'Schneider Electric', modele: 'Prisma' },
];

async function seedEquipementsBibliothequeSiNecessaire(db) {
  const deja = await db.getFirstAsync(`SELECT value FROM _meta WHERE key = 'equip_biblio_seeded'`);
  if (deja) return;
  for (const e of EQUIPEMENTS_SEED) {
    await db.runAsync(
      `INSERT INTO equipements_bibliotheque (id, categorie, marque, modele) VALUES (?, ?, ?, ?)`,
      [uuidv4(), e.categorie, e.marque, e.modele]
    );
  }
  await db.runAsync(`INSERT INTO _meta (key, value) VALUES ('equip_biblio_seeded', '1')`);
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
/** Historique complet des visites d'un site (toutes, quel que soit le statut). */
async function listerVisitesSite(siteId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM visites WHERE site_id = ? ORDER BY date_visite DESC, modifie_le DESC`,
    [siteId]
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
/**
 * Supprime une visite et toutes ses données associées. Ces tables n'ont pas
 * de contrainte FOREIGN KEY ... ON DELETE CASCADE déclarée sur visite_id,
 * donc on supprime explicitement dans chaque table plutôt que de compter
 * sur SQLite pour le faire automatiquement.
 */
async function supprimerVisite(visiteId) {
  const db = await getDb();
  const tables = ['champs_visite', 'controles_visite', 'reseaux', 'compteurs', 'materiel', 'remarques', 'notes', 'photos'];
  for (const table of tables) {
    await db.runAsync(`DELETE FROM ${table} WHERE visite_id = ?`, [visiteId]);
  }
  await db.runAsync(`DELETE FROM visites WHERE id = ?`, [visiteId]);
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

// ---------------- Repository : bibliothèque de réserves (Paramètres) ----------------

async function listerBibliothequeReserves() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM reserves_bibliotheque ORDER BY nom`);
}
async function ajouterReserveBiblio({ nom, description, prix, poste, delai }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO reserves_bibliotheque (id, nom, description, prix, poste, delai) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, nom, description || null, prix ?? null, poste || null, delai ?? null]
  );
  return id;
}
async function modifierReserveBiblio(id, { nom, description, prix, poste, delai }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reserves_bibliotheque SET nom = ?, description = ?, prix = ?, poste = ?, delai = ? WHERE id = ?`,
    [nom, description || null, prix ?? null, poste || null, delai ?? null, id]
  );
}
async function supprimerReserveBiblio(id) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reserves_bibliotheque WHERE id = ?`, [id]);
}
/** Ajoute une réserve à une visite en copiant un modèle de la bibliothèque. */
async function ajouterRemarqueDepuisBiblio(visiteId, biblioItem) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO remarques (id, visite_id, controle_key, poste, prestation, delai, estimatif, origine)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 'Bibliothèque personnalisée')`,
    [uuidv4(), visiteId, biblioItem.poste || 'Observation', biblioItem.description || biblioItem.nom, biblioItem.delai, biblioItem.prix]
  );
}

// ---------------- Repository : bibliothèque d'équipements (Paramètres) ----------------

async function listerBibliothequeEquipements() {
  const db = await getDb();
  return db.getAllAsync(`
    SELECT m.id, c.nom AS categorie, b.nom AS marque, m.nom AS modele,
           c.icone, b.logo_uri, m.caracteristiques
    FROM modeles_equipement m
    JOIN categories_equipement c ON c.id = m.categorie_id
    JOIN marques_equipement b ON b.id = m.marque_id
    WHERE m.actif = 1 AND c.actif = 1 AND b.actif = 1
    UNION ALL
    SELECT e.id, e.categorie, e.marque, e.modele, '⚙️' AS icone,
           NULL AS logo_uri, NULL AS caracteristiques
    FROM equipements_bibliotheque e
    WHERE NOT EXISTS (
      SELECT 1 FROM modeles_equipement m2
      JOIN categories_equipement c2 ON c2.id = m2.categorie_id
      JOIN marques_equipement b2 ON b2.id = m2.marque_id
      WHERE c2.nom = e.categorie COLLATE NOCASE
        AND COALESCE(b2.nom, '') = COALESCE(e.marque, '') COLLATE NOCASE
        AND m2.nom = COALESCE(e.modele, '') COLLATE NOCASE
    )
    ORDER BY categorie, marque, modele
  `);
}
async function ajouterEquipementBiblio({ categorie, marque, modele }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO equipements_bibliotheque (id, categorie, marque, modele) VALUES (?, ?, ?, ?)`,
    [id, categorie, marque || null, modele || null]
  );
  return id;
}
async function modifierEquipementBiblio(id, { categorie, marque, modele }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE equipements_bibliotheque SET categorie = ?, marque = ?, modele = ? WHERE id = ?`,
    [categorie, marque || null, modele || null, id]
  );
}
async function supprimerEquipementBiblio(id) {
  const db = await getDb();
  const catalogue = await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE id = ?', [id]);
  if (catalogue) await db.runAsync('UPDATE modeles_equipement SET actif = 0 WHERE id = ?', [id]);
  else await db.runAsync(`DELETE FROM equipements_bibliotheque WHERE id = ?`, [id]);
}

async function listerCategoriesEquipement() {
  const db = await getDb();
  return db.getAllAsync(`
    SELECT c.*, COUNT(m.id) AS nb_modeles
    FROM categories_equipement c
    LEFT JOIN modeles_equipement m ON m.categorie_id = c.id AND m.actif = 1
    WHERE c.actif = 1
    GROUP BY c.id ORDER BY c.ordre, c.nom
  `);
}

async function listerMarquesEquipement() {
  const db = await getDb();
  return db.getAllAsync(`
    SELECT b.*, COUNT(m.id) AS nb_modeles
    FROM marques_equipement b
    LEFT JOIN modeles_equipement m ON m.marque_id = b.id AND m.actif = 1
    WHERE b.actif = 1
    GROUP BY b.id ORDER BY b.nom
  `);
}

async function rechercherModelesEquipement({ recherche = '', categorieId = null, marqueId = null } = {}) {
  const db = await getDb();
  const motif = `%${recherche.trim()}%`;
  return db.getAllAsync(`
    SELECT m.*, c.nom AS categorie, c.icone, b.nom AS marque, b.logo_uri, b.couleur
    FROM modeles_equipement m
    JOIN categories_equipement c ON c.id = m.categorie_id
    JOIN marques_equipement b ON b.id = m.marque_id
    WHERE m.actif = 1 AND c.actif = 1 AND b.actif = 1
      AND (? IS NULL OR m.categorie_id = ?)
      AND (? IS NULL OR m.marque_id = ?)
      AND (? = '' OR c.nom LIKE ? COLLATE NOCASE OR b.nom LIKE ? COLLATE NOCASE
           OR m.nom LIKE ? COLLATE NOCASE OR COALESCE(m.reference, '') LIKE ? COLLATE NOCASE
           OR COALESCE(m.mots_cles, '') LIKE ? COLLATE NOCASE)
    ORDER BY c.ordre, b.nom, m.nom
  `, [categorieId, categorieId, marqueId, marqueId, recherche.trim(), motif, motif, motif, motif, motif]);
}

async function ajouterCategorieEquipement({ nom, icone }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync('INSERT INTO categories_equipement (id, nom, icone) VALUES (?, ?, ?)', [id, nom, icone || '⚙️']);
  return id;
}

async function ajouterMarqueEquipement({ nom, logoUri, couleur }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync('INSERT INTO marques_equipement (id, nom, logo_uri, couleur) VALUES (?, ?, ?, ?)', [id, nom, logoUri || null, couleur || null]);
  return id;
}

async function ajouterModeleEquipement({ categorieId, marqueId, nom, reference, caracteristiques, motsCles }) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    `INSERT INTO modeles_equipement
     (id, categorie_id, marque_id, nom, reference, caracteristiques, mots_cles)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, categorieId, marqueId, nom, reference || null, caracteristiques || null, motsCles || null]
  );
  return id;
}

async function desactiverCategorieEquipement(id) {
  const db = await getDb();
  await db.runAsync('UPDATE categories_equipement SET actif = 0 WHERE id = ?', [id]);
}

async function desactiverMarqueEquipement(id) {
  const db = await getDb();
  await db.runAsync('UPDATE marques_equipement SET actif = 0 WHERE id = ?', [id]);
}

export {
  getDb,
  listerClients, creerClient, listerSitesClient, creerSite,
  listerVisitesEnCours, compterVisites, creerVisite, supprimerVisite, getVisite, toucherVisite,
  getChampsVisite, upsertChamp, getControlesVisite, upsertControle, recalculerProgression,
  listerReseaux, ajouterReseau, upsertReseauChamp, supprimerReseau,
  listerCompteurs, ajouterCompteur, upsertCompteurChamp, supprimerCompteur,
  listerMateriel, ajouterMateriel, upsertMaterielChamp, supprimerMateriel,
  listerRemarques, upsertRemarqueDepuisPrescription, supprimerRemarqueParControle, ajouterRemarqueManuelle,
  getNote, upsertNote, listerPhotos, ajouterPhoto,
  listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio, ajouterRemarqueDepuisBiblio,
  listerBibliothequeEquipements, ajouterEquipementBiblio, modifierEquipementBiblio, supprimerEquipementBiblio,
  listerCategoriesEquipement, listerMarquesEquipement, rechercherModelesEquipement,
  ajouterCategorieEquipement, ajouterMarqueEquipement, ajouterModeleEquipement,
  desactiverCategorieEquipement, desactiverMarqueEquipement,
  listerVisitesSite,
};
