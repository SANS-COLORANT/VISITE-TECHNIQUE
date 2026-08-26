/** Import Excel ICPE : lit les données métier et conserve le classeur OOXML source intact. */

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
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const META_LABELS = {
  client: ['client', 'nom client', 'nom du client', 'maitre d ouvrage', "maitre d'ouvrage"],
  site: ['site', 'nom site', 'nom du site', 'residence', 'nom residence', 'nom de la residence', 'etablissement'],
  local: ['local', 'nom du local', 'nom local'],
  adresse: ['adresse', 'adresse du site', 'adresse site', 'localisation'],
  dateVisite: ['date de visite', 'date visite', 'date du controle', 'date du contrôle', 'date'],
};

function estLibelleMeta(v) {
  const n = normaliserTexte(v).replace(/\s*[:\-–—]\s*$/, '');
  return Object.values(META_LABELS).some((labels) => labels.some((label) => normaliserTexte(label) === n));
}

function valeurApresLibelleInline(texte, labels) {
  const brut = String(texte || '').trim();
  for (const label of labels) {
    // Une valeur inline n'est admise qu'avec un séparateur explicite.
    // Ainsi "Date de la visite" reste un libellé complet et ne devient jamais
    // la fausse date "de la visite" à cause du libellé court "date".
    const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = brut.match(new RegExp(`^\\s*${escaped}\\s*[:\\-–—]\\s*(.+?)\\s*$`, 'i'));
    if (!match) continue;
    const reste = String(match[1] || '').trim();
    if (reste && normaliserTexte(reste) !== normaliserTexte(label)) return reste;
  }
  return '';
}

function lireMetaParLibelle(sheet, type) {
  const labels = (META_LABELS[type] || []).map(normaliserTexte);
  if (!sheet || !labels.length) return '';
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:L40');
  for (let r = 0; r <= Math.min(range.e.r, 39); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 14); c++) {
      const brut = valeurCellule(sheet, XLSX.utils.encode_cell({ r, c }));
      if (!brut) continue;
      const inline = valeurApresLibelleInline(brut, META_LABELS[type] || []);
      if (inline) return inline;
      const labelCell = normaliserTexte(brut).replace(/\s*[:\-–—]\s*$/, '');
      if (!labels.includes(labelCell)) continue;
      for (let dc = 1; dc <= 5; dc++) {
        const candidat = valeurCellule(sheet, XLSX.utils.encode_cell({ r, c: c + dc }));
        if (candidat && !estLibelleMeta(candidat)) return candidat;
      }
      for (let dr = 1; dr <= 2; dr++) {
        const candidat = valeurCellule(sheet, XLSX.utils.encode_cell({ r: r + dr, c }));
        if (candidat && !estLibelleMeta(candidat)) return candidat;
      }
    }
  }
  return '';
}

function lireMetadonnee(sheet, refConfiguree, type) {
  const directe = refConfiguree ? valeurCellule(sheet, refConfiguree) : '';
  const n = normaliserTexte(directe);
  if (directe && !estLibelleMeta(directe) && !(type !== 'dateVisite' && n === 'icpe')) return directe;
  return lireMetaParLibelle(sheet, type);
}

