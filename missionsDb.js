import { getDb } from './db.js';
import { createId } from './database/ids.js';

export const MISSION_FAMILIES = Object.freeze([
  { key: 'etude_audit', label: 'Étude / Audit', types: [
    ['audit_energetique', 'Audit énergétique'],
    ['audit_technique', 'Audit / diagnostic technique'],
    ['etude_cvc', 'Étude CVC / thermique / ECS'],
    ['diagnostic_cible', 'Diagnostic ciblé'],
  ] },
  { key: 'travaux_chantier', label: 'Travaux / Chantier', types: [
    ['amo_travaux', 'AMO travaux'],
    ['moe_travaux', 'MOE travaux'],
    ['det_chantier', 'Suivi chantier / DET'],
  ] },
  { key: 'suivi_ponctuel', label: 'Suivi ponctuel', types: [
    ['suivi_technique', 'Suivi technique ciblé'],
    ['plan_action', 'Plan d’action'],
    ['suivi_sanitaire', 'Suivi sanitaire ponctuel'],
  ] },
  { key: 'campagne_multisites', label: 'Campagne / Multi-sites', types: [
    ['campagne_technique', 'Campagne technique'],
    ['inventaire_passation', 'Inventaire / passation'],
    ['etat_lieux_multisites', 'État des lieux multi-sites'],
  ] },
  { key: 'conformite_reglementaire', label: 'Contrôle / Conformité', types: [
    ['controle_reglementaire', 'Contrôle réglementaire ponctuel'],
    ['securite_accessibilite', 'Sécurité / accessibilité'],
    ['controle_sanitaire', 'Contrôle sanitaire ponctuel'],
    ['controle_technique', 'Contrôle technique ciblé'],
  ] },
]);

const PHASE_RECIPES = Object.freeze({
  etude_audit: [
    ['preparation', 'Préparation'],
    ['visite', 'Visite terrain'],
    ['complements', 'Compléments éventuels'],
    ['fin_terrain', 'Fin terrain'],
  ],
  travaux_chantier: [
    ['demarrage', 'Démarrage'],
    ['det', 'Visites / DET'],
    ['opr', 'OPR'],
    ['reception', 'Réception'],
    ['levee', 'Levée de réserves'],
    ['cloture', 'Clôture'],
  ],
  suivi_ponctuel: [
    ['ouverture', 'Ouverture du sujet'],
    ['suivi', 'Suivi'],
    ['controle', 'Contrôle'],
    ['cloture', 'Clôture'],
  ],
  campagne_multisites: [
    ['lancement', 'Lancement'],
    ['sites', 'Visites site par site'],
    ['consolidation', 'Consolidation'],
    ['cloture', 'Clôture'],
  ],
  conformite_reglementaire: [
    ['preparation', 'Préparation'],
    ['controle', 'Contrôle / visite'],
    ['corrections', 'Actions correctives éventuelles'],
    ['contre_visite', 'Contre-visite éventuelle'],
    ['cloture', 'Clôture'],
  ],
});

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

export async function creerMissionClient({ name, address = null, notes = null } = {}) {
  const nom = text(name);
  if (!nom) throw new Error('Nom du client requis.');
  const db = await getDb();
  const id = createId('mcli');
  await db.runAsync(
    `INSERT INTO mission_clients(id,name,address,notes) VALUES(?,?,?,?)`,
    [id, nom, text(address), text(notes)]
  );
  return id;
}

export async function creerMissionSite({ clientId = null, name, city = null, address = null, code = null, notes = null } = {}) {
  const nom = text(name);
  if (!nom) throw new Error('Nom du site requis.');
  const db = await getDb();
  const id = createId('msite');
  await db.runAsync(
    `INSERT INTO mission_sites(id,client_id,code,name,city,address,notes) VALUES(?,?,?,?,?,?,?)`,
    [id, text(clientId), text(code), nom, text(city), text(address), text(notes)]
  );
  return id;
}

