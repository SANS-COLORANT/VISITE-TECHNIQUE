/** Export Excel natif Android piloté par le registre générique de trames. */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, getNote } from './db.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function setCell(sheet, ref, valeur) {
  if (!sheet || !ref || valeur === null || valeur === undefined || valeur === '') return;
  const existante = sheet[ref] || {};
  sheet[ref] = { ...existante, v: valeur, t: typeof valeur === 'number' ? 'n' : 's' };
  delete sheet[ref].w;
}

function slugFichier(valeur) {
  return String(valeur || 'site').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site';
}

function indexerParCle(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(`${row.section_code}||${row.cle}`, row);
  return map;
}

function ajouterReseauxComplementaires(wb, reseaux, config) {
  const starts = config?.starts || [];
  const overflow = config?.overflow;
  if (!overflow || reseaux.length <= starts.length) return 0;

  const supplementaires = reseaux.slice(starts.length);
  const colonnes = overflow.columns || [];
  const aoa = [
    [`Réseaux complémentaires — non prévus dans les ${starts.length} blocs de la trame`],
    colonnes.map((c) => c.label || c.exportKey),
    ...supplementaires.map((reseau) => colonnes.map((c) => reseau[c.exportKey] ?? '')),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = colonnes.map((c) => ({ wch: Math.max(16, Math.min(45, String(c.label || '').length + 6)) }));
  if (wb.Sheets[overflow.sheet]) wb.Sheets[overflow.sheet] = sheet;
  else XLSX.utils.book_append_sheet(wb, sheet, overflow.sheet);
  return supplementaires.length;
}

function remplirTable(sheet, rows, tableConfig) {
  if (!sheet || !tableConfig) return;
  const startRow = Number(tableConfig.startRow || 1);
  const colonnes = tableConfig.exportColumns || tableConfig.columns || [];
  rows.forEach((row, index) => {
    colonnes.forEach((definition, ci) => {
      const [col, cle] = Array.isArray(definition) ? definition : [String.fromCharCode(65 + ci), definition];
      setCell(sheet, `${col}${startRow + index}`, row[cle]);
    });
  });
}

async function construireClasseur(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`Aucun modèle Excel configuré pour la trame ${trame.nom}.`);

  const [champs, controles, reseaux, materiel, remarques, note] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]),
    listerReseaux(visiteId), listerMateriel(visiteId), listerRemarques(visiteId), getNote(visiteId),
  ]);

  const champsMap = indexerParCle(champs);
  const controlesMap = indexerParCle(controles);
  const wb = XLSX.read(cfg.templateBase64, { type: 'base64', cellStyles: true, cellNF: true, bookVBA: true });
  const sheetPrincipale = wb.Sheets[cfg.mainSheet];
  if (!sheetPrincipale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du modèle ${trame.nom}.`);

  const meta = cfg.metadata || {};
  setCell(sheetPrincipale, meta.client, visite.nom_client);
  setCell(sheetPrincipale, meta.site, visite.nom_site);
  setCell(sheetPrincipale, meta.adresse, visite.adresse || '');
  setCell(sheetPrincipale, meta.type, trame.nom);
  setCell(sheetPrincipale, meta.dateVisite, visite.date_visite);

  for (const mapping of cfg.fieldMappings || []) {
    const lookup = `${mapping.sectionCode}||${mapping.cle}`;
    if (mapping.type === 'champ') {
      const row = champsMap.get(lookup);
      if (row) setCell(sheetPrincipale, mapping.valueCell, row.valeur);
    } else if (mapping.type === 'controle') {
      const row = controlesMap.get(lookup);
      if (row) {
        setCell(sheetPrincipale, mapping.valueCell, row.avis);
        setCell(sheetPrincipale, mapping.commentCell, row.commentaire);
      }
    }
  }

  const reseauxCfg = cfg.networks;
  if (reseauxCfg) {
    const sheetReseaux = wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || sheetPrincipale;
    reseaux.slice(0, (reseauxCfg.starts || []).length).forEach((r, i) => {
      const debut = reseauxCfg.starts[i];
      Object.entries(reseauxCfg.exportOffsets || {}).forEach(([champ, offset]) => setCell(sheetReseaux, `B${debut + offset}`, r[champ]));
    });
  }
  const reseauxSupplementaires = reseauxCfg ? ajouterReseauxComplementaires(wb, reseaux, reseauxCfg) : 0;

  const tables = cfg.tables || {};
  if (tables.materiel) remplirTable(wb.Sheets[tables.materiel.sheet], materiel, tables.materiel);
  if (tables.remarques) remplirTable(wb.Sheets[tables.remarques.sheet], remarques, tables.remarques);

  const noteCfg = tables.note;
  if (noteCfg) setCell(wb.Sheets[noteCfg.sheet], noteCfg.cell, note?.contenu || '');

  return {
    wb,
    visite,
    trame,
    stats: {
      champs: champs.length,
      controles: controles.length,
      reseaux: reseaux.length,
      reseauxSupplementaires,
      materiel: materiel.length,
      remarques: remarques.length,
    },
  };
}

async function preparerExport(visiteId) {
  const { wb, visite, trame, stats } = await construireClasseur(visiteId);
  let base64;
  try {
    base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
  } catch (e) {
    throw new Error(`Impossible de générer le classeur Excel : ${e?.message || e}`);
  }
  if (!base64 || base64.length < 100) throw new Error('Le fichier Excel généré est vide ou invalide.');

  const nomFichier = `Visite_${slugFichier(trame.nom)}_${slugFichier(visite.nom_site)}_${visite.date_visite || 'sans_date'}.xlsx`;
  return { base64, nomFichier, trame, stats };
}

/**
 * Enregistre réellement le fichier dans un dossier choisi par l'utilisateur.
 * Sur Android, StorageAccessFramework permet notamment de choisir Téléchargements,
 * Documents, une carte SD ou une clé USB sans demander de permission globale.
 */
async function enregistrerExcelSurAppareil(visiteId) {
  const { base64, nomFichier, trame, stats } = await preparerExport(visiteId);
  const SAF = FileSystem.StorageAccessFramework;

  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) {
    throw new Error('Le sélecteur de dossier Android n’est pas disponible sur cet appareil.');
  }

  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission?.granted || !permission?.directoryUri) {
    return { annule: true, nomFichier, trameId: trame.id, trameNom: trame.nom, stats };
  }

  let uri;
  try {
    uri = await SAF.createFileAsync(permission.directoryUri, nomFichier, XLSX_MIME);
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    throw new Error(`Impossible d’enregistrer l’Excel dans le dossier choisi : ${e?.message || e}`);
  }

  return {
    annule: false,
    enregistre: true,
    uri,
    nomFichier,
    trameId: trame.id,
    trameNom: trame.nom,
    stats,
  };
}

/** Partage explicite via la feuille Android, sans supprimer le fichier avant la fin du partage. */
async function partagerExcel(visiteId) {
  const { base64, nomFichier, trame, stats } = await preparerExport(visiteId);
  const dossier = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dossier) throw new Error('Stockage local Android indisponible');
  const chemin = dossier + nomFichier;

  await FileSystem.writeAsStringAsync(chemin, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');

  await Sharing.shareAsync(chemin, {
    mimeType: XLSX_MIME,
    dialogTitle: `Partager la visite — ${trame.nom}`,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });

  return { nomFichier, trameId: trame.id, trameNom: trame.nom, stats, chemin };
}

/**
 * Compatibilité avec l'écran actuel : le bouton Exporter privilégie désormais
 * un vrai enregistrement sur la tablette. Si le SAF n'est pas disponible,
 * on retombe sur le partage Android.
 */
async function exporterEtPartager(visiteId) {
  try {
    return await enregistrerExcelSurAppareil(visiteId);
  } catch (e) {
    if (/sélecteur de dossier Android n’est pas disponible/i.test(String(e?.message || e))) {
      return partagerExcel(visiteId);
    }
    throw e;
  }
}

export { construireClasseur, preparerExport, enregistrerExcelSurAppareil, partagerExcel, exporterEtPartager };
