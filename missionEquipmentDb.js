import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { reconnaitreTexteImageLocale } from './missionNativeTools.js';

const EQUIPMENT_STATES = Object.freeze(['non_evalue', 'bon', 'correct', 'degrade', 'mauvais', 'hs']);
const VERIFICATION_STATES = Object.freeze(['non_verifie', 'confirme', 'different', 'non_retrouve', 'depose', 'remplace', 'inaccessible', 'a_verifier']);
const LIFECYCLE_STATES = Object.freeze(['existant_conserve', 'a_deposer', 'a_transferer', 'reemploi_prevu', 'depose', 'stocke', 'transfere', 'reinstalle', 'neuf', 'mis_en_service']);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function compactLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function findValue(lines, labels) {
  const patterns = labels.map((label) => new RegExp('(?:^|\\b)' + label + '\\s*[:#-]?\\s*(.+)$', 'i'));
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

function detectNumberWithUnit(text, units) {
  const unitPattern = units.join('|');
  const regex = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*(' + unitPattern + ')', 'i');
  const match = String(text || '').match(regex);
  return match ? { value: numberOrNull(match[1]), unit: match[2] } : null;
}

export function extrairePlaqueDepuisOcr(rawText) {
  const lines = compactLines(rawText);
  const joined = lines.join(' | ');
  const model = findValue(lines, ['model', 'modele', 'type', 'mod']);
  const serial = findValue(lines, ['serial(?: no)?', 's\\/?n', 'n° serie', 'no serie', 'numero serie']);
  const refrigerant = joined.match(/\b(R(?:32|134A|410A|407C|404A|290|600A|454B|1234YF))\b/i)?.[1] || null;
  const year = joined.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || null;
  const powerKw = detectNumberWithUnit(joined, ['kW', 'KW']);
  const voltage = detectNumberWithUnit(joined, ['V']);
  const current = detectNumberWithUnit(joined, ['A']);
  const frequency = detectNumberWithUnit(joined, ['Hz', 'HZ']);
  const charge = joined.match(/(?:charge|refrigerant|fluide)[^\d]{0,16}(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);

  const likelyBrand = lines.find((line) => (
    line.length <= 32 &&
    !/\d{3,}/.test(line) &&
    !/(model|modele|type|serial|voltage|power|kw|hz|refrigerant|made in)/i.test(line)
  )) || null;

  return {
    brand: likelyBrand,
    model,
    serialNumber: serial,
    installationYear: year,
    refrigerant,
    nominalPowerKw: powerKw?.unit?.toLowerCase() === 'kw' ? powerKw.value : null,
    voltageV: voltage?.value ?? null,
    currentA: current?.value ?? null,
    frequencyHz: frequency?.value ?? null,
    refrigerantChargeKg: charge ? (charge[2].toLowerCase() === 'g' ? numberOrNull(charge[1]) / 1000 : numberOrNull(charge[1])) : null,
    rawLines: lines,
  };
}

export async function listerEquipementsMission(missionId, { siteId = null, locationId = null, limit = 1000 } = {}) {
  const db = await getDb();
  const where = ['ml.mission_id=?'];
  const params = [missionId];
  if (siteId) { where.push('e.site_id=?'); params.push(siteId); }
  if (locationId) { where.push('e.location_id=?'); params.push(locationId); }
  params.push(Math.max(1, Math.min(5000, Number(limit) || 1000)));
  return db.getAllAsync(
    'SELECT e.*,s.name AS site_name,l.label AS location_label,i.label AS installation_label,sy.label AS system_label,n.label AS network_label ' +
    'FROM mission_equipment e ' +
    'JOIN mission_site_links ml ON ml.site_id=e.site_id ' +
    'LEFT JOIN mission_sites s ON s.id=e.site_id ' +
    'LEFT JOIN mission_locations l ON l.id=e.location_id ' +
    'LEFT JOIN mission_installations i ON i.id=e.installation_id ' +
    'LEFT JOIN mission_systems sy ON sy.id=e.system_id ' +
    'LEFT JOIN mission_networks n ON n.id=e.network_id ' +
    'WHERE ' + where.join(' AND ') + ' ' +
    'ORDER BY s.name,l.sort_order,e.type,e.brand,e.model LIMIT ?',
    params
  );
}

export async function creerEquipementMission({
  missionId,
  siteId,
  locationId = null,
  installationId = null,
  systemId = null,
  networkId = null,
  type,
  brand = null,
  model = null,
  installationYear = null,
  state = 'non_evalue',
  verificationStatus = 'non_verifie',
  lifecycleStatus = 'existant_conserve',
  expectedLifetimeYears = null,
  replacementCost = null,
  replacementYear = null,
  criticality = null,
  properties = null,
  sourceType = 'terrain',
  sourceId = null,
} = {}) {
  if (!missionId || !siteId) throw new Error('Mission et Site requis.');
  const db = await getDb();
  const id = createId('meq');
  const finalState = EQUIPMENT_STATES.includes(state) ? state : 'non_evalue';
  const finalVerification = VERIFICATION_STATES.includes(verificationStatus) ? verificationStatus : 'non_verifie';
  const finalLifecycle = LIFECYCLE_STATES.includes(lifecycleStatus) ? lifecycleStatus : 'existant_conserve';
  await db.runAsync(
    'INSERT INTO mission_equipment(' +
      'id,site_id,location_id,type,brand,model,installation_year,state,properties_json,source_type,source_id,' +
      'installation_id,system_id,network_id,verification_status,lifecycle_status,expected_lifetime_years,replacement_cost,replacement_year,criticality_json' +
    ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      id, siteId, clean(locationId), clean(type) || 'Équipement', clean(brand), clean(model), clean(installationYear),
      finalState, properties ? JSON.stringify(properties) : null, clean(sourceType), clean(sourceId),
      clean(installationId), clean(systemId), clean(networkId), finalVerification, finalLifecycle,
      numberOrNull(expectedLifetimeYears), numberOrNull(replacementCost), replacementYear ? Number(replacementYear) : null,
      criticality ? JSON.stringify(criticality) : null,
    ]
  );
  return id;
}

export async function modifierEquipementMission(equipmentId, changes = {}) {
  const db = await getDb();
  const current = await db.getFirstAsync('SELECT * FROM mission_equipment WHERE id=?', [equipmentId]);
  if (!current) throw new Error('Équipement introuvable.');

  const map = {
    locationId: 'location_id',
    installationId: 'installation_id',
    systemId: 'system_id',
    networkId: 'network_id',
    type: 'type',
    brand: 'brand',
    model: 'model',
    installationYear: 'installation_year',
    state: 'state',
    verificationStatus: 'verification_status',
    lifecycleStatus: 'lifecycle_status',
    expectedLifetimeYears: 'expected_lifetime_years',
    replacementCost: 'replacement_cost',
    replacementYear: 'replacement_year',
  };

  const setters = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (!(key in changes)) continue;
    let value = changes[key];
    if (['expectedLifetimeYears', 'replacementCost'].includes(key)) value = numberOrNull(value);
    if (key === 'replacementYear') value = value ? Number(value) : null;
    setters.push(column + '=?');
    values.push(value === '' ? null : value);
  }
  if ('criticality' in changes) {
    setters.push('criticality_json=?');
    values.push(changes.criticality ? JSON.stringify(changes.criticality) : null);
  }
  if ('properties' in changes) {
    setters.push('properties_json=?');
    values.push(changes.properties ? JSON.stringify(changes.properties) : null);
  }
  if (!setters.length) return;
  setters.push("updated_at=datetime('now')");
  values.push(equipmentId);
  await db.runAsync('UPDATE mission_equipment SET ' + setters.join(',') + ' WHERE id=?', values);
}

