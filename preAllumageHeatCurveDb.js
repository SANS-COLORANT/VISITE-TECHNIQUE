import { getDb, upsertChamp } from './db.js';
import { createId } from './database/ids.js';

const BASE_KEYS = Object.freeze([
  'Courbe de chauffe — Pour -7°C (°C)',
  'Courbe de chauffe — Pour 12°C (°C)',
  'Courbe de chauffe — Pour 19°C (°C)',
]);
const BASE_OUTDOOR = Object.freeze([-7, 12, 19]);

function nombre(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatNombre(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  return String(rounded).replace('.', ',');
}

function parseOptions(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function temperatureDepuisLibelle(texte) {
  const match = String(texte || '').match(/Courbe de chauffe.*Pour\s*(-?\d+(?:[.,]\d+)?)\s*°?C/i);
  return match ? nombre(match[1]) : null;
}

function estPointCourbe(row) {
  const options = parseOptions(row?.options_json);
  return options.heatCurvePoint === true || temperatureDepuisLibelle(`${row?.libelle || ''} ${row?.cle_stockage || ''}`) !== null;
}

function estPointBase(row) {
  if (BASE_KEYS.includes(row?.cle_stockage)) return true;
  return parseOptions(row?.options_json).heatCurveBase === true;
}

function temperatureExterieure(row) {
  const options = parseOptions(row?.options_json);
  const optionValue = nombre(options.outdoorTemperature);
  if (optionValue !== null) return optionValue;
  const fromLabel = temperatureDepuisLibelle(`${row?.libelle || ''} ${row?.cle_stockage || ''}`);
  if (fromLabel !== null) return fromLabel;
  const idx = BASE_KEYS.indexOf(row?.cle_stockage);
  return idx >= 0 ? BASE_OUTDOOR[idx] : 0;
}

function libellePoint(x) {
  return `Courbe de chauffe — Pour ${formatNombre(x)}°C (°C)`;
}

async function rubriqueRegulation(db, visiteId, sectionCode) {
  return db.getFirstAsync(
    `SELECT id,visite_id,local_id,section_code FROM pre_allumage_rubriques
     WHERE visite_id=? AND section_code=? AND panel_id='p-pa-regulation' LIMIT 1`,
    [visiteId, sectionCode]
  );
}

async function reordonnerPoints(db, rubriqueId) {
  const rows = await db.getAllAsync(`SELECT * FROM pre_allumage_champs WHERE rubrique_id=? ORDER BY ordre,cree_le`, [rubriqueId]);
  const courbe = rows.filter(estPointCourbe).sort((a, b) => temperatureExterieure(a) - temperatureExterieure(b));
  const autres = rows.filter((r) => !estPointCourbe(r));
  let ordre = 0;
  for (const row of [...courbe, ...autres]) {
    if (Number(row.ordre) !== ordre) await db.runAsync(`UPDATE pre_allumage_champs SET ordre=?,modifie_le=datetime('now') WHERE id=?`, [ordre, row.id]);
    ordre += 1;
  }
}

export async function listerPointsCourbePreAllumage(visiteId, sectionCode) {
  const db = await getDb();
  const rubrique = await rubriqueRegulation(db, visiteId, sectionCode);
  if (!rubrique) return [];
  const rows = await db.getAllAsync(`SELECT * FROM pre_allumage_champs WHERE rubrique_id=? ORDER BY ordre,cree_le`, [rubrique.id]);
  const champs = await db.getAllAsync(`SELECT cle,valeur FROM champs_visite WHERE visite_id=? AND section_code=?`, [visiteId, sectionCode]);
  const valeurs = new Map(champs.map((r) => [r.cle, r.valeur]));
  return rows.filter(estPointCourbe).map((row) => ({
    id: row.id,
    rubriqueId: rubrique.id,
    sectionCode,
    localId: rubrique.local_id,
    cle: row.cle_stockage,
    label: row.libelle,
    outdoor: temperatureExterieure(row),
    water: nombre(valeurs.get(row.cle_stockage)),
    base: estPointBase(row),
  })).sort((a, b) => a.outdoor - b.outdoor);
}

export async function mettreAJourPointCourbePreAllumage(visiteId, sectionCode, pointId, { outdoor, water }) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT c.*,r.visite_id,r.section_code FROM pre_allumage_champs c
     JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
     WHERE c.id=? AND r.visite_id=? AND r.section_code=? LIMIT 1`,
    [pointId, visiteId, sectionCode]
  );
  if (!row || !estPointCourbe(row)) throw new Error('Point de courbe introuvable.');
  const nextOutdoor = nombre(outdoor);
  const nextWater = nombre(water);
  if (nextOutdoor === null) throw new Error('La température extérieure doit être numérique.');
  const options = { ...parseOptions(row.options_json), heatCurvePoint: true, heatCurveBase: estPointBase(row), outdoorTemperature: nextOutdoor };
  await db.runAsync(
    `UPDATE pre_allumage_champs SET libelle=?,options_json=?,modifie_le=datetime('now') WHERE id=?`,
    [libellePoint(nextOutdoor), JSON.stringify(options), pointId]
  );
  if (nextWater !== null) {
    const stored = formatNombre(nextWater);
    await upsertChamp(visiteId, sectionCode, row.cle_stockage, stored);
  }
  await reordonnerPoints(db, row.rubrique_id);
  return { id: row.id, cle: row.cle_stockage, outdoor: nextOutdoor, water: nextWater, base: estPointBase(row), label: libellePoint(nextOutdoor) };
}

function interpoler(points, x) {
  const valides = (points || []).filter((p) => Number.isFinite(p.outdoor) && Number.isFinite(p.water)).sort((a, b) => a.outdoor - b.outdoor);
  if (!valides.length) return 50;
  if (valides.length === 1) return valides[0].water;
  for (let i = 0; i < valides.length - 1; i += 1) {
    const a = valides[i]; const b = valides[i + 1];
    if (x >= a.outdoor && x <= b.outdoor && b.outdoor !== a.outdoor) {
      const ratio = (x - a.outdoor) / (b.outdoor - a.outdoor);
      return Math.round((a.water + ratio * (b.water - a.water)) * 2) / 2;
    }
  }
  return x < valides[0].outdoor ? valides[0].water : valides[valides.length - 1].water;
}

function choisirNouvelleAbscisse(points) {
  const xs = (points || []).map((p) => p.outdoor).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 5;
  const bornes = [-20, ...xs, 25];
  let best = 0; let gap = -1;
  for (let i = 0; i < bornes.length - 1; i += 1) {
    const g = bornes[i + 1] - bornes[i];
    if (g > gap) { gap = g; best = (bornes[i + 1] + bornes[i]) / 2; }
  }
  return Math.round(best * 2) / 2;
}

export async function ajouterPointCourbePreAllumage(visiteId, sectionCode) {
  const db = await getDb();
  const rubrique = await rubriqueRegulation(db, visiteId, sectionCode);
  if (!rubrique) throw new Error('Rubrique de régulation introuvable.');
  const points = await listerPointsCourbePreAllumage(visiteId, sectionCode);
  if (points.length >= 12) throw new Error('La courbe est limitée à 12 points pour conserver une lecture claire.');
  const outdoor = choisirNouvelleAbscisse(points);
  const water = interpoler(points, outdoor);
  const id = createId('pa-curve');
  const cle = `Courbe de chauffe — Point ${id}`;
  const options = JSON.stringify({ heatCurvePoint: true, heatCurveBase: false, outdoorTemperature: outdoor });
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_champs WHERE rubrique_id=?`, [rubrique.id]);
  await db.runAsync(
    `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
     VALUES(?,?,?,?,?,?,?)`,
    [id, rubrique.id, cle, libellePoint(outdoor), 'champ', Number(max?.n || -1) + 1, options]
  );
  await upsertChamp(visiteId, sectionCode, cle, formatNombre(water));
  await reordonnerPoints(db, rubrique.id);
  return { id, rubriqueId: rubrique.id, sectionCode, localId: rubrique.local_id, cle, label: libellePoint(outdoor), outdoor, water, base: false };
}

