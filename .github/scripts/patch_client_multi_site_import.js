const fs = require('fs');

const path = 'MetraDirectoryScreen.js';
let text = fs.readFileSync(path, 'utf8');

const componentMarker = 'function SiteSelectionRow({ item, selected, onPress, disabled }) {';
if (!text.includes(componentMarker)) {
  const anchor = '\nfunction MetraDirectoryScreen({ navigation, route }) {';
  if (!text.includes(anchor)) throw new Error('MetraDirectoryScreen component anchor not found');
  const component = `
function SiteSelectionRow({ item, selected, onPress, disabled }) {
  const labels = trameLabels(item.trames);
  return <TouchableOpacity
    activeOpacity={0.82}
    disabled={disabled}
    onPress={onPress}
    style={{
      backgroundColor: selected ? '#FFF7F1' : SURFACE,
      borderWidth: selected ? 2 : 1,
      borderColor: selected ? ACCENT : BORDER,
      borderRadius: 15,
      paddingHorizontal: 12,
      paddingVertical: 11,
      marginBottom: 7,
      flexDirection: 'row',
      alignItems: 'center',
      opacity: disabled ? 0.62 : 1,
    }}
  >
    <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: selected ? ACCENT : '#C9CDD3', backgroundColor: selected ? ACCENT : '#FFF', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
      {selected ? <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900' }}>✓</Text> : null}
    </View>
    <View style={{ flex: 1, paddingRight: 8 }}>
      <Text numberOfLines={1} style={{ color: INK, fontSize: 15, fontWeight: '900' }}>{item.nom}</Text>
      <Text numberOfLines={1} style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{[item.client_ville, item.derniere_visite_date ? `dernière visite ${String(item.derniere_visite_date).slice(0, 10)}` : null].filter(Boolean).join(' · ') || 'Site disponible'}</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <SmallPill>{Number(item.local_count || 0)} installation{Number(item.local_count || 0) > 1 ? 's' : ''}</SmallPill>
        {labels.slice(0, 2).map((label) => <SmallPill key={label}>{label}</SmallPill>)}
      </View>
    </View>
  </TouchableOpacity>;
}
`;
  text = text.replace(anchor, component + anchor);
}

const stateNeedle = "  const [siteActionBusy, setSiteActionBusy] = useState(false);\n";
const stateInsert = `  const [siteSelectionMode, setSiteSelectionMode] = useState(false);\n  const [selectedSiteIds, setSelectedSiteIds] = useState(() => new Set());\n  const [batchImportBusy, setBatchImportBusy] = useState(false);\n  const [batchImportProgress, setBatchImportProgress] = useState(null);\n`;
if (!text.includes('const [siteSelectionMode, setSiteSelectionMode]')) {
  if (!text.includes(stateNeedle)) throw new Error('siteActionBusy state anchor not found');
  text = text.replace(stateNeedle, stateNeedle + stateInsert);
}

const openClientNeedle = "      setSites(cachedSites);\n      setLocals([]);\n";
const openClientReplacement = "      setSites(cachedSites);\n      setLocals([]);\n      setSiteSelectionMode(false);\n      setSelectedSiteIds(new Set());\n      setBatchImportProgress(null);\n";
if (!text.includes('setSiteSelectionMode(false);\n      setSelectedSiteIds(new Set());')) {
  if (!text.includes(openClientNeedle)) throw new Error('openClient reset anchor not found');
  text = text.replace(openClientNeedle, openClientReplacement);
}

