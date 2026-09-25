import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(v) {
  const s = String(v ?? '').trim();
  return s || null;
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function ensureSite(db, missionId, name, code = null, city = null, address = null) {
  const n = clean(name);
  if (!n) return null;
  const existing = await db.getFirstAsync(
    `SELECT s.id FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id
     WHERE l.mission_id=? AND LOWER(TRIM(s.name))=LOWER(TRIM(?)) LIMIT 1`,
    [missionId, n]
  );
  if (existing?.id) return existing.id;
  const id = createId('msite');
  await db.runAsync('INSERT INTO mission_sites(id,code,name,city,address) VALUES(?,?,?,?,?)', [
    id,
    clean(code),
    n,
    clean(city),
    clean(address)
  ]);
  await db.runAsync('INSERT INTO mission_site_links(mission_id,site_id) VALUES(?,?)', [missionId, id]);
  return id;
}

async function ensureActor(db, missionId, siteId, label) {
  const n = clean(label);
  if (!n) return null;
  const existing = await db.getFirstAsync(
    "SELECT id FROM mission_actors WHERE mission_id=? AND LOWER(COALESCE(company,name,''))=LOWER(?) LIMIT 1",
    [missionId, n]
  );
  if (existing?.id) return existing.id;
  const id = createId('mactor');
  await db.runAsync('INSERT INTO mission_actors(id,mission_id,site_id,company,role,actor_type) VALUES(?,?,?,?,?,?)', [
    id,
    missionId,
    clean(siteId),
    n,
    'Responsable',
    'responsible'
  ]);
  return id;
}

function fieldValue(values, map, target) {
  const source = map?.[target];
  return source ? values?.[source] : null;
}

export async function listerImportsMission(missionId) {
  const db = await getDb();
  const batches = await db.getAllAsync(
    'SELECT * FROM mission_import_batches WHERE mission_id=? ORDER BY created_at DESC',
    [missionId]
  );
  const issues = await db.getAllAsync(
    `SELECT i.* FROM mission_import_issues i JOIN mission_import_batches b ON b.id=i.batch_id
     WHERE b.mission_id=? ORDER BY i.status,i.severity,i.created_at DESC`,
    [missionId]
  );
  return { batches, issues };
}

export async function getImportBatchStructure(batchId, limit = 50) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT * FROM mission_import_rows WHERE batch_id=? ORDER BY sheet_name,row_index LIMIT ?',
    [batchId, Math.max(1, Math.min(500, Number(limit) || 50))]
  );
  const bySheet = {};
  for (const row of rows) {
    const parsed = parse(row.row_json, {});
    const values = parsed.values || {};
    if (!bySheet[row.sheet_name]) bySheet[row.sheet_name] = { columns: new Set(), rows: [] };
    Object.keys(values).forEach((key) => bySheet[row.sheet_name].columns.add(key));
    bySheet[row.sheet_name].rows.push({ ...row, values, formulas: parsed.formulas || {} });
  }
  return Object.entries(bySheet).map(([sheetName, data]) => ({
    sheetName,
    columns: [...data.columns],
    rows: data.rows
  }));
}

export async function listerMappingsImportMission(missionId) {
  const db = await getDb();
  return db.getAllAsync(
    'SELECT * FROM mission_import_mappings WHERE mission_id IS NULL OR mission_id=? ORDER BY is_default DESC,updated_at DESC',
    [missionId]
  );
}

export async function enregistrerMappingImportMission({
  missionId = null,
  name,
  sourceSignature = null,
  entityType,
  sheetName = null,
  fieldMap = {},
  isDefault = false
} = {}) {
  const db = await getDb();
  const id = createId('mmapx');
  await db.runAsync(
    'INSERT INTO mission_import_mappings(id,mission_id,name,source_signature,mapping_json,is_default) VALUES(?,?,?,?,?,?)',
    [
      id,
      missionId,
      clean(name) || 'Mapping Excel',
      clean(sourceSignature),
      JSON.stringify({ entityType, sheetName, fieldMap }),
      isDefault ? 1 : 0
    ]
  );
  return id;
}

