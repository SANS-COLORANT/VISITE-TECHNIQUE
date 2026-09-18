import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { enregistrerMesureMission, creerReferenceMission } from './missionDomainDb.js';

const BUILTIN_MEASURE_TYPES = Object.freeze([
  ['temperature', 'Température', '°C'],
  ['pressure', 'Pression', 'bar'],
  ['static_pressure', 'Pression statique', 'Pa'],
  ['delta_pressure', 'Pression différentielle', 'Pa'],
  ['flow_water', 'Débit hydraulique', 'm³/h'],
  ['flow_air', 'Débit d’air', 'm³/h'],
  ['air_velocity', 'Vitesse d’air', 'm/s'],
  ['electrical_current', 'Intensité', 'A'],
  ['voltage', 'Tension', 'V'],
  ['electrical_power', 'Puissance électrique', 'kW'],
  ['thermal_power', 'Puissance thermique', 'kW'],
  ['energy_index', 'Index énergie', 'kWh'],
  ['water_index', 'Index eau', 'm³'],
  ['frequency', 'Fréquence variateur', 'Hz'],
  ['valve_position', 'Position vanne', '%'],
  ['pump_speed', 'Vitesse pompe', '%'],
  ['ph', 'pH', ''],
  ['sound_level', 'Niveau sonore', 'dB(A)'],
  ['surface_temperature', 'Température surface / IR', '°C'],
  ['o2', 'O₂ combustion', '%'],
  ['co2', 'CO₂ combustion', '%'],
  ['co', 'CO combustion', 'ppm'],
  ['flue_temperature', 'Température fumées', '°C'],
  ['combustion_efficiency', 'Rendement combustion', '%'],
]);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function safe(value = 'series') {
  return String(value || 'series').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 90) || 'series';
}

export async function listerTypesMesureMission(missionId, family = null, missionType = null) {
  const db = await getDb();
  const custom = await db.getAllAsync(
    `SELECT * FROM mission_custom_measure_types
     WHERE enabled=1 AND (mission_id IS NULL OR mission_id=?)
       AND (family IS NULL OR family=? OR ? IS NULL)
       AND (mission_type IS NULL OR mission_type=? OR ? IS NULL)
     ORDER BY label`,
    [missionId, family, family, missionType, missionType]
  );
  return [
    ...BUILTIN_MEASURE_TYPES.map(([key,label,unit]) => ({ id: 'builtin_' + key, key, label, unit, builtin: true })),
    ...custom.map((row) => ({ ...row, key: row.id, builtin: false })),
  ];
}

export async function creerTypeMesureMission({ missionId, family = null, missionType = null, label, unit = null, dataType = 'number', expectedMin = null, expectedMax = null } = {}) {
  const db = await getDb();
  const id = createId('mmeasuretype');
  await db.runAsync(
    'INSERT INTO mission_custom_measure_types(id,mission_id,family,mission_type,label,unit,data_type,expected_min,expected_max) VALUES(?,?,?,?,?,?,?,?,?)',
    [id, missionId, clean(family), clean(missionType), clean(label) || 'Mesure personnalisée', clean(unit), dataType, num(expectedMin), num(expectedMax)]
  );
  return id;
}

export async function listerInstrumentsMission(missionId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM mission_measurement_instruments WHERE mission_id=? ORDER BY label', [missionId]);
}

export async function creerInstrumentMission({ missionId, label, brand = null, model = null, serialNumber = null, calibrationDate = null, calibrationDueDate = null } = {}) {
  const db = await getDb();
  const id = createId('minstr');
  await db.runAsync(
    'INSERT INTO mission_measurement_instruments(id,mission_id,label,brand,model,serial_number,calibration_date,calibration_due_date) VALUES(?,?,?,?,?,?,?,?)',
    [id, missionId, clean(label) || 'Instrument', clean(brand), clean(model), clean(serialNumber), clean(calibrationDate), clean(calibrationDueDate)]
  );
  return id;
}

export async function enregistrerMesureCompleteMission({
  missionId,
  visitId = null,
  siteId = null,
  equipmentId = null,
  locationId = null,
  pointId = null,
  type,
  value = null,
  valueText = null,
  unit = null,
  referenceValue = null,
  referenceText = null,
  referenceSourceType = null,
  referenceSourceLabel = null,
  toleranceAbs = null,
  tolerancePct = null,
  sourceType = 'terrain',
  sourceLabel = null,
  instrumentId = null,
  measuredAt = null,
  comment = null,
} = {}) {
  const db = await getDb();
  let referenceId = null;
  if (referenceValue !== null && referenceValue !== undefined && referenceValue !== '' || clean(referenceText)) {
    referenceId = await creerReferenceMission({
      missionId,
      siteId,
      equipmentId,
      pointId,
      measureType: type,
      value: referenceValue,
      valueText: referenceText,
      unit,
      sourceType: referenceSourceType || 'manual',
      sourceLabel: referenceSourceLabel || 'Référence Mission',
      toleranceAbs,
      tolerancePct,
    });
  }
  const instrument = instrumentId ? await db.getFirstAsync('SELECT * FROM mission_measurement_instruments WHERE id=?', [instrumentId]) : null;
  return enregistrerMesureMission({
    missionId,
    visitId,
    siteId,
    pointId,
    equipmentId,
    locationId,
    type,
    value,
    valueText,
    unit,
    referenceId,
    sourceType,
    sourceLabel,
    quality: sourceType === 'calculation' ? 'calculated' : sourceType === 'estimate' ? 'estimated' : 'measured',
    measuredAt,
    instrumentLabel: instrument ? [instrument.label,instrument.brand,instrument.model,instrument.serial_number].filter(Boolean).join(' · ') : null,
    comment,
  });
}

