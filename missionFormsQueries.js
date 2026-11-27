/**
 * Trames Missions — lectures / écritures SQLite (fonctions pures recevant `db`,
 * testées sous Node avec node:sqlite et toutes les migrations).
 * Tables Missions uniquement : aucune donnée Intranet.
 */
import { fieldsChanged, normalizeFormFields, summarizeEntry, VERDICTS } from './missionFormEngine.js';

const text = (value) => {
  const out = String(value ?? '').trim();
  return out || null;
};
const now = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const json = (raw, fallback) => {
  if (raw == null || raw === '') return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

// ------------------------------------------------------------------ trames
export async function queryForms(db, { includeArchived = false } = {}) {
  return db.getAllAsync(
    `SELECT f.*,
            (SELECT COUNT(*) FROM mission_form_entries e WHERE e.form_id=f.id) AS entry_count,
            (SELECT COUNT(*) FROM mission_form_links l WHERE l.form_id=f.id) AS mission_count
       FROM mission_forms f
      WHERE ${includeArchived ? '1=1' : 'f.archived=0'}
      ORDER BY f.updated_at DESC, f.label COLLATE NOCASE`
  );
}

export async function getForm(db, formId) {
  return db.getFirstAsync('SELECT * FROM mission_forms WHERE id=?', [formId]);
}

/** Crée ou met à jour une trame ; la version augmente quand les champs changent. */
export async function saveForm(db, { id = null, label, description = null, targetType = 'mission', fields = [], source = null }) {
  const name = text(label);
  if (!name) throw new Error('Nom de la trame requis.');
  const clean = normalizeFormFields(fields);
  const fieldsJson = JSON.stringify(clean);
  if (id) {
    const before = await getForm(db, id);
    if (!before) throw new Error('Trame introuvable.');
    const version = fieldsChanged(before.fields_json, clean) ? Number(before.version || 1) + 1 : Number(before.version || 1);
    await db.runAsync(
      'UPDATE mission_forms SET label=?, description=?, target_type=?, fields_json=?, version=?, updated_at=? WHERE id=?',
      [name, text(description), text(targetType) || 'mission', fieldsJson, version, now(), id]
    );
    return id;
  }
  const formId = newId('mform');
  await db.runAsync(
    'INSERT INTO mission_forms(id,label,description,target_type,fields_json,version,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [formId, name, text(description), text(targetType) || 'mission', fieldsJson, 1, text(source), now(), now()]
  );
  return formId;
}

export async function duplicateForm(db, formId) {
  const form = await getForm(db, formId);
  if (!form) throw new Error('Trame introuvable.');
  return saveForm(db, { label: `${form.label} (copie)`, description: form.description, targetType: form.target_type, fields: json(form.fields_json, []) });
}

/** Supprime une trame jamais remplie ; une trame qui a des fiches est archivée (fiches conservées). */
export async function removeForm(db, formId) {
  const used = await db.getFirstAsync('SELECT COUNT(*) AS n FROM mission_form_entries WHERE form_id=?', [formId]);
  if (Number(used?.n || 0) > 0) {
    await db.runAsync('UPDATE mission_forms SET archived=1, updated_at=? WHERE id=?', [now(), formId]);
    return 'archived';
  }
  await db.runAsync('DELETE FROM mission_forms WHERE id=?', [formId]);
  return 'deleted';
}

// ---------------------------------------------------------- rattachements
export async function queryMissionForms(db, missionId) {
  return db.getAllAsync(
    `SELECT f.*, l.sort_order,
            (SELECT COUNT(*) FROM mission_form_entries e WHERE e.form_id=f.id AND e.mission_id=l.mission_id) AS entry_count,
            (SELECT COUNT(*) FROM mission_form_entries e WHERE e.form_id=f.id AND e.mission_id=l.mission_id AND e.status='done') AS done_count
       FROM mission_form_links l JOIN mission_forms f ON f.id=l.form_id
      WHERE l.mission_id=?
      ORDER BY l.sort_order, l.created_at`,
    [missionId]
  );
}

export async function attachForm(db, missionId, formId) {
  const max = await db.getFirstAsync('SELECT COALESCE(MAX(sort_order),-1) AS m FROM mission_form_links WHERE mission_id=?', [missionId]);
  await db.runAsync('INSERT OR IGNORE INTO mission_form_links(mission_id,form_id,sort_order,created_at) VALUES(?,?,?,?)', [missionId, formId, Number(max?.m ?? -1) + 1, now()]);
}

/** Retire la trame de la Mission ; les fiches déjà remplies restent. */
export async function detachForm(db, missionId, formId) {
  await db.runAsync('DELETE FROM mission_form_links WHERE mission_id=? AND form_id=?', [missionId, formId]);
}

// ------------------------------------------------------------------ fiches
export async function queryEntries(db, missionId, formId = null) {
  return db.getAllAsync(
    `SELECT * FROM mission_form_entries WHERE mission_id=? ${formId ? 'AND form_id=?' : ''} ORDER BY status='done', updated_at DESC`,
    formId ? [missionId, formId] : [missionId]
  );
}

export async function getEntry(db, entryId) {
  return db.getFirstAsync('SELECT * FROM mission_form_entries WHERE id=?', [entryId]);
}

export async function createEntry(db, { missionId, formId, targetType = null, targetId = null, targetLabel = null, visitId = null }) {
  const form = await getForm(db, formId);
  if (!form) throw new Error('Trame introuvable.');
  const id = newId('mfe');
  await db.runAsync(
    `INSERT INTO mission_form_entries(id,mission_id,form_id,form_version,target_type,target_id,target_label,visit_id,values_json,status,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, missionId, formId, form.version, text(targetType) || form.target_type, text(targetId), text(targetLabel), text(visitId), '{}', 'draft', now(), now()]
  );
  return id;
}

/** Enregistrement automatique : chaque modification est gardée, même incomplète. */
export async function saveEntryValues(db, entryId, values) {
  await db.runAsync('UPDATE mission_form_entries SET values_json=?, updated_at=? WHERE id=?', [JSON.stringify(values || {}), now(), entryId]);
}

/**
 * Termine une fiche. Chaque avis « Non conforme » d'un champ qui le demande
 * crée une réserve (une seule fois par champ, même si on termine plusieurs fois).
 */
export async function completeEntry(db, entryId) {
  const entry = await getEntry(db, entryId);
  if (!entry) throw new Error('Fiche introuvable.');
  const form = await getForm(db, entry.form_id);
  const fields = normalizeFormFields(form?.fields_json);
  const values = json(entry.values_json, {});
  const { nonConform } = summarizeEntry(fields, values);
  const created = { ...(values.__reserves || {}) };
  const newReserves = [];
  await db.withTransactionAsync(async () => {
    for (const key of nonConform) {
      const field = fields.find((f) => f.key === key);
      if (!field?.reserveOnNok || created[key]) continue;
      const pointId = newId('mpt');
      const stamp = now();
      const label = `${field.label}${entry.target_label ? ` — ${entry.target_label}` : ''}`;
      const detail = [`${VERDICTS.find((v) => v.key === 'nok').label} · trame « ${form.label} »`, values[`${key}__note`]].filter(Boolean).join('\n');
      await db.runAsync(
        `INSERT INTO mission_points(id,mission_id,site_id,visit_origin_id,location_id,equipment_id,type,label,description,status,source_type,source_id,source_date,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [pointId, entry.mission_id, entry.target_type === 'site' ? entry.target_id : null, entry.visit_id, entry.target_type === 'location' ? entry.target_id : null, entry.target_type === 'equipment' ? entry.target_id : null, 'reserve', label, detail, 'open', 'form_entry', entry.id, stamp, stamp, stamp]
      );
      await db.runAsync(
        'INSERT INTO mission_point_history(id,point_id,visit_id,status_before,status_after,comment,source,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [newId('mphist'), pointId, entry.visit_id, null, 'open', `Créée par la trame « ${form.label} »`, 'form_entry', stamp]
      );
      created[key] = pointId;
      newReserves.push(pointId);
    }
    const nextValues = Object.keys(created).length ? { ...values, __reserves: created } : values;
    await db.runAsync('UPDATE mission_form_entries SET values_json=?, status=?, completed_at=?, updated_at=? WHERE id=?', [JSON.stringify(nextValues), 'done', now(), now(), entryId]);
  });
  return { reserves: newReserves };
}

