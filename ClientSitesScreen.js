/** Écran Sites d'un client + accès pilotage, carte et documents. */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { COLORS, styles } from './styles.js';
import { creerSite } from './db.js';
import { getResumeSuppressionSite, supprimerSiteComplet } from './entityManagementDb.js';
import { synchroniserCoordonneesSite } from './siteGeoDb.js';
import { modifierSiteRapide } from './siteBulkDb.js';
import { dupliquerSite } from './siteOrganizationDb.js';
import { composerAdresse } from './SiteAddressManager.js';
import { SiteGroupsManager } from './SiteGroupsManager.js';
import { SiteRadialActionMenu } from './SiteRadialActionMenu.js';
import { PatrimoineImageCard, PatrimoineThumbnail } from './PatrimoineImageCard.js';
import { onPatrimoineImageChanged } from './patrimoineImageDb.js';
import { IntranetSiteCreationModal } from './IntranetStructureUi.js';
import { SITE_SORT_OPTIONS, buildSiteGroupMap, siteGroupLabel, sortSites } from './siteSort.js';
import { getNavigationScrollOffset, getNavigationState, hydrateNavigationState, setNavigationScrollOffset, setNavigationState } from './navigationMemory.js';
import { peekClientSites, prewarmClientSites, prewarmSiteLocals } from './navigationPrewarm.js';
import { CompanionTabletModal } from './CompanionTabletModal.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { getRuntimeAccent, getRuntimePalette } from './visual-packs/runtime/visualPaletteRuntime.js';

const adresseVide = () => ({ numero: '', voie: '', complement: '', codePostal: '', ville: '' });


function ClientSitesScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const cacheKey = String(clientId || '');
  const scrollKey = `client-sites:${cacheKey}`;
  const listRef = useRef(null);
  const initialBundle = peekClientSites(cacheKey);
  const [sites, setSites] = useState(() => initialBundle?.sites || []);
  const [memberships, setMemberships] = useState(() => initialBundle?.memberships || []);
  const [sortMode, setSortMode] = useState(() => getNavigationState(scrollKey)?.sortMode || 'alpha');
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [intranetSiteVisible, setIntranetSiteVisible] = useState(false);
  const [clientCompanionVisible, setClientCompanionVisible] = useState(false);
  const [groupesVisible, setGroupesVisible] = useState(false);
  const [radialMenu, setRadialMenu] = useState(null);
  const [renameSite, setRenameSite] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState(adresseVide);

  const charger = useCallback(async () => {
    if (!clientId) { setSites([]); setMemberships([]); return []; }
    const bundle = await prewarmClientSites(clientId, { force: true });
    setSites(bundle?.sites || []);
    setMemberships(bundle?.memberships || []);
    return bundle?.sites || [];
  }, [clientId]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try { if (actif) await charger(); }
      catch (e) { if (actif) Alert.alert('Sites', String(e?.message || e)); }
    })();
    return () => { actif = false; };
  }, [charger]);

  useEffect(() => onPatrimoineImageChanged((change) => {
    if (change?.type === 'site') charger().catch(() => {});
  }), [charger]);

  const groupMap = useMemo(() => buildSiteGroupMap(memberships), [memberships]);
  const sitesTries = useMemo(() => sortSites(sites, sortMode, groupMap), [sites, sortMode, groupMap]);
  const sitesFiltres = useMemo(() => {
    const q = String(search || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!q) return sitesTries;
    return sitesTries.filter((site) => {
      const haystack = [site.nom_site, site.adresse, site.localisation_note, siteGroupLabel(site.id, groupMap)]
        .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return haystack.includes(q);
    });
  }, [sitesTries, search, groupMap]);

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(scrollKey).then((state) => {
      if (!alive || !state) return;
      if (state.sortMode) setSortMode(state.sortMode);
      const offset = Number(state.scrollY || 0);
      if (offset) setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    }).catch(() => {});
    return () => { alive = false; };
  }, [scrollKey]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(scrollKey);
    if (!offset || !sitesFiltres.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    return () => clearTimeout(timer);
  }, [scrollKey, sitesFiltres.length]);

  const changerTri = useCallback((mode) => {
    setSortMode(mode);
    setNavigationState(scrollKey, { sortMode: mode, scrollY: 0 });
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [scrollKey]);

  const sansAdresse = sites.filter((s) => !String(s.adresse || '').trim()).length;
  const avecAdresse = sites.length - sansAdresse;
  const accent = getRuntimeAccent();
  const palette = getRuntimePalette();
  const patchNouvelleAdresse = (patch) => setNouvelleAdresse((prev) => ({ ...prev, ...patch }));
  const ouvrirAjoutSite = () => Alert.alert('Ajouter un site', 'Où créer le site ?', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Site local', onPress: () => setModalVisible(true) },
    { text: 'Site Intranet', onPress: () => setIntranetSiteVisible(true) },
  ]);

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) return Alert.alert('Nom requis', 'Merci de saisir le nom du site.');
    const adresse = composerAdresse(nouvelleAdresse);
    try {
      const siteId = await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: adresse || null });
      setNouveauNom(''); setNouvelleAdresse(adresseVide()); setModalVisible(false);
      await charger();
      if (adresse) synchroniserCoordonneesSite(siteId, adresse).then(charger).catch(() => {});
    } catch (e) { Alert.alert('Création impossible', String(e?.message || e)); }
  };

  const ouvrirSite = (site) => navigation.navigate('SiteLocals', { siteId: site.id, nomSite: site.nom_site, clientId, nomClient });
  const ouvrirStructure = (event, site) => {
    event?.stopPropagation?.();
    navigation.navigate('IntranetStructure', { siteId: site.id, nomSite: site.nom_site, clientId, nomClient });
  };

  const confirmerSuppressionSite = async (site) => {
    try {
      const resume = await getResumeSuppressionSite(site.id);
      if (!resume) return;
      Alert.alert('Supprimer ce site ?', `« ${resume.nom_site} » contient ${resume.visites} visite(s) et ${resume.equipements} équipement(s) permanent(s). Tout sera définitivement supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer tout', style: 'destructive', onPress: async () => { try { await supprimerSiteComplet(site.id); await charger(); } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); } } },
      ]);
    } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
  };

  const demanderDuplication = (site) => Alert.alert(
    'Dupliquer ce site ?',
    `METRA va créer « ${site.nom_site} - copie » avec son patrimoine et sa maquette LAB 3D. Les anciennes visites, réserves, mesures et photos ne seront pas copiées.`,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Dupliquer', onPress: async () => {
        try {
          await dupliquerSite(site.id, { copierPatrimoine: true, copierLab3d: true });
          await charger();
        } catch (e) { Alert.alert('Duplication impossible', String(e?.message || e)); }
      } },
    ]
  );

  const ouvrirMenuSite = (event, site) => {
    event?.stopPropagation?.();
    const native = event?.nativeEvent || {};
    setRadialMenu({ site, x: native.pageX, y: native.pageY });
  };

  const actionMenuSite = (action, site) => {
    setRadialMenu(null);
    if (!site) return;
    if (action === 'delete') confirmerSuppressionSite(site);
    else if (action === 'duplicate') demanderDuplication(site);
    else if (action === 'rename') { setRenameSite(site); setRenameValue(site.nom_site || ''); }
  };

  const enregistrerRenommage = async () => {
    const nom = String(renameValue || '').trim();
    if (!renameSite) return;
    if (!nom) return Alert.alert('Nom requis', 'Merci de saisir le nom du site.');
    try {
      await modifierSiteRapide(renameSite.id, { nomSite: nom });
      setRenameSite(null); setRenameValue('');
      await charger();
    } catch (e) { Alert.alert('Renommage impossible', String(e?.message || e)); }
  };

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      onScroll={(event) => setNavigationScrollOffset(scrollKey, event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={80}
      contentContainerStyle={[styles.content, { paddingBottom: 34 }]}
      data={sitesFiltres}
      initialNumToRender={16}
      maxToRenderPerBatch={12}
      updateCellsBatchingPeriod={24}
      windowSize={7}
      removeClippedSubviews={false}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<View>
        <PatrimoineImageCard compact entityType="client" entityId={clientId} title={nomClient || 'Client'} />
        <View style={styles.clientOverviewCard}>
          <Text style={styles.clientOverviewText}><Text style={styles.clientOverviewNumber}>{sites.length}</Text> site{sites.length > 1 ? 's' : ''}</Text>
          <Text style={styles.clientOverviewText}><Text style={styles.clientOverviewNumber}>{avecAdresse}</Text> avec adresse</Text>
          {sansAdresse > 0 ? <Text style={[styles.clientOverviewText, { color: COLORS.amber }]}><Text style={styles.clientOverviewNumber}>{sansAdresse}</Text> à compléter</Text> : null}
        </View>
        <View style={styles.clientPrimaryActions}>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => navigation.navigate('ClientPilotage', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnPrimaryText}>▦ Patrimoine</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={ouvrirAjoutSite}><Text style={styles.btnPrimaryText}>+ Ajouter un site</Text></TouchableOpacity>
        </View>
        <View style={styles.clientQuickActions}>
          <TouchableOpacity style={styles.clientQuickAction} onPress={() => navigation.navigate('ClientMap', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.clientQuickActionText}>Carte</Text></TouchableOpacity>
          <TouchableOpacity style={styles.clientQuickAction} onPress={() => setGroupesVisible(true)} disabled={!sites.length}><Text style={styles.clientQuickActionText}>Groupes</Text></TouchableOpacity>
          <TouchableOpacity style={styles.clientQuickAction} onPress={() => navigation.navigate('ClientDocuments', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.clientQuickActionText}>Documents</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.clientQuickAction, { borderColor: accent, backgroundColor: palette.light }]} onPress={() => setClientCompanionVisible(true)}><Text style={[styles.clientQuickActionText, { color: accent }]}>Compagnon</Text></TouchableOpacity>
        </View>
        <View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>Sites</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>{sitesFiltres.length}/{sites.length}</Text></View>
        <TextInput
          style={[styles.input, { marginTop: 8, marginBottom: 8 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un site, une adresse, un lot…"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 7, paddingBottom: 12 }}>
          {SITE_SORT_OPTIONS.map((option) => {
            const active = sortMode === option.id;
            return <TouchableOpacity key={option.id} onPress={() => changerTri(option.id)} style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: active ? COLORS.orange : COLORS.line, backgroundColor: active ? '#FFF3E8' : '#FFF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '900', color: active ? COLORS.orange : COLORS.inkSoft }}>{option.label}</Text></TouchableOpacity>;
          })}
        </ScrollView>
      </View>}
      renderItem={({ item }) => <TouchableOpacity style={[styles.card, { alignItems: 'flex-start' }]} activeOpacity={0.7} onPressIn={() => prewarmSiteLocals(item.id).catch(() => {})} onPress={() => ouvrirSite(item)}>
        <PatrimoineThumbnail uri={item.image_uri} size={48} radius={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text numberOfLines={1} style={[styles.cardTitle, { flex: 1 }]}>{item.nom_site}</Text><View style={[styles.badge, item.statut === 'Actif' ? styles.badgeActif : styles.badgeInactif]}><Text style={[styles.badgeText, item.statut === 'Actif' ? styles.badgeTextActif : styles.badgeTextInactif]}>{item.statut || 'Actif'}</Text></View></View>
          <Text numberOfLines={2} style={item.adresse ? styles.cardSub : { color: COLORS.amber, fontSize: 11.5 }}>{item.adresse || 'Adresse à renseigner'}</Text>
          {siteGroupLabel(item.id, groupMap) ? <Text numberOfLines={1} style={{ color: COLORS.orangeDark, fontSize: 10.5, fontWeight: '700', marginTop: 3 }}>{siteGroupLabel(item.id, groupMap)}</Text> : null}
          <TouchableOpacity accessibilityLabel={`Ouvrir les locaux Intranet de ${item.nom_site}`} onPress={(e) => ouvrirStructure(e, item)} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', marginTop: 5 }}><Text style={{ color: COLORS.orangeDark, fontSize: 11, fontWeight: '700' }}>Locaux Intranet →</Text></TouchableOpacity>
        </View>
        <TouchableOpacity accessibilityLabel={`Actions du site ${item.nom_site}`} onPress={(e) => ouvrirMenuSite(e, item)} style={{ minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.inkSoft, fontSize: 22, fontWeight: '900' }}>⋯</Text></TouchableOpacity>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
    />

    <Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Nouveau site local</Text><Text style={{ color: COLORS.muted, fontSize: 11.5, marginBottom: 10 }}>Ce bouton crée uniquement un site dans la base locale METRA. Utilise « Site Intranet » pour créer aussi la structure serveur.</Text><TextInput style={styles.input} placeholder="Nom du site" value={nouveauNom} onChangeText={setNouveauNom}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><TextInput style={[styles.input, { width: 84 }]} placeholder="N°" value={nouvelleAdresse.numero} keyboardType="numbers-and-punctuation" onChangeText={(v) => patchNouvelleAdresse({ numero: v })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Rue / avenue / voie" value={nouvelleAdresse.voie} onChangeText={(v) => patchNouvelleAdresse({ voie: v })}/></View><TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Complément : bâtiment, entrée…" value={nouvelleAdresse.complement} onChangeText={(v) => patchNouvelleAdresse({ complement: v })}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><TextInput style={[styles.input, { width: 120 }]} placeholder="Code postal" value={nouvelleAdresse.codePostal} keyboardType="number-pad" maxLength={5} onChangeText={(v) => patchNouvelleAdresse({ codePostal: v.replace(/\D/g, '').slice(0, 5) })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Ville" value={nouvelleAdresse.ville} onChangeText={(v) => patchNouvelleAdresse({ ville: v })}/></View><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={ajouterSiteFn}><Text style={styles.btnPrimaryText}>Créer</Text></TouchableOpacity></View></View></View></Modal>

    <IntranetSiteCreationModal visible={intranetSiteVisible} clientId={clientId} onClose={() => setIntranetSiteVisible(false)} onCreated={charger} />

    <CompanionTabletModal
      visible={clientCompanionVisible}
      clientId={clientId}
      nomClient={nomClient}
      onClose={() => setClientCompanionVisible(false)}
    />

    <Modal visible={!!renameSite} transparent animationType="fade" onRequestClose={() => setRenameSite(null)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Renommer le site</Text><TextInput autoFocus style={styles.input} value={renameValue} onChangeText={setRenameValue} selectTextOnFocus/><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setRenameSite(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrerRenommage}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View></View></View></Modal>

    <SiteGroupsManager visible={groupesVisible} clientId={clientId} sites={sites} onClose={() => { setGroupesVisible(false); charger().catch(() => {}); }} onChanged={charger}/>
    <SiteRadialActionMenu menu={radialMenu} onClose={() => setRadialMenu(null)} onAction={actionMenuSite}/>
  </View>;
}

export { ClientSitesScreen };
