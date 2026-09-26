/** Niveau Site -> Locaux : un local ouvre uniquement son historique de visites. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles, FONTS } from './styles.js';
import { getDb, uuidv4 } from './db.js';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';
import { peekSiteLocals, prewarmLocalVisits, prewarmSiteLocals } from './navigationPrewarm.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { EmptyIcon } from './EmptyState.js';

function SiteLocalsScreen({ route, navigation }) {
  const { siteId, nomSite, clientId, nomClient } = route?.params || {};
  const listRef = useRef(null);
  const scrollKey = `site-locals:${String(siteId || '')}`;
  const initialBundle = peekSiteLocals(siteId);
  const [locaux, setLocaux] = useState(() => initialBundle?.rows || []);
  const [legacyCount, setLegacyCount] = useState(() => Number(initialBundle?.legacyCount || 0));
  const [loading, setLoading] = useState(() => !initialBundle);
  const [search, setSearch] = useState('');
  const [creationVisible, setCreationVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [creationEnCours, setCreationEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!siteId) return;
    if (!peekSiteLocals(siteId)) setLoading(true);
    try {
      const bundle = await prewarmSiteLocals(siteId, { force: true });
      setLocaux(bundle?.rows || []);
      setLegacyCount(Number(bundle?.legacyCount || 0));
    } catch (error) {
      Alert.alert('Locaux', String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(scrollKey).then((state) => {
      if (!alive) return;
      const offset = Number(state?.scrollY || 0);
      if (offset) setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    }).catch(() => {});
    return () => { alive = false; };
  }, [scrollKey]);

  const locauxFiltres = useMemo(() => {
    const q = String(search || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!q) return locaux;
    return locaux.filter((local) => [local.nom, local.remote_designation, local.remote_trame_nom, local.type_code]
      .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q));
  }, [locaux, search]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(scrollKey);
    if (!offset || !locauxFiltres.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: false }), 40);
    return () => clearTimeout(timer);
  }, [scrollKey, locauxFiltres.length]);

  const ouvrirLocal = (local) => {
    navigation.navigate('SiteVisites', {
      siteId,
      nomSite,
      clientId,
      nomClient,
      installationId: local.installation_id,
      nomLocal: local.nom || local.remote_designation || 'Local technique',
      apiRemoteLocalId: local.remote_local_id ? String(local.remote_local_id) : null,
      apiRemoteClientId: local.remote_client_id ? String(local.remote_client_id) : null,
      apiRemoteLocalDesignation: local.remote_designation || local.nom || 'Local technique',
      apiRemoteTrameId: local.remote_trame_id || null,
      apiRemoteTrameNom: local.remote_trame_nom || null,
    });
  };

  const creerLocal = async () => {
    const nom = String(nouveauNom || '').trim();
    if (!nom || creationEnCours) return;
    setCreationEnCours(true);
    try {
      const db = await getDb();
      const id = uuidv4();
      await db.runAsync(
        `INSERT INTO installations(id,site_id,type_code,nom,actif)
         VALUES(?,?,'installation_technique',?,1)`,
        [id, String(siteId), nom]
      );
      setNouveauNom('');
      setCreationVisible(false);
      await charger();
    } catch (error) {
      Alert.alert('Création impossible', String(error?.message || error));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirVisitesNonRattachees = () => navigation.navigate('SiteVisites', {
    siteId,
    nomSite,
    clientId,
    nomClient,
    nomLocal: 'Visites non rattachées',
    legacyOnly: true,
  });

  return <View style={{ flex: 1 }}>
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      onScroll={(event) => setNavigationScrollOffset(scrollKey, event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={80}
      contentContainerStyle={[styles.content, { paddingBottom: 96 }]}
      data={locauxFiltres}
      keyExtractor={(item) => item.installation_id}
      initialNumToRender={14}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={24}
      windowSize={7}
      removeClippedSubviews={false}
      ListHeaderComponent={<View>
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionLabel}>Site</Text>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 18 }}>{nomSite || 'Site'}</Text>
          {nomClient ? <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>{nomClient}</Text> : null}
        </View>

        <View style={{ padding: 13, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: 'rgba(255,255,255,0.82)', marginBottom: 15 }}>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 13 }}>Choisis un local</Text>
          <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>Chaque local possède son propre historique. Une nouvelle visite créée ensuite reste rattachée uniquement à ce local.</Text>
        </View>

        {legacyCount > 0 ? <TouchableOpacity onPress={ouvrirVisitesNonRattachees} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E7C77A', backgroundColor: '#FFF8E7', marginBottom: 14 }}>
          <Text style={{ color: '#7A5700', fontFamily: FONTS.black, fontSize: 12 }}>{legacyCount} ancienne{legacyCount > 1 ? 's' : ''} visite{legacyCount > 1 ? 's' : ''} sans local</Text>
          <Text style={{ color: '#7A5700', fontSize: 11, marginTop: 3 }}>Elles restent accessibles sans être attribuées automatiquement à un mauvais local. ›</Text>
        </TouchableOpacity> : null}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Locaux</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12 }}>{locauxFiltres.length}/{locaux.length}</Text>
        </View>
        <TextInput
          style={[styles.input, { marginTop: 8, marginBottom: 10 }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un local, une trame…"
          autoCorrect={false}
        />
      </View>}
      renderItem={({ item }) => {
        const label = item.nom || item.remote_designation || 'Local technique';
        const visitCount = Number(item.visit_count || 0);
        return <TouchableOpacity
          style={styles.card}
          activeOpacity={0.72}
          onPressIn={() => prewarmLocalVisits({ siteId, installationId: item.installation_id }).catch(() => {})}
          onPress={() => ouvrirLocal(item)}
        >
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
            <CvcIcon name="local" size={21} color={COLORS.orangeDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{label}</Text>
            <Text style={styles.cardSub}>
              {visitCount ? `${visitCount} visite${visitCount > 1 ? 's' : ''}${item.latest_visit_date ? ` · dernière ${String(item.latest_visit_date).slice(0, 10)}` : ''}` : 'Aucune visite'}
            </Text>
            {item.remote_trame_nom ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>Trame Intranet · {item.remote_trame_nom}</Text> : null}
          </View>
          {item.remote_local_id ? <View style={[styles.badge, styles.badgeActif]}><Text style={[styles.badgeText, styles.badgeTextActif]}>Intranet</Text></View> : null}
          <CvcIcon name="chevron-right" size={25} color={'#98A2B3'} strokeWidth={2.1} />
        </TouchableOpacity>;
      }}
      ListEmptyComponent={loading
        ? <View style={{ paddingVertical: 36 }}><ActivityIndicator color={COLORS.orange} /></View>
        : <View style={styles.empty}><EmptyIcon name="local" /><Text style={styles.emptyText}>Aucun local sur ce site.</Text><Text style={styles.emptySub}>Crée un local METRA ou utilise « Locaux Intranet » depuis la fiche du site.</Text></View>}
    />

    <View style={styles.fabBar}>
      <TouchableOpacity style={[styles.btnPrimary, styles.fabButton]} onPress={() => setCreationVisible(true)}><ButtonGlow />
        <Text style={styles.btnPrimaryText}>+ Nouveau local</Text>
      </TouchableOpacity>
    </View>

    <Modal visible={creationVisible} transparent animationType="fade" onRequestClose={() => !creationEnCours && setCreationVisible(false)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Nouveau local METRA</Text>
        <Text style={{ color: COLORS.muted, fontSize: 11.5, marginBottom: 11 }}>Le local est créé uniquement dans METRA. La création d'un local Intranet reste gérée par l'écran « Locaux Intranet » existant.</Text>
        <TextInput autoFocus style={styles.input} placeholder="Ex. Chaufferie, SST 1, Local VMC…" value={nouveauNom} onChangeText={setNouveauNom} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} disabled={creationEnCours} onPress={() => setCreationVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} disabled={!nouveauNom.trim() || creationEnCours} onPress={creerLocal}><ButtonGlow /><Text style={styles.btnPrimaryText}>{creationEnCours ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

export { SiteLocalsScreen };
