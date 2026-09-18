import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import {
  MISSION_EXCEL_FORMAT,
  MISSION_EXCEL_SCHEMA_VERSION,
  MISSION_TABLE_BY_SHEET,
  MISSION_TABLE_IMPORT_ORDER,
} from './missionExcelSchema.js';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function rowsFromSheet(sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function firstRow(workbook, sheetName) {
  return rowsFromSheet(workbook.Sheets?.[sheetName])?.[0] || null;
}

function workbookMeta(workbook) {
  return firstRow(workbook, '00_Meta');
}

function isCanonicalWorkbook(workbook) {
  return workbookMeta(workbook)?.format === MISSION_EXCEL_FORMAT;
}

async function tableInfo(db, table) {
  return db.getAllAsync(`PRAGMA table_info(${table})`);
}

function sqlValue(value) {
  if (value === undefined || value === '') return value === '' ? '' : null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function upsertRows(db, table, rows) {
  if (!rows?.length) return 0;
  const info = await tableInfo(db, table);
  const allowed = new Set(info.map((col) => col.name));
  const pk = info.filter((col) => Number(col.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((col) => col.name);
  let count = 0;

  for (const row of rows) {
    const columns = Object.keys(row).filter((key) => allowed.has(key));
    if (!columns.length) continue;
    const values = columns.map((key) => sqlValue(row[key]));
    const placeholders = columns.map(() => '?').join(',');
    const updates = columns.filter((key) => !pk.includes(key)).map((key) => `${key}=excluded.${key}`);
    const conflict = pk.length
      ? ` ON CONFLICT(${pk.join(',')}) DO ${updates.length ? `UPDATE SET ${updates.join(',')}` : 'NOTHING'}`
      : '';
    await db.runAsync(
      `INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})${conflict}`,
      values
    );
    count += 1;
  }
  return count;
}

function getCanonicalRowsByTable(workbook) {
  const byTable = {};
  for (const [sheet, table] of Object.entries(MISSION_TABLE_BY_SHEET)) {
    byTable[table] = rowsFromSheet(workbook.Sheets?.[sheet]);
  }
  return byTable;
}

function safeSheetRows(sheet) {
  if (!sheet?.['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    headers[c - range.s.c] = normalizeText(cell?.v) || `col_${c + 1}`;
  }
  const rows = [];
  for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
    const values = {};
    const formulas = {};
    let nonEmpty = false;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const key = headers[c - range.s.c];
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const value = cell?.v ?? null;
      if (value !== null && value !== '') nonEmpty = true;
      values[key] = value;
      if (cell?.f) formulas[key] = `=${cell.f}`;
    }
    if (nonEmpty || Object.keys(formulas).length) rows.push({ rowIndex: r + 1, values, formulas });
  }
  return rows;
}

async function createImportBatch(db, missionId, { sourceName, sourceUri, sourceType = 'excel', mode = 'merge', status = 'running', summary = null }) {
  const id = createId('mimp');
  await db.runAsync(
    `INSERT INTO mission_import_batches(id,mission_id,source_name,source_uri,source_type,mode,status,summary_json)
     VALUES(?,?,?,?,?,?,?,?)`,
    [id, missionId, normalizeText(sourceName), normalizeText(sourceUri), sourceType, mode, status, summary ? JSON.stringify(summary) : null]
  );
  return id;
}

async function finishImportBatch(db, batchId, status, summary) {
  await db.runAsync(
    `UPDATE mission_import_batches SET status=?,summary_json=?,completed_at=? WHERE id=?`,
    [status, JSON.stringify(summary || {}), new Date().toISOString(), batchId]
  );
}

async function addImportIssue(db, batchId, { severity = 'warning', entityType = null, sourceRef = null, message, suggestion = null }) {
  await db.runAsync(
    `INSERT INTO mission_import_issues(id,batch_id,severity,entity_type,source_ref,message,suggestion)
     VALUES(?,?,?,?,?,?,?)`,
    [createId('mimpi'), batchId, severity, entityType, sourceRef, message, suggestion]
  );
}

async function ensureExternalImportMission(db, sourceName) {
  const missionId = createId('mis');
  const now = new Date().toISOString();
  const label = normalizeText(sourceName?.replace(/\.xlsx?$/i, '')) || 'Import Excel';
  await db.runAsync(
    `INSERT INTO missions(id,family,type,label,status,start_date,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [missionId, 'campagne_multisites', 'import_excel_externe', label, 'draft', now.slice(0, 10), now, now]
  );
  await db.runAsync(
    `INSERT INTO mission_phases(id,mission_id,type,label,status,sort_order) VALUES(?,?,?,?,?,?)`,
    [createId('mph'), missionId, 'preparation', 'Préparation / import', 'planned', 0]
  );
  return missionId;
}

async function preserveRawWorkbook(db, missionId, workbook, source) {
  const batchId = await createImportBatch(db, missionId, { ...source, mode: 'raw_external' });
  let totalRows = 0;
  try {
    for (const sheetName of workbook.SheetNames || []) {
      const rows = safeSheetRows(workbook.Sheets?.[sheetName]);
      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO mission_import_rows(id,batch_id,sheet_name,row_index,row_json) VALUES(?,?,?,?,?)`,
          [createId('mimpr'), batchId, sheetName, row.rowIndex, JSON.stringify({ values: row.values, formulas: row.formulas })]
        );
        totalRows += 1;
      }
    }
    await addImportIssue(db, batchId, {
      severity: 'info',
      entityType: 'workbook',
      sourceRef: source.sourceName,
      message: 'Classeur externe conservé intégralement avant mapping métier.',
      suggestion: 'Utiliser ensuite le mapping METRA pour transformer les feuilles en Sites, Équipements, Mesures, Actions ou autres objets.',
    });
    const summary = { mode: 'raw_external', sheets: workbook.SheetNames?.length || 0, rows: totalRows };
    await finishImportBatch(db, batchId, 'completed', summary);
    return { missionId, batchId, ...summary, canonical: false };
  } catch (error) {
    await finishImportBatch(db, batchId, 'failed', { error: String(error?.message || error), rows: totalRows });
    throw error;
  }
}

