/**
 * Missions à la carte : briques ajoutées / retirées par Mission et modèles
 * enregistrés (migration 052 additive, base migrée complète).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { migrateDatabase } from '../database/migrate.js';
import { getMissionCapabilities } from '../missionRecipes.js';
import {
  countActiveModules,
  describeMissionModules,
  missionModuleState,
  parseMissionModules,
  resolveMissionCapabilities,
  serializeMissionModules,
  setMissionModule,
} from '../missionModules.js';
import {
  insertMissionModel,
  markMissionModelUsed,
  queryMissionModels,
  queryMissionModules,
  removeMissionModel,
  restoreMissionModulesRaw,
  saveMissionModules,
} from '../missionModelsQueries.js';
import { availableSheetTools, buildSheetContext, defaultSheetLayout, normalizeSheetLayout } from '../missionSheetLayout.js';

const sqlite = new DatabaseSync(':memory:');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  async getAllAsync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { const r = await fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};
const base = getMissionCapabilities('etude_audit', 'diagnostic_chaufferie_ss');

test.before(async () => {
  await migrateDatabase(db);
  sqlite.prepare(`INSERT INTO missions(id,family,type,label) VALUES('m1','etude_audit','diagnostic_chaufferie_ss','Chaufferie')`).run();
});

test('migration 052 additive et déclarée', async () => {
  const cols = sqlite.prepare('PRAGMA table_info(missions)').all().map((c) => c.name);
  assert.ok(cols.includes('modules_json'));
  assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='mission_models'").get());
  assert.match(readFileSync(new URL('../database/constants.js', import.meta.url), 'utf8'), /DATABASE_SCHEMA_VERSION = 5[2-9]/);
  const src = readFileSync(new URL('../database/migrations/052_mission_modules_models.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+missions/i, 'aucune donnée existante touchée');
  await migrateDatabase(db); // relancer ne casse rien
});

test('sans réglage, une Mission garde exactement les outils de son type', () => {
  assert.deepEqual(resolveMissionCapabilities(base, null), base);
  assert.equal(serializeMissionModules(parseMissionModules('{abîmé')), null);
  assert.equal(missionModuleState('equipment', base, null), 'type');
  assert.equal(missionModuleState('signature', base, null), 'off');
});

test('prendre un outil ailleurs, retirer ceux qui ne servent pas, état minimal', () => {
  let m = setMissionModule(null, 'signature', true, base);
  m = setMissionModule(m, 'scenarios', false, base);
  assert.deepEqual(m, { v: 1, added: ['signature'], removed: ['scenarios'] });
  const caps = resolveMissionCapabilities(base, m);
  assert.equal(caps.signature, true);
  assert.equal(caps.scenarios, false);
  assert.ok(availableSheetTools(caps).includes('signature') && !availableSheetTools(caps).includes('scenarios'));
  assert.equal(countActiveModules(base, m), countActiveModules(base, null));
  assert.equal(describeMissionModules(base, m), '17 briques · 1 ajoutée · 1 retirée');
  // Revenir à l'état du type efface la différence.
  m = setMissionModule(setMissionModule(m, 'signature', false, base), 'scenarios', true, base);
  assert.equal(serializeMissionModules(m), null);
  assert.deepEqual(parseMissionModules({ added: ['inconnu', 'map', 'map'], removed: ['map', 'tests'] }), { v: 1, added: ['map'], removed: ['tests'] });
});

test('une brique retirée sort aussi des épingles de la fiche', () => {
  const caps = resolveMissionCapabilities(base, { added: [], removed: ['equipment'] });
  const ctx = buildSheetContext({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss', capabilities: caps });
  const stored = { ...defaultSheetLayout(buildSheetContext({ family: 'etude_audit', type: 'diagnostic_chaufferie_ss', capabilities: base })), pinnedTools: ['equipment', 'plans'] };
  assert.deepEqual(normalizeSheetLayout(stored, ctx).pinnedTools, ['plans']);
});

test('briques enregistrées en base, annulation exacte', async () => {
  const previous = await saveMissionModules(db, 'm1', { added: ['signature'], removed: [] });
  assert.equal(previous, null);
  assert.deepEqual((await queryMissionModules(db, 'm1')).added, ['signature']);
  await restoreMissionModulesRaw(db, 'm1', previous);
  assert.deepEqual(await queryMissionModules(db, 'm1'), { v: 1, added: [], removed: [] });
  await assert.rejects(() => saveMissionModules(db, 'absente', {}), /introuvable/);
});

test('modèles : créer, lister (derniers utilisés d’abord), supprimer', async () => {
  await assert.rejects(() => insertMissionModel(db, { label: '  ' }), /Nom du modèle/);
  const a = await insertMissionModel(db, { label: 'Prise en charge P2', family: 'suivi_ponctuel', type: 'suivi_technique', modules: { added: ['signature'] }, layoutJson: '{"v":1,"blocks":[]}' });
  const b = await insertMissionModel(db, { label: 'Audit chaufferie', family: 'etude_audit', type: 'diagnostic_chaufferie_ss' });
  await markMissionModelUsed(db, b);
  const list = await queryMissionModels(db);
  assert.deepEqual(list.map((row) => row.id), [b, a]);
  assert.equal(list[0].use_count, 1);
  assert.deepEqual(parseMissionModules(list[1].modules_json).added, ['signature']);
  assert.equal(list[1].layout_json, '{"v":1,"blocks":[]}');
  await removeMissionModel(db, a);
  assert.deepEqual((await queryMissionModels(db)).map((row) => row.id), [b]);
});
