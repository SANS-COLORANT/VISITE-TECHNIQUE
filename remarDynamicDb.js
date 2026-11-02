/**
 * Refonte REMAR, modele local-first.
 * Les CTA/caissons/froid sont de vrais equipements partages (equipements/materiel),
 * jamais une seconde copie REMAR. Seuls leurs enfants et constats sont nouveaux.
 */
import { getDb } from './db.js';
import { createId } from './database/ids.js';

export const REMAR_FAMILLES = Object.freeze({
  cta: { label: 'CTA', type: 'CTA', ajout: 'Ajouter une CTA' },
  vmc: { label: 'Caisson VMC', type: 'VMC', ajout: 'Ajouter un caisson VMC' },
  froid: { label: 'Production de froid', type: 'Froid', ajout: 'Ajouter une installation de froid' },
});

const str = (v) => String(v ?? '').trim();
const norm = (v) => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sq = (v) => norm(v).replace(/[^a-z0-9]+/g, ' ').trim();

export function remarFamilleEquipement(e) {
  const category = sq(e?.type_code || e?.categorie);
  if (/(^| )(cta|centrale traitement air)( |$)/.test(category)) return 'cta';
  if (/(^| )(vmc|caisson vmc|caisson extraction|extracteur)( |$)/.test(category)) return 'vmc';
  if (/(^| )(froid|production froid|groupe froid|groupe eau glacee|chiller)( |$)/.test(category)) return 'froid';
  return null;
}

async function visitContext(db, visiteId, edit = false) {
  const v = await db.getFirstAsync(
    'SELECT id,site_id,installation_id,trame_id,statut,date_visite FROM visites WHERE id=?', [visiteId]
  );
  if (!v || !str(v.trame_id).startsWith('remar')) throw new Error('Visite REMAR introuvable.');
  if (edit && v.statut !== 'en_cours' && v.statut !== 'a_completer') {
    throw new Error('Une visite cloturee ne peut pas modifier le patrimoine REMAR.');
  }
  return v;
}
async function requireLocal(db, visiteId, edit = false) {
  const v = await visitContext(db, visiteId, edit);
  if (!v.installation_id) throw new Error('Selectionne un local technique avant de creer un element REMAR (aucune association par nom n\'est autorisee).');
  const i = await db.getFirstAsync('SELECT id FROM installations WHERE id=? AND site_id=? AND actif=1', [v.installation_id,v.site_id]);
  if (!i) throw new Error('Local technique invalide ou retire.');
  return v;
}

export async function listerRemarEquipements(visiteId, famille) {
  if (!REMAR_FAMILLES[famille]) throw new Error('Famille REMAR inconnue.');
  const db = await getDb();
  const v = await visitContext(db, visiteId);
  if (!v.installation_id) return [];
  const rows = await db.getAllAsync(`
    SELECT e.*,m.id AS materiel_id
    FROM equipements e
    LEFT JOIN materiel m ON m.equipement_id=e.id AND m.visite_id=?
    WHERE e.installation_id=? AND (m.id IS NOT NULL OR (e.statut='actif' AND ?=1))
    ORDER BY e.cree_le,e.id
  `, [visiteId,v.installation_id,v.statut==='en_cours'||v.statut==='a_completer'?1:0]);
  return rows.filter(e => remarFamilleEquipement(e) === famille);
}

export async function creerRemarEquipement(visiteId, famille, nom) {
  if (!REMAR_FAMILLES[famille]) throw new Error('Type d\'equipement REMAR inconnu.');
  const db = await getDb();
  const v = await requireLocal(db, visiteId, true);
  const label = str(nom);
  if (!label) throw new Error('Nomme cet equipement avant de le creer.');
  const types = await db.getAllAsync('SELECT id,type_code,designation FROM equipements WHERE installation_id=? AND statut=\'actif\'', [v.installation_id]);
  if (types.some(e => remarFamilleEquipement(e) === famille && sq(e.designation) === sq(label))) {
    throw new Error('Cet equipement existe deja dans le patrimoine du local. Utilise sa fiche existante.');
  }
  const equipementId = createId();
  const materielId = createId();
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(
      'INSERT INTO equipements(id,installation_id,type_code,designation,statut) VALUES(?,?,?,?,\'actif\')',
      [equipementId,v.installation_id,REMAR_FAMILLES[famille].type,label]
    );
    await tx.runAsync(
      'INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1)',
      [equipementId,v.trame_id]
    );
    await tx.runAsync(
      'INSERT INTO materiel(id,visite_id,equipement_id,categorie,nombre,designation,etat,ajoute_pendant_visite) VALUES(?,?,?,?,?,?,NULL,1)',
      [materielId,visiteId,equipementId,REMAR_FAMILLES[famille].type,'1',label]
    );
  });
  return equipementId;
}

