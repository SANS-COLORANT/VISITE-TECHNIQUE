import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { activateTablet, getActivationStatus, syncAuthorizedClients, syncClientPreparation } from './symfonyApi.js';
import { getCachedClient, listCachedLocals, listCachedSites, materializeCachedSite, searchCachedDirectory } from './symfonyApiCacheDb.js';

const SURFACE = '#FFFFFF';
const BORDER = '#E6E8EC';
const INK = COLORS.ink || '#17212B';
const MUTED = COLORS.muted || '#667085';
const ACCENT = COLORS.orange || '#E86F2D';
const SUCCESS = '#16794B';
const SUCCESS_BG = '#EAF8F1';
const WARNING_BG = '#FFF4E8';

function humanSyncDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function trameLabels(value) {
  return [...new Set(String(value || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 3);
}

function SmallPill({ children, tone = 'neutral' }) {
  const palette = tone === 'success'
    ? { bg: SUCCESS_BG, fg: SUCCESS, border: '#CDEEDF' }
    : tone === 'warning'
      ? { bg: WARNING_BG, fg: '#9A4C0A', border: '#F3D9B8' }
      : { bg: '#F4F6F8', fg: '#475467', border: '#E5E7EB' };
  return <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border }}>
    <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '800' }}>{children}</Text>
  </View>;
}

function DirectoryRow({ item, onPress }) {
  const isSite = item.kind === 'site';
  const labels = trameLabels(item.trames);
  return <TouchableOpacity
    activeOpacity={0.82}
    onPress={onPress}
    style={{ backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 15, marginBottom: 9, flexDirection: 'row', alignItems: 'center' }}
  >
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Text style={{ color: isSite ? ACCENT : MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 }}>{isSite ? 'SITE' : 'CLIENT'}</Text>
      <Text numberOfLines={1} style={{ color: INK, fontSize: 15.5, fontWeight: '900' }}>{item.nom}</Text>
      <Text numberOfLines={1} style={{ color: MUTED, fontSize: 12.5, marginTop: 3 }}>
        {isSite
          ? [item.client_nom, item.client_ville].filter(Boolean).join(' · ')
          : [item.code_everwin, item.ville, item.categorie].filter(Boolean).join(' · ') || 'Client autorisé'}
      </Text>
      {isSite ? <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
        <SmallPill>{Number(item.local_count || 0)} installation{Number(item.local_count || 0) > 1 ? 's' : ''}</SmallPill>
        {labels.slice(0, 2).map((label) => <SmallPill key={label}>{label}</SmallPill>)}
      </View> : null}
    </View>
    <Text style={{ color: '#98A2B3', fontSize: 25, fontWeight: '400' }}>›</Text>
  </TouchableOpacity>;
}

