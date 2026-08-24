/** Import Excel générique : détecte la trame, analyse via son mapping puis intègre SQLite. */

import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { detecterTrameDepuisClasseur } from './trameRegistry.js';
import { getDb, uuidv4 } from './db.js';

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

function nettoyerLabel(cle) {
  return cle.replace(/^Index\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function lireTable(sheet, config) {
  if (!sheet || !config) return [];
  const resultats = [];
  const debut = Number(config.startRow || 1);
  const fin = Number(config.maxImportRow || 500);
  const columns = config.columns || [];
  for (let row = debut; row <= fin; row++) {
    const objet = {};
    let nonVide = false;
    for (const [col, cle] of columns) {
      const valeur = valeurCellule(sheet, `${col}${row}`);
      objet[cle] = valeur;
      if (valeur !== '') nonVide = true;
    }
    if (nonVide) resultats.push(objet);
  }
  return resultats;
}

function lireReseauxComplementaires(wb, config, ordreDepart) {
  const overflow = config?.overflow;
  const sheet = overflow ? wb.Sheets[overflow.sheet] : null;
  if (!overflow || !sheet) return [];
  const resultats = [];
  const debut = Number(overflow.startRow || 3);
  const fin = Number(overflow.maxImportRow || 500);
  for (let row = debut; row <= fin; row++) {
    const reseau = { ordre: ordreDepart + resultats.length };
    let nonVide = false;
    for (const colonne of overflow.columns || []) {
      const valeur = valeurCellule(sheet, `${colonne.col}${row}`);
      reseau[colonne.importKey] = valeur;
      if (valeur !== '') nonVide = true;
    }
    if (nonVide) resultats.push(reseau);
  }
  return resultats;
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
  analyse.sourceId = `${analyse.trameId}:${analyse.nomFichier}:${empreinteLegere(base64)}`;
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
  const definition = detecterTrameDepuisClasseur(wb, valeurCellule);
  if (!definition) {
    throw new Error('Le format de ce fichier n’est associé à aucune trame connue de l’application.');
  }
  const cfg = definition.excel;
  const principale = wb.Sheets[cfg.mainSheet];
  if (!principale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du fichier.`);

  const champs = [];
  const controles = [];
  const compteurs = [];

  for (const mapping of cfg.fieldMappings || []) {
    const valeur = valeurCellule(principale, mapping.valueCell);
    const commentaire = mapping.commentCell ? valeurCellule(principale, mapping.commentCell) : '';
    if (!valeur && !commentaire) continue;
    const item = { sectionCode: mapping.sectionCode, cle: mapping.cle, valeur };
    if (mapping.type === 'controle') {
      controles.push({ ...item, avis: valeur, commentaire });
    } else {
      champs.push(item);
      if (/^Index/i.test(mapping.cle) && valeur) {
        compteurs.push({
          label: nettoyerLabel(mapping.cle),
          valeur,
          unite: (mapping.cle.match(/\(([^)]+)\)/) || [])[1] || '',
        });
      }
    }
  }

  const reseauxCfg = cfg.networks;
  const reseauxSheet = reseauxCfg ? (wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || principale) : null;
  const reseauxPrincipaux = reseauxCfg ? (reseauxCfg.starts || []).map((row, index) => {
    const r = { ordre: index + 1 };
    for (const [cle, offset] of Object.entries(reseauxCfg.importOffsets || {})) {
      r[cle] = valeurCellule(reseauxSheet, `B${row + offset}`);
    }
    return r;
  }).filter((r) => Object.entries(r).some(([k, v]) => k !== 'ordre' && !!v)) : [];
  const reseauxComplementaires = reseauxCfg
    ? lireReseauxComplementaires(wb, reseauxCfg, reseauxPrincipaux.length + 1)
    : [];
  const reseaux = [...reseauxPrincipaux, ...reseauxComplementaires].map((r, index) => ({ ...r, ordre: index + 1 }));

  const tables = cfg.tables || {};
  const materielCfg = tables.materiel;
  const materiel = materielCfg ? lireTable(wb.Sheets[materielCfg.sheet], materielCfg).map((m) => ({ ...m, etat: m.etat || 'Bon' })) : [];

  const remarquesCfg = tables.remarques;
  const remarques = remarquesCfg ? lireTable(wb.Sheets[remarquesCfg.sheet], remarquesCfg) : [];

  const noteCfg = tables.note;
  const note = noteCfg ? valeurCellule(wb.Sheets[noteCfg.sheet], noteCfg.cell) : '';

  if (!champs.length && !controles.length && !reseaux.length && !compteurs.length && !materiel.length && !remarques.length) {
    throw new Error(`La trame ${definition.nom} a été reconnue, mais aucune donnée exploitable n’a été trouvée.`);
  }

  const meta = cfg.metadata || {};
  return {
    trameId: definition.id,
    trameNom: definition.nom,
    nomFichier,
    client: valeurCellule(principale, meta.client) || 'Client importé',
    site: valeurCellule(principale, meta.site) || 'Site importé',
    adresse: valeurCellule(principale, meta.adresse),
    dateVisite: valeurCellule(principale, meta.dateVisite) || new Date().toISOString().slice(0, 10),
    champs, controles, reseaux, compteurs, materiel, remarques, note,
  };
}

export async function importerAnalyseExcel(analyse) {
  const db = await getDb();
  const deja = await db.getFirstAsync(
    `SELECT entite_id FROM provenances WHERE origine = 'import_excel' AND reference_externe = ?`,
    [analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`]
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

    let site = await db.getFirstAsync(
      'SELECT id FROM sites WHERE client_id = ? AND nom_site = ? COLLATE NOCASE',
      [client.id, analyse.site]
    );
    if (!site) {
      site = { id: uuidv4() };
      await db.runAsync(
        'INSERT INTO sites (id, client_id, nom_site, adresse) VALUES (?, ?, ?, ?)',
        [site.id, client.id, analyse.site, analyse.adresse || null]
      );
    }

    visiteId = uuidv4();
    await db.runAsync(
      `INSERT INTO visites (id, site_id, date_visite, technicien, statut, trame_id)
       VALUES (?, ?, ?, 'Import Excel', 'a_completer', ?)`,
      [visiteId, site.id, analyse.dateVisite, analyse.trameId || 'icpe_v1']
    );

    for (const item of analyse.champs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)`,
        [visiteId, item.sectionCode, item.cle, item.valeur]
      );
    }
    for (const item of analyse.controles) {
      await db.runAsync(
        `INSERT OR REPLACE INTO controles_visite (visite_id, section_code, cle, avis, commentaire) VALUES (?, ?, ?, ?, ?)`,
        [visiteId, item.sectionCode, item.cle, item.avis || null, item.commentaire || null]
      );
    }
    await db.runAsync('INSERT INTO notes (visite_id, contenu) VALUES (?, ?)', [visiteId, analyse.note || '']);

    let installation = await db.getFirstAsync('SELECT id FROM installations WHERE site_id = ? AND actif = 1 LIMIT 1', [site.id]);
    if (!installation) {
      installation = { id: uuidv4() };
      await db.runAsync(
        `INSERT INTO installations (id, site_id, type_code, nom) VALUES (?, ?, 'chaufferie', 'Installation principale')`,
        [installation.id, site.id]
      );
    }

    etape = 'réseaux';
    for (const r of analyse.reseaux) {
      let permanent = await db.getFirstAsync(
        'SELECT id FROM reseaux_site WHERE installation_id = ? AND nom = ? COLLATE NOCASE',
        [installation.id, r.nom || `Réseau ${r.ordre}`]
      );
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(
          `INSERT INTO reseaux_site (id, installation_id, type_code, nom, ordre) VALUES (?, ?, 'chauffage', ?, ?)`,
          [permanent.id, installation.id, r.nom || `Réseau ${r.ordre}`, r.ordre]
        );
      }
      await db.runAsync(
        `INSERT INTO reseaux (id, visite_id, reseau_site_id, ordre, nom_reseau, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), visiteId, permanent.id, r.ordre, r.nom, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO observations_reseau (id, reseau_site_id, visite_id, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), permanent.id, visiteId, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]
      );
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
      let equipement = equipementsCompatibles.find((item) => !equipementsUtilises.has(item.id)) || null;
      if (!equipement) {
        equipement = { id: uuidv4() };
        await db.runAsync(
          `INSERT INTO equipements (id, installation_id, type_code, designation, marque, modele, numero_serie, annee, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`,
          [equipement.id, installation.id, m.categorie || 'non_classe', m.designation || null, m.marque || null, m.modele || null, m.numero || null, m.annee || null]
        );
      }
      const equipementId = equipement.id;
      equipementsUtilises.add(equipementId);
      await db.runAsync(
        `INSERT INTO materiel (
          id, visite_id, equipement_id, categorie, nombre, designation, numero_materiel,
          reseau_desservi, marque, modele, caracteristiques, annee, etat
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), visiteId, equipementId, m.categorie || null, m.nombre || null,
          m.designation || null, m.numero || null, m.reseau || null, m.marque || null,
          m.modele || null, m.caracteristiques || null, m.annee || null, m.etat || 'Bon',
        ]
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO observations_equipement (id, equipement_id, visite_id, etat) VALUES (?, ?, ?, ?)`,
        [uuidv4(), equipementId, visiteId, m.etat]
      );
    }

    etape = 'compteurs';
    for (const c of analyse.compteurs) {
      let permanent = await db.getFirstAsync(
        'SELECT id FROM compteurs_site WHERE installation_id = ? AND libelle = ? COLLATE NOCASE AND actif = 1',
        [installation.id, c.label]
      );
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(
          `INSERT INTO compteurs_site (id, installation_id, type_code, libelle, unite) VALUES (?, ?, ?, ?, ?)`,
          [permanent.id, installation.id, c.label, c.label, c.unite]
        );
      }
      const nombre = Number(String(c.valeur).replace(',', '.'));
      await db.runAsync(
        `INSERT INTO compteurs (id, visite_id, compteur_site_id, label, valeur, unite) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), visiteId, permanent.id, c.label, c.valeur, c.unite]
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO releves_compteur (id, compteur_site_id, visite_id, valeur_texte, valeur_nombre, unite) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), permanent.id, visiteId, c.valeur, Number.isFinite(nombre) ? nombre : null, c.unite]
      );
    }

    etape = 'réserves';
    for (const r of analyse.remarques) {
      await db.runAsync(
        `INSERT INTO remarques (id, visite_id, poste, prestation, delai, estimatif, origine) VALUES (?, ?, ?, ?, ?, ?, 'Import Excel')`,
        [uuidv4(), visiteId, r.poste, r.prestation, Number(r.delai) || null, Number(String(r.estimatif).replace(',', '.')) || null]
      );
    }

    etape = 'finalisation';
    await db.runAsync(
      `INSERT INTO provenances (id, entite_type, entite_id, origine, reference_externe, details_json) VALUES (?, 'visite', ?, 'import_excel', ?, ?)`,
      [
        uuidv4(), visiteId, analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`,
        JSON.stringify({
          fichier: analyse.nomFichier,
          trameId: analyse.trameId,
          trameNom: analyse.trameNom,
          client: analyse.client,
          site: analyse.site,
          dateVisite: analyse.dateVisite,
        }),
      ]
    );
  }).catch((error) => {
    throw new Error(`Import interrompu pendant l’étape « ${etape} » : ${error.message || error}`);
  });

  return { visiteId, dejaImporte: false, trameId: analyse.trameId, trameNom: analyse.trameNom };
}
