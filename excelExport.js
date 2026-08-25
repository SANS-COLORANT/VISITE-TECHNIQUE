/**
 * Export Excel fidele au fichier importe.
 *
 * Le classeur n'est jamais reconstruit avec SheetJS : on repart des octets
 * OOXML du fichier source et on ne modifie que les cellules ciblees. Pour une
 * visite qui ne provient pas d'un import Excel, la trame embarquee sert de
 * source, avec exactement la meme methode d'ecriture OOXML.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { EXCEL_ROWS, TRAME_DATA } from './data.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';
import { patchWorkbookBase64 } from './ooxmlExcel.js';

const RESEAU_BLOCS_DEBUT = [66, 76, 86, 96, 106, 116];
const RESEAU_OFFSETS = { t_ext_c: 0, t_dep_c: 1, nom_reseau: 2, courbe_de_chauffe: 3, tnc: 4, consigne_programme_horaire: 5 };
const SOURCE_DIR = `${FileSystem.documentDirectory}excel-sources/`;

function ajouterMiseAJour(updates, sheet, ref, value) {
  if (value === null || value === undefined || value === '') return;
  updates.push({ sheet, ref, value });
}

function hashDepuisReference(reference) {
  if (!reference) return null;
  const parts = String(reference).split(':');
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

async function chargerSourceOriginale(db, visiteId) {
  const provenance = await db.getFirstAsync(
    `SELECT reference_externe
     FROM provenances
     WHERE entite_type = 'visite' AND entite_id = ? AND origine = 'import_excel'
     ORDER BY importe_le DESC
     LIMIT 1`,
    [visiteId]
  );

  const hash = hashDepuisReference(provenance?.reference_externe);
  if (hash) {
    const chemin = `${SOURCE_DIR}${hash}.xlsx`;
    const info = await FileSystem.getInfoAsync(chemin);
    if (info.exists) {
      return FileSystem.readAsStringAsync(chemin, { encoding: FileSystem.EncodingType.Base64 });
    }
  }

  return TEMPLATE_EXCEL_BASE64;
}

async function construireExport(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const champs = await db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]);
  const controles = await db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]);
  const reseaux = await listerReseaux(visiteId);
  const materiel = await listerMateriel(visiteId);
  const remarques = await listerRemarques(visiteId);
  const note = await getNote(visiteId);
  const updates = [];

  ajouterMiseAJour(updates, 'TRAME ICPE', 'B1', visite.nom_client);
  ajouterMiseAJour(updates, 'TRAME ICPE', 'B2', visite.nom_site);
  ajouterMiseAJour(updates, 'TRAME ICPE', 'B3', visite.site_adresse);
  ajouterMiseAJour(updates, 'TRAME ICPE', 'B4', 'ICPE');
  ajouterMiseAJour(updates, 'TRAME ICPE', 'B5', visite.date_visite);

  Object.entries(TRAME_DATA).forEach(([panelId, sections]) => {
    Object.entries(sections).forEach(([sub, fields]) => {
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fields.forEach((field) => {
        const ligne = EXCEL_ROWS[`${sub}||${field.cle}`];
        if (!ligne) return;
        if (field.type === 'champ') {
          const row = champs.find((item) => item.section_code === sectionCode && item.cle === field.cle);
          if (row) ajouterMiseAJour(updates, 'TRAME ICPE', `B${ligne}`, row.valeur);
          return;
        }
        const row = controles.find((item) => item.section_code === sectionCode && item.cle === field.cle);
        if (row) {
          ajouterMiseAJour(updates, 'TRAME ICPE', `B${ligne}`, row.avis);
          ajouterMiseAJour(updates, 'TRAME ICPE', `C${ligne}`, row.commentaire);
        }
      });
    });
  });

  reseaux.forEach((reseau, index) => {
    if (index >= RESEAU_BLOCS_DEBUT.length) return;
    const debut = RESEAU_BLOCS_DEBUT[index];
    Object.entries(RESEAU_OFFSETS).forEach(([champ, offset]) => {
      ajouterMiseAJour(updates, 'TRAME ICPE', `B${debut + offset}`, reseau[champ]);
    });
  });

  const materielCols = ['categorie', 'nombre', 'designation', 'numero_materiel', 'reseau_desservi', 'marque', 'modele', 'caracteristiques', 'annee', 'etat'];
  materiel.forEach((item, index) => {
    const ligne = 4 + index;
    materielCols.forEach((col, colIndex) => {
      ajouterMiseAJour(updates, 'MATERIEL', `${String.fromCharCode(65 + colIndex)}${ligne}`, item[col]);
    });
  });

  remarques.forEach((item, index) => {
    const ligne = 4 + index;
    ajouterMiseAJour(updates, 'REMARQUES', `A${ligne}`, item.poste);
    ajouterMiseAJour(updates, 'REMARQUES', `B${ligne}`, item.prestation);
    ajouterMiseAJour(updates, 'REMARQUES', `D${ligne}`, item.delai);
    ajouterMiseAJour(updates, 'REMARQUES', `F${ligne}`, item.estimatif);
  });

  ajouterMiseAJour(updates, 'NOTE', 'A2', note);

  const sourceBase64 = await chargerSourceOriginale(db, visiteId);
  const base64 = await patchWorkbookBase64(sourceBase64, updates);
  return { base64, visite };
}

async function construireClasseur(visiteId) {
  return construireExport(visiteId);
}

async function exporterEtPartager(visiteId) {
  const { base64, visite } = await construireExport(visiteId);
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
