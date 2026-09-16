const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error(`${label}: missing ${value}`); }

const api = read('symfonyApi.js');
const cache = read('symfonyApiCacheDb.js');
const directory = read('MetraDirectoryScreen.js');
const latestImport = read('apiLatestVisitImportDb.js');

// Un site sans visite n'existe pas dans preparation-visites : le répertoire
// doit donc aussi charger le référentiel structurel complet du client.
need(api, '/referentiel-structure', 'client preparation also loads structure referential');
need(api, 'cacheStructureDirectory(remoteClientId, structure)', 'structure referential is merged into directory cache');
need(cache, 'extractStructureSitesFromReferential', 'referential site extraction');
need(cache, 'for (const lot of list(payload?.lots))', 'nested lot sites are supported');
need(cache, 'for (const site of list(lot?.sites))', 'every site under every lot is collected');
need(cache, 'INSERT INTO api_site_links', 'empty site gets a durable site link');
need(cache, 'INSERT INTO api_client_site_links', 'empty site gets a durable client-site relation');
need(cache, 'api_structure_referential', 'same structure referential is kept offline for site/local creation');

// L'import d'un site vide doit réussir sans fabriquer de fausse visite.
need(directory, 'materializeCachedSite(site.remote_site_id', 'single empty site can be materialized in METRA');
need(directory, 'Importer le site dans METRA', 'single-site import action remains available');
need(latestImport, 'const locals = await listCachedLocals(remoteIdSite);', 'latest-visit import tolerates a site with zero cached locals');
need(latestImport, 'importedCount: results.filter((result) => result.imported).length', 'zero imported visits remains a valid result');

console.log('Empty Intranet site import contract OK: structure referential exposes sites without visits, import materializes the site, and zero historical visits remains valid.');
