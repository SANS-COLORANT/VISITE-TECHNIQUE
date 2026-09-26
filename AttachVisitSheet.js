/**
 * Feuille « Rattacher à un client » (DA "Verre chaud") : déplace une visite
 * rapide du client technique « À rattacher » vers un vrai client, sur un site
 * existant ou un nouveau site. Voir rattacherVisiteRapide (quickVisitDb.js).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CvcIcon } from './MetraCvcIcons.js';
import { IconOrb } from './premiumChrome.js';
import { COLORS, FONTS } from './styles.js';
import { listerSitesRattachement, rattacherVisiteRapide, rechercherClientsRattachement } from './quickVisitDb.js';

const NEW_SITE = '__nouveau_site__';

function AttachVisitSheet({ visible, visiteId, nomSiteActuel = '', onClose, onAttached }) {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [siteChoisi, setSiteChoisi] = useState(NEW_SITE);
  const [nouveauNom, setNouveauNom] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setClient(null); setSites([]); setSiteChoisi(NEW_SITE); setNouveauNom(nomSiteActuel || ''); setBusy(false);
  }, [visible, nomSiteActuel]);

  useEffect(() => {
    if (!visible || client) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      rechercherClientsRattachement(query)
        .then((rows) => { if (alive) setClients(rows || []); })
        .catch((e) => console.warn('Recherche clients impossible', e))
        .finally(() => { if (alive) setLoading(false); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [visible, query, client]);

  const choisirClient = async (c) => {
    Keyboard.dismiss();
    setClient(c);
    setLoading(true);
    try {
      const rows = await listerSitesRattachement(c.id);
      setSites(rows || []);
      setSiteChoisi(rows?.length ? rows[0].id : NEW_SITE);
    } catch (e) { Alert.alert('Sites indisponibles', String(e?.message || e)); }
    finally { setLoading(false); }
  };

  const confirmer = async () => {
    if (busy || !client) return;
    setBusy(true);
    try {
      const result = await rattacherVisiteRapide({
        visiteId,
        clientId: client.id,
        siteId: siteChoisi === NEW_SITE ? null : siteChoisi,
        nouveauSiteNom: nouveauNom,
      });
      onAttached?.(result);
    } catch (e) {
      Alert.alert('Rattachement impossible', String(e?.message || e));
      setBusy(false);
    }
  };

  const fermer = () => { if (!busy) onClose?.(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fermer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} style={s.dim} onPress={fermer} />
        <View style={s.sheet}>
          <View style={s.grab} />
          {!client ? <>
            <Text style={s.title}>Rattacher à un client</Text>
            <Text style={s.sub}>La visite, ses saisies, réserves et photos passent chez le client choisi.</Text>
            <View style={s.search}>
              <CvcIcon name="search" size={17} color={COLORS.inkFaint} strokeWidth={2.1} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Nom du client ou code exploitant" placeholderTextColor={COLORS.inkFaint} style={s.searchInput} autoCorrect={false} autoFocus />
              {loading ? <ActivityIndicator size="small" color={COLORS.orange} /> : null}
            </View>
            <FlatList
              data={clients}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 330 }}
              ListEmptyComponent={!loading ? <Text style={s.empty}>Aucun client trouvé sur cet appareil.</Text> : null}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.85} onPress={() => choisirClient(item)} style={s.row}>
                  <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={34}><CvcIcon name="local" size={17} color={COLORS.orangeDark} /></IconOrb>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={s.rowTitle}>{item.nom}</Text>
                    {item.code_exploitant ? <Text numberOfLines={1} style={s.rowSub}>{item.code_exploitant}</Text> : null}
                  </View>
                  <CvcIcon name="chevron-right" size={16} color={COLORS.orangeDark} strokeWidth={2.2} />
                </TouchableOpacity>
              )}
            />
          </> : <>
            <TouchableOpacity onPress={() => { setClient(null); setSites([]); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <CvcIcon name="chevron-left" size={15} color={COLORS.orangeDark} strokeWidth={2.2} />
              <Text style={{ fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.orangeDark }}>Changer de client</Text>
            </TouchableOpacity>
            <Text numberOfLines={1} style={s.title}>{client.nom}</Text>
            <Text style={s.sub}>Sur quel site ranger cette visite ?</Text>
            <FlatList
              data={[...sites.map((x) => ({ id: x.id, label: x.nom_site, sub: x.adresse })), { id: NEW_SITE, label: 'Nouveau site', sub: null }]}
              keyExtractor={(x) => x.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 280 }}
              renderItem={({ item }) => {
                const on = item.id === siteChoisi;
                return (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setSiteChoisi(item.id)} style={[s.row, on && s.rowOn]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={s.rowTitle}>{item.label}</Text>
                      {item.sub ? <Text numberOfLines={1} style={s.rowSub}>{item.sub}</Text> : null}
                    </View>
                    <View style={[s.radio, on && s.radioOn]} />
                  </TouchableOpacity>
                );
              }}
            />
            {siteChoisi === NEW_SITE ? <TextInput value={nouveauNom} onChangeText={setNouveauNom} placeholder="Nom du nouveau site" placeholderTextColor={COLORS.inkFaint} style={s.input} /> : null}
            <TouchableOpacity accessibilityRole="button" onPress={confirmer} disabled={busy} activeOpacity={0.85} style={{ marginTop: 12 }}>
              <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.go}>
                {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.goText}>Rattacher la visite</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(22,21,15,0.32)' },
  sheet: { backgroundColor: '#FBFAF7', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D6D1C6', marginBottom: 14 },
  title: { fontSize: 19, fontFamily: FONTS.black, color: COLORS.ink },
  sub: { fontSize: 12.5, lineHeight: 18, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 4, marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 13, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink, paddingVertical: 10 },
  empty: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, textAlign: 'center', paddingVertical: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 15, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', marginBottom: 7 },
  rowOn: { borderWidth: 1.5, borderColor: COLORS.orange, backgroundColor: '#FFF8F3' },
  rowTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.ink },
  rowSub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D6D1C6' },
  radioOn: { borderWidth: 6, borderColor: COLORS.orange },
  input: { marginTop: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  go: { minHeight: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.orange, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  goText: { fontSize: 15, fontFamily: FONTS.bodyBold, color: COLORS.white },
});

export { AttachVisitSheet };
