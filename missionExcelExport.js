import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { creerFichierSaf, garantirCheminMetra, nettoyerSegment } from './metraStorage.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function appendJsonSheet(wb, name, rows = []) {
  const safeRows = rows.length ? rows : [{}];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
}

async function chargerExportMission(missionId) {
  const db = await getDb();
  const mission = await db.getFirstAsync(`SELECT * FROM missions WHERE id=?`, [missionId]);
  if (!mission) throw new Error('Mission introuvable.');

  const [clients, sites, missionSites, locations, phases, visits, points, pointHistory, pointActors, actors, equipment, measures, photos, documents, notes, templateValues] = await Promise.all([
    db.getAllAsync(`SELECT c.* FROM mission_clients c WHERE c.id=(SELECT client_id FROM missions WHERE id=?)`, [missionId]),
    db.getAllAsync(`SELECT s.* FROM mission_sites s JOIN mission_site_links ms ON ms.site_id=s.id WHERE ms.mission_id=? ORDER BY s.name`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_site_links WHERE mission_id=?`, [missionId]),
    db.getAllAsync(`SELECT l.* FROM mission_locations l WHERE l.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY l.site_id,l.sort_order,l.label`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_phases WHERE mission_id=? ORDER BY sort_order`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_visits WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT h.* FROM mission_point_history h JOIN mission_points p ON p.id=h.point_id WHERE p.mission_id=? ORDER BY h.created_at`, [missionId]),
    db.getAllAsync(`SELECT pa.* FROM mission_point_actors pa JOIN mission_points p ON p.id=pa.point_id WHERE p.mission_id=?`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_actors WHERE mission_id=? ORDER BY company,name`, [missionId]),
    db.getAllAsync(`SELECT e.* FROM mission_equipment e WHERE e.site_id IN (SELECT site_id FROM mission_site_links WHERE mission_id=?) ORDER BY e.site_id,e.type,e.brand,e.model`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_measures WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_photos WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_documents WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_notes WHERE mission_id=? ORDER BY created_at`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_template_values WHERE mission_id=? ORDER BY visit_id,field_code`, [missionId]),
  ]);

  return { mission, clients, sites, missionSites, locations, phases, visits, points, pointHistory, pointActors, actors, equipment, measures, photos, documents, notes, templateValues };
}

export async function construireClasseurMission(missionId) {
  const data = await chargerExportMission(missionId);
  const wb = XLSX.utils.book_new();
  appendJsonSheet(wb, '01_Mission', [data.mission]);
  appendJsonSheet(wb, '02_Clients', data.clients);
  appendJsonSheet(wb, '03_Sites', data.sites);
  appendJsonSheet(wb, '04_Mission_Sites', data.missionSites);
  appendJsonSheet(wb, '05_Localisations', data.locations);
  appendJsonSheet(wb, '06_Phases', data.phases);
  appendJsonSheet(wb, '07_Visites', data.visits);
  appendJsonSheet(wb, '08_Points', data.points);
  appendJsonSheet(wb, '09_Historique_Points', data.pointHistory);
  appendJsonSheet(wb, '10_Point_Acteurs', data.pointActors);
  appendJsonSheet(wb, '11_Acteurs', data.actors);
  appendJsonSheet(wb, '12_Equipements', data.equipment);
  appendJsonSheet(wb, '13_Mesures', data.measures);
  appendJsonSheet(wb, '14_Photos', data.photos);
  appendJsonSheet(wb, '15_Documents', data.documents);
  appendJsonSheet(wb, '16_Notes', data.notes);
  appendJsonSheet(wb, '17_Valeurs_Trames', data.templateValues);
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
  const clientName = data.clients?.[0]?.name || 'Sans_client';
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
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: 'Exporter les données de la Mission' });
    return { uri, name, shared: true };
  }
  return { uri, name, shared: false };
}
