const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`SITE/LOCAL navigation: ${label} manquant (${needle})`);
}
function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`SITE/LOCAL navigation: ${label} interdit (${needle})`);
}

const app = read('App.js');
const clientSites = read('ClientSitesScreen.js');
const locals = read('SiteLocalsScreen.js');
const visits = read('SiteVisitesScreen.js');
const navigationPrewarm = read('navigationPrewarm.js');
const db = read('db.js');
const cache = read('symfonyApiCacheDb.js');
const latest = read('apiLatestVisitImportDb.js');
const preparation = read('apiVisitPreparationDb.js');
const repair = read('intranetIdentityRepairDb.js');
const overview = read('SiteOverviewPanel.js');
const binding = read('intranetVisitBindingDb.js');
const payload = read('intranetVisitPayload.js');

requireText(app, "SiteLocals: () => require('./SiteLocalsScreen.js').SiteLocalsScreen", 'route différée Locaux');
requireText(app, "current.name === 'SiteLocals'", 'rendu route Locaux');
requireText(clientSites, "navigation.navigate('SiteLocals'", 'Client -> Site -> Locaux');
requireText(navigationPrewarm, 'FROM installations i', 'liste des locaux réels');
requireText(navigationPrewarm, 'visit_count', 'compteur de visites par local');
requireText(locals, 'peekSiteLocals', 'affichage immédiat des locaux préchauffés');
requireText(locals, "navigation.navigate('SiteVisites'", 'Local -> Visites');
requireText(locals, 'installationId: local.installation_id', 'identité installation transmise à la visite');
requireText(locals, '+ Nouveau local', 'création locale au niveau Locaux');
requireText(navigationPrewarm, 'listerVisitesLocal', 'historique filtré au local');
requireText(visits, 'peekLocalVisits', 'historique local stale-while-revalidate');
requireText(visits, 'installationId', 'identité locale conservée');
requireText(visits, 'creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId, installationId })', 'nouvelle visite rattachée au local');
requireText(db, 'async function listerVisitesLocal', 'repository visites par local');

forbidText(cache, 'SELECT id FROM sites WHERE client_id=? AND lower(trim(nom_site))=lower(trim(?))', 'fusion SITE par libellé');
forbidText(preparation, 'sameName.length === 1', 'fusion LOCAL par libellé en préparation');
forbidText(latest, 'sameName.length === 1', 'fusion LOCAL par libellé historique');
requireText(latest, "reason: 'no_latest_visit', installationId", 'local matérialisé même sans ancienne visite');
requireText(repair, 'split_remote_site_identity', 'réparation des sites déjà fusionnés');
requireText(repair, 'split_remote_local_identity', 'réparation des locaux déjà fusionnés');
requireText(repair, 'attach_unambiguous_legacy_visits', 'anciennes visites rattachées seulement sans ambiguïté');

// La synthèse de site et le pipeline Intranet restent ceux du build 424.
requireText(overview, 'export function SiteOverviewPanel({ siteId, mode })', 'synthèse de site inchangée');
requireText(binding, 'resolveImportedLocalId', 'résolution Intranet existante conservée');
requireText(payload, 'localId', 'payload Intranet toujours ciblé sur le local');

// Toute entrée générale vers un SITE doit passer par SiteLocals.
// MetraDirectoryScreen reste autorisé à ouvrir SiteVisites directement uniquement
// après que l'utilisateur a déjà sélectionné un LOCAL Intranet précis.
const allowedDirect = new Set(['App.js', 'MetraDirectoryScreen.js', 'SiteLocalsScreen.js']);
for (const file of fs.readdirSync('.').filter((name) => name.endsWith('.js'))) {
  if (allowedDirect.has(file)) continue;
  const src = read(file);
  if (src.includes("navigation.navigate('SiteVisites'")) {
    throw new Error(`SITE/LOCAL navigation: ${file} ouvre encore SiteVisites sans passer par Locaux.`);
  }
}

console.log('Contrat SITE/LOCAL validé: Client -> Sites -> Locaux -> Visites, sans modifier la synthèse ni le pipeline Intranet.');
