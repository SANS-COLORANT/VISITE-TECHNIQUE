import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { creerFichierSaf, garantirCheminMetra, nettoyerSegment } from './metraStorage.js';
import { MISSION_EXCEL_FORMAT, MISSION_EXCEL_SCHEMA_VERSION, MISSION_EXCEL_SHEETS } from './missionExcelSchema.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function appendJsonSheet(wb, name, rows = []) {
  const safeRows = rows.length ? rows : [{}];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
}

const QUERIES = Object.freeze({
  missions: `SELECT * FROM missions WHERE id=?`,
  mission_clients: `SELECT c.* FROM mission_clients c WHERE c.id=(SELECT client_id FROM missions WHERE id=?)`,
  mission_sites: `SELECT s.* FROM mission_sites s JOIN mission_site_links ms ON ms.site_id=s.id WHERE ms.mission_id=? ORDER BY s.name`,
  mission_site_links: `SELECT * FROM mission_site_links WHERE mission_id=?`,
  mission_locations: `SELECT l.* FROM mission_locations l WHERE l.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY l.site_id,l.sort_order,l.label`,
  mission_phases: `SELECT * FROM mission_phases WHERE mission_id=? ORDER BY sort_order`,
  mission_visits: `SELECT * FROM mission_visits WHERE mission_id=? ORDER BY created_at`,
  mission_points: `SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at`,
  mission_point_history: `SELECT h.* FROM mission_point_history h JOIN mission_points p ON p.id=h.point_id WHERE p.mission_id=? ORDER BY h.created_at`,
  mission_point_actors: `SELECT pa.* FROM mission_point_actors pa JOIN mission_points p ON p.id=pa.point_id WHERE p.mission_id=?`,
  mission_actors: `SELECT * FROM mission_actors WHERE mission_id=? ORDER BY company,name`,
  mission_equipment: `SELECT e.* FROM mission_equipment e WHERE e.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY e.site_id,e.type,e.brand,e.model`,
  mission_measures: `SELECT * FROM mission_measures WHERE mission_id=? ORDER BY created_at`,
  mission_photos: `SELECT * FROM mission_photos WHERE mission_id=? ORDER BY created_at`,
  mission_documents: `SELECT * FROM mission_documents WHERE mission_id=? ORDER BY created_at`,
  mission_notes: `SELECT * FROM mission_notes WHERE mission_id=? ORDER BY created_at`,
  mission_template_values: `SELECT * FROM mission_template_values WHERE mission_id=? ORDER BY visit_id,field_code`,
  mission_workstreams: `SELECT * FROM mission_workstreams WHERE mission_id=? ORDER BY sort_order,created_at`,
  mission_subjects: `SELECT * FROM mission_subjects WHERE mission_id=? ORDER BY created_at`,
  mission_observations: `SELECT * FROM mission_observations WHERE mission_id=? ORDER BY created_at`,
  mission_hypotheses: `SELECT * FROM mission_hypotheses WHERE mission_id=? ORDER BY created_at`,
  mission_decisions: `SELECT * FROM mission_decisions WHERE mission_id=? ORDER BY created_at`,
  mission_actions: `SELECT * FROM mission_actions WHERE mission_id=? ORDER BY created_at`,
  mission_references: `SELECT * FROM mission_references WHERE mission_id=? ORDER BY created_at`,
  mission_measure_series: `SELECT * FROM mission_measure_series WHERE mission_id=? ORDER BY created_at`,
  mission_test_protocols: `SELECT * FROM mission_test_protocols WHERE mission_id=? ORDER BY created_at`,
  mission_test_steps: `SELECT s.* FROM mission_test_steps s JOIN mission_test_protocols p ON p.id=s.protocol_id WHERE p.mission_id=? ORDER BY s.protocol_id,s.sort_order`,
  mission_test_runs: `SELECT * FROM mission_test_runs WHERE mission_id=? ORDER BY created_at`,
  mission_test_results: `SELECT r.* FROM mission_test_results r JOIN mission_test_runs tr ON tr.id=r.test_run_id WHERE tr.mission_id=? ORDER BY r.created_at`,
  mission_expected_documents: `SELECT * FROM mission_expected_documents WHERE mission_id=? ORDER BY created_at`,
  mission_validations: `SELECT * FROM mission_validations WHERE mission_id=? ORDER BY created_at`,
  mission_scenarios: `SELECT * FROM mission_scenarios WHERE mission_id=? ORDER BY created_at`,
  mission_scenario_actions: `SELECT sa.* FROM mission_scenario_actions sa JOIN mission_scenarios s ON s.id=sa.scenario_id WHERE s.mission_id=? ORDER BY sa.scenario_id,sa.sort_order`,
  mission_geometries: `SELECT * FROM mission_geometries WHERE mission_id=? ORDER BY created_at`,
  mission_equipment_relations: `SELECT * FROM mission_equipment_relations WHERE mission_id=? ORDER BY created_at`,
  mission_calculations: `SELECT * FROM mission_calculations WHERE mission_id=? ORDER BY created_at`,
  mission_photo_annotations: `SELECT a.* FROM mission_photo_annotations a JOIN mission_photos p ON p.id=a.photo_id WHERE p.mission_id=? ORDER BY a.created_at`,
  mission_signatures: `SELECT * FROM mission_signatures WHERE mission_id=? ORDER BY created_at`,
  mission_equipment_lifecycle: `SELECT * FROM mission_equipment_lifecycle WHERE mission_id=? ORDER BY created_at`,
  mission_provenance: `SELECT * FROM mission_provenance WHERE mission_id=? ORDER BY created_at`,
  mission_report_profiles: `SELECT * FROM mission_report_profiles WHERE mission_id=? ORDER BY created_at`,
  mission_report_sections: `SELECT * FROM mission_report_sections WHERE mission_id=? ORDER BY scope_type,scope_id,sort_order`,
  mission_report_outputs: `SELECT * FROM mission_report_outputs WHERE mission_id=? ORDER BY created_at`,
  mission_point_details: `SELECT d.* FROM mission_point_details d JOIN mission_points p ON p.id=d.point_id WHERE p.mission_id=?`,
  mission_measure_details: `SELECT d.* FROM mission_measure_details d JOIN mission_measures m ON m.id=d.measure_id WHERE m.mission_id=?`,
  mission_import_batches: `SELECT * FROM mission_import_batches WHERE mission_id=? ORDER BY created_at`,
  mission_import_issues: `SELECT i.* FROM mission_import_issues i JOIN mission_import_batches b ON b.id=i.batch_id WHERE b.mission_id=? ORDER BY i.created_at`,
  mission_import_rows: `SELECT r.* FROM mission_import_rows r JOIN mission_import_batches b ON b.id=r.batch_id WHERE b.mission_id=? ORDER BY r.sheet_name,r.row_index`,
  mission_installations: `SELECT * FROM mission_installations WHERE mission_id=? ORDER BY site_id,location_id,label`,
  mission_systems: `SELECT * FROM mission_systems WHERE mission_id=? ORDER BY installation_id,label`,
  mission_networks: `SELECT * FROM mission_networks WHERE mission_id=? ORDER BY installation_id,system_id,label`,
  mission_components: `SELECT * FROM mission_components WHERE mission_id=? ORDER BY equipment_id,label`,
  mission_plan_layers: `SELECT * FROM mission_plan_layers WHERE mission_id=? ORDER BY document_id,sort_order`,
  mission_plan_calibrations: `SELECT * FROM mission_plan_calibrations WHERE mission_id=? ORDER BY document_id,page_number`,
  mission_plan_annotations: `SELECT * FROM mission_plan_annotations WHERE mission_id=? ORDER BY document_id,page_number,created_at`,
  mission_map_layers: `SELECT * FROM mission_map_layers WHERE mission_id=? ORDER BY created_at`,
  mission_import_mappings: `SELECT * FROM mission_import_mappings WHERE mission_id=? OR mission_id IS NULL ORDER BY is_default DESC,created_at`,
  mission_formula_library: `SELECT * FROM mission_formula_library WHERE mission_id=? OR mission_id IS NULL ORDER BY scope,label`,
  mission_measurement_instruments: `SELECT * FROM mission_measurement_instruments WHERE mission_id=? ORDER BY label`,
  mission_custom_measure_types: `SELECT * FROM mission_custom_measure_types WHERE mission_id=? OR mission_id IS NULL ORDER BY label`,
  mission_ocr_jobs: `SELECT * FROM mission_ocr_jobs WHERE mission_id=? ORDER BY created_at`,
  mission_voice_notes: `SELECT * FROM mission_voice_notes WHERE mission_id=? ORDER BY created_at`,
  mission_visit_checks: `SELECT * FROM mission_visit_checks WHERE mission_id=? ORDER BY visit_id,severity,created_at`,
  mission_document_extractions: `SELECT * FROM mission_document_extractions WHERE mission_id=? ORDER BY document_id,page_number,created_at`,
  mission_document_review_items: `SELECT * FROM mission_document_review_items WHERE mission_id=? ORDER BY document_id,status,created_at`,
});

