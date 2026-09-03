import { getDb, uuidv4 } from './db.js';

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
    await insererClone(db, 'attributs_libres', row, { id: uuidv4(), entite_id: cibleId }, ['cree_le', 'modifie_le']);
  }
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
  if (actif) {
    await db.runAsync(`INSERT OR IGNORE INTO site_groupe_membres(groupe_id,site_id) VALUES(?,?)`, [groupeId, siteId]);
  } else {
    await db.runAsync(`DELETE FROM site_groupe_membres WHERE groupe_id=? AND site_id=?`, [groupeId, siteId]);
  }
}

export async function dupliquerSite(sourceSiteId, { nomSite = null, copierPatrimoine = true, copierLab3d = true } = {}) {
  const db = await getDb();
  const source = await db.getFirstAsync(`SELECT * FROM sites WHERE id=?`, [sourceSiteId]);
  if (!source) throw new Error('Site source introuvable.');
  const cibleId = uuidv4();
  const nomCible = texte(nomSite) || `${source.nom_site} - copie`;

  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await insererClone(db, 'sites', source, {
      id: cibleId,
      nom_site: nomCible,
      statut: 'Actif',
    }, ['cree_le']);

    const memberships = await db.getAllAsync(`SELECT groupe_id FROM site_groupe_membres WHERE site_id=?`, [sourceSiteId]);
    for (const membre of memberships) {
      await db.runAsync(`INSERT OR IGNORE INTO site_groupe_membres(groupe_id,site_id) VALUES(?,?)`, [membre.groupe_id, cibleId]);
    }
    await clonerAttributs(db, 'site', sourceSiteId, cibleId);

    const equipmentMap = new Map();
    if (copierPatrimoine) {
      const installations = await db.getAllAsync(`SELECT * FROM installations WHERE site_id=? ORDER BY cree_le,id`, [sourceSiteId]);
      for (const installation of installations) {
        const newInstallationId = uuidv4();
        await insererClone(db, 'installations', installation, { id: newInstallationId, site_id: cibleId }, ['cree_le', 'modifie_le']);
        await clonerAttributs(db, 'installation', installation.id, newInstallationId);

        const equipements = await db.getAllAsync(`SELECT * FROM equipements WHERE installation_id=? ORDER BY cree_le,id`, [installation.id]);
        for (const equipement of equipements) {
          const newEquipmentId = uuidv4();
          equipmentMap.set(equipement.id, newEquipmentId);
          await insererClone(db, 'equipements', equipement, { id: newEquipmentId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'equipement', equipement.id, newEquipmentId);
          const trames = await db.getAllAsync(`SELECT * FROM equipement_trames WHERE equipement_id=?`, [equipement.id]);
          for (const trame of trames) {
            await insererClone(db, 'equipement_trames', trame, { equipement_id: newEquipmentId }, ['cree_le', 'modifie_le']);
          }
        }

        const reseaux = await db.getAllAsync(`SELECT * FROM reseaux_site WHERE installation_id=? ORDER BY ordre,id`, [installation.id]);
        for (const reseau of reseaux) {
          const newReseauId = uuidv4();
          await insererClone(db, 'reseaux_site', reseau, { id: newReseauId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'reseau', reseau.id, newReseauId);
        }

        const compteurs = await db.getAllAsync(`SELECT * FROM compteurs_site WHERE installation_id=? ORDER BY id`, [installation.id]);
        for (const compteur of compteurs) {
          const newCompteurId = uuidv4();
          await insererClone(db, 'compteurs_site', compteur, { id: newCompteurId, installation_id: newInstallationId }, ['cree_le', 'modifie_le']);
          await clonerAttributs(db, 'compteur', compteur.id, newCompteurId);
        }
      }
    }

    if (copierPatrimoine && copierLab3d) {
      const scene = await db.getFirstAsync(`SELECT * FROM lab3d_scenes WHERE site_id=?`, [sourceSiteId]);
      if (scene) {
        const newSceneId = uuidv4();
        await insererClone(db, 'lab3d_scenes', scene, { id: newSceneId, site_id: cibleId }, ['cree_le', 'modifie_le']);
        const objects = await db.getAllAsync(`SELECT * FROM lab3d_objects WHERE scene_id=?`, [scene.id]);
        for (const object of objects) {
          await insererClone(db, 'lab3d_objects', object, {
            id: uuidv4(),
            scene_id: newSceneId,
            equipment_id: object.equipment_id ? (equipmentMap.get(object.equipment_id) || null) : null,
          }, ['cree_le', 'modifie_le']);
        }
        const networks = await db.getAllAsync(`SELECT * FROM lab3d_networks WHERE scene_id=?`, [scene.id]);
        for (const network of networks) await insererClone(db, 'lab3d_networks', network, { id: uuidv4(), scene_id: newSceneId }, ['cree_le', 'modifie_le']);
        const openings = await db.getAllAsync(`SELECT * FROM lab3d_openings WHERE scene_id=?`, [scene.id]);
        for (const opening of openings) await insererClone(db, 'lab3d_openings', opening, { id: uuidv4(), scene_id: newSceneId });
        const views = await db.getAllAsync(`SELECT * FROM lab3d_views WHERE scene_id=?`, [scene.id]);
        for (const view of views) await insererClone(db, 'lab3d_views', view, { id: uuidv4(), scene_id: newSceneId });
      }
    }

    await db.execAsync('COMMIT');
    return { siteId: cibleId, nomSite: nomCible };
  } catch (error) {
    await db.execAsync('ROLLBACK').catch(() => {});
    throw error;
  }
}
