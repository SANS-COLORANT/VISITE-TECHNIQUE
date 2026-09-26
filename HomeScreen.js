/** Écran Accueil. */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput, Alert, ScrollView, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { IconOrb, FadeUp, GlassCard, ProgressRing } from './premiumChrome.js';
import { listerClients, creerClient, listerVisitesEnCours, compterVisites } from './db.js';
import { SpiralActiveHome } from './visual-packs/spiral-active/SpiralActiveHome.js';
import { PatrimoineThumbnail } from './PatrimoineImageCard.js';
import { onPatrimoineImageChanged } from './patrimoineImageDb.js';
import { MISSION_COLORS } from './missionTheme.js';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';
import { prewarmClientSites } from './navigationPrewarm.js';
import { prewarmVisitInBackground } from './visitPrewarm.js';
import { forgetVisitRuntime, markVisitHot } from './visitRuntimeCache.js';
import { QUICK_VISIT_CLIENT_ID, listerIdsVisitesARattacher, nettoyerSitesARattacherVides } from './quickVisitDb.js';
import { AttachVisitSheet } from './AttachVisitSheet.js';
import { ButtonGlow } from './ButtonGlow.js';
import { EmptyIcon } from './EmptyState.js';

const HOME_FAST_CACHE = { clients: null, visitesEnCours: null, stats: null, quickIds: null };
function chargerBatchExcelModule(){return require('./batchExcel.js');}
function chargerEntityManagementModule(){return require('./entityManagementDb.js');}

