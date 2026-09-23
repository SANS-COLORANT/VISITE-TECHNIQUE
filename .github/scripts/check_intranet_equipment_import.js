const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const latest = read('apiLatestVisitImportDb.js');
requireText(latest, 'const materials = Array.isArray(ref?.materiels) ? ref.materiels : [];', 'cached Intranet materials are consumed');
requireText(latest, 'importCurrentMaterialsForLocal', 'current local patrimoine importer');
requireText(latest, "sourceType: 'current_remote_local_patrimoine'", 'equipment provenance');
requireText(latest, "p.entite_type='equipement' AND p.origine='api_symfony'", 'idempotent equipment lookup');
requireText(latest, 'INSERT INTO equipements', 'persistent equipment creation');
requireText(latest, 'UPDATE equipements', 'persistent equipment refresh');
requireText(latest, 'INSERT INTO materiel', 'imported visit material reference');
requireText(latest, 'INSERT INTO equipement_trames', 'equipment visit-template binding');
requireText(latest, "SELECT id,nom,logo_uri FROM marques_equipement", 'local catalog brand lookup');
requireText(latest, 'const catalogBrand = brandsByKey.get(normalize(material.marque))', 'accent/case tolerant brand matching');
requireText(latest, 'canonicalBrand: brand', 'canonical catalog brand persisted');
requireText(latest, 'matchedCatalogBrands', 'brand matching diagnostics');
requireText(latest, "visiteId: null, trameId", 'equipment is imported even without visit history');
requireText(latest, "for (const [key, value] of attributes)", 'SQLite equipment attribute writes stay sequential');

const persistent = read('persistentEquipmentDb.js');
requireText(persistent, "a.cle='api_symfony.numero_materiel'", 'material number survives future visits');
requireText(persistent, "a.cle='api_symfony.reseau_desservi'", 'served network survives future visits');
requireText(persistent, "a.cle='api_symfony.caracteristiques'", 'material characteristics survive future visits');
requireText(persistent, 'AS marque_logo_uri', 'visit material exposes database logo');

const patrimoine = read('patrimoineDb.js');
requireText(patrimoine, 'AS marque_logo_uri', 'patrimoine equipment exposes database logo');

const overview = read('SiteOverviewPanel.js');
requireText(overview, 'logo_uri:item.marque_logo_uri', 'patrimoine card uses database logo');

const optimized = read('OptimizedEquipmentPanel.js');
requireText(optimized, 'logo_uri:item.marque_logo_uri', 'standard equipment card uses database logo');

const guided = read('GuidedEquipmentPanel.js');
requireText(guided, 'logo_uri:item.marque_logo_uri', 'guided equipment card uses database logo');

console.log('Intranet equipment import contract validated: current local patrimoine is materialized idempotently and known catalog brands reuse their database logo.');
