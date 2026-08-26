/**
 * Export Excel : reprend la mécanique simple de l'ancienne version qui fonctionnait.
 * On repart de la trame officielle embarquée puis on y réinjecte l'état courant
 * de la visite. L'export ne dépend donc plus de la présence du fichier importé.
 */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { getDb, getVisite, listerReseaux, listerCompteurs, getNote } from './db.js';
const { formatMeterValue } = require('./excelValueCore.js');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function normaliserTexte(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function equivalents(a, b) {
  return normaliserTexte(a) === normaliserTexte(b);
}

function slugFichier(valeur) {
  return String(valeur || 'site')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'site';
}

function indexerParCle(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(`${row.section_code}||${row.cle}`, row);
  return map;
}

function nomLocalDepuisChamps(champs = []) {
  const lire = (cle) => String(champs.find((row) => row.cle === cle)?.valeur || '').trim();
  return lire('Nom du local') || lire('Type de LT') || '';
}

function celluleExistante(sheet, ref) {
  return sheet?.[ref] || {};
}

/**
 * SheetJS ne met pas automatiquement !ref à jour lorsqu'on affecte une cellule
 * directement. Sans ceci, une deuxième ligne écrite en A5/B5/... peut exister
 * en mémoire mais être absente du XLSX final si la feuille s'arrêtait à la ligne 4.
 */
function etendrePlage(sheet, ref) {
  if (!sheet || !ref) return;
  const cible = XLSX.utils.decode_cell(ref);
  let range;
  try {
    range = XLSX.utils.decode_range(sheet['!ref'] || ref);
  } catch {
    range = { s: { ...cible }, e: { ...cible } };
  }
  range.s.r = Math.min(range.s.r, cible.r);
  range.s.c = Math.min(range.s.c, cible.c);
  range.e.r = Math.max(range.e.r, cible.r);
  range.e.c = Math.max(range.e.c, cible.c);
  sheet['!ref'] = XLSX.utils.encode_range(range);
}

function styleDeReference(sheet, ref) {
  const src = ref ? sheet?.[ref] : null;
  if (!src) return {};
  const copie = {};
  if (src.s !== undefined) copie.s = typeof src.s === 'object' && src.s !== null ? { ...src.s } : src.s;
  if (src.z !== undefined) copie.z = src.z;
  return copie;
}

function recopierHauteurLigne(sheet, ligneSource, ligneCible) {
  if (!sheet || !ligneSource || !ligneCible || ligneSource === ligneCible) return;
  const rows = sheet['!rows'];
  if (!Array.isArray(rows)) return;
  const src = rows[ligneSource - 1];
  if (!src) return;
  if (!sheet['!rows']) sheet['!rows'] = [];
  if (!sheet['!rows'][ligneCible - 1]) sheet['!rows'][ligneCible - 1] = { ...src };
}

function forcerFormatGeneral(cell) {
  cell.z = 'General';
  if (cell.s && typeof cell.s === 'object') {
    cell.s = { ...cell.s, numFmt: 'General' };
  }
}

/**
 * Ecrit une valeur en conservant le style visuel de la cellule (ou d'une cellule
 * de référence) et impose le format Excel « Standard / General ».
 */
function setCellStandard(sheet, ref, valeur, styleRef = null) {
  if (!sheet || !ref) return;
  const baseStyle = styleDeReference(sheet, styleRef);
  const existante = celluleExistante(sheet, ref);
  const cell = { ...baseStyle, ...existante };
  const v = valeur === null || valeur === undefined ? '' : valeur;

  if (typeof v === 'number' && Number.isFinite(v)) {
    cell.v = v;
    cell.t = 'n';
  } else if (typeof v === 'boolean') {
    cell.v = v;
    cell.t = 'b';
  } else {
    cell.v = String(v);
    cell.t = 's';
  }

  forcerFormatGeneral(cell);
  delete cell.w;
  sheet[ref] = cell;
  etendrePlage(sheet, ref);
}

function parseIsoDate(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
  return null;
}

function dateFr(value) {
  const d = parseIsoDate(value);
  if (!d) return String(value || '');
  return `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
}

/** Date Excel réelle, sans dépendance au fuseau horaire Android. */
function setCellDate(sheet, ref, value, styleRef = null) {
  if (!sheet || !ref) return;
  const d = parseIsoDate(value);
  if (!d) {
    setCellStandard(sheet, ref, value || '', styleRef);
    return;
  }
  const baseStyle = styleDeReference(sheet, styleRef);
  const existante = celluleExistante(sheet, ref);
  const cell = { ...baseStyle, ...existante };
  const excelEpoch = Date.UTC(1899, 11, 30);
  const serial = (Date.UTC(d.y, d.m - 1, d.d) - excelEpoch) / 86400000;
  cell.v = serial;
  cell.t = 'n';
  cell.z = 'dd/mm/yyyy';
  if (cell.s && typeof cell.s === 'object') cell.s = { ...cell.s, numFmt: 'dd/mm/yyyy' };
  delete cell.w;
  sheet[ref] = cell;
  etendrePlage(sheet, ref);
}

function maxLigneUtilisee(sheet, fallback = 1) {
  try {
    if (!sheet?.['!ref']) return fallback;
    return XLSX.utils.decode_range(sheet['!ref']).e.r + 1;
  } catch {
    return fallback;
  }
}

function viderTable(sheet, tableConfig, colonnesSupplementaires = []) {
  if (!sheet || !tableConfig) return;
  const cols = [...new Set([
    ...(tableConfig.exportColumns || tableConfig.columns || []).map(([col]) => col),
    ...colonnesSupplementaires,
  ])];
  const start = Number(tableConfig.startRow || 1);
  const fin = Math.min(Number(tableConfig.maxImportRow || 500), Math.max(start, maxLigneUtilisee(sheet, start)));
  for (let row = start; row <= fin; row++) {
    for (const col of cols) setCellStandard(sheet, `${col}${row}`, '', `${col}${start}`);
  }
}

function celluleCompteurDepuisLabel(compteur) {
  const txt = `${compteur?.label || ''} ${compteur?.unite || ''}`.toLowerCase();
  if (/gaz|fioul|cuve/.test(txt)) return 'C134';
  if (/énergie|energie|calorie|mwh|kwh|élect|elect/.test(txt)) return 'C135';
  if (/appoint/.test(txt) && /chauff/.test(txt)) return 'C136';
  if (/(eau froide|ef)/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 'C137';
  if (/manom|pression/.test(txt) && /chauff/.test(txt)) return 'C138';
  if (/manom|pression/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 'C139';
  return null;
}

function renseignerTable(sheet, tableConfig, rows = []) {
  if (!sheet || !tableConfig) return;
  const cols = tableConfig.exportColumns || tableConfig.columns || [];
  const start = Number(tableConfig.startRow || 1);
  rows.forEach((row, index) => {
    const excelRow = start + index;
    recopierHauteurLigne(sheet, start, excelRow);
    cols.forEach(([col, cle]) => setCellStandard(sheet, `${col}${excelRow}`, row?.[cle] ?? '', `${col}${start}`));
  });
}

async function construireExport(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`La trame Excel « ${trame.nom} » n'est pas disponible dans l'application.`);

  const [champs, controles, reseaux, compteurs, materiel, remarques, note] = await Promise.all([
    db.getAllAsync('SELECT * FROM champs_visite WHERE visite_id=?', [visiteId]),
    db.getAllAsync('SELECT * FROM controles_visite WHERE visite_id=?', [visiteId]),
    listerReseaux(visiteId),
    listerCompteurs(visiteId),
    db.getAllAsync('SELECT * FROM materiel WHERE visite_id=? ORDER BY cree_le,id', [visiteId]),
    db.getAllAsync('SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le,id', [visiteId]),
    getNote(visiteId),
  ]);

  const wb = XLSX.read(cfg.templateBase64, {
    type: 'base64',
    cellStyles: true,
    cellNF: true,
    cellDates: true,
    bookVBA: true,
  });

  const principale = wb.Sheets[cfg.mainSheet];
  if (!principale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente de la trame.`);

  const champsMap = indexerParCle(champs);
  const controlesMap = indexerParCle(controles);

  // Métadonnées de visite.
  if (cfg.metadata?.client) setCellStandard(principale, cfg.metadata.client, visite.nom_client || '');
  if (cfg.metadata?.site) setCellStandard(principale, cfg.metadata.site, visite.nom_site || '');
  if (cfg.metadata?.local) setCellStandard(principale, cfg.metadata.local, nomLocalDepuisChamps(champs));
  if (cfg.metadata?.type) setCellStandard(principale, cfg.metadata.type, trame.nom || '');
  if (cfg.metadata?.dateVisite) setCellStandard(principale, cfg.metadata.dateVisite, dateFr(visite.date_visite));
  if (cfg.metadata?.adresse) setCellStandard(principale, cfg.metadata.adresse, visite.site_adresse || '');

  // Champs et contrôles : état courant complet de l'application.
  for (const mapping of cfg.fieldMappings || []) {
    const key = `${mapping.sectionCode}||${mapping.cle}`;
    if (mapping.type === 'champ') {
      const champ = champsMap.get(key);
      setCellStandard(principale, mapping.valueCell, champ?.valeur ?? '');
    } else {
      const controle = controlesMap.get(key);
      setCellStandard(principale, mapping.valueCell, controle?.avis ?? '');
      if (mapping.commentCell) setCellStandard(principale, mapping.commentCell, controle?.commentaire ?? '');
    }
  }

  // Réseaux : on vide d'abord les blocs de la trame afin qu'aucune ancienne valeur
  // du modèle ne reste lorsqu'un réseau n'existe pas dans la visite courante.
  const reseauxCfg = cfg.networks;
  if (reseauxCfg) {
    const sheet = wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || principale;
    const col = reseauxCfg.exportColumn || 'C';
    for (const debut of reseauxCfg.starts || []) {
      for (const offset of Object.values(reseauxCfg.exportOffsets || {})) setCellStandard(sheet, `${col}${debut + offset}`, '');
    }
    reseaux.slice(0, (reseauxCfg.starts || []).length).forEach((reseau, index) => {
      const debut = reseauxCfg.starts[index];
      for (const [cle, offset] of Object.entries(reseauxCfg.exportOffsets || {})) {
        setCellStandard(sheet, `${col}${debut + offset}`, reseau?.[cle] ?? '');
      }
    });
  }

  // Les compteurs spécialisés sont stockés dans leur table dédiée ; ils doivent donc
  // écraser la valeur générique issue des champs lorsque l'utilisateur les modifie.
  for (const compteur of compteurs || []) {
    const ref = celluleCompteurDepuisLabel(compteur);
    if (!ref) continue;
    const original = principale?.[ref]?.v ?? '';
    setCellStandard(principale, ref, formatMeterValue(compteur, original));
  }

  const tables = cfg.tables || {};

  // MATERIEL : réécriture complète des lignes de la visite.
  if (tables.materiel) {
    const sheet = wb.Sheets[tables.materiel.sheet];
    viderTable(sheet, tables.materiel);
    renseignerTable(sheet, tables.materiel, materiel);
  }

  // REMARQUES : réécriture complète + date de visite en colonne C sur chaque ligne.
  if (tables.remarques) {
    const sheet = wb.Sheets[tables.remarques.sheet];
    const start = Number(tables.remarques.startRow || 4);
    viderTable(sheet, tables.remarques, ['C', 'E']);
    remarques.forEach((r, index) => {
      const excelRow = start + index;
      recopierHauteurLigne(sheet, start, excelRow);
      for (const [col, cle] of tables.remarques.exportColumns || tables.remarques.columns || []) {
        setCellStandard(sheet, `${col}${excelRow}`, r?.[cle] ?? '', `${col}${start}`);
      }
      setCellDate(sheet, `C${excelRow}`, visite.date_visite, `C${start}`);
    });
  }

  if (tables.note) {
    const sheet = wb.Sheets[tables.note.sheet];
    setCellStandard(sheet, tables.note.cell, note?.contenu ?? note ?? '');
  }

  const base64 = XLSX.write(wb, {
    type: 'base64',
    bookType: 'xlsx',
    cellStyles: true,
    compression: true,
  });

  return {
    wb,
    base64,
    visite,
    trame,
    sourcePreservee: false,
    stats: {
      champs: champs.length,
      controles: controles.length,
      reseaux: reseaux.length,
      compteurs: compteurs.length,
      materiel: materiel.length,
      remarques: remarques.length,
    },
  };
}

