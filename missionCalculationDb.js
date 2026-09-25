import { getDb } from './db.js';
import { createId } from './database/ids.js';

const BUILTIN_FORMULAS = Object.freeze([
  {
    key: 'hydraulic_power',
    family: 'CVC',
    label: 'Puissance hydraulique eau',
    formula: 'flow_m3h * deltaT_K * 1.163',
    unit: 'kW',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['deltaT_K', 'ΔT', 'K']
    ]
  },
  {
    key: 'hydraulic_flow',
    family: 'CVC',
    label: 'Débit hydraulique depuis puissance',
    formula: 'power_kW / (1.163 * deltaT_K)',
    unit: 'm³/h',
    inputs: [
      ['power_kW', 'Puissance', 'kW'],
      ['deltaT_K', 'ΔT', 'K']
    ]
  },
  {
    key: 'air_power',
    family: 'Ventilation',
    label: 'Puissance sensible air',
    formula: '0.34 * flow_m3h * deltaT_K',
    unit: 'W',
    inputs: [
      ['flow_m3h', 'Débit d’air', 'm³/h'],
      ['deltaT_K', 'ΔT air', 'K']
    ]
  },
  {
    key: 'deviation_pct',
    family: 'Mesures',
    label: 'Écart mesuré / référence',
    formula: '((measured - reference) / reference) * 100',
    unit: '%',
    inputs: [
      ['measured', 'Mesuré', ''],
      ['reference', 'Référence', '']
    ]
  },
  {
    key: 'cop',
    family: 'Clim/PAC',
    label: 'COP instantané',
    formula: 'thermal_power_kW / electrical_power_kW',
    unit: '',
    inputs: [
      ['thermal_power_kW', 'Puissance thermique', 'kW'],
      ['electrical_power_kW', 'Puissance électrique', 'kW']
    ]
  },
  {
    key: 'eer',
    family: 'Clim/PAC',
    label: 'EER instantané',
    formula: 'cooling_power_kW / electrical_power_kW',
    unit: '',
    inputs: [
      ['cooling_power_kW', 'Puissance froid', 'kW'],
      ['electrical_power_kW', 'Puissance électrique', 'kW']
    ]
  },
  {
    key: 'specific_energy_area',
    family: 'Énergie',
    label: 'Consommation spécifique surfacique',
    formula: 'energy_kWh / area_m2',
    unit: 'kWh/m²',
    inputs: [
      ['energy_kWh', 'Énergie', 'kWh'],
      ['area_m2', 'Surface', 'm²']
    ]
  },
  {
    key: 'specific_energy_dwelling',
    family: 'Énergie',
    label: 'Consommation par logement',
    formula: 'energy_kWh / dwellings',
    unit: 'kWh/logt',
    inputs: [
      ['energy_kWh', 'Énergie', 'kWh'],
      ['dwellings', 'Logements', '']
    ]
  },
  {
    key: 'dju_corrected',
    family: 'Énergie',
    label: 'Consommation corrigée DJU',
    formula: 'consumption_kWh * reference_DJU / actual_DJU',
    unit: 'kWh',
    inputs: [
      ['consumption_kWh', 'Consommation', 'kWh'],
      ['reference_DJU', 'DJU de référence', ''],
      ['actual_DJU', 'DJU période', '']
    ]
  },
  {
    key: 'payback',
    family: 'Énergie',
    label: 'Temps de retour simple',
    formula: 'investment_EUR / annual_saving_EUR',
    unit: 'ans',
    inputs: [
      ['investment_EUR', 'Investissement', '€'],
      ['annual_saving_EUR', 'Économie annuelle', '€/an']
    ]
  },
  {
    key: 'air_velocity',
    family: 'Ventilation',
    label: 'Vitesse d’air depuis débit et section',
    formula: 'flow_m3h / (area_m2 * 3600)',
    unit: 'm/s',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['area_m2', 'Section', 'm²']
    ]
  },
  {
    key: 'heat_recovery_efficiency',
    family: 'Ventilation',
    label: 'Rendement récupération température',
    formula: '((supply_after_C - outdoor_C) / (extract_C - outdoor_C)) * 100',
    unit: '%',
    inputs: [
      ['supply_after_C', 'Soufflage après échangeur', '°C'],
      ['outdoor_C', 'Air extérieur', '°C'],
      ['extract_C', 'Air extrait', '°C']
    ]
  },
  {
    key: 'ecs_delta_t',
    family: 'ECS',
    label: 'ΔT départ / retour ECS',
    formula: 'supply_C - return_C',
    unit: 'K',
    inputs: [
      ['supply_C', 'Départ ECS', '°C'],
      ['return_C', 'Retour ECS', '°C']
    ]
  },
  {
    key: 'simple_savings_pct',
    family: 'Énergie',
    label: 'Économie relative',
    formula: '((before - after) / before) * 100',
    unit: '%',
    inputs: [
      ['before', 'Avant', ''],
      ['after', 'Après', '']
    ]
  },
  {
    key: 'hydraulic_delta_t',
    family: 'Hydraulique',
    label: 'ΔT eau depuis puissance et débit',
    formula: 'power_kW / (1.163 * flow_m3h)',
    unit: 'K',
    inputs: [
      ['power_kW', 'Puissance', 'kW'],
      ['flow_m3h', 'Débit', 'm³/h']
    ]
  },
  {
    key: 'water_velocity',
    family: 'Hydraulique',
    label: 'Vitesse eau depuis débit et diamètre',
    formula: '(flow_m3h / 3600) / (3.141592653589793 * pow(diameter_mm / 1000, 2) / 4)',
    unit: 'm/s',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['diameter_mm', 'Diamètre intérieur', 'mm']
    ]
  },
  {
    key: 'diameter_from_velocity',
    family: 'Hydraulique',
    label: 'Diamètre intérieur depuis débit et vitesse',
    formula: 'sqrt((4 * flow_m3h / 3600) / (3.141592653589793 * velocity_ms)) * 1000',
    unit: 'mm',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['velocity_ms', 'Vitesse cible', 'm/s']
    ]
  },
  {
    key: 'head_to_bar',
    family: 'Hydraulique',
    label: 'HMT eau → pression',
    formula: 'head_mce * 0.0980665',
    unit: 'bar',
    inputs: [['head_mce', 'Hauteur manométrique', 'mCE']]
  },
  {
    key: 'bar_to_head',
    family: 'Hydraulique',
    label: 'Pression → HMT eau',
    formula: 'pressure_bar / 0.0980665',
    unit: 'mCE',
    inputs: [['pressure_bar', 'Pression', 'bar']]
  },
  {
    key: 'pump_hydraulic_power',
    family: 'Hydraulique',
    label: 'Puissance hydraulique pompe',
    formula: 'flow_m3h * head_mce * 9.81 / 3600',
    unit: 'kW',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['head_mce', 'HMT', 'mCE']
    ]
  },
  {
    key: 'pump_electrical_power',
    family: 'Hydraulique',
    label: 'Puissance électrique pompe estimée',
    formula: '(flow_m3h * head_mce * 9.81 / 3600) / efficiency',
    unit: 'kW',
    inputs: [
      ['flow_m3h', 'Débit', 'm³/h'],
      ['head_mce', 'HMT', 'mCE'],
      ['efficiency', 'Rendement global (0 à 1)', '']
    ]
  },
  {
    key: 'air_flow_from_velocity',
    family: 'Ventilation',
    label: 'Débit d’air depuis vitesse et section',
    formula: 'velocity_ms * area_m2 * 3600',
    unit: 'm³/h',
    inputs: [
      ['velocity_ms', 'Vitesse', 'm/s'],
      ['area_m2', 'Section', 'm²']
    ]
  },
  {
    key: 'air_delta_t',
    family: 'Ventilation',
    label: 'ΔT air depuis puissance sensible et débit',
    formula: 'power_W / (0.34 * flow_m3h)',
    unit: 'K',
    inputs: [
      ['power_W', 'Puissance sensible', 'W'],
      ['flow_m3h', 'Débit d’air', 'm³/h']
    ]
  },
  {
    key: 'ventilation_balance_pct',
    family: 'Ventilation',
    label: 'Écart soufflage / extraction',
    formula: '((supply_m3h - extract_m3h) / supply_m3h) * 100',
    unit: '%',
    inputs: [
      ['supply_m3h', 'Débit soufflage', 'm³/h'],
      ['extract_m3h', 'Débit extraction', 'm³/h']
    ]
  },
  {
    key: 'filter_dp_increase_pct',
    family: 'Ventilation',
    label: 'Évolution perte de charge filtre',
    formula: '((current_Pa - initial_Pa) / initial_Pa) * 100',
    unit: '%',
    inputs: [
      ['current_Pa', 'ΔP actuelle', 'Pa'],
      ['initial_Pa', 'ΔP de référence', 'Pa']
    ]
  },
  {
    key: 'heat_recovery_power',
    family: 'Ventilation',
    label: 'Puissance récupérée sur air',
    formula: '0.34 * flow_m3h * (extract_C - outdoor_C) * efficiency_pct / 100',
    unit: 'W',
    inputs: [
      ['flow_m3h', 'Débit traversant', 'm³/h'],
      ['extract_C', 'Air extrait', '°C'],
      ['outdoor_C', 'Air extérieur', '°C'],
      ['efficiency_pct', 'Rendement échangeur', '%']
    ]
  },
  {
    key: 'ecs_power_from_flow',
    family: 'ECS',
    label: 'Puissance ECS depuis débit de puisage',
    formula: 'flow_Lmin * deltaT_K * 0.0697667',
    unit: 'kW',
    inputs: [
      ['flow_Lmin', 'Débit eau', 'L/min'],
      ['deltaT_K', 'Élévation de température', 'K']
    ]
  },
  {
    key: 'ecs_storage_energy',
    family: 'ECS',
    label: 'Énergie utile d’un stockage ECS',
    formula: 'volume_L * deltaT_K * 0.001163',
    unit: 'kWh',
    inputs: [
      ['volume_L', 'Volume stocké', 'L'],
      ['deltaT_K', 'Écart de température utile', 'K']
    ]
  },
  {
    key: 'ecs_reheat_time',
    family: 'ECS',
    label: 'Temps théorique de réchauffage ECS',
    formula: '(volume_L * deltaT_K * 0.001163) / power_kW',
    unit: 'h',
    inputs: [
      ['volume_L', 'Volume stocké', 'L'],
      ['deltaT_K', 'Élévation de température', 'K'],
      ['power_kW', 'Puissance utile', 'kW']
    ]
  },
  {
    key: 'three_phase_power',
    family: 'Électricité CVC',
    label: 'Puissance active triphasée',
    formula: '1.7320508075688772 * voltage_V * current_A * cos_phi / 1000',
    unit: 'kW',
    inputs: [
      ['voltage_V', 'Tension entre phases', 'V'],
      ['current_A', 'Intensité', 'A'],
      ['cos_phi', 'cos φ', '']
    ]
  },
  {
    key: 'single_phase_power',
    family: 'Électricité CVC',
    label: 'Puissance active monophasée',
    formula: 'voltage_V * current_A * cos_phi / 1000',
    unit: 'kW',
    inputs: [
      ['voltage_V', 'Tension', 'V'],
      ['current_A', 'Intensité', 'A'],
      ['cos_phi', 'cos φ', '']
    ]
  },
  {
    key: 'annual_energy_cost',
    family: 'Énergie',
    label: 'Coût annuel énergie',
    formula: 'energy_kWh * price_EUR_kWh',
    unit: '€',
    inputs: [
      ['energy_kWh', 'Consommation annuelle', 'kWh'],
      ['price_EUR_kWh', 'Prix énergie', '€/kWh']
    ]
  },
  {
    key: 'annual_energy_saving',
    family: 'Énergie',
    label: 'Économie annuelle d’énergie',
    formula: 'before_kWh - after_kWh',
    unit: 'kWh/an',
    inputs: [
      ['before_kWh', 'Avant', 'kWh/an'],
      ['after_kWh', 'Après', 'kWh/an']
    ]
  },
  {
    key: 'annual_cost_saving',
    family: 'Énergie',
    label: 'Économie annuelle financière',
    formula: '(before_kWh - after_kWh) * price_EUR_kWh',
    unit: '€/an',
    inputs: [
      ['before_kWh', 'Avant', 'kWh/an'],
      ['after_kWh', 'Après', 'kWh/an'],
      ['price_EUR_kWh', 'Prix énergie', '€/kWh']
    ]
  },
  {
    key: 'refrigerant_co2e',
    family: 'Clim/PAC',
    label: 'Charge frigorigène en équivalent CO₂',
    formula: 'charge_kg * gwp / 1000',
    unit: 'tCO₂e',
    inputs: [
      ['charge_kg', 'Charge fluide', 'kg'],
      ['gwp', 'PRG / GWP documentaire', '']
    ]
  },
  {
    key: 'equipment_age',
    family: 'Patrimoine',
    label: 'Âge indicatif équipement',
    formula: 'current_year - installation_year',
    unit: 'ans',
    inputs: [
      ['current_year', 'Année courante', ''],
      ['installation_year', 'Année mise en service', '']
    ]
  },
  {
    key: 'replacement_year',
    family: 'Patrimoine',
    label: 'Année indicative de renouvellement',
    formula: 'installation_year + lifetime_years',
    unit: 'année',
    inputs: [
      ['installation_year', 'Année mise en service', ''],
      ['lifetime_years', 'Durée de vie indicative', 'ans']
    ]
  }
]);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function numberOrNull(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function garantirBibliothequeFormulesMission() {
  const db = await getDb();
  for (const item of BUILTIN_FORMULAS) {
    const id = 'builtin_' + item.key;
    await db.runAsync(
      `INSERT INTO mission_formula_library(id,mission_id,scope,family,label,formula,unit,input_schema_json,enabled)
       VALUES(?,?,?,?,?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET family=excluded.family,label=excluded.label,formula=excluded.formula,unit=excluded.unit,input_schema_json=excluded.input_schema_json,enabled=1,updated_at=datetime('now')`,
      [
        id,
        null,
        'global',
        item.family,
        item.label,
        item.formula,
        item.unit,
        JSON.stringify(item.inputs.map(([key, label, unit]) => ({ key, label, unit })))
      ]
    );
  }
}

export async function listerFormulesMission(missionId = null) {
  await garantirBibliothequeFormulesMission();
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM mission_formula_library
     WHERE enabled=1 AND (mission_id IS NULL OR mission_id=?)
     ORDER BY CASE scope WHEN 'global' THEN 0 ELSE 1 END,family,label`,
    [missionId]
  );
}

export async function creerFormuleMission({
  missionId = null,
  scope = 'mission',
  family = null,
  missionType = null,
  label,
  formula,
  unit = null,
  inputs = [],
  assumptions = null
} = {}) {
  const db = await getDb();
  const id = createId('mformula');
  await db.runAsync(
    'INSERT INTO mission_formula_library(id,mission_id,scope,family,mission_type,label,formula,unit,input_schema_json,assumptions_json,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,1)',
    [
      id,
      missionId,
      scope,
      clean(family),
      clean(missionType),
      clean(label) || 'Formule',
      clean(formula) || '0',
      clean(unit),
      JSON.stringify(inputs || []),
      assumptions ? JSON.stringify(assumptions) : null
    ]
  );
  return id;
}

function validateFormula(formula, keys) {
  const allowed = String(formula || '').replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) =>
    keys.includes(name) || ['Math', 'abs', 'min', 'max', 'sqrt', 'pow', 'round'].includes(name) ? '' : 'INVALID'
  );
  if (allowed.includes('INVALID')) throw new Error('La formule contient une variable non déclarée.');
  if (!/^[\d\s+\-*/().,%<>=!?:]*$/.test(allowed)) throw new Error('La formule contient un caractère non autorisé.');
}

export function calculerFormuleMission(formulaRow, inputValues = {}) {
  const schema = (() => {
    try {
      return JSON.parse(formulaRow?.input_schema_json || '[]');
    } catch {
      return [];
    }
  })();
  const keys = schema.map((i) => i.key);
  validateFormula(formulaRow?.formula, keys);
  const values = keys.map((key) => {
    const n = numberOrNull(inputValues[key]);
    if (n === null) throw new Error('Valeur numérique manquante : ' + key);
    return n;
  });
  const body =
    '"use strict"; const abs=Math.abs,min=Math.min,max=Math.max,sqrt=Math.sqrt,pow=Math.pow,round=Math.round; return (' +
    formulaRow.formula +
    ');';
  const fn = Function(...keys, body);
  const result = Number(fn(...values));
  if (!Number.isFinite(result)) throw new Error('Le calcul ne produit pas un résultat numérique fini.');
  return { result, schema };
}

export async function enregistrerCalculDepuisFormule({
  missionId,
  formulaRow,
  inputValues,
  siteId = null,
  equipmentId = null,
  subjectId = null,
  assumptions = null
} = {}) {
  const { result } = calculerFormuleMission(formulaRow, inputValues);
  const db = await getDb();
  const id = createId('mcalc');
  await db.runAsync(
    `INSERT INTO mission_calculations(id,mission_id,site_id,equipment_id,subject_id,label,formula,unit,result_number,inputs_json,assumptions_json,status,source_type)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      missionId,
      clean(siteId),
      clean(equipmentId),
      clean(subjectId),
      formulaRow.label,
      formulaRow.formula,
      clean(formulaRow.unit),
      result,
      JSON.stringify(inputValues),
      assumptions ? JSON.stringify(assumptions) : formulaRow.assumptions_json,
      'active',
      'formula_library'
    ]
  );
  return { id, result, unit: formulaRow.unit || '' };
}

export async function listerCalculsMission(missionId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM mission_calculations WHERE mission_id=? ORDER BY created_at DESC', [missionId]);
}