export async function reopenEntry(db, entryId) {
  await db.runAsync("UPDATE mission_form_entries SET status='draft', completed_at=NULL, updated_at=? WHERE id=?", [now(), entryId]);
}

export async function deleteEntry(db, entryId) {
  await db.runAsync('DELETE FROM mission_form_entries WHERE id=?', [entryId]);
}

/** Cibles possibles d'une fiche : sites, locaux ou équipements de la Mission. */
export async function queryFormTargets(db, missionId, targetType) {
  if (targetType === 'site') {
    return db.getAllAsync('SELECT s.id, s.name AS label FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name COLLATE NOCASE', [missionId]);
  }
  if (targetType === 'location') {
    return db.getAllAsync(
      `SELECT lo.id, lo.label || ' · ' || s.name AS label FROM mission_locations lo JOIN mission_sites s ON s.id=lo.site_id
        WHERE lo.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY s.name, lo.sort_order, lo.label`,
      [missionId]
    );
  }
  if (targetType === 'equipment') {
    return db.getAllAsync(
      `SELECT e.id, TRIM(COALESCE(e.type,'Équipement') || ' ' || COALESCE(e.brand,'') || ' ' || COALESCE(e.model,'')) || ' · ' || s.name AS label
         FROM mission_equipment e JOIN mission_sites s ON s.id=e.site_id
        WHERE e.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY s.name, e.type, e.brand`,
      [missionId]
    );
  }
  return [];
}