export async function renommerRemarEquipement(visiteId, equipementId, nom) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  const name = str(nom);
  if (!name) throw new Error('Nom vide.');
  const e = await db.getFirstAsync('SELECT id FROM equipements WHERE id=? AND installation_id=? AND statut=\'actif\'', [equipementId,v.installation_id]);
  if (!e) throw new Error('Equipement du local introuvable.');
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('UPDATE equipements SET designation=?,modifie_le=datetime(\'now\') WHERE id=?', [name,equipementId]);
    await tx.runAsync('UPDATE materiel SET designation=? WHERE visite_id=? AND equipement_id=?', [name,visiteId,equipementId]);
  });
}

export async function retirerRemarEquipement(visiteId, equipementId) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  const e = await db.getFirstAsync('SELECT id FROM equipements WHERE id=? AND installation_id=? AND statut=\'actif\'', [equipementId,v.installation_id]);
  if (!e) throw new Error('Equipement indisponible.');
  // Retrait du patrimoine uniquement. L'inventaire et les anciennes visites ne
  // sont jamais effaces ; les enfants sont conserves pour l'historique.
  await db.runAsync('UPDATE equipements SET statut=\'retire\',modifie_le=datetime(\'now\') WHERE id=?', [equipementId]);
}

export async function listerRemarItems(visiteId, typeCode, parentEquipementId = null) {
  const db = await getDb(), v = await visitContext(db, visiteId);
  if (!v.installation_id) return [];
  return db.getAllAsync(`
    SELECT i.* FROM remar_items i
    JOIN remar_item_visits piv ON piv.item_id=i.id AND piv.visite_id=?
    WHERE i.installation_id=? AND i.type_code=?
      AND COALESCE(i.parent_equipement_id,'')=?
    ORDER BY i.ordre,i.cree_le,i.id
  `, [visiteId,v.installation_id,typeCode,str(parentEquipementId)]);
}

export async function creerRemarItem(visiteId, { typeCode, nom, unite = null, parentEquipementId = null, parentReseauId = null } = {}) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  const type = str(typeCode), name = str(nom), unit = str(unite) || null;
  if (!/^[a-z_]{3,32}$/.test(type) || !name) throw new Error('Type et nom d\'element requis.');
  if (parentEquipementId) {
    const parent = await db.getFirstAsync('SELECT id FROM equipements WHERE id=? AND installation_id=? AND statut=\'actif\'', [parentEquipementId,v.installation_id]);
    if (!parent) throw new Error('Equipement parent absent du local.');
  }
  if (parentReseauId) {
    const parent = await db.getFirstAsync('SELECT id FROM reseaux_site WHERE id=? AND installation_id=? AND actif=1', [parentReseauId,v.installation_id]);
    if (!parent) throw new Error('Reseau parent absent du local.');
  }
  const previous = await db.getAllAsync(`SELECT nom FROM remar_items
    WHERE installation_id=? AND type_code=? AND COALESCE(parent_equipement_id,'')=? AND actif=1`,
  [v.installation_id,type,str(parentEquipementId)]);
  if (previous.some(p => sq(p.nom)===sq(name))) throw new Error('Cet element existe deja pour cet equipement. Renomme-le ou utilise sa fiche.');
  const id = createId();
  const order = await db.getFirstAsync('SELECT COALESCE(MAX(ordre),0)+1 AS n FROM remar_items WHERE installation_id=? AND type_code=? AND COALESCE(parent_equipement_id,\'\')=?', [v.installation_id,type,str(parentEquipementId)]);
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(`INSERT INTO remar_items(id,installation_id,parent_equipement_id,parent_reseau_id,type_code,nom,unite,ordre)
      VALUES(?,?,?,?,?,?,?,?)`, [id,v.installation_id,parentEquipementId,parentReseauId,type,name,unit,Number(order?.n||1)]);
    await tx.runAsync('INSERT INTO remar_item_visits(visite_id,item_id) VALUES(?,?)', [visiteId,id]);
  });
  return id;
}

export async function renommerRemarItem(visiteId, itemId, name) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  if (!str(name)) throw new Error('Le nom ne peut pas etre vide.');
  const item = await db.getFirstAsync('SELECT id FROM remar_items WHERE id=? AND installation_id=? AND actif=1', [itemId,v.installation_id]);
  if (!item) throw new Error('Element introuvable.');
  await db.runAsync('UPDATE remar_items SET nom=?,modifie_le=datetime(\'now\') WHERE id=?', [str(name),itemId]);
}

export async function retirerRemarItem(visiteId, itemId) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  const item = await db.getFirstAsync('SELECT id FROM remar_items WHERE id=? AND installation_id=? AND actif=1', [itemId,v.installation_id]);
  if (!item) throw new Error('Element introuvable.');
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync('UPDATE remar_items SET actif=0,modifie_le=datetime(\'now\') WHERE id=?', [itemId]);
    // Cache le retrait dans la visite courante sans toucher aux autres visites.
    await tx.runAsync('DELETE FROM remar_item_visits WHERE visite_id=? AND item_id=?', [visiteId,itemId]);
  });
}