const functionsMarker = '  const toggleSiteSelection = useCallback((remoteSiteId) => {';
if (!text.includes(functionsMarker)) {
  const anchor = '  const openSite = async (site, { keepClientSheet = false } = {}) => {';
  if (!text.includes(anchor)) throw new Error('openSite function anchor not found');
  const functions = `  const toggleSiteSelection = useCallback((remoteSiteId) => {
    const id = String(remoteSiteId);
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const enterSiteSelection = () => {
    setSelectedSiteIds(new Set());
    setBatchImportProgress(null);
    setSiteSelectionMode(true);
  };

  const cancelSiteSelection = () => {
    if (batchImportBusy) return;
    setSiteSelectionMode(false);
    setSelectedSiteIds(new Set());
    setBatchImportProgress(null);
  };

  const toggleAllSites = () => {
    if (batchImportBusy) return;
    setSelectedSiteIds((current) => current.size === sites.length
      ? new Set()
      : new Set(sites.map((site) => String(site.remote_site_id))));
  };

  const importSelectedSites = async () => {
    if (batchImportBusy || !selectedClient) return;
    const selected = sites.filter((site) => selectedSiteIds.has(String(site.remote_site_id)));
    if (!selected.length) {
      Alert.alert('Sélection requise', 'Sélectionne au moins un site à importer dans METRA.');
      return;
    }

    setBatchImportBusy(true);
    setBatchImportProgress({ current: 0, total: selected.length, site: null });
    let importedSites = 0;
    let importedVisits = 0;
    const errors = [];

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const site = selected[index];
        setBatchImportProgress({ current: index + 1, total: selected.length, site: site.nom });
        try {
          const remoteClientId = site.remote_client_id || selectedClient.remote_client_id;
          const siteId = await materializeCachedSite(site.remote_site_id, remoteClientId);
          const latestImport = await importLatestApiVisitsForSite(siteId, site.remote_site_id);
          importedSites += 1;
          importedVisits += Number(latestImport?.importedCount || 0);
        } catch (error) {
          errors.push({ site: site.nom, message: String(error?.message || error) });
        }
      }

      await search(query).catch(() => {});
      setSiteSelectionMode(false);
      setSelectedSiteIds(new Set());
      setBatchImportProgress(null);

      const lines = [
        `${importedSites} site${importedSites > 1 ? 's' : ''} importé${importedSites > 1 ? 's' : ''} dans METRA.`,
        `${importedVisits} dernière${importedVisits > 1 ? 's' : ''} visite${importedVisits > 1 ? 's' : ''} intégrée${importedVisits > 1 ? 's' : ''}.`,
      ];
      if (errors.length) lines.push(`${errors.length} site${errors.length > 1 ? 's' : ''} en erreur.`);
      Alert.alert(errors.length ? 'Import multiple terminé avec réserves' : 'Import multiple terminé', lines.join('\n'));
    } finally {
      setBatchImportBusy(false);
    }
  };

`;
  text = text.replace(anchor, functions + anchor);
}

const clientSheetOld = `<Modal visible={!!selectedClient && !selectedSite} transparent animationType="fade" onRequestClose={() => setSelectedClient(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>`;
const clientSheetNew = `<Modal visible={!!selectedClient && !selectedSite} transparent animationType="fade" onRequestClose={() => setSelectedClient(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '92%', maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }]}>`;
if (!text.includes("height: '92%', maxHeight: '92%'")) {
  if (!text.includes(clientSheetOld)) throw new Error('client modal sheet height anchor not found');
  text = text.replace(clientSheetOld, clientSheetNew);
}

const clientModalOld = `        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
          <Text style={styles.sectionLabel}>{sites.length} site{sites.length > 1 ? 's' : ''}</Text>
          {status.activated ? <TouchableOpacity disabled={clientRefreshing} onPress={() => refreshClientPreparation(selectedClient.remote_client_id)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: ACCENT, fontWeight: '800', fontSize: 12 }}>{clientRefreshing ? 'Actualisation…' : '↻ Actualiser'}</Text></TouchableOpacity> : null}
        </View>
        <FlatList data={sites} keyExtractor={(x) => `${x.remote_client_id}-${x.remote_site_id}`} renderItem={({ item }) => <DirectoryRow item={{ ...item, kind: 'site', client_nom: selectedClient?.nom, client_ville: selectedClient?.ville }} onPress={() => openSite(item, { keepClientSheet: true })} />} ListEmptyComponent={<Text style={[styles.emptySub, { marginVertical: 22 }]}>Aucun site encore disponible dans la préparation de ce client.</Text>} />`;
