const fs = require('fs');

const path = 'MetraDirectoryScreen.js';
let text = fs.readFileSync(path, 'utf8');

const importNeedle = "import { getCachedClient, listCachedLocals, listCachedSites, materializeCachedSite, searchCachedDirectory } from './symfonyApiCacheDb.js';\n";
const importLine = "import { importLatestApiVisitsForSite } from './apiLatestVisitImportDb.js';\n";
if (!text.includes(importLine)) {
  if (!text.includes(importNeedle)) throw new Error('MetraDirectoryScreen import anchor not found');
  text = text.replace(importNeedle, importNeedle + importLine);
}

const oldOpen = `      const siteId = await materializeCachedSite(site.remote_site_id, site.remote_client_id || siteClient?.remote_client_id);\n      setSelectedSite(null);\n      setSelectedClient(null);\n      navigation.navigate('SiteVisites', { siteId, nomSite: site.nom });`;
const newOpen = `      const siteId = await materializeCachedSite(site.remote_site_id, site.remote_client_id || siteClient?.remote_client_id);\n      const latestImport = await importLatestApiVisitsForSite(siteId, site.remote_site_id);\n      setSelectedSite(null);\n      setSelectedClient(null);\n      navigation.navigate('SiteVisites', {\n        siteId,\n        nomSite: site.nom,\n        apiLatestImportCount: latestImport.importedCount,\n      });`;
if (!text.includes(newOpen)) {
  if (!text.includes(oldOpen)) throw new Error('MetraDirectoryScreen openInMetra anchor not found');
  text = text.replace(oldOpen, newOpen);
}

text = text.replace(
  "{siteActionBusy ? 'Ouverture…' : 'Ouvrir le patrimoine du site'}",
  "{siteActionBusy ? 'Import en cours…' : 'Importer le site dans METRA'}"
);
text = text.replace(
  'Patrimoine · visites · équipements · remarques · LAB',
  'Patrimoine · dernière visite disponible · équipements · remarques · LAB'
);

fs.writeFileSync(path, text);
console.log('Latest Symfony visit import wired into MetraDirectoryScreen.');
