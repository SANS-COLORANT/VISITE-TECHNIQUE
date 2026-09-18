import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { enregistrerMesureCompleteMission } from './missionMeasurementDb.js';

export const CAMPAIGN_POINT_STATUSES = Object.freeze([
  ['planned', 'À mesurer'],
  ['measured', 'Mesuré'],
  ['absent', 'Absent'],
  ['refusal', 'Refus'],
  ['inaccessible', 'Inaccessible'],
  ['reschedule', 'À replanifier'],
  ['not_applicable', 'Non applicable'],
]);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const out = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(out) ? out : null;
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function requireCampaign(db, campaignId) {
  const row = await db.getFirstAsync('SELECT * FROM mission_measure_campaigns WHERE id=?', [campaignId]);
  if (!row) throw new Error('Campagne de mesures introuvable.');
  return row;
}

async function nextSortOrder(db, campaignId) {
  const row = await db.getFirstAsync(
    'SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM mission_measure_campaign_points WHERE campaign_id=?',
    [campaignId]
  );
  return Number(row?.next_order || 0);
}

export async function creerCampagneMesuresMission({
  missionId,
  siteId = null,
  label,
  measureType,
  unit = null,
  referenceSourceType = null,
  referenceSourceLabel = null,
  defaultExpectedValue = null,
  defaultExpectedText = null,
  toleranceAbs = null,
  tolerancePct = null,
  comparisonGroup = null,
  properties = null,
} = {}) {
  if (!missionId) throw new Error('Mission requise.');
  if (!clean(label)) throw new Error('Nom de campagne requis.');
  if (!clean(measureType)) throw new Error('Type de mesure requis.');
  const db = await getDb();
  const id = createId('mcamp');
  if (siteId) {
    const linked = await db.getFirstAsync(
      'SELECT 1 AS ok FROM mission_site_links WHERE mission_id=? AND site_id=?',
      [missionId, siteId]
    );
    if (!linked) throw new Error('Le Site ne correspond pas à cette Mission.');
  }
  await db.runAsync(
    `INSERT INTO mission_measure_campaigns(
      id,mission_id,site_id,label,measure_type,unit,status,reference_source_type,reference_source_label,
      default_expected_value,default_expected_text,tolerance_abs,tolerance_pct,comparison_group,properties_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, missionId, clean(siteId), clean(label), clean(measureType), clean(unit), 'planned',
      clean(referenceSourceType), clean(referenceSourceLabel), num(defaultExpectedValue), clean(defaultExpectedText),
      num(toleranceAbs), num(tolerancePct), clean(comparisonGroup), properties ? JSON.stringify(properties) : null,
    ]
  );
  return id;
}

export async function listerCampagnesMesuresMission(missionId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT c.*,s.name AS site_name,
      (SELECT COUNT(*) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id) AS point_count,
      (SELECT COUNT(*) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id AND p.status='measured') AS measured_count,
      (SELECT COUNT(*) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id AND p.status NOT IN ('planned','measured')) AS exception_count,
      (SELECT MIN(p.measured_value) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id AND p.status='measured') AS min_value,
      (SELECT MAX(p.measured_value) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id AND p.status='measured') AS max_value,
      (SELECT AVG(p.measured_value) FROM mission_measure_campaign_points p WHERE p.campaign_id=c.id AND p.status='measured') AS avg_value
     FROM mission_measure_campaigns c
     LEFT JOIN mission_sites s ON s.id=c.site_id
     WHERE c.mission_id=?
     ORDER BY CASE c.status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,c.created_at DESC`,
    [missionId]
  );
}