function HomeScreen({ navigation, onR1LongPress, spiralPreview = false, missionsEnabled = false, headerAction = null }) {
  const listRef = useRef(null);
  const scrollKey = 'home:clients';
  const [clients, setClients] = useState(() => HOME_FAST_CACHE.clients || []);
  const [visitesEnCours, setVisitesEnCours] = useState(() => HOME_FAST_CACHE.visitesEnCours || []);
  const [stats, setStats] = useState(() => HOME_FAST_CACHE.stats || { enCours: 0, terminees: 0 });
  const [quickIds, setQuickIds] = useState(() => HOME_FAST_CACHE.quickIds || new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');
  const [creationClient, setCreationClient] = useState(false);
  const [importBatch, setImportBatch] = useState(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [visiteARattacher, setVisiteARattacher] = useState(null);

  const charger = useCallback(async () => {
    // Stale-while-revalidate : au retour Accueil on conserve le dernier rendu
    // et chaque bloc se rafraîchit dès que sa requête SQLite est terminée.
    const clientsPromise = listerClients().then((rows) => { HOME_FAST_CACHE.clients = rows || []; setClients(rows || []); });
    const visitsPromise = listerVisitesEnCours().then((rows) => { HOME_FAST_CACHE.visitesEnCours = rows || []; setVisitesEnCours(rows || []); });
    const statsPromise = compterVisites().then((value) => { HOME_FAST_CACHE.stats = value || { enCours: 0, terminees: 0 }; setStats(HOME_FAST_CACHE.stats); });
    const quickPromise = listerIdsVisitesARattacher().then((ids) => { HOME_FAST_CACHE.quickIds = ids; setQuickIds(ids); }).catch(() => {});
    await Promise.all([clientsPromise, visitsPromise, statsPromise, quickPromise]);
  }, []);

  useEffect(() => { charger().catch((e) => console.warn('Chargement accueil impossible', e)); }, [charger]);
  useEffect(() => {
    let alive = true;
    hydrateNavigationState(scrollKey).then((state) => {
      if (!alive) return;
      const offset = Number(state?.scrollY || 0);
      if (offset) setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const offset = getNavigationScrollOffset(scrollKey);
    if (!offset || !clients.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    return () => clearTimeout(timer);
  }, [clients.length]);
  useEffect(() => onPatrimoineImageChanged((change) => {
    if (change?.type === 'client') charger().catch(() => {});
  }), [charger]);

  const missionsSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      missionsEnabled
      && gesture.dx > 22
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45
    ),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, gesture) => {
      if (missionsEnabled && gesture.dx > 85) navigation.navigate('Missions', { enteredBySwipe: true });
    },
  }), [missionsEnabled, navigation]);

  const onRefresh = async () => { setRefreshing(true); await charger(); setRefreshing(false); };
  const openDirectory = () => navigation.navigate('MetraDirectory', { query: quickSearch.trim() });

  const confirmerSuppressionVisite = (v) => Alert.alert(
    'Supprimer cette visite ?',
    `« ${v.nom_client} — ${v.nom_site} » et toutes les données propres à cette visite seront définitivement supprimées.`,
    [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await chargerEntityManagementModule().supprimerVisiteComplete(v.id); forgetVisitRuntime(v.id); await nettoyerSitesARattacherVides().catch(() => {}); await charger(); } }]
  );

  const confirmerSuppressionClient = async (client) => {
    try {
      const r = await chargerEntityManagementModule().getResumeSuppressionClient(client.id);
      if (!r) return;
      Alert.alert(
        'Supprimer ce client ?',
        `« ${r.nom} » contient ${r.sites} site(s) et ${r.visites} visite(s). Tout le contenu associé sera définitivement supprimé.`,
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer tout', style: 'destructive', onPress: async () => {
          try { await chargerEntityManagementModule().supprimerClientComplet(client.id); await charger(); }
          catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
        } }]
      );
    } catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
  };

  const ajouterClient = async () => {
    const nom = nouveauNom.trim();
    const codeExploitant = nouveauCode.trim() || null;
    if (!nom) { Alert.alert('Nom requis', 'Merci de saisir le nom du client.'); return; }
    if (creationClient) return;
    setCreationClient(true);
    try {
      const id = await creerClient({ nom, codeExploitant });
      setClients((c) => [...c, { id, nom, code_exploitant: codeExploitant, adresse: null, image_uri: null }].sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })));
      setNouveauNom('');
      setNouveauCode('');
      setModalVisible(false);
    } catch (e) { Alert.alert('Création impossible', String(e.message || e)); }
    finally { setCreationClient(false); }
  };

  const choisirExcel = async () => {
    try {
      const lot = await chargerBatchExcelModule().choisirEtAnalyserExcels();
      if (!lot) return;
      if (!lot.analyses.length) {
        Alert.alert('Aucun fichier importable', lot.erreurs.map((e) => `${e.nomFichier} : ${e.message}`).join('\n') || 'Aucune trame Excel reconnue.');
        return;
      }
      setImportBatch(lot);
    } catch (e) { Alert.alert('Import impossible', String(e.message || e)); }
  };

  const confirmerImport = async () => {
    if (!importBatch?.analyses?.length || importEnCours) return;
    setImportEnCours(true);
    try {
      const resultats = await chargerBatchExcelModule().importerAnalysesExcel(importBatch.analyses);
      const reussis = resultats.filter((r) => r.ok && !r.dejaImporte);
      const deja = resultats.filter((r) => r.ok && r.dejaImporte);
      const echecs = resultats.filter((r) => !r.ok);
      setImportBatch(null);
      await charger();
      if (resultats.length === 1 && reussis.length === 1) navigation.navigate('Visite', { visiteId: reussis[0].visiteId });
      else Alert.alert('Import Excel terminé', [
        `${reussis.length} visite(s) importée(s).`,
        deja.length ? `${deja.length} fichier(s) déjà importé(s).` : null,
        echecs.length ? `${echecs.length} échec(s).` : null,
      ].filter(Boolean).join('\n'));
    } catch (e) { Alert.alert('Erreur pendant l’import', String(e.message || e)); }
    finally { setImportEnCours(false); }
  };

  if (spiralPreview) {
    return <SpiralActiveHome
      clients={clients}
      visitesEnCours={visitesEnCours}
      stats={stats}
      refreshing={refreshing}
      onRefresh={onRefresh}
      quickSearch={quickSearch}
      setQuickSearch={setQuickSearch}
      openDirectory={openDirectory}
      navigation={navigation}
      choisirExcel={choisirExcel}
      confirmerSuppressionVisite={confirmerSuppressionVisite}
      confirmerSuppressionClient={confirmerSuppressionClient}
      modalVisible={modalVisible}
      setModalVisible={setModalVisible}
      nouveauNom={nouveauNom}
      setNouveauNom={setNouveauNom}
      nouveauCode={nouveauCode}
      setNouveauCode={setNouveauCode}
      ajouterClient={ajouterClient}
      creationClient={creationClient}
      importBatch={importBatch}
      setImportBatch={setImportBatch}
      confirmerImport={confirmerImport}
      importEnCours={importEnCours}
      onR1LongPress={onR1LongPress}
    />;
  }

  // Les visites rapides (bouton +) ont leur propre section « À rattacher » et
  // leur client technique n'apparaît pas dans la liste des clients.
  const visitesARattacher = visitesEnCours.filter((v) => quickIds.has(v.id));
  const visitesClients = visitesEnCours.filter((v) => !quickIds.has(v.id));
  const clientsVisibles = clients.filter((c) => c.id !== QUICK_VISIT_CLIENT_ID);
  const reprise = visitesClients[0] || null;
  const autresVisites = visitesClients.slice(1);
  const ouvrirVisite = (v) => { markVisitHot(v.id, { preview: v }); navigation.navigate('Visite', { visiteId: v.id, visitePreview: v }); };

  return <View style={{ flex: 1 }} {...missionsSwipeResponder.panHandlers}>
    <View style={styles.homeTopRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
        <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.orange, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
          <CvcIcon name="tools" size={19} color={COLORS.white} strokeWidth={2.1} />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '800', fontFamily: FONTS.black, color: COLORS.ink }}>Visite Technique</Text>
          <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 }}>{stats.enCours} en cours · {stats.terminees} terminée{stats.terminees > 1 ? 's' : ''}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {headerAction ? <TouchableOpacity accessibilityLabel={headerAction.label} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={headerAction.onPress}>
          <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={38}><CvcIcon name="device" size={18} color={COLORS.orangeDark} /></IconOrb>
        </TouchableOpacity> : null}
        <TouchableOpacity accessibilityLabel="Importer des fichiers Excel" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={choisirExcel}>
          <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={38}><CvcIcon name="document" size={18} color={COLORS.orangeDark} /></IconOrb>
        </TouchableOpacity>
      </View>
    </View>

    <FlatList
      ref={listRef}
      onScroll={(event) => setNavigationScrollOffset(scrollKey, event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={80}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} />}
      data={clientsVisibles}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={<>
        {missionsEnabled ? <View style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: MISSION_COLORS.accentSoft }}><Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, fontFamily: FONTS.bold }}>Glisser vers la droite → Missions</Text></View> : null}
        <FadeUp style={{ marginBottom: 14 }}>
          <View style={{ minHeight: 50, borderRadius: 16, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', flexDirection: 'row', alignItems: 'center', paddingLeft: 14, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 }}>
            <CvcIcon name="search" size={18} color="#98A2B3" strokeWidth={2.1} />
            <TextInput
              value={quickSearch}
              onChangeText={setQuickSearch}
              onSubmitEditing={openDirectory}
              placeholder="Client, site, ville, adresse, équipement…"
              placeholderTextColor="#98A2B3"
              style={{ flex: 1, color: COLORS.ink || '#17212B', fontSize: 14.5, paddingVertical: 12, marginLeft: 9 }}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity accessibilityLabel="Lancer la recherche" onPress={openDirectory} style={{ minWidth: 50, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <CvcIcon name="chevron-right" size={19} color={COLORS.orange || '#E86F2D'} strokeWidth={2.1} />
            </TouchableOpacity>
          </View>
        </FadeUp>

        {visitesARattacher.length > 0 && <>
          <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>À rattacher</Text>
          {visitesARattacher.map((v, i) => <FadeUp key={v.id} delay={Math.min(i, 4) * 30}><TouchableOpacity
            style={styles.card}
            onPressIn={() => prewarmVisitInBackground(v, { preview: v })}
            onPress={() => ouvrirVisite(v)}
            onLongPress={() => confirmerSuppressionVisite(v)}
          >
            <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={40}><CvcIcon name="flash" size={19} color={COLORS.orangeDark} /></IconOrb>
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.cardTitle}>{v.nom_site}</Text><Text style={styles.cardSub}>Visite rapide · {v.progression_pct}%</Text></View>
            <TouchableOpacity accessibilityLabel={`Rattacher ${v.nom_site} à un client`} onPress={(e) => { e?.stopPropagation?.(); setVisiteARattacher(v); }} style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: COLORS.amberBg, borderWidth: 1, borderColor: 'rgba(180,83,9,0.3)' }}><Text style={{ fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.amber }}>Rattacher</Text></TouchableOpacity>
          </TouchableOpacity></FadeUp>)}
          <View style={{ height: 12 }} />
        </>}

        {reprise ? <FadeUp delay={50} style={{ marginBottom: 6 }}>
          <TouchableOpacity activeOpacity={0.85} accessibilityLabel={`Reprendre la visite ${reprise.nom_client}`} onPressIn={() => prewarmVisitInBackground(reprise, { preview: reprise })} onPress={() => ouvrirVisite(reprise)} onLongPress={() => confirmerSuppressionVisite(reprise)}>
            <GlassCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
                <View style={{ width: 64, height: 64 }}>
                  <ProgressRing pct={reprise.progression_pct} size={64} strokeWidth={6} accent={COLORS.orange} />
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONTS.black, fontSize: 14, color: COLORS.ink }}>{reprise.progression_pct}%</Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.inkFaint }}>Reprendre</Text>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink, marginTop: 2 }}>{reprise.nom_client}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 }}>{reprise.nom_site}</Text>
                </View>
                <CvcIcon name="chevron-right" size={18} color={COLORS.orangeDark} strokeWidth={2.3} />
              </View>
            </GlassCard>
          </TouchableOpacity>
        </FadeUp> : null}

        {autresVisites.length > 0 && <>
          <Text style={[styles.sectionLabel, { marginTop: 14, marginBottom: 8 }]}>Visites en cours</Text>
          {autresVisites.map((v, i) => <FadeUp key={v.id} delay={Math.min(i, 4) * 30}><TouchableOpacity
            style={styles.card}
            onPressIn={() => prewarmVisitInBackground(v, { preview: v })}
            onPress={() => ouvrirVisite(v)}
          >
            <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={40}><CvcIcon name="clock" size={19} color={COLORS.orangeDark} /></IconOrb>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{v.nom_client}</Text><Text style={styles.cardSub}>{v.nom_site}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{v.progression_pct}%</Text></View>
            <TouchableOpacity accessibilityLabel="Supprimer cette visite" style={styles.deleteVisiteBtn} onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionVisite(v); }}><CvcIcon name="trash" size={13} color={COLORS.red} /></TouchableOpacity>
          </TouchableOpacity></FadeUp>)}
        </>}

        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity activeOpacity={1} delayLongPress={4000} onLongPress={onR1LongPress}><Text style={styles.sectionLabel}>Clients locaux</Text></TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Ajouter un client" onPress={() => setModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <CvcIcon name="plus" size={13} color={COLORS.orangeDark} strokeWidth={2.2} /><Text style={styles.addLink}>Ajouter</Text>
          </TouchableOpacity>
        </View>
      </>}
      renderItem={({ item }) => <TouchableOpacity
        style={styles.card}
        onPressIn={() => prewarmClientSites(item.id).catch(() => {})}
        onPress={() => navigation.navigate('ClientSites', { clientId: item.id, nomClient: item.nom })}
      >
        <PatrimoineThumbnail uri={item.image_uri} size={54} radius={10} />
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom}</Text>{item.code_exploitant ? <Text style={styles.cardSub}>{item.code_exploitant}</Text> : null}</View>
        <TouchableOpacity accessibilityLabel={`Options pour ${item.nom}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={(e) => { e?.stopPropagation?.(); Alert.alert(item.nom, undefined, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer le client…', style: 'destructive', onPress: () => confirmerSuppressionClient(item) }]); }} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}><CvcIcon name="more" size={20} color={COLORS.inkSoft} /></TouchableOpacity>
        <CvcIcon name="chevron-right" size={18} color={COLORS.orangeDark} strokeWidth={2.1} />
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><EmptyIcon name="local" /><Text style={styles.emptyText}>Aucun client local</Text><Text style={styles.emptySub}>Utilise la recherche ci-dessus pour retrouver un client ou un site synchronisé, ou crée un client manuellement.</Text></View>}
    />

    <AttachVisitSheet
      visible={!!visiteARattacher}
      visiteId={visiteARattacher?.id}
      nomSiteActuel={visiteARattacher?.nom_site || ''}
      onClose={() => setVisiteARattacher(null)}
      onAttached={() => { if (visiteARattacher?.id) forgetVisitRuntime(visiteARattacher.id); setVisiteARattacher(null); charger().catch(() => {}); }}
    />

    <Modal visible={modalVisible} transparent animationType="fade">
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Nouveau client</Text>
        <TextInput style={styles.input} placeholder="Nom du client" value={nouveauNom} onChangeText={setNouveauNom} />
        <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Code exploitant (optionnel)" value={nouveauCode} onChangeText={setNouveauCode} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={ajouterClient}><ButtonGlow /><Text style={styles.btnPrimaryText}>{creationClient ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Import Excel en lot</Text>
        {importBatch ? <ScrollView style={{ maxHeight: 430 }}>{importBatch.analyses.map((a, index) => <View key={`${a.sourceId || a.nomFichier}-${index}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line }}><Text style={styles.importFileName}>{a.nomFichier}</Text><Text style={styles.importSiteTitle}>{a.client} · {a.site}</Text></View>)}</ScrollView> : null}
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setImportBatch(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={confirmerImport}><ButtonGlow /><Text style={styles.btnPrimaryText}>{importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

export { HomeScreen };
