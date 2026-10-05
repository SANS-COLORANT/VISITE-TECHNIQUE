/** Import d'une trame Excel ICPE ou Réseau de chaleur avec aperçu puis intégration SQLite. */

import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getDb, uuidv4 } from './db.js';
import {
  getTrameData,
  getExcelLayout,
  findExcelRow,
  normalizeTrameCode,
  defaultPerimetreForControle,
} from './trames.js';

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

function lireValeurTrame(trame, row, trameCode) {
  if (normalizeTrameCode(trameCode) === 'RESEAU_CHALEUR') {
    return valeurCellule(trame, `C${row}`) || valeurCellule(trame, `E${row}`);
  }
  return valeurCellule(trame, `B${row}`);
}

function lireControleTrame(trame, row, trameCode) {
  if (normalizeTrameCode(trameCode) === 'RESEAU_CHALEUR') {
    return {
      avis: valeurCellule(trame, `B${row}`) || valeurCellule(trame, `D${row}`),
      commentaire: valeurCellule(trame, `C${row}`) || valeurCellule(trame, `E${row}`),
    };
  }
  return { avis: valeurCellule(trame, `B${row}`), commentaire: valeurCellule(trame, `C${row}`) };
}

function infererPerimetreRemarque(trame, layout, prestation) {
  if (!prestation || !layout.resumeRows) return null;
  const needle = prestation.toLowerCase().replace(/\s+/g, ' ').trim();
  const trouves = new Set();
  for (const perimetre of ['Primaire', 'Secondaire']) {
    for (const row of Object.values(layout.resumeRows[perimetre] || {})) {
      const texte = (valeurCellule(trame, `C${row}`) || valeurCellule(trame, `E${row}`))
        .toLowerCase().replace(/\s+/g, ' ');
      if (needle && texte.includes(needle)) trouves.add(perimetre);
    }
  }
  // Si le même libellé est présent dans les deux synthèses, on ne devine
  // pas : la donnée est ambiguë et reste à classer dans METRA.
  return trouves.size === 1 ? [...trouves][0] : null;
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
  analyse.sourceId = `${analyse.nomFichier}:${empreinteLegere(base64)}`;
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
  const trameCode = wb.Sheets['TRAME RÉSEAU DE CHALEUR'] ? 'RESEAU_CHALEUR' : 'ICPE';
  const layout = getExcelLayout(trameCode);
  const trame = wb.Sheets[layout.sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!trame) throw new Error('Aucune feuille exploitable dans ce fichier.');

  const trameData = getTrameData(trameCode);
  const champs = [];
  const controles = [];
  const compteurs = [];

  Object.entries(trameData).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([section, fields]) => {
      if (trameCode === 'RESEAU_CHALEUR' && section === 'Général') return;
      const codeSection = sectionCode(panelId, section);
      fields.forEach((field) => {
        const row = findExcelRow(trame, trameCode, panelId, section, field.cle);
        if (!row) return;

        if (field.type === 'controle') {
          const { avis, commentaire } = lireControleTrame(trame, row, trameCode);
          if (!avis && !commentaire) return;
          controles.push({
            sectionCode: codeSection,
            cle: field.cle,
            avis,
            commentaire,
            perimetre: avis === 'N.S' ? defaultPerimetreForControle(trameCode, codeSection, field.cle) : null,
          });
        } else {
          const valeur = lireValeurTrame(trame, row, trameCode);
          if (!valeur) return;
          champs.push({ sectionCode: codeSection, cle: field.cle, valeur });
          if (/^Index/i.test(field.cle)) {
            compteurs.push({
              label: nettoyerLabel(field.cle),
              valeur,
              unite: (field.cle.match(/\(([^)]+)\)/) || [])[1] || '',
            });
          }
        }
      });
    });
  });

  const valeurReseau = (row) => lireValeurTrame(trame, row, trameCode);
  const reseaux = layout.reseauBlocsDebut.map((row, index) => ({
    ordre: index + 1,
    tExt: valeurReseau(row),
    tDep: valeurReseau(row + 1),
    nom: valeurReseau(row + 2),
    courbe: valeurReseau(row + 3),
    tnc: valeurReseau(row + 4),
    programme: valeurReseau(row + 5),
  })).filter((r) => r.nom || r.tExt || r.tDep || r.courbe || r.tnc || r.programme);

  const materielSheet = wb.Sheets['MATERIEL'];
  const materiel = [];
  if (materielSheet) {
    for (let row = 4; row <= 500; row++) {
      const values = 'ABCDEFGHIJ'.split('').map((col) => valeurCellule(materielSheet, `${col}${row}`));
      if (!values.some(Boolean)) continue;
      const perimetre = trameCode === 'RESEAU_CHALEUR' && ['Primaire', 'Secondaire'].includes(values[4]) ? values[4] : null;
      materiel.push({
        categorie: values[0],
        nombre: values[1],
        designation: values[2],
        numero: values[3],
        reseau: perimetre ? '' : values[4],
        perimetre,
        marque: values[5],
        modele: values[6],
        caracteristiques: values[7],
        annee: values[8],
        etat: values[9] || 'Bon',
      });
    }
  }

  const remarquesSheet = wb.Sheets['REMARQUES'];
  const remarques = [];
  if (remarquesSheet) {
    for (let row = 4; row <= 500; row++) {
      const poste = valeurCellule(remarquesSheet, `A${row}`);
      const prestation = valeurCellule(remarquesSheet, `B${row}`);
      if (!poste && !prestation) continue;
      remarques.push({
        poste,
        prestation,
        delai: valeurCellule(remarquesSheet, `D${row}`),
        estimatif: valeurCellule(remarquesSheet, `F${row}`),
        perimetre: trameCode === 'RESEAU_CHALEUR' ? infererPerimetreRemarque(trame, layout, prestation) : null,
      });
    }
  }

  // L'export Réseau de chaleur porte le périmètre des réserves dans les
  // blocs de synthèse Primaire / Secondaire. Au réimport, on réassocie cette
  // information au contrôle N.S correspondant afin de conserver un aller /
  // retour Excel -> METRA -> Excel sans perdre le classement.
  if (trameCode === 'RESEAU_CHALEUR') {
    const normaliser = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    controles.forEach((controle) => {
      if (controle.avis !== 'N.S' || !controle.commentaire) return;
      const commentaire = normaliser(controle.commentaire);
      const perimetres = [...new Set(
        remarques
          .filter((r) => {
            if (!r.perimetre || !r.prestation) return false;
            const prestation = normaliser(r.prestation);
            return prestation === commentaire || prestation.includes(commentaire) || commentaire.includes(prestation);
          })
          .map((r) => r.perimetre)
      )];
      if (perimetres.length === 1) controle.perimetre = perimetres[0];
    });
  }

  if (!champs.length && !controles.length && !reseaux.length && !compteurs.length && !materiel.length && !remarques.length) {
    throw new Error('Le format de ce fichier n’est pas reconnu. Utilise une trame exportée par l’application.');
  }

  return {
    nomFichier,
    trameCode,
    client: valeurCellule(trame, 'B1') || 'Client importé',
    site: valeurCellule(trame, 'B2') || 'Site importé',
    adresse: valeurCellule(trame, 'B3'),
    dateVisite: valeurCellule(trame, 'B5') || new Date().toISOString().slice(0, 10),
    champs,
    controles,
    reseaux,
    compteurs,
    materiel,
    remarques,
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
      `INSERT INTO visites (id, site_id, date_visite, technicien, statut, trame_code) VALUES (?, ?, ?, 'Import Excel', 'a_completer', ?)`,
      [visiteId, site.id, analyse.dateVisite, normalizeTrameCode(analyse.trameCode)]
    );

    for (const item of analyse.champs) await db.runAsync(
      `INSERT OR REPLACE INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)`,
      [visiteId, item.sectionCode, item.cle, item.valeur]
    );
    for (const item of analyse.controles) await db.runAsync(
      `INSERT OR REPLACE INTO controles_visite (visite_id, section_code, cle, avis, commentaire, perimetre) VALUES (?, ?, ?, ?, ?, ?)`,
      [visiteId, item.sectionCode, item.cle, item.avis || null, item.commentaire || null, item.perimetre || null]
    );
    await db.runAsync('INSERT INTO notes (visite_id, contenu) VALUES (?, ?)', [visiteId, analyse.note || '']);

    let installation = await db.getFirstAsync('SELECT id FROM installations WHERE site_id = ? AND actif = 1 LIMIT 1', [site.id]);
    if (!installation) {
      installation = { id: uuidv4() };
      await db.runAsync(
        `INSERT INTO installations (id, site_id, type_code, nom) VALUES (?, ?, ?, ?)`,
        [installation.id, site.id, analyse.trameCode === 'RESEAU_CHALEUR' ? 'sous_station' : 'chaufferie', 'Installation principale']
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
        `INSERT INTO reseaux (id, visite_id, reseau_site_id, ordre, nom_reseau, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), visiteId, permanent.id, r.ordre, r.nom, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO observations_reseau (id, reseau_site_id, visite_id, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
          `INSERT INTO equipements (id, installation_id, type_code, designation, marque, modele, numero_serie, annee, statut, perimetre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?)`,
          [equipement.id, installation.id, m.categorie || 'non_classe', m.designation || null, m.marque || null, m.modele || null, m.numero || null, m.annee || null, m.perimetre || null]
        );
      } else if (m.perimetre) {
        await db.runAsync('UPDATE equipements SET perimetre = ? WHERE id = ?', [m.perimetre, equipement.id]);
      }
      const equipementId = equipement.id;
      equipementsUtilises.add(equipementId);
      await db.runAsync(
        `INSERT INTO materiel (id, visite_id, equipement_id, categorie, designation, marque, modele, annee, etat, perimetre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), visiteId, equipementId, m.categorie, m.designation, m.marque, m.modele, m.annee, m.etat, m.perimetre || null]
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
    for (const r of analyse.remarques) await db.runAsync(
      `INSERT INTO remarques (id, visite_id, poste, prestation, delai, estimatif, origine, perimetre)
       VALUES (?, ?, ?, ?, ?, ?, 'Import Excel', ?)`,
      [uuidv4(), visiteId, r.poste, r.prestation, Number(r.delai) || null, Number(String(r.estimatif).replace(',', '.')) || null, r.perimetre || null]
    );

    etape = 'finalisation';
    await db.runAsync(
      `INSERT INTO provenances (id, entite_type, entite_id, origine, reference_externe, details_json)
       VALUES (?, 'visite', ?, 'import_excel', ?, ?)`,
      [uuidv4(), visiteId, analyse.sourceId || analyse.nomFichier, JSON.stringify({
        fichier: analyse.nomFichier,
        client: analyse.client,
        site: analyse.site,
        dateVisite: analyse.dateVisite,
        trameCode: analyse.trameCode,
      })]
    );
  }).catch((error) => {
    throw new Error(`Import interrompu pendant l’étape « ${etape} » : ${error.message || error}`);
  });
  return { visiteId, dejaImporte: false };
}