export async function listerPointsCampagneMesures(campaignId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT p.*,l.label AS location_label,e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model
     FROM mission_measure_campaign_points p
     LEFT JOIN mission_locations l ON l.id=p.location_id
     LEFT JOIN mission_equipment e ON e.id=p.equipment_id
     WHERE p.campaign_id=?
     ORDER BY p.sort_order,p.label`,
    [campaignId]
  );
}

export async function ajouterPointCampagneMesures({
  campaignId,
  siteId = null,
  locationId = null,
  equipmentId = null,
  externalRef = null,
  label,
  pointType = null,
  expectedValue = null,
  expectedText = null,
  metadata = null,
  sortOrder = null,
} = {}) {
  const db = await getDb();
  const campaign = await requireCampaign(db, campaignId);
  const id = createId('mcampp');
  const finalSiteId = clean(siteId) || campaign.site_id || null;
  const order = sortOrder === null || sortOrder === undefined ? await nextSortOrder(db, campaignId) : Number(sortOrder) || 0;
  await db.runAsync(
    `INSERT INTO mission_measure_campaign_points(
      id,campaign_id,mission_id,site_id,location_id,equipment_id,external_ref,label,point_type,sort_order,status,
      expected_value,expected_text,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,campaignId,campaign.mission_id,finalSiteId,clean(locationId),clean(equipmentId),clean(externalRef),
      clean(label) || 'Point de mesure',clean(pointType),order,'planned',num(expectedValue),clean(expectedText),
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return id;
}

export async function ajouterPointsCampagneDepuisStructure(campaignId, source = 'locations') {
  const db = await getDb();
  const campaign = await requireCampaign(db, campaignId);
  let rows = [];
  if (source === 'equipment') {
    rows = await db.getAllAsync(
      `SELECT e.id,e.site_id,e.location_id,e.type,e.brand,e.model
       FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id
       WHERE ml.mission_id=? AND (? IS NULL OR e.site_id=?)
       ORDER BY e.type,e.brand,e.model`,
      [campaign.mission_id,campaign.site_id,campaign.site_id]
    );
  } else {
    rows = await db.getAllAsync(
      `SELECT l.id,l.site_id,l.kind,l.label
       FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id
       WHERE ml.mission_id=? AND (? IS NULL OR l.site_id=?)
       ORDER BY l.sort_order,l.label`,
      [campaign.mission_id,campaign.site_id,campaign.site_id]
    );
  }

  const existing = new Set(
    (await db.getAllAsync(
      "SELECT external_ref FROM mission_measure_campaign_points WHERE campaign_id=? AND external_ref IS NOT NULL",
      [campaignId]
    )).map((row) => row.external_ref)
  );
  let added = 0;
  let order = await nextSortOrder(db, campaignId);
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const externalRef = source === 'equipment' ? 'equipment:' + row.id : 'location:' + row.id;
      if (existing.has(externalRef)) continue;
      const label = source === 'equipment'
        ? [row.type,row.brand,row.model].filter(Boolean).join(' · ') || 'Équipement'
        : row.label || 'Localisation';
      await db.runAsync(
        `INSERT INTO mission_measure_campaign_points(
          id,campaign_id,mission_id,site_id,location_id,equipment_id,external_ref,label,point_type,sort_order,status
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [
          createId('mcampp'),campaignId,campaign.mission_id,row.site_id || campaign.site_id || null,
          source === 'equipment' ? row.location_id || null : row.id,
          source === 'equipment' ? row.id : null,
          externalRef,label,source === 'equipment' ? 'equipment' : row.kind || 'location',order,'planned',
        ]
      );
      order += 1;
      added += 1;
    }
  });
  return added;
}

function detectColumn(keys, expressions) {
  return keys.find((key) => expressions.some((expr) => expr.test(normalized(key)))) || null;
}

export async function importerPointsCampagneMesuresExcel(campaignId) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier inaccessible.');

  let workbook;
  const lower = String(asset.name || '').toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    workbook = XLSX.read(raw, { type: 'string' });
  } else {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    workbook = XLSX.read(base64, { type: 'base64' });
  }
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) throw new Error('Aucune feuille exploitable.');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
  if (!rows.length) throw new Error('Aucune ligne à importer.');

  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const labelKey = detectColumn(keys, [
    /^point$/, /^libelle$/, /^designation$/, /^nom$/, /^logement$/, /^local$/, /^zone$/, /^bouche$/, /^terminal$/, /^repere$/,
  ]) || keys[0];
  const externalRefKey = detectColumn(keys, [/^id$/, /^reference$/, /^ref$/, /^numero$/, /^n $/, /^repere$/]);
  const typeKey = detectColumn(keys, [/^type$/, /type point/, /piece/, /localisation/]);
  const expectedKey = detectColumn(keys, [/attendu/, /consigne/, /reference/, /objectif/, /theorique/]);

  const db = await getDb();
  const campaign = await requireCampaign(db, campaignId);
  let order = await nextSortOrder(db, campaignId);
  let added = 0;
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const label = clean(row[labelKey]);
      if (!label) continue;
      const externalRef = clean(externalRefKey ? row[externalRefKey] : null) || 'excel:' + sheetName + ':' + String(index + 2);
      const existing = await db.getFirstAsync(
        'SELECT id FROM mission_measure_campaign_points WHERE campaign_id=? AND external_ref=?',
        [campaignId, externalRef]
      );
      if (existing) continue;
      const expectedRaw = expectedKey ? row[expectedKey] : null;
      const expectedNumber = num(expectedRaw);
      await db.runAsync(
        `INSERT INTO mission_measure_campaign_points(
          id,campaign_id,mission_id,site_id,external_ref,label,point_type,sort_order,status,expected_value,expected_text,metadata_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          createId('mcampp'),campaignId,campaign.mission_id,campaign.site_id || null,externalRef,label,
          clean(typeKey ? row[typeKey] : null),order,'planned',
          expectedNumber,expectedNumber === null ? clean(expectedRaw) : null,
          JSON.stringify({ sourceFile: asset.name, sourceSheet: sheetName, sourceRow: index + 2, raw: row }),
        ]
      );
      order += 1;
      added += 1;
    }
  });
  return { added, totalRows: rows.length, sourceName: asset.name, sheetName };
}