async function importCanonicalWorkbook(db, workbook, source) {
  const meta = workbookMeta(workbook) || {};
  const tables = getCanonicalRowsByTable(workbook);
  const missionRow = tables.missions?.[0];
  if (!missionRow?.id) throw new Error('Classeur METRA invalide : identifiant Mission absent.');

  const version = Number(meta.schema_version || 0);
  if (version > MISSION_EXCEL_SCHEMA_VERSION) {
    throw new Error(`Ce classeur utilise un schéma Missions plus récent (v${version}) que cette application (v${MISSION_EXCEL_SCHEMA_VERSION}).`);
  }

  let batchId = null;
  const counts = {};
  await db.withTransactionAsync(async () => {
    // Les classeurs peuvent contenir une hiérarchie dont le parent se trouve
    // après l'enfant (localisations, relations). On diffère donc les FK jusqu'au
    // commit tout en conservant l'intégrité finale.
    await db.execAsync('PRAGMA defer_foreign_keys=ON');
    for (const table of MISSION_TABLE_IMPORT_ORDER) {
      counts[table] = await upsertRows(db, table, tables[table] || []);
    }
    batchId = await createImportBatch(db, missionRow.id, { ...source, mode: 'canonical_roundtrip' });
    await finishImportBatch(db, batchId, 'completed', { format: meta.format, schemaVersion: version, counts });
  });
  return { missionId: missionRow.id, batchId, canonical: true, counts, schemaVersion: version };
}

export async function importerMissionDepuisExcelUri({ uri, name = 'Mission.xlsx', targetMissionId = null } = {}) {
  if (!uri) throw new Error('Fichier Excel manquant.');
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: 'base64', cellFormula: true, cellDates: false });
  const db = await getDb();
  const source = { sourceName: name, sourceUri: uri, sourceType: 'excel' };

  if (isCanonicalWorkbook(workbook)) return importCanonicalWorkbook(db, workbook, source);
  const missionId = targetMissionId || await ensureExternalImportMission(db, name);
  return preserveRawWorkbook(db, missionId, workbook, source);
}

export async function choisirEtImporterMissionExcel({ targetMissionId = null } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier Excel non accessible.');
  return importerMissionDepuisExcelUri({ uri: asset.uri, name: asset.name || 'Mission.xlsx', targetMissionId });
}
