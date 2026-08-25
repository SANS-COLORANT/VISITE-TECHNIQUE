/** Export Excel natif Android piloté par le registre générique de trames. */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, listerCompteurs, getNote } from './db.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function etendrePlage(sheet, ref) {
  if (!sheet || !ref) return;
  const cellule = XLSX.utils.decode_cell(ref);
  if (!sheet['!ref']) {
    sheet['!ref'] = XLSX.utils.encode_range({ s: cellule, e: cellule });
    return;
  }
  const plage = XLSX.utils.decode_range(sheet['!ref']);
  plage.s.r = Math.min(plage.s.r, cellule.r);
  plage.s.c = Math.min(plage.s.c, cellule.c);
  plage.e.r = Math.max(plage.e.r, cellule.r);
  plage.e.c = Math.max(plage.e.c, cellule.c);
  sheet['!ref'] = XLSX.utils.encode_range(plage);
}

function setCell(sheet, ref, valeur) {
  if (!sheet || !ref || valeur === null || valeur === undefined || valeur === '') return;
  const existante = sheet[ref] || {};
  const numerique = typeof valeur === 'number' && Number.isFinite(valeur);
  sheet[ref] = { ...existante, v: valeur, t: numerique ? 'n' : 's' };
  delete sheet[ref].w;
  etendrePlage(sheet, ref);
}

function viderCellule(sheet, ref) {
  if (!sheet || !ref) return;
  const existante = sheet[ref] || {};
  sheet[ref] = { ...existante, v: '', t: 's' };
  delete sheet[ref].w;
  delete sheet[ref].f;
  etendrePlage(sheet, ref);
}

