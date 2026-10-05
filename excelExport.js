/**
 * Export Excel — conserve les modèles métier d'origine et n'écrit que les
 * valeurs de la visite. ICPE et Réseau de chaleur utilisent chacun leur
 * propre classeur source afin de préserver mise en forme, validations,
 * fusions et organisation des feuilles.
 */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { TEMPLATE_RESEAU_CHALEUR_BASE64 } from './templateExcelReseauChaleur.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';
import { getTrameData, getExcelLayout, findExcelRow, getTrameLabel, normalizeTrameCode } from './trames.js';

const RESEAU_OFFSETS = {
  t_ext_c: 0,
  t_dep_c: 1,
  nom_reseau: 2,
  courbe_de_chauffe: 3,
  tnc: 4,
  consigne_programme_horaire: 5,
};

function setCell(sheet, ref, valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return;
  const existante = sheet[ref] || {};
  sheet[ref] = { ...existante, v: valeur, t: typeof valeur === 'number' ? 'n' : 's' };
  delete sheet[ref].w;
}

function setNetworkPair(sheet, row, avis, commentaire) {
  setCell(sheet, `B${row}`, avis);
  setCell(sheet, `C${row}`, commentaire);
  // La trame Réseau de chaleur fournie comporte les deux couples Avis /
  // Commentaire B-C et D-E. On les maintient synchronisés à l'export.
  setCell(sheet, `D${row}`, avis);
  setCell(sheet, `E${row}`, commentaire);
}

function categorieResume(poste) {
  const p = String(poste || '').toLowerCase();
  if (p.includes('p2') || p.includes('entretien')) return 'P2';
  if (p.includes('p3') || p.includes('garantie totale')) return 'P3';
  if (p.includes('conform')) return 'Conformite';
  if (p.includes('amélior') || p.includes('amelior')) return 'Amelioration';
  return 'Remarque';
}

function ecrireResumeReseauChaleur(sheet, remarques, resumeRows) {
  for (const perimetre of ['Primaire', 'Secondaire']) {
    const rows = resumeRows?.[perimetre];
    if (!rows) continue;
    const groupe = remarques.filter((r) => r.perimetre === perimetre);
    for (const [categorie, row] of Object.entries(rows)) {
      const textes = groupe
        .filter((r) => categorieResume(r.poste) === categorie)
        .map((r) => r.prestation)
        .filter(Boolean);
      setNetworkPair(sheet, row, 'S.O', textes.length ? textes.join('\n\n') : '/');
    }
  }
}

