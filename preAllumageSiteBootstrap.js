import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { ajouterLocalPreAllumage } from './preAllumageModularDb.js';
import { ajouterEquipementControlePreAllumage } from './preAllumageBusinessDb.js';

const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function typeEquipementControle(equipement) {
  const texte = norm([
    equipement?.type_code,
    equipement?.designation,
    equipement?.marque,
    equipement?.modele,
  ].filter(Boolean).join(' '));

  if (/chaudiere/.test(texte)) return 'chaudiere';
  if (/bruleur/.test(texte)) return 'bruleur';
  if (/pompe.*doseuse|doseuse.*pompe/.test(texte)) return 'pompe_doseuse';
  if (/adoucisseur/.test(texte)) return 'adoucisseur';
  if (/traitement.*eau/.test(texte)) return 'traitement_eau';
  if (/ballon.*ecs|ecs.*ballon/.test(texte)) return 'ballon_ecs';
  if (/echangeur/.test(texte)) return 'echangeur';
  if (/circulateur/.test(texte)) return 'circulateur';
  if (/pompe/.test(texte) && /bouclage.*ecs|ecs.*bouclage/.test(texte)) return 'pompe_bouclage_ecs';
  if (/pompe/.test(texte) && /primaire.*ecs|ecs.*primaire/.test(texte)) return 'pompe_primaire_ecs';
  if (/pompe/.test(texte) && /chauffage/.test(texte)) return 'pompe_chauffage';
  if (/pompe/.test(texte)) return 'pompe';
  if (/vanne/.test(texte) && /(3|trois).*voies/.test(texte) && /ecs/.test(texte)) return 'vanne_3_voies_ecs';
  if (/vanne/.test(texte) && /(3|trois).*voies/.test(texte) && /chauffage/.test(texte)) return 'vanne_3_voies_chauffage';
  if (/vanne/.test(texte) && /(3|trois).*voies/.test(texte)) return 'vanne_3_voies';
  if (/servomoteur/.test(texte)) return 'servomoteur';
  if (/regulat/.test(texte) && /ecs/.test(texte)) return 'regulation_ecs';
  if (/regulat/.test(texte) && /chauffage/.test(texte)) return 'regulation_chauffage';
  if (/regulat/.test(texte)) return 'regulation';
  return null;
}

function nomEquipement(equipement, typeCode) {
  const designation = String(equipement?.designation || '').trim();
  if (designation) return designation;
  const type = String(equipement?.type_code || '').trim();
  if (type) return type;
  return typeCode;
}

async function listerEquipementsSite(db, siteId) {
  if (!siteId) return [];
  return db.getAllAsync(
    `SELECT e.*, i.type_code AS installation_type, i.nom AS installation_nom, i.description AS installation_description
     FROM equipements e
     JOIN installations i ON i.id=e.installation_id
     WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'
     ORDER BY e.cree_le,e.id`,
    [siteId]
  );
}

async function contexteSite(db, visiteId) {
  return db.getFirstAsync(
    `SELECT v.id,v.site_id,COALESCE(v.trame_id,'icpe_v1') AS trame_id,s.nom_site
     FROM visites v JOIN sites s ON s.id=v.site_id
     WHERE v.id=?`,
    [visiteId]
  );
}

