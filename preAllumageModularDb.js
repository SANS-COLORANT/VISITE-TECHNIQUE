import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { PREALLUMAGE_PANELS, presetsPour } from './preAllumageTrame.js';
import { libelleChamp, libelleSection, listerAliasesPreAllumage } from './preAllumageAliases.js';
import { preparerStructurePreAllumage, remapperLocalVersRubriquesOfficielles } from './preAllumageStructureDb.js';

const CHAUFFERIE = 'chaufferie';
const SST = 'sous_station';
const PANELS_GLOBAUX = new Set(['p-pa-infos', 'p-pa-conclusion']);

// La clé historique Excel s'appelle encore « Nombre de sous-stations », mais
// METRA y stocke désormais le nombre réel de locaux, tous types confondus.
async function synchroniserNombreSst(db, visiteId) {
  const row = await db.getFirstAsync(`SELECT COUNT(*) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, 'pa-infos.informations_g_n_rales', 'Nombre de sous-stations', String(row?.n || 0)]
  );
}

function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function optionsChamp(field) {
  const { cle, type, presets, ...options } = field || {};
  return Object.keys(options).length ? JSON.stringify(options) : null;
}

function champDepuisLigne(row) {
  let options = {};
  try { options = row.options_json ? JSON.parse(row.options_json) : {}; } catch (_) { options = {}; }
  return {
    cle: row.cle_stockage,
    libelle: row.libelle,
    type: row.type_code,
    ...(row.type_code === 'controle' ? { preAllumage: true, poste: 'Pré-allumage', presets: presetsPour(row.libelle) } : {}),
    ...options,
  };
}

async function insererRubrique(db, { visiteId, localId = null, panelId, code, nom, ordre = 0, supprimable = 1, fields = [] }) {
  const id = createId('pa-rubrique');
  await db.runAsync(
    `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
     VALUES(?,?,?,?,?,?,?,?)`,
    [id, visiteId, localId, panelId, code, nom, ordre, supprimable]
  );
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    await db.runAsync(
      `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
       VALUES(?,?,?,?,?,?,?)`,
      [createId('pa-champ'), id, field.cle, field.libelle || field.cle, field.type || 'champ', i, optionsChamp(field)]
    );
  }
  return id;
}

export async function initialiserPreAllumageModulaire(visiteId) {
  const db = await getDb();
  const deja = await db.getFirstAsync(`SELECT id FROM pre_allumage_rubriques WHERE visite_id=? LIMIT 1`, [visiteId]);
  if (deja) return;

  const aliases = await listerAliasesPreAllumage(visiteId);
  // La trame Excel conserve toutes ses rubriques officielles, mais aucune zone
  // physique n'est créée dans l'application. Le technicien ajoute ensuite chaque
  // Chaufferie ou Sous-station réellement rencontrée et les rubriques compatibles
  // lui sont rattachées à ce moment-là.
  let ordreRubrique = 0;
  for (const [panelId, sections] of Object.entries(PREALLUMAGE_PANELS)) {
    for (const [nom, fields] of Object.entries(sections || {})) {
      await insererRubrique(db, {
        visiteId,
        localId: null,
        panelId,
        code: sectionCode(panelId, nom),
        nom: libelleSection(panelId, nom, aliases),
        ordre: ordreRubrique++,
        supprimable: panelId === 'p-pa-infos' ? 0 : 1,
        fields: fields.map((field) => ({ ...field, libelle: libelleChamp(sectionCode(panelId, nom), field.cle, aliases) })),
      });
    }
  }
  await synchroniserNombreSst(db, visiteId);
}

export async function chargerPreAllumageModulaire(visiteId) {
  await initialiserPreAllumageModulaire(visiteId);
  // Cette préparation est idempotente et s'exécute aussi avant rapports/exports :
  // les anciennes structures automatiques sont converties sans qu'il soit
  // nécessaire d'ouvrir d'abord l'écran Installations.
  await preparerStructurePreAllumage(visiteId);
  const db = await getDb();
  const [locaux, rubriquesBrutes, champs] = await Promise.all([
    db.getAllAsync(`SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]),
    db.getAllAsync(`SELECT * FROM pre_allumage_rubriques WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]),
    db.getAllAsync(
      `SELECT c.* FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
       WHERE r.visite_id=? ORDER BY r.ordre,c.ordre,c.cree_le`,
      [visiteId]
    ),
  ]);
  // Les rubriques officielles orphelines restent en base uniquement comme
  // cibles de mapping Excel. Elles ne doivent jamais créer de faux locaux ou
  // de pages vides dans l'application, le PDF, le Word ou la feuille modulaire.
  const rubriques = rubriquesBrutes.filter((r) => r.local_id || PANELS_GLOBAUX.has(r.panel_id));
  const visibles = new Set(rubriques.map((r) => r.id));
  const champsParRubrique = new Map();
  champs.forEach((row) => {
    if (!visibles.has(row.rubrique_id)) return;
    if (!champsParRubrique.has(row.rubrique_id)) champsParRubrique.set(row.rubrique_id, []);
    champsParRubrique.get(row.rubrique_id).push({ ...row, field: champDepuisLigne(row) });
  });
  return {
    locaux,
    rubriques: rubriques.map((r) => ({ ...r, champs: champsParRubrique.get(r.id) || [] })),
  };
}

function champsLocal(nom, typeCode, chauffage, ecs) {
  const compteurs = [
    { cle: `${nom} — Énergie (MWh)`, type: 'champ', numericIndex: true, renamable: true },
    { cle: `${nom} — ECS (m³)`, type: 'champ', numericIndex: true, renamable: true },
  ];
  const regulation = (PREALLUMAGE_PANELS['p-pa-regulation']?.['SST 1'] || []).map((f) => ({ ...f }));
  const heat = (PREALLUMAGE_PANELS['p-pa-sst']?.['SST 1 — Chauffage'] || []).map((f) => ({ ...f }));
  const water = (PREALLUMAGE_PANELS['p-pa-sst']?.['SST 1 — ECS / traitement d’eau'] || []).map((f) => ({ ...f }));
  return { compteurs: ecs ? compteurs : compteurs.slice(0, 1), regulation, heat: chauffage ? heat : [], water: ecs ? water : [], typeCode };
}

export async function ajouterLocalPreAllumage(visiteId, { nom, typeCode = SST, chauffage = true, ecs = true }) {
  await initialiserPreAllumageModulaire(visiteId);
  const db = await getDb();
  const propre = String(nom || '').trim();
  if (!propre) throw new Error('Le nom du local est obligatoire.');
  const existe = await db.getFirstAsync(`SELECT id FROM pre_allumage_locaux WHERE visite_id=? AND lower(nom)=lower(?)`, [visiteId, propre]);
  if (existe) throw new Error('Un local porte déjà ce nom.');
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
  const id = createId('pa-local');
  await db.runAsync(
    `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`,
    [id, visiteId, propre, typeCode, Number(max?.n || -1) + 1, chauffage ? 1 : 0, ecs ? 1 : 0]
  );
  const defs = champsLocal(propre, typeCode, chauffage, ecs);
  const baseOrdre = Date.now();
  await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-batiments', code: `pa.local.${id}.infos`, nom: propre, ordre: baseOrdre, fields: [
    { cle: 'Nombre de logements desservis', type: 'champ', stable: true },
    { cle: 'Bâtiments desservis', type: 'champ', stable: true },
    { cle: 'Situation / localisation', type: 'champ', stable: true },
  ] });
  await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-compteurs', code: `pa.local.${id}.compteurs`, nom: propre, ordre: baseOrdre + 1, fields: defs.compteurs });
  await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-regulation', code: `pa.local.${id}.regulation`, nom: propre, ordre: baseOrdre + 2, fields: defs.regulation });
  if (typeCode === CHAUFFERIE) {
    await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-chaufferie', code: `pa.local.${id}.tests`, nom: `${propre} — Tests`, ordre: baseOrdre + 3, fields: [
      { cle: 'Test allumage', type: 'controle' },
      { cle: 'Fonctionnement de la régulation', type: 'controle' },
    ] });
  } else {
    if (defs.heat.length) await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-sst', code: `pa.local.${id}.chauffage`, nom: `${propre} — Chauffage`, ordre: baseOrdre + 3, fields: defs.heat });
    if (defs.water.length) await insererRubrique(db, { visiteId, localId: id, panelId: 'p-pa-sst', code: `pa.local.${id}.ecs`, nom: `${propre} — ECS / traitement d’eau`, ordre: baseOrdre + 4, fields: defs.water });
    await remapperLocalVersRubriquesOfficielles(visiteId, id);
  }
  await synchroniserNombreSst(db, visiteId);
  return id;
}

export async function renommerLocalPreAllumage(localId, nom) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) return;
  const propre = String(nom || '').trim();
  if (!propre) throw new Error('Le nom du local est obligatoire.');
  const rubriques = await db.getAllAsync(`SELECT id,nom FROM pre_allumage_rubriques WHERE local_id=?`, [localId]);
  await db.runAsync(`UPDATE pre_allumage_locaux SET nom=?,modifie_le=datetime('now') WHERE id=?`, [propre, localId]);
  for (const r of rubriques) {
    const suffixe = String(r.nom).startsWith(`${local.nom} —`) ? String(r.nom).slice(String(local.nom).length) : '';
    await db.runAsync(`UPDATE pre_allumage_rubriques SET nom=?,modifie_le=datetime('now') WHERE id=?`, [`${propre}${suffixe}`, r.id]);
  }
}

export async function supprimerLocalPreAllumage(localId) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT visite_id FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) return;
  const rubriques = await db.getAllAsync(`SELECT id,section_code FROM pre_allumage_rubriques WHERE local_id=?`, [localId]);
  for (const rubrique of rubriques) {
    const code = rubrique.section_code;
    await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=?`, [local.visite_id, code]);
    await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code=?`, [local.visite_id, code]);
    if (!String(code || '').startsWith('pa.local.')) {
      await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=NULL,modifie_le=datetime('now') WHERE id=?`, [rubrique.id]);
    }
  }
  await db.runAsync(`DELETE FROM pre_allumage_locaux WHERE id=?`, [localId]);
  await synchroniserNombreSst(db, local.visite_id);
}

