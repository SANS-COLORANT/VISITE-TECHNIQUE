/** Export Excel natif Android piloté par le registre générique de trames. */

import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { getDb, getVisite, listerReseaux, listerMateriel, listerRemarques, listerCompteurs, getNote } from './db.js';
import { libelleChamp, libelleSection, listerAliasesPreAllumage } from './preAllumageAliases.js';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { creerFichierSaf, dossierVisiteMetra } from './metraStorage.js';

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

function supprimerDoublonsAvisCommentaire(sheet) {
  if (!sheet?.['!ref']) return;
  const plage = XLSX.utils.decode_range(sheet['!ref']);
  for (let r = plage.s.r; r <= plage.e.r; r += 1) {
    const refD = XLSX.utils.encode_cell({ r, c: 3 });
    const refE = XLSX.utils.encode_cell({ r, c: 4 });
    const d = String(sheet[refD]?.v ?? '').trim().toLowerCase();
    const e = String(sheet[refE]?.v ?? '').trim().toLowerCase();
    if (d === 'avis') viderCellule(sheet, refD);
    if (e === 'commentaire') viderCellule(sheet, refE);
  }
}

function nomLocalDepuisChamps(champs = []) {
  const lire = (cle) => String((champs.find((row) => row.cle === cle)?.valeur) || '').trim();
  return lire('Nom du local') || lire('Type de LT') || '';
}

function slugFichier(valeur) {
  return String(valeur || 'site').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'site';
}