const clientModalNew = `        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>{sites.length} site{sites.length > 1 ? 's' : ''}</Text>
            <Text style={{ color: MUTED, fontSize: 11.5, marginTop: 2 }}>{siteSelectionMode ? `${selectedSiteIds.size} sélectionné${selectedSiteIds.size > 1 ? 's' : ''}` : 'Ouvre un site ou sélectionne-en plusieurs pour les importer ensemble.'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {!siteSelectionMode && status.activated ? <TouchableOpacity disabled={clientRefreshing || batchImportBusy} onPress={() => refreshClientPreparation(selectedClient.remote_client_id)} style={{ paddingHorizontal: 8, paddingVertical: 7 }}><Text style={{ color: ACCENT, fontWeight: '800', fontSize: 12 }}>{clientRefreshing ? 'Actualisation…' : '↻ Actualiser'}</Text></TouchableOpacity> : null}
            {sites.length ? <TouchableOpacity disabled={batchImportBusy} onPress={siteSelectionMode ? cancelSiteSelection : enterSiteSelection} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: siteSelectionMode ? BORDER : ACCENT, backgroundColor: siteSelectionMode ? '#F7F8FA' : '#FFF7F1' }}><Text style={{ color: siteSelectionMode ? MUTED : ACCENT, fontWeight: '900', fontSize: 12 }}>{siteSelectionMode ? 'Annuler' : 'Sélectionner'}</Text></TouchableOpacity> : null}
          </View>
        </View>
        {siteSelectionMode ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: '#F8F9FB', borderWidth: 1, borderColor: '#ECEEF1', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 9 }}>
          <TouchableOpacity disabled={batchImportBusy} onPress={toggleAllSites} style={{ paddingVertical: 5, paddingHorizontal: 4 }}><Text style={{ color: ACCENT, fontWeight: '900', fontSize: 12 }}>{selectedSiteIds.size === sites.length && sites.length ? 'Tout désélectionner' : 'Tout sélectionner'}</Text></TouchableOpacity>
          <Text style={{ color: MUTED, fontSize: 11.5 }}>1, plusieurs ou tous les sites</Text>
        </View> : null}
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingBottom: 4 }}
          data={sites}
          keyExtractor={(x) => `${x.remote_client_id}-${x.remote_site_id}`}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => siteSelectionMode
            ? <SiteSelectionRow item={{ ...item, client_ville: selectedClient?.ville }} selected={selectedSiteIds.has(String(item.remote_site_id))} disabled={batchImportBusy} onPress={() => toggleSiteSelection(item.remote_site_id)} />
            : <DirectoryRow item={{ ...item, kind: 'site', client_nom: selectedClient?.nom, client_ville: selectedClient?.ville }} onPress={() => openSite(item, { keepClientSheet: true })} />}
          ListEmptyComponent={<Text style={[styles.emptySub, { marginVertical: 22 }]}>Aucun site encore disponible dans la préparation de ce client.</Text>}
        />
        {siteSelectionMode ? <View style={{ flexShrink: 0, borderTopWidth: 1, borderTopColor: '#EEF0F2', paddingTop: 11, marginTop: 4, backgroundColor: SURFACE }}>
          {batchImportProgress ? <Text style={{ color: MUTED, fontSize: 11.5, textAlign: 'center', marginBottom: 8 }}>Import {batchImportProgress.current}/{batchImportProgress.total}{batchImportProgress.site ? ` · ${batchImportProgress.site}` : ''}</Text> : null}
          <TouchableOpacity
            disabled={batchImportBusy || selectedSiteIds.size === 0}
            onPress={importSelectedSites}
            style={[styles.btnPrimary, { flex: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: batchImportBusy || selectedSiteIds.size === 0 ? 0.5 : 1 }]}
          >
            {batchImportBusy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Importer {selectedSiteIds.size || ''} site{selectedSiteIds.size > 1 ? 's' : ''} dans METRA</Text>}
          </TouchableOpacity>
        </View> : null}`;

if (!text.includes('1, plusieurs ou tous les sites')) {
  if (!text.includes(clientModalOld)) throw new Error('client site list anchor not found');
  text = text.replace(clientModalOld, clientModalNew);
}

fs.writeFileSync(path, text);
console.log('Client multi-site selection/import wired into MetraDirectoryScreen with a full-height scrollable list and sticky import footer.');