async function cloneRubriquesEquipements(db, visiteId, sourceLocalId, cibleLocalId) {
  const rubriques = await db.getAllAsync(
    `SELECT * FROM pre_allumage_rubriques
     WHERE local_id=? AND section_code LIKE '%.equip.%'
     ORDER BY ordre,cree_le`,
    [sourceLocalId]
  );
  let copies = 0;
  for (const source of rubriques || []) {
    const champs = await db.getAllAsync(
      `SELECT * FROM pre_allumage_champs WHERE rubrique_id=? ORDER BY ordre,cree_le`,
      [source.id]
    );
    const rubriqueId = createId('pa-rubrique');
    const match = String(source.section_code || '').match(/\.equip\.([^.]+)/);
    const typeCode = match?.[1] || 'autre';
    const sectionCode = `pa.local.${cibleLocalId}.equip.${typeCode}.${createId('eq').replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;
    await db.runAsync(
      `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
       VALUES(?,?,?,?,?,?,?,1)`,
      [rubriqueId, visiteId, cibleLocalId, source.panel_id, sectionCode, source.nom, Number(source.ordre || Date.now())]
    );
    for (const champ of champs || []) {
      await db.runAsync(
        `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
         VALUES(?,?,?,?,?,?,?)`,
        [createId('pa-champ'), rubriqueId, champ.cle_stockage, champ.libelle, champ.type_code, champ.ordre, champ.options_json]
      );
    }
    copies += 1;
  }
  return copies;
}

async function restaurerDepuisVisitePrecedente(db, visiteId, siteId) {
  const precedente = await db.getFirstAsync(
    `SELECT v.id
     FROM visites v
     WHERE v.site_id=? AND v.id<>? AND COALESCE(v.trame_id,'icpe_v1')='pre_allumage'
       AND EXISTS(SELECT 1 FROM pre_allumage_locaux l WHERE l.visite_id=v.id)
     ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC
     LIMIT 1`,
    [siteId, visiteId]
  );
  if (!precedente?.id) return 0;

  const sources = await db.getAllAsync(
    `SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`,
    [precedente.id]
  );
  let crees = 0;
  for (const source of sources || []) {
    const cibleId = await ajouterLocalPreAllumage(visiteId, {
      nom: source.nom,
      typeCode: source.type_code || 'sous_station',
      chauffage: Number(source.chauffage) !== 0,
      ecs: Number(source.ecs) !== 0,
      primaire: source.type_code === 'chaufferie' && Number(source.primaire) !== 0,
    });
    const copies = await cloneRubriquesEquipements(db, visiteId, source.id, cibleId);
    if (source.type_code === 'chaufferie' && copies > 0) {
      await db.runAsync(
        `DELETE FROM pre_allumage_rubriques WHERE visite_id=? AND local_id=? AND section_code=?`,
        [visiteId, cibleId, `pa.local.${cibleId}.tests`]
      );
    }
    crees += 1;
  }
  return crees;
}

function siteSembleChaufferie(contexte, equipements) {
  const texte = norm([
    contexte?.nom_site,
    ...(equipements || []).flatMap((e) => [
      e.installation_type,
      e.installation_nom,
      e.installation_description,
      e.type_code,
      e.designation,
    ]),
  ].filter(Boolean).join(' '));
  return /chauffer|chaudiere|bruleur/.test(texte);
}

function siteSembleSousStation(contexte, equipements) {
  const texte = norm([
    contexte?.nom_site,
    ...(equipements || []).flatMap((e) => [e.installation_type, e.installation_nom, e.installation_description]),
  ].filter(Boolean).join(' '));
  return /sous[ -]?station|\bsst\b/.test(texte);
}

async function ajouterEquipementsPatrimoine(visiteId, localId, equipements) {
  let ajoutes = 0;
  for (const equipement of equipements || []) {
    const typeCode = typeEquipementControle(equipement);
    if (!typeCode) continue;
    await ajouterEquipementControlePreAllumage(
      visiteId,
      localId,
      typeCode,
      nomEquipement(equipement, typeCode),
      null
    );
    ajoutes += 1;
  }
  return ajoutes;
}

async function assurerControlesChaufferie(db, visiteId, siteId, local) {
  const compte = await db.getFirstAsync(
    `SELECT COUNT(*) n
     FROM pre_allumage_champs c
     JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
     WHERE r.local_id=? AND c.type_code='controle'`,
    [local.id]
  );
  if (Number(compte?.n || 0) > 0) return 0;

  const equipements = await listerEquipementsSite(db, siteId);
  const ajoutes = await ajouterEquipementsPatrimoine(visiteId, local.id, equipements);
  if (ajoutes > 0) return ajoutes;

  const rubriqueId = createId('pa-rubrique');
  const code = `pa.local.${local.id}.tests`;
  await db.runAsync(
    `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
     VALUES(?,?,?,?,?,?,?,0)`,
    [rubriqueId, visiteId, local.id, 'p-pa-chaufferie', code, `${local.nom || 'Chaufferie'} — Contrôles généraux`, Date.now()]
  );
  for (const [ordre, cle] of ['Test allumage', 'Fonctionnement de la régulation'].entries()) {
    await db.runAsync(
      `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
       VALUES(?,?,?,?,?,?,NULL)`,
      [createId('pa-champ'), rubriqueId, cle, cle, 'controle', ordre]
    );
  }
  return 1;
}

export async function assurerStructureSitePreAllumage(visiteId) {
  if (!visiteId) return { locauxCrees: 0, controlesCrees: 0 };
  const db = await getDb();
  const contexte = await contexteSite(db, visiteId);
  if (!contexte || contexte.trame_id !== 'pre_allumage') return { locauxCrees: 0, controlesCrees: 0 };

  let locaux = await db.getAllAsync(
    `SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`,
    [visiteId]
  );
  let locauxCrees = 0;

  if (!locaux.length) {
    locauxCrees = await restaurerDepuisVisitePrecedente(db, visiteId, contexte.site_id);
    if (!locauxCrees) {
      const equipements = await listerEquipementsSite(db, contexte.site_id);
      if (siteSembleChaufferie(contexte, equipements)) {
        const texteEcs = norm(equipements.map((e) => [e.type_code, e.designation].filter(Boolean).join(' ')).join(' '));
        const localId = await ajouterLocalPreAllumage(visiteId, {
          nom: 'Chaufferie',
          typeCode: 'chaufferie',
          chauffage: true,
          ecs: /ecs|ballon|echangeur|adouc|doseuse|traitement/.test(texteEcs),
          primaire: false,
        });
        await ajouterEquipementsPatrimoine(visiteId, localId, equipements);
        locauxCrees = 1;
      } else if (siteSembleSousStation(contexte, equipements)) {
        await ajouterLocalPreAllumage(visiteId, {
          nom: 'Sous-station',
          typeCode: 'sous_station',
          chauffage: true,
          ecs: /ecs|ballon|echangeur/.test(norm(equipements.map((e) => e.designation).join(' '))),
          primaire: false,
        });
        locauxCrees = 1;
      }
    }
    locaux = await db.getAllAsync(
      `SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`,
      [visiteId]
    );
  }

  let controlesCrees = 0;
  for (const local of locaux || []) {
    if (local.type_code === 'chaufferie') {
      controlesCrees += await assurerControlesChaufferie(db, visiteId, contexte.site_id, local);
    }
  }
  return { locauxCrees, controlesCrees };
}
