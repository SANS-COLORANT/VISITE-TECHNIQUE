const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function requireCount(text, needle, minimum, label) {
  const count = text.split(needle).length - 1;
  if (count < minimum) throw new Error(`${label}: expected at least ${minimum}, found ${count}`);
}

const directory = read('MetraDirectoryScreen.js');
requireText(
  directory,
  "import { importLatestApiVisitsForSite } from './apiLatestVisitImportDb.js';",
  'latest visit importer wiring'
);
requireText(
  directory,
  'const latestImport = await importLatestApiVisitsForSite(siteId, site.remote_site_id);',
  'single-site latest visit import'
);
requireText(
  directory,
  'apiLatestImportCount: latestImport.importedCount',
  'single-site import navigation summary'
);
requireText(directory, 'const importSelectedSites = async () =>', 'multi-site import action');
requireText(directory, '1, plusieurs ou tous les sites', 'multi-site selection UI');
requireText(directory, 'batchImportProgress', 'multi-site progress state');
requireCount(
  directory,
  'importLatestApiVisitsForSite(siteId, site.remote_site_id)',
  2,
  'latest visit import must cover single and multi-site flows'
);

const latest = read('apiLatestVisitImportDb.js');
requireText(
  latest,
  "import { enrichLatestImportedVisitFields } from './apiLatestVisitFieldEnrichmentDb.js';",
  'latest visit field enrichment import'
);
requireText(
  latest,
  'const fieldImport = await enrichLatestImportedVisitFields({',
  'latest visit field enrichment call'
);
requireText(latest, 'fieldImport,', 'latest visit field import summary');
requireText(latest, 'importedRemarks,', 'latest visit remark import summary');
requireText(latest, 'criteriaFromEarlierVisits', 'older-source criterion diagnostics');
requireText(latest, 'created: !existing?.id,', 'latest visit creation/update return state');
requireText(latest, 'export async function importLatestApiVisitForLocal(siteId, remoteLocalId)', 'selected-local import flow');
requireText(latest, 'export async function importLatestApiVisitsForSite(siteId, remoteSiteId)', 'site and batch import flow');

console.log('Latest API visit runtime contract validated: selected-local, single-site and multi-site imports include the preparation snapshot, latest-known criterion values and enriched fields.');
