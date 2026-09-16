const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function forbidText(source, needle, message) {
  if (source.includes(needle)) throw new Error(message);
}

const client = read('ClientSitesScreen.js');
const app = read('App.js');
const structureUi = read('IntranetStructureUi.js');
const siteVisits = read('SiteVisitesScreen.js');

// CLIENT -> SITE : le niveau client peut créer/ouvrir des sites, mais ne doit
// plus exposer la gestion d'un LOCAL directement dans chaque carte de site.
requireText(client, '+ Site local', 'La création de site local doit rester au niveau client.');
requireText(client, '+ Site Intranet', 'La création de site Intranet doit rester au niveau client.');
forbidText(client, 'Locaux Intranet', 'Le bouton Locaux ne doit plus être affiché dans la liste client.');
forbidText(client, "navigation.navigate('IntranetStructure'", 'La liste client ne doit pas ouvrir directement la gestion des locaux.');
requireText(client, "navigation.navigate('SiteVisites'", 'Un site doit être ouvert avant de gérer ses locaux.');

// SITE -> LOCAL : une fois dans le site, l'action Locaux est disponible dans le
// header du site et conserve l'identifiant du site sélectionné.
requireText(app, "rightAction={{label:'Locaux'", 'Le site doit exposer une action Locaux visible.');
requireText(app, "navigate('IntranetStructure',{siteId:current.params?.siteId", 'L’action Locaux doit cibler le site courant.');
requireText(app, "title={`Locaux · ${current.params?.nomSite||'Site'}`}", 'L’écran de locaux doit être présenté comme enfant du site, pas comme une structure client.');

// LOCAL : la création réelle reste portée par le panneau du site et non par le
// client. Cela protège aussi le rattachement siteId -> queueMetraLocalCreation.
requireText(structureUi, 'export function IntranetSiteLocalsPanel({ siteId, onStartVisit })', 'Le panneau de locaux doit rester scoppé par siteId.');
requireText(structureUi, 'await queueMetraLocalCreation({', 'La création de local Intranet doit rester active.');
requireText(structureUi, 'localSiteId: siteId', 'Le local créé doit être explicitement rattaché au site courant.');
requireText(structureUi, '+ Ajouter un local', 'Le bouton de création de local doit rester dans le panneau du site.');

// LOCAL -> VISITE : pour un site importé depuis l'Intranet, une nouvelle visite
// doit d'abord choisir le LOCAL destinataire. Les sites purement locaux conservent
// leur création de visite directe pour ne pas casser le fonctionnement historique.
requireText(siteVisits, 'if (intranetClientImported && !apiRemoteLocalId)', 'Une visite Intranet doit passer par le local.');
requireText(siteVisits, "navigation.navigate('IntranetStructure'", 'Le bouton Nouvelle visite d’un site Intranet doit ouvrir ses locaux.');
requireText(siteVisits, 'Choisir le local de la visite', 'Le libellé doit expliquer clairement le choix du local.');
requireText(siteVisits, "creerVisiteProduction({ siteId, mode, trameId, apiRemoteLocalId, apiRemoteClientId })", 'La création locale-aware de visite doit rester intacte.');

console.log('Client -> Site -> Local -> Visit hierarchy contract OK.');
