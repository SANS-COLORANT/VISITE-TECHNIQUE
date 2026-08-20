/**
 * Export Excel — génère un classeur .xlsx à partir des données de la
 * visite, en respectant la position exacte des cellules de la trame
 * originale (feuille TRAME ICPE : colonne A = intitulé, B = valeur ou avis,
 * C = commentaire). Les 4 feuilles d'origine sont reconstituées :
 * TRAME ICPE, MATERIEL, REMARQUES, NOTE.
 *
 * Ce module ne connaît que la base (via db.js) — jamais l'état React.
 */

import * as XLSX from 'xlsx';
// Sur les versions récentes du SDK Expo, l'API classique de expo-file-system
// (writeAsStringAsync, cacheDirectory...) a été déplacée vers ce chemin de
// compatibilité — l'import par défaut pointe maintenant vers une nouvelle
// API différente (classes File/Directory).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { EXCEL_ROWS, TRAME_DATA, RESEAU_TEMPLATE } from './data.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';

const RESEAU_BLOCS_DEBUT = [66, 76, 86, 96, 106, 116];
const RESEAU_OFFSETS = { t_ext_c: 0, t_dep_c: 1, nom_reseau: 2, courbe_de_chauffe: 3, tnc: 4, consigne_programme_horaire: 5 };

function setCell(sheet, ref, valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return;
  sheet[ref] = { t: typeof valeur === 'number' ? 'n' : 's', v: valeur };
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const cellAddr = XLSX.utils.decode_cell(ref);
  range.s.r = Math.min(range.s.r, cellAddr.r);
  range.s.c = Math.min(range.s.c, cellAddr.c);
  range.e.r = Math.max(range.e.r, cellAddr.r);
  range.e.c = Math.max(range.e.c, cellAddr.c);
  sheet['!ref'] = XLSX.utils.encode_range(range);
}