export async function ajouterRubriquePreAllumage(visiteId, panelId, nom) {
  const db = await getDb();
  const propre = String(nom || '').trim();
  if (!propre) throw new Error('Le nom de la rubrique est obligatoire.');
  return insererRubrique(db, { visiteId, panelId, code: `pa.rubrique.${createId('section')}`, nom: propre, ordre: Date.now(), fields: [] });
}

export async function renommerRubriquePreAllumage(id, nom) {
  const propre = String(nom || '').trim();
  if (!propre) return;
  await (await getDb()).runAsync(`UPDATE pre_allumage_rubriques SET nom=?,modifie_le=datetime('now') WHERE id=?`, [propre, id]);
}

export async function supprimerRubriquePreAllumage(id) {
  const db = await getDb();
  const r = await db.getFirstAsync(`SELECT visite_id,section_code FROM pre_allumage_rubriques WHERE id=?`, [id]);
  if (!r) return;
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=?`, [r.visite_id, r.section_code]);
  await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code=?`, [r.visite_id, r.section_code]);
  await db.runAsync(`DELETE FROM pre_allumage_rubriques WHERE id=?`, [id]);
}

export async function ajouterChampPreAllumage(rubriqueId, { libelle, type = 'champ', numericIndex = false }) {
  const db = await getDb();
  const propre = String(libelle || '').trim();
  if (!propre) throw new Error('Le nom du champ est obligatoire.');
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_champs WHERE rubrique_id=?`, [rubriqueId]);
  const id = createId('pa-champ');
  await db.runAsync(
    `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json) VALUES(?,?,?,?,?,?,?)`,
    [id, rubriqueId, createId('champ'), propre, type, Number(max?.n || -1) + 1, numericIndex ? JSON.stringify({ numericIndex: true, renamable: true }) : null]
  );
  return id;
}

export async function renommerChampPreAllumage(id, libelle) {
  const propre = String(libelle || '').trim();
  if (!propre) return;
  await (await getDb()).runAsync(`UPDATE pre_allumage_champs SET libelle=?,modifie_le=datetime('now') WHERE id=?`, [propre, id]);
}

export async function supprimerChampPreAllumage(id) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT c.cle_stockage,r.visite_id,r.section_code FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id WHERE c.id=?`,
    [id]
  );
  if (!row) return;
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [row.visite_id, row.section_code, row.cle_stockage]);
  await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code=? AND cle=?`, [row.visite_id, row.section_code, row.cle_stockage]);
  await db.runAsync(`DELETE FROM pre_allumage_champs WHERE id=?`, [id]);
}

export function rubriquesVersSections(rubriques, panelId) {
  return (rubriques || []).filter((r) => r.panel_id === panelId).map((r) => ({
    ...r,
    title: r.nom,
    sectionCode: r.section_code,
    fields: r.champs.map((c) => ({ ...c.field, displayLabel: c.libelle, modularFieldId: c.id })),
  }));
}

export const PREALLUMAGE_TYPES_LOCAUX = Object.freeze([
  { code: SST, label: 'Sous-station / SST' },
  { code: CHAUFFERIE, label: 'Chaufferie' },
]);