async function preparerExport(visiteId) {
  const construit = await construireExport(visiteId);
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(String(construit.visite.date_visite || ''))
    ? construit.visite.date_visite
    : 'sans_date';
  const nomFichier = `Visite_${slugFichier(construit.trame.nom)}_${slugFichier(construit.visite.nom_site)}_${dateValide}.xlsx`;
  return { ...construit, nomFichier };
}

async function enregistrerExcelSurAppareil(visiteId) {
  const exporte = await preparerExport(visiteId);
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) {
    throw new Error('Le sélecteur de dossier Android n’est pas disponible sur cet appareil.');
  }
  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission?.granted || !permission?.directoryUri) {
    return { annule: true, nomFichier: exporte.nomFichier, trameId: exporte.trame.id, trameNom: exporte.trame.nom, stats: exporte.stats };
  }
  const uri = await SAF.createFileAsync(permission.directoryUri, exporte.nomFichier, XLSX_MIME);
  await FileSystem.writeAsStringAsync(uri, exporte.base64, { encoding: FileSystem.EncodingType.Base64 });
  return {
    annule: false,
    enregistre: true,
    uri,
    nomFichier: exporte.nomFichier,
    trameId: exporte.trame.id,
    trameNom: exporte.trame.nom,
    stats: exporte.stats,
    sourcePreservee: false,
  };
}

async function partagerExcel(visiteId) {
  const exporte = await preparerExport(visiteId);
  const dossier = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dossier) throw new Error('Stockage local Android indisponible');
  const chemin = dossier + exporte.nomFichier;
  await FileSystem.writeAsStringAsync(chemin, exporte.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(chemin, {
    mimeType: XLSX_MIME,
    dialogTitle: `Partager la visite — ${exporte.trame.nom}`,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
  return {
    nomFichier: exporte.nomFichier,
    trameId: exporte.trame.id,
    trameNom: exporte.trame.nom,
    stats: exporte.stats,
    chemin,
    sourcePreservee: false,
  };
}

async function exporterEtPartager(visiteId) {
  try {
    return await enregistrerExcelSurAppareil(visiteId);
  } catch (e) {
    if (/sélecteur de dossier Android n’est pas disponible/i.test(String(e?.message || e))) return partagerExcel(visiteId);
    throw e;
  }
}

export {
  construireExport as construireClasseur,
  preparerExport,
  enregistrerExcelSurAppareil,
  partagerExcel,
  exporterEtPartager,
  formatMeterValue as texteCompteur,
  equivalents,
};