function nomLocalDepuisChamps(champs = []) {
  const lire = (cle) => String((champs.find((row) => row.cle === cle)?.valeur) || '').trim();
  return lire('Nom du local') || lire('Type de LT') || '';
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

function texteCompteur(compteur) {
  if (compteur?.valeur === null || compteur?.valeur === undefined || compteur?.valeur === '') return '';
  return `${compteur.label || 'Compteur'} : ${compteur.valeur}${compteur.unite ? ` ${compteur.unite}` : ''}`;
}

function ligneCompteur(compteur) {
  const txt = `${compteur?.label || ''} ${compteur?.unite || ''}`.toLowerCase();
  if (/gaz|fioul|cuve/.test(txt)) return 134;
  if (/énergie|energie|calorie|mwh|kwh|élect|elect/.test(txt)) return 135;
  if (/appoint/.test(txt) && /chauff/.test(txt)) return 136;
  if (/(eau froide|ef)/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 137;
  if (/manom|pression/.test(txt) && /chauff/.test(txt)) return 138;
  if (/manom|pression/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 139;
  if (/eau|volum/.test(txt)) return 137;
  return null;
}

function exporterCompteurs(sheet, compteurs = []) {
  const groupes = new Map();
  for (const compteur of compteurs) {
    const ligne = ligneCompteur(compteur);
    const texte = texteCompteur(compteur);
    if (!ligne || !texte) continue;
    if (!groupes.has(ligne)) groupes.set(ligne, []);
    groupes.get(ligne).push(texte);
  }
  for (const [ligne, valeurs] of groupes.entries()) setCell(sheet, `C${ligne}`, valeurs.join(' | '));
}

function normaliserMaterielPourExport(materiel = []) {
  return materiel.map((m) => ({
    ...m,
    nombre: m.nombre ?? m.nb ?? 1,
    numero_materiel: m.numero_materiel ?? m.numero ?? '',
    reseau_desservi: m.reseau_desservi ?? m.reseau ?? '',
    caracteristiques: m.caracteristiques ?? '',
    categorie: m.categorie || m.type_code || 'Équipement',
    designation: m.designation || m.categorie || 'Équipement',
  }));
}

async function construireClasseur(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');

  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`Aucun modèle Excel configuré pour la trame ${trame.nom}.`);

  const [champs, controles, reseaux, compteurs, materielBrut, remarques, note] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]),
    listerReseaux(visiteId),
    listerCompteurs(visiteId),
    listerMateriel(visiteId),
    listerRemarques(visiteId),
    getNote(visiteId),
  ]);

  const materiel = normaliserMaterielPourExport(materielBrut);
  const champsMap = indexerParCle(champs);
  const controlesMap = indexerParCle(controles);
  const wb = XLSX.read(cfg.templateBase64, { type: 'base64', cellStyles: true, cellNF: true, bookVBA: true });
  const sheetPrincipale = wb.Sheets[cfg.mainSheet];
  if (!sheetPrincipale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du modèle ${trame.nom}.`);

  const meta = cfg.metadata || {};
  const nomLocal = nomLocalDepuisChamps(champs);

  // En-tête terrain demandé : Client B1, Site B2, Local B3. Pas de date en B5.
  // On vide aussi les anciennes cellules d'export afin d'éviter les doublons.
  [meta.client, meta.site, meta.adresse, meta.dateVisite, 'C1', 'C2', 'C3', 'C5']
    .filter((ref, index, refs) => ref && !['B1', 'B2', 'B3'].includes(ref) && refs.indexOf(ref) === index)
    .forEach((ref) => viderCellule(sheetPrincipale, ref));
  viderCellule(sheetPrincipale, 'B5');
  setCell(sheetPrincipale, 'B1', visite.nom_client || '');
  setCell(sheetPrincipale, 'B2', visite.nom_site || '');
  setCell(sheetPrincipale, 'B3', nomLocal);
  setCell(sheetPrincipale, meta.type, trame.nom);

  for (const mapping of cfg.fieldMappings || []) {
    const lookup = `${mapping.sectionCode}||${mapping.cle}`;
    const champ = champsMap.get(lookup);
    const controle = controlesMap.get(lookup);

    if (mapping.type === 'champ') {
      if (champ) setCell(sheetPrincipale, mapping.valueCell, champ.valeur);
      continue;
    }

    if (controle) {
      setCell(sheetPrincipale, mapping.valueCell, controle.avis);
      setCell(sheetPrincipale, mapping.commentCell, controle.commentaire);
    }

    // Température / pH : l'interface Relevés les saisit comme mesures dans champs_visite
    // même si la trame historique les décrit comme contrôles.
    if (mapping.panelId === 'p-releves' && champ) {
      setCell(sheetPrincipale, mapping.commentCell || mapping.valueCell, champ.valeur);
    }
  }

  const reseauxCfg = cfg.networks;
  if (reseauxCfg) {
    const sheetReseaux = wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || sheetPrincipale;
    const colonne = reseauxCfg.exportColumn || 'C';
    reseaux.slice(0, (reseauxCfg.starts || []).length).forEach((r, i) => {
      const debut = reseauxCfg.starts[i];
      Object.entries(reseauxCfg.exportOffsets || {}).forEach(([champ, offset]) => setCell(sheetReseaux, `${colonne}${debut + offset}`, r[champ]));
    });
  }
  const reseauxSupplementaires = reseauxCfg ? ajouterReseauxComplementaires(wb, reseaux, reseauxCfg) : 0;

  exporterCompteurs(sheetPrincipale, compteurs);

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
      compteurs: compteurs.length,
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

  return { annule: false, enregistre: true, uri, nomFichier, trameId: trame.id, trameNom: trame.nom, stats };
}

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

async function exporterEtPartager(visiteId) {
  try {
    return await enregistrerExcelSurAppareil(visiteId);
  } catch (e) {
    if (/sélecteur de dossier Android n’est pas disponible/i.test(String(e?.message || e))) return partagerExcel(visiteId);
    throw e;
  }
}

export { construireClasseur, preparerExport, enregistrerExcelSurAppareil, partagerExcel, exporterEtPartager };