export async function listerMissionClients() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM mission_clients ORDER BY name COLLATE NOCASE`);
}

export async function listerMissionSites(clientId = null) {
  const db = await getDb();
  if (clientId) return db.getAllAsync(`SELECT * FROM mission_sites WHERE client_id=? ORDER BY name COLLATE NOCASE`, [clientId]);
  return db.getAllAsync(`SELECT * FROM mission_sites ORDER BY name COLLATE NOCASE`);
}

export async function creerMissionDraft({ family = null, type = null, label = null, reference = null, description = null, responsibleName = null, clientId = null, siteIds = [], startDate = null } = {}) {
  const db = await getDb();
  const id = createId('mis');
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO missions(id,client_id,family,type,label,reference,description,responsible_name,status,start_date,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, text(clientId), text(family), text(type), text(label), text(reference), text(description), text(responsibleName), 'draft', text(startDate), now, now]
    );
    for (const siteId of [...new Set((siteIds || []).map(text).filter(Boolean))]) {
      await db.runAsync(`INSERT OR IGNORE INTO mission_site_links(mission_id,site_id) VALUES(?,?)`, [id, siteId]);
    }
    const phases = PHASE_RECIPES[family] || [];
    for (let i = 0; i < phases.length; i += 1) {
      const [phaseType, phaseLabel] = phases[i];
      await db.runAsync(
        `INSERT INTO mission_phases(id,mission_id,type,label,status,sort_order) VALUES(?,?,?,?,?,?)`,
        [createId('mph'), id, phaseType, phaseLabel, 'planned', i]
      );
    }
  });
  return id;
}

export async function mettreAJourMission(missionId, changes = {}) {
  if (!missionId) throw new Error('Mission manquante.');
  const allowed = {
    family: 'family', type: 'type', label: 'label', reference: 'reference', description: 'description',
    responsibleName: 'responsible_name', status: 'status', startDate: 'start_date', endDate: 'end_date', dueText: 'due_text', clientId: 'client_id',
  };
  const entries = Object.entries(changes).filter(([key]) => allowed[key]);
  if (!entries.length) return;
  const db = await getDb();
  const columns = entries.map(([key]) => `${allowed[key]}=?`);
  const values = entries.map(([, value]) => text(value));
  columns.push(`updated_at=?`);
  values.push(new Date().toISOString(), missionId);
  await db.runAsync(`UPDATE missions SET ${columns.join(',')} WHERE id=?`, values);
}

export async function lierSiteMission(missionId, siteId) {
  const db = await getDb();
  await db.runAsync(`INSERT OR IGNORE INTO mission_site_links(mission_id,site_id) VALUES(?,?)`, [missionId, siteId]);
}

export async function listerMissions({ limit = 30, status = null } = {}) {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const where = status ? `WHERE m.status=?` : '';
  const params = status ? [status, safeLimit] : [safeLimit];
  return db.getAllAsync(
    `SELECT m.*,
            c.name AS client_name,
            (SELECT COUNT(*) FROM mission_site_links ms WHERE ms.mission_id=m.id) AS site_count,
            (SELECT COUNT(*) FROM mission_points p WHERE p.mission_id=m.id AND p.status NOT IN ('closed','no_follow_up')) AS open_point_count,
            (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=m.id) AS visit_count
     FROM missions m
     LEFT JOIN mission_clients c ON c.id=m.client_id
     ${where}
     ORDER BY COALESCE(m.updated_at,m.created_at) DESC
     LIMIT ?`,
    params
  );
}

export async function getMission(missionId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT m.*,c.name AS client_name,c.address AS client_address
     FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id WHERE m.id=?`,
    [missionId]
  );
}

export async function getMissionDashboard(missionId) {
  const db = await getDb();
  const [mission, sites, phases, visits, points, documents] = await Promise.all([
    getMission(missionId),
    db.getAllAsync(`SELECT s.* FROM mission_sites s JOIN mission_site_links ms ON ms.site_id=s.id WHERE ms.mission_id=? ORDER BY s.name COLLATE NOCASE`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_phases WHERE mission_id=? ORDER BY sort_order,id`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_visits WHERE mission_id=? ORDER BY COALESCE(visit_date,created_at) DESC LIMIT 20`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_points WHERE mission_id=? ORDER BY CASE status WHEN 'to_check' THEN 0 WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting' THEN 3 ELSE 4 END, updated_at DESC LIMIT 100`, [missionId]),
    db.getAllAsync(`SELECT * FROM mission_documents WHERE mission_id=? ORDER BY updated_at DESC LIMIT 30`, [missionId]),
  ]);
  return { mission, sites, phases, visits, points, documents };
}

export async function creerVisiteMission({ missionId, siteId = null, phaseId = null, visitType = 'terrain', visitDate = null } = {}) {
  if (!missionId) throw new Error('Mission requise.');
  const db = await getDb();
  const id = createId('mvis');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO mission_visits(id,mission_id,site_id,phase_id,visit_type,visit_date,status,created_at,updated_at)
     VALUES(?,?,?,?,?,?, 'draft', ?,?)`,
    [id, missionId, text(siteId), text(phaseId), text(visitType), text(visitDate) || now.slice(0, 10), now, now]
  );
  return id;
}

export async function creerPointMission({ missionId, siteId = null, visitId = null, locationId = null, equipmentId = null, type = 'information', label = null, description = null, status = 'open', qualification = null, responsibleActorId = null, dueDate = null, dueText = null, priority = null, visibility = 'internal' } = {}) {
  if (!missionId) throw new Error('Mission requise.');
  const db = await getDb();
  const id = createId('mpt');
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO mission_points(id,mission_id,site_id,visit_origin_id,location_id,equipment_id,type,label,description,status,qualification,responsible_actor_id,due_date,due_text,priority,visibility,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, missionId, text(siteId), text(visitId), text(locationId), text(equipmentId), text(type) || 'information', text(label), text(description), text(status) || 'open', text(qualification), text(responsibleActorId), text(dueDate), text(dueText), text(priority), text(visibility) || 'internal', now, now]
    );
    await db.runAsync(
      `INSERT INTO mission_point_history(id,point_id,visit_id,status_before,status_after,comment,source,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      [createId('mphist'), id, text(visitId), null, text(status) || 'open', text(description), 'creation', now]
    );
  });
  return id;
}

export async function mettreAJourStatutPoint(pointId, status, { comment = null, visitId = null } = {}) {
  const db = await getDb();
  const point = await db.getFirstAsync(`SELECT status FROM mission_points WHERE id=?`, [pointId]);
  if (!point) throw new Error('Point introuvable.');
  const now = new Date().toISOString();
  const closedAt = ['closed', 'no_follow_up'].includes(status) ? now : null;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE mission_points SET status=?,updated_at=?,closed_at=? WHERE id=?`, [status, now, closedAt, pointId]);
    await db.runAsync(
      `INSERT INTO mission_point_history(id,point_id,visit_id,status_before,status_after,comment,source,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      [createId('mphist'), pointId, text(visitId), point.status, status, text(comment), 'manual', now]
    );
  });
}

export function phasesPourFamille(family) {
  return (PHASE_RECIPES[family] || []).map(([type, label], index) => ({ type, label, sortOrder: index }));
}
