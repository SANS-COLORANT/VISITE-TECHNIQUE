import { getDb } from './db.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function norm(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

const RECOMMENDED_KEYS = Object.freeze({
  audit_energetique: ['specific_energy_area','specific_energy_dwelling','dju_corrected','annual_energy_cost','annual_energy_saving','annual_cost_saving','simple_savings_pct','payback'],
  audit_technique: ['hydraulic_power','hydraulic_flow','hydraulic_delta_t','water_velocity','pump_hydraulic_power','annual_energy_cost','equipment_age','replacement_year'],
  diagnostic_chaufferie_ss: ['hydraulic_power','hydraulic_flow','hydraulic_delta_t','water_velocity','head_to_bar','bar_to_head','pump_hydraulic_power','pump_electrical_power'],
  diagnostic_ecs: ['ecs_delta_t','ecs_power_from_flow','ecs_storage_energy','ecs_reheat_time','hydraulic_flow'],
  diagnostic_climatisation_pac: ['cop','eer','refrigerant_co2e','three_phase_power','single_phase_power'],
  diagnostic_gtb: ['deviation_pct','three_phase_power','single_phase_power'],
  diagnostic_cible: ['deviation_pct','hydraulic_power','air_power','three_phase_power'],
  etude_cvc: ['hydraulic_power','hydraulic_flow','hydraulic_delta_t','water_velocity','diameter_from_velocity','pump_hydraulic_power','air_power','air_flow_from_velocity','three_phase_power','payback'],
  etude_renovation: ['equipment_age','replacement_year','annual_energy_saving','annual_cost_saving','payback','hydraulic_power','hydraulic_flow'],
  etude_ecs: ['ecs_power_from_flow','ecs_storage_energy','ecs_reheat_time','ecs_delta_t','hydraulic_flow','water_velocity'],
  etude_regulation_gtb: ['deviation_pct','three_phase_power','single_phase_power'],
  commissioning: ['deviation_pct','hydraulic_power','air_power','cop','eer','three_phase_power'],
  opr_reception: ['deviation_pct'],
  assistance_p2_p3: ['equipment_age','replacement_year','annual_energy_cost','payback'],
  controle_exploitation: ['deviation_pct','hydraulic_power','pump_hydraulic_power'],
  suivi_sanitaire: ['ecs_delta_t','deviation_pct'],
  preallumage_reprise_saison: ['hydraulic_power','hydraulic_delta_t','deviation_pct'],
  campagne_mesures: ['deviation_pct'],
  audit_multisites: ['specific_energy_area','specific_energy_dwelling','annual_energy_cost','annual_energy_saving','payback'],
});

const FAMILY_BY_TYPE = Object.freeze({
  diagnostic_chaufferie_ss: ['CVC','Hydraulique','Énergie'],
  diagnostic_ecs: ['ECS','Hydraulique'],
  diagnostic_climatisation_pac: ['Clim/PAC','Électricité CVC','Énergie'],
  diagnostic_gtb: ['Mesures','Électricité CVC'],
  etude_cvc: ['CVC','Hydraulique','Ventilation','Électricité CVC','Énergie'],
  etude_renovation: ['Patrimoine','Énergie','CVC'],
  etude_ecs: ['ECS','Hydraulique'],
  assistance_p2_p3: ['Patrimoine','Énergie'],
  audit_energetique: ['Énergie'],
  campagne_mesures: ['Mesures'],
});

export function formulaBuiltinKey(formulaRow) {
  const id = String(formulaRow?.id || '');
  return id.startsWith('builtin_') ? id.slice('builtin_'.length) : null;
}

export function isFormulaRecommended(missionType, formulaRow) {
  const key = formulaBuiltinKey(formulaRow);
  const keys = RECOMMENDED_KEYS[missionType] || [];
  if (key && keys.includes(key)) return true;
  const families = FAMILY_BY_TYPE[missionType] || [];
  return families.includes(formulaRow?.family);
}

