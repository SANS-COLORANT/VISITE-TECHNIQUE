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
// Compare en ignorant les espaces/retours à la ligne : le contrôle vérifie une
// structure de code, pas un formatage exact (survit à un passage Prettier).
const norm = (s) => s.replace(/\s+/g, '');
const has = (text, needle) => norm(text).includes(norm(needle));

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

expect(
  has(autosave, "AppState.addEventListener('change'"),
  'Les brouillons doivent être flushés quand METRA passe en arrière-plan.'
);
expect(
  has(autosave, 'queueRef.current') && has(autosave, 'persisteeRef'),
  'Les écritures doivent être sérialisées et suivre la dernière valeur persistée.'
);
expect(
  has(autosave, 'valeurRef.current !== persisteeRef.current'),
  'Une valeur externe ne doit pas écraser un brouillon local non persisté.'
);

for (const [name, source] of [
  ['générique', persistent],
  ['VMC', vmc],
  ['présélection', preset]
]) {
  expect(has(source, 'useDurableAutosave'), `Le commentaire ${name} doit utiliser l’autosauvegarde durable.`);
  expect(has(source, 'onEtatChange?.'), `Le commentaire ${name} doit aussi alimenter le cache chaud immédiatement.`);
}
expect(
  has(vmc, 'avisRef.current') && has(preset, 'avisRef.current') && has(persistent, 'avisRef.current'),
  'Les changements S/N.S/N.R/S.O/N.V doivent rester cohérents avec les flush asynchrones.'
);

expect(has(photo, 'journaliserPhotoEnAttente'), 'Une photo doit être journalisée avant son rattachement SQLite final.');
expect(has(photo, 'confirmerPhotoJournalisee'), 'Le journal photo doit être supprimé après rattachement réussi.');
expect(
  has(journal, 'SELECT key,value FROM _meta WHERE key LIKE ?'),
  'Le journal photo doit être récupérable après interruption.'
);
expect(has(journal, 'INSERT INTO photos'), 'Une photo durable orpheline doit pouvoir être rattachée automatiquement.');
expect(
  has(visit, 'recupererPhotosEnAttente(visiteId)'),
  'L’ouverture d’une visite doit récupérer les photos interrompues.'
);
expect(
  has(visit, 'flushDurableAutosaves()'),
  'Le changement d’onglet et le retour doivent déclencher un flush des brouillons.'
);

expect(has(bounded, 'class BoundedLruMap'), 'Le cache chaud doit être borné.');
expect(has(generic, 'new BoundedLruMap(3)'), 'Le cache de trame doit garder exactement trois visites chaudes.');
expect(has(regulation, 'new BoundedLruMap(3)'), 'Le cache de régulation doit garder exactement trois visites chaudes.');
expect(has(persistent, 'new BoundedLruMap(3)'), 'Le cache des remarques doit garder exactement trois visites chaudes.');
expect(
  has(prefill, "PREFILL_META_PREFIX = 'visit_prefill_done::'"),
  'Une visite déjà préparée doit être reconnue après redémarrage sans recopier son historique.'
);
expect(
  has(prefill, 'new BoundedLruMap(3)'),
  'Le statut de préremplissage en mémoire doit lui aussi être borné à trois visites.'
);
expect(
  has(siteVisits, 'visites.slice(0, 3)'),
  'Les trois visites les plus récentes doivent être préchauffées depuis l’historique.'
);
expect(
  has(siteVisits, 'onPressIn={() => { if (!selectionExport) prechaufferVisite(item)'),
  'Un appui doit commencer le préchauffage avant la navigation.'
);
expect(
  has(siteVisits, 'visitePreview'),
  'La navigation doit transmettre un contexte de visite immédiatement affichable.'
);
expect(has(visit, 'VISIT_OPEN_FAST_V2'), 'VisiteScreen doit utiliser l’ouverture rapide avec preview.');
expect(
  has(visit, 'const initialPreview = visitePreview || runtimeInitial?.preview') &&
    has(visit, 'initialPreview ? { ...initialPreview'),
  'Le site/local doivent être visibles depuis le preview HOT/WARM avant la première requête SQLite.'
);
expect(
  has(db, 'i.nom nom_installation'),
  'La lecture minimale d’une visite doit retourner le local avec le site et le client.'
);

console.log('[durable-visit-data-contract] OK');