export async function dupliquerEquipementMission(equipmentId, quantity = 1) {
  const db = await getDb();
  const source = await db.getFirstAsync('SELECT * FROM mission_equipment WHERE id=?', [equipmentId]);
  if (!source) throw new Error('Équipement introuvable.');
  const ids = [];
  const count = Math.max(1, Math.min(200, Number(quantity) || 1));
  for (let i = 0; i < count; i += 1) {
    const id = createId('meq');
    await db.runAsync(
      'INSERT INTO mission_equipment(' +
        'id,site_id,location_id,type,brand,model,installation_year,state,properties_json,source_type,source_id,' +
        'installation_id,system_id,network_id,verification_status,lifecycle_status,expected_lifetime_years,replacement_cost,replacement_year,criticality_json' +
      ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        id, source.site_id, source.location_id, source.type, source.brand, source.model, source.installation_year, source.state,
        source.properties_json, 'duplicate', equipmentId, source.installation_id, source.system_id, source.network_id,
        source.verification_status, source.lifecycle_status, source.expected_lifetime_years, source.replacement_cost,
        source.replacement_year, source.criticality_json,
      ]
    );
    ids.push(id);
  }
  return ids;
}

export async function creerInstallationMission({ missionId, siteId = null, locationId = null, type = null, label, properties = null } = {}) {
  const db = await getDb();
  const id = createId('minst');
  await db.runAsync(
    'INSERT INTO mission_installations(id,mission_id,site_id,location_id,type,label,properties_json) VALUES(?,?,?,?,?,?,?)',
    [id, missionId, clean(siteId), clean(locationId), clean(type), clean(label) || 'Installation', properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerSystemeMission({ missionId, installationId = null, type = null, label, properties = null } = {}) {
  const db = await getDb();
  const id = createId('msys');
  await db.runAsync(
    'INSERT INTO mission_systems(id,mission_id,installation_id,type,label,properties_json) VALUES(?,?,?,?,?,?)',
    [id, missionId, clean(installationId), clean(type), clean(label) || 'Système', properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerReseauMission({
  missionId, siteId = null, locationId = null, installationId = null, systemId = null, type = null, label, properties = null,
} = {}) {
  const db = await getDb();
  const id = createId('mnet');
  await db.runAsync(
    'INSERT INTO mission_networks(id,mission_id,site_id,location_id,installation_id,system_id,type,label,properties_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [id, missionId, clean(siteId), clean(locationId), clean(installationId), clean(systemId), clean(type), clean(label) || 'Réseau', properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerComposantMission({ missionId, equipmentId, type = null, label, brand = null, model = null, state = null, properties = null } = {}) {
  const db = await getDb();
  const id = createId('mcomp');
  await db.runAsync(
    'INSERT INTO mission_components(id,mission_id,equipment_id,type,label,brand,model,state,properties_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [id, missionId, equipmentId, clean(type), clean(label) || 'Composant', clean(brand), clean(model), clean(state), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function listerStructureTechniqueMission(missionId) {
  const db = await getDb();
  const [installations, systems, networks, components] = await Promise.all([
    db.getAllAsync('SELECT * FROM mission_installations WHERE mission_id=? ORDER BY site_id,label', [missionId]),
    db.getAllAsync('SELECT * FROM mission_systems WHERE mission_id=? ORDER BY installation_id,label', [missionId]),
    db.getAllAsync('SELECT * FROM mission_networks WHERE mission_id=? ORDER BY installation_id,system_id,label', [missionId]),
    db.getAllAsync('SELECT * FROM mission_components WHERE mission_id=? ORDER BY equipment_id,label', [missionId]),
  ]);
  return { installations, systems, networks, components };
}

export async function lancerOcrPlaqueMission({ missionId, photoId, equipmentId = null, fileUri } = {}) {
  if (!missionId || !photoId || !fileUri) throw new Error('Photo de plaque incomplète.');
  const db = await getDb();
  const id = createId('mocr');
  await db.runAsync(
    'INSERT INTO mission_ocr_jobs(id,mission_id,photo_id,equipment_id,status,engine) VALUES(?,?,?,?,?,?)',
    [id, missionId, photoId, clean(equipmentId), 'running', 'android_mlkit']
  );
  const started = Date.now();
  try {
    const result = await reconnaitreTexteImageLocale(fileUri);
    if (result?.unavailable) {
      await db.runAsync(
        'UPDATE mission_ocr_jobs SET status=?,error_text=?,duration_ms=?,completed_at=? WHERE id=?',
        ['unavailable', 'OCR local indisponible sur cet appareil.', Date.now() - started, new Date().toISOString(), id]
      );
      return { id, unavailable: true, rawText: '', detected: {} };
    }
    const detected = extrairePlaqueDepuisOcr(result?.text || '');
    await db.runAsync(
      'UPDATE mission_ocr_jobs SET status=?,raw_text=?,detected_json=?,duration_ms=?,completed_at=? WHERE id=?',
      ['detected', result?.text || '', JSON.stringify(detected), Number(result?.durationMs || (Date.now() - started)), new Date().toISOString(), id]
    );
    return { id, rawText: result?.text || '', detected, durationMs: Number(result?.durationMs || 0) };
  } catch (error) {
    await db.runAsync(
      'UPDATE mission_ocr_jobs SET status=?,error_text=?,duration_ms=?,completed_at=? WHERE id=?',
      ['failed', String(error?.message || error), Date.now() - started, new Date().toISOString(), id]
    );
    throw error;
  }
}

export async function confirmerOcrPlaqueMission({ jobId, equipmentId, values = {} } = {}) {
  const db = await getDb();
  const equipment = await db.getFirstAsync('SELECT * FROM mission_equipment WHERE id=?', [equipmentId]);
  if (!equipment) throw new Error('Équipement introuvable.');
  const currentProps = parseJson(equipment.properties_json, {});
  const nextProps = {
    ...currentProps,
    serialNumber: clean(values.serialNumber) || currentProps.serialNumber || null,
    refrigerant: clean(values.refrigerant) || currentProps.refrigerant || null,
    nominalPowerKw: numberOrNull(values.nominalPowerKw) ?? currentProps.nominalPowerKw ?? null,
    voltageV: numberOrNull(values.voltageV) ?? currentProps.voltageV ?? null,
    currentA: numberOrNull(values.currentA) ?? currentProps.currentA ?? null,
    frequencyHz: numberOrNull(values.frequencyHz) ?? currentProps.frequencyHz ?? null,
    refrigerantChargeKg: numberOrNull(values.refrigerantChargeKg) ?? currentProps.refrigerantChargeKg ?? null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE mission_equipment SET brand=?,model=?,installation_year=?,properties_json=?,verification_status='confirme',verified_at=?,updated_at=datetime('now') WHERE id=?",
      [
        clean(values.brand) || equipment.brand,
        clean(values.model) || equipment.model,
        clean(values.installationYear) || equipment.installation_year,
        JSON.stringify(nextProps),
        new Date().toISOString(),
        equipmentId,
      ]
    );
    await db.runAsync(
      'UPDATE mission_ocr_jobs SET equipment_id=?,status=?,confirmed_json=?,completed_at=? WHERE id=?',
      [equipmentId, 'confirmed', JSON.stringify(values), new Date().toISOString(), jobId]
    );
  });
}

export async function getEquipmentDetails(equipmentId) {
  const db = await getDb();
  const equipment = await db.getFirstAsync(
    'SELECT e.*,s.name AS site_name,l.label AS location_label,i.label AS installation_label,sy.label AS system_label,n.label AS network_label ' +
    'FROM mission_equipment e ' +
    'LEFT JOIN mission_sites s ON s.id=e.site_id ' +
    'LEFT JOIN mission_locations l ON l.id=e.location_id ' +
    'LEFT JOIN mission_installations i ON i.id=e.installation_id ' +
    'LEFT JOIN mission_systems sy ON sy.id=e.system_id ' +
    'LEFT JOIN mission_networks n ON n.id=e.network_id ' +
    'WHERE e.id=?',
    [equipmentId]
  );
  if (!equipment) return null;
  const [components, photos, measures, points, lifecycle, ocr] = await Promise.all([
    db.getAllAsync('SELECT * FROM mission_components WHERE equipment_id=? ORDER BY label', [equipmentId]),
    db.getAllAsync('SELECT * FROM mission_photos WHERE equipment_id=? ORDER BY COALESCE(taken_at,created_at) DESC', [equipmentId]),
    db.getAllAsync('SELECT * FROM mission_measures WHERE equipment_id=? ORDER BY created_at DESC LIMIT 100', [equipmentId]),
    db.getAllAsync('SELECT * FROM mission_points WHERE equipment_id=? ORDER BY created_at DESC LIMIT 100', [equipmentId]),
    db.getAllAsync('SELECT * FROM mission_equipment_lifecycle WHERE equipment_id=? ORDER BY created_at DESC', [equipmentId]),
    db.getAllAsync('SELECT * FROM mission_ocr_jobs WHERE equipment_id=? ORDER BY created_at DESC LIMIT 20', [equipmentId]),
  ]);
  return {
    equipment: {
      ...equipment,
      properties: parseJson(equipment.properties_json, {}),
      criticality: parseJson(equipment.criticality_json, {}),
    },
    components,
    photos,
    measures,
    points,
    lifecycle,
    ocr,
  };
}

export const MISSION_EQUIPMENT_STATES = EQUIPMENT_STATES;
export const MISSION_VERIFICATION_STATES = VERIFICATION_STATES;
export const MISSION_LIFECYCLE_STATES = LIFECYCLE_STATES;
