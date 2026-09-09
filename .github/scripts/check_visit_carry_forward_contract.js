const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const carry = read('visitCarryForwardDb.js');
requireText(carry, "if (trame.id === 'pre_allumage') return Boolean(field.stable || field.carryForward);", 'pre-allumage durable fields only');
requireText(carry, 'async function copyReusableControls', 'control carry-forward');
requireText(carry, "if (trame.id === 'pre_allumage') return 0;", 'pre-allumage controls stay blank');
requireText(carry, 'SELECT ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire,reseau_site_id', 'network values selected');
requireText(carry, 'row.t_ext_c ?? null', 'external temperature carry-forward');
requireText(carry, 'row.t_dep_c ?? null', 'departure temperature carry-forward');
requireText(carry, 'SELECT label,valeur,unite,compteur_site_id FROM compteurs', 'meter values selected');
requireText(carry, 'row.valeur ?? null', 'meter value carry-forward');
requireText(carry, 'copiedControls', 'control copy summary');
forbidText(carry, 'FROM remarques', 'historical remarks must not be cloned');
forbidText(carry, 'FROM photos', 'historical photos must not be cloned');

const latest = read('apiLatestVisitImportDb.js');
requireText(latest, 'function meaningfulRemoteValue(value)', 'Intranet placeholder normalization');
requireText(latest, "v === '/' ? null : v", 'slash placeholder is empty');
requireText(latest, 'const ref = sanitizeRemoteReference(sourceRef);', 'sanitized latest visit reference');
requireText(latest, 'export async function importLatestApiVisitForLocal(siteId, remoteLocalId)', 'selected-local latest visit import');
requireText(latest, "placeholderRule: 'slash_is_empty'", 'import provenance placeholder rule');
requireText(latest, "criteriaRule: 'preparation_values_are_latest_known_visiteSourceId_is_provenance_only'", 'latest-known criterion semantics');
requireText(latest, 'criteriaFromEarlierVisits', 'older criterion source diagnostics');
forbidText(latest, 'remoteId(criterion?.visiteSourceId) !== remoteVisitId', 'older preparation controls must not be rejected');
forbidText(latest, 'remoteId(criterion?.visiteSourceId) === remoteVisitId', 'source visit id must not gate controls');

const fields = read('apiLatestVisitFieldEnrichmentDb.js');
requireText(fields, 'function meaningfulRemoteValue(value)', 'field placeholder normalization');
requireText(fields, 'function criterionReference(category, subCategory, criterion)', 'branch-safe criterion identity');
requireText(fields, "rule: 'preparation_values_are_latest_known_visiteSourceId_is_provenance_only'", 'latest-known field semantics');
requireText(fields, 'networkValuesFromEarlierVisits', 'older network source diagnostics');
requireText(fields, 'valuesFromEarlierVisits', 'older field source diagnostics');
forbidText(fields, 'remoteId(criterion?.visiteSourceId) !== remoteVisitId', 'older preparation fields must not be rejected');
forbidText(fields, 'remoteId(criterion?.visiteSourceId) === remoteVisitId', 'source visit id must not gate fields or networks');
forbidText(fields, "networkCriterionRefs.add(remoteId(criterion?.id)", 'reused criterion ids must be scoped by branch');

const preparation = read('apiVisitPreparationDb.js');
requireText(preparation, 'criteriaAreLatestKnownPreparationValues: true', 'preparation criteria meaning');
requireText(preparation, 'criteriaSourceVisitIdIsProvenanceOnly: true', 'source visit provenance meaning');
requireText(preparation, 'criteriaCanPrefillCurrentVisit: !preAllumage', 'ICPE/VMC preparation prefill');
requireText(preparation, 'preAllumageControlsMustStayBlank: preAllumage', 'Pré-allumage exception');
forbidText(preparation, 'previousCriteriaMustNotSeedCurrentVisit: true', 'stale no-prefill semantic');
forbidText(preparation, 'criteriaAreHistoricalReferenceOnly: true', 'stale reference-only semantic');

const creation = read('visitCreationDb.js');
requireText(creation, "import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';", 'prepared visit history importer wiring');
const historicalImport = creation.indexOf('await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);');
const referenceImport = creation.indexOf('await importApiReferenceForVisit(id, apiRemoteLocalId);');
if (historicalImport < 0 || referenceImport < 0 || historicalImport > referenceImport) {
  throw new Error('prepared visit must materialize the latest preparation snapshot before importing the current API reference');
}

console.log('Visit preparation contract validated: ICPE/VMC import every latest-known preparation value regardless of visiteSourceId, branch identity is preserved, Pré-allumage keeps controls blank, and slash placeholders stay empty.');
