import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { bindVisitToIntranetTarget, getVisitIntranetBindingOptions } from './intranetVisitBindingDb.js';
import { syncAuthorizedClients, syncClientPreparation } from './symfonyApi.js';

function OptionRow({ selected, disabled = false, title, subtitle, onPress }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={{
    minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: selected ? COLORS.primary : COLORS.line,
    backgroundColor: selected ? '#FFF3E8' : '#FFFFFF', paddingHorizontal: 11, paddingVertical: 9, marginBottom: 7, opacity: disabled ? 0.45 : 1,
  }}>
    <Text style={{ color: selected ? COLORS.primary : COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>{selected ? '✓ ' : ''}{title}</Text>
    {subtitle ? <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 }}>{subtitle}</Text> : null}
  </TouchableOpacity>;
}

export function IntranetVisitDestinationPicker({ visible, visiteId, onClose, onBound }) {
  const [options, setOptions] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [localId, setLocalId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const apply = (data, requestedClient = null, requestedSite = null) => {
    const nextClient = requestedClient || data.selectedClientId || null;
    const nextSite = requestedSite || data.selectedSiteId || null;
    setOptions(data);
    setClientId(nextClient);
    setSiteId(nextSite);
    setLocalId(data.suggestedLocalId || null);
  };

  const load = async (requestedClient = null, requestedSite = null) => {
    setBusy(true);
    setError(null);
    try {
      const data = await getVisitIntranetBindingOptions(visiteId, { remoteClientId: requestedClient, remoteSiteId: requestedSite });
      apply(data, requestedClient, requestedSite);
      return data;
    } catch (e) {
      setError(String(e?.message || e));
      return null;
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!visible) return;
    setOptions(null); setClientId(null); setSiteId(null); setLocalId(null); setError(null);
    load().catch(() => {});
  }, [visible, visiteId]);

  const chooseClient = async (id) => {
    const value = String(id);
    setClientId(value); setSiteId(null); setLocalId(null);
    await load(value, null);
  };
  const chooseSite = async (id) => {
    const value = String(id);
    setSiteId(value); setLocalId(null);
    await load(clientId, value);
  };

  const refreshRemote = async () => {
    if (refreshing) return;
    setRefreshing(true); setError(null);
    try {
      await syncAuthorizedClients();
      if (clientId) await syncClientPreparation(clientId);
      await load(clientId, siteId);
    } catch (e) {
      setError(`Réponse Intranet : ${String(e?.message || e)}`);
    } finally { setRefreshing(false); }
  };

  const bind = async () => {
    if (busy || !clientId || !siteId || !localId) return;
    setBusy(true); setError(null);
    try {
      const target = await bindVisitToIntranetTarget(visiteId, { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId });
      Alert.alert('Destination Intranet associée', `${target.clientName} · ${target.siteName} · ${target.localName}\n\nLa visite peut maintenant être envoyée. L’Intranet confirmera ensuite le succès ou renverra son erreur.`);
      await onBound?.(target);
    } catch (e) {
      setError(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const clients = options?.clients || [];
  const sites = options?.sites || [];
  const locals = options?.locals || [];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '90%', maxHeight: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>DESTINATION INTRANET</Text>
          <Text style={[styles.modalTitle, { marginTop: 4 }]}>Associer cette visite avant l’envoi</Text>
          <Text style={[styles.cardSub, { lineHeight: 17 }]}>La visite peut avoir été créée normalement dans METRA. Elle n’a pas besoin d’avoir été ouverte depuis « Préparer ».</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.muted, fontSize: 19 }}>✕</Text></TouchableOpacity>
      </View>

      <TouchableOpacity accessibilityRole="button" disabled={refreshing || busy} onPress={refreshRemote} style={[styles.btnSecondary, { minHeight: 44, marginTop: 11, marginBottom: 8 }]}>
        <Text style={styles.btnSecondaryText}>{refreshing ? 'Actualisation Intranet…' : clientId ? '↻ Actualiser clients, sites et locaux' : '↻ Actualiser les clients Intranet'}</Text>
      </TouchableOpacity>
      {error ? <View style={{ backgroundColor: '#FFF1F0', borderWidth: 1, borderColor: '#F7C7C3', borderRadius: 10, padding: 9, marginBottom: 8 }}><Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, fontWeight: '700' }}>{error}</Text></View> : null}
      {busy && !options ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.primary} /><Text style={{ color: COLORS.muted, marginTop: 8 }}>Lecture des correspondances Intranet…</Text></View> : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 6, marginBottom: 6 }}>1 · Client Intranet</Text>
        {clients.length ? clients.map((row) => <OptionRow key={row.remote_client_id} selected={String(row.remote_client_id) === String(clientId)} title={row.nom || `Client ${row.remote_client_id}`} subtitle={[row.code_everwin, row.ville, `ID ${row.remote_client_id}`].filter(Boolean).join(' · ')} onPress={() => chooseClient(row.remote_client_id)} />) : <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun client autorisé en cache. Actualise l’Intranet ou vérifie l’activation de la tablette.</Text>}

        {clientId ? <><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 6 }}>2 · Site Intranet</Text>
          {sites.length ? sites.map((row) => <OptionRow key={row.remote_site_id} selected={String(row.remote_site_id) === String(siteId)} title={row.nom || `Site ${row.remote_site_id}`} subtitle={`ID ${row.remote_site_id}${row.local_site_id ? ' · déjà relié à METRA' : ''}`} onPress={() => chooseSite(row.remote_site_id)} />) : <Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun site trouvé pour ce client. Utilise « Actualiser » : si l’Intranet ne renvoie toujours aucun site, l’envoi ne peut pas être construit avec l’API actuelle.</Text>}
        </> : null}

        {siteId ? <><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginTop: 8, marginBottom: 6 }}>3 · Local / installation Intranet</Text>
          {locals.length ? locals.map((row) => <OptionRow key={row.remote_local_id} selected={String(row.remote_local_id) === String(localId)} disabled={!row.compatible} title={row.designation || `Local ${row.remote_local_id}`} subtitle={[row.remote_trame_nom, row.derniere_visite_date ? `dernière visite ${String(row.derniere_visite_date).slice(0,10)}` : null, `ID ${row.remote_local_id}`, row.compatible ? null : 'trame incompatible'].filter(Boolean).join(' · ')} onPress={() => setLocalId(String(row.remote_local_id))} />) : <Text style={{ color: '#B42318', fontSize: 11.5, lineHeight: 16, marginBottom: 8 }}>Aucun local trouvé sur ce site. Actualise les données du client. Le POST Intranet exige un localId : METRA ne peut pas inventer ce rattachement.</Text>}
        </> : null}
      </ScrollView>}

      <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 }}>
        <Text style={{ color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginBottom: 8 }}>L’association ne crée aucune visite sur le serveur. Après cette étape, le bouton d’envoi utilise les identifiants Intranet sélectionnés et affiche la réponse réelle du serveur.</Text>
        <TouchableOpacity accessibilityRole="button" disabled={busy || !clientId || !siteId || !localId} onPress={bind} style={[styles.btnPrimary, { minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy || !clientId || !siteId || !localId ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Associer cette visite à l’Intranet</Text>}
        </TouchableOpacity>
      </View>
    </View></View>
  </Modal>;
}
