import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

export async function enregistrerNoteVocaleMission({
  missionId,
  visitId = null,
  siteId = null,
  locationId = null,
  equipmentId = null,
  pointId = null,
  transcript,
  locale = 'fr-FR',
} = {}) {
  if (!missionId || !clean(transcript)) return null;
  const db = await getDb();
  const id = createId('mvoice');
  await db.runAsync(
    'INSERT INTO mission_voice_notes(id,mission_id,visit_id,site_id,location_id,equipment_id,point_id,transcript,locale,status) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id, missionId, clean(visitId), clean(siteId), clean(locationId), clean(equipmentId), clean(pointId), clean(transcript), clean(locale) || 'fr-FR', 'final']
  );
  return id;
}

async function pushCheck(db, missionId, visitId, checkKey, label, severity, entityType = null, entityId = null, message = null) {
  const id = createId('mvcheck');
  await db.runAsync(
    `INSERT INTO mission_visit_checks(id,mission_id,visit_id,check_key,label,status,severity,entity_type,entity_id,message)
     VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(visit_id,check_key,COALESCE(entity_type,''),COALESCE(entity_id,''))
     DO UPDATE SET label=excluded.label,status='open',severity=excluded.severity,message=excluded.message,updated_at=datetime('now')`,
    [id, missionId, visitId, checkKey, label, 'open', severity, entityType, entityId, message]
  );
}

export async function genererChecklistFinVisite(missionId, visitId) {
  const db = await getDb();
  const visit = await db.getFirstAsync('SELECT * FROM mission_visits WHERE id=? AND mission_id=?', [visitId, missionId]);
  if (!visit) throw new Error('Visite Mission introuvable.');

  await db.runAsync("DELETE FROM mission_visit_checks WHERE visit_id=? AND status='open'", [visitId]);

  const [
    equipmentWithoutState,
    equipmentWithoutPhoto,
    importedUnverified,
    openPointsNoResponsible,
    openPointsNoDue,
    emptyVisit,
  ] = await Promise.all([
    db.getAllAsync(
      `SELECT e.id,e.type,e.brand,e.model FROM mission_equipment e
       JOIN mission_site_links l ON l.site_id=e.site_id
       WHERE l.mission_id=? AND (? IS NULL OR e.site_id=?)
         AND COALESCE(e.state,'non_evalue')='non_evalue'
       LIMIT 20`,
      [missionId, visit.site_id, visit.site_id]
    ),
    db.getAllAsync(
      `SELECT e.id,e.type,e.brand,e.model FROM mission_equipment e
       JOIN mission_site_links l ON l.site_id=e.site_id
       WHERE l.mission_id=? AND (? IS NULL OR e.site_id=?)
         AND NOT EXISTS(SELECT 1 FROM mission_photos p WHERE p.equipment_id=e.id)
       LIMIT 20`,
      [missionId, visit.site_id, visit.site_id]
    ),
    db.getAllAsync(
      `SELECT e.id,e.type,e.brand,e.model FROM mission_equipment e
       JOIN mission_site_links l ON l.site_id=e.site_id
       WHERE l.mission_id=? AND (? IS NULL OR e.site_id=?)
         AND e.source_type IN ('excel_import','document','import')
         AND COALESCE(e.verification_status,'non_verifie') IN ('non_verifie','a_verifier')
       LIMIT 20`,
      [missionId, visit.site_id, visit.site_id]
    ),
    db.getAllAsync(
      `SELECT id,label,description FROM mission_points
       WHERE mission_id=? AND visit_origin_id=? AND status NOT IN ('closed','cancelled')
         AND responsible_actor_id IS NULL LIMIT 20`,
      [missionId, visitId]
    ),
    db.getAllAsync(
      `SELECT id,label,description FROM mission_points
       WHERE mission_id=? AND visit_origin_id=? AND status NOT IN ('closed','cancelled')
         AND COALESCE(due_date,due_text,'')='' LIMIT 20`,
      [missionId, visitId]
    ),
    db.getFirstAsync(
      `SELECT
        (SELECT COUNT(*) FROM mission_template_values WHERE visit_id=? AND field_code NOT LIKE '__meta.%') AS fields_count,
        (SELECT COUNT(*) FROM mission_points WHERE visit_origin_id=?) AS points_count,
        (SELECT COUNT(*) FROM mission_measures WHERE visit_id=?) AS measures_count,
        (SELECT COUNT(*) FROM mission_photos WHERE visit_id=?) AS photos_count,
        (SELECT COUNT(*) FROM mission_notes WHERE visit_id=?) AS notes_count`,
      [visitId, visitId, visitId, visitId, visitId]
    ),
  ]);

  for (const e of equipmentWithoutState) {
    await pushCheck(
      db, missionId, visitId, 'equipment_state_missing', 'État équipement non évalué', 'info',
      'equipment', e.id, [e.type, e.brand, e.model].filter(Boolean).join(' · ')
    );
  }
  for (const e of equipmentWithoutPhoto) {
    await pushCheck(
      db, missionId, visitId, 'equipment_photo_missing', 'Équipement sans photo', 'info',
      'equipment', e.id, [e.type, e.brand, e.model].filter(Boolean).join(' · ')
    );
  }
  for (const e of importedUnverified) {
    await pushCheck(
      db, missionId, visitId, 'imported_unverified', 'Équipement importé non vérifié sur le terrain', 'warning',
      'equipment', e.id, [e.type, e.brand, e.model].filter(Boolean).join(' · ')
    );
  }
  for (const p of openPointsNoResponsible) {
    await pushCheck(
      db, missionId, visitId, 'point_responsible_missing', 'Point ouvert sans responsable', 'warning',
      'point', p.id, p.label || p.description || 'Point'
    );
  }
  for (const p of openPointsNoDue) {
    await pushCheck(
      db, missionId, visitId, 'point_due_missing', 'Point ouvert sans échéance', 'info',
      'point', p.id, p.label || p.description || 'Point'
    );
  }

  const total = Number(emptyVisit?.fields_count || 0) + Number(emptyVisit?.points_count || 0) + Number(emptyVisit?.measures_count || 0) + Number(emptyVisit?.photos_count || 0) + Number(emptyVisit?.notes_count || 0);
  if (!total) {
    await pushCheck(db, missionId, visitId, 'visit_empty', 'Visite sans donnée saisie', 'warning', null, null, 'La visite peut être terminée malgré tout.');
  }

  return db.getAllAsync(
    `SELECT * FROM mission_visit_checks WHERE visit_id=? AND status='open'
     ORDER BY CASE severity WHEN 'warning' THEN 0 ELSE 1 END,created_at`,
    [visitId]
  );
}

export async function listerChecklistVisite(visitId) {
  const db = await getDb();
  return db.getAllAsync(
    'SELECT * FROM mission_visit_checks WHERE visit_id=? ORDER BY status,severity,created_at',
    [visitId]
  );
}

export async function ignorerCheckVisite(checkId) {
  const db = await getDb();
  await db.runAsync("UPDATE mission_visit_checks SET status='ignored',updated_at=datetime('now') WHERE id=?", [checkId]);
}
