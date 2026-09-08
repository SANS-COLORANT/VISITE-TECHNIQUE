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

const listAnchor = `        <FlatList\n          data={sites}\n          keyExtractor={(x) => \`\${x.remote_client_id}-\${x.remote_site_id}\`}`;
const listFixed = `        <FlatList\n          style={{ flexGrow: 0, flexShrink: 1, minHeight: 220, maxHeight: 440 }}\n          contentContainerStyle={{ paddingBottom: siteSelectionMode ? 4 : 10 }}\n          initialNumToRender={12}\n          maxToRenderPerBatch={10}\n          updateCellsBatchingPeriod={24}\n          windowSize={7}\n          removeClippedSubviews={false}\n          keyboardShouldPersistTaps=\"handled\"\n          data={sites}\n          keyExtractor={(x) => \`\${x.remote_client_id}-\${x.remote_site_id}\`}`;
const listIndex = text.indexOf(listAnchor, markerIndex);
if (!text.includes('minHeight: 220, maxHeight: 440')) {
  if (listIndex < 0) throw new Error('Client site list anchor not found');
  text = text.slice(0, listIndex) + text.slice(listIndex).replace(listAnchor, listFixed);
}

text = text.replace(
  "'Ouvre un site ou sélectionne-en plusieurs pour les importer ensemble.'",
  "'Touchez un site pour consulter sa fiche, ou utilisez Sélectionner pour en importer plusieurs.'"
);

fs.writeFileSync(path, text);
console.log('Client site preview restored: the site list keeps a visible, scrollable area in browse and multi-select modes.');