export function sortFormulasForMission(missionType, formulas = []) {
  const order = RECOMMENDED_KEYS[missionType] || [];
  return [...formulas].sort((a, b) => {
    const ar = isFormulaRecommended(missionType, a) ? 0 : 1;
    const br = isFormulaRecommended(missionType, b) ? 0 : 1;
    if (ar !== br) return ar - br;
    const ak = formulaBuiltinKey(a);
    const bk = formulaBuiltinKey(b);
    const ai = ak ? order.indexOf(ak) : -1;
    const bi = bk ? order.indexOf(bk) : -1;
    if (ai >= 0 || bi >= 0) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      if (ai !== bi) return ai - bi;
    }
    return String(a.family || '').localeCompare(String(b.family || ''))
      || String(a.label || '').localeCompare(String(b.label || ''));
  });
}

function unitKind(unit) {
  const u = norm(unit).replace(/ /g, '');
  if (['kw'].includes(u)) return 'kw';
  if (['w'].includes(u)) return 'w';
  if (['m3/h','m3h','m3heure','m3parh'].includes(u)) return 'm3h';
  if (['l/min','lmin','litre/min','litres/min'].includes(u)) return 'lmin';
  if (['bar'].includes(u)) return 'bar';
  if (['pa'].includes(u)) return 'pa';
  if (['hz'].includes(u)) return 'hz';
  if (['a','ampere','amperes'].includes(u)) return 'a';
  if (['v','volt','volts'].includes(u)) return 'v';
  if (['c','degc','°c'].includes(String(unit || '').toLowerCase().replace(/\s/g,''))) return 'c';
  if (['k','kelvin'].includes(u)) return 'k';
  if (['kwh'].includes(u)) return 'kwh';
  if (['m/s','ms'].includes(u)) return 'ms';
  if (['m2'].includes(u)) return 'm2';
  if (['kg'].includes(u)) return 'kg';
  if (['l'].includes(u)) return 'l';
  return u;
}

function convertNumber(value, fromUnit, wantedUnit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const from = unitKind(fromUnit);
  const wanted = unitKind(wantedUnit);
  if (!wanted || !from || wanted === from) return n;
  if (from === 'kw' && wanted === 'w') return n * 1000;
  if (from === 'w' && wanted === 'kw') return n / 1000;
  return null;
}

function matchesMeasure(inputKey, row) {
  const key = norm(inputKey).replace(/ /g, '_');
  const type = norm(row.type);
  const unit = unitKind(row.unit);

  const rules = {
    flow_m3h: () => contains(type,['debit','flow']) && unit === 'm3h',
    flow_lmin: () => contains(type,['debit','flow']) && unit === 'lmin',
    measured: () => true,
    reference: () => false,
    power_kw: () => contains(type,['puissance','power']) && unit === 'kw',
    thermal_power_kw: () => contains(type,['puissance thermique','thermal power','puissance']) && unit === 'kw',
    cooling_power_kw: () => contains(type,['puissance froid','froid','cooling']) && unit === 'kw',
    electrical_power_kw: () => contains(type,['puissance electrique','electrique','electrical']) && unit === 'kw',
    power_w: () => contains(type,['puissance','power']) && ['w','kw'].includes(unit),
    pressure_bar: () => contains(type,['pression','pressure']) && unit === 'bar',
    current_a: () => contains(type,['intensite','courant','current']) && unit === 'a',
    voltage_v: () => contains(type,['tension','voltage']) && unit === 'v',
    velocity_ms: () => contains(type,['vitesse','velocity']) && unit === 'ms',
    energy_kwh: () => contains(type,['energie','consommation','index']) && unit === 'kwh',
    consumption_kwh: () => contains(type,['consommation','energie']) && unit === 'kwh',
    supply_c: () => contains(type,['depart ecs','depart','soufflage']) && unit === 'c',
    return_c: () => contains(type,['retour ecs','retour','reprise']) && unit === 'c',
    outdoor_c: () => contains(type,['exterieur','air exterieur','outdoor']) && unit === 'c',
    extract_c: () => contains(type,['extrait','extraction','reprise']) && unit === 'c',
    supply_after_c: () => contains(type,['soufflage','apres echangeur','supply']) && unit === 'c',
    initial_pa: () => contains(type,['perte de charge','delta p','dp']) && unit === 'pa',
    current_pa: () => contains(type,['perte de charge','delta p','dp']) && unit === 'pa',
  };
  return rules[key]?.() || false;
}

function contains(value, tokens) {
  return tokens.some((token) => value.includes(token));
}

