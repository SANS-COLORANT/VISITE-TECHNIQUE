/** REMAR-only UX: executable checks without changing any visit data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let totalChecks = 0;
const check = (condition, description) => {
  assert.ok(condition, description);
  totalChecks++;
  console.log('OK ' + totalChecks + ': ' + description);
};

const raw = read('remarTrame.js');
const literal = raw.match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/);
check(!!literal, 'versioned REMAR definition available');
const remar = JSON.parse(literal[1]);
const fields = Object.values(remar.ui.panels).flatMap((sections) => Object.values(sections).flat());
const ids = remar.ui.tabOrder.filter((id) => id !== 'SEP');
check(remar.id === 'remar_v1' && ids.length === 17, '17 stable REMAR panel IDs');
check(fields.length === 141 && fields.filter((field) => field.type === 'controle').length === 70,
  '141 REMAR fields including 70 controls preserved');
check(remar.excel.mainSheet === 'TRAME REMAR' && remar.excel.fieldMappings.length > 0,
  'unchanged REMAR Excel workbook contract');
check(fields.filter((field) => field.type === 'controle').every((field) => ['S','N.S','N.R','S.O','N.V'].every((a) => field.presets?.[a]?.length)),
  'existing five-opinion presets preserved');

const planningSource = read('remarJourneyPlan.js').replace(/\bexport\s+/g, '');
const { REMAR_JOURNEY_GROUPS, buildRemarJourneyGroups, firstIncompleteRemarTab } =
  new Function(planningSource + '\nreturn { REMAR_JOURNEY_GROUPS, buildRemarJourneyGroups, firstIncompleteRemarTab };')();
const allTabIds = REMAR_JOURNEY_GROUPS.flatMap((g) => g.ids);
check(new Set(allTabIds).size === allTabIds.length, 'groups never duplicate panels');
check(ids.length === allTabIds.length && ids.every((id) => allTabIds.includes(id)),
  'all 17 REMAR panels belong to a single accessible métier group');
const base = buildRemarJourneyGroups(ids, remar.ui.labels, {});
check(base.length === 5 && base.flatMap((g) => g.tabs).length === ids.length, 'five concise sections cover full REMAR');
check(base[0].tabs[0].id === 'p-infos' && base[base.length-1].tabs.at(-1).id === 'p-photos',
  'field workflow starts with information and ends with photos');
const currentState = {
  'p-infos': { total: 14, done: 14, ns: 0 },
  'p-remar-reseaux': { total: 5, done: 2, ns: 0 },
  'p-conf-local': { total: 17, done: 7, ns: 2 },
};
const progress = buildRemarJourneyGroups(ids, remar.ui.labels, currentState);
check(firstIncompleteRemarTab(progress) === 'p-remar-reseaux', 'resume targets first known incomplete section');
check(progress[0].total === 36 && progress[0].done === 23 && progress[0].ns === 2,
  'group progress and anomaly totals are exact and read-only');
check(firstIncompleteRemarTab(buildRemarJourneyGroups(ids, remar.ui.labels, {})) === null,
  'unknown counts do not invent pending work');
const custom = buildRemarJourneyGroups([...ids, 'p-personnel-sur-mesure'], { ...remar.ui.labels, 'p-personnel-sur-mesure': 'Mes essais' }, {});
check(custom.at(-1).label === 'Autres onglets' && custom.at(-1).tabs[0].label === 'Mes essais',
  'new editable-library panels are never hidden');

const screen = read('VisiteScreen.js'), sheet = read('RemarJourneySheet.js');
check(screen.includes("trame.id === 'remar_v1' || trame.familyId === 'remar_v1'"),
  'custom REMAR versions reuse the same index');
check(screen.includes('estParcoursRemar && remarJourneyVisible') && screen.includes('onSelect={changerOnglet}'),
  'REMAR navigation reuses native pager and existing visit-state persistence');
check(screen.includes('estParcoursRemar && !modeTablette ? boutonSommaireRemar') && screen.includes('estParcoursRemar ? boutonSommaireRemar'),
  'sommaire is always reachable on phone or tablet');
check(sheet.includes('accessibilityRole="button"') && sheet.includes('onPress={() => jump(tab.id)}'),
  'index supports touch and accessible navigation');

const controls = read('PresetControleGenerique.js');
check(controls.includes("const satisfiedFolded = isRemar && avis === 'S' && !remarSExpanded"),
  'only REMAR satisfied opinions receive the compact display');
check(controls.includes("onPress={() => setRemarSExpanded(true)}") && controls.includes("onPress={() => setRemarSExpanded(false)}"),
  'S comments remain editable and details can be folded again');
check(controls.includes("isRemar || avis === 'N.S'") && controls.includes("beforeCapture={isRemar && avis !== 'N.S'"),
  'REMAR photos are supported for every selected opinion, not only N.S');
check(controls.includes('({ entiteKey: controleKey, label })') &&
  read('PhotoButton.js').indexOf('if (beforeCapture)') < read('PhotoButton.js').indexOf('const reserve = await resoudreReserveDepuisControle'),
  'non-N.S photos use the control key without creating a false reserve');
check(controls.includes('upsertControlePartiel') && controls.includes('upsertRemarquePrescription'),
  'the original comment and reserve persistence is retained');

const generic = read('TrameGenericPanel.js'), durable = read('DurableChampGenerique.js'), stepper = read('GenericFields.js');
check(generic.includes("estRemar && structure.length > 1") && generic.includes('onPress={closeAll}') &&
  generic.includes('onPress={() => open(structure.map((sec) => sec.sectionCode))}'),
  'bulk expand/collapse is limited to REMAR panels with multiple sections');
check(generic.includes('compactStepper={estRemar}') && durable.includes('compactValue={compactStepper}'),
  'only REMAR uses smaller numeric steppers through explicit opt-in');
check(stepper.includes('compactValue = false') && stepper.includes('compactValue && { fontSize: 16'),
  'other trames preserve their original 20pt numeric typography');
check(read('VisitKit.js').includes('tileBtn: { width: 40, height: 40'),
  'touch targets of the other numeric tiles remain intact');
console.log('\nREMAR terrain UX: ' + totalChecks + ' contract checks passed.');
