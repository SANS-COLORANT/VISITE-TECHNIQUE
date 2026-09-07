import { getDb } from './db.js';
import { createId } from './database/ids.js';

export const PREALLUMAGE_COUNTER_UNITS = Object.freeze([
  'MWh', 'kWh', 'Wh', 'GJ', 'MJ', 'm³', 'Nm³', 'L', 'h', 'kg', 't',
]);

export const PREALLUMAGE_COUNTER_PRESETS = Object.freeze([
  { code: 'energie_thermique', label: 'Énergie thermique', unit: 'MWh', units: ['MWh', 'kWh', 'GJ'] },
  { code: 'reseau_chaleur', label: 'Réseau de chaleur', unit: 'MWh', units: ['MWh', 'kWh', 'GJ'] },
  { code: 'gaz', label: 'Gaz', unit: 'm³', units: ['m³', 'Nm³', 'kWh', 'MWh'] },
  { code: 'ecs', label: 'ECS', unit: 'm³', units: ['m³', 'L'] },
  { code: 'eau_froide', label: 'Eau froide', unit: 'm³', units: ['m³', 'L'] },
  { code: 'electricite', label: 'Électricité', unit: 'kWh', units: ['kWh', 'MWh', 'Wh'] },
  { code: 'fioul', label: 'Fioul', unit: 'L', units: ['L', 'm³'] },
  { code: 'biomasse', label: 'Biomasse', unit: 't', units: ['t', 'kg'] },
  { code: 'horaire', label: 'Compteur horaire', unit: 'h', units: ['h'] },
  { code: 'autre', label: 'Autre compteur', unit: '', units: PREALLUMAGE_COUNTER_UNITS },
]);

function options(row) {
  try { return row?.options_json ? JSON.parse(row.options_json) : {}; }
  catch (_) { return {}; }
}

function sansUnite(label = '') {
  return String(label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function preset(code) {
  return PREALLUMAGE_COUNTER_PRESETS.find((item) => item.code === code)
    || PREALLUMAGE_COUNTER_PRESETS[PREALLUMAGE_COUNTER_PRESETS.length - 1];
}

async function rubriqueCompteurs(db, visiteId, localId) {
  let rubrique = await db.getFirstAsync(
    `SELECT * FROM pre_allumage_rubriques
     WHERE visite_id=? AND local_id=? AND panel_id='p-pa-compteurs'
     ORDER BY ordre,cree_le LIMIT 1`,
    [visiteId, localId]
  );
  if (rubrique) return rubrique;

  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=? AND visite_id=?`, [localId, visiteId]);
  if (!local) throw new Error('Sélectionnez un local avant d’ajouter un compteur.');
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),0) n FROM pre_allumage_rubriques WHERE visite_id=?`, [visiteId]);
  const id = createId('pa-rubrique');
  const sectionCode = `pa.local.${localId}.compteurs`;
  await db.runAsync(
    `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
     VALUES(?,?,?,?,?,?,?,1)`,
    [id, visiteId, localId, 'p-pa-compteurs', sectionCode, local.nom || 'Compteurs', Number(max?.n || 0) + 1]
  );
  rubrique = await db.getFirstAsync(`SELECT * FROM pre_allumage_rubriques WHERE id=?`, [id]);
  return rubrique;
}

export async function ajouterCompteurPreAllumage(visiteId, localId, { presetCode = 'energie_thermique', nom = '', unite = '' } = {}) {
  const db = await getDb();
  const rubrique = await rubriqueCompteurs(db, visiteId, localId);
  const def = preset(presetCode);
  const unit = String(unite || def.unit || '').trim();
  const baseLabel = String(nom || '').trim() || def.label;
  if (!baseLabel) throw new Error('Le nom du compteur est obligatoire.');

  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_champs WHERE rubrique_id=?`, [rubrique.id]);
  const champId = createId('pa-champ');
  const cle = `Compteur ${def.code} ${createId('ctr').replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;
  const libelle = unit ? `${baseLabel} (${unit})` : baseLabel;
  const unitOptions = [...new Set([...(def.units || []), ...PREALLUMAGE_COUNTER_UNITS, unit].filter(Boolean))];
  const meta = {
    numericIndex: true,
    renamable: true,
    dynamicCounter: true,
    counterPreset: def.code,
    counterBaseLabel: baseLabel,
    unit,
    unitEditable: true,
    unitOptions,
  };
  await db.runAsync(
    `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
     VALUES(?,?,?,?,?,?,?)`,
    [champId, rubrique.id, cle, libelle, 'champ', Number(max?.n || -1) + 1, JSON.stringify(meta)]
  );
  return { champId, rubriqueId: rubrique.id, sectionCode: rubrique.section_code, cle, libelle, unit };
}

export async function mettreAJourUniteCompteurPreAllumage(champId, unite) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT * FROM pre_allumage_champs WHERE id=?`, [champId]);
  if (!row) throw new Error('Compteur introuvable.');
  const meta = options(row);
  const unit = String(unite || '').trim();
  const baseLabel = String(meta.counterBaseLabel || sansUnite(row.libelle) || row.cle_stockage || 'Compteur').trim();
  const unitOptions = [...new Set([...(meta.unitOptions || []), ...PREALLUMAGE_COUNTER_UNITS, unit].filter(Boolean))];
  const next = {
    ...meta,
    numericIndex: true,
    counterBaseLabel: baseLabel,
    unit,
    unitEditable: true,
    unitOptions,
  };
  const libelle = unit ? `${baseLabel} (${unit})` : baseLabel;
  await db.runAsync(
    `UPDATE pre_allumage_champs SET libelle=?,options_json=? WHERE id=?`,
    [libelle, JSON.stringify(next), champId]
  );
  return { champId, libelle, unit };
}

export async function supprimerCompteurPreAllumage(champId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT c.*,r.visite_id,r.section_code
     FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
     WHERE c.id=?`,
    [champId]
  );
  if (!row) return;
  const meta = options(row);
  if (!meta.dynamicCounter) throw new Error('Seuls les compteurs ajoutés manuellement peuvent être supprimés.');
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [row.visite_id, row.section_code, row.cle_stockage]);
  await db.runAsync(`DELETE FROM pre_allumage_champs WHERE id=?`, [champId]);
}