export async function enregistrerPointCampagneMesures(pointId, {
  status = 'measured',
  value = null,
  valueText = null,
  comment = null,
  measuredAt = null,
  sourceType = 'terrain',
  sourceLabel = null,
} = {}) {
  const db = await getDb();
  const point = await db.getFirstAsync(
    `SELECT p.*,c.measure_type,c.unit,c.reference_source_type,c.reference_source_label,c.default_expected_value,c.default_expected_text,
      c.tolerance_abs,c.tolerance_pct,c.status AS campaign_status
     FROM mission_measure_campaign_points p
     JOIN mission_measure_campaigns c ON c.id=p.campaign_id
     WHERE p.id=?`,
    [pointId]
  );
  if (!point) throw new Error('Point de campagne introuvable.');

  const finalStatus = clean(status) || 'planned';
  let measureId = point.measure_id || null;
  let measuredValue = null;
  let measuredText = null;
  let anomalyStatus = null;

  if (finalStatus === 'measured') {
    measuredValue = num(value);
    measuredText = measuredValue === null ? clean(valueText ?? value) : null;
    if (measuredValue === null && !measuredText) throw new Error('Valeur requise pour un point mesuré.');
    const expectedValue = point.expected_value !== null && point.expected_value !== undefined
      ? point.expected_value
      : point.default_expected_value;
    const expectedText = clean(point.expected_text) || clean(point.default_expected_text);
    const result = await enregistrerMesureCompleteMission({
      missionId: point.mission_id,
      siteId: point.site_id,
      locationId: point.location_id,
      equipmentId: point.equipment_id,
      type: point.measure_type,
      value: measuredValue,
      valueText: measuredText,
      unit: point.unit,
      referenceValue: expectedValue,
      referenceText: expectedText,
      referenceSourceType: point.reference_source_type || 'manual',
      referenceSourceLabel: point.reference_source_label || 'Référence campagne',
      toleranceAbs: point.tolerance_abs,
      tolerancePct: point.tolerance_pct,
      sourceType,
      sourceLabel: sourceLabel || 'Campagne · ' + point.label,
      measuredAt: measuredAt || new Date().toISOString(),
      comment,
    });
    measureId = result?.id || null;
    anomalyStatus = result?.anomalyStatus || null;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE mission_measure_campaign_points SET
        status=?,measured_value=?,measured_text=?,measure_id=?,comment=?,measured_at=?,updated_at=datetime('now')
       WHERE id=?`,
      [
        finalStatus,
        finalStatus === 'measured' ? measuredValue : null,
        finalStatus === 'measured' ? measuredText : null,
        finalStatus === 'measured' ? measureId : null,
        clean(comment),
        finalStatus === 'measured' ? (measuredAt || new Date().toISOString()) : null,
        pointId,
      ]
    );
    await db.runAsync(
      `UPDATE mission_measure_campaigns SET
        status=CASE
          WHEN NOT EXISTS(SELECT 1 FROM mission_measure_campaign_points WHERE campaign_id=? AND status='planned') THEN 'completed'
          ELSE 'in_progress'
        END,
        updated_at=datetime('now')
       WHERE id=?`,
      [point.campaign_id, point.campaign_id]
    );
  });

  return { measureId, anomalyStatus, status: finalStatus };
}

export async function dupliquerCampagneMesuresMission(campaignId, { label = null, comparisonGroup = null } = {}) {
  const db = await getDb();
  const source = await requireCampaign(db, campaignId);
  const targetId = createId('mcamp');
  const group = clean(comparisonGroup) || clean(source.comparison_group) || 'comparison:' + source.id;
  const sourcePoints = await db.getAllAsync(
    'SELECT * FROM mission_measure_campaign_points WHERE campaign_id=? ORDER BY sort_order,label',
    [campaignId]
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO mission_measure_campaigns(
        id,mission_id,site_id,label,measure_type,unit,status,reference_source_type,reference_source_label,
        default_expected_value,default_expected_text,tolerance_abs,tolerance_pct,comparison_group,properties_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        targetId,source.mission_id,source.site_id,clean(label) || source.label + ' · nouvelle campagne',
        source.measure_type,source.unit,'planned',source.reference_source_type,source.reference_source_label,
        source.default_expected_value,source.default_expected_text,source.tolerance_abs,source.tolerance_pct,group,source.properties_json,
      ]
    );
    if (!source.comparison_group) {
      await db.runAsync(
        "UPDATE mission_measure_campaigns SET comparison_group=?,updated_at=datetime('now') WHERE id=?",
        [group,campaignId]
      );
    }
    for (const point of sourcePoints) {
      await db.runAsync(
        `INSERT INTO mission_measure_campaign_points(
          id,campaign_id,mission_id,site_id,location_id,equipment_id,external_ref,label,point_type,sort_order,status,
          expected_value,expected_text,metadata_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          createId('mcampp'),targetId,source.mission_id,point.site_id,point.location_id,point.equipment_id,
          point.external_ref,point.label,point.point_type,point.sort_order,'planned',point.expected_value,point.expected_text,point.metadata_json,
        ]
      );
    }
  });
  return targetId;
}

export async function supprimerPointCampagneMesures(pointId) {
  const db = await getDb();
  await db.runAsync('DELETE FROM mission_measure_campaign_points WHERE id=?', [pointId]);
}
