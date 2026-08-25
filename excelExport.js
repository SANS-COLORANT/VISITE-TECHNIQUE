/** Export Excel natif : repart du classeur source et ne modifie que les cellules métier changées. */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { getDb, getVisite, listerReseaux, listerCompteurs, getNote } from './db.js';
import { patcherClasseurXlsx, nettoyerClasseurTemp } from './excelOoxml.js';

const { formatMeterValue } = require('./excelValueCore.js');
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function normaliserTexte(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function slugFichier(valeur) {
  return String(valeur || 'site').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site';
}

function nomLocalDepuisChamps(champs = []) {
  const lire = (cle) => String(champs.find((row) => row.cle === cle)?.valeur || '').trim();
  return lire('Nom du local') || lire('Type de LT') || '';
}

function indexerParCle(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(`${row.section_code}||${row.cle}`, row);
  return map;
}

function celluleSource(sheet, ref) {
  return sheet?.[ref] || null;
}

function valeurSource(sheet, ref) {
  const cell = celluleSource(sheet, ref);
  if (!cell || cell.v === null || cell.v === undefined) return '';
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return cell.v;
}

function typePourEcriture(sheet, ref, valeur, cle = '') {
  const source = celluleSource(sheet, ref);
  if (source && typeof source.v === 'number') return 'number';
  if (source && typeof source.v === 'boolean') return 'boolean';
  if (/^(nombre|nb|annee|année|delai|délai|estimatif)$/i.test(String(cle || '')) && String(valeur ?? '').trim() !== '' && Number.isFinite(Number(String(valeur).replace(',', '.')))) return 'number';
  return 'text';
}

function equivalents(source, courant, type) {
  const a = source === null || source === undefined ? '' : source;
  const b = courant === null || courant === undefined ? '' : courant;
  if (type === 'number') {
    const na = Number(String(a).replace(',', '.'));
    const nb = Number(String(b).replace(',', '.'));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return normaliserTexte(a) === normaliserTexte(b);
}

function ajouterPatchSiChange(patches, sheetName, sheet, address, value, cle = '', options = {}) {
  if (!address) return false;
  const valueType = options.valueType || typePourEcriture(sheet, address, value, cle);
  const original = valeurSource(sheet, address);
  if (equivalents(original, value, valueType)) return false;

  // Une cellule numérique du classeur source ne doit jamais devenir du texte à cause
  // d'une donnée SQLite incohérente (ex. C183 = 2 remplacé autrefois par une réserve).
  if (valueType === 'number' && String(value ?? '').trim() !== '') {
    const nombre = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(nombre)) {
      console.warn(`Export Excel: ${sheetName}!${address} conservée (${original}) car la valeur applicative n'est pas numérique: ${value}`);
      return false;
    }
  }

  patches.push({ sheetName, address, value: value ?? '', valueType, allowFormulaOverwrite: false });
  return true;
}

function parseDetails(json) {
  try { return JSON.parse(json || '{}') || {}; }
  catch { return {}; }
}

async function provenanceExcel(db, visiteId) {
  const row = await db.getFirstAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='import_excel' ORDER BY cree_le DESC LIMIT 1`, [visiteId]);
  return parseDetails(row?.details_json);
}

async function chargerSourceExcel(db, visiteId, cfg) {
  const details = await provenanceExcel(db, visiteId);
  const uri = details.sourceUri || null;
  if (uri) {
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (info?.exists) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return { sourceUri: uri, sourceBase64: base64, details, sourcePreservee: true };
    }
  }
  if (!cfg?.templateBase64) throw new Error('Aucune trame Excel source disponible pour cette visite.');
  return { sourceUri: null, sourceBase64: cfg.templateBase64, details, sourcePreservee: false };
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

function prochaineLigneLibre(sheet, tableConfig, reservees = new Set()) {
  const colonnes = tableConfig.columns || tableConfig.exportColumns || [];
  for (let row = Number(tableConfig.startRow || 1); row <= Number(tableConfig.maxImportRow || 500); row++) {
    if (reservees.has(row)) continue;
    const occupee = colonnes.some(([col]) => String(valeurSource(sheet, `${col}${row}`) ?? '').trim() !== '');
    if (!occupee) return row;
  }
  throw new Error(`Aucune ligne libre disponible dans l'onglet ${tableConfig.sheet}.`);
}

function patchesTable({ patches, wb, tableConfig, rows, bindings }) {
  if (!tableConfig) return;
  const sheet = wb.Sheets[tableConfig.sheet];
  if (!sheet) return;
  const bindingMap = new Map((bindings || []).map((b) => [b.id, Number(b.row)]));
  const reservees = new Set([...bindingMap.values()].filter(Boolean));

  for (const row of rows || []) {
    let excelRow = bindingMap.get(row.id) || null;
    if (!excelRow) {
      excelRow = prochaineLigneLibre(sheet, tableConfig, reservees);
      reservees.add(excelRow);
    }
    for (const [col, cle] of tableConfig.exportColumns || tableConfig.columns || []) {
      const valeur = row[cle];
      // Une absence en SQLite ne doit jamais vider une cellule historique du fichier source.
      if (valeur === undefined) continue;
      ajouterPatchSiChange(patches, tableConfig.sheet, sheet, `${col}${excelRow}`, valeur ?? '', cle);
    }
  }
}

async function construireExport(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');
  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const cfg = trame.excel;
  const source = await chargerSourceExcel(db, visiteId, cfg);
  const wbSource = XLSX.read(source.sourceBase64, { type: 'base64', cellDates: true, cellNF: true, cellStyles: true, bookVBA: true });
  const principale = wbSource.Sheets[cfg.mainSheet];
  if (!principale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du fichier source.`);

  const [champs, controles, reseaux, compteurs, materiel, remarques, note] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id=?`, [visiteId]),
    listerReseaux(visiteId),
    listerCompteurs(visiteId),
    db.getAllAsync(`SELECT * FROM materiel WHERE visite_id=? ORDER BY cree_le,id`, [visiteId]),
    db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le,id`, [visiteId]),
    getNote(visiteId),
  ]);

  const champsMap = indexerParCle(champs);
  const controlesMap = indexerParCle(controles);
  const patches = [];
  const main = cfg.mainSheet;

  // Métadonnées de la vraie trame ICPE : B1/B2/B3 et aucune date forcée en B5.
  ajouterPatchSiChange(patches, main, principale, 'B1', visite.nom_client || '', 'client');
  ajouterPatchSiChange(patches, main, principale, 'B2', visite.nom_site || '', 'site');
  const localCible = nomLocalDepuisChamps(champs) || String(valeurSource(principale, 'B3') || '');
  ajouterPatchSiChange(patches, main, principale, 'B3', localCible, 'local');
  if (String(valeurSource(principale, 'B5') ?? '').trim() !== '') ajouterPatchSiChange(patches, main, principale, 'B5', '', 'date');

  const compteurBindings = new Map((source.details?.excelBindings?.compteurs || []).map((b) => [b.id, b.cell]));
  const cellulesCompteurs = new Set(compteurs.map((c) => compteurBindings.get(c.id) || celluleCompteurDepuisLabel(c)).filter(Boolean));

  for (const mapping of cfg.fieldMappings || []) {
    const key = `${mapping.sectionCode}||${mapping.cle}`;
    if (cellulesCompteurs.has(mapping.valueCell) && /^Index/i.test(mapping.cle)) continue;
    if (mapping.type === 'champ') {
      const champ = champsMap.get(key);
      if (champ) ajouterPatchSiChange(patches, main, principale, mapping.valueCell, champ.valeur ?? '', mapping.cle);
    } else {
      const controle = controlesMap.get(key);
      if (!controle) continue;
      ajouterPatchSiChange(patches, main, principale, mapping.valueCell, controle.avis ?? '', `${mapping.cle}:avis`);
      if (mapping.commentCell) ajouterPatchSiChange(patches, main, principale, mapping.commentCell, controle.commentaire ?? '', `${mapping.cle}:commentaire`);
    }
  }

  const reseauxCfg = cfg.networks;
  if (reseauxCfg) {
    const sheetNom = reseauxCfg.mainSheet || main;
    const sheet = wbSource.Sheets[sheetNom] || principale;
    const col = reseauxCfg.exportColumn || 'C';
    reseaux.slice(0, (reseauxCfg.starts || []).length).forEach((reseau, index) => {
      const debut = reseauxCfg.starts[index];
      Object.entries(reseauxCfg.exportOffsets || {}).forEach(([cle, offset]) => ajouterPatchSiChange(patches, sheetNom, sheet, `${col}${debut + offset}`, reseau[cle] ?? '', cle));
    });
  }

  for (const compteur of compteurs) {
    const cell = compteurBindings.get(compteur.id) || celluleCompteurDepuisLabel(compteur);
    if (!cell) continue;
    const original = valeurSource(principale, cell);
    ajouterPatchSiChange(patches, main, principale, cell, formatMeterValue(compteur, original), 'compteur', { valueType: 'text' });
  }

  const tables = cfg.tables || {};
  patchesTable({ patches, wb: wbSource, tableConfig: tables.materiel, rows: materiel, bindings: source.details?.excelBindings?.materiel });
  patchesTable({ patches, wb: wbSource, tableConfig: tables.remarques, rows: remarques, bindings: source.details?.excelBindings?.remarques });
  if (tables.note && note) ajouterPatchSiChange(patches, tables.note.sheet, wbSource.Sheets[tables.note.sheet], tables.note.cell, note.contenu ?? '', 'note');

  const resultat = await patcherClasseurXlsx({ sourceUri: source.sourceUri, sourceBase64: source.sourceUri ? null : source.sourceBase64, patches });
  return {
    resultat,
    visite,
    trame,
    patches,
    sourcePreservee: source.sourcePreservee,
    stats: { champs: champs.length, controles: controles.length, reseaux: reseaux.length, compteurs: compteurs.length, materiel: materiel.length, remarques: remarques.length, cellulesModifiees: patches.length },
  };
}

async function preparerExport(visiteId) {
  const construit = await construireExport(visiteId);
  const nomFichier = `Visite_${slugFichier(construit.trame.nom)}_${slugFichier(construit.visite.nom_site)}_${construit.visite.date_visite || 'sans_date'}.xlsx`;
  return { ...construit, base64: construit.resultat.base64, nomFichier };
}

async function enregistrerExcelSurAppareil(visiteId) {
  const exporte = await preparerExport(visiteId);
  const SAF = FileSystem.StorageAccessFramework;
  try {
    if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) throw new Error('Le sélecteur de dossier Android n’est pas disponible sur cet appareil.');
    const permission = await SAF.requestDirectoryPermissionsAsync();
    if (!permission?.granted || !permission?.directoryUri) return { annule: true, nomFichier: exporte.nomFichier, trameId: exporte.trame.id, trameNom: exporte.trame.nom, stats: exporte.stats };
    const uri = await SAF.createFileAsync(permission.directoryUri, exporte.nomFichier, XLSX_MIME);
    await FileSystem.writeAsStringAsync(uri, exporte.base64, { encoding: FileSystem.EncodingType.Base64 });
    return { annule: false, enregistre: true, uri, nomFichier: exporte.nomFichier, trameId: exporte.trame.id, trameNom: exporte.trame.nom, stats: exporte.stats, sourcePreservee: exporte.sourcePreservee };
  } finally {
    await nettoyerClasseurTemp(exporte.resultat);
  }
}

async function partagerExcel(visiteId) {
  const exporte = await preparerExport(visiteId);
  const dossier = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dossier) throw new Error('Stockage local Android indisponible');
  const chemin = dossier + exporte.nomFichier;
  try {
    await FileSystem.writeAsStringAsync(chemin, exporte.base64, { encoding: FileSystem.EncodingType.Base64 });
    if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
    await Sharing.shareAsync(chemin, { mimeType: XLSX_MIME, dialogTitle: `Partager la visite — ${exporte.trame.nom}`, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
    return { nomFichier: exporte.nomFichier, trameId: exporte.trame.id, trameNom: exporte.trame.nom, stats: exporte.stats, chemin, sourcePreservee: exporte.sourcePreservee };
  } finally {
    await nettoyerClasseurTemp(exporte.resultat);
  }
}

async function exporterEtPartager(visiteId) {
  try { return await enregistrerExcelSurAppareil(visiteId); }
  catch (e) {
    if (/sélecteur de dossier Android n’est pas disponible/i.test(String(e?.message || e))) return partagerExcel(visiteId);
    throw e;
  }
}

export { construireExport as construireClasseur, preparerExport, enregistrerExcelSurAppareil, partagerExcel, exporterEtPartager, formatMeterValue as texteCompteur, equivalents };
