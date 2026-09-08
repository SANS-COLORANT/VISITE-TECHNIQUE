import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { activateTablet, getActivationStatus, syncAuthorizedClients, syncClientPreparation } from './symfonyApi.js';
import { getCachedClient, listCachedLocals, listCachedSites, materializeCachedSite, searchCachedDirectory } from './symfonyApiCacheDb.js';

function MetraDirectoryScreen({ navigation }) {
  const [status, setStatus] = useState({ activated: false });
  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState({ clients: [], sites: [] });
  const [busy, setBusy] = useState(false);
  const [activationVisible, setActivationVisible] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [sites, setSites] = useState([]);
  const [locals, setLocals] = useState([]);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([getActivationStatus(), searchCachedDirectory(query)]); setStatus(s); setDirectory(d);
  }, [query]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const sync = async () => {
    if (!status.activated) { setActivationVisible(true); return; }
    setBusy(true);
    try { await syncAuthorizedClients(); await load(); }
    catch (e) { Alert.alert('Synchronisation impossible', `${String(e.message || e)}\n\nLes données déjà synchronisées restent disponibles hors connexion.`); }
    finally { setBusy(false); }
  };
  const activate = async () => {
    setBusy(true);
    try { await activateTablet(activationCode); setActivationCode(''); setActivationVisible(false); await syncAuthorizedClients(); await load(); }
    catch (e) { Alert.alert('Activation impossible', String(e.message || e)); }
    finally { setBusy(false); }
  };
  const openClient = async (remoteClientId) => {
    setBusy(true);
    try {
      const c = await getCachedClient(remoteClientId); setSelectedClient(c);
      try { await syncClientPreparation(remoteClientId); } catch {}
      setSites(await listCachedSites(remoteClientId)); setSelectedSite(null); setLocals([]);
    } finally { setBusy(false); }
  };
  const openSite = async (site) => { setSelectedSite(site); setLocals(await listCachedLocals(site.remote_site_id)); };
  const openInMetra = async (site) => {
    try { const siteId = await materializeCachedSite(site.remote_site_id); navigation.navigate('SiteVisites', { siteId, nomSite: site.nom }); }
    catch (e) { Alert.alert('Ouverture impossible', String(e.message || e)); }
  };
  const rows = useMemo(() => [
    ...directory.clients.map((x) => ({ kind: 'client', id: `c-${x.remote_client_id}`, ...x })),
    ...directory.sites.map((x) => ({ kind: 'site', id: `s-${x.remote_site_id}`, ...x })),
  ], [directory]);

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" data={rows} keyExtractor={(x) => x.id}
      ListHeaderComponent={<>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un client, un site, une ville, un code Everwin…" style={[styles.input, { flex: 1 }]} autoCorrect={false} />
          <TouchableOpacity style={styles.btnPrimary} onPress={sync} disabled={busy}><Text style={styles.btnPrimaryText}>{busy ? '…' : status.activated ? '↻ Synchroniser' : 'Activer'}</Text></TouchableOpacity>
        </View>
        <Text style={styles.cardSub}>{status.activated ? `Tablette activée${status.tabletteId ? ` · n°${status.tabletteId}` : ''}` : 'Tablette non activée'}{status.lastSyncAt ? ` · dernière synchro ${String(status.lastSyncAt).replace('T',' ').slice(0,16)}` : ''}</Text>
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Annuaire METRA</Text>
      </>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => item.kind === 'client' ? openClient(item.remote_client_id) : openClient(item.remote_client_id).then(() => openSite(item))}>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.kind === 'client' ? item.nom : item.nom}</Text><Text style={styles.cardSub}>{item.kind === 'client' ? [item.code_everwin,item.categorie,item.ville].filter(Boolean).join(' · ') : `Site · ${item.client_nom}`}</Text></View><Text style={styles.chevron}>›</Text>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun résultat local</Text><Text style={styles.emptySub}>Synchronise quand Internet est disponible. Ensuite la recherche reste utilisable hors connexion.</Text></View>}
    />

    <Modal visible={!!selectedClient} transparent animationType="fade" onRequestClose={() => setSelectedClient(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet,{maxHeight:'86%'}]}>
      <Text style={styles.modalTitle}>{selectedClient?.nom || 'Client'}</Text>
      <Text style={styles.cardSub}>{[selectedClient?.code_everwin,selectedClient?.ville,selectedClient?.agence_libelle].filter(Boolean).join(' · ')}</Text>
      {!selectedSite ? <FlatList style={{marginTop:12}} data={sites} keyExtractor={(x)=>x.remote_site_id} renderItem={({item})=><TouchableOpacity style={styles.card} onPress={()=>openSite(item)}><View style={{flex:1}}><Text style={styles.cardTitle}>{item.nom}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>} ListEmptyComponent={<Text style={[styles.emptySub,{marginVertical:20}]}>Aucun site synchronisé pour ce client.</Text>} /> : <View style={{marginTop:14}}>
        <TouchableOpacity onPress={()=>{setSelectedSite(null);setLocals([]);}}><Text style={styles.addLink}>‹ Sites du client</Text></TouchableOpacity>
        <Text style={[styles.sectionLabel,{marginTop:12}]}>{selectedSite.nom}</Text>
        {locals.map((l)=><View key={l.remote_local_id} style={styles.card}><View style={{flex:1}}><Text style={styles.cardTitle}>{l.designation || 'Local technique'}</Text><Text style={styles.cardSub}>{[l.remote_trame_nom,l.derniere_visite_date,l.derniere_visite_statut].filter(Boolean).join(' · ')}</Text></View></View>)}
        <TouchableOpacity style={[styles.btnPrimary,{marginTop:12}]} onPress={()=>openInMetra(selectedSite)}><Text style={styles.btnPrimaryText}>Ouvrir ce site dans METRA</Text></TouchableOpacity>
      </View>}
      <TouchableOpacity style={[styles.btnSecondary,{marginTop:12}]} onPress={()=>setSelectedClient(null)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
    </View></View></Modal>

    <Modal visible={activationVisible} transparent animationType="fade" onRequestClose={()=>setActivationVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
      <Text style={styles.modalTitle}>Activer cette tablette</Text><Text style={[styles.cardSub,{marginBottom:12}]}>Saisis le code de 48 caractères généré dans l’administration Énergie & Service. La clé privée de la tablette restera dans Android Keystore.</Text>
      <TextInput style={styles.input} value={activationCode} onChangeText={(v)=>setActivationCode(v.replace(/\s/g,'').slice(0,48))} placeholder="Code d’activation" autoCapitalize="none" autoCorrect={false} />
      <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={()=>setActivationVisible(false)} disabled={busy}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={activate} disabled={busy||activationCode.length!==48}><Text style={styles.btnPrimaryText}>{busy?'Activation…':'Activer'}</Text></TouchableOpacity></View>
    </View></View></Modal>
    {busy ? <View pointerEvents="none" style={{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center'}}><ActivityIndicator size="large" /></View> : null}
  </View>;
}
export { MetraDirectoryScreen };
