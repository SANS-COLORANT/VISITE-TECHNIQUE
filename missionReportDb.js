import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(value) {
  return String(value ?? '').trim();
}

function blockParagraph(value) {
  return { type: 'paragraph', text: clean(value) };
}

function blockTable(headers, rows) {
  return { type: 'table', headers, rows };
}

function measureValue(row) {
  if (row.value_number !== null && row.value_number !== undefined) {
    return String(row.value_number) + (row.unit ? ' ' + row.unit : '');
  }
  return clean(row.value_text) || '/';
}

async function loadMissionReportData(db, missionId) {
  const mission = await db.getFirstAsync(
    'SELECT m.*,c.name AS client_name FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id WHERE m.id=?',
    [missionId]
  );
  if (!mission) throw new Error('Mission introuvable.');

  const [sites, visits, points, actions, measures, tests, scenarios, calculations, expectedDocuments, photos] = await Promise.all([
    db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
    db.getAllAsync('SELECT v.*,s.name AS site_name FROM mission_visits v LEFT JOIN mission_sites s ON s.id=v.site_id WHERE v.mission_id=? ORDER BY COALESCE(v.visit_date,v.created_at)', [missionId]),
    db.getAllAsync('SELECT p.*,s.name AS site_name,a.company AS responsible_company,a.name AS responsible_name,d.cost_estimate,d.allocation,d.requested_action FROM mission_points p LEFT JOIN mission_sites s ON s.id=p.site_id LEFT JOIN mission_actors a ON a.id=p.responsible_actor_id LEFT JOIN mission_point_details d ON d.point_id=p.id WHERE p.mission_id=? ORDER BY p.created_at', [missionId]),
    db.getAllAsync('SELECT a.*,s.name AS site_name,ma.company AS responsible_company,ma.name AS responsible_name FROM mission_actions a LEFT JOIN mission_sites s ON s.id=a.site_id LEFT JOIN mission_actors ma ON ma.id=a.responsible_actor_id WHERE a.mission_id=? ORDER BY a.created_at', [missionId]),
    db.getAllAsync('SELECT m.*,d.source_type,d.source_label,d.quality,d.delta_number,d.delta_percent,d.anomaly_status,r.value_number AS reference_number,r.value_text AS reference_text FROM mission_measures m LEFT JOIN mission_measure_details d ON d.measure_id=m.id LEFT JOIN mission_references r ON r.id=d.reference_id WHERE m.mission_id=? ORDER BY m.created_at', [missionId]),
    db.getAllAsync('SELECT tr.*,p.label AS protocol_label,e.type AS equipment_type FROM mission_test_runs tr JOIN mission_test_protocols p ON p.id=tr.protocol_id LEFT JOIN mission_equipment e ON e.id=tr.equipment_id WHERE tr.mission_id=? ORDER BY tr.created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_scenarios WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync("SELECT * FROM mission_calculations WHERE mission_id=? AND status='active' ORDER BY created_at", [missionId]),
    db.getAllAsync('SELECT * FROM mission_expected_documents WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_photos WHERE mission_id=? ORDER BY COALESCE(taken_at,created_at)', [missionId]),
  ]);

  return { mission, sites, visits, points, actions, measures, tests, scenarios, calculations, expectedDocuments, photos };
}

function makeAutoSections(data) {
  const sections = [];
  const m = data.mission;

  sections.push({
    key: 'contexte',
    title: 'Contexte de la Mission',
    content: [
      blockParagraph(m.description || ''),
      blockTable(['Élément', 'Valeur'], [
        ['Client', m.client_name || '/'],
        ['Mission', m.label || m.type || '/'],
        ['Référence', m.reference || '/'],
        ['Responsable', m.responsible_name || '/'],
        ['Période', [m.start_date, m.end_date].filter(Boolean).join(' → ') || '/'],
        ['Sites', data.sites.map((s) => s.name).join(', ') || '/'],
      ]),
    ],
  });

  if (data.visits.length) {
    sections.push({
      key: 'visites',
      title: 'Visites et interventions',
      content: [blockTable(
        ['Date', 'Site', 'Type', 'Statut'],
        data.visits.map((v) => [v.visit_date || '', v.site_name || '', v.visit_type || 'Visite', v.status || ''])
      )],
    });
  }

  if (data.points.length) {
    sections.push({
      key: 'points',
      title: 'Constats, réserves et points à suivre',
      content: [blockTable(
        ['Type', 'Site', 'Point', 'Statut', 'Responsable', 'Échéance', 'Coût', 'Imputation'],
        data.points.map((p) => [
          p.type || '',
          p.site_name || '',
          p.label || p.description || '',
          p.status || '',
          p.responsible_company || p.responsible_name || '',
          p.due_date || p.due_text || '',
          p.cost_estimate ?? '',
          p.allocation || p.qualification || '',
        ])
      )],
    });
  }

  if (data.actions.length) {
    sections.push({
      key: 'actions',
      title: 'Plan d’actions',
      content: [blockTable(
        ['Action', 'Site', 'Responsable', 'Priorité', 'Échéance', 'Coût', 'Statut'],
        data.actions.map((a) => [
          a.label || '',
          a.site_name || '',
          a.responsible_company || a.responsible_name || '',
          a.priority || '',
          a.due_date || a.due_text || '',
          a.cost_estimate ?? '',
          a.status || '',
        ])
      )],
    });
  }

  if (data.measures.length) {
    sections.push({
      key: 'mesures',
      title: 'Mesures et comparaisons',
      content: [blockTable(
        ['Mesure', 'Valeur', 'Référence', 'Écart', 'Source', 'Statut'],
        data.measures.map((row) => [
          row.type || '',
          measureValue(row),
          row.reference_number !== null && row.reference_number !== undefined
            ? String(row.reference_number) + (row.unit ? ' ' + row.unit : '')
            : (row.reference_text || ''),
          row.delta_percent !== null && row.delta_percent !== undefined
            ? Number(row.delta_percent).toFixed(1) + ' %'
            : (row.delta_number !== null && row.delta_number !== undefined ? String(row.delta_number) : ''),
          row.source_label || row.source_type || '',
          row.anomaly_status === 'to_check' ? 'À contrôler' : '',
        ])
      )],
    });
  }

  if (data.tests.length) {
    sections.push({
      key: 'essais',
      title: 'Essais et mise en service',
      content: [blockTable(
        ['Protocole', 'Équipement', 'Statut', 'Début', 'Fin'],
        data.tests.map((t) => [
          t.protocol_label || '',
          t.equipment_type || '',
          t.status || '',
          t.started_at || '',
          t.completed_at || '',
        ])
      )],
    });
  }

  if (data.calculations.length) {
    sections.push({
      key: 'calculs',
      title: 'Calculs',
      content: [blockTable(
        ['Calcul', 'Résultat', 'Unité', 'Formule'],
        data.calculations.map((c) => [
          c.label || '',
          c.result_number ?? c.result_text ?? '',
          c.unit || '',
          c.formula || '',
        ])
      )],
    });
  }

  if (data.scenarios.length) {
    sections.push({
      key: 'scenarios',
      title: 'Scénarios',
      content: [blockTable(
        ['Scénario', 'Investissement', 'Économie annuelle', 'Énergie', 'CO₂', 'TRB'],
        data.scenarios.map((sc) => [
          sc.label || '',
          sc.investment ?? '',
          sc.annual_saving ?? '',
          sc.energy_saving_kwh ?? '',
          sc.co2_saving_kg ?? '',
          sc.payback_years ?? '',
        ])
      )],
    });
  }

  if (data.expectedDocuments.length) {
    sections.push({
      key: 'documents',
      title: 'Documents attendus / validation',
      content: [blockTable(
        ['Document', 'Statut', 'Échéance', 'Commentaire'],
        data.expectedDocuments.map((d) => [
          d.label || '',
          d.status || '',
          d.due_date || d.due_text || '',
          d.comment || '',
        ])
      )],
    });
  }

  return sections;
}

export async function initialiserRapportMission(missionId, { forceRefresh = false } = {}) {
  const db = await getDb();
  const data = await loadMissionReportData(db, missionId);
  let profile = await db.getFirstAsync(
    'SELECT * FROM mission_report_profiles WHERE mission_id=? ORDER BY is_default DESC,created_at LIMIT 1',
    [missionId]
  );

  if (!profile) {
    const id = createId('mrp');
    await db.runAsync(
      'INSERT INTO mission_report_profiles(id,mission_id,type,label,scope,is_default,config_json) VALUES(?,?,?,?,?,?,?)',
      [id, missionId, data.mission.type || 'mission', data.mission.label ? 'Rapport - ' + data.mission.label : 'Rapport Mission', 'mission', 1, JSON.stringify({ version: 1 })]
    );
    profile = await db.getFirstAsync('SELECT * FROM mission_report_profiles WHERE id=?', [id]);
  }

  if (forceRefresh) {
    await db.runAsync(
      "DELETE FROM mission_report_sections WHERE mission_id=? AND profile_id=? AND source_type='auto'",
      [missionId, profile.id]
    );
  }

  let sections = await db.getAllAsync(
    'SELECT * FROM mission_report_sections WHERE mission_id=? AND profile_id=? ORDER BY sort_order,created_at',
    [missionId, profile.id]
  );

  const existingKeys = new Set(sections.map((row) => row.section_key).filter(Boolean));
  const generated = makeAutoSections(data);
  let nextOrder = sections.length ? Math.max(...sections.map((row) => Number(row.sort_order || 0))) + 1 : 0;
  for (const section of generated) {
    if (existingKeys.has(section.key)) continue;
    await db.runAsync(
      'INSERT INTO mission_report_sections(id,mission_id,profile_id,scope_type,section_key,title,content_json,sort_order,source_type) VALUES(?,?,?,?,?,?,?,?,?)',
      [createId('mrsec'), missionId, profile.id, 'mission', section.key, section.title, JSON.stringify(section.content), nextOrder++, 'auto']
    );
  }

  sections = await db.getAllAsync(
    'SELECT * FROM mission_report_sections WHERE mission_id=? AND profile_id=? ORDER BY sort_order,created_at',
    [missionId, profile.id]
  );
  return { profile, sections, data };
}

export async function modifierSectionRapportMission(sectionId, changes = {}) {
  const db = await getDb();
  const allowed = {
    title: 'title',
    contentText: 'content_text',
    contentJson: 'content_json',
    sortOrder: 'sort_order',
    hidden: 'hidden',
  };
  const entries = Object.entries(changes).filter(([key]) => allowed[key]);
  if (!entries.length) return;
  const setters = entries.map(([key]) => allowed[key] + '=?');
  const values = entries.map(([key, value]) => {
    if (key === 'hidden') return value ? 1 : 0;
    if (key === 'contentJson' && value && typeof value !== 'string') return JSON.stringify(value);
    return value;
  });
  setters.push("source_type='edited'");
  setters.push("updated_at=datetime('now')");
  values.push(sectionId);
  await db.runAsync('UPDATE mission_report_sections SET ' + setters.join(',') + ' WHERE id=?', values);
}

export async function ajouterSectionRapportMission({ missionId, profileId, title = 'Nouvelle section', contentText = '', sortOrder = 999 } = {}) {
  const db = await getDb();
  const id = createId('mrsec');
  await db.runAsync(
    'INSERT INTO mission_report_sections(id,mission_id,profile_id,scope_type,title,content_text,sort_order,source_type) VALUES(?,?,?,?,?,?,?,?)',
    [id, missionId, profileId, 'mission', title, contentText, Number(sortOrder) || 999, 'edited']
  );
  return id;
}

export async function supprimerSectionRapportMission(sectionId) {
  const db = await getDb();
  await db.runAsync('DELETE FROM mission_report_sections WHERE id=?', [sectionId]);
}

export async function chargerRapportMission(missionId) {
  const db = await getDb();
  const profile = await db.getFirstAsync(
    'SELECT * FROM mission_report_profiles WHERE mission_id=? ORDER BY is_default DESC,created_at LIMIT 1',
    [missionId]
  );
  if (!profile) return initialiserRapportMission(missionId);
  const [sections, data] = await Promise.all([
    db.getAllAsync('SELECT * FROM mission_report_sections WHERE mission_id=? AND profile_id=? ORDER BY sort_order,created_at', [missionId, profile.id]),
    loadMissionReportData(db, missionId),
  ]);
  return { profile, sections, data };
}
