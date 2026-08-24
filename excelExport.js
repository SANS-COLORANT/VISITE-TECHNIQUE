/** Export Excel natif Android — conserve le modèle original et ouvre le partage système. */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { TEMPLATE_EXCEL_BASE64 } from './templateExcel.js';
import { EXCEL_ROWS, TRAME_DATA } from './data.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';

const RESEAU_BLOCS_DEBUT = [66, 76, 86, 96, 106, 116];
const RESEAU_OFFSETS = { t_ext_c: 0, t_dep_c: 1, nom_reseau: 2, courbe_de_chauffe: 3, tnc: 4, consigne_programme_horaire: 5 };

function setCell(sheet, ref, valeur) {
  if (!sheet || valeur === null || valeur === undefined || valeur === '') return;
  const existante = sheet[ref] || {};
  sheet[ref] = { ...existante, v: valeur, t: typeof valeur === 'number' ? 'n' : 's' };
  delete sheet[ref].w;
}

function slugFichier(valeur) {
  return String(valeur || 'site').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site';
}

async function construireClasseur(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const [champs, controles, reseaux, materiel, remarques, note] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]),
    listerReseaux(visiteId), listerMateriel(visiteId), listerRemarques(visiteId), getNote(visiteId),
  ]);

  const wb = XLSX.read(TEMPLATE_EXCEL_BASE64, { type: 'base64', cellStyles: true, cellNF: true, bookVBA: true });
  const sheetTrame = wb.Sheets['TRAME ICPE'];
  const sheetMateriel = wb.Sheets['MATERIEL'];
  const sheetRemarques = wb.Sheets['REMARQUES'];
  const sheetNote = wb.Sheets['NOTE'];
  if (!sheetTrame) throw new Error('Feuille TRAME ICPE absente du modèle Excel');

  setCell(sheetTrame, 'B1', visite.nom_client);
  setCell(sheetTrame, 'B2', visite.nom_site);
  setCell(sheetTrame, 'B3', visite.adresse || '');
  setCell(sheetTrame, 'B4', 'ICPE');
  setCell(sheetTrame, 'B5', visite.date_visite);

  for (const [panelId, sections] of Object.entries(TRAME_DATA || {})) {
    for (const [sub, fields] of Object.entries(sections || {})) {
      const sectionCode = panelId.replace('p-', '') + '.' + sub.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      for (const f of fields || []) {
        const ligne = EXCEL_ROWS[`${sub}||${f.cle}`];
        if (!ligne) continue;
        if (f.type === 'champ') {
          const row = champs.find((c) => c.section_code === sectionCode && c.cle === f.cle);
          if (row) setCell(sheetTrame, `B${ligne}`, row.valeur);
        } else if (f.type === 'controle') {
          const row = controles.find((c) => c.section_code === sectionCode && c.cle === f.cle);
          if (row) { setCell(sheetTrame, `B${ligne}`, row.avis); setCell(sheetTrame, `C${ligne}`, row.commentaire); }
        }
      }
    }
  }

  reseaux.forEach((r, i) => {
    if (i >= RESEAU_BLOCS_DEBUT.length) return;
    const debut = RESEAU_BLOCS_DEBUT[i];
    Object.entries(RESEAU_OFFSETS).forEach(([champ, offset]) => setCell(sheetTrame, `B${debut + offset}`, r[champ]));
  });

  if (sheetMateriel) {
    const materielCols = ['categorie', 'nombre', 'designation', 'numero_materiel', 'reseau_desservi', 'marque', 'modele', 'caracteristiques', 'annee', 'etat'];
    materiel.forEach((m, i) => { const ligne = 4 + i; materielCols.forEach((col, ci) => setCell(sheetMateriel, `${String.fromCharCode(65 + ci)}${ligne}`, m[col])); });
  }

  if (sheetRemarques) {
    remarques.forEach((r, i) => {
      const ligne = 4 + i;
      setCell(sheetRemarques, `A${ligne}`, r.poste);
      setCell(sheetRemarques, `B${ligne}`, r.prestation);
      setCell(sheetRemarques, `D${ligne}`, r.delai);
      setCell(sheetRemarques, `F${ligne}`, r.estimatif);
    });
  }

  if (sheetNote) setCell(sheetNote, 'A2', note?.contenu || '');
  return { wb, visite };
}

async function exporterEtPartager(visiteId) {
  const { wb, visite } = await construireClasseur(visiteId);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const nomFichier = `Visite_${slugFichier(visite.nom_site)}_${visite.date_visite || 'sans_date'}.xlsx`;
  const dossier = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dossier) throw new Error('Stockage local Android indisponible');
  const chemin = dossier + nomFichier;
  await FileSystem.writeAsStringAsync(chemin, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(chemin, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exporter la visite',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return chemin;
}

export { construireClasseur, exporterEtPartager };