function formaterDateReserve(valeur) {
  if (!valeur) return '';
  const brut = String(valeur).trim();
  const match = brut.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(brut);
  if (Number.isNaN(date.getTime())) return brut;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
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
  const aoa = [[`Réseaux complémentaires — non prévus dans les ${starts.length} blocs de la trame`], colonnes.map((c) => c.label || c.exportKey), ...supplementaires.map((reseau) => colonnes.map((c) => reseau[c.exportKey] ?? ''))];
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

// Destination « supplementaire » : compteur ajouté sur le terrain sans ligne
// dédiée dans le modèle Excel. Il reste dans les rapports METRA mais n'est
// jamais écrit dans une ligne de la trame ni envoyé à l'Intranet.
const DESTINATION_COMPTEUR_SUPPLEMENTAIRE = 'supplementaire';

function normaliserTexteCompteur(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Règle historique, conservée pour les compteurs sans destination enregistrée
 * (visites antérieures à la migration 045 et jamais renommées).
 * Correction : « eau » doit être un mot entier ; « réseau » ne doit plus
 * envoyer un compteur sur la ligne EF ECS.
 */
function ligneCompteurParLibelle(compteur) {
  const txt = `${compteur?.label || ''} ${compteur?.unite || ''}`.toLowerCase();
  if (/gaz|fioul|cuve/.test(txt)) return 134;
  if (/énergie|energie|calorie|mwh|kwh|élect|elect/.test(txt)) return 135;
  if (/appoint/.test(txt) && /chauff/.test(txt)) return 136;
  if (/(eau froide|ef)/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 137;
  if (/manom|pression/.test(txt) && /chauff/.test(txt)) return 138;
  if (/manom|pression/.test(txt) && /(ecs|sanitaire)/.test(txt)) return 139;
  if (/(^|[^a-zà-ÿ])eau([^a-zà-ÿ]|$)|volum/.test(txt)) return 137;
  return null;
}

function mappingsReleveCompteurs(fieldMappings = []) {
  return (fieldMappings || []).filter((m) => m.panelId === 'p-releves' && m.type === 'champ'
    && /compteur|manom/i.test(`${m.section || ''} ${m.sectionCode || ''}`) && m.valueCell);
}

/** Ligne Excel d'un compteur : destination explicite d'abord, libellé ensuite. */
function ligneCompteur(compteur, fieldMappings = []) {
  const destination = String(compteur?.destination || '').trim();
  if (destination === DESTINATION_COMPTEUR_SUPPLEMENTAIRE) return null;
  if (destination) {
    const mapping = mappingsReleveCompteurs(fieldMappings).find((m) => m.cle === destination);
    const row = mapping && /^[A-Z]+(\d+)$/.exec(mapping.valueCell);
    if (row) return Number(row[1]);
  }
  return ligneCompteurParLibelle(compteur);
}

function texteCompteur(compteur) {
  if (compteur?.valeur === null || compteur?.valeur === undefined || compteur?.valeur === '') return '';
  return `${compteur.label || 'Compteur'} : ${compteur.valeur}${compteur.unite ? ` ${compteur.unite}` : ''}`;
}

function exporterCompteurs(sheet, compteurs = [], fieldMappings = []) {
  const groupes = new Map();
  for (const compteur of compteurs) {
    const ligne = ligneCompteur(compteur, fieldMappings);
    const texteLigne = texteCompteur(compteur);
    if (!ligne || !texteLigne) continue;
    if (!groupes.has(ligne)) groupes.set(ligne, []);
    groupes.get(ligne).push(texteLigne);
  }
  for (const [ligne, valeurs] of groupes.entries()) setCell(sheet, `C${ligne}`, valeurs.join(' | '));
}

function exporterCompteursReseauChaleur(sheet, compteurs = [], fieldMappings = []) {
  const norm = normaliserTexteCompteur;
  const clean = (v) => String(v || '').replace(/^Index\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const mappings = (fieldMappings || []).filter((m) => m.panelId === 'p-releves' && m.type === 'champ' && /^Index/i.test(m.cle || ''));
  for (const mapping of mappings) {
    const cible = norm(clean(mapping.cle));
    // Destination explicite prioritaire : un compteur renommé reste exporté.
    const compteur = compteurs.find((c) => c.destination === mapping.cle)
      || compteurs.find((c) => !c.destination && (norm(c.label) === cible || norm(clean(c.label)) === cible));
    if (!compteur || compteur.valeur == null || compteur.valeur === '') continue;
    const valeur = `${compteur.valeur}${compteur.unite ? ` ${compteur.unite}` : ''}`;
    setCell(sheet, mapping.valueCell, valeur);
    if (/^C\d+$/.test(mapping.valueCell || '')) setCell(sheet, `E${mapping.valueCell.slice(1)}`, valeur);
  }
}

function normaliserMaterielPourExport(materiel = []) {
  return materiel.map((m) => ({ ...m, nombre: m.nombre ?? m.nb ?? 1, numero_materiel: m.numero_materiel ?? m.numero ?? '', reseau_desservi: m.reseau_desservi ?? m.reseau ?? '', caracteristiques: m.caracteristiques ?? '', categorie: m.categorie || m.type_code || 'Équipement', designation: m.designation || m.categorie || 'Équipement' }));
}

function normaliserRemarquesPourExport(remarques = [], trameId = '') {
  return remarques.map((r) => ({
    ...r,
    poste: trameId === 'vmc' && String(r.reference_libelle || '').trim() ? String(r.reference_libelle).trim() : r.poste,
    date_reserve: formaterDateReserve(r.cree_le),
  }));
}

function categorieResumeReseau(poste) {
  const p = String(poste || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (p.includes('p2') || p.includes('entretien')) return 'P2';
  if (p.includes('p3') || p.includes('garantie totale')) return 'P3';
  if (p.includes('conform')) return 'Conformite';
  if (p.includes('amelior')) return 'Amelioration';
  return 'Remarque';
}

function ecrireResumeReseauChaleur(sheet, remarques = [], summaryRows = {}) {
  for (const perimetre of ['Primaire', 'Secondaire']) {
    const rows = summaryRows?.[perimetre] || {};
    const groupe = remarques.filter((r) => r.perimetre === perimetre);
    for (const [categorie, row] of Object.entries(rows)) {
      const textes = groupe
        .filter((r) => categorieResumeReseau(r.poste) === categorie)
        .map((r) => String(r.prestation || '').trim())
        .filter(Boolean);
      const avis = textes.length ? 'N.S' : 'S.O';
      const commentaire = textes.length ? textes.join('\n\n') : 'Sans Objet.';
      setCell(sheet, `B${row}`, avis);
      setCell(sheet, `C${row}`, commentaire);
      setCell(sheet, `D${row}`, avis);
      setCell(sheet, `E${row}`, commentaire);
    }
  }
}

function validerPerimetresReseauChaleur(materiel = [], remarques = []) {
  const valides = new Set(['Primaire', 'Secondaire']);
  const materielNonClasse = materiel.filter((m) => !valides.has(m.perimetre));
  const remarquesNonClassees = remarques.filter((r) => !valides.has(r.perimetre));
  if (materielNonClasse.length) {
    throw new Error(`${materielNonClasse.length} équipement(s) Réseau de chaleur doivent être classés Primaire ou Secondaire avant l’export.`);
  }
  if (remarquesNonClassees.length) {
    throw new Error(`${remarquesNonClassees.length} réserve(s) Réseau de chaleur doivent être classées Primaire ou Secondaire avant l’export.`);
  }
}

function ajouterFeuillePreAllumageModulaire(wb, modele, champsMap, controlesMap) {
  if (!modele) return;
  const lignes = [['Panneau', 'Local / rubrique', 'Champ / contrôle', 'Avis', 'Valeur / commentaire']];
  for (const rubrique of modele.rubriques || []) {
    for (const champ of rubrique.champs || []) {
      const key = `${rubrique.section_code}||${champ.cle_stockage}`;
      const saisie = champsMap.get(key);
      const controle = controlesMap.get(key);
      lignes.push([rubrique.panel_id, rubrique.nom, champ.libelle, champ.type_code === 'controle' ? (controle?.avis || '') : '', champ.type_code === 'controle' ? (controle?.commentaire || '') : (saisie?.valeur || '')]);
    }
  }
  const feuille = XLSX.utils.aoa_to_sheet(lignes);
  feuille['!cols'] = [{ wch: 24 }, { wch: 34 }, { wch: 58 }, { wch: 12 }, { wch: 72 }];
  const nom = 'PRE-ALLUMAGE MODULAIRE';
  if (wb.Sheets[nom]) wb.Sheets[nom] = feuille;
  else XLSX.utils.book_append_sheet(wb, feuille, nom);
}

async function construireClasseur(visiteId) {
  const db = await getDb();
  const visite = await getVisite(visiteId);
  if (!visite) throw new Error('Visite introuvable');
  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const cfg = trame.excel;
  if (!cfg?.templateBase64) throw new Error(`Aucun modèle Excel configuré pour la trame ${trame.nom}.`);

  const [champs, controles, reseaux, compteurs, materielBrut, remarquesBrutes, note, aliases, modelePreAllumage] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id = ?`, [visiteId]),
    listerReseaux(visiteId), listerCompteurs(visiteId), listerMateriel(visiteId), listerRemarques(visiteId), getNote(visiteId),
    trame.id === 'pre_allumage' ? listerAliasesPreAllumage(visiteId) : Promise.resolve({}),
    trame.id === 'pre_allumage' ? chargerPreAllumageModulaire(visiteId) : Promise.resolve(null),
  ]);

  const materiel = normaliserMaterielPourExport(materielBrut);
  const remarques = normaliserRemarquesPourExport(remarquesBrutes, trame.id);
  if (cfg.heatNetwork) validerPerimetresReseauChaleur(materiel, remarques);
  const champsMap = indexerParCle(champs);
  const controlesMap = indexerParCle(controles);
  const wb = XLSX.read(cfg.templateBase64, { type: 'base64', cellStyles: true, cellNF: true, bookVBA: true });
  const sheetPrincipale = wb.Sheets[cfg.mainSheet];
  if (!sheetPrincipale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du modèle ${trame.nom}.`);

  supprimerDoublonsAvisCommentaire(sheetPrincipale);

  const meta = cfg.metadata || {};
  const nomLocal = nomLocalDepuisChamps(champs);
  const dateGenerale = String(champs.find((row) => row.cle === 'Date de la visite')?.valeur || champs.find((row) => row.cle === 'Date de visite')?.valeur || visite.date_visite || '').trim();
  [meta.client, meta.site, meta.adresse, meta.dateVisite, 'C1', 'C2', 'C3', 'C5'].filter((ref, index, refs) => ref && !['B1', 'B2', 'B3', 'B5'].includes(ref) && refs.indexOf(ref) === index).forEach((ref) => viderCellule(sheetPrincipale, ref));
  setCell(sheetPrincipale, 'B1', visite.nom_client || '');
  setCell(sheetPrincipale, 'B2', visite.nom_site || '');
  setCell(sheetPrincipale, 'B3', cfg.heatNetwork ? (visite.adresse || '') : nomLocal);
  setCell(sheetPrincipale, 'B5', dateGenerale);
  setCell(sheetPrincipale, meta.type, trame.nom);

  if (trame.id === 'pre_allumage') {
    const rubriquesParCode = new Map((modelePreAllumage?.rubriques || []).map((r) => [r.section_code, r]));
    const premieresLignes = new Map();
    for (const mapping of cfg.fieldMappings || []) {
      const ligne = XLSX.utils.decode_cell(mapping.valueCell).r + 1;
      const rubrique = rubriquesParCode.get(mapping.sectionCode);
      const champModulaire = rubrique?.champs?.find((c) => c.cle_stockage === mapping.cle);
      setCell(sheetPrincipale, `A${ligne}`, champModulaire?.libelle || libelleChamp(mapping.sectionCode, mapping.cle, aliases));
      if (!premieresLignes.has(mapping.sectionCode) || ligne < premieresLignes.get(mapping.sectionCode).ligne) premieresLignes.set(mapping.sectionCode, { ligne, mapping });
    }
    for (const { ligne, mapping } of premieresLignes.values()) {
      const rubrique = rubriquesParCode.get(mapping.sectionCode);
      if (ligne > 3) setCell(sheetPrincipale, `A${ligne - 3}`, rubrique?.nom || libelleSection(mapping.panelId, mapping.section, aliases));
    }
  }

  ajouterFeuillePreAllumageModulaire(wb, modelePreAllumage, champsMap, controlesMap);

  for (const mapping of cfg.fieldMappings || []) {
    const lookup = `${mapping.sectionCode}||${mapping.cle}`;
    const champ = champsMap.get(lookup);
    const controle = controlesMap.get(lookup);
    if (mapping.type === 'champ') {
      if (champ) {
        setCell(sheetPrincipale, mapping.valueCell, champ.valeur);
        if (cfg.heatNetwork && /^C\d+$/.test(mapping.valueCell || '')) {
          setCell(sheetPrincipale, `E${mapping.valueCell.slice(1)}`, champ.valeur);
        }
      }
      continue;
    }
    if (controle) {
      setCell(sheetPrincipale, mapping.valueCell, controle.avis);
      setCell(sheetPrincipale, mapping.commentCell, controle.commentaire);
      if (cfg.heatNetwork?.mirrorControlColumns && /^B\d+$/.test(mapping.valueCell || '')) {
        const row = mapping.valueCell.slice(1);
        setCell(sheetPrincipale, `D${row}`, controle.avis);
        setCell(sheetPrincipale, `E${row}`, controle.commentaire);
      }
    }
    if (mapping.panelId === 'p-releves' && champ) {
      setCell(sheetPrincipale, mapping.commentCell || mapping.valueCell, champ.valeur);
      if (cfg.heatNetwork && mapping.commentCell && /^C\d+$/.test(mapping.commentCell)) {
        setCell(sheetPrincipale, `E${mapping.commentCell.slice(1)}`, champ.valeur);
      }
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
  if (cfg.heatNetwork) exporterCompteursReseauChaleur(sheetPrincipale, compteurs, cfg.fieldMappings);
  else exporterCompteurs(sheetPrincipale, compteurs, cfg.fieldMappings);
  const tables = cfg.tables || {};
  if (tables.materiel) remplirTable(wb.Sheets[tables.materiel.sheet], materiel, tables.materiel);
  if (tables.remarques) remplirTable(wb.Sheets[tables.remarques.sheet], remarques, tables.remarques);
  if (cfg.heatNetwork?.summaryRows) ecrireResumeReseauChaleur(sheetPrincipale, remarques, cfg.heatNetwork.summaryRows);
  const noteCfg = tables.note;
  if (noteCfg) setCell(wb.Sheets[noteCfg.sheet], noteCfg.cell, note?.contenu || '');

  return { wb, visite, trame, stats: { champs: champs.length, controles: controles.length, reseaux: reseaux.length, compteurs: compteurs.length, reseauxSupplementaires, materiel: materiel.length, remarques: remarques.length } };
}

async function preparerExport(visiteId) {
  const { wb, visite, trame, stats } = await construireClasseur(visiteId);
  let base64;
  try { base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true }); }
  catch (e) { throw new Error(`Impossible de générer le classeur Excel : ${e?.message || e}`); }
  if (!base64 || base64.length < 100) throw new Error('Le fichier Excel généré est vide ou invalide.');
  const db = await getDb();
  const nomLocal = nomLocalDepuisChamps(await db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id = ?`, [visiteId]));
  const morceauxNom = ['Visite', slugFichier(visite.nom_site)];
  if (nomLocal) morceauxNom.push(slugFichier(nomLocal));
  const nomFichier = `${morceauxNom.join('_')}.xlsx`;
  return { base64, nomFichier, trame, stats };
}

async function enregistrerExcelSurAppareil(visiteId) {
  const { base64, nomFichier, trame, stats } = await preparerExport(visiteId);
  const dossier = await dossierVisiteMetra(visiteId, 'Exports');
  if (!dossier) return { annule: true, nomFichier, trameId: trame.id, trameNom: trame.nom, stats };
  try {
    const uri = await creerFichierSaf(dossier, nomFichier, XLSX_MIME, base64);
    return { annule: false, enregistre: true, uri, nomFichier, trameId: trame.id, trameNom: trame.nom, stats };
  } catch (e) {
    throw new Error(`Impossible d’enregistrer l’Excel dans Documents/METRA : ${e?.message || e}`);
  }
}

async function partagerExcel(visiteId) {
  const { base64, nomFichier, trame, stats } = await preparerExport(visiteId);
  const dossier = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dossier) throw new Error('Stockage local Android indisponible');
  const chemin = dossier + nomFichier;
  await FileSystem.writeAsStringAsync(chemin, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(chemin, { mimeType: XLSX_MIME, dialogTitle: `Partager la visite — ${trame.nom}`, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  return { nomFichier, trameId: trame.id, trameNom: trame.nom, stats, chemin };
}

async function exporterEtPartager(visiteId) {
  try { return await enregistrerExcelSurAppareil(visiteId); }
  catch (e) { if (/Documents\/METRA|dossier METRA/i.test(String(e?.message || e))) return partagerExcel(visiteId); throw e; }
}

export { construireClasseur, preparerExport, enregistrerExcelSurAppareil, partagerExcel, exporterEtPartager };