function MetraDirectoryScreen({ navigation, route }) {
  const [status, setStatus] = useState({ activated: false });
  const [query, setQuery] = useState(() => String(route?.params?.query || ''));
  const [directory, setDirectory] = useState({ clients: [], sites: [] });
  const [syncing, setSyncing] = useState(false);
  const [activationVisible, setActivationVisible] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [siteClient, setSiteClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [locals, setLocals] = useState([]);
  const [clientRefreshing, setClientRefreshing] = useState(false);
  const [siteRefreshing, setSiteRefreshing] = useState(false);
  const [siteActionBusy, setSiteActionBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const next = await getActivationStatus();
    setStatus(next);
    return next;
  }, []);

  const search = useCallback(async (text = query) => {
    setDirectory(await searchCachedDirectory(text));
  }, [query]);

  useEffect(() => { refreshStatus().catch(() => {}); }, [refreshStatus]);
  useEffect(() => {
    const timer = setTimeout(() => { search(query).catch(() => {}); }, 80);
    return () => clearTimeout(timer);
  }, [query, search]);

  const sync = async () => {
    if (!status.activated) { setActivationVisible(true); return; }
    if (syncing) return;
    setSyncing(true);
    try {
      await syncAuthorizedClients();
      await Promise.all([search(query), refreshStatus()]);
    } catch (e) {
      await refreshStatus().catch(() => {});
      Alert.alert('Synchronisation indisponible', `${String(e.message || e)}\n\nLes données déjà présentes restent utilisables hors connexion.`);
    } finally { setSyncing(false); }
  };

  const activate = async () => {
    if (activationCode.length !== 48 || activating) return;
    setActivating(true);
    try {
      await activateTablet(activationCode);
      setActivationCode('');
      setActivationVisible(false);
      await syncAuthorizedClients();
      await Promise.all([search(query), refreshStatus()]);
    } catch (e) { Alert.alert('Activation impossible', String(e.message || e)); }
    finally { setActivating(false); }
  };

  const refreshClientPreparation = async (remoteClientId) => {
    if (!status.activated || clientRefreshing) return;
    setClientRefreshing(true);
    try {
      await syncClientPreparation(remoteClientId);
      setSites(await listCachedSites(remoteClientId));
      await Promise.all([search(query), refreshStatus()]);
    } catch (e) {
      Alert.alert('Actualisation impossible', `${String(e.message || e)}\n\nLa préparation déjà enregistrée reste disponible.`);
    } finally { setClientRefreshing(false); }
  };

  const openClient = async (remoteClientId) => {
    try {
      const [client, cachedSites] = await Promise.all([getCachedClient(remoteClientId), listCachedSites(remoteClientId)]);
      setSelectedSite(null);
      setSiteClient(null);
      setSelectedClient(client);
      setSites(cachedSites);
      setLocals([]);
      if (status.activated) refreshClientPreparation(remoteClientId).catch(() => {});
    } catch (e) { Alert.alert('Ouverture impossible', String(e.message || e)); }
  };

  const openSite = async (site, { keepClientSheet = false } = {}) => {
    try {
      const [client, cachedLocals] = await Promise.all([getCachedClient(site.remote_client_id), listCachedLocals(site.remote_site_id)]);
      if (!keepClientSheet) setSelectedClient(null);
      setSiteClient(client);
      setSelectedSite(site);
      setLocals(cachedLocals);
    } catch (e) { Alert.alert('Ouverture impossible', String(e.message || e)); }
  };

  const refreshSite = async () => {
    const remoteClientId = siteClient?.remote_client_id || selectedSite?.remote_client_id;
    if (!status.activated || !remoteClientId || !selectedSite || siteRefreshing) return;
    setSiteRefreshing(true);
    try {
      await syncClientPreparation(remoteClientId);
      const [freshSites, freshLocals] = await Promise.all([listCachedSites(remoteClientId), listCachedLocals(selectedSite.remote_site_id)]);
      const freshSite = freshSites.find((row) => String(row.remote_site_id) === String(selectedSite.remote_site_id)) || selectedSite;
      setSelectedSite(freshSite);
      setLocals(freshLocals);
      if (selectedClient) setSites(freshSites);
      await Promise.all([search(query), refreshStatus()]);
    } catch (e) {
      Alert.alert('Actualisation impossible', `${String(e.message || e)}\n\nLa fiche locale reste disponible.`);
    } finally { setSiteRefreshing(false); }
  };

  const openInMetra = async (site, startVisit = false) => {
    if (siteActionBusy) return;
    setSiteActionBusy(true);
    try {
      const siteId = await materializeCachedSite(site.remote_site_id);
      setSelectedSite(null);
      setSelectedClient(null);
      navigation.navigate('SiteVisites', { siteId, nomSite: site.nom, startVisit });
    } catch (e) { Alert.alert('Ouverture impossible', String(e.message || e)); }
    finally { setSiteActionBusy(false); }
  };

  const rows = useMemo(() => {
    const siteRows = directory.sites.map((x) => ({ kind: 'site', id: `s-${x.remote_site_id}`, ...x }));
    const clientRows = directory.clients.map((x) => ({ kind: 'client', id: `c-${x.remote_client_id}`, ...x }));
    return query.trim() ? [...siteRows, ...clientRows] : [...clientRows, ...siteRows];
  }, [directory, query]);

  const lastSync = humanSyncDate(status.lastSyncAt);
  const resultLabel = query.trim() ? `${rows.length} résultat${rows.length > 1 ? 's' : ''}` : 'Clients et sites disponibles';
  const siteTrames = [...new Set(locals.map((local) => local.remote_trame_nom).filter(Boolean))];
  const latestVisit = locals.map((local) => local.derniere_visite_date).filter(Boolean).sort().reverse()[0] || selectedSite?.derniere_visite_date || null;

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList
      contentContainerStyle={[styles.content, { paddingBottom: 34 }]}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(x) => x.id}
      ListHeaderComponent={<>
        <View style={{ backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: '#ECEEF1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}>
              <Text style={{ fontSize: 20, color: '#98A2B3', marginRight: 9 }}>⌕</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Client, site, ville, adresse, équipement…"
                placeholderTextColor="#98A2B3"
                style={{ flex: 1, color: INK, fontSize: 14.5, paddingVertical: 12 }}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {query ? <TouchableOpacity onPress={() => setQuery('')} style={{ minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#98A2B3', fontSize: 17 }}>✕</Text></TouchableOpacity> : null}
            </View>
            <TouchableOpacity
              onPress={sync}
              disabled={syncing}
              style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: status.activated ? '#F7F8FA' : ACCENT, borderWidth: status.activated ? 1 : 0, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
            >
              {syncing ? <ActivityIndicator size="small" /> : <Text style={{ color: status.activated ? INK : '#FFF', fontSize: status.activated ? 21 : 12, fontWeight: '900' }}>{status.activated ? '↻' : 'Activer'}</Text>}
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              <SmallPill tone={status.activated ? 'success' : 'warning'}>{status.activated ? 'Tablette activée' : 'Activation requise'}</SmallPill>
              {lastSync ? <Text style={{ color: MUTED, fontSize: 11.5 }}>Synchro {lastSync}</Text> : <Text style={{ color: MUTED, fontSize: 11.5 }}>Cache local disponible hors connexion</Text>}
            </View>
          </View>
          {status.lastError ? <Text numberOfLines={2} style={{ color: '#9A4C0A', fontSize: 11.5, marginTop: 8 }}>Dernière synchro incomplète · les données locales restent disponibles.</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 9 }}>
          <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>{resultLabel}</Text>
          {query.trim() ? <Text style={{ color: MUTED, fontSize: 11.5 }}>Sites en premier</Text> : null}
        </View>
      </>}
      renderItem={({ item }) => <DirectoryRow item={item} onPress={() => item.kind === 'client' ? openClient(item.remote_client_id) : openSite(item)} />}
      ListEmptyComponent={<View style={[styles.empty, { paddingVertical: 38 }]}>
        <Text style={styles.emptyText}>{query.trim() ? 'Aucun résultat' : 'Aucune donnée synchronisée'}</Text>
        <Text style={styles.emptySub}>{query.trim() ? 'Essaie le client, la ville, le site, une installation ou une trame.' : 'Active la tablette puis synchronise une première fois. Les données resteront ensuite disponibles hors connexion.'}</Text>
      </View>}
    />

    <Modal visible={!!selectedClient && !selectedSite} transparent animationType="fade" onRequestClose={() => setSelectedClient(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: MUTED, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>CLIENT</Text>
            <Text style={[styles.modalTitle, { marginTop: 4 }]}>{selectedClient?.nom || 'Client'}</Text>
            <Text style={styles.cardSub}>{[selectedClient?.code_everwin, selectedClient?.ville, selectedClient?.agence_libelle].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedClient(null)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: MUTED, fontSize: 19 }}>✕</Text></TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
          <Text style={styles.sectionLabel}>{sites.length} site{sites.length > 1 ? 's' : ''}</Text>
          {status.activated ? <TouchableOpacity disabled={clientRefreshing} onPress={() => refreshClientPreparation(selectedClient.remote_client_id)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ color: ACCENT, fontWeight: '800', fontSize: 12 }}>{clientRefreshing ? 'Actualisation…' : '↻ Actualiser'}</Text>
          </TouchableOpacity> : null}
        </View>

        <FlatList
          data={sites}
          keyExtractor={(x) => String(x.remote_site_id)}
          renderItem={({ item }) => <DirectoryRow item={{ ...item, kind: 'site', client_nom: selectedClient?.nom, client_ville: selectedClient?.ville }} onPress={() => openSite(item, { keepClientSheet: true })} />}
          ListEmptyComponent={<Text style={[styles.emptySub, { marginVertical: 22 }]}>Aucun site encore disponible dans la préparation de ce client.</Text>}
        />
      </View></View>
    </Modal>

    <Modal visible={!!selectedSite} transparent animationType="fade" onRequestClose={() => setSelectedSite(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '90%', borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>SITE</Text>
            <Text style={[styles.modalTitle, { marginTop: 4 }]}>{selectedSite?.nom}</Text>
            <Text style={styles.cardSub}>{[siteClient?.nom, siteClient?.ville].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity onPress={() => setSelectedSite(null)} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: MUTED, fontSize: 19 }}>✕</Text></TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 15 }}>
          <SmallPill tone="success">Disponible hors connexion</SmallPill>
          <SmallPill>{locals.length} installation{locals.length > 1 ? 's' : ''}</SmallPill>
          {latestVisit ? <SmallPill>Dernière visite {String(latestVisit).slice(0, 10)}</SmallPill> : null}
        </View>

        <View style={{ marginTop: 18, backgroundColor: '#F8F9FB', borderRadius: 15, borderWidth: 1, borderColor: '#ECEEF1', padding: 13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: INK, fontSize: 13.5, fontWeight: '900' }}>Préparation de visite</Text>
              <Text style={{ color: MUTED, fontSize: 11.5, marginTop: 3 }}>{locals.length ? 'Les installations connues sont prêtes dans METRA.' : 'Aucune installation détaillée encore synchronisée.'}</Text>
            </View>
            {status.activated ? <TouchableOpacity onPress={refreshSite} disabled={siteRefreshing} style={{ minWidth: 88, alignItems: 'flex-end', paddingVertical: 8 }}>
              {siteRefreshing ? <ActivityIndicator size="small" /> : <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '900' }}>↻ Actualiser</Text>}
            </TouchableOpacity> : null}
          </View>
          {siteTrames.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>{siteTrames.slice(0, 4).map((label) => <SmallPill key={label}>{label}</SmallPill>)}</View> : null}
        </View>

        <FlatList
          style={{ marginTop: 12, maxHeight: 250 }}
          data={locals}
          keyExtractor={(item) => String(item.remote_local_id)}
          renderItem={({ item }) => <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF0F2' }}>
            <Text style={{ color: INK, fontSize: 13.5, fontWeight: '800' }}>{item.designation || 'Local technique'}</Text>
            <Text style={{ color: MUTED, fontSize: 11.5, marginTop: 3 }}>{[item.remote_trame_nom, item.derniere_visite_date ? `dernière visite ${String(item.derniere_visite_date).slice(0, 10)}` : null].filter(Boolean).join(' · ')}</Text>
          </View>}
          ListEmptyComponent={<Text style={[styles.emptySub, { marginVertical: 12 }]}>Le site peut déjà être ouvert dans METRA. Les installations apparaîtront après synchronisation de sa préparation.</Text>}
        />

        <TouchableOpacity
          style={[styles.btnPrimary, { marginTop: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center' }]}
          disabled={siteActionBusy}
          onPress={() => openInMetra(selectedSite, true)}
        >
          <Text style={styles.btnPrimaryText}>{siteActionBusy ? 'Préparation…' : 'Démarrer une visite'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSecondary, { marginTop: 8, minHeight: 46, alignItems: 'center', justifyContent: 'center' }]}
          disabled={siteActionBusy}
          onPress={() => openInMetra(selectedSite, false)}
        >
          <Text style={styles.btnSecondaryText}>Ouvrir le site · patrimoine et historique</Text>
        </TouchableOpacity>
      </View></View>
    </Modal>

    <Modal visible={activationVisible} transparent animationType="fade" onRequestClose={() => setActivationVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>
        <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>CONNEXION SÉCURISÉE</Text>
        <Text style={[styles.modalTitle, { marginTop: 5 }]}>Activer cette tablette</Text>
        <Text style={[styles.cardSub, { marginBottom: 14, lineHeight: 18 }]}>Colle le code de 48 caractères généré dans l’administration Énergie & Service. La clé privée reste protégée dans Android Keystore.</Text>
        <View style={{ borderRadius: 13, borderWidth: 1, borderColor: activationCode.length === 48 ? '#B7E4CF' : BORDER, backgroundColor: '#F8F9FB', paddingHorizontal: 12 }}>
          <TextInput
            style={{ minHeight: 50, color: INK, fontSize: 15, letterSpacing: 0.4 }}
            value={activationCode}
            onChangeText={(v) => setActivationCode(v.replace(/\s/g, '').slice(0, 48))}
            placeholder="Code d’activation"
            placeholderTextColor="#98A2B3"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
        <Text style={{ alignSelf: 'flex-end', color: activationCode.length === 48 ? SUCCESS : MUTED, fontSize: 11.5, fontWeight: '800', marginTop: 6 }}>{activationCode.length} / 48</Text>
        <View style={[styles.modalActions, { marginTop: 16 }]}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setActivationVisible(false)} disabled={activating}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={activate} disabled={activating || activationCode.length !== 48}><Text style={styles.btnPrimaryText}>{activating ? 'Activation…' : 'Activer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

export { MetraDirectoryScreen };
