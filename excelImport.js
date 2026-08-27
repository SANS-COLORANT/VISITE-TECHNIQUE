/** Import Excel générique : détecte la trame, analyse via son mapping puis intègre SQLite. */

import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { detecterTrameDepuisClasseur } from './trameRegistry.js';
import { getDb, uuidv4 } from './db.js';

function valeurCellule(sheet, ref) {
  const cell = sheet?.[ref];
  if (!cell || cell.v === null || cell.v === undefined) return '';
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (typeof cell.v === 'number' && cell.z && /[dmy]/i.test(cell.z)) {
    const d = XLSX.SSF.parse_date_code(cell.v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(cell.v).trim();
}

function normaliserTexte(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const META_LABELS = {
  client: ['client', 'nom client', 'nom du client', 'maitre d ouvrage', "maitre d'ouvrage"],
  site: ['site', 'nom site', 'nom du site', 'residence', 'nom residence', 'nom de la residence', 'etablissement'],
  adresse: ['adresse', 'adresse du site', 'adresse site', 'localisation'],
  dateVisite: ['date de visite', 'date visite', 'date du controle', 'date du contrôle', 'date'],
};

function estLibelleMeta(v) {
  const n = normaliserTexte(v).replace(/\s*[:\-–—]\s*$/, '');
  return Object.values(META_LABELS).some((labels) => labels.some((label) => normaliserTexte(label) === n));
}

function estDateValideImport(v) {
  const brut = String(v || '').trim();
  if (!brut) return false;
  const n = normaliserTexte(brut);
  if (['de la date', 'la date', 'date', 'date de visite', 'date visite'].includes(n)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return true;
  if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(brut)) return true;
  return false;
}

function normaliserDateImport(v) {
  const brut = String(v || '').trim();
  if (!estDateValideImport(brut)) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return brut;
  const m = brut.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return '';
  const annee = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${annee}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function valeurApresLibelleInline(texte, labels) {
  const brut = String(texte || '').trim();
  const n = normaliserTexte(brut);
  for (const label of labels) {
    const nl = normaliserTexte(label);
    if (!n.startsWith(nl)) continue;
    const reste = brut.slice(label.length).replace(/^\s*[:\-–—]\s*/, '').trim();
    if (reste && normaliserTexte(reste) !== nl) return reste;
  }
  return '';
}

function lireMetaParLibelle(sheet, type) {
  const labels = (META_LABELS[type] || []).map(normaliserTexte);
  if (!sheet || !labels.length) return '';
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:L40');
  const maxRow = Math.min(range.e.r, 39);
  const maxCol = Math.min(range.e.c, 14);

  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const brut = valeurCellule(sheet, ref);
      if (!brut) continue;
      const inline = valeurApresLibelleInline(brut, META_LABELS[type] || []);
      if (inline && (type !== 'dateVisite' || estDateValideImport(inline))) return inline;
      const labelCell = normaliserTexte(brut).replace(/\s*[:\-–—]\s*$/, '');
      if (!labels.includes(labelCell)) continue;

      for (let dc = 1; dc <= 5; dc++) {
        const candidat = valeurCellule(sheet, XLSX.utils.encode_cell({ r, c: c + dc }));
        if (candidat && !estLibelleMeta(candidat) && (type !== 'dateVisite' || estDateValideImport(candidat))) return candidat;
      }
      for (let dr = 1; dr <= 2; dr++) {
        const candidat = valeurCellule(sheet, XLSX.utils.encode_cell({ r: r + dr, c }));
        if (candidat && !estLibelleMeta(candidat) && (type !== 'dateVisite' || estDateValideImport(candidat))) return candidat;
      }
    }
  }
  return '';
}

function lireMetadonnee(sheet, refConfiguree, type) {
  const directe = refConfiguree ? valeurCellule(sheet, refConfiguree) : '';
  const n = normaliserTexte(directe);
  if (directe && !estLibelleMeta(directe) && !(type !== 'dateVisite' && n === 'icpe') && (type !== 'dateVisite' || estDateValideImport(directe))) return directe;
  return lireMetaParLibelle(sheet, type);
}

function nettoyerLabel(cle) {
  return cle.replace(/^Index\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function lireTable(sheet, config) {
  if (!sheet || !config) return [];
  const resultats = [];
  const debut = Number(config.startRow || 1);
  const fin = Number(config.maxImportRow || 500);
  const columns = config.columns || [];
  for (let row = debut; row <= fin; row++) {
    const objet = {};
    let nonVide = false;
    for (const [col, cle] of columns) {
      const valeur = valeurCellule(sheet, `${col}${row}`);
      objet[cle] = valeur;
      if (valeur !== '') nonVide = true;
    }
    if (nonVide) resultats.push(objet);
  }
  return resultats;
}

function lireReseauxComplementaires(wb, config, ordreDepart) {
  const overflow = config?.overflow;
  const sheet = overflow ? wb.Sheets[overflow.sheet] : null;
  if (!overflow || !sheet) return [];
  const resultats = [];
  const debut = Number(overflow.startRow || 3);
  const fin = Number(overflow.maxImportRow || 500);
  for (let row = debut; row <= fin; row++) {
    const reseau = { ordre: ordreDepart + resultats.length };
    let nonVide = false;
    for (const colonne of overflow.columns || []) {
      const valeur = valeurCellule(sheet, `${colonne.col}${row}`);
      reseau[colonne.importKey] = valeur;
      if (valeur !== '') nonVide = true;
    }
    if (nonVide) resultats.push(reseau);
  }
  return resultats;
}

export async function choisirEtAnalyserExcel() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const analyse = analyserClasseur(wb, asset.name || 'import.xlsx');
  analyse.sourceId = `${analyse.trameId}:${analyse.nomFichier}:${empreinteLegere(base64)}`;
  return analyse;
}

function empreinteLegere(texte) {
  let hash = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function analyserClasseur(wb, nomFichier) {
  const definition = detecterTrameDepuisClasseur(wb, valeurCellule);
  if (!definition) throw new Error('Le format de ce fichier n’est associé à aucune trame connue de l’application.');
  const cfg = definition.excel;
  const principale = wb.Sheets[cfg.mainSheet];
  if (!principale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du fichier.`);

  const champs = [];
  const controles = [];
  const compteurs = [];
  for (const mapping of cfg.fieldMappings || []) {
    const valeur = valeurCellule(principale, mapping.valueCell);
    const commentaire = mapping.commentCell ? valeurCellule(principale, mapping.commentCell) : '';
    if (!valeur && !commentaire) continue;
    const item = { sectionCode: mapping.sectionCode, cle: mapping.cle, valeur };
    if (mapping.type === 'controle') controles.push({ ...item, avis: valeur, commentaire });
    else {
      champs.push(item);
      if (/^Index/i.test(mapping.cle) && valeur) compteurs.push({ label: nettoyerLabel(mapping.cle), valeur, unite: (mapping.cle.match(/\(([^)]+)\)/) || [])[1] || '' });
    }
  }

  const reseauxCfg = cfg.networks;
  const reseauxSheet = reseauxCfg ? (wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || principale) : null;
  const colonneReseau = reseauxCfg?.importColumn || reseauxCfg?.exportColumn || 'C';
  const colonnesCompatibles = [...new Set([colonneReseau, ...(reseauxCfg?.legacyImportColumns || ['B'])])];
  const reseauxPrincipaux = reseauxCfg ? (reseauxCfg.starts || []).map((row, index) => {
    const r = { ordre: index + 1 };
    for (const [cle, offset] of Object.entries(reseauxCfg.importOffsets || {})) {
      let valeur = '';
      for (const colonne of colonnesCompatibles) {
        valeur = valeurCellule(reseauxSheet, `${colonne}${row + offset}`);
        if (valeur !== '') break;
      }
      r[cle] = valeur;
    }
    return r;
  }).filter((r) => Object.entries(r).some(([k, v]) => k !== 'ordre' && !!v)) : [];
  const reseauxComplementaires = reseauxCfg ? lireReseauxComplementaires(wb, reseauxCfg, reseauxPrincipaux.length + 1) : [];
  const reseaux = [...reseauxPrincipaux, ...reseauxComplementaires].map((r, index) => ({ ...r, ordre: index + 1 }));

  const tables = cfg.tables || {};
  const materielCfg = tables.materiel;
  const materiel = materielCfg ? lireTable(wb.Sheets[materielCfg.sheet], materielCfg).map((m) => ({ ...m, etat: m.etat || 'Bon' })) : [];
  const remarquesCfg = tables.remarques;
  const remarques = remarquesCfg ? lireTable(wb.Sheets[remarquesCfg.sheet], remarquesCfg) : [];
  const noteCfg = tables.note;
  const note = noteCfg ? valeurCellule(wb.Sheets[noteCfg.sheet], noteCfg.cell) : '';

  if (!champs.length && !controles.length && !reseaux.length && !compteurs.length && !materiel.length && !remarques.length) throw new Error(`La trame ${definition.nom} a été reconnue, mais aucune donnée exploitable n’a été trouvée.`);

  const meta = cfg.metadata || {};
  const clientDetecte = lireMetadonnee(principale, meta.client, 'client');
  const siteDetecte = lireMetadonnee(principale, meta.site, 'site');
  const adresseDetectee = lireMetadonnee(principale, meta.adresse, 'adresse');
  const dateDetectee = normaliserDateImport(lireMetadonnee(principale, meta.dateVisite, 'dateVisite'));

  return {
    trameId: definition.id,
    trameNom: definition.nom,
    nomFichier,
    client: clientDetecte || 'Client importé',
    site: siteDetecte || 'Site importé',
    adresse: adresseDetectee,
    // Une trame sans vraie date reste sans date : ne jamais importer du texte voisin tel que "de la date".
    dateVisite: dateDetectee,
    champs, controles, reseaux, compteurs, materiel, remarques, note,
  };
}

async function trouverClientEquivalent(db, nom) {
  const cible = normaliserTexte(nom);
  const clients = await db.getAllAsync('SELECT id, nom FROM clients');
  return clients.find((c) => normaliserTexte(c.nom) === cible) || null;
}

async function trouverSiteEquivalent(db, clientId, nom) {
  const cible = normaliserTexte(nom);
  const sites = await db.getAllAsync('SELECT id, nom_site FROM sites WHERE client_id = ?', [clientId]);
  return sites.find((s) => normaliserTexte(s.nom_site) === cible) || null;
}

export async function importerAnalyseExcel(analyse) {
  const db = await getDb();
  const deja = await db.getFirstAsync(`SELECT entite_id FROM provenances WHERE origine = 'import_excel' AND reference_externe = ?`, [analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`]);
  if (deja) return { visiteId: deja.entite_id, dejaImporte: true };

  let visiteId;
  let etape = 'initialisation';
  await db.withTransactionAsync(async () => {
    etape = 'client et site';
    let client = await trouverClientEquivalent(db, analyse.client);
    if (!client) {
      client = { id: uuidv4() };
      await db.runAsync('INSERT INTO clients (id, nom) VALUES (?, ?)', [client.id, String(analyse.client || 'Client importé').trim()]);
    }
    let site = await trouverSiteEquivalent(db, client.id, analyse.site);
    if (!site) {
      site = { id: uuidv4() };
      await db.runAsync('INSERT INTO sites (id, client_id, nom_site, adresse) VALUES (?, ?, ?, ?)', [site.id, client.id, String(analyse.site || 'Site importé').trim(), analyse.adresse || null]);
    }

    visiteId = uuidv4();
    await db.runAsync(`INSERT INTO visites (id, site_id, date_visite, technicien, statut, trame_id) VALUES (?, ?, ?, 'Import Excel', 'a_completer', ?)`, [visiteId, site.id, analyse.dateVisite || null, analyse.trameId || 'icpe_v1']);

    for (const item of analyse.champs) await db.runAsync(`INSERT OR REPLACE INTO champs_visite (visite_id, section_code, cle, valeur) VALUES (?, ?, ?, ?)`, [visiteId, item.sectionCode, item.cle, item.valeur]);
    for (const item of analyse.controles) await db.runAsync(`INSERT OR REPLACE INTO controles_visite (visite_id, section_code, cle, avis, commentaire) VALUES (?, ?, ?, ?, ?)`, [visiteId, item.sectionCode, item.cle, item.avis || null, item.commentaire || null]);
    await db.runAsync('INSERT INTO notes (visite_id, contenu) VALUES (?, ?)', [visiteId, analyse.note || '']);

    let installation = await db.getFirstAsync('SELECT id FROM installations WHERE site_id = ? AND actif = 1 LIMIT 1', [site.id]);
    if (!installation) {
      installation = { id: uuidv4() };
      await db.runAsync(`INSERT INTO installations (id, site_id, type_code, nom) VALUES (?, ?, 'chaufferie', 'Installation principale')`, [installation.id, site.id]);
    }

    etape = 'réseaux';
    for (const r of analyse.reseaux || []) {
      await db.runAsync(`INSERT INTO reseaux (id, visite_id, installation_id, ordre, nom_reseau, t_ext_c, t_dep_c, courbe_de_chauffe, tnc, consigne_programme_horaire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, installation.id, r.ordre || 0, r.nom_reseau || null, r.t_ext_c || null, r.t_dep_c || null, r.courbe_de_chauffe || null, r.tnc || null, r.consigne_programme_horaire || null]);
    }

    etape = 'compteurs';
    for (const c of analyse.compteurs || []) await db.runAsync(`INSERT INTO compteurs (id, visite_id, installation_id, label, valeur, unite) VALUES (?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, installation.id, c.label || 'Compteur', c.valeur || null, c.unite || null]);

    etape = 'matériel';
    for (const m of analyse.materiel || []) {
      await db.runAsync(`INSERT INTO materiel (id, visite_id, installation_id, categorie, designation, marque, modele, annee, quantite, etat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), visiteId, installation.id, m.categorie || null, m.designation || null, m.marque || null, m.modele || null, m.annee || null, Number(m.quantite || 1), m.etat || 'Bon']);
    }

    etape = 'remarques';
    for (const r of analyse.remarques || []) {
      await db.runAsync(`INSERT INTO remarques (id, visite_id, prestation, remarque, cree_le) VALUES (?, ?, ?, ?, datetime('now'))`, [uuidv4(), visiteId, r.prestation || r.poste || null, r.remarque || r.commentaire || r.texte || null]);
    }

    etape = 'provenance';
    await db.runAsync(`INSERT INTO provenances (id, origine, reference_externe, type_entite, entite_id) VALUES (?, 'import_excel', ?, 'visite', ?)`, [uuidv4(), analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`, visiteId]);
  }).catch((error) => {
    error.message = `Import Excel interrompu à l’étape « ${etape} » : ${error.message || error}`;
    throw error;
  });

  return { visiteId, dejaImporte: false };
}
