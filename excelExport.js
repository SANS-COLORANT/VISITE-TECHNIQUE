/**
 * Export Excel — charge le modèle Excel original (Trame_ICPE.xlsx, embarqué
 * dans templateExcel.js) et n'écrit QUE les valeurs de la visite dedans.
 * Toute la mise en forme d'origine est donc conservée : couleurs, largeurs
 * de colonnes, listes déroulantes, fusions de cellules, libellés déjà
 * présents en colonne A. On ne fait jamais table rase du fichier.
 *
 * Ce module ne connaît que la base (via db.js) — jamais l'état React.
 */

import * as XLSX from 'xlsx';
// Sur les versions récentes du SDK Expo, l'API classique de expo-file-system
// (writeAsStringAsync, cacheDirectory...) a été déplacée vers ce chemin de
// compatibilité — l'import par défaut pointe vers une nouvelle API différente
// (classes File/Directory).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { EXCEL_ROWS, TRAME_DATA } from './data.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';

const RESEAU_BLOCS_DEBUT = [66, 76, 86, 96, 106, 116];
const RESEAU_OFFSETS = { t_ext_c: 0, t_dep_c: 1, nom_reseau: 2, courbe_de_chauffe: 3, tnc: 4, consigne_programme_horaire: 5 };

/**
 * Met à jour la valeur d'une cellule EXISTANTE sans toucher à ses propriétés
 * de mise en forme (`.s` = style, format numérique, etc.) — c'est la
 * différence clé avec un `sheet[ref] = {...}` qui écraserait tout.
 */
function setCell(sheet, ref, valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return;
  const existante = sheet[ref] || {};
  sheet[ref] = { ...existante, v: valeur, t: typeof valeur === 'number' ? 'n' : 's' };
  delete sheet[ref].w; // texte formaté mis en cache par Excel, à recalculer
}

/** Construit le classeur pour une visite donnée, à partir du vrai modèle. */
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

  // Charge le vrai modèle — libellés, styles, listes déroulantes, tout y est déjà.
  const wb = XLSX.read(TEMPLATE_EXCEL_BASE64, {
    type: 'base64',
    cellStyles: true,   // conserve les couleurs/polices des cellules
    cellNF: true,       // conserve les formats numériques
    bookVBA: true,       // conserve la structure interne du classeur
  });
  const sheetTrame = wb.Sheets['TRAME ICPE'];
  const sheetMateriel = wb.Sheets['MATERIEL'];
  const sheetRemarques = wb.Sheets['REMARQUES'];
  const sheetNote = wb.Sheets['NOTE'];

  // ---- En-tête ----
  setCell(sheetTrame, 'B1', visite.nom_client);
  setCell(sheetTrame, 'B2', visite.nom_site);
  setCell(sheetTrame, 'B3', visite.site_adresse || '');
  setCell(sheetTrame, 'B4', 'ICPE');
  setCell(sheetTrame, 'B5', visite.date_visite);

  // ---- Champs et contrôles génériques (uniquement les valeurs) ----
  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sub, fields]) => {
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fields.forEach((f) => {
        const ligne = EXCEL_ROWS[`${sub}||${f.cle}`];
        if (!ligne) return;
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

  // ---- Réseaux dynamiques → 6 blocs fixes déjà présents dans le modèle ----
  reseaux.forEach((r, i) => {
    if (i >= RESEAU_BLOCS_DEBUT.length) return; // au-delà de 6, non couvert par le modèle papier
    const debut = RESEAU_BLOCS_DEBUT[i];
    Object.entries(RESEAU_OFFSETS).forEach(([champ, offset]) => {
      setCell(sheetTrame, `B${debut + offset}`, r[champ]);
    });
  });

  // ---- Feuille MATERIEL (en-têtes déjà dans le modèle, ligne 4+) ----
  const materielCols = ['categorie', 'nombre', 'designation', 'numero_materiel', 'reseau_desservi', 'marque', 'modele', 'caracteristiques', 'annee', 'etat'];
  materiel.forEach((m, i) => {
    const ligne = 4 + i;
    materielCols.forEach((col, ci) => setCell(sheetMateriel, `${String.fromCharCode(65 + ci)}${ligne}`, m[col]));
  });

  // ---- Feuille REMARQUES (en-têtes déjà dans le modèle, ligne 4+) ----
  remarques.forEach((r, i) => {
    const ligne = 4 + i;
    setCell(sheetRemarques, `A${ligne}`, r.poste);
    setCell(sheetRemarques, `B${ligne}`, r.prestation);
    setCell(sheetRemarques, `D${ligne}`, r.delai);
    setCell(sheetRemarques, `F${ligne}`, r.estimatif);
  });

  // ---- Feuille NOTE ----
  setCell(sheetNote, 'A2', note || '');

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
