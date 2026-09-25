const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) {
    console.error('[navigation-sort-contract] ' + message);
    process.exit(1);
  }
};

const app = read('App.js');
const sites = read('ClientSitesScreen.js');
const sort = read('siteSort.js');
const memory = read('navigationMemory.js');
const locals = read('SiteLocalsScreen.js');
const visits = read('SiteVisitesScreen.js');
const home = read('HomeScreen.js');
const prewarm = read('navigationPrewarm.js');

expect(app.includes('BACK_SWIPE_ROUTES'), 'Le geste retour doit être limité aux écrans classiques.');
expect(app.includes('gesture.dx < -82') && app.includes('goBack()'), 'Un swipe franc vers la gauche doit revenir à l’écran précédent.');
expect(!app.includes("'Visite', 'HydraulicSchema'"), 'Le swipe retour ne doit pas écraser le pager horizontal d’une visite.');

for (const mode of ['alpha', 'alpha_desc', 'number', 'group', 'address']) {
  expect(sort.includes(`id: '${mode}'`), `Tri de sites manquant : ${mode}`);
}
expect(sites.includes('SITE_SORT_OPTIONS') && sites.includes('sitesTries'), 'La liste des sites doit utiliser les modes de tri.');
expect(prewarm.includes('listerAppartenancesClient'), 'Le tri Lot / groupe doit utiliser les appartenances réelles des sites via le cache de préchauffage.');
expect(sites.includes('siteGroupLabel'), 'Le groupe/lot doit être visible sur les cartes de site.');

for (const [name, source] of [['Accueil', home], ['Sites', sites], ['Locaux', locals], ['Visites', visits]]) {
  expect(source.includes('setNavigationScrollOffset'), `${name} doit mémoriser sa position de défilement.`);
  expect(source.includes('getNavigationScrollOffset'), `${name} doit restaurer sa position de défilement.`);
}
expect(memory.includes('new BoundedLruMap(HOT_UI_LIMIT)'), 'La mémoire de navigation en RAM doit être bornée.');
expect(memory.includes("PREFIX = 'ui_state::'"), 'Le contexte UI doit survivre au redémarrage via _meta sans migration de schéma.');
expect(memory.includes('DURABLE_UI_LIMIT = 24'), 'Le contexte UI durable doit rester borné.');

console.log('[navigation-sort-contract] OK');
