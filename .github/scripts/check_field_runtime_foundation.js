const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) {
    console.error('[field-runtime-foundation] ' + message);
    process.exit(1);
  }
};

const runtime = read('visitRuntimeCache.js');
const prewarm = read('navigationPrewarm.js');
const visitPrewarm = read('visitPrewarm.js');
const previous = read('visitPreviousSnapshot.js');
const navigation = read('navigationMemory.js');
const save = read('saveActivity.js');
const autosave = read('durableAutosave.js');
const generic = read('GenericFields.js');
const photoCache = read('photoVariantCache.js');
const photoButton = read('PhotoButton.js');
const photoPanel = read('OptimizedPhotoPanel.js');
const home = read('HomeScreen.js');
const sites = read('ClientSitesScreen.js');
const locals = read('SiteLocalsScreen.js');
const visits = read('SiteVisitesScreen.js');
const visit = read('VisiteScreen.js');
const trame = read('TrameGenericPanel.js');
const releves = read('OptimizedRelevesPanel.js');
const regulation = read('OptimizedRegulationPanel.js');
const equipment = read('GuidedEquipmentPanel.js');
const remarks = read('OptimizedRemarksPanel.js');
const pilotage = read('ClientPilotageScreen.js');
const preallumage = read('PreAllumageInstallationPanelV3.js');
const docs = read('docs/PERFORMANCE_RUNTIME.md');

expect(runtime.includes('const HOT_LIMIT = 3;'), 'HOT doit rester limité à 3 visites.');
expect(runtime.includes('const WARM_LIMIT = 12;'), 'WARM doit rester un cache de métadonnées borné.');
expect(runtime.includes("tier: 'COLD'"), 'Le niveau COLD doit rester explicite.');
expect(prewarm.match(/new BoundedLruMap\(3\)/g)?.length >= 3, 'Clients/Sites/Locaux/Visites doivent utiliser des caches de préchauffage bornés à 3.');
expect(visitPrewarm.includes('prewarmPreviousVisitSnapshot(id)'), 'Le préchauffage visite doit préparer la référence précédente sans bloquer.');
expect(previous.includes('const cache = new BoundedLruMap(3);'), 'La référence précédente doit être bornée à 3 visites.');
expect(!previous.includes('FROM photos'), 'La référence précédente ne doit jamais charger/copier les photos historiques.');
expect(!previous.includes('FROM remarques'), 'La référence précédente ne doit jamais charger/copier les réserves historiques.');

expect(home.includes('onPressIn={() => prewarmClientSites'), 'Accueil doit préchauffer le client au toucher.');
expect(home.includes('prewarmVisitInBackground'), 'Accueil doit préchauffer une visite en cours au toucher.');
expect(sites.includes('onPressIn={() => prewarmSiteLocals'), 'Sites doit préchauffer les locaux au toucher.');
expect(locals.includes('onPressIn={() => prewarmLocalVisits'), 'Locaux doit préchauffer les visites au toucher.');
expect(visits.includes('onPressIn={() => { if (!selectionExport) prechaufferVisite'), 'Historique doit préchauffer une visite au toucher.');
expect(visits.includes('peekLocalVisits'), 'Historique doit afficher le dernier cache local avant revalidation.');

expect(navigation.includes('const DURABLE_UI_LIMIT = 24;'), 'Le contexte UI durable doit être borné.');
expect(navigation.includes("PREFIX = 'ui_state::'"), 'Le contexte UI doit survivre au redémarrage via _meta.');
expect(visit.includes('hydrateNavigationState(visitNavKey)'), 'Une visite doit restaurer son onglet après redémarrage.');
expect(visit.includes("setNavigationState(visitNavKey, { activeTab: prochain })"), 'Chaque changement d’onglet doit être mémorisé durablement.');
expect(trame.includes('visit-panel:') && trame.includes('setNavigationScrollOffset'), 'Les panneaux génériques doivent restaurer leur scroll.');
expect(preallumage.includes('visit-preallumage:') && preallumage.includes('activeLocalId') && preallumage.includes('collapsed'), 'Pré-allumage doit restaurer le local actif et les sections repliées.');
expect(preallumage.includes('useListScrollMemory'), 'Pré-allumage doit restaurer le scroll propre à chaque local.');
for (const [name, source] of [['Relevés', releves], ['Régulation', regulation], ['Équipements', equipment], ['Remarques', remarks], ['Photos', photoPanel]]) {
  expect(source.includes('useListScrollMemory'), name + ' doit restaurer sa position exacte.');
}

expect(generic.includes('useDurableAutosave'), 'Les anciens champs doivent utiliser le pipeline autosave durable.');
expect(autosave.includes('markDraftDirty') && autosave.includes('markDraftSaved'), 'L’autosave doit exposer son état sans bloquer le clavier.');
expect(save.includes('dirty.has(id)'), 'Le statut de sauvegarde ne doit pas rerendre à chaque caractère.');
expect(visit.includes("'✓ Enregistré'") && visit.includes('saveActivity.pending'), 'La visite doit afficher un statut de sauvegarde discret.');

expect(photoCache.includes("thumb: { width: 320") && photoCache.includes("preview: { width: 1280"), 'Les niveaux miniature / aperçu doivent rester distincts.');
expect(photoCache.includes('while (active < 2'), 'La génération photo doit rester limitée à deux jobs simultanés.');
expect(photoCache.includes('limit: 160') && photoCache.includes('limit: 36'), 'Le cache disque photo doit être borné.');
expect(photoButton.includes('variant={viewerHd ? \'original\' : \'preview\'}'), 'L’original photo ne doit être chargé que sur demande HD.');
expect(photoPanel.includes('variant="thumb"') && photoPanel.includes("variant={viewerHd ? 'original' : 'preview'}"), 'La galerie doit utiliser miniature, aperçu puis original HD.');

expect(remarks.includes('new BoundedLruMap(3)'), 'Le cache remarques ne doit jamais redevenir non borné.');
expect(pilotage.includes('function VirtualizedTechnicalMatrix'), 'La grande matrice Pilotage doit être virtualisée.');
expect(pilotage.includes('<FlatList') && pilotage.includes('maxToRenderPerBatch={8}'), 'Pilotage doit limiter les lignes montées.');
expect(pilotage.includes('PhotoVariantImage'), 'Pilotage ne doit pas décoder les originaux photo dans ses listes.');

expect(docs.includes('Régressions historiques à ne pas réintroduire'), 'Les garde-fous historiques doivent être documentés.');
expect(docs.includes('Au maximum **3 visites**'), 'La limite HOT=3 doit être documentée.');

console.log('[field-runtime-foundation] OK');