// ------------------------------------------------------ listes de référence
export async function queryRefLists(db) {
  return db.getAllAsync('SELECT * FROM mission_ref_lists ORDER BY label COLLATE NOCASE');
}

export function cleanListItems(items) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const item = String(raw ?? '').trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    out.push(item);
  }
  return out;
}

export async function saveRefList(db, { id = null, label, items = [], sourceName = null }) {
  const name = text(label);
  if (!name) throw new Error('Nom de la liste requis.');
  const itemsJson = JSON.stringify(cleanListItems(items));
  if (id) {
    await db.runAsync('UPDATE mission_ref_lists SET label=?, items_json=?, source_name=COALESCE(?,source_name), updated_at=? WHERE id=?', [name, itemsJson, text(sourceName), now(), id]);
    return id;
  }
  const listId = newId('mlist');
  await db.runAsync('INSERT INTO mission_ref_lists(id,label,items_json,source_name,created_at,updated_at) VALUES(?,?,?,?,?,?)', [listId, name, itemsJson, text(sourceName), now(), now()]);
  return listId;
}

export async function deleteRefList(db, listId) {
  await db.runAsync('DELETE FROM mission_ref_lists WHERE id=?', [listId]);
}

// --------------------------------------------------------- modèles Word
export async function queryReportTemplates(db) {
  return db.getAllAsync('SELECT * FROM mission_report_templates ORDER BY updated_at DESC');
}

export async function insertReportTemplate(db, { label, fileUri, originalName = null, tags = [] }) {
  const id = newId('mtpl');
  await db.runAsync(
    'INSERT INTO mission_report_templates(id,label,file_uri,original_name,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    [id, text(label) || 'Modèle Word', fileUri, text(originalName), JSON.stringify(tags), now(), now()]
  );
  return id;
}

export async function deleteReportTemplate(db, id) {
  const row = await db.getFirstAsync('SELECT file_uri FROM mission_report_templates WHERE id=?', [id]);
  await db.runAsync('DELETE FROM mission_report_templates WHERE id=?', [id]);
  return row?.file_uri || null;
}

/** Tout ce qu'il faut pour remplir un modèle Word pour une Mission. */
export async function queryTemplateSource(db, missionId) {
  const [mission, sites, points, measures, visits, forms, entries] = await Promise.all([
    db.getFirstAsync('SELECT m.*, c.name AS client_name FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id WHERE m.id=?', [missionId]),
    db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
    db.getAllAsync('SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT m.*, d.measured_at FROM mission_measures m LEFT JOIN mission_measure_details d ON d.measure_id=m.id WHERE m.mission_id=? ORDER BY COALESCE(d.measured_at,m.created_at)', [missionId]),
    db.getAllAsync('SELECT * FROM mission_visits WHERE mission_id=? ORDER BY COALESCE(visit_date,created_at)', [missionId]),
    db.getAllAsync(
      `SELECT DISTINCT f.* FROM mission_forms f
        WHERE f.id IN (SELECT form_id FROM mission_form_links WHERE mission_id=?) OR f.id IN (SELECT form_id FROM mission_form_entries WHERE mission_id=?)
        ORDER BY f.label`,
      [missionId, missionId]
    ),
    db.getAllAsync('SELECT * FROM mission_form_entries WHERE mission_id=? ORDER BY created_at', [missionId]),
  ]);
  return { mission, sites, points, measures, visits, forms, entries };
}
