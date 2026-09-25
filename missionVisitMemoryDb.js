import { getDb } from './db.js';

function scalar(row) {
  if (!row) return '';
  return row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_date ?? '';
}

function clean(value) {
  const out = String(value ?? '').trim();
  return out || '';
}

export async function chargerMemoireVisiteMission({ missionId, visitId, siteId = null } = {}) {
  if (!missionId || !visitId) return { previousVisit: null, values: {}, summary: null };
  const db = await getDb();
  const current = await db.getFirstAsync(
    'SELECT id,mission_id,site_id,visit_date,created_at FROM mission_visits WHERE id=? AND mission_id=?',
    [visitId, missionId]
  );
  if (!current) return { previousVisit: null, values: {}, summary: null };

  const targetSite = siteId || current.site_id || null;
  const previous = await db.getFirstAsync(
    `SELECT v.*,s.name AS site_name
     FROM mission_visits v
     LEFT JOIN mission_sites s ON s.id=v.site_id
     WHERE v.mission_id=? AND v.id<>?
       AND (? IS NULL OR v.site_id=?)
       AND COALESCE(v.visit_date,v.created_at) < COALESCE(?,?)
     ORDER BY COALESCE(v.visit_date,v.created_at) DESC,v.created_at DESC
     LIMIT 1`,
    [missionId, visitId, targetSite, targetSite, current.visit_date, current.created_at]
  );
  if (!previous) return { previousVisit: null, values: {}, summary: null };

  const [valueRows, pointRows, measureRows, photoCount, noteCount] = await Promise.all([
    db.getAllAsync(
      `SELECT field_code,value_text,value_number,value_boolean,value_date
       FROM mission_visit_values WHERE visit_id=?`,
      [previous.id]
    ),
    db.getAllAsync(
      `SELECT p.id,p.type,p.label,p.status,p.priority,
        a.id AS action_id,a.label AS action_label,a.status AS action_status,
        actor.company AS responsible_company,actor.name AS responsible_name,
        a.due_date,a.due_text
       FROM mission_points p
       LEFT JOIN mission_actions a ON a.source_point_id=p.id
       LEFT JOIN mission_actors actor ON actor.id=a.responsible_actor_id
       WHERE p.mission_id=? AND p.visit_origin_id=?
       ORDER BY p.created_at`,
      [missionId, previous.id]
    ),
    db.getAllAsync(
      `SELECT m.type,m.value_number,m.value_text,m.unit,d.anomaly_status,d.source_label
       FROM mission_measures m
       LEFT JOIN mission_measure_details d ON d.measure_id=m.id
       WHERE m.mission_id=? AND m.visit_id=?
       ORDER BY m.created_at DESC LIMIT 12`,
      [missionId, previous.id]
    ),
    db.getFirstAsync('SELECT COUNT(*) AS count FROM mission_photos WHERE mission_id=? AND visit_id=?', [
      missionId,
      previous.id
    ]),
    db.getFirstAsync('SELECT COUNT(*) AS count FROM mission_visit_notes WHERE mission_id=? AND visit_id=?', [
      missionId,
      previous.id
    ])
  ]);

  const values = {};
  for (const row of valueRows || []) {
    if (row.field_code === '__meta.capture_mode') continue;
    values[row.field_code] = scalar(row);
  }

  const unresolved = (pointRows || []).filter(
    (row) =>
      !['closed', 'cancelled', 'no_follow_up'].includes(String(row.action_status || row.status || '').toLowerCase())
  );
  const openActions = unresolved.filter(
    (row) => row.action_id && !['closed', 'cancelled'].includes(String(row.action_status || '').toLowerCase())
  );

  return {
    previousVisit: previous,
    values,
    summary: {
      fieldsCount: Object.keys(values).length,
      pointsCount: (pointRows || []).length,
      unresolvedCount: unresolved.length,
      openActionsCount: openActions.length,
      photosCount: Number(photoCount?.count || 0),
      notesCount: Number(noteCount?.count || 0),
      unresolved: unresolved.slice(0, 8).map((row) => ({
        label: row.action_label || row.label || '',
        status: row.action_status || row.status || '',
        priority: row.priority || '',
        responsible: row.responsible_company || row.responsible_name || '',
        due: row.due_date || row.due_text || ''
      })),
      measures: (measureRows || []).map((row) => ({
        type: row.type || '',
        value: row.value_number ?? row.value_text ?? '',
        unit: row.unit || '',
        anomalyStatus: row.anomaly_status || '',
        sourceLabel: row.source_label || ''
      }))
    }
  };
}

export function previousVisitLabel(previousVisit) {
  if (!previousVisit) return '';
  const date = clean(previousVisit.visit_date || previousVisit.created_at);
  return [date, previousVisit.site_name].filter(Boolean).join(' · ');
}
