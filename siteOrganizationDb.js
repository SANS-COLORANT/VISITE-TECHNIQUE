import { getDb, uuidv4 } from './db.js';
import { cloneLatestVisitsForSite } from './siteVisitCloneDb.js';
import { COPY_TEMPLATE_KEY, COPY_ORIGIN_KEY, siteCreationTemplate, localCreationTemplate, parseCopyJson } from './siteHierarchyDb.js';

function texte(v = '') { return String(v ?? '').trim().replace(/\s+/g, ' '); }

async function insererClone(db, table, source, overrides = {}, exclusions = []) {
  const colonnes = await db.getAllAsync(`PRAGMA table_info(${table})`);
  const noms = colonnes.map((c) => c.name).filter((nom) => !exclusions.includes(nom));
  const payload = {};
  for (const nom of noms) {
    if (Object.prototype.hasOwnProperty.call(overrides, nom)) payload[nom] = overrides[nom];
    else if (Object.prototype.hasOwnProperty.call(source || {}, nom)) payload[nom] = source[nom];
  }
  const keys = Object.keys(payload);
  if (!keys.length) return;
  await db.runAsync(
    `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`,
    keys.map((key) => payload[key])
  );
}

async function clonerAttributs(db, type, sourceId, cibleId) {
  const rows = await db.getAllAsync(`SELECT * FROM attributs_libres WHERE entite_type=? AND entite_id=?`, [type, sourceId]);
  for (const row of rows) {
    if (/^(api_symfony|intranet\.|remote\.|metra\.copy\.)/i.test(String(row.cle||''))) continue;
    await insererClone(db, 'attributs_libres', row, { id: uuidv4(), entite_id: cibleId }, ['cree_le', 'modifie_le']);
  }
}

async function recordCopy(db,type,sourceId,targetId,template) {
  // Copy only creation metadata (lot, trame, technical attributes), never a
  // server resource ID, acknowledgement, creationId or upload payload.
  for(const [cle,valeur] of [[COPY_ORIGIN_KEY,String(sourceId)],[COPY_TEMPLATE_KEY,JSON.stringify(template||{})]]){
    await db.runAsync("INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,?,?,?,?,'texte')",[uuidv4(),type,targetId,cle,valeur]);
  }
}
async function siteTemplate(db,sourceId){
  const oldCopy=await db.getFirstAsync("SELECT valeur FROM attributs_libres WHERE entite_type='site' AND entite_id=? AND cle=?",[sourceId,COPY_TEMPLATE_KEY]);
  const ack=await db.getAllAsync("SELECT payload_json FROM api_structure_outbox WHERE resource_type='site' AND local_site_id=? AND status='synced'",[sourceId]);
  const links=await db.getAllAsync("SELECT payload_json FROM api_site_links WHERE local_site_id=? AND remote_present=1",[sourceId]);
  const remote=ack.length===1?parseCopyJson(ack[0].payload_json):links.length===1?parseCopyJson(links[0].payload_json):parseCopyJson(oldCopy?.valeur);
  return siteCreationTemplate(remote||{});
}
async function localTemplate(db,sourceSiteId,installationId){
  const oldCopy=await db.getFirstAsync("SELECT valeur FROM attributs_libres WHERE entite_type='installation' AND entite_id=? AND cle=?",[installationId,COPY_TEMPLATE_KEY]);
  const ack=await db.getAllAsync("SELECT payload_json FROM api_structure_outbox WHERE resource_type='local' AND local_site_id=? AND local_installation_id=? AND status='synced'",[sourceSiteId,installationId]);
  const links=await db.getAllAsync("SELECT l.reference_json,l.remote_trame_id FROM api_local_links l JOIN api_site_links s ON s.remote_site_id=l.remote_site_id WHERE l.local_installation_id=? AND s.local_site_id=? AND l.remote_present=1",[installationId,sourceSiteId]);
  if(ack.length===1)return localCreationTemplate(parseCopyJson(ack[0].payload_json)||{});
  if(links.length===1){const ref=parseCopyJson(links[0].reference_json)||{};return localCreationTemplate(ref.local||{},links[0].remote_trame_id||ref.trame?.id);}
  return localCreationTemplate(parseCopyJson(oldCopy?.valeur)||{});
}

