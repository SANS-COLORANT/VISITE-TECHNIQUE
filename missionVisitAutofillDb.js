import { getDb } from './db.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function valueWithUnit(numberValue, textValue, unit) {
  if (numberValue !== null && numberValue !== undefined) return String(numberValue) + (unit ? ' ' + unit : '');
  return clean(textValue) || '';
}

function unique(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function compactList(values = [], limit = 6) {
  const rows = unique(values);
  if (!rows.length) return '';
  const kept = rows.slice(0, limit);
  return kept.join(' · ') + (rows.length > kept.length ? ' · +' + (rows.length - kept.length) : '');
}

function equipmentLabel(row) {
  return [row.type, row.brand, row.model].filter(Boolean).join(' ') || 'Équipement';
}

export async function chargerContexteAutoVisiteMission(
  missionId,
  { siteId = null, locationId = null, equipmentId = null } = {}
) {
  if (!missionId) return {};
  const db = await getDb();

  const equipmentWhere = ['ml.mission_id=?'];
  const equipmentParams = [missionId];
  if (siteId) {
    equipmentWhere.push('e.site_id=?');
    equipmentParams.push(siteId);
  }
  if (locationId) {
    equipmentWhere.push('e.location_id=?');
    equipmentParams.push(locationId);
  }
  if (equipmentId) {
    equipmentWhere.push('e.id=?');
    equipmentParams.push(equipmentId);
  }

  const commonSiteWhere = siteId ? ' AND site_id=?' : '';
  const siteParams = siteId ? [missionId, siteId] : [missionId];

  const [equipment, installations, networks, measures, references, points, actions, documents, scenarios] =
    await Promise.all([
      db.getAllAsync(
        `SELECT e.type,e.brand,e.model,e.state,e.verification_status,l.label AS location_label
       FROM mission_equipment e
       JOIN mission_site_links ml ON ml.site_id=e.site_id
       LEFT JOIN mission_locations l ON l.id=e.location_id
       WHERE ${equipmentWhere.join(' AND ')}
       ORDER BY e.type,e.brand,e.model LIMIT 80`,
        equipmentParams
      ),
      db.getAllAsync(
        'SELECT label,type,status FROM mission_installations WHERE mission_id=?' +
          commonSiteWhere +
          ' ORDER BY label LIMIT 40',
        siteParams
      ),
      db.getAllAsync(
        'SELECT label,type,status FROM mission_networks WHERE mission_id=?' +
          commonSiteWhere +
          ' ORDER BY label LIMIT 50',
        siteParams
      ),
      db.getAllAsync(
        `SELECT type,value_number,value_text,unit,target_value,created_at
       FROM mission_measures
       WHERE mission_id=?${siteId ? ' AND (site_id=? OR site_id IS NULL)' : ''}${locationId ? ' AND (location_id=? OR location_id IS NULL)' : ''}${equipmentId ? ' AND (equipment_id=? OR equipment_id IS NULL)' : ''}
       ORDER BY created_at DESC LIMIT 40`,
        [
          missionId,
          ...(siteId ? [siteId] : []),
          ...(locationId ? [locationId] : []),
          ...(equipmentId ? [equipmentId] : [])
        ]
      ),
      db.getAllAsync(
        `SELECT measure_type,value_number,value_text,unit,source_label
       FROM mission_references
       WHERE mission_id=?${siteId ? ' AND (site_id=? OR site_id IS NULL)' : ''}${equipmentId ? ' AND (equipment_id=? OR equipment_id IS NULL)' : ''}
       ORDER BY updated_at DESC LIMIT 30`,
        [missionId, ...(siteId ? [siteId] : []), ...(equipmentId ? [equipmentId] : [])]
      ),
      db.getAllAsync(
        `SELECT type,label,description,status,priority
       FROM mission_points
       WHERE mission_id=?${siteId ? ' AND (site_id=? OR site_id IS NULL)' : ''}${locationId ? ' AND (location_id=? OR location_id IS NULL)' : ''}${equipmentId ? ' AND (equipment_id=? OR equipment_id IS NULL)' : ''}
       ORDER BY created_at DESC LIMIT 40`,
        [
          missionId,
          ...(siteId ? [siteId] : []),
          ...(locationId ? [locationId] : []),
          ...(equipmentId ? [equipmentId] : [])
        ]
      ),
      db.getAllAsync(
        `SELECT label,status,priority,due_date,due_text
       FROM mission_actions
       WHERE mission_id=?${siteId ? ' AND (site_id=? OR site_id IS NULL)' : ''}${locationId ? ' AND (location_id=? OR location_id IS NULL)' : ''}${equipmentId ? ' AND (equipment_id=? OR equipment_id IS NULL)' : ''}
       ORDER BY created_at DESC LIMIT 40`,
        [
          missionId,
          ...(siteId ? [siteId] : []),
          ...(locationId ? [locationId] : []),
          ...(equipmentId ? [equipmentId] : [])
        ]
      ),
      db.getAllAsync(
        `SELECT name,type,document_date
       FROM mission_documents
       WHERE mission_id=?${siteId ? ' AND (site_id=? OR site_id IS NULL)' : ''}${locationId ? ' AND (location_id=? OR location_id IS NULL)' : ''}${equipmentId ? ' AND (equipment_id=? OR equipment_id IS NULL)' : ''}
       ORDER BY created_at DESC LIMIT 30`,
        [
          missionId,
          ...(siteId ? [siteId] : []),
          ...(locationId ? [locationId] : []),
          ...(equipmentId ? [equipmentId] : [])
        ]
      ),
      db.getAllAsync(
        'SELECT label,investment,annual_saving,payback_years FROM mission_scenarios WHERE mission_id=? ORDER BY created_at DESC LIMIT 20',
        [missionId]
      )
    ]);

  const activePoints = points.filter(
    (row) => !['closed', 'no_follow_up'].includes(String(row.status || '').toLowerCase())
  );
  const activeActions = actions.filter(
    (row) => !['closed', 'cancelled', 'done'].includes(String(row.status || '').toLowerCase())
  );

  const equipmentSummary = compactList(
    equipment.map((row) => {
      const extras = [row.state, row.verification_status].filter(Boolean).join('/');
      return equipmentLabel(row) + (extras ? ' [' + extras + ']' : '');
    }),
    8
  );

  const installationSummary = compactList(
    installations.map((row) => [row.label, row.type].filter(Boolean).join(' · ')),
    8
  );
  const networkSummary = compactList(
    networks.map((row) => [row.label, row.type].filter(Boolean).join(' · ')),
    8
  );

  const measureSummary = compactList(
    measures.map((row) => {
      const value = valueWithUnit(row.value_number, row.value_text, row.unit);
      return [row.type, value].filter(Boolean).join(' : ');
    }),
    8
  );

  const referenceSummary = compactList(
    references.map((row) => {
      const value = valueWithUnit(row.value_number, row.value_text, row.unit);
      return [row.measure_type, value, row.source_label].filter(Boolean).join(' : ');
    }),
    6
  );

  const pointSummary = compactList(
    activePoints.map((row) => [row.label || row.description, row.status, row.priority].filter(Boolean).join(' · ')),
    7
  );
  const actionSummary = compactList(
    activeActions.map((row) => [row.label, row.status, row.due_date || row.due_text].filter(Boolean).join(' · ')),
    7
  );
  const documentSummary = compactList(
    documents.map((row) => [row.name, row.document_date].filter(Boolean).join(' · ')),
    7
  );
  const scenarioSummary = compactList(
    scenarios.map((row) => row.label),
    6
  );

  return {
    equipmentSummary,
    installationSummary,
    networkSummary,
    architectureSummary: compactList([installationSummary, networkSummary], 12),
    measureSummary,
    referenceSummary,
    pointSummary,
    actionSummary,
    documentSummary,
    scenarioSummary,
    counts: {
      equipment: equipment.length,
      installations: installations.length,
      networks: networks.length,
      measures: measures.length,
      references: references.length,
      openPoints: activePoints.length,
      openActions: activeActions.length,
      documents: documents.length,
      scenarios: scenarios.length
    }
  };
}

function containsAny(value, words) {
  return words.some((word) => value.includes(word));
}

export function valeurAutoPourChampMission(field, context = {}) {
  const key = String(field?.key || '').toLowerCase();
  const label = String(field?.label || '').toLowerCase();
  const token = key + ' ' + label;

  if (
    containsAny(token, [
      'equipement',
      'équipement',
      'generateur',
      'générateur',
      'caisson',
      'automate',
      'ouvrage',
      'production'
    ])
  ) {
    return context.equipmentSummary || '';
  }
  if (
    containsAny(token, [
      'reseau',
      'réseau',
      'circuit',
      'distribution',
      'bouclage',
      'architecture',
      'colonne',
      'branche',
      'schema',
      'schéma'
    ])
  ) {
    return context.architectureSummary || context.networkSummary || '';
  }
  if (
    containsAny(token, [
      'mesure',
      'température',
      'temperature',
      'pression',
      'debit',
      'débit',
      'frequence',
      'fréquence',
      'consigne',
      'index',
      'puissance'
    ])
  ) {
    return compactList([context.measureSummary, context.referenceSummary], 14);
  }
  if (containsAny(token, ['document', 'facture', 'doe', 'notice', 'rapport', 'analyse', 'pv', 'visa', 'preuve'])) {
    return context.documentSummary || '';
  }
  if (containsAny(token, ['ecart', 'écart', 'reserve', 'réserve', 'anomal', 'point', 'incoher', 'défaut', 'defaut'])) {
    return context.pointSummary || '';
  }
  if (containsAny(token, ['action', 'travaux restant', 'correction', 'prochaine étape', 'prochaine etape'])) {
    return context.actionSummary || '';
  }
  if (containsAny(token, ['scenario', 'scénario', 'variante', 'solution'])) {
    return context.scenarioSummary || '';
  }
  return '';
}
