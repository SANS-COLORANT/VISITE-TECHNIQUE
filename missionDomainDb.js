import { getDb } from './db.js';
import { createId } from './database/ids.js';

function txt(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

async function requireMission(db, missionId) {
  const row = await db.getFirstAsync(`SELECT id FROM missions WHERE id=?`, [missionId]);
  if (!row) throw new Error('Mission introuvable.');
}

export async function creerVoletMission({ missionId, label, kind = null, parentId = null, description = null, sortOrder = 0 } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mw');
  await db.runAsync(
    `INSERT INTO mission_workstreams(id,mission_id,parent_id,kind,label,description,sort_order) VALUES(?,?,?,?,?,?,?)`,
    [id, missionId, txt(parentId), txt(kind), txt(label) || 'Volet', txt(description), Number(sortOrder) || 0]
  );
  return id;
}

export async function creerSujetMission({ missionId, workstreamId = null, siteId = null, locationId = null, label, description = null, priority = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('msub');
  await db.runAsync(
    `INSERT INTO mission_subjects(id,mission_id,workstream_id,site_id,location_id,label,description,priority) VALUES(?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(workstreamId), txt(siteId), txt(locationId), txt(label) || 'Sujet', txt(description), txt(priority)]
  );
  return id;
}

export async function ajouterConstatMission({
  missionId, visitId = null, subjectId = null, siteId = null, locationId = null, equipmentId = null,
  kind = 'fact', content, sourceType = 'terrain', sourceId = null, confidence = 'confirmed', observedAt = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mobs');
  await db.runAsync(
    `INSERT INTO mission_observations(id,mission_id,visit_id,subject_id,site_id,location_id,equipment_id,kind,content,source_type,source_id,confidence,observed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(visitId), txt(subjectId), txt(siteId), txt(locationId), txt(equipmentId), txt(kind) || 'fact', txt(content) || 'Constat', txt(sourceType), txt(sourceId), txt(confidence), txt(observedAt)]
  );
  return id;
}

export async function creerHypotheseMission({ missionId, subjectId = null, observationId = null, label, rationale = null, status = 'untested', confidence = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mhyp');
  await db.runAsync(
    `INSERT INTO mission_hypotheses(id,mission_id,subject_id,observation_id,label,rationale,status,confidence) VALUES(?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(subjectId), txt(observationId), txt(label) || 'Hypothèse', txt(rationale), txt(status) || 'untested', num(confidence)]
  );
  return id;
}

export async function creerDecisionMission({ missionId, visitId = null, subjectId = null, label, description = null, actorId = null, decidedAt = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mdec');
  await db.runAsync(
    `INSERT INTO mission_decisions(id,mission_id,visit_id,subject_id,label,description,decided_by_actor_id,decided_at) VALUES(?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(visitId), txt(subjectId), txt(label) || 'Décision', txt(description), txt(actorId), txt(decidedAt) || new Date().toISOString()]
  );
  return id;
}

export async function creerActionMission({
  missionId, sourcePointId = null, subjectId = null, siteId = null, locationId = null, equipmentId = null,
  label, description = null, priority = null, responsibleActorId = null, dueDate = null, dueText = null,
  costEstimate = null, costCurrency = 'EUR', allocation = null, progress = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mact');
  await db.runAsync(
    `INSERT INTO mission_actions(
      id,mission_id,source_point_id,subject_id,site_id,location_id,equipment_id,label,description,priority,
      responsible_actor_id,due_date,due_text,cost_estimate,cost_currency,allocation,progress
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(sourcePointId), txt(subjectId), txt(siteId), txt(locationId), txt(equipmentId), txt(label) || 'Action',
      txt(description), txt(priority), txt(responsibleActorId), txt(dueDate), txt(dueText), num(costEstimate), txt(costCurrency) || 'EUR', txt(allocation), num(progress)]
  );
  return id;
}

export async function creerReferenceMission({
  missionId, siteId = null, equipmentId = null, pointId = null, measureType, value = null, valueText = null,
  unit = null, sourceType = 'document', sourceId = null, sourceLabel = null, toleranceAbs = null, tolerancePct = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mref');
  await db.runAsync(
    `INSERT INTO mission_references(
      id,mission_id,site_id,equipment_id,point_id,measure_type,value_number,value_text,unit,source_type,source_id,source_label,tolerance_abs,tolerance_pct
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(siteId), txt(equipmentId), txt(pointId), txt(measureType) || 'valeur', num(value), txt(valueText), txt(unit),
      txt(sourceType), txt(sourceId), txt(sourceLabel), num(toleranceAbs), num(tolerancePct)]
  );
  return id;
}

export async function enregistrerMesureMission({
  missionId, visitId = null, siteId = null, pointId = null, equipmentId = null, type, value = null, valueText = null,
  unit = null, referenceId = null, sourceType = 'terrain', sourceId = null, sourceLabel = null, quality = 'measured',
  measuredAt = null, instrumentLabel = null, comment = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mmeas');
  const numericValue = num(value);
  let reference = null;
  if (referenceId) reference = await db.getFirstAsync(`SELECT * FROM mission_references WHERE id=? AND mission_id=?`, [referenceId, missionId]);
  const referenceNumber = num(reference?.value_number);
  const delta = numericValue !== null && referenceNumber !== null ? numericValue - referenceNumber : null;
  const deltaPct = delta !== null && referenceNumber !== 0 ? (delta / referenceNumber) * 100 : null;
  let anomalyStatus = null;
  if (delta !== null && reference) {
    const absLimit = num(reference.tolerance_abs);
    const pctLimit = num(reference.tolerance_pct);
    if ((absLimit !== null && Math.abs(delta) > absLimit) || (pctLimit !== null && Math.abs(deltaPct) > pctLimit)) anomalyStatus = 'to_check';
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO mission_measures(id,mission_id,visit_id,site_id,point_id,equipment_id,type,value_number,value_text,unit,target_value,comment)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, missionId, txt(visitId), txt(siteId), txt(pointId), txt(equipmentId), txt(type) || 'valeur', numericValue, txt(valueText), txt(unit),
        referenceNumber !== null ? String(referenceNumber) : txt(reference?.value_text), txt(comment)]
    );
    await db.runAsync(
      `INSERT INTO mission_measure_details(measure_id,reference_id,source_type,source_id,source_label,quality,measured_at,instrument_label,delta_number,delta_percent,anomaly_status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [id, txt(referenceId), txt(sourceType), txt(sourceId), txt(sourceLabel), txt(quality), txt(measuredAt) || new Date().toISOString(), txt(instrumentLabel), delta, deltaPct, anomalyStatus]
    );
  });
  return { id, delta, deltaPct, anomalyStatus };
}

export async function creerSerieMesuresMission({
  missionId, visitId = null, siteId = null, equipmentId = null, type, unit = null, startedAt = null, endedAt = null,
  sampleCount = 0, minValue = null, maxValue = null, avgValue = null, sourceFileUri = null, summary = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mseries');
  await db.runAsync(
    `INSERT INTO mission_measure_series(id,mission_id,visit_id,site_id,equipment_id,type,unit,started_at,ended_at,sample_count,min_value,max_value,avg_value,source_file_uri,summary_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(visitId), txt(siteId), txt(equipmentId), txt(type) || 'serie', txt(unit), txt(startedAt), txt(endedAt), Number(sampleCount) || 0,
      num(minValue), num(maxValue), num(avgValue), txt(sourceFileUri), summary ? JSON.stringify(summary) : null]
  );
  return id;
}

export async function creerCalculMission({
  missionId, siteId = null, equipmentId = null, subjectId = null, label, formula, unit = null,
  result = null, resultText = null, inputs = null, assumptions = null, sourceType = 'metra',
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mcalc');
  await db.runAsync(
    `INSERT INTO mission_calculations(id,mission_id,site_id,equipment_id,subject_id,label,formula,unit,result_number,result_text,inputs_json,assumptions_json,source_type)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(siteId), txt(equipmentId), txt(subjectId), txt(label) || 'Calcul', txt(formula) || '-', txt(unit), num(result), txt(resultText),
      inputs ? JSON.stringify(inputs) : null, assumptions ? JSON.stringify(assumptions) : null, txt(sourceType)]
  );
  return id;
}

export async function relierEquipementsMission({ missionId, sourceEquipmentId, targetEquipmentId, relationType, label = null, properties = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('merel');
  await db.runAsync(
    `INSERT INTO mission_equipment_relations(id,mission_id,source_equipment_id,target_equipment_id,relation_type,label,properties_json)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(mission_id,source_equipment_id,target_equipment_id,relation_type)
     DO UPDATE SET label=excluded.label,properties_json=excluded.properties_json,updated_at=datetime('now')`,
    [id, missionId, sourceEquipmentId, targetEquipmentId, txt(relationType) || 'linked_to', txt(label), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerProtocoleEssaiMission({ missionId, type = null, label, versionLabel = null, description = null, steps = [] } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const protocolId = createId('mtestp');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO mission_test_protocols(id,mission_id,type,label,version_label,description) VALUES(?,?,?,?,?,?)`,
      [protocolId, missionId, txt(type), txt(label) || 'Protocole', txt(versionLabel), txt(description)]
    );
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index] || {};
      await db.runAsync(
        `INSERT INTO mission_test_steps(id,protocol_id,sort_order,label,expected_text,reference_id) VALUES(?,?,?,?,?,?)`,
        [createId('mtests'), protocolId, index, txt(step.label) || `Étape ${index + 1}`, txt(step.expectedText), txt(step.referenceId)]
      );
    }
  });
  return protocolId;
}

export async function demarrerEssaiMission({ missionId, visitId = null, protocolId, siteId = null, equipmentId = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mtestr');
  await db.runAsync(
    `INSERT INTO mission_test_runs(id,mission_id,visit_id,protocol_id,site_id,equipment_id,status,started_at) VALUES(?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(visitId), protocolId, txt(siteId), txt(equipmentId), 'in_progress', new Date().toISOString()]
  );
  return id;
}

export async function enregistrerResultatEssai({ testRunId, testStepId = null, status = 'not_tested', value = null, valueText = null, unit = null, comment = null, pointId = null } = {}) {
  const db = await getDb();
  const id = createId('mtestrs');
  await db.runAsync(
    `INSERT INTO mission_test_results(id,test_run_id,test_step_id,status,value_number,value_text,unit,comment,point_id) VALUES(?,?,?,?,?,?,?,?,?)`,
    [id, testRunId, txt(testStepId), txt(status) || 'not_tested', num(value), txt(valueText), txt(unit), txt(comment), txt(pointId)]
  );
  return id;
}

export async function creerScenarioMission({
  missionId, label, description = null, investment = null, annualSaving = null, energySavingKwh = null,
  co2SavingKg = null, paybackYears = null, constraints = null, benefits = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mscen');
  await db.runAsync(
    `INSERT INTO mission_scenarios(id,mission_id,label,description,investment,annual_saving,energy_saving_kwh,co2_saving_kg,payback_years,constraints_text,benefits_text)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(label) || 'Scénario', txt(description), num(investment), num(annualSaving), num(energySavingKwh), num(co2SavingKg), num(paybackYears), txt(constraints), txt(benefits)]
  );
  return id;
}

export async function ajouterActionScenario({ scenarioId, actionId, sortOrder = 0, included = true, investmentOverride = null, annualSavingOverride = null, note = null } = {}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mission_scenario_actions(scenario_id,action_id,sort_order,included,investment_override,annual_saving_override,note)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(scenario_id,action_id) DO UPDATE SET sort_order=excluded.sort_order,included=excluded.included,investment_override=excluded.investment_override,annual_saving_override=excluded.annual_saving_override,note=excluded.note,updated_at=datetime('now')`,
    [scenarioId, actionId, Number(sortOrder) || 0, included ? 1 : 0, num(investmentOverride), num(annualSavingOverride), txt(note)]
  );
}

export async function ajouterGeometrieMission({
  missionId, siteId = null, locationId = null, equipmentId = null, pointId = null, subjectId = null,
  geometryType, geojson, coordinateSpace = 'plan', planDocumentId = null, label = null, style = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mgeo');
  const payload = typeof geojson === 'string' ? geojson : JSON.stringify(geojson);
  await db.runAsync(
    `INSERT INTO mission_geometries(id,mission_id,site_id,location_id,equipment_id,point_id,subject_id,geometry_type,geojson,coordinate_space,plan_document_id,label,style_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(siteId), txt(locationId), txt(equipmentId), txt(pointId), txt(subjectId), txt(geometryType) || 'point', payload,
      txt(coordinateSpace) || 'plan', txt(planDocumentId), txt(label), style ? JSON.stringify(style) : null]
  );
  return id;
}

