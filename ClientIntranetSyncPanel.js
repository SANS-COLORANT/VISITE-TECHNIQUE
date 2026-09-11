import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { obtenirTrame } from './trameRegistry.js';
import {
  envoyerVisitesIntranetClient,
  listerEtatsIntranetVisitesClient,
  subscribeVisitOutbox,
} from './clientIntranetSyncDb.js';

const OFFLINE = '#111111';
const ONLINE = '#16794B';
const CLIENT_SYNC_UI_CACHE = new Map();

function trameNom(id) {
  try { return obtenirTrame(id)?.nom || id || 'Visite'; } catch { return id || 'Visite'; }
}

const SyncRow = memo(function SyncRow({ item, selected, selectionMode, busy, onToggle, onDirectSend }) {
  const online = Number(item.intranet_online) === 1;
  return <View style={{ minHeight: 64, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF0F2', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    {selectionMode && !online ? <TouchableOpacity disabled={busy} onPress={() => onToggle(item.id)} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: selected ? COLORS.orange : '#C9CDD3', backgroundColor: selected ? COLORS.orange : '#FFF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFF', fontWeight: '900' }}>{selected ? '✓' : ''}</Text></TouchableOpacity> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: COLORS.ink, fontSize: 13.5, fontWeight: '900' }}>{item.nom_site || 'Site'}{item.nom_installation ? ` · ${item.nom_installation}` : ''}</Text>
      <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 10.8, marginTop: 3 }}>{item.date_visite || 'Date non renseignée'} · {trameNom(item.trame_id)} · {item.statut === 'terminee' || item.statut === 'exportee' ? 'Terminée' : 'En cours'}</Text>
      {!online && item.intranet_sync_error_message ? <Text numberOfLines={1} style={{ color: '#B42318', fontSize: 9.8, marginTop: 2 }}>{item.intranet_sync_error_message}</Text> : null}
    </View>
    <TouchableOpacity
      disabled={busy || online}
      onPress={() => !online && onDirectSend(item)}
      style={{ minWidth: 82, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: online ? ONLINE : OFFLINE, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
    ><Text style={{ color: '#FFF', fontSize: 11.5, fontWeight: '900' }}>{online ? 'Online' : 'Offline'}</Text></TouchableOpacity>
  </View>;
});

export function ClientIntranetSyncPanel({ clientId }) {
  const cacheKey = String(clientId || '');
  const cached = CLIENT_SYNC_UI_CACHE.get(cacheKey);
  const [state, setState] = useState(cached || { linked: false, visits: [] });
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState('offline');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState('');

  const charger = useCallback(async () => {
    if (!clientId) return;
    const next = await listerEtatsIntranetVisitesClient(clientId);
    CLIENT_SYNC_UI_CACHE.set(cacheKey, next);
    setState(next);
  }, [cacheKey, clientId]);

  useEffect(() => {
    charger().catch(() => {});
    return subscribeVisitOutbox(() => charger().catch(() => {}));
  }, [charger]);

  const visits = state.visits || [];
  const offline = useMemo(() => visits.filter((v) => Number(v.intranet_online) !== 1), [visits]);
  const online = useMemo(() => visits.filter((v) => Number(v.intranet_online) === 1), [visits]);
  const shown = filter === 'online' ? online : offline;

  const ouvrir = (nextFilter) => {
    setFilter(nextFilter);
    setSelectionMode(false);
    setSelected(new Set());
    setVisible(true);
  };

  const toggle = useCallback((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelected((current) => current.size === offline.length ? new Set() : new Set(offline.map((v) => v.id)));
  };

  const runSend = async (rows, finalizeInProgress = false) => {
    if (!rows.length || busy) return;
    setBusy(true);
    setProgressText(`Préparation de ${rows.length} visite${rows.length > 1 ? 's' : ''}…`);
    try {
      const result = await envoyerVisitesIntranetClient(rows.map((row) => row.id), { finalizeInProgress, processImmediately: true, immediateLimit: rows.length === 1 ? 1 : 3 });
      await charger();
      setSelected(new Set());
      setSelectionMode(false);
      const material = result.errors.filter((e) => ['material_replacement_confirmation_required', 'material_clear_confirmation_required'].includes(e.code));
      const autres = result.errors.filter((e) => !['material_replacement_confirmation_required', 'material_clear_confirmation_required'].includes(e.code));
      const prepared = result.prepared.filter((r) => r.state !== 'online').length;
      const lines = [];
      if (prepared) lines.push(`${prepared} visite${prepared > 1 ? 's' : ''} préparée${prepared > 1 ? 's' : ''} pour l’Intranet.`);
      if (material.length) lines.push(`${material.length} visite${material.length > 1 ? 's' : ''} nécessite${material.length > 1 ? 'nt' : ''} une confirmation du listing matériel depuis la visite.`);
      if (autres.length) lines.push(`${autres.length} visite${autres.length > 1 ? 's' : ''} à corriger avant envoi.`);
      if (!lines.length) lines.push('Aucune nouvelle visite à envoyer.');
      Alert.alert(result.errors.length ? 'Synchronisation partielle' : 'Synchronisation Intranet', lines.join('\n'));
    } finally {
      setProgressText('');
      setBusy(false);
    }
  };

  const demanderEnvoi = (rows) => {
    const inProgress = rows.filter((row) => !['terminee', 'exportee'].includes(row.statut));
    if (!inProgress.length) { runSend(rows, false).catch((e) => Alert.alert('Envoi impossible', String(e?.message || e))); return; }
    Alert.alert(
      'Finaliser et envoyer ?',
      `${inProgress.length} visite${inProgress.length > 1 ? 's sont encore en cours' : ' est encore en cours'}. METRA peut les finaliser puis les envoyer en une seule action.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Finaliser et envoyer', onPress: () => runSend(rows, true).catch((e) => Alert.alert('Envoi impossible', String(e?.message || e))) },
      ]
    );
  };

  const sendSelected = () => {
    const rows = offline.filter((row) => selected.has(row.id));
    if (!rows.length) return;
    demanderEnvoi(rows);
  };

  if (!state.linked) return null;

  return <>
    <View style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3E5E8', borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 13.5, fontWeight: '900' }}>Synchronisation Intranet</Text><Text style={{ color: COLORS.muted, fontSize: 10.8, marginTop: 2 }}>État de toutes les visites du client, sans ouvrir chaque site.</Text></View>
        {busy ? <ActivityIndicator size="small" color={COLORS.orange} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity onPress={() => ouvrir('offline')} style={{ flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: OFFLINE, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>Offline · {offline.length}</Text><Text style={{ color: '#D0D5DD', fontSize: 9.5, marginTop: 1 }}>Appuyer pour envoyer</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => ouvrir('online')} style={{ flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: ONLINE, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>Online · {online.length}</Text><Text style={{ color: '#DDF3E7', fontSize: 9.5, marginTop: 1 }}>Déjà synchronisées</Text></TouchableOpacity>
      </View>
      {offline.length ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
        <TouchableOpacity disabled={busy} onPress={() => demanderEnvoi(offline)} style={[styles.btnPrimary, { flex: 1, minHeight: 42, justifyContent: 'center' }]}><Text style={styles.btnPrimaryText}>Envoyer toutes les Offline</Text></TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={() => { ouvrir('offline'); setSelectionMode(true); }} style={[styles.btnSecondary, { minHeight: 42, justifyContent: 'center' }]}><Text style={styles.btnSecondaryText}>Choisir plusieurs</Text></TouchableOpacity>
      </View> : null}
      {progressText ? <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 7 }}>{progressText}</Text> : null}
    </View>

    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && setVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '95%', maxWidth: 820, height: '86%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.modalTitle}>Visites {filter === 'offline' ? 'Offline' : 'Online'}</Text><Text style={{ color: COLORS.muted, fontSize: 11 }}>{shown.length} visite{shown.length > 1 ? 's' : ''} · client entier</Text></View>
          <TouchableOpacity disabled={busy} onPress={() => setVisible(false)} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 19, color: COLORS.muted }}>✕</Text></TouchableOpacity>
        </View>

        {filter === 'offline' ? <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity disabled={busy} onPress={() => { setSelectionMode((v) => !v); setSelected(new Set()); }} style={styles.btnSecondary}><Text style={styles.btnSecondaryText}>{selectionMode ? 'Annuler sélection' : 'Sélectionner'}</Text></TouchableOpacity>
          {selectionMode ? <TouchableOpacity disabled={busy} onPress={selectAll} style={styles.btnSecondary}><Text style={styles.btnSecondaryText}>{selected.size === offline.length && offline.length ? 'Tout désélectionner' : 'Tout sélectionner'}</Text></TouchableOpacity> : null}
          <View style={{ flex: 1 }} />
          {selectionMode ? <Text style={{ color: COLORS.muted, fontSize: 11 }}>{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</Text> : null}
        </View> : null}

        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SyncRow item={item} selected={selected.has(item.id)} selectionMode={selectionMode} busy={busy} onToggle={toggle} onDirectSend={(row) => demanderEnvoi([row])} />}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={20}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{filter === 'offline' ? 'Toutes les visites sont Online.' : 'Aucune visite Online.'}</Text></View>}
        />

        {filter === 'offline' && selectionMode ? <View style={{ borderTopWidth: 1, borderTopColor: '#EEF0F2', paddingTop: 10 }}><TouchableOpacity disabled={busy || selected.size === 0} onPress={sendSelected} style={[styles.btnPrimary, { minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy || selected.size === 0 ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPrimaryText}>Envoyer {selected.size} visite{selected.size > 1 ? 's' : ''}</Text>}</TouchableOpacity></View> : null}
      </View></View>
    </Modal>
  </>;
}
