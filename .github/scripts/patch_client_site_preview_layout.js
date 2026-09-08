const fs = require('fs');

const path = 'MetraDirectoryScreen.js';
let text = fs.readFileSync(path, 'utf8');

const clientModalAnchor = "<Modal visible={!!selectedClient && !selectedSite} transparent animationType=\"fade\" onRequestClose={() => setSelectedClient(null)}>\n      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>";
const clientModalFixed = "<Modal visible={!!selectedClient && !selectedSite} transparent animationType=\"fade\" onRequestClose={() => setSelectedClient(null)}>\n      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '86%', maxHeight: '86%', minHeight: 420, borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>";
if (!text.includes("height: '86%', maxHeight: '86%', minHeight: 420")) {
  if (!text.includes(clientModalAnchor)) throw new Error('Client modal sheet anchor not found');
  text = text.replace(clientModalAnchor, clientModalFixed);
}

const selectionMarker = '1, plusieurs ou tous les sites';
const markerIndex = text.indexOf(selectionMarker);
if (markerIndex < 0) throw new Error('Client multi-site selection marker not found');

const listStart = text.indexOf('        <FlatList\n', markerIndex);
if (listStart < 0) throw new Error('Client site list start not found');
const listEnd = text.indexOf('        />', listStart);
if (listEnd < 0) throw new Error('Client site list end not found');
let list = text.slice(listStart, listEnd + '        />'.length);

if (!list.includes('minHeight: 220, maxHeight: 440')) {
  if (list.includes('          style={{ flex: 1 }}\n')) {
    list = list.replace(
      '          style={{ flex: 1 }}\n',
      '          style={{ flexGrow: 0, flexShrink: 1, minHeight: 220, maxHeight: 440 }}\n'
    );
  } else {
    list = list.replace(
      '        <FlatList\n',
      '        <FlatList\n          style={{ flexGrow: 0, flexShrink: 1, minHeight: 220, maxHeight: 440 }}\n'
    );
  }
  if (!list.includes('contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}')) {
    list = list.replace(
      /          style=\{\{[^\n]+\}\}\n/,
      (m) => `${m}          contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}\n`
    );
  }
  if (!list.includes('keyboardShouldPersistTaps="handled"')) {
    list = list.replace('          data={sites}\n', '          keyboardShouldPersistTaps="handled"\n          data={sites}\n');
  }
  text = text.slice(0, listStart) + list + text.slice(listEnd + '        />'.length);
}

text = text.replace(
  "'Ouvre un site ou sélectionne-en plusieurs pour les importer ensemble.'",
  "'Touchez un site pour consulter sa fiche, ou utilisez Sélectionner pour en importer plusieurs.'"
);

fs.writeFileSync(path, text);
console.log('Client site preview restored: the site list keeps a visible, scrollable area in browse and multi-select modes.');
