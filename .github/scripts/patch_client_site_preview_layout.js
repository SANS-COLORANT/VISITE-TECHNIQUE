const fs = require('fs');

const path = 'MetraDirectoryScreen.js';
let text = fs.readFileSync(path, 'utf8');

// Le patch multi-sites place désormais la fenêtre client à 92 % de la hauteur.
// Conserver ce format plein écran au lieu de réappliquer l'ancien gabarit 86 %.
const clientModalOld = "<Modal visible={!!selectedClient && !selectedSite} transparent animationType=\"fade\" onRequestClose={() => setSelectedClient(null)}>\n      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>";
const clientModalFull = "<Modal visible={!!selectedClient && !selectedSite} transparent animationType=\"fade\" onRequestClose={() => setSelectedClient(null)}>\n      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '92%', maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }]}>";
if (!text.includes("height: '92%', maxHeight: '92%'")) {
  if (!text.includes(clientModalOld)) throw new Error('Client modal sheet anchor not found');
  text = text.replace(clientModalOld, clientModalFull);
}

const selectionMarker = '1, plusieurs ou tous les sites';
const markerIndex = text.indexOf(selectionMarker);
if (markerIndex < 0) throw new Error('Client multi-site selection marker not found');

const listStart = text.indexOf('        <FlatList\n', markerIndex);
if (listStart < 0) throw new Error('Client site list start not found');
const listEnd = text.indexOf('        />', listStart);
if (listEnd < 0) throw new Error('Client site list end not found');
let list = text.slice(listStart, listEnd + '        />'.length);

// La liste doit absorber tout l'espace restant de la fenêtre. Les limites fixes
// (220/440 px) créaient justement la grande zone blanche observée sur tablette.
if (!list.includes('          style={{ flex: 1 }}\n')) {
  if (/          style=\{\{[^\n]+\}\}\n/.test(list)) {
    list = list.replace(/          style=\{\{[^\n]+\}\}\n/, '          style={{ flex: 1 }}\n');
  } else {
    list = list.replace('        <FlatList\n', '        <FlatList\n          style={{ flex: 1 }}\n');
  }
}
if (!list.includes('contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}')) {
  list = list.replace(
    '          style={{ flex: 1 }}\n',
    '          style={{ flex: 1 }}\n          contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}\n'
  );
}
if (!list.includes('keyboardShouldPersistTaps="handled"')) {
  list = list.replace('          data={sites}\n', '          keyboardShouldPersistTaps="handled"\n          data={sites}\n');
}
text = text.slice(0, listStart) + list + text.slice(listEnd + '        />'.length);

text = text.replace(
  "'Ouvre un site ou sélectionne-en plusieurs pour les importer ensemble.'",
  "'Touchez un site pour consulter sa fiche, ou utilisez Sélectionner pour en importer plusieurs.'"
);

fs.writeFileSync(path, text);
console.log('Client site preview preserved with full-height modal, flexible scrollable list and sticky import footer.');
