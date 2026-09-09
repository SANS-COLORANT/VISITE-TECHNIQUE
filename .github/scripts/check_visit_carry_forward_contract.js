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

const creation = read('visitCreationDb.js');
requireText(creation, "import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';", 'prepared visit history importer wiring');
const historicalImport = creation.indexOf('await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);');
const referenceImport = creation.indexOf('await importApiReferenceForVisit(id, apiRemoteLocalId);');
if (historicalImport < 0 || referenceImport < 0 || historicalImport > referenceImport) {
  throw new Error('prepared visit must materialize the latest historical visit before importing the current API reference');
}

console.log('Visit carry-forward contract validated: ICPE/VMC reuse prior values and controls, Pré-allumage keeps controls blank, Intranet slash placeholders stay empty.');
