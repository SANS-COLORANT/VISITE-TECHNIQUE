/**
 * Fiche Mission modulable — lectures SQLite légères (aucune écriture).
 *
 * Fonctions pures : elles reçoivent la connexion `db` (API expo-sqlite :
 * getAllAsync / getFirstAsync) pour être testées sous Node avec node:sqlite
 * et toutes les migrations (tests/missionSheetDb.test.mjs). Les tables lues
 * sont exclusivement celles du module Missions : aucune donnée Intranet.
 */

/** Statuts d'un document attendu pour lesquels il n'y a plus rien à attendre. */
export const SHEET_DOCUMENT_DONE_STATUSES = Object.freeze(['received', 'up_to_date', 'validated', 'not_existing']);

const VISIT_FIELDS_FILLED = `COALESCE(t.value_text,CAST(t.value_number AS TEXT),CAST(t.value_boolean AS TEXT),t.value_date,'')<>''`;

function todayIso(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  return date.toISOString().slice(0, 10);
}

/**
 * Visites Mission à reprendre en un geste (brouillon ou en cours), de la plus
 * récemment touchée à la plus ancienne, avec ce qui a déjà été saisi.
 */
export async function queryMissionResumes(db, { limit = 3, missionId = null } = {}) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 3));
  const where = ["v.status IN ('draft','in_progress')", "COALESCE(m.status,'draft') NOT IN ('closed','cancelled')"];
  const params = [];
  if (missionId) {
    where.push('v.mission_id=?');
    params.push(missionId);
  }
  params.push(safeLimit);
  return db.getAllAsync(
    `SELECT v.id AS visit_id, v.mission_id, v.site_id, v.status AS visit_status, v.visit_type, v.visit_date,
            COALESCE(v.updated_at, v.created_at) AS touched_at,
            m.label AS mission_label, m.family, m.type, m.reference,
            s.name AS site_name, c.name AS client_name,
            (SELECT COUNT(*) FROM mission_template_values t WHERE t.visit_id=v.id AND t.field_code NOT LIKE '__meta.%' AND ${VISIT_FIELDS_FILLED}) AS fields_count,
            (SELECT COUNT(*) FROM mission_photos p WHERE p.visit_id=v.id) AS photos_count,
            (SELECT COUNT(*) FROM mission_points pt WHERE pt.visit_origin_id=v.id) AS points_count,
            (SELECT COUNT(*) FROM mission_measures ms WHERE ms.visit_id=v.id) AS measures_count
       FROM mission_visits v
       JOIN missions m ON m.id=v.mission_id
       LEFT JOIN mission_sites s ON s.id=v.site_id
       LEFT JOIN mission_clients c ON c.id=m.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(v.updated_at, v.created_at) DESC, v.id DESC
      LIMIT ?`,
    params
  );
}

/**
 * Données complémentaires de la fiche : dernières mesures, documents
 * attendus, avancement par site. Une seule passe, bornée, pour rester
 * instantanée même sur une campagne de plusieurs centaines de sites.
 */
export async function queryMissionSheetExtras(db, missionId, { measuresLimit = 6, documentsLimit = 4, now = Date.now() } = {}) {
  if (!missionId) return { measures: [], documents: { pending: 0, late: 0, done: 0, total: 0, next: [] }, sites: { todo: 0, progress: 0, done: 0, total: 0 }, forms: [] };
  const today = todayIso(now);
  const doneList = SHEET_DOCUMENT_DONE_STATUSES.map((status) => `'${status}'`).join(',');
  const [measures, documentCounts, nextDocuments, siteRows, forms] = await Promise.all([
    db.getAllAsync(
      `SELECT m.id, m.type, m.value_number, m.value_text, m.unit, m.site_id, m.equipment_id,
              COALESCE(d.measured_at, m.created_at) AS measured_at, d.anomaly_status
         FROM mission_measures m
         LEFT JOIN mission_measure_details d ON d.measure_id=m.id
        WHERE m.mission_id=?
        ORDER BY COALESCE(d.measured_at, m.created_at) DESC, m.id DESC
        LIMIT ?`,
      [missionId, Math.max(1, Math.min(20, Number(measuresLimit) || 6))]
    ),
    db.getFirstAsync(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN (${doneList}) THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status NOT IN (${doneList}) THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status NOT IN (${doneList}) AND due_date IS NOT NULL AND due_date<>'' AND substr(due_date,1,10)<? THEN 1 ELSE 0 END) AS late
         FROM mission_expected_documents WHERE mission_id=?`,
      [today, missionId]
    ),
    db.getAllAsync(
      `SELECT id, label, status, due_date, due_text,
              CASE WHEN due_date IS NOT NULL AND due_date<>'' AND substr(due_date,1,10)<? THEN 1 ELSE 0 END AS is_late
         FROM mission_expected_documents
        WHERE mission_id=? AND status NOT IN (${doneList})
        ORDER BY is_late DESC, CASE WHEN due_date IS NULL OR due_date='' THEN 1 ELSE 0 END, due_date, updated_at DESC
        LIMIT ?`,
      [today, missionId, Math.max(1, Math.min(10, Number(documentsLimit) || 4))]
    ),
    db.getAllAsync(
      `SELECT s.id,
              (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id) AS visit_count,
              (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id AND v.status='completed') AS completed_visits,
              (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id) AS campaign_total,
              (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status='planned') AS campaign_planned
         FROM mission_sites s
         JOIN mission_site_links l ON l.site_id=s.id
        WHERE l.mission_id=?`,
      [missionId, missionId, missionId, missionId, missionId]
    ),
    db.getAllAsync(
      `SELECT f.id, f.label, f.target_type,
              (SELECT COUNT(*) FROM mission_form_entries e WHERE e.form_id=f.id AND e.mission_id=l.mission_id) AS entry_count,
              (SELECT COUNT(*) FROM mission_form_entries e WHERE e.form_id=f.id AND e.mission_id=l.mission_id AND e.status='done') AS done_count,
              (SELECT e.id FROM mission_form_entries e WHERE e.form_id=f.id AND e.mission_id=l.mission_id AND e.status='draft' ORDER BY e.updated_at DESC LIMIT 1) AS draft_entry_id
         FROM mission_form_links l JOIN mission_forms f ON f.id=l.form_id
        WHERE l.mission_id=? ORDER BY l.sort_order, l.created_at`,
      [missionId]
    ),
  ]);
  const sites = { todo: 0, progress: 0, done: 0, total: siteRows.length };
  for (const row of siteRows) sites[siteSheetState(row)] += 1;
  return {
    measures,
    documents: {
      total: Number(documentCounts?.total || 0),
      done: Number(documentCounts?.done || 0),
      pending: Number(documentCounts?.pending || 0),
      late: Number(documentCounts?.late || 0),
      next: nextDocuments.map((row) => ({ ...row, is_late: Number(row.is_late) === 1 })),
    },
    sites,
    forms,
  };
}

/**
 * État d'un site pour la fiche : terminé quand tous les points de campagne
 * prévus sont traités (ou, sans campagne, quand une visite est terminée),
 * en cours dès qu'une visite ou une mesure existe, sinon à faire.
 */
export function siteSheetState(row) {
  const total = Number(row?.campaign_total || 0);
  const planned = Number(row?.campaign_planned || 0);
  const visits = Number(row?.visit_count || 0);
  const completed = Number(row?.completed_visits || 0);
  if (total > 0 && planned === 0) return 'done';
  if (total === 0 && completed > 0) return 'done';
  if (visits > 0 || (total > 0 && planned < total)) return 'progress';
  return 'todo';
}
