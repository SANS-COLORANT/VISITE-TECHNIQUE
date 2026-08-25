/** Import d'une TRAME ICPE Excel existante avec aperçu puis intégration SQLite. */

import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { TRAME_DATA, EXCEL_ROWS } from './data.js';
import { getDb, uuidv4 } from './db.js';

const RESEAU_BLOCS_DEBUT = [66, 76, 86, 96, 106, 116];
const SOURCE_DIR = `${FileSystem.documentDirectory}excel-sources/`;

function valeurCellule(sheet, ref) {
  const cell = sheet?.[ref];
  if (!cell || cell.v === null || cell.v === undefined) return '';
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (typeof cell.v === 'number' && cell.z && /[dmy]/i.test(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(cell.v).trim();
}

function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + section.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function nettoyerLabel(cle) {
  return cle.replace(/^Index\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export async function choisirEtAnalyserExcel() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const analyse = analyserClasseur(wb, asset.name || 'import.xlsx');
  const sourceHash = empreinteLegere(base64);
  analyse.sourceId = `${analyse.nomFichier}:${sourceHash}`;

  // Conserve une copie byte-for-byte du fichier choisi dans le stockage
  // persistant de l'application. L'export repartira de cette copie, jamais
  // d'un classeur reconstruit par la bibliotheque XLSX.
  await FileSystem.makeDirectoryAsync(SOURCE_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(`${SOURCE_DIR}${sourceHash}.xlsx`, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return analyse;
}

function empreinteLegere(texte) {
  let hash = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function analyserClasseur(wb, nomFichier) {
  const trame = wb.Sheets['TRAME ICPE'] || wb.Sheets[wb.SheetNames[0]];
  if (!trame) throw new Error('Aucune feuille exploitable dans ce fichier.');
  const champs = [];
  const controles = [];
  const compteurs = [];

  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([section, fields]) => {
      fields.forEach((field) => {
        const row = EXCEL_ROWS[`${section}||${field.cle}`];
        if (!row) return;
        const valeur = valeurCellule(trame, `B${row}`);
        const commentaire = valeurCellule(trame, `C${row}`);
        if (!valeur && !commentaire) return;
        const item = { sectionCode: sectionCode(panelId, section), cle: field.cle, valeur };
        if (field.type === 'controle') controles.push({ ...item, avis: valeur, commentaire });
        else {
          champs.push(item);
          if (/^Index/i.test(field.cle) && valeur) compteurs.push({ label: nettoyerLabel(field.cle), valeur, unite: (field.cle.match(/\(([^)]+)\)/) || [])[1] || '' });
        }
      });
    });
  });

  const reseaux = RESEAU_BLOCS_DEBUT.map((row, index) => ({
    ordre: index + 1,
    tExt: valeurCellule(trame, `B${row}`), tDep: valeurCellule(trame, `B${row + 1}`),
    nom: valeurCellule(trame, `B${row + 2}`), courbe: valeurCellule(trame, `B${row + 3}`),
    tnc: valeurCellule(trame, `B${row + 4}`), programme: valeurCellule(trame, `B${row + 5}`),
  })).filter((r) => r.nom || r.tExt || r.tDep || r.courbe || r.tnc || r.programme);

  const materielSheet = wb.Sheets['MATERIEL'];
  const materiel = [];
  if (materielSheet) {
    for (let row = 4; row <= 500; row++) {
      const values = 'ABCDEFGHIJ'.split('').map((col) => valeurCellule(materielSheet, `${col}${row}`));
      if (!values.some(Boolean)) continue;
      materiel.push({ categorie: values[0], nombre: values[1], designation: values[2], numero: values[3], reseau: values[4], marque: values[5], modele: values[6], caracteristiques: values[7], annee: values[8], etat: values[9] || 'Bon' });
    }
  }

  const remarquesSheet = wb.Sheets['REMARQUES'];
  const remarques = [];
  if (remarquesSheet) {
    for (let row = 4; row <= 500; row++) {
      const poste = valeurCellule(remarquesSheet, `A${row}`);
      const prestation = valeurCellule(remarquesSheet, `B${row}`);
      if (!poste && !prestation) continue;
      remarques.push({ poste, prestation, delai: valeurCellule(remarquesSheet, `D${row}`), estimatif: valeurCellule(remarquesSheet, `F${row}`) });
    }
  }

  if (!champs.length && !controles.length && !reseaux.length && !compteurs.length && !materiel.length && !remarques.length) {
    throw new Error('Le format de ce fichier n’est pas reconnu. Utilise une trame exportée par l’application.');
  }

  return {
    nomFichier,
    client: valeurCellule(trame, 'B1') || 'Client importé',
    site: valeurCellule(trame, 'B2') || 'Site importé',
    adresse: valeurCellule(trame, 'B3'),
    dateVisite: valeurCellule(trame, 'B5') || new Date().toISOString().slice(0, 10),
    champs, controles, reseaux, compteurs, materiel, remarques,
    note: valeurCellule(wb.Sheets['NOTE'], 'A2'),
  };
}

export async function importerAnalyseExcel(analyse) {
  const db = await getDb();
  const deja = await db.getFirstAsync(
    `SELECT entite_id FROM provenances WHERE origine = 'import_excel' AND reference_externe = ?`,
    [analyse.sourceId || analyse.nomFichier]
  );
  if (deja) return { visiteId: deja.entite_id, dejaImporte: true };

  let visiteId;
  let etape = 'initialisation';
  await db.withTransactionAsync(async () => {
    etape = 'client et site';
    let client = await db.getFirstAsync('SELECT id FROM clients WHERE nom = ? COLLATE NOCASE', [analyse.client]);
    if (!client) {
      client = { id: uuidv4() };
      await db.runAsync('INSERT INTO clients (id, nom) VALUES (?, ?)', [client.id, analyse.client]);
    }
    let site = await db.getFirstAsync('SELECT id FROM sites WHERE client_id = ? AND nom_site = ? COLLATE NOCASE', [client.id, analyse.site]);
    if (!site) {
      site = { id: uuidv4() };
      await db.runAsync('INSERT INTO sites (id, client_id, nom_site, adresse) VALUES (?, ?, ?, ?)', [site.id, client.id, analyse.site, analyse.adresse || null]);
    }
    visiteId = uuidv4();
    await db.runAsync(
      `INSERT INTO visites (id, site_id, date_visite, technicien, statut) VALUES (?, ?, ?, 'Import Excel', 'a_completer')`,
      [visiteId, site.id, analyse.dateVisite]
    );
    for (const item of analyse.champs) await db.runAsync(
      `INSERT OR REPLACE INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)`,
      [visiteId, item.sectionCode, item.cle, item.valeur]
    );
    for (const item of analyse.controles) await db.runAsync(
      `INSERT OR REPLACE INTO controles_visite (visite_id, section_code, cle, avis, commentaire) VALUES (?, ?, ?, ?, ?)`,
      [visiteId, item.sectionCode, item.cle, item.avis || null, item.commentaire || null]
    );
    await db.runAsync('INSERT INTO notes (visite_id, contenu) VALUES (?, ?)', [visiteId, analyse.note || '']);

    let installation = await db.getFirstAsync('SELECT id FROM installations WHERE site_id = ? AND actif = 1 LIMIT 1', [site.id]);
    if (!installation) {
      installation = { id: uuidv4() };
      await db.runAsync(`INSERT INTO installations (id, site_id, type_code, nom) VALUES (?, ?, 'chaufferie', 'Installation principale')`, [installation.id, site.id]);
    }
    etape = 'réseaux';
    for (const r of analyse.reseaux) {
      let permanent = await db.getFirstAsync('SELECT id FROM reseaux_site WHERE installation_id = ? AND nom = ? COLLATE NOCASE', [installation.id, r.nom || `Réseau ${r.ordre}`]);
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(`INSERT INTO reseaux_site (id, installation_id, type_code, nom, ordre) VALUES (?, ?, 'chauffage', ?, ?)`, [permanent.id, installation.id, r.nom || `Réseau ${r.ordre}`, r.ordre]);
      }
      await db.runAsync(`INSERT INTO reseaux (id, visite_id, reseau_site_id, ordre, nom_reseau, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, permanent.id, r.ordre, r.nom, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]);
      await db.runAsync(`INSERT OR REPLACE INTO observations_reseau (id, reseau_site_id, visite_id, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), permanent.id, visiteId, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]);
    }
    etape = 'équipements';
    const equipementsUtilises = new Set();
    for (const m of analyse.materiel) {
      const equipementsCompatibles = await db.getAllAsync(
        `SELECT id FROM equipements
         WHERE installation_id = ? AND statut = 'actif'
           AND COALESCE(type_code, '') = COALESCE(?, '') COLLATE NOCASE
           AND COALESCE(designation, '') = COALESCE(?, '') COLLATE NOCASE
           AND COALESCE(marque, '') = COALESCE(?, '') COLLATE NOCASE
           AND COALESCE(modele, '') = COALESCE(?, '') COLLATE NOCASE
           AND (? = '' OR COALESCE(numero_serie, '') = ? COLLATE NOCASE)
         ORDER BY cree_le`,
        [installation.id, m.categorie || 'non_classe', m.designation || '', m.marque || '', m.modele || '', m.numero || '', m.numero || '']
      );
      // Deux lignes identiques dans la même feuille représentent deux appareils.
      // Lors d'une visite suivante, chacune retrouve le bon appareil disponible.
      let equipement = equipementsCompatibles.find((item) => !equipementsUtilises.has(item.id)) || null;
      if (!equipement) {
        equipement = { id: uuidv4() };
        await db.runAsync(`INSERT INTO equipements (id, installation_id, type_code, designation, marque, modele, numero_serie, annee, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`, [equipement.id, installation.id, m.categorie || 'non_classe', m.designation || null, m.marque || null, m.modele || null, m.numero || null, m.annee || null]);
      }
      const equipementId = equipement.id;
      equipementsUtilises.add(equipementId);
      await db.runAsync(`INSERT INTO materiel (id, visite_id, equipement_id, categorie, designation, marque, modele, annee, etat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, equipementId, m.categorie, m.designation, m.marque, m.modele, m.annee, m.etat]);
      await db.runAsync(`INSERT OR REPLACE INTO observations_equipement (id, equipement_id, visite_id, etat) VALUES (?, ?, ?, ?)`, [uuidv4(), equipementId, visiteId, m.etat]);
    }
    etape = 'compteurs';
    for (const c of analyse.compteurs) {
      let permanent = await db.getFirstAsync('SELECT id FROM compteurs_site WHERE installation_id = ? AND libelle = ? COLLATE NOCASE AND actif = 1', [installation.id, c.label]);
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(`INSERT INTO compteurs_site (id, installation_id, type_code, libelle, unite) VALUES (?, ?, ?, ?, ?)`, [permanent.id, installation.id, c.label, c.label, c.unite]);
      }
      const nombre = Number(String(c.valeur).replace(',', '.'));
      await db.runAsync(`INSERT INTO compteurs (id, visite_id, compteur_site_id, label, valeur, unite) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, permanent.id, c.label, c.valeur, c.unite]);
      await db.runAsync(`INSERT OR REPLACE INTO releves_compteur (id, compteur_site_id, visite_id, valeur_texte, valeur_nombre, unite) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), permanent.id, visiteId, c.valeur, Number.isFinite(nombre) ? nombre : null, c.unite]);
    }
    etape = 'réserves';
    for (const r of analyse.remarques) await db.runAsync(
      `INSERT INTO remarques (id, visite_id, poste, prestation, delai, estimatif, origine) VALUES (?, ?, ?, ?, ?, ?, 'Import Excel')`,
      [uuidv4(), visiteId, r.poste, r.prestation, Number(r.delai) || null, Number(String(r.estimatif).replace(',', '.')) || null]
    );
    etape = 'finalisation';
    await db.runAsync(
      `INSERT INTO provenances (id, entite_type, entite_id, origine, reference_externe, details_json) VALUES (?, 'visite', ?, 'import_excel', ?, ?)`,
      [uuidv4(), visiteId, analyse.sourceId || analyse.nomFichier, JSON.stringify({ fichier: analyse.nomFichier, client: analyse.client, site: analyse.site, dateVisite: analyse.dateVisite })]
    );
  }).catch((error) => {
    throw new Error(`Import interrompu pendant l’étape « ${etape} » : ${error.message || error}`);
  });
  return { visiteId, dejaImporte: false };
}
