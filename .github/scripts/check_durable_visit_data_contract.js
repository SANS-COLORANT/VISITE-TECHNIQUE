const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) {
    console.error('[durable-visit-data-contract] ' + message);
    process.exit(1);
  }
};

const autosave = read('durableAutosave.js');
const persistent = read('PersistentControleGenerique.js');
const vmc = read('VmcControleGenerique.js');
const preset = read('PresetControleGenerique.js');
const photo = read('PhotoButton.js');
const journal = read('photoPersistenceJournal.js');
const visit = read('VisiteScreen.js');
const generic = read('TrameGenericPanel.js');
const regulation = read('OptimizedRegulationPanel.js');
const bounded = read('boundedCache.js');
const prefill = read('visitPrefillDb.js');
const siteVisits = read('SiteVisitesScreen.js');
const db = read('db.js');

expect(autosave.includes("AppState.addEventListener('change'"), 'Les brouillons doivent être flushés quand METRA passe en arrière-plan.');
expect(autosave.includes('queueRef.current') && autosave.includes('persisteeRef'), 'Les écritures doivent être sérialisées et suivre la dernière valeur persistée.');
expect(autosave.includes("valeurRef.current !== persisteeRef.current"), 'Une valeur externe ne doit pas écraser un brouillon local non persisté.');

for (const [name, source] of [['générique', persistent], ['VMC', vmc], ['présélection', preset]]) {
  expect(source.includes('useDurableAutosave'), `Le commentaire ${name} doit utiliser l’autosauvegarde durable.`);
  expect(source.includes('onEtatChange?.'), `Le commentaire ${name} doit aussi alimenter le cache chaud immédiatement.`);
}
expect(vmc.includes('avisRef.current') && preset.includes('avisRef.current') && persistent.includes('avisRef.current'), 'Les changements S/N.S/N.R/S.O/N.V doivent rester cohérents avec les flush asynchrones.');

expect(photo.includes('journaliserPhotoEnAttente'), 'Une photo doit être journalisée avant son rattachement SQLite final.');
expect(photo.includes('confirmerPhotoJournalisee'), 'Le journal photo doit être supprimé après rattachement réussi.');
expect(journal.includes("SELECT key,value FROM _meta WHERE key LIKE ?"), 'Le journal photo doit être récupérable après interruption.');
expect(journal.includes("INSERT INTO photos"), 'Une photo durable orpheline doit pouvoir être rattachée automatiquement.');
expect(visit.includes('recupererPhotosEnAttente(visiteId)'), 'L’ouverture d’une visite doit récupérer les photos interrompues.');
expect(visit.includes('flushDurableAutosaves()'), 'Le changement d’onglet et le retour doivent déclencher un flush des brouillons.');

expect(bounded.includes('class BoundedLruMap'), 'Le cache chaud doit être borné.');
expect(generic.includes('new BoundedLruMap(3)'), 'Le cache de trame doit garder exactement trois visites chaudes.');
expect(regulation.includes('new BoundedLruMap(3)'), 'Le cache de régulation doit garder exactement trois visites chaudes.');
expect(persistent.includes('new BoundedLruMap(3)'), 'Le cache des remarques doit garder exactement trois visites chaudes.');
expect(prefill.includes("PREFILL_META_PREFIX = 'visit_prefill_done::'"), 'Une visite déjà préparée doit être reconnue après redémarrage sans recopier son historique.');
expect(prefill.includes('new BoundedLruMap(3)'), 'Le statut de préremplissage en mémoire doit lui aussi être borné à trois visites.');
expect(siteVisits.includes('visites.slice(0, 3)'), 'Les trois visites les plus récentes doivent être préchauffées depuis l’historique.');
expect(siteVisits.includes('onPressIn={() => { if (!selectionExport) prechaufferVisite(item)'), 'Un appui doit commencer le préchauffage avant la navigation.');
expect(siteVisits.includes('visitePreview'), 'La navigation doit transmettre un contexte de visite immédiatement affichable.');
expect(visit.includes('VISIT_OPEN_FAST_V2'), 'VisiteScreen doit utiliser l’ouverture rapide avec preview.');
expect(visit.includes('visitePreview ? { ...visitePreview'), 'Le site/local doivent être visibles avant la première requête SQLite.');
expect(db.includes('i.nom nom_installation'), 'La lecture minimale d’une visite doit retourner le local avec le site et le client.');

console.log('[durable-visit-data-contract] OK');