function nettoyerLabel(cle) {
  return cle.replace(/^Index\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const VALEURS_SPECIALES = new Set(['sans objet', 's.o', 'so', 'non releve', 'n.r', 'nr', 'n.v', 'nv', '/']);
function analyserCompteur(cle, texte) {
  const brut = String(texte || '').trim();
  const uniteCle = (cle.match(/\(([^)]+)\)/) || [])[1] || '';
  if (!brut) return { label: nettoyerLabel(cle), valeur: '', unite: uniteCle };
  if (VALEURS_SPECIALES.has(normaliserTexte(brut))) return { label: nettoyerLabel(cle), valeur: brut, unite: '' };

  const deuxPoints = brut.indexOf(':');
  let label = nettoyerLabel(cle);
  let valeur = brut;
  if (deuxPoints >= 0) {
    label = brut.slice(0, deuxPoints).trim() || label;
    valeur = brut.slice(deuxPoints + 1).trim();
  }
  const uniteMatch = valeur.match(/\s+(m3|m³|MWh|kWh|bar|L|%)\s*$/i);
  const unite = uniteMatch ? uniteMatch[1] : uniteCle;
  if (uniteMatch) valeur = valeur.slice(0, uniteMatch.index).trim();
  return { label, valeur, unite };
}

function lireTable(sheet, config) {
  if (!sheet || !config) return [];
  const resultats = [];
  for (let row = Number(config.startRow || 1); row <= Number(config.maxImportRow || 500); row++) {
    const objet = { __excelRow: row };
    let nonVide = false;
    for (const [col, cle] of config.columns || []) {
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
  for (let row = Number(overflow.startRow || 3); row <= Number(overflow.maxImportRow || 500); row++) {
    const reseau = { ordre: ordreDepart + resultats.length, __excelRow: row, __excelSheet: overflow.sheet };
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

function empreinteLegere(texte) {
  let hash = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function nomFichierSecurise(nom) {
  return String(nom || 'import.xlsx').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'import.xlsx';
}

async function conserverSourceImport(asset, empreinte) {
  if (!FileSystem.documentDirectory) return null;
  const dossier = `${FileSystem.documentDirectory}excel-sources/`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = `${dossier}${empreinte}_${nomFichierSecurise(asset.name)}`;
  await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  return destination;
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
  const empreinte = empreinteLegere(base64);
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true, cellNF: true });
  const analyse = analyserClasseur(wb, asset.name || 'import.xlsx');
  analyse.sourceId = `${analyse.trameId}:${analyse.nomFichier}:${empreinte}`;
  analyse.sourceUri = await conserverSourceImport(asset, empreinte);
  return analyse;
}

export function analyserClasseur(wb, nomFichier) {
  const definition = detecterTrameDepuisClasseur(wb, valeurCellule);
  if (!definition) throw new Error('Le format de ce fichier n’est associé à aucune trame connue de l’application.');
  const cfg = definition.excel;
  const principale = wb.Sheets[cfg.mainSheet];
  if (!principale) throw new Error(`Feuille principale « ${cfg.mainSheet} » absente du fichier.`);

  const champs = [], controles = [], compteurs = [];
  for (const mapping of cfg.fieldMappings || []) {
    const valeur = valeurCellule(principale, mapping.valueCell);
    const commentaire = mapping.commentCell ? valeurCellule(principale, mapping.commentCell) : '';
    if (!valeur && !commentaire) continue;
    const item = { sectionCode: mapping.sectionCode, cle: mapping.cle, valeur, sourceCell: mapping.valueCell };
    if (mapping.type === 'controle') controles.push({ ...item, avis: valeur, commentaire, commentCell: mapping.commentCell });
    else {
      champs.push(item);
      if (/^Index/i.test(mapping.cle) && valeur) compteurs.push({ ...analyserCompteur(mapping.cle, valeur), sourceCell: mapping.valueCell });
    }
  }

  const reseauxCfg = cfg.networks;
  const reseauxSheet = reseauxCfg ? (wb.Sheets[reseauxCfg.mainSheet || cfg.mainSheet] || principale) : null;
  const colonneReseau = reseauxCfg?.importColumn || reseauxCfg?.exportColumn || 'C';
  const colonnesCompatibles = [...new Set([colonneReseau, ...(reseauxCfg?.legacyImportColumns || ['B'])])];
  const reseauxPrincipaux = reseauxCfg ? (reseauxCfg.starts || []).map((row, index) => {
    const r = { ordre: index + 1, __excelStart: row, __excelSheet: reseauxCfg.mainSheet || cfg.mainSheet };
    for (const [cle, offset] of Object.entries(reseauxCfg.importOffsets || {})) {
      let valeur = '';
      for (const colonne of colonnesCompatibles) {
        valeur = valeurCellule(reseauxSheet, `${colonne}${row + offset}`);
        if (valeur !== '') break;
      }
      r[cle] = valeur;
    }
    return r;
  }).filter((r) => Object.entries(r).some(([k, v]) => !k.startsWith('__') && k !== 'ordre' && !!v)) : [];
  const reseaux = [...reseauxPrincipaux, ...lireReseauxComplementaires(wb, reseauxCfg, reseauxPrincipaux.length + 1)].map((r, index) => ({ ...r, ordre: index + 1 }));

  const tables = cfg.tables || {};
  const materiel = tables.materiel ? lireTable(wb.Sheets[tables.materiel.sheet], tables.materiel) : [];
  const remarques = tables.remarques ? lireTable(wb.Sheets[tables.remarques.sheet], tables.remarques) : [];
  const note = tables.note ? valeurCellule(wb.Sheets[tables.note.sheet], tables.note.cell) : '';

  if (!champs.length && !controles.length && !reseaux.length && !compteurs.length && !materiel.length && !remarques.length) {
    throw new Error(`La trame ${definition.nom} a été reconnue, mais aucune donnée exploitable n’a été trouvée.`);
  }

  const meta = cfg.metadata || {};
  return {
    trameId: definition.id,
    trameNom: definition.nom,
    nomFichier,
    client: lireMetadonnee(principale, meta.client, 'client') || 'Client importé',
    site: lireMetadonnee(principale, meta.site, 'site') || 'Site importé',
    local: lireMetadonnee(principale, meta.local, 'local'),
    adresse: lireMetadonnee(principale, meta.adresse, 'adresse'),
    dateVisite: lireMetadonnee(principale, meta.dateVisite, 'dateVisite') || new Date().toISOString().slice(0, 10),
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

function nombreOuNull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function importerAnalyseExcel(analyse) {
  const db = await getDb();
  const deja = await db.getFirstAsync(
    `SELECT entite_id FROM provenances WHERE origine='import_excel' AND reference_externe=?`,
    [analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`]
  );
  if (deja) return { visiteId: deja.entite_id, dejaImporte: true };

  let visiteId;
  let etape = 'initialisation';
  const bindings = { materiel: [], remarques: [], compteurs: [], reseaux: [] };

  await db.withTransactionAsync(async () => {
    etape = 'client et site';
    let client = await trouverClientEquivalent(db, analyse.client);
    if (!client) {
      client = { id: uuidv4() };
      await db.runAsync('INSERT INTO clients(id,nom) VALUES(?,?)', [client.id, String(analyse.client || 'Client importé').trim()]);
    }
    let site = await trouverSiteEquivalent(db, client.id, analyse.site);
    if (!site) {
      site = { id: uuidv4() };
      await db.runAsync('INSERT INTO sites(id,client_id,nom_site,adresse,localisation_note) VALUES(?,?,?,?,?)', [site.id, client.id, String(analyse.site || 'Site importé').trim(), analyse.adresse || null, analyse.local || null]);
    } else if (analyse.local) {
      await db.runAsync(`UPDATE sites SET localisation_note=? WHERE id=? AND (localisation_note IS NULL OR trim(localisation_note)='')`, [analyse.local, site.id]);
    }

    visiteId = uuidv4();
    await db.runAsync(`INSERT INTO visites(id,site_id,date_visite,technicien,statut,trame_id) VALUES(?,?,?,'Import Excel','a_completer',?)`, [visiteId, site.id, analyse.dateVisite, analyse.trameId || 'icpe_v1']);

    for (const item of analyse.champs) await db.runAsync(`INSERT OR REPLACE INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)`, [visiteId, item.sectionCode, item.cle, item.valeur]);
    for (const item of analyse.controles) await db.runAsync(`INSERT OR REPLACE INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)`, [visiteId, item.sectionCode, item.cle, item.avis || null, item.commentaire || null]);
    await db.runAsync('INSERT INTO notes(visite_id,contenu) VALUES(?,?)', [visiteId, analyse.note || '']);

    let installation = await db.getFirstAsync('SELECT id FROM installations WHERE site_id=? AND actif=1 LIMIT 1', [site.id]);
    if (!installation) {
      installation = { id: uuidv4() };
      await db.runAsync(`INSERT INTO installations(id,site_id,type_code,nom) VALUES(?,?,'chaufferie','Installation principale')`, [installation.id, site.id]);
    }

    etape = 'réseaux';
    for (const r of analyse.reseaux) {
      let permanent = await db.getFirstAsync('SELECT id FROM reseaux_site WHERE installation_id=? AND nom=? COLLATE NOCASE', [installation.id, r.nom || `Réseau ${r.ordre}`]);
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(`INSERT INTO reseaux_site(id,installation_id,type_code,nom,ordre) VALUES(?,?,'chauffage',?,?)`, [permanent.id, installation.id, r.nom || `Réseau ${r.ordre}`, r.ordre]);
      }
      const id = uuidv4();
      await db.runAsync(`INSERT INTO reseaux(id,visite_id,reseau_site_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire) VALUES(?,?,?,?,?,?,?,?,?,?)`, [id, visiteId, permanent.id, r.ordre, r.nom, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]);
      await db.runAsync(`INSERT OR REPLACE INTO observations_reseau(id,reseau_site_id,visite_id,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire) VALUES(?,?,?,?,?,?,?,?)`, [uuidv4(), permanent.id, visiteId, r.tExt, r.tDep, r.courbe, r.tnc, r.programme]);
      bindings.reseaux.push({ id, start: r.__excelStart || null, row: r.__excelRow || null, sheet: r.__excelSheet || null });
    }

    etape = 'équipements';
    const equipementsUtilises = new Set();
    for (const m of analyse.materiel) {
      const compatibles = await db.getAllAsync(`SELECT id FROM equipements WHERE installation_id=? AND statut='actif' AND COALESCE(type_code,'')=COALESCE(?,'') COLLATE NOCASE AND COALESCE(designation,'')=COALESCE(?,'') COLLATE NOCASE AND COALESCE(marque,'')=COALESCE(?,'') COLLATE NOCASE AND COALESCE(modele,'')=COALESCE(?,'') COLLATE NOCASE AND (?='' OR COALESCE(numero_serie,'')=? COLLATE NOCASE) ORDER BY cree_le`, [installation.id, m.categorie || 'non_classe', m.designation || '', m.marque || '', m.modele || '', m.numero || '', m.numero || '']);
      let equipement = compatibles.find((item) => !equipementsUtilises.has(item.id)) || null;
      if (!equipement) {
        equipement = { id: uuidv4() };
        await db.runAsync(`INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,numero_serie,annee,statut) VALUES(?,?,?,?,?,?,?,?,'actif')`, [equipement.id, installation.id, m.categorie || 'non_classe', m.designation || null, m.marque || null, m.modele || null, m.numero || null, nombreOuNull(m.annee)]);
      }
      equipementsUtilises.add(equipement.id);
      const materielId = uuidv4();
      await db.runAsync(`INSERT INTO materiel(id,visite_id,equipement_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [materielId, visiteId, equipement.id, m.categorie || null, nombreOuNull(m.nombre), m.designation || null, m.numero || null, m.reseau || null, m.marque || null, m.modele || null, m.caracteristiques || null, m.annee || null, m.etat || null]);
      await db.runAsync(`INSERT OR REPLACE INTO observations_equipement(id,equipement_id,visite_id,etat) VALUES(?,?,?,?)`, [uuidv4(), equipement.id, visiteId, m.etat || null]);
      bindings.materiel.push({ id: materielId, row: m.__excelRow });
    }

    etape = 'compteurs';
    for (const c of analyse.compteurs) {
      let permanent = await db.getFirstAsync('SELECT id FROM compteurs_site WHERE installation_id=? AND libelle=? COLLATE NOCASE AND actif=1', [installation.id, c.label]);
      if (!permanent) {
        permanent = { id: uuidv4() };
        await db.runAsync(`INSERT INTO compteurs_site(id,installation_id,type_code,libelle,unite) VALUES(?,?,?,?,?)`, [permanent.id, installation.id, c.label, c.label, c.unite || null]);
      }
      const id = uuidv4();
      const nombre = nombreOuNull(c.valeur);
      await db.runAsync(`INSERT INTO compteurs(id,visite_id,compteur_site_id,label,valeur,unite) VALUES(?,?,?,?,?,?)`, [id, visiteId, permanent.id, c.label, c.valeur, c.unite || null]);
      await db.runAsync(`INSERT OR REPLACE INTO releves_compteur(id,compteur_site_id,visite_id,valeur_texte,valeur_nombre,unite) VALUES(?,?,?,?,?,?)`, [uuidv4(), permanent.id, visiteId, c.valeur, nombre, c.unite || null]);
      bindings.compteurs.push({ id, cell: c.sourceCell });
    }

    etape = 'réserves';
    for (const r of analyse.remarques) {
      const id = uuidv4();
      await db.runAsync(`INSERT INTO remarques(id,visite_id,poste,prestation,delai,estimatif,origine) VALUES(?,?,?,?,?,?,'Import Excel')`, [id, visiteId, r.poste || null, r.prestation || null, nombreOuNull(r.delai), nombreOuNull(r.estimatif)]);
      bindings.remarques.push({ id, row: r.__excelRow });
    }

    etape = 'finalisation';
    await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,'visite',?,'import_excel',?,?)`, [
      uuidv4(), visiteId, analyse.sourceId || `${analyse.trameId}:${analyse.nomFichier}`,
      JSON.stringify({ fichier: analyse.nomFichier, trameId: analyse.trameId, trameNom: analyse.trameNom, client: analyse.client, site: analyse.site, local: analyse.local || null, dateVisite: analyse.dateVisite, sourceUri: analyse.sourceUri || null, excelBindings: bindings }),
    ]);
  }).catch((error) => { throw new Error(`Import interrompu pendant l’étape « ${etape} » : ${error.message || error}`); });

  return { visiteId, dejaImporte: false, trameId: analyse.trameId, trameNom: analyse.trameNom };
}
