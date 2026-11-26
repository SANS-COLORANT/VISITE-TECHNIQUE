/**
 * Fiche Mission modulable : lectures SQLite (reprise en un geste, mesures,
 * documents attendus, avancement des sites) sur une base migrée complète,
 * et persistance des dispositions dans le stockage de préférences.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../database/migrate.js';
import { queryMissionResumes, queryMissionSheetExtras, siteSheetState } from '../missionSheetQueries.js';
import { createMissionSheetPrefs, SHEET_PREF_KEYS } from '../missionSheetPrefs.js';
import { buildSheetContext, defaultSheetLayout, resolveSheetLayout, hideSheetBlock, pickSheetToolSuggestion } from '../missionSheetLayout.js';
import { getMissionCapabilities } from '../missionRecipes.js';
import { getMissionFieldPlaybook } from '../missionFieldPlaybooks.js';

const sqlite = new DatabaseSync(':memory:');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  async getAllAsync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { const r = await fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const run = (sql, params = []) => sqlite.prepare(sql).run(...params);

test.before(async () => {
  await migrateDatabase(db);
  run(`INSERT INTO mission_clients(id,name) VALUES('c1','Ville d’Orsay')`);
  run(`INSERT INTO missions(id,client_id,family,type,label,status) VALUES('m1','c1','etude_audit','diagnostic_chaufferie_ss','Chaufferie groupe scolaire','active')`);
  run(`INSERT INTO missions(id,family,type,label,status) VALUES('m2','campagne_multisites','campagne_mesures','Campagne ECS','active')`);
  run(`INSERT INTO missions(id,family,type,label,status) VALUES('m3','suivi_ponctuel','suivi_technique','Dossier clos','closed')`);
  run(`INSERT INTO mission_sites(id,name) VALUES('s1','École Jean Jaurès'),('s2','Gymnase'),('s3','Crèche')`);
  run(`INSERT INTO mission_site_links(mission_id,site_id) VALUES('m1','s1'),('m2','s1'),('m2','s2'),('m2','s3')`);
  run(`INSERT INTO mission_visits(id,mission_id,site_id,visit_type,status,updated_at) VALUES
    ('v1','m1','s1','diagnostic','draft','2026-11-20 08:00:00'),
    ('v2','m2','s1','releve','in_progress','2026-11-25 09:00:00'),
    ('v3','m2','s2','releve','completed','2026-11-25 10:00:00'),
    ('v4','m3',NULL,'suivi','draft','2026-11-26 07:00:00')`);
  run(`INSERT INTO mission_template_values(id,mission_id,visit_id,field_code,value_text) VALUES
    ('t1','m1','v1','puissance','450 kW'),('t2','m1','v1','marque',''),('t3','m1','v1','__meta.etape','2')`);
  run(`INSERT INTO mission_photos(id,mission_id,visit_id,file_uri) VALUES('p1','m1','v1','file://a.jpg'),('p2','m1','v1','file://b.jpg')`);
  run(`INSERT INTO mission_points(id,mission_id,visit_origin_id,type,label,status) VALUES('pt1','m1','v1','reserve','Calorifuge','open')`);
  run(`INSERT INTO mission_measures(id,mission_id,visit_id,type,value_number,unit,created_at) VALUES
    ('me1','m1','v1','Température départ',72.5,'°C','2026-11-20 08:10:00'),
    ('me2','m1','v1','Pression',1.4,'bar','2026-11-20 08:20:00')`);
  run(`INSERT INTO mission_measure_details(measure_id,measured_at,anomaly_status) VALUES('me2','2026-11-20 08:21:00','to_check')`);
  run(`INSERT INTO mission_expected_documents(id,mission_id,label,status,due_date) VALUES
    ('d1','m1','DOE chaufferie','expected','2026-11-01'),
    ('d2','m1','Contrat P2','received',NULL),
    ('d3','m1','Carnet de chaufferie','incomplete','2026-12-15'),
    ('d4','m1','Analyse d’eau','not_existing',NULL)`);
  run(`INSERT INTO mission_measure_campaigns(id,mission_id,label,measure_type) VALUES('cp','m2','ECS 55 °C','temperature')`);
  run(`INSERT INTO mission_measure_campaign_points(id,campaign_id,mission_id,site_id,label,status) VALUES
    ('q1','cp','m2','s1','Point 1','measured'),('q2','cp','m2','s1','Point 2','planned'),
    ('q3','cp','m2','s2','Point 1','measured'),('q4','cp','m2','s3','Point 1','planned')`);
});

test('reprise en un geste : visites brouillon / en cours, la plus récente d’abord, jamais un dossier clos', async () => {
  const rows = await queryMissionResumes(db, { limit: 5 });
  assert.deepEqual(rows.map((row) => row.visit_id), ['v2', 'v1']);
  const v1 = rows.find((row) => row.visit_id === 'v1');
  assert.equal(v1.mission_label, 'Chaufferie groupe scolaire');
  assert.equal(v1.site_name, 'École Jean Jaurès');
  assert.equal(v1.client_name, 'Ville d’Orsay');
  assert.equal(v1.fields_count, 1, 'champ vide et métadonnées ignorés');
  assert.equal(v1.photos_count, 2);
  assert.equal(v1.points_count, 1);
  assert.equal(v1.measures_count, 2);
  assert.deepEqual((await queryMissionResumes(db, { missionId: 'm1' })).map((row) => row.visit_id), ['v1']);
  assert.equal((await queryMissionResumes(db, { limit: 1 })).length, 1);
});

test('extras de la fiche : mesures récentes, documents en retard, avancement des sites', async () => {
  const extras = await queryMissionSheetExtras(db, 'm1', { now: Date.parse('2026-11-26T09:00:00Z') });
  assert.deepEqual(extras.measures.map((row) => row.id), ['me2', 'me1']);
  assert.equal(extras.measures[0].anomaly_status, 'to_check');
  assert.deepEqual(
    { total: extras.documents.total, done: extras.documents.done, pending: extras.documents.pending, late: extras.documents.late },
    { total: 4, done: 2, pending: 2, late: 1 }
  );
  assert.deepEqual(extras.documents.next.map((row) => [row.id, row.is_late]), [['d1', true], ['d3', false]]);
  assert.deepEqual(extras.sites, { todo: 0, progress: 1, done: 0, total: 1 });
  const campaign = await queryMissionSheetExtras(db, 'm2', { now: Date.parse('2026-11-26T09:00:00Z') });
  assert.deepEqual(campaign.sites, { todo: 1, progress: 1, done: 1, total: 3 });
  assert.deepEqual((await queryMissionSheetExtras(db, null)).sites, { todo: 0, progress: 0, done: 0, total: 0 });
});

test('état d’un site', () => {
  assert.equal(siteSheetState({}), 'todo');
  assert.equal(siteSheetState({ visit_count: 1 }), 'progress');
  assert.equal(siteSheetState({ visit_count: 1, completed_visits: 1 }), 'done');
  assert.equal(siteSheetState({ campaign_total: 3, campaign_planned: 1 }), 'progress');
  assert.equal(siteSheetState({ campaign_total: 3, campaign_planned: 0 }), 'done');
});

test('préférences : portée Mission puis type, annulation, usage et mode gants', () => {
  const memory = new Map();
  const prefs = createMissionSheetPrefs({ get: (key) => memory.get(key) ?? null, set: (key, value) => memory.set(key, value) });
  const ids = { missionId: 'm1', type: 'diagnostic_chaufferie_ss', family: 'etude_audit' };
  const ctx = buildSheetContext({
    family: ids.family,
    type: ids.type,
    capabilities: getMissionCapabilities(ids.family, ids.type),
    playbook: getMissionFieldPlaybook(ids.type),
  });
  assert.equal(resolveSheetLayout({ stored: prefs.readStoredLayouts(ids), ctx }).source, 'default');
  const typeLayout = hideSheetBlock(defaultSheetLayout(ctx), 'deliverables');
  prefs.saveLayout('type', ids, typeLayout);
  const other = prefs.readStoredLayouts({ ...ids, missionId: 'autre' });
  assert.equal(resolveSheetLayout({ stored: other, ctx }).source, 'type', 'les autres Missions du type en profitent');
  const { key, previous } = prefs.saveLayout('mission', ids, defaultSheetLayout(ctx));
  assert.equal(previous, null);
  assert.equal(resolveSheetLayout({ stored: prefs.readStoredLayouts(ids), ctx }).source, 'mission');
  prefs.restoreRaw(key, previous);
  assert.equal(resolveSheetLayout({ stored: prefs.readStoredLayouts(ids), ctx }).source, 'type', 'annuler remet exactement l’état précédent');
  prefs.clearLayout('type', ids);
  assert.equal(resolveSheetLayout({ stored: prefs.readStoredLayouts(ids), ctx }).source, 'default');

  for (const day of ['2026-11-24T09:00:00Z', '2026-11-25T09:00:00Z', '2026-11-26T08:00:00Z']) prefs.recordToolOpen('m1', 'scenarios', day);
  const usage = prefs.readUsage('m1');
  assert.equal(usage[0].open_count, 3);
  const now = Date.parse('2026-11-26T09:00:00Z');
  assert.equal(pickSheetToolSuggestion({ usage, capabilities: ctx.capabilities, now })?.toolKey, 'scenarios');
  prefs.setSuggestionState('m1', 'scenarios', 'later', '2026-11-26T08:30:00Z');
  assert.equal(pickSheetToolSuggestion({ usage: prefs.readUsage('m1'), capabilities: ctx.capabilities, now }), null);
  prefs.setSuggestionState('m1', 'scenarios', 'never');
  assert.equal(prefs.readUsage('m1')[0].suggestion_state, 'never');
  assert.ok(memory.has(SHEET_PREF_KEYS.neverSuggest));

  assert.equal(prefs.getGloves(), false);
  prefs.setGloves(true);
  assert.equal(prefs.getGloves(), true);
  assert.equal(prefs.customizeHintSeen(), false);
  prefs.markCustomizeHintSeen();
  assert.equal(prefs.customizeHintSeen(), true);
});

test('un stockage en panne ne casse jamais la fiche', () => {
  const prefs = createMissionSheetPrefs({ get: () => { throw new Error('disque'); }, set: () => { throw new Error('disque'); } });
  assert.deepEqual(prefs.readStoredLayouts({ missionId: 'm1', type: 't', family: 'f' }), { mission: null, type: null, family: null });
  assert.doesNotThrow(() => prefs.recordToolOpen('m1', 'scenarios'));
  assert.deepEqual(prefs.readUsage('m1'), []);
});