async function chargerExportMission(missionId) {
  const db = await getDb();
  const mission = await db.getFirstAsync(`SELECT * FROM missions WHERE id=?`, [missionId]);
  if (!mission) throw new Error('Mission introuvable.');

  const tables = {};
  for (const [, table] of MISSION_EXCEL_SHEETS) {
    const sql = QUERIES[table];
    if (!sql) throw new Error(`Export Excel non configuré pour ${table}.`);
    tables[table] = await db.getAllAsync(sql, [missionId]);
  }
  return { mission, tables };
}

export async function construireClasseurMission(missionId) {
  const data = await chargerExportMission(missionId);
  const wb = XLSX.utils.book_new();
  appendJsonSheet(wb, '00_Meta', [{
    format: MISSION_EXCEL_FORMAT,
    schema_version: MISSION_EXCEL_SCHEMA_VERSION,
    mission_id: missionId,
    exported_at: new Date().toISOString(),
    note: 'Classeur relationnel METRA Missions. Les identifiants assurent les liaisons entre feuilles. Les médias restent référencés par URI.',
  }]);
  appendJsonSheet(wb, '00_LisezMoi', [
    { regle: 'Import / export', detail: 'Toutes les données structurées de la Mission peuvent être réimportées depuis ce classeur.' },
    { regle: 'Identifiants', detail: 'Ne pas supprimer les colonnes id et *_id si le classeur doit être réimporté.' },
    { regle: 'Médias', detail: 'Photos, PDF et fichiers lourds ne sont pas incorporés physiquement : leurs chemins/URI sont exportés.' },
    { regle: 'Isolation', detail: 'Ce classeur ne contient aucune donnée du référentiel Intranet ni des Visites techniques récurrentes.' },
    { regle: 'Excel externe', detail: 'Un classeur non METRA peut aussi être importé : ses lignes sont conservées intégralement comme source brute avant mapping.' },
  ]);
  for (const [sheet, table] of MISSION_EXCEL_SHEETS) appendJsonSheet(wb, sheet, data.tables[table] || []);
  return { wb, data };
}

function filename(data) {
  const base = nettoyerSegment(data?.mission?.label || data?.mission?.reference || data?.mission?.id || 'Mission', 'Mission').replace(/\s+/g, '_');
  return `Mission_${base}.xlsx`;
}

export async function preparerExportMission(missionId) {
  const { wb, data } = await construireClasseurMission(missionId);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
  if (!base64 || base64.length < 100) throw new Error('Le classeur Mission généré est vide.');
  return { base64, name: filename(data), data };
}

export async function exporterMissionExcel(missionId) {
  const { base64, name, data } = await preparerExportMission(missionId);
  const clientRows = data.tables?.mission_clients || [];
  const clientName = clientRows?.[0]?.name || 'Sans_client';
  const folder = await garantirCheminMetra(['Missions', nettoyerSegment(clientName), nettoyerSegment(data.mission.label || data.mission.id), 'Exports']);
  if (folder) {
    const uri = await creerFichierSaf(folder, name, XLSX_MIME, base64);
    return { uri, name, shared: false };
  }
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const uri = `${root}${name}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: 'Exporter toutes les données de la Mission' });
    return { uri, name, shared: true };
  }
  return { uri, name, shared: false };
}
