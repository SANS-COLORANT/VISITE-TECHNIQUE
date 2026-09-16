import { getDb } from './db.js';
import { createId } from './database/ids.js';

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export async function chargerVisiteMission(visitId) {
  const db = await getDb();
  const visit = await db.getFirstAsync(
    `SELECT v.*,m.family,m.type AS mission_type,m.label AS mission_label,m.status AS mission_status,
            s.name AS site_name,c.name AS client_name
     FROM mission_visits v
     JOIN missions m ON m.id=v.mission_id
     LEFT JOIN mission_sites s ON s.id=v.site_id
     LEFT JOIN mission_clients c ON c.id=m.client_id
     WHERE v.id=?`,
    [visitId]
  );
  if (!visit) return null;
  const [values, notes, points] = await Promise.all([
    db.getAllAsync(`SELECT * FROM mission_template_values WHERE visit_id=? ORDER BY field_code`, [visitId]),
    db.getAllAsync(`SELECT * FROM mission_notes WHERE visit_id=? ORDER BY created_at DESC`, [visitId]),
    db.getAllAsync(`SELECT * FROM mission_points WHERE visit_origin_id=? ORDER BY created_at DESC`, [visitId]),
  ]);
  return { visit, values, notes, points };
}

export async function enregistrerValeurTrameMission({ missionId, visitId, siteId = null, templateId, fieldCode, fieldLabel = null, value = null, valueType = 'text', unit = null } = {}) {
  if (!missionId || !visitId || !fieldCode) throw new Error('Contexte de champ Mission incomplet.');
  const db = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT id FROM mission_template_values
     WHERE mission_id=? AND visit_id=? AND field_code=? AND COALESCE(template_id,'')=COALESCE(?, '')
     LIMIT 1`,
    [missionId, visitId, fieldCode, text(templateId)]
  );
  const now = new Date().toISOString();
  const raw = value === undefined ? null : value;
  let valueText = null;
  let valueNumber = null;
  let valueBoolean = null;
  let valueDate = null;
  if (valueType === 'number') valueNumber = raw === '' || raw === null ? null : Number(raw);
  else if (valueType === 'boolean') valueBoolean = raw === null || raw === '' ? null : (raw ? 1 : 0);
  else if (valueType === 'date') valueDate = text(raw);
  else valueText = text(raw);

  if (existing?.id) {
    await db.runAsync(
      `UPDATE mission_template_values
       SET field_label=?,value_type=?,value_text=?,value_number=?,value_boolean=?,value_date=?,unit=?,updated_at=?
       WHERE id=?`,
      [text(fieldLabel), valueType, valueText, valueNumber, valueBoolean, valueDate, text(unit), now, existing.id]
    );
    return existing.id;
  }

  const id = createId('mtv');
  await db.runAsync(
    `INSERT INTO mission_template_values(
       id,mission_id,visit_id,site_id,template_id,field_code,field_label,value_type,
       value_text,value_number,value_boolean,value_date,unit,source_type,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, visitId, text(siteId), text(templateId), fieldCode, text(fieldLabel), valueType, valueText, valueNumber, valueBoolean, valueDate, text(unit), 'manual', now, now]
  );
  return id;
}

export async function ajouterNoteVisiteMission({ missionId, visitId, siteId = null, content = '', visibility = 'internal', type = 'terrain' } = {}) {
  if (!missionId || !visitId) throw new Error('Visite Mission requise.');
  const db = await getDb();
  const id = createId('mnote');
  await db.runAsync(
    `INSERT INTO mission_notes(id,mission_id,site_id,visit_id,type,content,visibility) VALUES(?,?,?,?,?,?,?)`,
    [id, missionId, text(siteId), visitId, text(type), text(content), text(visibility) || 'internal']
  );
  return id;
}

export async function mettreAJourVisiteMission(visitId, changes = {}) {
  const allowed = { status: 'status', visitDate: 'visit_date', notes: 'notes', phaseId: 'phase_id', visitType: 'visit_type' };
  const entries = Object.entries(changes).filter(([key]) => allowed[key]);
  if (!entries.length) return;
  const db = await getDb();
  const set = entries.map(([key]) => `${allowed[key]}=?`);
  const values = entries.map(([, value]) => text(value));
  const now = new Date().toISOString();
  set.push('updated_at=?');
  values.push(now);
  if (changes.status === 'in_progress') {
    set.push(`started_at=COALESCE(started_at,?)`);
    values.push(now);
  }
  if (changes.status === 'completed') {
    set.push('completed_at=?');
    values.push(now);
  }
  values.push(visitId);
  await db.runAsync(`UPDATE mission_visits SET ${set.join(',')} WHERE id=?`, values);
}

export async function compterSaisieVisiteMission(visitId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT
      (SELECT COUNT(*) FROM mission_template_values WHERE visit_id=? AND COALESCE(value_text,CAST(value_number AS TEXT),CAST(value_boolean AS TEXT),value_date,'')<>'') AS fields_count,
      (SELECT COUNT(*) FROM mission_points WHERE visit_origin_id=?) AS points_count,
      (SELECT COUNT(*) FROM mission_notes WHERE visit_id=?) AS notes_count,
      (SELECT COUNT(*) FROM mission_photos WHERE visit_id=?) AS photos_count,
      (SELECT COUNT(*) FROM mission_measures WHERE visit_id=?) AS measures_count`,
    [visitId, visitId, visitId, visitId, visitId]
  );
  return row || { fields_count: 0, points_count: 0, notes_count: 0, photos_count: 0, measures_count: 0 };
}
