/**
 * Excel complet Missions : chaque feuille déclarée a une requête d'export
 * valide sur une base migrée complète, et figure dans l'ordre d'import.
 * (Régression : les feuilles 66-67 « campagnes » étaient déclarées sans
 * requête, ce qui faisait échouer tout export complet et tout ZIP.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../database/migrate.js';
import { MISSION_EXCEL_SHEETS, MISSION_TABLE_IMPORT_ORDER } from '../missionExcelSchema.js';

const sqlite = new DatabaseSync(':memory:');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  async getAllAsync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { const r = await fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

function exportQueries() {
  const src = readFileSync(new URL('../missionExcelExport.js', import.meta.url), 'utf8');
  const start = src.indexOf('const QUERIES = Object.freeze({');
  const end = src.indexOf('\n});', start);
  const body = src.slice(start + 'const QUERIES = Object.freeze('.length, end + 2);
  return Function(`return (${body});`)();
}

test('chaque feuille de l’Excel complet s’exporte et se réimporte', async () => {
  await migrateDatabase(db);
  sqlite.exec(`INSERT INTO missions(id,label) VALUES('m1','Test');
    INSERT INTO mission_forms(id,label) VALUES('f1','Trame');
    INSERT INTO mission_form_links(mission_id,form_id) VALUES('m1','f1');
    INSERT INTO mission_form_entries(id,mission_id,form_id) VALUES('e1','m1','f1');
    INSERT INTO mission_ref_lists(id,label) VALUES('l1','Marques');`);
  const queries = exportQueries();
  for (const [sheet, table] of MISSION_EXCEL_SHEETS) {
    assert.ok(queries[table], `${sheet} : requête d’export manquante pour ${table}`);
    assert.doesNotThrow(() => sqlite.prepare(queries[table]).all('m1'), `${sheet} : requête invalide`);
    assert.ok(MISSION_TABLE_IMPORT_ORDER.includes(table), `${table} absent de l’ordre d’import`);
  }
  assert.equal(sqlite.prepare(queries.mission_forms).all('m1').length, 1);
  assert.equal(sqlite.prepare(queries.mission_ref_lists).all('m1').length, 1);
  const order = MISSION_TABLE_IMPORT_ORDER;
  assert.ok(order.indexOf('mission_forms') < order.indexOf('mission_form_entries'), 'trames importées avant leurs fiches');
});
