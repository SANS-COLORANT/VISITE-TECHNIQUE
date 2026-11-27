/**
 * Trames Missions : moteur de champs (conditions, calculs, seuils, avis),
 * modèles Word à balises et données de modèle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createField,
  evaluateFormula,
  fieldOptions,
  flattenEntry,
  formatFieldValue,
  moveField,
  normalizeFormFields,
  slugFieldKey,
  summarizeEntry,
  validateFormDefinition,
  visibleFields,
} from '../missionFormEngine.js';
import { listTemplateTags, normalizeTemplateXml, renderTemplateXml } from '../docxTemplateEngine.js';
import { buildMissionTemplateData } from '../missionTemplateContext.js';

const CHAUFFERIE = normalizeFormFields([
  { type: 'section', label: 'Générateur' },
  { type: 'select', label: 'Énergie', options: ['Gaz', 'Fioul', 'Bois', 'gaz'], required: true },
  { type: 'number', label: 'Puissance', unit: 'kW', min: 0, max: 5000 },
  { type: 'number', label: 'T départ', unit: '°C', key: 't_dep' },
  { type: 'number', label: 'T retour', unit: '°C', key: 't_ret' },
  { type: 'calc', label: 'Delta T', unit: 'K', formula: '{t_dep} - {t_ret}', decimals: 1 },
  { type: 'verdict', label: 'Conduit de fumée', reserveOnNok: true },
  { type: 'longtext', label: 'Détail du défaut', showIf: { field: 'conduit_de_fumee', op: 'eq', value: 'nok' }, required: true },
  { type: 'text', label: 'Cuve fioul', showIf: { field: 'energie', op: 'eq', value: 'Fioul' } },
]);

test('clés lisibles, uniques, stables', () => {
  assert.deepEqual(CHAUFFERIE.map((f) => f.key), ['generateur', 'energie', 'puissance', 't_dep', 't_ret', 'delta_t', 'conduit_de_fumee', 'detail_du_defaut', 'cuve_fioul']);
  assert.equal(slugFieldKey('Pression', ['pression']), 'pression_2');
  assert.equal(slugFieldKey('2e passage'), 'c_2e_passage');
  assert.deepEqual(CHAUFFERIE[1].options, ['Gaz', 'Fioul', 'Bois'], 'doublons de choix retirés');
  assert.equal(normalizeFormFields('{abîmé').length, 0);
  assert.deepEqual(normalizeFormFields(JSON.stringify(CHAUFFERIE)), CHAUFFERIE, 'aller-retour JSON identique');
  assert.equal(createField('number', CHAUFFERIE).key, 'nombre');
});

test('conditions : un champ n’apparaît que si la réponse le demande', () => {
  const base = visibleFields(CHAUFFERIE, {}).map((f) => f.key);
  assert.ok(!base.includes('detail_du_defaut') && !base.includes('cuve_fioul'));
  const nok = visibleFields(CHAUFFERIE, { conduit_de_fumee: 'nok', energie: 'fioul' }).map((f) => f.key);
  assert.ok(nok.includes('detail_du_defaut') && nok.includes('cuve_fioul'), 'comparaison insensible à la casse');
});

test('calculs, seuils, obligatoires et avis non conformes', () => {
  const s = summarizeEntry(CHAUFFERIE, { energie: 'Gaz', puissance: '6000', t_dep: '72,5', t_ret: 58, conduit_de_fumee: 'nok' });
  assert.equal(s.values.delta_t, 14.5);
  assert.deepEqual(s.outOfRange, ['puissance']);
  assert.deepEqual(s.missing, ['detail_du_defaut']);
  assert.deepEqual(s.nonConform, ['conduit_de_fumee']);
  assert.equal(s.total, 6);
  const empty = summarizeEntry(CHAUFFERIE, {});
  assert.equal(empty.values.delta_t, null, 'calcul vide tant que les valeurs manquent');
  assert.deepEqual(empty.missing, ['energie']);
});

test('formules sûres', () => {
  const r = (k) => ({ a: 2, b: 3 }[k] ?? null);
  assert.equal(evaluateFormula('({a}+{b})*2', r), 10);
  assert.equal(evaluateFormula('1,5*{a}', r), 3);
  assert.equal(evaluateFormula('max({a}, {b}, 1)', r), 3);
  assert.equal(evaluateFormula('round(10/3, 2)', r), 3.33);
  assert.equal(evaluateFormula('{a}/0', r), null);
  assert.equal(evaluateFormula('{absent}+1', r), null);
  assert.throws(() => evaluateFormula('alert(1);', r));
  assert.throws(() => evaluateFormula('{a} +', r));
});

test('le constructeur signale les erreurs de conception', () => {
  const bad = normalizeFormFields([
    { type: 'select', label: 'Marque' },
    { type: 'text', label: 'Avant', showIf: { field: 'apres', op: 'filled' } },
    { type: 'text', label: 'Après' },
    { type: 'calc', label: 'Total', formula: '{apres} * 2' },
    { type: 'calc', label: 'Cassé', formula: '(1+' },
  ]);
  const messages = validateFormDefinition(bad).map((i) => i.message).join('\n');
  assert.match(messages, /Marque.*choix/);
  assert.match(messages, /Avant.*au-dessus/);
  assert.match(messages, /\{apres\} n’est pas un nombre/);
  assert.match(messages, /Cassé/);
  assert.deepEqual(validateFormDefinition(CHAUFFERIE), []);
  assert.deepEqual(validateFormDefinition(normalizeFormFields([{ type: 'select', label: 'Marque', listId: 'l1' }]), { lists: [{ id: 'l1', items_json: '["Viessmann"]' }] }), []);
});

test('listes de référence, affichage et export à plat', () => {
  const field = normalizeFormFields([{ type: 'select', label: 'Marque', options: ['Autre'], listId: 'l1' }])[0];
  assert.deepEqual(fieldOptions(field, [{ id: 'l1', items_json: '["Viessmann","De Dietrich","Autre"]' }]), ['Autre', 'Viessmann', 'De Dietrich']);
  assert.equal(formatFieldValue({ type: 'number', unit: 'kW' }, '1200,5'), '1 200,5 kW');
  assert.equal(formatFieldValue({ type: 'yesno' }, true), 'Oui');
  assert.equal(formatFieldValue({ type: 'date' }, '2026-11-26'), '26/11/2026');
  const flat = flattenEntry(CHAUFFERIE, { energie: 'Gaz', t_dep: 70, t_ret: 50, conduit_de_fumee: 'ok' });
  assert.deepEqual(flat.find((f) => f.key === 'delta_t'), { key: 'delta_t', label: 'Delta T', value: '20 K' });
  assert.ok(!flat.some((f) => f.key === 'generateur' || f.key === 'detail_du_defaut'));
  assert.equal(moveField(CHAUFFERIE, 'energie', -1)[0].key, 'energie');
});

const p = (...runs) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r>`).join('')}</w:p>`;
const row = (text) => `<w:tr><w:tc>${p(text)}</w:tc></w:tr>`;

test('Word : balises coupées par Word recollées', () => {
  const xml = p('Client : {{mis', 'sion.cli', 'ent}}');
  assert.match(normalizeTemplateXml(xml), /Client : \{\{mission\.client\}\}/);
  assert.deepEqual(listTemplateTags(`${xml}${p('{{#reserves}}{{intitule}}{{/reserves}}')}`), ['mission.client', '#reserves', 'intitule']);
  const out = renderTemplateXml(xml, { mission: { client: 'Ville d’Orsay & <co>' } });
  assert.match(out, /Client : Ville d’Orsay &amp; &lt;co&gt;/);
  assert.match(out, /<w:b\/>/, 'mise en forme du premier morceau conservée');
});

test('Word : répétition en tableau, en paragraphes, en ligne, et liste vide', () => {
  const table = `<w:tbl>${row('Réserve')}${row('{{#reserves}}{{intitule}} — {{statut}}{{/reserves}}')}</w:tbl>`;
  const data = { reserves: [{ intitule: 'Calorifuge', statut: 'Ouvert' }, { intitule: 'Purge', statut: 'Levée' }], sites: [{ nom: 'A' }, { nom: 'B' }], vide: [] };
  const t = renderTemplateXml(table, data);
  assert.equal((t.match(/<w:tr>/g) || []).length, 3, 'une ligne d’en-tête + une ligne par réserve');
  assert.match(t, /Calorifuge — Ouvert[\s\S]*Purge — Levée/);
  const paras = renderTemplateXml(`${p('{{#sites}}')}${p('Site {{nom}}')}${p('{{/sites}}')}${p('Fin')}`, data);
  assert.equal((paras.match(/<w:p>/g) || []).length, 3, 'paragraphes repères retirés');
  assert.match(paras, /Site A[\s\S]*Site B[\s\S]*Fin/);
  assert.match(renderTemplateXml(p('Sites : {{#sites}}{{nom}}, {{/sites}}'), data), /Sites : A, B, /);
  assert.match(renderTemplateXml(p('{{^vide}}Aucune réserve.{{/vide}}'), data), /Aucune réserve\./);
  assert.doesNotMatch(renderTemplateXml(p('{{^reserves}}Aucune réserve.{{/reserves}}'), data), /Aucune/);
  const cell = renderTemplateXml(`<w:tbl>${row('{{#sites}}')}${row('{{nom}}')}${row('{{/sites}}')}</w:tbl>`, data);
  assert.doesNotMatch(cell, /<w:tc><\/w:tc>/, 'jamais de cellule vide invalide');
  assert.match(cell, />A<[\s\S]*>B</);
  assert.equal((cell.match(/<w:tr>/g) || []).length, 2, 'lignes repères retirées');
  assert.match(renderTemplateXml(p('{{note}}'), { note: 'L1\nL2' }), /L1<\/w:t><w:br\/><w:t xml:space="preserve">L2/);
  assert.match(renderTemplateXml(p('{{#tags}}[{{.}}]{{/tags}}'), { tags: ['a', 'b'] }), /\[a\]\[b\]/);
  assert.match(renderTemplateXml(p('X{{#orpheline}}Y'), {}), /XY/, 'balise orpheline sans effet');
});

test('données du modèle : Mission, réserves, mesures, trames champ par champ', () => {
  const data = buildMissionTemplateData({
    mission: { label: 'Chaufferie', client_name: 'Orsay', status: 'active', start_date: '2026-11-02' },
    typeLabel: 'Diagnostic chaufferie',
    points: [{ type: 'reserve', label: 'Calorifuge', status: 'open', due_date: '2026-12-01' }, { type: 'action', label: 'Purge', status: 'closed' }],
    measures: [{ type: 'Pression', value_number: 1.4, unit: 'bar', created_at: '2026-11-26 07:00:00' }],
    forms: [{ id: 'f1', label: 'Contrôle chaufferie', fields_json: JSON.stringify(CHAUFFERIE) }],
    entries: [{ form_id: 'f1', target_label: 'Chaufferie A', status: 'done', values_json: JSON.stringify({ energie: 'Gaz', t_dep: 70, t_ret: 55 }) }],
    now: Date.parse('2026-11-26T09:00:00Z'),
  });
  assert.equal(data.mission.debut, '02/11/2026');
  assert.equal(data.nb.reserves_ouvertes, 1);
  assert.equal(data.reserves[0].echeance, '01/12/2026');
  assert.equal(data.mesures[0].valeur, '1,4');
  assert.equal(data.trame_controle_chaufferie[0].delta_t, '15 K');
  assert.equal(data.trames[0].fiches[0].cible, 'Chaufferie A');
  const xml = renderTemplateXml(`${p('{{mission.nom}} — {{mission.type}}')}${p('{{#trame_controle_chaufferie}}{{cible}} : ΔT {{delta_t}}{{/trame_controle_chaufferie}}')}`, data);
  assert.match(xml, /Chaufferie — Diagnostic chaufferie[\s\S]*Chaufferie A : ΔT 15 K/);
});

// ---------------------------------------------------------------- SQLite
import { DatabaseSync } from 'node:sqlite';
import { migrateDatabase } from '../database/migrate.js';
import * as Q from '../missionFormsQueries.js';
import { insertMissionModel, modelFormIds, queryMissionModels } from '../missionModelsQueries.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
const db = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, params = []) { return sqlite.prepare(sql).run(...params); },
  async getAllAsync(sql, params = []) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, params = []) { return sqlite.prepare(sql).get(...params) || null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { const r = await fn(); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

test('SQLite : trame créée, versionnée, rattachée, fiches reprises sans perte', async () => {
  await migrateDatabase(db);
  sqlite.exec(`INSERT INTO missions(id,family,type,label) VALUES('m1','suivi_ponctuel','suivi_technique','P2 Orsay');
    INSERT INTO mission_sites(id,name) VALUES('s1','Chaufferie A'),('s2','Chaufferie B');
    INSERT INTO mission_site_links(mission_id,site_id) VALUES('m1','s1'),('m1','s2');`);
  const formId = await Q.saveForm(db, { label: 'Contrôle chaufferie', targetType: 'site', fields: CHAUFFERIE });
  assert.equal((await Q.getForm(db, formId)).version, 1);
  await Q.saveForm(db, { id: formId, label: 'Contrôle chaufferie P2', targetType: 'site', fields: CHAUFFERIE });
  assert.equal((await Q.getForm(db, formId)).version, 1, 'renommer ne change pas la version');
  await Q.saveForm(db, { id: formId, label: 'Contrôle chaufferie P2', targetType: 'site', fields: [...CHAUFFERIE, { type: 'yesno', label: 'Carnet présent' }] });
  assert.equal((await Q.getForm(db, formId)).version, 2);

  await Q.attachForm(db, 'm1', formId);
  await Q.attachForm(db, 'm1', formId);
  assert.equal((await Q.queryMissionForms(db, 'm1')).length, 1, 'rattachement idempotent');
  assert.deepEqual((await Q.queryFormTargets(db, 'm1', 'site')).map((t) => t.label), ['Chaufferie A', 'Chaufferie B']);

  const entryId = await Q.createEntry(db, { missionId: 'm1', formId, targetId: 's1', targetLabel: 'Chaufferie A' });
  await Q.saveEntryValues(db, entryId, { energie: 'Gaz', conduit_de_fumee: 'nok' });
  const entry = await Q.getEntry(db, entryId);
  assert.equal(entry.status, 'draft');
  assert.equal(entry.form_version, 2);
  assert.deepEqual(JSON.parse(entry.values_json), { energie: 'Gaz', conduit_de_fumee: 'nok' });

  const first = await Q.completeEntry(db, entryId);
  assert.equal(first.reserves.length, 1, 'avis non conforme → réserve');
  const second = await Q.completeEntry(db, entryId);
  assert.equal(second.reserves.length, 0, 'jamais de réserve en double');
  const reserve = sqlite.prepare("SELECT * FROM mission_points WHERE source_type='form_entry'").get();
  assert.equal(reserve.type, 'reserve');
  assert.equal(reserve.site_id, 's1');
  assert.match(reserve.label, /Conduit de fumée — Chaufferie A/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM mission_point_history WHERE point_id=?').get(reserve.id).n, 1);
  const linked = (await Q.queryMissionForms(db, 'm1'))[0];
  assert.equal(linked.entry_count, 1);
  assert.equal(linked.done_count, 1);

  await Q.reopenEntry(db, entryId);
  assert.equal((await Q.getEntry(db, entryId)).status, 'draft');

  await Q.detachForm(db, 'm1', formId);
  assert.equal((await Q.queryEntries(db, 'm1')).length, 1, 'retirer la trame garde les fiches');
  assert.equal(await Q.removeForm(db, formId), 'archived', 'trame utilisée : archivée, pas supprimée');
  assert.equal((await Q.queryForms(db)).length, 0);
  assert.equal((await Q.queryForms(db, { includeArchived: true })).length, 1);
  const blank = await Q.saveForm(db, { label: 'Brouillon', fields: [{ type: 'text', label: 'Note' }] });
  assert.equal(await Q.removeForm(db, blank), 'deleted');
  const copy = await Q.duplicateForm(db, formId);
  assert.match((await Q.getForm(db, copy)).label, /\(copie\)/);

  const src = await Q.queryTemplateSource(db, 'm1');
  assert.equal(src.forms.length, 1, 'la trame retirée mais remplie reste dans le rapport');
  assert.equal(src.entries.length, 1);
});

test('SQLite : listes de référence et modèles avec trames', async () => {
  const listId = await Q.saveRefList(db, { label: 'Marques chaudières', items: ['Viessmann', ' viessmann ', '', 'De Dietrich'], sourceName: 'marques.xlsx' });
  assert.deepEqual(JSON.parse((await Q.queryRefLists(db))[0].items_json), ['Viessmann', 'De Dietrich']);
  await Q.saveRefList(db, { id: listId, label: 'Marques', items: ['Atlantic'] });
  assert.equal((await Q.queryRefLists(db))[0].source_name, 'marques.xlsx', 'source conservée');
  await Q.deleteRefList(db, listId);
  assert.equal((await Q.queryRefLists(db)).length, 0);

  const modelId = await insertMissionModel(db, { label: 'Prise en charge P2', formIds: ['a', 'a', 'b'] });
  const model = (await queryMissionModels(db)).find((m) => m.id === modelId);
  assert.deepEqual(modelFormIds(model), ['a', 'b']);
  assert.deepEqual(modelFormIds({ forms_json: '{abîmé' }), []);

  const tpl = await Q.insertReportTemplate(db, { label: 'Rapport P2', fileUri: 'file:///x.docx', tags: ['mission.nom'] });
  assert.equal((await Q.queryReportTemplates(db)).length, 1);
  assert.equal(await Q.deleteReportTemplate(db, tpl), 'file:///x.docx');
});

import { entriesToRows, excelSheetName } from '../missionFormEngine.js';
test('Excel client : une ligne par fiche, une colonne par champ', () => {
  const rows = entriesToRows(CHAUFFERIE, [{ target_label: 'Chaufferie A', status: 'done', updated_at: '2026-11-26T08:00:00Z', values_json: JSON.stringify({ energie: 'Gaz', t_dep: 70, t_ret: 50 }) }]);
  assert.equal(rows[0].Cible, 'Chaufferie A');
  assert.equal(rows[0]['Delta T'], '20 K');
  assert.equal(rows[0]['Cuve fioul'], '', 'champ masqué par condition laissé vide');
  assert.ok(!('Générateur' in rows[0]), 'pas de colonne pour un titre de section');
  assert.equal(excelSheetName('T01', 'Contrôle [chaufferie]/sous-station : très long libellé'), 'T01_Contrôle_chaufferie_sous-st');
});

import * as XLSX from 'xlsx';
import { buildMissionPack, parseMissionPack, planMissionPackImport } from '../missionPackCore.js';
import { workbookColumns } from '../missionRefListImport.js';
import { FORM_STARTERS } from '../missionFormStarters.js';

test('exemples de trames : tous cohérents', () => {
  for (const starter of FORM_STARTERS) assert.deepEqual(validateFormDefinition(normalizeFormFields(starter.fields)), [], starter.key);
});

test('listes de référence depuis un Excel : une liste par colonne, sans doublon', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Marque', 'État'], ['Viessmann', 'Bon'], ['viessmann', 'Moyen'], ['De Dietrich', ''], ['', 'Mauvais']]), 'Réf');
  const cols = workbookColumns(wb, XLSX);
  assert.deepEqual(cols.map((c) => [c.header, c.values]), [['Marque', ['Viessmann', 'De Dietrich']], ['État', ['Bon', 'Moyen', 'Mauvais']]]);
});

test('partage par fichier : rien n’est écrasé, liens recâblés, doublons ignorés', () => {
  let n = 0;
  const id = (p) => `${p}_${++n}`;
  const pack = parseMissionPack(JSON.stringify(buildMissionPack({
    lists: [{ id: 'L1', label: 'Marques', items_json: '["Viessmann"]' }],
    forms: [{ id: 'F1', label: 'Contrôle', target_type: 'site', fields_json: JSON.stringify([{ type: 'select', label: 'Marque', listId: 'L1' }]) }, { id: 'F2', label: 'Déjà là', fields_json: '[{"type":"text","label":"Note"}]' }],
    models: [{ id: 'M1', label: 'P2', family: 'suivi_ponctuel', type: 'suivi_technique', forms_json: '["F1","F2"]', modules_json: '{"v":1,"added":["signature"],"removed":[]}' }],
    templates: [{ id: 'T1', label: 'Rapport', original_name: 'r.docx', docx_base64: 'UEsDBA==' }],
  })));
  const existing = {
    forms: [{ id: 'local-f2', label: 'Déjà là', target_type: 'mission', fields_json: '[{"type":"text","label":"Note"}]' }, { id: 'x', label: 'Contrôle', fields_json: '[]' }],
    lists: [], models: [], templates: [],
  };
  const plan = planMissionPackImport(pack, existing, id);
  assert.equal(plan.skipped, 1, 'trame identique ignorée');
  assert.equal(plan.lists.length, 1);
  assert.equal(plan.forms.length, 1);
  assert.equal(plan.forms[0].label, 'Contrôle (importé)', 'homonyme différent : renommé, pas écrasé');
  assert.equal(JSON.parse(plan.forms[0].fields_json)[0].listId, plan.lists[0].id, 'liste recâblée');
  assert.deepEqual(JSON.parse(plan.models[0].forms_json), [plan.forms[0].id, 'local-f2'], 'trames du modèle recâblées');
  assert.equal(plan.templates.length, 1);
  const again = planMissionPackImport(pack, { ...existing, forms: [...existing.forms, ...plan.forms], lists: plan.lists, models: plan.models, templates: plan.templates }, id);
  assert.equal(again.forms.length + again.lists.length + again.models.length + again.templates.length, 0, 'réimporter le même fichier n’ajoute rien');
  assert.throws(() => parseMissionPack('{"format":"autre"}'), /pas un fichier de partage/);
  assert.throws(() => parseMissionPack('{"format":"METRA_MISSION_PACK","version":99}'), /plus récente/);
});
