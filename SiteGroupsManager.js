import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { creerGroupeSite, definirSiteDansGroupe, listerAppartenancesClient, listerGroupesClient, supprimerGroupeSite } from './siteOrganizationDb.js';

function texte(value = '') { return String(value || '').trim(); }

function SiteGroupVirtualList({ groupes, sites, membershipSet, onToggle, onDelete }) {
  return <FlatList
    style={{ flex: 1 }}
    data={sites}
    keyExtractor={(site) => String(site.id)}
    initialNumToRender={12}
    maxToRenderPerBatch={10}
    updateCellsBatchingPeriod={24}
    windowSize={7}
    removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
    ListHeaderComponent={groupes.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>{groupes.map((g) => <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff' }}><Text style={{ paddingHorizontal: 10, paddingVertical: 8, fontSize: 11, fontWeight: '800' }}>{g.nom} · {g.nb_sites || 0}</Text><TouchableOpacity onPress={() => onDelete(g)} style={{ minWidth: 34, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.red || '#B42318', fontWeight: '900', fontSize: 17 }}>×</Text></TouchableOpacity></View>)}</View> : <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 14 }}>Créez un groupe puis touchez-le sur les sites concernés.</Text>}
    renderItem={({ item: site }) => <View style={{ borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', borderRadius: 12, padding: 11, marginBottom: 8 }}>
      <Text style={{ fontWeight: '900', color: COLORS.ink }}>{site.nom_site}</Text>
      {groupes.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{groupes.map((g) => {
        const active = membershipSet.has(`${site.id}||${g.id}`);
        return <TouchableOpacity key={g.id} onPress={() => onToggle(site, g)} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? COLORS.orange : COLORS.line, backgroundColor: active ? '#FFF3E8' : '#fff', justifyContent: 'center' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: active ? COLORS.orange : COLORS.inkSoft }}>{active ? '✓ ' : ''}{g.nom}</Text></TouchableOpacity>;
      })}</View> : null}
    </View>}
  />;
}

export function SiteGroupsManager({ visible, clientId, sites = [], onClose, onChanged }) {
  const [groupes, setGroupes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [nouveauGroupe, setNouveauGroupe] = useState('');
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    if (!clientId) return;
    const [g, m] = await Promise.all([listerGroupesClient(clientId), listerAppartenancesClient(clientId)]);
    setGroupes(g || []);
    setMemberships(m || []);
  }, [clientId]);

  useEffect(() => { if (visible) charger().catch((e) => Alert.alert('Groupes', String(e?.message || e))); }, [visible, charger]);
  const membershipSet = useMemo(() => new Set(memberships.map((m) => `${m.site_id}||${m.groupe_id}`)), [memberships]);

  const creer = async () => {
    if (!texte(nouveauGroupe)) return;
    try {
      setBusy(true);
      await creerGroupeSite(clientId, nouveauGroupe);
      setNouveauGroupe('');
      await charger();
    } catch (e) { Alert.alert('Groupe', String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const basculer = async (site, groupe) => {
    const key = `${site.id}||${groupe.id}`;
    const actif = membershipSet.has(key);
    const avantMemberships = memberships;
    const avantGroupes = groupes;
    setMemberships((prev) => actif ? prev.filter((m) => !(m.site_id === site.id && m.groupe_id === groupe.id)) : [...prev, { site_id: site.id, groupe_id: groupe.id, groupe_nom: groupe.nom }]);
    setGroupes((prev) => prev.map((g) => g.id === groupe.id ? { ...g, nb_sites: Math.max(0, Number(g.nb_sites || 0) + (actif ? -1 : 1)) } : g));
    try {
      await definirSiteDansGroupe(site.id, groupe.id, !actif);
    } catch (e) {
      setMemberships(avantMemberships);
      setGroupes(avantGroupes);
      Alert.alert('Groupe', String(e?.message || e));
    }
  };

  const supprimer = (groupe) => Alert.alert(
    'Supprimer ce groupe ?',
    `« ${groupe.nom} » sera supprimé. Aucun site ni aucune visite ne sera supprimé.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try { setBusy(true); await supprimerGroupeSite(groupe.id); await charger(); await onChanged?.(); }
        catch (e) { Alert.alert('Groupe', String(e?.message || e)); }
        finally { setBusy(false); }
      } },
    ]
  );

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet, { width: '94%', maxWidth: 720, maxHeight: '88%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.modalTitle}>Groupes de sites</Text><Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>Classement du patrimoine uniquement.</Text></View>
          <TouchableOpacity onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: COLORS.inkSoft }}>×</Text></TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={nouveauGroupe} placeholder="Nouveau groupe" onChangeText={setNouveauGroupe} returnKeyType="done" onSubmitEditing={creer}/>
          <TouchableOpacity style={styles.btnPrimary} disabled={busy || !texte(nouveauGroupe)} onPress={creer}><Text style={styles.btnPrimaryText}>+ Ajouter</Text></TouchableOpacity>
        </View>

        {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><ActivityIndicator color={COLORS.orange}/><Text style={{ color: COLORS.muted }}>Mise à jour…</Text></View> : null}

        <SiteGroupVirtualList groupes={groupes} sites={sites} membershipSet={membershipSet} onToggle={basculer} onDelete={supprimer}/>
      </View>
    </View>
  </Modal>;
}