export async function listerGroupesClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT g.*, COUNT(m.site_id) AS nb_sites
     FROM site_groupes g
     LEFT JOIN site_groupe_membres m ON m.groupe_id=g.id
     WHERE g.client_id=?
     GROUP BY g.id
     ORDER BY g.ordre, g.nom COLLATE NOCASE`,
    [clientId]
  );
}

export async function listerAppartenancesClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT m.groupe_id,m.site_id,g.nom groupe_nom
     FROM site_groupe_membres m
     JOIN site_groupes g ON g.id=m.groupe_id
     WHERE g.client_id=?
     ORDER BY g.ordre,g.nom COLLATE NOCASE`,
    [clientId]
  );
}

export async function creerGroupeSite(clientId, nom, description = null) {
  const propre = texte(nom);
  if (!propre) throw new Error('Le nom du groupe est requis.');
  const db = await getDb();
  const existant = await db.getFirstAsync(`SELECT id FROM site_groupes WHERE client_id=? AND lower(nom)=lower(?)`, [clientId, propre]);
  if (existant?.id) return existant.id;
  const id = uuidv4();
  await db.runAsync(`INSERT INTO site_groupes(id,client_id,nom,description) VALUES(?,?,?,?)`, [id, clientId, propre, texte(description) || null]);
  return id;
}

export async function renommerGroupeSite(groupeId, nom) {
  const propre = texte(nom);
  if (!propre) throw new Error('Le nom du groupe est requis.');
  const db = await getDb();
  await db.runAsync(`UPDATE site_groupes SET nom=?,modifie_le=datetime('now') WHERE id=?`, [propre, groupeId]);
}