export async function appliquerMappingImportMission({ missionId, batchId, mappingId } = {}) {
  const db = await getDb();
  const mappingRow = await db.getFirstAsync('SELECT * FROM mission_import_mappings WHERE id=?', [mappingId]);
  if (!mappingRow) throw new Error('Mapping introuvable.');
  const mapping = parse(mappingRow.mapping_json, {});
  const rows = await db.getAllAsync(
    'SELECT * FROM mission_import_rows WHERE batch_id=?' +
      (mapping.sheetName ? ' AND sheet_name=?' : '') +
      ' ORDER BY sheet_name,row_index',
    mapping.sheetName ? [batchId, mapping.sheetName] : [batchId]
  );
  const summary = { created: 0, skipped: 0, errors: 0 };

  for (const rawRow of rows) {
    const payload = parse(rawRow.row_json, {});
    const values = payload.values || {};
    try {
      if (mapping.entityType === 'site') {
        const name = fieldValue(values, mapping.fieldMap, 'name');
        if (!clean(name)) {
          summary.skipped += 1;
          continue;
        }
        const id = await ensureSite(
          db,
          missionId,
          name,
          fieldValue(values, mapping.fieldMap, 'code'),
          fieldValue(values, mapping.fieldMap, 'city'),
          fieldValue(values, mapping.fieldMap, 'address')
        );
        await db.runAsync('UPDATE mission_import_rows SET mapped_entity_type=?,mapped_entity_id=? WHERE id=?', [
          'site',
          id,
          rawRow.id
        ]);
        summary.created += 1;
        continue;
      }

      const siteName = fieldValue(values, mapping.fieldMap, 'site');
      let siteId = await ensureSite(db, missionId, siteName);
      if (!siteId) {
        const linked = await db.getAllAsync('SELECT site_id FROM mission_site_links WHERE mission_id=?', [missionId]);
        if (linked.length === 1) siteId = linked[0].site_id;
      }

      if (mapping.entityType === 'equipment') {
        const type = clean(fieldValue(values, mapping.fieldMap, 'type'));
        if (!siteId || !type) {
          summary.skipped += 1;
          continue;
        }
        const id = createId('meq');
        const properties = {
          quantity: num(fieldValue(values, mapping.fieldMap, 'quantity')) || 1,
          network: clean(fieldValue(values, mapping.fieldMap, 'network')),
          sourceRow: rawRow.row_index,
          sourceSheet: rawRow.sheet_name
        };
        await db.runAsync(
          `INSERT INTO mission_equipment(id,site_id,type,brand,model,installation_year,state,properties_json,source_type,source_id,verification_status)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            siteId,
            type,
            clean(fieldValue(values, mapping.fieldMap, 'brand')),
            clean(fieldValue(values, mapping.fieldMap, 'model')),
            clean(fieldValue(values, mapping.fieldMap, 'installation_year')),
            clean(fieldValue(values, mapping.fieldMap, 'state')) || 'non_evalue',
            JSON.stringify(properties),
            'excel_mapping',
            rawRow.sheet_name + '!' + rawRow.row_index,
            'non_verifie'
          ]
        );
        await db.runAsync('UPDATE mission_import_rows SET mapped_entity_type=?,mapped_entity_id=? WHERE id=?', [
          'equipment',
          id,
          rawRow.id
        ]);
        summary.created += 1;
        continue;
      }

      if (mapping.entityType === 'action') {
        const label = clean(fieldValue(values, mapping.fieldMap, 'label'));
        if (!label) {
          summary.skipped += 1;
          continue;
        }
        const actorId = await ensureActor(db, missionId, siteId, fieldValue(values, mapping.fieldMap, 'responsible'));
        const id = createId('mact');
        await db.runAsync(
          `INSERT INTO mission_actions(id,mission_id,site_id,label,status,priority,responsible_actor_id,due_text,cost_estimate,allocation)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            missionId,
            siteId,
            label,
            clean(fieldValue(values, mapping.fieldMap, 'status')) || 'open',
            clean(fieldValue(values, mapping.fieldMap, 'priority')),
            actorId,
            clean(fieldValue(values, mapping.fieldMap, 'due')),
            num(fieldValue(values, mapping.fieldMap, 'cost')),
            clean(fieldValue(values, mapping.fieldMap, 'allocation'))
          ]
        );
        await db.runAsync('UPDATE mission_import_rows SET mapped_entity_type=?,mapped_entity_id=? WHERE id=?', [
          'action',
          id,
          rawRow.id
        ]);
        summary.created += 1;
        continue;
      }

      if (mapping.entityType === 'measure') {
        const type = clean(fieldValue(values, mapping.fieldMap, 'type'));
        const value = num(fieldValue(values, mapping.fieldMap, 'value'));
        const valueText = clean(fieldValue(values, mapping.fieldMap, 'value_text'));
        if (!type || (value === null && !valueText)) {
          summary.skipped += 1;
          continue;
        }
        const id = createId('mmeas');
        await db.runAsync(
          'INSERT INTO mission_measures(id,mission_id,site_id,type,value_number,value_text,unit,source_type,source_id) VALUES(?,?,?,?,?,?,?,?,?)',
          [
            id,
            missionId,
            siteId,
            type,
            value,
            valueText,
            clean(fieldValue(values, mapping.fieldMap, 'unit')),
            'excel_mapping',
            rawRow.sheet_name + '!' + rawRow.row_index
          ]
        );
        await db.runAsync('UPDATE mission_import_rows SET mapped_entity_type=?,mapped_entity_id=? WHERE id=?', [
          'measure',
          id,
          rawRow.id
        ]);
        summary.created += 1;
        continue;
      }

      summary.skipped += 1;
    } catch (e) {
      summary.errors += 1;
      await db.runAsync(
        'INSERT INTO mission_import_issues(id,batch_id,severity,entity_type,source_ref,message,suggestion) VALUES(?,?,?,?,?,?,?)',
        [
          createId('mimpi'),
          batchId,
          'warning',
          mapping.entityType,
          rawRow.sheet_name + '!' + rawRow.row_index,
          String(e?.message || e),
          'Vérifier le mapping de cette ligne.'
        ]
      );
    }
  }

  await db.runAsync('UPDATE mission_import_batches SET summary_json=?,completed_at=? WHERE id=?', [
    JSON.stringify({ mappingId, entityType: mapping.entityType, ...summary }),
    new Date().toISOString(),
    batchId
  ]);
  return summary;
}
