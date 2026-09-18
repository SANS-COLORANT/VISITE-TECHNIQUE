import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(v) { const s = String(v ?? '').trim(); return s || null; }
function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function listerProtocolesEssaisMission(missionId) {
  const db = await getDb();
  const protocols = await db.getAllAsync('SELECT * FROM mission_test_protocols WHERE mission_id=? ORDER BY created_at DESC', [missionId]);
  const steps = await db.getAllAsync(
    `SELECT s.*,r.value_number AS reference_number,r.value_text AS reference_text,r.unit AS reference_unit
     FROM mission_test_steps s
     JOIN mission_test_protocols p ON p.id=s.protocol_id
     LEFT JOIN mission_references r ON r.id=s.reference_id
     WHERE p.mission_id=? ORDER BY s.protocol_id,s.sort_order`,
    [missionId]
  );
  return protocols.map((p) => ({ ...p, steps: steps.filter((s) => s.protocol_id === p.id) }));
}

export async function creerProtocoleEssaiComplet({ missionId, label, type = null, description = null, steps = [] } = {}) {
  const db = await getDb();
  const protocolId = createId('mtestp');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO mission_test_protocols(id,mission_id,type,label,description) VALUES(?,?,?,?,?)',
      [protocolId, missionId, clean(type), clean(label) || 'Protocole', clean(description)]
    );
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i] || {};
      let referenceId = null;
      if (clean(step.referenceValue) !== null || clean(step.referenceText) !== null) {
        referenceId = createId('mref');
        await db.runAsync(
          'INSERT INTO mission_references(id,mission_id,measure_type,value_number,value_text,unit,source_type,source_label,tolerance_abs,tolerance_pct) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [
            referenceId, missionId, clean(step.measureType) || clean(step.label) || 'essai',
            numberOrNull(step.referenceValue), clean(step.referenceText), clean(step.unit),
            'test_protocol', clean(label) || 'Protocole',
            numberOrNull(step.toleranceAbs), numberOrNull(step.tolerancePct),
          ]
        );
      }
      await db.runAsync(
        'INSERT INTO mission_test_steps(id,protocol_id,sort_order,label,expected_text,reference_id) VALUES(?,?,?,?,?,?)',
        [createId('mtests'), protocolId, i, clean(step.label) || 'Étape ' + (i + 1), clean(step.expectedText), referenceId]
      );
    }
  });
  return protocolId;
}

export async function demarrerExecutionEssai({ missionId, protocolId, visitId = null, siteId = null, equipmentId = null } = {}) {
  const db = await getDb();
  const id = createId('mtestr');
  await db.runAsync(
    'INSERT INTO mission_test_runs(id,mission_id,visit_id,protocol_id,site_id,equipment_id,status,started_at) VALUES(?,?,?,?,?,?,?,?)',
    [id, missionId, clean(visitId), protocolId, clean(siteId), clean(equipmentId), 'in_progress', new Date().toISOString()]
  );
  return chargerExecutionEssai(id);
}

export async function chargerExecutionEssai(runId) {
  const db = await getDb();
  const run = await db.getFirstAsync(
    `SELECT tr.*,p.label AS protocol_label,p.description AS protocol_description,s.name AS site_name,e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model
     FROM mission_test_runs tr JOIN mission_test_protocols p ON p.id=tr.protocol_id
     LEFT JOIN mission_sites s ON s.id=tr.site_id
     LEFT JOIN mission_equipment e ON e.id=tr.equipment_id
     WHERE tr.id=?`,
    [runId]
  );
  if (!run) return null;
  const steps = await db.getAllAsync(
    `SELECT st.*,r.value_number AS reference_number,r.value_text AS reference_text,r.unit AS reference_unit,r.tolerance_abs,r.tolerance_pct,
       res.id AS result_id,res.status AS result_status,res.value_number AS result_number,res.value_text AS result_text,res.unit AS result_unit,res.comment AS result_comment,res.point_id
     FROM mission_test_steps st
     LEFT JOIN mission_references r ON r.id=st.reference_id
     LEFT JOIN mission_test_results res ON res.test_step_id=st.id AND res.test_run_id=?
     WHERE st.protocol_id=? ORDER BY st.sort_order`,
    [runId, run.protocol_id]
  );
  return { run, steps };
}

function evaluateStatus(step, value) {
  const numeric = numberOrNull(value);
  const ref = numberOrNull(step.reference_number);
  if (numeric === null || ref === null) return null;
  const delta = numeric - ref;
  const pct = ref !== 0 ? (delta / ref) * 100 : null;
  if (step.tolerance_abs !== null && step.tolerance_abs !== undefined && Math.abs(delta) > Number(step.tolerance_abs)) return 'deviation';
  if (step.tolerance_pct !== null && step.tolerance_pct !== undefined && pct !== null && Math.abs(pct) > Number(step.tolerance_pct)) return 'deviation';
  return 'ok';
}

export async function enregistrerEtapeEssai({
  runId,
  step,
  status = null,
  value = null,
  valueText = null,
  unit = null,
  comment = null,
  pointId = null,
} = {}) {
  const db = await getDb();
  const auto = evaluateStatus(step, value);
  const finalStatus = status || auto || 'not_tested';
  const existing = await db.getFirstAsync('SELECT id FROM mission_test_results WHERE test_run_id=? AND test_step_id=?', [runId, step.id]);
  if (existing?.id) {
    await db.runAsync(
      'UPDATE mission_test_results SET status=?,value_number=?,value_text=?,unit=?,comment=?,point_id=?,updated_at=datetime(\'now\') WHERE id=?',
      [finalStatus, numberOrNull(value), clean(valueText), clean(unit), clean(comment), clean(pointId), existing.id]
    );
    return existing.id;
  }
  const id = createId('mtestrs');
  await db.runAsync(
    'INSERT INTO mission_test_results(id,test_run_id,test_step_id,status,value_number,value_text,unit,comment,point_id) VALUES(?,?,?,?,?,?,?,?,?)',
    [id, runId, step.id, finalStatus, numberOrNull(value), clean(valueText), clean(unit), clean(comment), clean(pointId)]
  );
  return id;
}

export async function terminerExecutionEssai(runId, comment = null) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE mission_test_runs SET status='completed',comment=?,completed_at=?,updated_at=datetime('now') WHERE id=?",
    [clean(comment), new Date().toISOString(), runId]
  );
}

export async function listerExecutionsEssaisMission(missionId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT tr.*,p.label AS protocol_label,s.name AS site_name,e.type AS equipment_type,
       (SELECT COUNT(*) FROM mission_test_results r WHERE r.test_run_id=tr.id) AS results_count,
       (SELECT COUNT(*) FROM mission_test_results r WHERE r.test_run_id=tr.id AND r.status IN ('deviation','failed','to_check')) AS deviations_count
     FROM mission_test_runs tr
     JOIN mission_test_protocols p ON p.id=tr.protocol_id
     LEFT JOIN mission_sites s ON s.id=tr.site_id
     LEFT JOIN mission_equipment e ON e.id=tr.equipment_id
     WHERE tr.mission_id=? ORDER BY tr.created_at DESC`,
    [missionId]
  );
}