export async function supprimerGroupeSite(groupeId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM site_groupes WHERE id=?`, [groupeId]);
}

export async function definirSiteDansGroupe(siteId, groupeId, actif) {
  const db = await getDb();
  if (actif) await db.runAsync(`INSERT OR IGNORE INTO site_groupe_membres(groupe_id,site_id) VALUES(?,?)`, [groupeId, siteId]);
  else await db.runAsync(`DELETE FROM site_groupe_membres WHERE groupe_id=? AND site_id=?`, [groupeId, siteId]);
}

export async function dupliquerSite(sourceSiteId, { nomSite = null, copierPatrimoine = true, copierLab3d = true, copierVisites = true } = {}) {
  const db = await getDb();
  const source = await db.getFirstAsync(`SELECT * FROM sites WHERE id=?`, [sourceSiteId]);
  if (!source) throw new Error('Site source introuvable.');
  const cibleId = uuidv4();
  const nomCible = texte(nomSite) || `${source.nom_site} - copie`;

  await db.runAsync('BEGIN IMMEDIATE');
  try {
    await insererClone(db, 'sites', source, { id: cibleId, nom_site: nomCible, statut: 'Actif' }, ['cree_le']);

    const memberships = await db.getAllAsync(`SELECT groupe_id FROM site_groupe_membres WHERE site_id=?`, [sourceSiteId]);
    for (const membre of memberships) await db.runAsync(`INSERT OR IGNORE INTO site_groupe_membres(groupe_id,site_id) VALUES(?,?)`, [membre.groupe_id, cibleId]);
    await clonerAttributs(db, 'site', sourceSiteId, cibleId);
    await recordCopy(db,'site',sourceSiteId,cibleId,await siteTemplate(db,sourceSiteId));

    const equipmentMap = new Map(),installationMap=new Map();
    const networkMap=new Map(),meterMap=new Map(),itemMap=new Map();
    if (copierPatrimoine) {
      const installations = await db.getAllAsync(`SELECT * FROM installations WHERE site_id=? ORDER BY cree_le,id`, [sourceSiteId]);
      for (const installation of installations) {
        const newInstallationId = uuidv4();
        installationMap.set(installation.id,newInstallationId);
        await insererClone(db, 'installations', installation, { id: newInstallationId, site_id: cibleId }, ['cree_le', 'modifie_le']);
        await clonerAttributs(db, 'installation', installation.id, newInstallationId);
        await recordCopy(db,'installation',installation.id,newInstallationId,await localTemplate(db,sourceSiteId,installation.id));

        const equipements = await db.getAllAsync(`SELECT * FROM equipements WHERE installation_id=? ORDER BY cree_le,id`, [installation.id]);
        for (const equipement of equipements) {
          const newEquipmentId = uuidv4();
          equipmentMap.set(equipement.id, newEquipmentId);
          await insererClone(db, 'equipements', equipement, { id: newEquipmentId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'equipement', equipement.id, newEquipmentId);
          const trames = await db.getAllAsync(`SELECT * FROM equipement_trames WHERE equipement_id=?`, [equipement.id]);
          for (const trame of trames) await insererClone(db, 'equipement_trames', trame, { equipement_id: newEquipmentId }, ['cree_le', 'modifie_le']);
        }

        const reseaux = await db.getAllAsync(`SELECT * FROM reseaux_site WHERE installation_id=? ORDER BY ordre,id`, [installation.id]);
        for (const reseau of reseaux) {
          const newReseauId = uuidv4();
          networkMap.set(reseau.id,newReseauId);
          await insererClone(db, 'reseaux_site', reseau, { id: newReseauId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'reseau', reseau.id, newReseauId);
        }

        const compteurs = await db.getAllAsync(`SELECT * FROM compteurs_site WHERE installation_id=? ORDER BY id`, [installation.id]);
        for (const compteur of compteurs) {
          const newCompteurId = uuidv4();
          meterMap.set(compteur.id,newCompteurId);
          await insererClone(db, 'compteurs_site', compteur, { id: newCompteurId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'compteur', compteur.id, newCompteurId);
        }
      }
    }

    const copyResult=copierPatrimoine&&copierVisites
      ?await cloneLatestVisitsForSite(db,sourceSiteId,cibleId,
        {installationMap,equipmentMap,networkMap,meterMap,itemMap},
        insererClone,clonerAttributs,uuidv4)
      :{visites:0};

    if (copierPatrimoine && copierLab3d) {
      const scene = await db.getFirstAsync(`SELECT * FROM lab3d_scenes WHERE site_id=?`, [sourceSiteId]);
      if (scene) {
        const newSceneId = uuidv4();
        const objectMap = new Map();
        await insererClone(db, 'lab3d_scenes', scene, { id: newSceneId, site_id: cibleId }, ['cree_le', 'modifie_le']);
        const objects = await db.getAllAsync(`SELECT * FROM lab3d_objects WHERE scene_id=?`, [scene.id]);
        for (const object of objects) {
          const newObjectId = uuidv4();
          objectMap.set(object.id, newObjectId);
          await insererClone(db, 'lab3d_objects', object, {
            id: newObjectId,
            scene_id: newSceneId,
            equipment_id: object.equipment_id ? (equipmentMap.get(object.equipment_id) || null) : null,
          }, ['cree_le', 'modifie_le']);
        }
        const networks = await db.getAllAsync(`SELECT * FROM lab3d_networks WHERE scene_id=?`, [scene.id]);
        for (const network of networks) await insererClone(db, 'lab3d_networks', network, { id: uuidv4(), scene_id: newSceneId }, ['cree_le', 'modifie_le']);
        const openings = await db.getAllAsync(`SELECT * FROM lab3d_openings WHERE scene_id=?`, [scene.id]);
        for (const opening of openings) await insererClone(db, 'lab3d_openings', opening, { id: uuidv4(), scene_id: newSceneId, wall_id: opening.wall_id ? (objectMap.get(opening.wall_id) || null) : null });
        const views = await db.getAllAsync(`SELECT * FROM lab3d_views WHERE scene_id=?`, [scene.id]);
        for (const view of views) await insererClone(db, 'lab3d_views', view, { id: uuidv4(), scene_id: newSceneId });
      }
    }

    // SQLite FK checks alone do not prove that two valid parent IDs refer to
    // the SAME site. Check the newly copied tree before committing.
    const wrong=await db.getFirstAsync(
      'SELECT v.id FROM visites v LEFT JOIN installations i ON i.id=v.installation_id WHERE v.site_id=? AND v.installation_id IS NOT NULL AND (i.id IS NULL OR i.site_id<>v.site_id) LIMIT 1',[cibleId]);
    if(wrong)throw Error('Duplication annulée : une visite copiée pointe vers un autre site.');
    for(const [oldId,newId] of installationMap){
      const row=await db.getFirstAsync('SELECT site_id FROM installations WHERE id=?',[newId]);
      if(newId===oldId||row?.site_id!==cibleId)throw Error('Duplication annulée : local non indépendant.');
    }
    await db.runAsync('COMMIT');
    return { siteId: cibleId, nomSite: nomCible, locauxCopies:installationMap.size, visitesCopiees:copyResult.visites };
  } catch (error) {
    await db.runAsync('ROLLBACK').catch(() => {});
    throw error;
  }
}