/** Construit le classeur pour une visite donnée. */
async function construireClasseur(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const champs = await db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]);
  const controles = await db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]);
  const reseaux = await listerReseaux(visiteId);
  const materiel = await listerMateriel(visiteId);
  const remarques = await listerRemarques(visiteId);
  const note = await getNote(visiteId);

  const trameCode = normalizeTrameCode(visite.trame_code);
  const estReseauChaleur = trameCode === 'RESEAU_CHALEUR';
  const layout = getExcelLayout(trameCode);
  const trameData = getTrameData(trameCode);
  const template = estReseauChaleur ? TEMPLATE_RESEAU_CHALEUR_BASE64 : TEMPLATE_EXCEL_BASE64;

  const wb = XLSX.read(template, {
    type: 'base64',
    cellStyles: true,
    cellNF: true,
    bookVBA: true,
  });
  const sheetTrame = wb.Sheets[layout.sheetName];
  const sheetMateriel = wb.Sheets['MATERIEL'];
  const sheetRemarques = wb.Sheets['REMARQUES'];
  const sheetNote = wb.Sheets['NOTE'];
  if (!sheetTrame) throw new Error(`Feuille ${layout.sheetName} absente du modèle Excel`);

  // ---- En-tête ----
  setCell(sheetTrame, 'B1', visite.nom_client);
  setCell(sheetTrame, 'B2', visite.nom_site);
  setCell(sheetTrame, 'B3', visite.site_adresse || '');
  setCell(sheetTrame, 'B4', estReseauChaleur ? 'RÉSEAU DE CHALEUR' : 'ICPE');
  setCell(sheetTrame, 'B5', visite.date_visite);

  // ---- Champs et contrôles génériques ----
  Object.entries(trameData).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sub, fields]) => {
      if (estReseauChaleur && sub === 'Général') return; // déjà géré dans l'en-tête
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fields.forEach((field) => {
        const ligne = findExcelRow(sheetTrame, trameCode, panelId, sub, field.cle);
        if (!ligne) return;

        if (field.type === 'champ') {
          const row = champs.find((c) => c.section_code === sectionCode && c.cle === field.cle);
          if (!row) return;
          const col = layout.fieldColumn || 'B';
          setCell(sheetTrame, `${col}${ligne}`, row.valeur);
          if (estReseauChaleur) setCell(sheetTrame, `E${ligne}`, row.valeur);
        } else {
          const row = controles.find((c) => c.section_code === sectionCode && c.cle === field.cle);
          if (!row) return;
          if (estReseauChaleur) setNetworkPair(sheetTrame, ligne, row.avis, row.commentaire);
          else {
            setCell(sheetTrame, `B${ligne}`, row.avis);
            setCell(sheetTrame, `C${ligne}`, row.commentaire);
          }
        }
      });
    });
  });

  // ---- Réseaux dynamiques ----
  reseaux.forEach((reseau, i) => {
    if (i >= layout.reseauBlocsDebut.length) return;
    const debut = layout.reseauBlocsDebut[i];
    Object.entries(RESEAU_OFFSETS).forEach(([champ, offset]) => {
      const row = debut + offset;
      const col = estReseauChaleur ? 'C' : 'B';
      setCell(sheetTrame, `${col}${row}`, reseau[champ]);
      if (estReseauChaleur) setCell(sheetTrame, `E${row}`, reseau[champ]);
    });
  });

  // ---- Feuille MATERIEL ----
  const materielCols = [
    'categorie', 'nombre', 'designation', 'numero_materiel',
    'reseau_desservi', 'marque', 'modele', 'caracteristiques', 'annee', 'etat',
  ];
  materiel.forEach((m, i) => {
    const ligne = 4 + i;
    materielCols.forEach((col, ci) => {
      let valeur = m[col];
      // Dans la trame Réseau de chaleur, la colonne E "Réseau desservi"
      // porte le classement demandé Primaire / Secondaire.
      if (estReseauChaleur && col === 'reseau_desservi') valeur = m.perimetre;
      setCell(sheetMateriel, `${String.fromCharCode(65 + ci)}${ligne}`, valeur);
    });
  });

  // ---- Feuille REMARQUES ----
  remarques.forEach((r, i) => {
    const ligne = 4 + i;
    setCell(sheetRemarques, `A${ligne}`, r.poste);
    setCell(sheetRemarques, `B${ligne}`, r.prestation);
    setCell(sheetRemarques, `D${ligne}`, r.delai);
    setCell(sheetRemarques, `F${ligne}`, r.estimatif);
  });

  // ---- Synthèse Primaire / Secondaire du modèle Réseau de chaleur ----
  if (estReseauChaleur) {
    ecrireResumeReseauChaleur(sheetTrame, remarques, layout.resumeRows);
  }

  // ---- Feuille NOTE ----
  setCell(sheetNote, 'A2', note || '');

  return { wb, visite };
}

async function exporterEtPartager(visiteId) {
  const { wb, visite } = await construireClasseur(visiteId);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const suffixe = normalizeTrameCode(visite.trame_code) === 'RESEAU_CHALEUR' ? '_Reseau_Chaleur' : '';
  const nomFichier = `Visite_${(visite.nom_site || 'site').replace(/[^a-zA-Z0-9]+/g, '')}${suffixe}_${visite.date_visite || ''}.xlsx`;
  const chemin = FileSystem.cacheDirectory + nomFichier;

  await FileSystem.writeAsStringAsync(chemin, base64, { encoding: FileSystem.EncodingType.Base64 });

  const disponible = await Sharing.isAvailableAsync();
  if (disponible) {
    await Sharing.shareAsync(chemin, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: `Exporter la visite · ${getTrameLabel(visite.trame_code)}`,
    });
  }
  return chemin;
}

export { construireClasseur, exporterEtPartager };
