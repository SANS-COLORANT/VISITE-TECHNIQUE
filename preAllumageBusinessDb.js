import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { supprimerRemarqueControle } from './remarkDb.js';

const DEFAULT_LOCAL_NAMES = new Set([
  ...Array.from({ length: 10 }, (_, i) => `SST ${i + 1}`),
  'Centre commercial',
  'Église',
]);

export const PREALLUMAGE_CHAUFFERIE_EQUIPMENT_TYPES = Object.freeze([
  {
    code: 'chaudiere', label: 'Chaudière',
    controls: ['Test allumage', 'Présence des flammes', 'Augmentation de la température de l’eau en sortie de chaudière'],
  },
  {
    code: 'bruleur', label: 'Brûleur',
    controls: ['Test allumage', 'Ouverture de l’électrovanne gaz / alimentation gaz', 'Fonctionnement de l’électrode d’allumage'],
  },
  { code: 'pompe', label: 'Pompe', controls: ['Fonctionnement de la pompe'] },
  { code: 'circulateur', label: 'Circulateur', controls: ['Fonctionnement du circulateur'] },
  { code: 'vanne_3_voies', label: 'Vanne trois voies', controls: ['Ouverture / fermeture vanne trois voies'] },
  { code: 'servomoteur', label: 'Servomoteur', controls: ['Fonctionnement du servomoteur'] },
  { code: 'regulation', label: 'Régulation', controls: ['Fonctionnement de la régulation'] },
  { code: 'echangeur', label: 'Échangeur', controls: ['État et fonctionnement de l’échangeur'] },
  { code: 'autre', label: 'Autre équipement', controls: ['État / fonctionnement'] },
]);

async function sectionContientDonnees(db, visiteId, sectionCode) {
  const champ = await db.getFirstAsync(
    `SELECT 1 ok FROM champs_visite WHERE visite_id=? AND section_code=? AND valeur IS NOT NULL AND trim(valeur)<>'' LIMIT 1`,
    [visiteId, sectionCode]
  );
  if (champ?.ok) return true;
  const controle = await db.getFirstAsync(
    `SELECT 1 ok FROM controles_visite WHERE visite_id=? AND section_code=? AND (avis IS NOT NULL OR (commentaire IS NOT NULL AND trim(commentaire)<>'')) LIMIT 1`,
    [visiteId, sectionCode]
  );
  return Boolean(controle?.ok);
}

async function localContientDonnees(db, visiteId, localId) {
  const rubriques = await db.getAllAsync(`SELECT section_code FROM pre_allumage_rubriques WHERE local_id=?`, [localId]);
  for (const rubrique of rubriques || []) {
    if (await sectionContientDonnees(db, visiteId, rubrique.section_code)) return true;
  }
  return false;
}

export async function synchroniserNombreLocauxPreAllumage(visiteId) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT COUNT(*) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
  const value = String(row?.n || 0);
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, 'pa-infos.informations_g_n_rales', 'Nombre de sous-stations', value]
  );
  return Number(row?.n || 0);
}

export async function normaliserLocauxPreAllumage(visiteId) {
  const db = await getDb();
  const locaux = await db.getAllAsync(`SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]);
  if (locaux.length && locaux.every((l) => DEFAULT_LOCAL_NAMES.has(String(l.nom || '').trim()))) {
    let contientDonnees = false;
    for (const local of locaux) {
      if (await localContientDonnees(db, visiteId, local.id)) { contientDonnees = true; break; }
    }
    if (!contientDonnees) {
      for (const local of locaux) await db.runAsync(`DELETE FROM pre_allumage_locaux WHERE id=?`, [local.id]);
    }
  }

  const chaufferie = await db.getFirstAsync(
    `SELECT * FROM pre_allumage_locaux WHERE visite_id=? AND type_code='chaufferie' ORDER BY ordre LIMIT 1`,
    [visiteId]
  );
  if (!chaufferie) {
    const orphelines = await db.getAllAsync(
      `SELECT * FROM pre_allumage_rubriques WHERE visite_id=? AND local_id IS NULL AND panel_id='p-pa-chaufferie' ORDER BY ordre`,
      [visiteId]
    );
    const avecDonnees = [];
    for (const r of orphelines || []) {
      if (await sectionContientDonnees(db, visiteId, r.section_code)) avecDonnees.push(r);
    }
    if (avecDonnees.length) {
      const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
      const id = createId('pa-local');
      await db.runAsync(
        `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`,
        [id, visiteId, 'Chaufferie', 'chaufferie', Number(max?.n || -1) + 1, 1, 1]
      );
      for (const r of avecDonnees) await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=? WHERE id=?`, [id, r.id]);
    }
  }
  return synchroniserNombreLocauxPreAllumage(visiteId);
}