/** Fige les enfants actifs du local pour la nouvelle visite (appel unique). */
export async function figerItemsRemarPourVisite(visiteId) {
  const db = await getDb(), v = await visitContext(db, visiteId);
  if (!v.installation_id || v.statut !== 'en_cours') return 0;
  const result = await db.runAsync(`
    INSERT OR IGNORE INTO remar_item_visits(visite_id,item_id)
    SELECT ?,i.id FROM remar_items i
    LEFT JOIN equipements e ON e.id=i.parent_equipement_id
    WHERE i.installation_id=? AND i.actif=1
      AND (i.parent_equipement_id IS NULL OR e.statut='actif')
  `, [visiteId,v.installation_id]);
  return Number(result?.changes||0);
}

/** Permet d'enregistrer les observations sans ecraser la valeur source. */
export async function enregistrerRemarValeur(visiteId, {ownerType, ownerId, panelId, sectionCode, cle, valeur=null, avis=null, commentaire=null} = {}) {
  const db = await getDb(), v = await requireLocal(db, visiteId, true);
  if (!['equipement','item'].includes(ownerType) || !str(ownerId) || !str(panelId) || !str(sectionCode) || !str(cle)) {
    throw new Error('Identite de la mesure/du controle incomplete.');
  }
  const belongs = ownerType === 'equipement'
    ? await db.getFirstAsync('SELECT id FROM equipements WHERE id=? AND installation_id=?', [ownerId,v.installation_id])
    : await db.getFirstAsync('SELECT id FROM remar_items WHERE id=? AND installation_id=?', [ownerId,v.installation_id]);
  if (!belongs) throw new Error('Objet hors du local de cette visite.');
  if (avis!=null && !['S','N.S','N.R','S.O','N.V'].includes(avis)) throw new Error('Avis REMAR inconnu.');
  await db.runAsync(`INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,confirme_le)
    VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(visite_id,owner_type,owner_id,panel_id,section_code,cle)
    DO UPDATE SET valeur=excluded.valeur,avis=excluded.avis,commentaire=excluded.commentaire,
      source_visite_id=NULL,confirme_le=datetime('now'),modifie_le=datetime('now')`,
  [visiteId,ownerType,ownerId,panelId,sectionCode,cle,valeur==null?null:String(valeur),avis,commentaire==null?null:String(commentaire)]);
}

/** Courant prioritaire, sinon derniere valeur compatible de la meme entite du local.
 * Les valeurs heritees restent marquees non confirmees jusqu'a une vraie saisie.
 */
export async function listerRemarValeurs(visiteId, ownerType, ownerId) {
  const db = await getDb(), v = await visitContext(db, visiteId);
  if (!v.installation_id) return {};
  if (!['equipement','item'].includes(ownerType)) throw new Error('Type de source inconnu.');
  const rows = await db.getAllAsync(`
    SELECT rv.*,old.date_visite AS date_source
    FROM remar_values rv JOIN visites old ON old.id=rv.visite_id
    WHERE rv.owner_type=? AND rv.owner_id=? AND old.installation_id=?
      AND (old.id=? OR old.date_visite<? OR (old.date_visite=? AND old.rowid<(SELECT rowid FROM visites WHERE id=?)))
      AND old.trame_id LIKE 'remar%'
    ORDER BY CASE WHEN old.id=? THEN 0 ELSE 1 END,old.date_visite DESC,old.rowid DESC,rv.modifie_le DESC
  `, [ownerType,ownerId,v.installation_id,visiteId,v.date_visite,v.date_visite,visiteId,visiteId]);
  const found = {};
  for (const r of rows) {
    const key = [r.panel_id,r.section_code,r.cle].join('||');
    if (found[key]) continue;
    found[key] = { ...r, inherited: r.visite_id!==visiteId, source_visite_id:r.visite_id===visiteId?r.source_visite_id:r.visite_id };
  }
  return found;
}

export async function choisirRemarEquipementReference(visiteId, famille, equipementId) {
  if (!REMAR_FAMILLES[famille]) throw new Error('Famille inconnue.');
  const db = await getDb();await requireLocal(db,visiteId,true);
  const rows=await listerRemarEquipements(visiteId,famille);
  if (!rows.some(x=>x.id===equipementId)) throw new Error('Equipement absent de ce local.');
  await db.runAsync(`INSERT INTO remar_report_focus(visite_id,famille,equipement_id) VALUES(?,?,?)
    ON CONFLICT(visite_id,famille) DO UPDATE SET equipement_id=excluded.equipement_id`,
  [visiteId,famille,equipementId]);
}

export async function getRemarEquipementReference(visiteId, famille, equipments = null) {
  const db = await getDb();
  const rows = equipments || await listerRemarEquipements(visiteId,famille);
  const selected = await db.getFirstAsync('SELECT equipement_id FROM remar_report_focus WHERE visite_id=? AND famille=?', [visiteId,famille]);
  if (selected?.equipement_id && rows.some(x=>x.id===selected.equipement_id)) return selected.equipement_id;
  return rows.length===1?rows[0].id:null;
}