function equipmentPropertyCandidates(key, equipment) {
  const props = parseJson(equipment?.properties_json, {});
  const values = {
    nominal_power_kw: props.nominalPowerKw,
    power_kw: props.nominalPowerKw ?? props.heatingPowerKw ?? props.coolingPowerKw ?? props.thermalPowerKw,
    thermal_power_kw: props.thermalPowerKw ?? props.heatingPowerKw ?? props.nominalPowerKw,
    cooling_power_kw: props.coolingPowerKw,
    electrical_power_kw: props.electricalPowerKw ?? props.motorPowerKw,
    flow_m3h: props.flowM3h ?? props.airFlowM3h ?? props.supplyFlowM3h,
    area_m2: props.areaM2,
    volume_l: props.volumeL,
    charge_kg: props.refrigerantChargeKg,
    diameter_mm: props.diameterMm,
    head_mce: props.headMce,
    voltage_v: props.voltageV,
    current_a: props.currentA,
    installation_year: equipment?.installation_year,
    lifetime_years: equipment?.expected_lifetime_years,
  };
  const value = values[norm(key).replace(/ /g,'_')];
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function referenceMatches(inputKey, row) {
  const key = norm(inputKey).replace(/ /g,'_');
  if (key !== 'reference') return false;
  return row.value_number !== null && row.value_number !== undefined;
}

export async function getCalculationAutoValues({
  missionId,
  formulaRow,
  siteId = null,
  equipmentId = null,
} = {}) {
  if (!missionId || !formulaRow) return { values: {}, sources: {} };
  const schema = parseJson(formulaRow.input_schema_json, []);
  if (!Array.isArray(schema) || !schema.length) return { values: {}, sources: {} };

  const db = await getDb();
  const measureWhere = ['m.mission_id=?'];
  const measureParams = [missionId];
  if (siteId) {
    measureWhere.push('(m.site_id=? OR m.site_id IS NULL)');
    measureParams.push(siteId);
  }
  if (equipmentId) {
    measureWhere.push('(m.equipment_id=? OR m.equipment_id IS NULL)');
    measureParams.push(equipmentId);
  }

  const referenceWhere = ['mission_id=?'];
  const referenceParams = [missionId];
  if (siteId) {
    referenceWhere.push('(site_id=? OR site_id IS NULL)');
    referenceParams.push(siteId);
  }
  if (equipmentId) {
    referenceWhere.push('(equipment_id=? OR equipment_id IS NULL)');
    referenceParams.push(equipmentId);
  }

  const [measures, references, equipment] = await Promise.all([
    db.getAllAsync(
      'SELECT m.*,d.measured_at,d.source_label FROM mission_measures m LEFT JOIN mission_measure_details d ON d.measure_id=m.id WHERE ' + measureWhere.join(' AND ') + ' ORDER BY COALESCE(d.measured_at,m.created_at) DESC LIMIT 150',
      measureParams
    ),
    db.getAllAsync(
      'SELECT * FROM mission_references WHERE ' + referenceWhere.join(' AND ') + ' ORDER BY updated_at DESC LIMIT 100',
      referenceParams
    ),
    equipmentId
      ? db.getFirstAsync(
          'SELECT e.* FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
          [equipmentId, missionId]
        )
      : Promise.resolve(null),
  ]);

  const values = {};
  const sources = {};

  for (const input of schema) {
    const key = input.key;
    const normalizedKey = norm(key).replace(/ /g,'_');

    if (normalizedKey === 'current_year') {
      values[key] = new Date().getFullYear();
      sources[key] = 'Date actuelle';
      continue;
    }

    const equipmentValue = equipmentPropertyCandidates(key, equipment);
    if (equipmentValue !== null) {
      values[key] = equipmentValue;
      sources[key] = 'Fiche équipement';
      continue;
    }

    const measure = measures.find((row) => matchesMeasure(key, row) && row.value_number !== null && row.value_number !== undefined);
    if (measure) {
      const converted = convertNumber(measure.value_number, measure.unit, input.unit);
      if (converted !== null) {
        values[key] = converted;
        sources[key] = ['Mesure Mission', measure.type, measure.source_label].filter(Boolean).join(' · ');
        continue;
      }
    }

    const reference = references.find((row) => referenceMatches(key, row));
    if (reference) {
      values[key] = Number(reference.value_number);
      sources[key] = ['Référence Mission', reference.measure_type, reference.source_label].filter(Boolean).join(' · ');
      continue;
    }
  }

  return { values, sources };
}
