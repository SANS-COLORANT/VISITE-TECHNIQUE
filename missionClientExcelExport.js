import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { creerFichierSaf, garantirCheminMetra, nettoyerSegment } from './metraStorage.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STATUS = Object.freeze({
  open: 'Ouverte',
  in_progress: 'En cours',
  waiting: 'En attente',
  to_check: 'À contrôler',
  closed: 'Clôturée',
  cancelled: 'Annulée',
  no_follow_up: 'Sans suite',
  measured: 'Mesuré',
  planned: 'À faire',
  draft: 'Brouillon',
  completed: 'Terminée',
  confirmed: 'Confirmé',
  different: 'Différent',
  non_retrouve: 'Non retrouvé',
  remplace: 'Remplacé',
  inaccessible: 'Inaccessible',
  a_verifier: 'À vérifier',
});

function clean(value) {
  const out = String(value ?? '').trim();
  return out || '';
}

function labelStatus(value) {
  return STATUS[value] || clean(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function addSheet(wb, name, rows, widths = [], autoFilter = true) {
  const safeRows = rows?.length ? rows : [{ Information: 'Aucune donnée.' }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  if (widths.length) ws['!cols'] = widths.map((wch) => ({ wch }));
  const ref = ws['!ref'];
  if (autoFilter && ref && safeRows.length > 0) {
    const range = XLSX.utils.decode_range(ref);
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: range.s, e: { r: range.s.r, c: range.e.c } }) };
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

function fileNamePart(value, fallback = 'Mission') {
  return nettoyerSegment(value || fallback, fallback).replace(/\s+/g, '_');
}

async function loadClientData(missionId) {
  const db = await getDb();
  const mission = await db.getFirstAsync(
    `SELECT m.*,c.name AS client_name
     FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id
     WHERE m.id=?`,
    [missionId]
  );
  if (!mission) throw new Error('Mission introuvable.');

  const [
    sites, visits, actions, points, equipment, measures, photos, documents, scenarios, subjects, observations, decisions,
  ] = await Promise.all([
    db.getAllAsync(
      `SELECT s.*
       FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id
       WHERE ml.mission_id=? ORDER BY s.name`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT v.*,s.name AS site_name
       FROM mission_visits v LEFT JOIN mission_sites s ON s.id=v.site_id
       WHERE v.mission_id=? ORDER BY COALESCE(v.visit_date,v.created_at),v.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT a.*,s.name AS site_name,l.label AS location_label,
        e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
        ac.company AS responsible_company,ac.name AS responsible_name,
        p.label AS source_point_label,p.type AS source_point_type
       FROM mission_actions a
       LEFT JOIN mission_sites s ON s.id=a.site_id
       LEFT JOIN mission_locations l ON l.id=a.location_id
       LEFT JOIN mission_equipment e ON e.id=a.equipment_id
       LEFT JOIN mission_actors ac ON ac.id=a.responsible_actor_id
       LEFT JOIN mission_points p ON p.id=a.source_point_id
       WHERE a.mission_id=?
       ORDER BY CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
         COALESCE(a.due_date,'9999-12-31'),a.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT p.*,s.name AS site_name,l.label AS location_label,
        e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
        ac.company AS responsible_company,ac.name AS responsible_name,
        d.cost_estimate,d.cost_currency,d.allocation,d.requested_action
       FROM mission_points p
       LEFT JOIN mission_sites s ON s.id=p.site_id
       LEFT JOIN mission_locations l ON l.id=p.location_id
       LEFT JOIN mission_equipment e ON e.id=p.equipment_id
       LEFT JOIN mission_actors ac ON ac.id=p.responsible_actor_id
       LEFT JOIN mission_point_details d ON d.point_id=p.id
       WHERE p.mission_id=?
       ORDER BY CASE p.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
         COALESCE(p.due_date,'9999-12-31'),p.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT e.*,s.name AS site_name,l.label AS location_label,
        i.label AS installation_label,sy.label AS system_label,n.label AS network_label
       FROM mission_equipment e
       JOIN mission_site_links ml ON ml.site_id=e.site_id
       LEFT JOIN mission_sites s ON s.id=e.site_id
       LEFT JOIN mission_locations l ON l.id=e.location_id
       LEFT JOIN mission_installations i ON i.id=e.installation_id
       LEFT JOIN mission_systems sy ON sy.id=e.system_id
       LEFT JOIN mission_networks n ON n.id=e.network_id
       WHERE ml.mission_id=?
       ORDER BY s.name,l.sort_order,e.type,e.brand,e.model`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT m.*,s.name AS site_name,l.label AS location_label,
        e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
        d.source_type,d.source_label,d.quality,d.delta_number,d.delta_percent,d.anomaly_status,d.measured_at,
        r.value_number AS reference_number,r.value_text AS reference_text,r.unit AS reference_unit,r.source_label AS reference_source
       FROM mission_measures m
       LEFT JOIN mission_sites s ON s.id=m.site_id
       LEFT JOIN mission_locations l ON l.id=m.location_id
       LEFT JOIN mission_equipment e ON e.id=m.equipment_id
       LEFT JOIN mission_measure_details d ON d.measure_id=m.id
       LEFT JOIN mission_references r ON r.id=d.reference_id
       WHERE m.mission_id=?
       ORDER BY COALESCE(d.measured_at,m.created_at),m.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT p.*,s.name AS site_name,l.label AS location_label,
        e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
        a.label AS action_label,pt.label AS point_label
       FROM mission_photos p
       LEFT JOIN mission_sites s ON s.id=p.site_id
       LEFT JOIN mission_locations l ON l.id=p.location_id
       LEFT JOIN mission_equipment e ON e.id=p.equipment_id
       LEFT JOIN mission_actions a ON a.id=p.action_id
       LEFT JOIN mission_points pt ON pt.id=p.point_id
       WHERE p.mission_id=?
       ORDER BY COALESCE(p.taken_at,p.created_at)`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT d.*,s.name AS site_name,l.label AS location_label,
        e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model
       FROM mission_documents d
       LEFT JOIN mission_sites s ON s.id=d.site_id
       LEFT JOIN mission_locations l ON l.id=d.location_id
       LEFT JOIN mission_equipment e ON e.id=d.equipment_id
       WHERE d.mission_id=? ORDER BY d.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      'SELECT * FROM mission_scenarios WHERE mission_id=? ORDER BY CASE status WHEN \'retained\' THEN 0 ELSE 1 END,created_at',
      [missionId]
    ),
    db.getAllAsync(
      `SELECT sub.*,s.name AS site_name
       FROM mission_subjects sub
       LEFT JOIN mission_sites s ON s.id=sub.site_id
       WHERE sub.mission_id=? ORDER BY sub.created_at`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT o.*,sub.label AS subject_label
       FROM mission_observations o
       LEFT JOIN mission_subjects sub ON sub.id=o.subject_id
       WHERE o.mission_id=? ORDER BY COALESCE(o.observed_at,o.created_at)`,
      [missionId]
    ),
    db.getAllAsync(
      `SELECT d.*,sub.label AS subject_label
       FROM mission_decisions d
       LEFT JOIN mission_subjects sub ON sub.id=d.subject_id
       WHERE d.mission_id=? ORDER BY COALESCE(d.decided_at,d.created_at)`,
      [missionId]
    ),
  ]);

  return { mission, sites, visits, actions, points, equipment, measures, photos, documents, scenarios, subjects, observations, decisions };
}

function photoPath(photo, photoPathById) {
  if (photoPathById?.[photo.id]) return photoPathById[photo.id];
  return clean(photo.file_uri);
}

function actionRows(data, photoPathById = null) {
  const byAction = new Map();
  for (const photo of data.photos) {
    if (!photo.action_id) continue;
    const list = byAction.get(photo.action_id) || [];
    list.push(photo);
    byAction.set(photo.action_id, list);
  }
  return data.actions.map((a) => {
    const actionPhotos = byAction.get(a.id) || [];
    const before = actionPhotos.find((p) => p.phase_role === 'before');
    const after = actionPhotos.find((p) => p.phase_role === 'after');
    return {
      Site: a.site_name || '',
      Localisation: a.location_label || '',
      Equipement: [a.equipment_type,a.equipment_brand,a.equipment_model].filter(Boolean).join(' · '),
      Action: a.label || '',
      Description: a.description || '',
      Origine: a.source_point_label || '',
      Statut: labelStatus(a.status),
      Priorite: a.priority || '',
      Responsable: a.responsible_company || a.responsible_name || '',
      Echeance: a.due_date || a.due_text || '',
      Progression_pct: formatNumber(a.progress),
      Cout_estime_EUR: formatNumber(a.cost_estimate),
      Imputation: a.allocation || '',
      Photo_avant: before ? photoPath(before, photoPathById) : '',
      Photo_apres: after ? photoPath(after, photoPathById) : '',
      Creee_le: a.created_at || '',
      Cloturee_le: a.closed_at || '',
    };
  });
}

function reserveRows(data, photoPathById = null) {
  const reservePoints = data.points.filter((p) => p.type === 'reserve');
  const actionsByPoint = new Map();
  for (const action of data.actions) {
    if (action.source_point_id && !actionsByPoint.has(action.source_point_id)) actionsByPoint.set(action.source_point_id, action);
  }
  const pointPhotos = new Map();
  for (const photo of data.photos) {
    if (!photo.point_id) continue;
    const list = pointPhotos.get(photo.point_id) || [];
    list.push(photo);
    pointPhotos.set(photo.point_id, list);
  }

  return reservePoints.map((p) => {
    const action = actionsByPoint.get(p.id);
    const photos = pointPhotos.get(p.id) || [];
    const before = photos.find((row) => row.phase_role === 'before') || photos[0];
    const after = photos.find((row) => row.phase_role === 'after');
    return {
      Site: p.site_name || '',
      Localisation: p.location_label || '',
      Equipement: [p.equipment_type,p.equipment_brand,p.equipment_model].filter(Boolean).join(' · '),
      Reserve: p.label || '',
      Description: p.description || '',
      Statut: labelStatus(p.status),
      Resultat_recontrole: labelStatus(p.qualification),
      Priorite: p.priority || '',
      Responsable: p.responsible_company || p.responsible_name || action?.responsible_company || action?.responsible_name || '',
      Action_demandee: p.requested_action || action?.label || '',
      Echeance: p.due_date || p.due_text || action?.due_date || action?.due_text || '',
      Cout_estime_EUR: formatNumber(p.cost_estimate ?? action?.cost_estimate),
      Imputation: p.allocation || action?.allocation || '',
      Photo_initiale: before ? photoPath(before, photoPathById) : '',
      Photo_apres: after ? photoPath(after, photoPathById) : '',
      Creee_le: p.created_at || '',
      Cloturee_le: p.closed_at || '',
    };
  });
}

function inventoryRows(data) {
  return data.equipment.map((e) => ({
    Site: e.site_name || '',
    Localisation: e.location_label || '',
    Installation: e.installation_label || '',
    Systeme: e.system_label || '',
    Reseau_circuit: e.network_label || '',
    Type_equipement: e.type || '',
    Marque: e.brand || '',
    Modele: e.model || '',
    Annee_mise_en_service: e.installation_year || '',
    Etat: e.state || '',
    Verification_terrain: labelStatus(e.verification_status),
    Duree_vie_indicative_ans: formatNumber(e.expected_lifetime_years),
    Cout_renouvellement_EUR: formatNumber(e.replacement_cost),
    Annee_renouvellement_indicative: e.replacement_year || '',
    Provenance: e.source_type || '',
  }));
}

function measureRows(data) {
  return data.measures.map((m) => ({
    Date: m.measured_at || m.created_at || '',
    Site: m.site_name || '',
    Localisation: m.location_label || '',
    Equipement: [m.equipment_type,m.equipment_brand,m.equipment_model].filter(Boolean).join(' · '),
    Mesure: m.type || '',
    Valeur: m.value_number ?? m.value_text ?? '',
    Unite: m.unit || '',
    Reference: m.reference_number ?? m.reference_text ?? m.target_value ?? '',
    Source_reference: m.reference_source || '',
    Ecart: formatNumber(m.delta_number),
    Ecart_pct: formatNumber(m.delta_percent),
    Signalement: m.anomaly_status === 'to_check' ? 'Valeur à contrôler' : '',
    Source_mesure: m.source_label || m.source_type || '',
    Commentaire: m.comment || '',
  }));
}

function photoRows(data, photoPathById = null) {
  return data.photos.map((p) => ({
    Date: p.taken_at || p.created_at || '',
    Site: p.site_name || '',
    Localisation: p.location_label || '',
    Equipement: [p.equipment_type,p.equipment_brand,p.equipment_model].filter(Boolean).join(' · '),
    Type: p.type || '',
    Libelle: p.label || '',
    Role: p.phase_role || '',
    Point: p.point_label || '',
    Action: p.action_label || '',
    Fichier: photoPath(p, photoPathById),
  }));
}

function summaryRows(data) {
  const openActions = data.actions.filter((a) => !['closed','cancelled'].includes(a.status));
  const openPoints = data.points.filter((p) => !['closed','no_follow_up','cancelled'].includes(p.status));
  const reserves = data.points.filter((p) => p.type === 'reserve');
  const openReserves = reserves.filter((p) => !['closed','no_follow_up','cancelled'].includes(p.status));
  const atypical = data.measures.filter((m) => m.anomaly_status === 'to_check');
  const totalCost = openActions.reduce((sum,a) => sum + (Number(a.cost_estimate) || 0), 0);
  return [
    { Indicateur: 'Client', Valeur: data.mission.client_name || '' },
    { Indicateur: 'Mission', Valeur: data.mission.label || '' },
    { Indicateur: 'Reference', Valeur: data.mission.reference || '' },
    { Indicateur: 'Type', Valeur: data.mission.type || '' },
    { Indicateur: 'Statut', Valeur: labelStatus(data.mission.status) },
    { Indicateur: 'Sites', Valeur: data.sites.length },
    { Indicateur: 'Visites', Valeur: data.visits.length },
    { Indicateur: 'Equipements', Valeur: data.equipment.length },
    { Indicateur: 'Points ouverts', Valeur: openPoints.length },
    { Indicateur: 'Reserves ouvertes', Valeur: openReserves.length },
    { Indicateur: 'Actions ouvertes', Valeur: openActions.length },
    { Indicateur: 'Cout estime des actions ouvertes (EUR)', Valeur: totalCost },
    { Indicateur: 'Mesures', Valeur: data.measures.length },
    { Indicateur: 'Valeurs a controler', Valeur: atypical.length },
    { Indicateur: 'Photos', Valeur: data.photos.length },
    { Indicateur: 'Documents', Valeur: data.documents.length },
    { Indicateur: 'Scenarios', Valeur: data.scenarios.length },
    { Indicateur: 'Exporte le', Valeur: new Date().toISOString() },
  ];
}

export async function construireClasseurClientMission(missionId, { photoPathById = null } = {}) {
  const data = await loadClientData(missionId);
  const wb = XLSX.utils.book_new();

  addSheet(wb, '00_Synthese', summaryRows(data), [34, 55], false);
  addSheet(wb, '01_Sites', data.sites.map((s) => ({
    Site: s.name || '',
    Adresse: s.address || '',
    Ville: s.city || '',
    Code_postal: s.postal_code || '',
    Reference: s.reference || '',
  })), [32,42,24,14,22]);
  addSheet(wb, '02_Sujets', data.subjects.map((subject) => ({
    Site: subject.site_name || '',
    Sujet: subject.label || '',
    Description: subject.description || '',
    Statut: labelStatus(subject.status),
    Priorite: subject.priority || '',
    Constats: data.observations.filter((row) => row.subject_id === subject.id).map((row) => [row.observed_at || row.created_at || '', row.content || ''].filter(Boolean).join(' · ')).join(' | '),
    Decisions: data.decisions.filter((row) => row.subject_id === subject.id).map((row) => [row.decided_at || row.created_at || '', row.label || '', row.description || ''].filter(Boolean).join(' · ')).join(' | '),
    Actions_ouvertes: data.actions.filter((row) => row.subject_id === subject.id && !['closed','cancelled'].includes(row.status)).map((row) => row.label).join(' | '),
  })), [24,36,54,16,16,70,70,60]);
  addSheet(wb, '03_Actions', actionRows(data, photoPathById), [24,26,32,38,46,30,16,16,30,18,15,18,20,34,34,21,21]);
  addSheet(wb, '04_Reserves', reserveRows(data, photoPathById), [24,26,32,38,46,16,16,30,38,18,18,20,34,34,21,21]);
  addSheet(wb, '05_Inventaire', inventoryRows(data), [24,26,30,28,28,30,22,26,18,18,22,18,20,22,18]);
  addSheet(wb, '06_Mesures', measureRows(data), [21,24,26,32,30,16,12,18,28,14,14,20,28,36]);
  addSheet(wb, '07_Visites', data.visits.map((v) => ({
    Date: v.visit_date || v.created_at || '',
    Site: v.site_name || '',
    Type_visite: v.visit_type || '',
    Statut: labelStatus(v.status),
    Commentaire: v.comment || '',
  })), [21,28,30,16,55]);
  addSheet(wb, '08_Photos', photoRows(data, photoPathById), [21,24,26,32,20,34,18,34,34,60]);
  addSheet(wb, '09_Documents', data.documents.map((d) => ({
    Date: d.document_date || d.created_at || '',
    Site: d.site_name || '',
    Localisation: d.location_label || '',
    Equipement: [d.equipment_type,d.equipment_brand,d.equipment_model].filter(Boolean).join(' · '),
    Nom: d.name || '',
    Type: d.type || '',
    Fichier: d.file_uri || '',
  })), [21,24,26,32,42,20,60]);

  if (data.scenarios.length) {
    addSheet(wb, '10_Scenarios', data.scenarios.map((s) => ({
      Scenario: s.label || '',
      Statut: labelStatus(s.status),
      Description: s.description || '',
      Investissement_EUR: formatNumber(s.investment),
      Economie_annuelle_EUR: formatNumber(s.annual_saving),
      Economie_energie_kWh: formatNumber(s.energy_saving_kwh),
      Gain_CO2_kg: formatNumber(s.co2_saving_kg),
      Retour_simple_ans: formatNumber(s.payback_years),
      Avantages: s.benefits_text || '',
      Contraintes: s.constraints_text || '',
    })), [34,16,55,20,22,22,18,18,48,48]);
  }

  if (data.equipment.some((row) => row.replacement_year || row.replacement_cost || row.expected_lifetime_years)) {
    addSheet(wb, '11_Projection_P3', data.equipment
      .filter((row) => row.replacement_year || row.replacement_cost || row.expected_lifetime_years)
      .sort((a,b) => (Number(a.replacement_year) || 9999) - (Number(b.replacement_year) || 9999))
      .map((row) => ({
        Site: row.site_name || '',
        Localisation: row.location_label || '',
        Equipement: row.type || '',
        Marque: row.brand || '',
        Modele: row.model || '',
        Etat: row.state || '',
        Duree_vie_indicative_ans: formatNumber(row.expected_lifetime_years),
        Annee_renouvellement_indicative: row.replacement_year || '',
        Cout_renouvellement_EUR: formatNumber(row.replacement_cost),
        Statut_cycle_vie: row.lifecycle_status || '',
        Verification_terrain: labelStatus(row.verification_status),
      })), [24,26,30,22,26,18,22,26,24,22,22]);
  }

  return { wb, data };
}

export async function preparerExportMissionClient(missionId, options = {}) {
  const { wb, data } = await construireClasseurClientMission(missionId, options);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
  if (!base64 || base64.length < 100) throw new Error('Le classeur client généré est vide.');
  return {
    base64,
    name: 'Mission_' + fileNamePart(data.mission.label || data.mission.reference || data.mission.id) + '_Client.xlsx',
    data,
  };
}

export async function preparerSyntheseActionsMission(missionId, { photoPathById = null } = {}) {
  const data = await loadClientData(missionId);
  const wb = XLSX.utils.book_new();
  addSheet(wb, '00_Synthese', summaryRows(data), [34,55], false);
  addSheet(wb, '01_Actions', actionRows(data, photoPathById), [24,26,32,38,46,30,16,16,30,18,15,18,20,34,34,21,21]);
  addSheet(wb, '02_Reserves', reserveRows(data, photoPathById), [24,26,32,38,46,16,16,30,38,18,18,20,34,34,21,21]);
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
  if (!base64 || base64.length < 100) throw new Error('La synthèse actions générée est vide.');
  return {
    base64,
    name: 'Synthese_actions_' + fileNamePart(data.mission.label || data.mission.reference || data.mission.id) + '.xlsx',
    data,
  };
}

async function writeOrShare(prepared, dialogTitle) {
  const clientName = prepared.data.mission.client_name || 'Sans_client';
  const folder = await garantirCheminMetra([
    'Missions',
    nettoyerSegment(clientName),
    nettoyerSegment(prepared.data.mission.label || prepared.data.mission.id),
    'Exports',
  ]);
  if (folder) {
    const uri = await creerFichierSaf(folder, prepared.name, XLSX_MIME, prepared.base64);
    return { uri, name: prepared.name, shared: false };
  }

  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const uri = root + prepared.name;
  await FileSystem.writeAsStringAsync(uri, prepared.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle });
    return { uri, name: prepared.name, shared: true };
  }
  return { uri, name: prepared.name, shared: false };
}

export async function exporterMissionExcelClient(missionId) {
  return writeOrShare(await preparerExportMissionClient(missionId), 'Exporter le classeur client de la Mission');
}

export async function exporterSyntheseActionsMission(missionId) {
  return writeOrShare(await preparerSyntheseActionsMission(missionId), 'Exporter la synthèse actions / réserves');
}