function sheetRows(workbook) {
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return { sheetName: null, rows: [] };
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
  return { sheetName, rows };
}

function detectColumns(rows) {
  if (!rows.length) return { timeKey: null, valueKey: null };
  const keys = Object.keys(rows[0] || {});
  const timeKey = keys.find((k) => /(date|time|heure|timestamp)/i.test(k)) || keys[0] || null;
  let valueKey = keys.find((k) => /(value|valeur|temp|debit|débit|pression|niveau|mesure)/i.test(k) && k !== timeKey);
  if (!valueKey) {
    valueKey = keys.find((k) => rows.some((r) => num(r[k]) !== null) && k !== timeKey) || keys.find((k) => k !== timeKey) || null;
  }
  return { timeKey, valueKey };
}

function downsample(points, max = 500) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.floor(i * step)]);
  return out;
}

export async function importerSerieMesuresMission({ missionId, visitId = null, siteId = null, locationId = null, equipmentId = null, type = 'serie', unit = null } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier de série inaccessible.');

  const ext = String(asset.name || '').toLowerCase();
  let workbook;
  if (ext.endsWith('.csv') || ext.endsWith('.txt')) {
    const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    workbook = XLSX.read(raw, { type: 'string' });
  } else {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    workbook = XLSX.read(base64, { type: 'base64' });
  }

  const { sheetName, rows } = sheetRows(workbook);
  const { timeKey, valueKey } = detectColumns(rows);
  if (!valueKey) throw new Error('Aucune colonne numérique détectée.');

  const points = rows.map((row, index) => {
    const value = num(row[valueKey]);
    if (value === null) return null;
    const rawTime = timeKey ? row[timeKey] : index;
    return { x: index, time: rawTime === null || rawTime === undefined ? index : String(rawTime), value };
  }).filter(Boolean);
  if (!points.length) throw new Error('Aucune valeur numérique exploitable.');

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const avgValue = values.reduce((a,b) => a+b, 0) / values.length;

  const root = FileSystem.documentDirectory;
  const folder = root + 'metra-missions/' + safe(missionId) + '/series/';
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const dest = folder + Date.now() + '__' + safe(asset.name || 'serie.xlsx');
  await FileSystem.copyAsync({ from: asset.uri, to: dest });

  const db = await getDb();
  let effectiveSiteId = clean(siteId);
  let effectiveLocationId = clean(locationId);
  if (equipmentId) {
    const equipment = await db.getFirstAsync(
      'SELECT e.site_id,e.location_id FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
      [equipmentId, missionId]
    );
    if (equipment) {
      effectiveSiteId = effectiveSiteId || equipment.site_id || null;
      effectiveLocationId = effectiveLocationId || equipment.location_id || null;
    }
  }
  const id = createId('mseries');
  await db.runAsync(
    `INSERT INTO mission_measure_series(id,mission_id,visit_id,site_id,location_id,equipment_id,type,unit,sample_count,min_value,max_value,avg_value,source_file_uri,summary_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, missionId, clean(visitId), effectiveSiteId, effectiveLocationId, clean(equipmentId), clean(type) || 'serie', clean(unit),
      points.length, minValue, maxValue, avgValue, dest,
      JSON.stringify({ sourceName: asset.name, sheetName, timeKey, valueKey, points: downsample(points) }),
    ]
  );
  return { id, sampleCount: points.length, minValue, maxValue, avgValue, sourceName: asset.name };
}

export async function listerMesuresMission(missionId) {
  const db = await getDb();
  const [measures, series] = await Promise.all([
    db.getAllAsync(
      `SELECT m.*,d.source_type,d.source_label,d.quality,d.measured_at,d.instrument_label,d.delta_number,d.delta_percent,d.anomaly_status,
       r.value_number AS reference_number,r.value_text AS reference_text,r.source_type AS reference_source_type,r.source_label AS reference_source_label
       FROM mission_measures m
       LEFT JOIN mission_measure_details d ON d.measure_id=m.id
       LEFT JOIN mission_references r ON r.id=d.reference_id
       WHERE m.mission_id=? ORDER BY COALESCE(d.measured_at,m.created_at) DESC LIMIT 2000`,
      [missionId]
    ),
    db.getAllAsync('SELECT * FROM mission_measure_series WHERE mission_id=? ORDER BY created_at DESC', [missionId]),
  ]);
  return { measures, series: series.map((s) => ({ ...s, summary: (() => { try { return JSON.parse(s.summary_json || '{}'); } catch { return {}; } })() })) };
}
