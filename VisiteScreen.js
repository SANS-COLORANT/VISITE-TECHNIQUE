/** Écran Visite — navigation fluide, swipe interactif et panneaux virtualisés. */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getVisite, getNote, upsertNote, getDb } from './db.js';
import { ajouterRemarqueVisite } from './remarkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { recalculerProgressionVisite } from './visitProgressDb.js';
import { exporterEtPartager } from './excelExport.js';
import { OptimizedRegulationPanel, prechargerRegulation, invaliderCacheRegulation } from './OptimizedRegulationPanel.js';
import { OptimizedRelevesPanel } from './OptimizedRelevesPanel.js';
import { OptimizedPhotoPanel } from './OptimizedPhotoPanel.js';
import { GuidedEquipmentPanel } from './GuidedEquipmentPanel.js';
import { OptimizedRemarksPanel } from './OptimizedRemarksPanel.js';
import { TrameGenericPanel, prechargerDonneesTrameGenerique, invaliderCacheTrameGenerique } from './TrameGenericPanel.js';
import { VmcCaissonManager, chargerCaissonsVmc } from './VmcCaissonManager.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SPECIAL_PANEL_DEFAULTS = ['p-regulation', 'p-releves', 'p-equip', 'p-remarques', 'p-photos'];

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const { width } = useWindowDimensions();
  const modeTablette = width >= 900;
  const [visite, setVisite] = useState(null);
  const [vmcCaissons, setVmcCaissons] = useState([]);
  const [activeTab, setActiveTab] = useState('p-infos');
  const activeTabRef = useRef('p-infos');
  const tabOrderRef = useRef([]);
  const progressionTimerRef = useRef(null);
  const transitionRef = useRef(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  const tabOrderBase = trame.ui?.tabOrder || [];
  const panelLabelsBase = trame.ui?.labels || {};
  const panels = trame.ui?.panels || {};
  const specialPanels = new Set(trame.ui?.specialPanels || SPECIAL_PANEL_DEFAULTS);
  const vmcActifs = new Set(
    trame.id === 'vmc'
      ? (vmcCaissons.length ? vmcCaissons.filter((c) => c.actif).map((c) => c.panelId) : ['p-vmc-c1'])
      : []
  );
  const tabOrder = trame.id === 'vmc'
    ? tabOrderBase.filter((pid) => !/^p-vmc-c[1-6]$/.test(pid) || vmcActifs.has(pid))
    : tabOrderBase;
  const panelLabels = trame.id === 'vmc'
    ? {
        ...panelLabelsBase,
        ...Object.fromEntries(vmcCaissons.filter((c) => c.actif).map((c) => [c.panelId, `N°${c.index} · ${c.nom}`])),
      }
    : panelLabelsBase;
  const tabsReels = tabOrder.filter((t) => t !== 'SEP');

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tabOrderRef.current = tabsReels; }, [trame.id, tabOrder.join('|')]);
  useEffect(() => () => {
    if (progressionTimerRef.current) clearTimeout(progressionTimerRef.current);
    invaliderCacheTrameGenerique(visiteId);
    invaliderCacheRegulation(visiteId);
  }, [visiteId]);

  useEffect(() => {
    if (!visite || tabsReels.length === 0) return;
    if (!tabsReels.includes(activeTabRef.current)) {
      activeTabRef.current = tabsReels[0];
      setActiveTab(tabsReels[0]);
    }
  }, [visite?.trame_id, tabsReels.join('|')]);

  const basculerApresSortie = useCallback((prochain, direction) => {
    activeTabRef.current = prochain;
    setActiveTab(prochain);
    translateX.setValue(direction > 0 ? width : -width);
    requestAnimationFrame(() => {
      Animated.timing(translateX, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { transitionRef.current = false; });
    });
  }, [translateX, width]);

  const changerOnglet = useCallback((prochain, anime = true) => {
    if (!prochain || prochain === activeTabRef.current || transitionRef.current) return;
    Keyboard.dismiss();
    const tabs = tabOrderRef.current;
    const from = tabs.indexOf(activeTabRef.current);
    const to = tabs.indexOf(prochain);
    if (!anime || from < 0 || to < 0 || width <= 0) {
      activeTabRef.current = prochain;
      setActiveTab(prochain);
      translateX.setValue(0);
      return;
    }
    const direction = to > from ? 1 : -1;
    transitionRef.current = true;
    Animated.timing(translateX, {
      toValue: direction > 0 ? -width : width,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => basculerApresSortie(prochain, direction));
  }, [basculerApresSortie, translateX, width]);

  const retourSecurise = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => onBack?.(), 0);
  }, [onBack]);

  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    const v = await getVisite(visiteId);
    const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';
    const caissons = estVmc ? await chargerCaissonsVmc(visiteId) : [];
    const progression = await recalculerProgressionVisite(db, visiteId);
    invaliderCacheTrameGenerique(visiteId);
    invaliderCacheRegulation(visiteId);
    await Promise.all([
      prechargerDonneesTrameGenerique(visiteId, true),
      prechargerRegulation(visiteId, true),
    ]);
    setVmcCaissons(caissons);
    setVisite(v ? { ...v, progression_pct: progression } : v);
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  const onSaved = useCallback(() => {
    if (progressionTimerRef.current) clearTimeout(progressionTimerRef.current);
    progressionTimerRef.current = setTimeout(async () => {
      try {
        const db = await getDb();
        const progression = await recalculerProgressionVisite(db, visiteId);
        setVisite((actuelle) => actuelle ? { ...actuelle, progression_pct: progression } : actuelle);
      } catch (e) {
        console.warn('Progression visite non recalculée', e);
      } finally {
        progressionTimerRef.current = null;
      }
    }, 1200);
  }, [visiteId]);

  const onCaissonsChange = useCallback((next) => {
    setVmcCaissons(next || []);
    invaliderCacheTrameGenerique(visiteId);
    onSaved();
  }, [visiteId, onSaved]);

  const terminerSwipe = useCallback((g) => {
    const tabs = tabOrderRef.current;
    const idx = tabs.indexOf(activeTabRef.current);
    const threshold = Math.max(70, width * 0.16);
    const versSuivant = g.dx < -threshold || g.vx < -0.55;
    const versPrecedent = g.dx > threshold || g.vx > 0.55;
    const prochain = versSuivant && idx < tabs.length - 1 ? tabs[idx + 1] : versPrecedent && idx > 0 ? tabs[idx - 1] : null;

    if (!prochain) {
      Animated.spring(translateX, { toValue: 0, speed: 24, bounciness: 0, useNativeDriver: true }).start();
      return;
    }

    const direction = versSuivant ? 1 : -1;
    transitionRef.current = true;
    Animated.timing(translateX, {
      toValue: direction > 0 ? -width : width,
      duration: 130,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => basculerApresSortie(prochain, direction));
  }, [basculerApresSortie, translateX, width]);

  const swipeHandlers = useRef(null);
  swipeHandlers.current = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.45,
    onPanResponderGrant: () => { Keyboard.dismiss(); translateX.stopAnimation(); },
    onPanResponderMove: (_evt, g) => {
      const tabs = tabOrderRef.current;
      const idx = tabs.indexOf(activeTabRef.current);
      let dx = g.dx;
      if ((idx === 0 && dx > 0) || (idx === tabs.length - 1 && dx < 0)) dx *= 0.28;
      translateX.setValue(dx);
    },
    onPanResponderRelease: (_evt, g) => terminerSwipe(g),
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, speed: 24, bounciness: 0, useNativeDriver: true }).start(),
  });

  const ouvrirNote = async () => {
    const note = await getNote(visiteId);
    setNoteTxt(note?.contenu || '');
    setNoteVisible(true);
  };
  const fermerNote = async () => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    await upsertNote(visiteId, noteTxt);
    setNoteVisible(false);
  };

  const noteTimerRef = useRef(null);
  const onChangeNoteTxt = (t) => {
    setNoteTxt(t);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => upsertNote(visiteId, t), 700);
  };

  const [exporting, setExporting] = useState(false);
  const exporter = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      Keyboard.dismiss();
      await attendre(180);
      const resultat = await exporterEtPartager(visiteId);
      if (resultat?.stats?.reseauxSupplementaires > 0) {
        Alert.alert('Export complet', `${resultat.stats.reseauxSupplementaires} réseau(x) supplémentaire(s) ont été placés dans la feuille « RESEAUX COMPLEMENTAIRES » afin de ne perdre aucune donnée.`);
      }
    } catch (e) {
      Alert.alert('Erreur export', String(e.message || e));
    } finally { setExporting(false); }
  };

  const enregistrerAnomalie = async () => {
    const texte = anomalieTxt.trim();
    if (!texte) return;
    await ajouterRemarqueVisite(visiteId, { poste: 'Observation', prestation: texte, origine: 'Anomalie rapide' });
    setAnomalieTxt('');
    setAnomalieVisible(false);
    if (tabsReels.includes('p-remarques')) changerOnglet('p-remarques');
  };

  const contenuActif = () => {
    const pid = activeTab;
    if (specialPanels.has(pid)) {
      if (pid === 'p-regulation') return <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} />;
      if (pid === 'p-releves') return <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} />;
      if (pid === 'p-equip') return <GuidedEquipmentPanel visiteId={visiteId} />;
      if (pid === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} tabOrder={tabOrder} panelLabels={panelLabels} panels={panels} />;
      if (pid === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
    }
    return <TrameGenericPanel visiteId={visiteId} panelId={pid} sections={panels[pid]} onSaved={onSaved} />;
  };

  if (!visite) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /></View>;

  const animatedContent = (
    <View style={{ flex: 1, overflow: 'hidden' }} {...swipeHandlers.current.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>
        {contenuActif()}
      </Animated.View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.visiteTopbar}>
        <View style={styles.visiteHeaderRow}>
          <TouchableOpacity style={styles.visiteBackBtn} onPress={retourSecurise}><Text style={styles.visiteBackBtnText}>←</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{visite.nom_site}</Text>
            <Text style={styles.cardSub}>{visite.nom_client} · {visite.date_visite} · {trame.nom} · {visite.mode_visite === 'express' ? 'Mode Express' : 'Mode complet'}</Text>
          </View>
          <TouchableOpacity style={styles.noteBtn} onPress={ouvrirNote}><Text style={styles.noteBtnText}>Note libre</Text></TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exporter} disabled={exporting}><Text style={styles.exportBtnText}>{exporting ? '...' : `Exporter ${trame.nom}`}</Text></TouchableOpacity>
        </View>
        <View style={styles.progressRow}><View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${visite.progression_pct}%` }]} /></View><Text style={styles.progressPct}>{visite.progression_pct}%</Text></View>
        <TouchableOpacity style={styles.anomalyBtn} onPress={() => setAnomalieVisible(true)}><Text style={styles.anomalyBtnText}>⚠ Ajouter une anomalie, une remarque ou une réserve</Text></TouchableOpacity>
        {visite.mode_visite === 'express' && <Text style={styles.expressHint}>⚡ Données reprises de la visite précédente · index et mesures variables à actualiser</Text>}
        {trame.id === 'vmc' && vmcCaissons.length > 0 ? <VmcCaissonManager visiteId={visiteId} caissons={vmcCaissons} onChange={onCaissonsChange} onNavigate={changerOnglet} /> : null}
        {!modeTablette && <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
          {tabOrder.map((pid, i) => pid === 'SEP' ? <View key={`sep-${i}`} style={styles.tabSep} /> : <TouchableOpacity key={pid} style={styles.tabItem} onPress={() => changerOnglet(pid)}><Text style={[styles.tabItemText, activeTab === pid && styles.tabItemTextActive]}>{panelLabels[pid] || pid}</Text>{activeTab === pid && <View style={styles.tabUnderline} />}</TouchableOpacity>)}
        </ScrollView>}
      </View>

      {modeTablette ? <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 205, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: COLORS.line }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 9 }} showsVerticalScrollIndicator={false}>
            {tabOrder.map((pid, i) => pid === 'SEP' ? <View key={`side-sep-${i}`} style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 8 }} /> : <TouchableOpacity key={pid} onPress={() => changerOnglet(pid)} style={{ minHeight: 43, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 10, marginVertical: 2, justifyContent: 'center', backgroundColor: activeTab === pid ? '#FFF3E8' : 'transparent', borderWidth: activeTab === pid ? 1 : 0, borderColor: activeTab === pid ? '#F3C89B' : 'transparent' }}><Text style={{ fontSize: 13, fontWeight: activeTab === pid ? '800' : '600', color: activeTab === pid ? COLORS.primary : COLORS.text }}>{panelLabels[pid] || pid}</Text></TouchableOpacity>)}
          </ScrollView>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{animatedContent}</View>
      </View> : animatedContent}

      <Modal visible={noteVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Note libre — {trame.nom}</Text>
        <TextInput style={[styles.input, { height: 160, textAlignVertical: 'top' }]} multiline value={noteTxt} onChangeText={onChangeNoteTxt} placeholder="Notes générales sur la visite..." />
        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={fermerNote}><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
      </View></View></Modal>
      <Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter une anomalie</Text><Text style={styles.importHint}>Décris rapidement le constat. La réserve créée sera entièrement modifiable dans la synthèse.</Text>
        <TextInput style={[styles.input, { minHeight: 100, marginTop: 12, textAlignVertical: 'top' }]} multiline autoFocus value={anomalieTxt} onChangeText={setAnomalieTxt} placeholder="Ex. Pompe défaillante, température de départ trop basse…" />
        <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setAnomalieVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrerAnomalie}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
      </View></View></Modal>
    </View>
  );
}

export { VisiteScreen };
