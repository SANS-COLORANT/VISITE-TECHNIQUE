// Verrouille les corrections issues des retours terrain (post-it tablette) :
// une modification future qui les annulerait fait échouer la CI.
const fs = require('fs');
function read(p) { return fs.readFileSync(p, 'utf8'); }
function need(text, value, label) { if (!text.includes(value)) throw new Error('[field-feedback] ' + label + ': missing ' + value); }

// 1. Clavier : aucune liste de saisie de la visite ne détache ses lignes hors
//    écran (Android fermait le clavier quand la liste rétrécissait).
for (const file of ['TrameGenericPanel.js', 'OptimizedRelevesPanel.js', 'OptimizedRemarksPanel.js', 'OptimizedEquipmentPanel.js',
  'OptimizedRegulationPanel.js', 'OptimizedPhotoPanel.js', 'GuidedEquipmentPanel.js', 'ReportLayoutEditor.js']) {
  if (/removeClippedSubviews(?!=\{false\})/.test(read(file))) throw new Error(`[field-feedback] ${file}: removeClippedSubviews must stay {false} (keyboard)`);
}

const visit = read('VisiteScreen.js');
// 2. Glissé horizontal entre onglets : seuil court.
need(visit, 'swipeDirection(g.dx, g.vx, w)', 'tab swipe: short light gesture (swipeNavigation.js)');
// 3. Statut de sauvegarde isolé (pas de rendu complet de la visite).
need(visit, 'const SaveStatusBadge = memo(', 'isolated save status');

// 4. Criticité réglable sur les réserves ICPE.
need(read('PersistentControleGenerique.js'), '<ReserveSeveritySlider', 'ICPE reserve severity');

// 5. Appareil photo : retour immédiat, réduction en arrière-plan.
const button = read('PhotoButton.js');
need(button, "launchMetraCamera({ quality: 1", 'raw camera return');
need(button, 'export async function compacterCapture', 'background photo compaction');

// 6-7. Pictogrammes des relevés.
const releves = read('OptimizedRelevesPanel.js');
need(releves, 'pictoReleve', 'meter pictograms');
need(releves, 'pictoTemperature', 'temperature pictograms');

// 8-10. Catégories repliables, avis en masse, découpage d'affichage.
const panel = read('TrameGenericPanel.js');
need(panel, 'basculerRepli', 'collapsible categories');
need(panel, 'onLongPress={() => menuAvisEnMasse', 'long press bulk opinions');
need(panel, "const AVIS_EN_MASSE = ['S', 'S.O', 'N.S', 'N.R', 'N.V']", 'bulk opinion list');
need(panel, 'function decouperSection', 'display-only section split');
need(panel, 'etatHandler(item.key)', 'stable row callbacks');
// Le découpage reste un affichage : la trame et les correspondances de rapport
// gardent la catégorie « Lutte contre l'incendie » entière.
const data = read('data.js');
need(data, `"Lutte contre l'incendie": [`, 'fire section kept in trame');
need(data, `"Lutte contre l'incendie||Extincteurs: Nombre": 183`, 'fire section report mapping');

console.log('[field-feedback] OK');