export async function ajouterDocumentAttendu({ missionId, phaseId = null, siteId = null, type = null, label, responsibleActorId = null, dueDate = null, dueText = null, comment = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('medoc');
  await db.runAsync(
    `INSERT INTO mission_expected_documents(id,mission_id,phase_id,site_id,type,label,responsible_actor_id,due_date,due_text,comment) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(phaseId), txt(siteId), txt(type), txt(label) || 'Document attendu', txt(responsibleActorId), txt(dueDate), txt(dueText), txt(comment)]
  );
  return id;
}

export async function enregistrerValidationMission({ missionId, documentId = null, subjectId = null, validationType = null, versionLabel = null, status = 'to_review', reviewerActorId = null, comment = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const id = createId('mval');
  await db.runAsync(
    `INSERT INTO mission_validations(id,mission_id,document_id,subject_id,validation_type,version_label,status,reviewer_actor_id,comment,validated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, txt(documentId), txt(subjectId), txt(validationType), txt(versionLabel), txt(status) || 'to_review', txt(reviewerActorId), txt(comment),
      ['validated','validated_with_reservations'].includes(status) ? new Date().toISOString() : null]
  );
  return id;
}

export async function enregistrerSectionRapportMission({
  missionId, profileId = null, scopeType = 'mission', scopeId = null, sectionKey = null, title,
  contentText = null, content = null, sortOrder = 0, hidden = false, sourceType = 'manual',
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const existing = sectionKey
    ? await db.getFirstAsync(
      `SELECT id FROM mission_report_sections WHERE mission_id=? AND COALESCE(profile_id,'')=COALESCE(?, '') AND scope_type=? AND COALESCE(scope_id,'')=COALESCE(?, '') AND section_key=? LIMIT 1`,
      [missionId, txt(profileId), txt(scopeType) || 'mission', txt(scopeId), sectionKey]
    )
    : null;
  const id = existing?.id || createId('mrsec');
  if (existing?.id) {
    await db.runAsync(
      `UPDATE mission_report_sections SET title=?,content_text=?,content_json=?,sort_order=?,hidden=?,source_type=?,updated_at=datetime('now') WHERE id=?`,
      [txt(title) || 'Section', txt(contentText), content ? JSON.stringify(content) : null, Number(sortOrder) || 0, hidden ? 1 : 0, txt(sourceType), id]
    );
  } else {
    await db.runAsync(
      `INSERT INTO mission_report_sections(id,mission_id,profile_id,scope_type,scope_id,section_key,title,content_text,content_json,sort_order,hidden,source_type)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, missionId, txt(profileId), txt(scopeType) || 'mission', txt(scopeId), txt(sectionKey), txt(title) || 'Section', txt(contentText),
        content ? JSON.stringify(content) : null, Number(sortOrder) || 0, hidden ? 1 : 0, txt(sourceType)]
    );
  }
  return id;
}

export async function getMissionDomainSummary(missionId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT
      (SELECT COUNT(*) FROM mission_actions WHERE mission_id=? AND status NOT IN ('closed','cancelled')) AS open_actions,
      (SELECT COUNT(*) FROM mission_observations WHERE mission_id=?) AS observations,
      (SELECT COUNT(*) FROM mission_hypotheses WHERE mission_id=? AND status NOT IN ('confirmed','dismissed')) AS hypotheses,
      (SELECT COUNT(*) FROM mission_test_runs WHERE mission_id=?) AS tests,
      (SELECT COUNT(*) FROM mission_scenarios WHERE mission_id=?) AS scenarios,
      (SELECT COUNT(*) FROM mission_expected_documents WHERE mission_id=? AND status NOT IN ('received','validated')) AS expected_documents,
      (SELECT COUNT(*) FROM mission_calculations WHERE mission_id=? AND status='active') AS calculations`,
    [missionId, missionId, missionId, missionId, missionId, missionId, missionId]
  );
  return row || {};
}