export async function supprimerPointCourbePreAllumage(visiteId, sectionCode, pointId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT c.*,r.id rubrique_id,r.visite_id,r.section_code FROM pre_allumage_champs c
     JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
     WHERE c.id=? AND r.visite_id=? AND r.section_code=? LIMIT 1`,
    [pointId, visiteId, sectionCode]
  );
  if (!row || !estPointCourbe(row)) return false;
  if (estPointBase(row)) throw new Error('Les trois points historiques de la trame ne peuvent pas être supprimés.');
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [visiteId, sectionCode, row.cle_stockage]);
  await db.runAsync(`DELETE FROM pre_allumage_champs WHERE id=?`, [pointId]);
  await reordonnerPoints(db, row.rubrique_id);
  return true;
}

export function estChampPointCourbePreAllumage(champ) {
  const row = { cle_stockage: champ?.cle_stockage || champ?.field?.cle || champ?.cle, libelle: champ?.libelle || champ?.field?.displayLabel || champ?.field?.libelle, options_json: champ?.options_json };
  if (champ?.field?.heatCurvePoint === true || champ?.heatCurvePoint === true) return true;
  return estPointCourbe(row);
}

export function temperatureExterieureChampCourbe(champ) {
  if (champ?.field?.outdoorTemperature !== undefined) return nombre(champ.field.outdoorTemperature);
  if (champ?.outdoorTemperature !== undefined) return nombre(champ.outdoorTemperature);
  return temperatureExterieure({ cle_stockage: champ?.cle_stockage || champ?.field?.cle || champ?.cle, libelle: champ?.libelle || champ?.field?.displayLabel || champ?.field?.libelle, options_json: champ?.options_json });
}