/** Construit le classeur complet pour une visite donnée. */
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

  // ---- Feuille TRAME ICPE ----
  const sheetTrame = { '!ref': 'A1:C1' };

  setCell(sheetTrame, 'A1', 'Nom du client'); setCell(sheetTrame, 'B1', visite.nom_client);
  setCell(sheetTrame, 'A2', 'Nom du site'); setCell(sheetTrame, 'B2', visite.nom_site);
  setCell(sheetTrame, 'A3', 'Nom du local'); setCell(sheetTrame, 'B3', visite.site_adresse || '');
  setCell(sheetTrame, 'A4', 'Trame utilisée'); setCell(sheetTrame, 'B4', 'ICPE');
  setCell(sheetTrame, 'A5', 'Date de la visite'); setCell(sheetTrame, 'B5', visite.date_visite);

  // Champs et contrôles génériques : on retrouve la ligne via EXCEL_ROWS,
  // en reconstituant la même clé "sous-section||cle" que côté saisie.
  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sub, fields]) => {
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fields.forEach((f) => {
        const ligne = EXCEL_ROWS[`${sub}||${f.cle}`];
        if (!ligne) return;
        setCell(sheetTrame, `A${ligne}`, f.cle);
        if (f.type === 'champ') {
          const row = champs.find((c) => c.section_code === sectionCode && c.cle === f.cle);
          if (row) setCell(sheetTrame, `B${ligne}`, row.valeur);
        } else {
          const row = controles.find((c) => c.section_code === sectionCode && c.cle === f.cle);
          if (row) {
            setCell(sheetTrame, `B${ligne}`, row.avis);
            setCell(sheetTrame, `C${ligne}`, row.commentaire);
          }
        }
      });
    });
  });

  // Réseaux dynamiques → 6 blocs fixes de la trame d'origine
  reseaux.forEach((r, i) => {
    if (i >= RESEAU_BLOCS_DEBUT.length) return;
    const debut = RESEAU_BLOCS_DEBUT[i];
    Object.entries(RESEAU_OFFSETS).forEach(([champ, offset]) => {
      setCell(sheetTrame, `A${debut + offset}`, RESEAU_TEMPLATE.find((f) =>
        ({ t_ext_c: 'T°ext(°C)', t_dep_c: 'T°dép(°C)', nom_reseau: 'Nom réseau', courbe_de_chauffe: 'Courbe de chauffe', tnc: 'TNC', consigne_programme_horaire: 'Consigne et Programme horaire' }[champ]) === f.cle
      )?.cle || champ);
      setCell(sheetTrame, `B${debut + offset}`, r[champ]);
    });
  });

  // ---- Feuille MATERIEL ----
  const sheetMateriel = { '!ref': 'A1:J1' };
  const materielCols = ['categorie', 'designation', 'marque', 'modele', 'annee', 'etat'];
  const materielHeaders = ['Catégorie', 'Désignation', 'Marque', 'Modèle', 'Année', 'Etat'];
  setCell(sheetMateriel, 'A1', 'LISTING MATERIEL');
  materielHeaders.forEach((h, i) => setCell(sheetMateriel, `${String.fromCharCode(65 + i)}3`, h));
  materiel.forEach((m, i) => {
    const ligne = 4 + i;
    materielCols.forEach((col, ci) => setCell(sheetMateriel, `${String.fromCharCode(65 + ci)}${ligne}`, m[col]));
  });

  // ---- Feuille REMARQUES ----
  const sheetRemarques = { '!ref': 'A1:F1' };
  setCell(sheetRemarques, 'A1', 'REMARQUES PARTICULIERES');
  ['Poste', 'Prestation', 'Délai (mois)', 'Estimatif (€HT)', 'Origine'].forEach((h, i) =>
    setCell(sheetRemarques, `${String.fromCharCode(65 + i)}3`, h)
  );
  remarques.forEach((r, i) => {
    const ligne = 4 + i;
    setCell(sheetRemarques, `A${ligne}`, r.poste);
    setCell(sheetRemarques, `B${ligne}`, r.prestation);
    setCell(sheetRemarques, `C${ligne}`, r.delai);
    setCell(sheetRemarques, `D${ligne}`, r.estimatif);
    setCell(sheetRemarques, `E${ligne}`, r.origine);
  });

  // ---- Feuille NOTE ----
  const sheetNote = { '!ref': 'A1:A2' };
  setCell(sheetNote, 'A1', 'NOTES');
  setCell(sheetNote, 'A2', note || '');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetTrame, 'TRAME ICPE');
  XLSX.utils.book_append_sheet(wb, sheetRemarques, 'REMARQUES');
  XLSX.utils.book_append_sheet(wb, sheetMateriel, 'MATERIEL');
  XLSX.utils.book_append_sheet(wb, sheetNote, 'NOTE');

  return { wb, visite };
}

/**
 * Génère le fichier et ouvre le menu de partage natif (enregistrer, envoyer
 * par mail, etc.) — c'est la seule façon standard de "télécharger" un
 * fichier depuis une app Expo, il n'y a pas de dossier Téléchargements
 * accessible directement comme sur ordinateur.
 */
async function exporterEtPartager(visiteId) {
  const { wb, visite } = await construireClasseur(visiteId);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const nomFichier = `Visite_${(visite.nom_site || 'site').replace(/[^a-zA-Z0-9]+/g, '')}_${visite.date_visite || ''}.xlsx`;
  const chemin = FileSystem.cacheDirectory + nomFichier;

  await FileSystem.writeAsStringAsync(chemin, base64, { encoding: FileSystem.EncodingType.Base64 });

  const disponible = await Sharing.isAvailableAsync();
  if (disponible) {
    await Sharing.shareAsync(chemin, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exporter la visite',
    });
  }
  return chemin;
}

export { construireClasseur, exporterEtPartager };
EXPOREOF
wc -l /home/claude/github_repo/src/excelExport.js