export async function rattacherDonneesGeneralesChaufferie(visiteId, localId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE pre_allumage_rubriques SET local_id=?,modifie_le=datetime('now')
     WHERE visite_id=? AND local_id IS NULL AND panel_id='p-pa-compteurs' AND lower(nom) LIKE '%général%'`,
    [localId, visiteId]
  );
}

function definitionEquipement(typeCode) {
  return PREALLUMAGE_CHAUFFERIE_EQUIPMENT_TYPES.find((x) => x.code === typeCode)
    || PREALLUMAGE_CHAUFFERIE_EQUIPMENT_TYPES[PREALLUMAGE_CHAUFFERIE_EQUIPMENT_TYPES.length - 1];
}

export async function ajouterEquipementChaufferiePreAllumage(visiteId, localId, typeCode, nomPersonnalise = null) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=? AND visite_id=?`, [localId, visiteId]);
  if (!local || local.type_code !== 'chaufferie') throw new Error('Sélectionnez une chaufferie.');
  const def = definitionEquipement(typeCode);
  const rubriques = await db.getAllAsync(
    `SELECT nom,section_code FROM pre_allumage_rubriques WHERE local_id=? AND section_code LIKE ?`,
    [localId, `pa.local.${localId}.equip.${def.code}.%`]
  );
  const numero = (rubriques?.length || 0) + 1;
  const nom = String(nomPersonnalise || '').trim() || `${def.label} n°${numero}`;
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),0) n FROM pre_allumage_rubriques WHERE visite_id=?`, [visiteId]);
  const rubriqueId = createId('pa-rubrique');
  const sectionCode = `pa.local.${localId}.equip.${def.code}.${createId('eq').replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;
  await db.runAsync(
    `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
     VALUES(?,?,?,?,?,?,?,1)`,
    [rubriqueId, visiteId, localId, 'p-pa-chaufferie', sectionCode, nom, Number(max?.n || 0) + 1]
  );
  for (let i = 0; i < def.controls.length; i += 1) {
    const cle = def.controls[i];
    await db.runAsync(
      `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
       VALUES(?,?,?,?,?,?,?)`,
      [createId('pa-champ'), rubriqueId, cle, cle, 'controle', i, JSON.stringify({ preAllumage: true, poste: def.label })]
    );
  }
  return { rubriqueId, sectionCode, nom, typeCode: def.code };
}

export function estRubriqueEquipementChaufferie(rubrique) {
  return Boolean(rubrique?.panel_id === 'p-pa-chaufferie' && /\.equip\./.test(String(rubrique?.section_code || '')));
}

export async function supprimerEquipementChaufferiePreAllumage(rubriqueId) {
  const db = await getDb();
  const r = await db.getFirstAsync(`SELECT visite_id,section_code FROM pre_allumage_rubriques WHERE id=?`, [rubriqueId]);
  if (!r) return;
  const controls = await db.getAllAsync(`SELECT cle_stockage FROM pre_allumage_champs WHERE rubrique_id=? AND type_code='controle'`, [rubriqueId]);
  for (const c of controls || []) await supprimerRemarqueControle(r.visite_id, `${r.section_code}||${c.cle_stockage}`);
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=?`, [r.visite_id, r.section_code]);
  await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code=?`, [r.visite_id, r.section_code]);
  await db.runAsync(`DELETE FROM pre_allumage_rubriques WHERE id=?`, [rubriqueId]);
}
