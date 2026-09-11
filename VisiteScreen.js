/** Écran Visite — pager natif, swipe interactif et panneaux gardés chauds. */
import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';
import { COLORS, styles } from './styles.js';
import { PhotoReferenceAccess } from './PhotoReferenceAccess.js';
import { IntranetVisitSyncControl } from './IntranetVisitSync.js';
import { getVisite, getNote, upsertNote, getDb } from './db.js';
import { ajouterRemarqueVisite } from './remarkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { recalculerProgressionVisite } from './visitProgressDb.js';
import { OptimizedRegulationPanel, prechargerRegulation, invaliderCacheRegulation } from './OptimizedRegulationPanel.js';
import { OptimizedRelevesPanel } from './OptimizedRelevesPanel.js';
import { OptimizedPhotoPanel } from './OptimizedPhotoPanel.js';
import { GuidedEquipmentPanel } from './GuidedEquipmentPanel.js';
import { OptimizedRemarksPanel } from './OptimizedRemarksPanel.js';
import { TrameGenericPanel, prechargerDonneesTrameGenerique, invaliderCacheTrameGenerique } from './TrameGenericPanel.js';
import { VmcCaissonManager, chargerCaissonsVmc } from './VmcCaissonManager.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function chargerExcelExportModule(){return require('./excelExport.js');}
function chargerPreAllumageReportModule(){return require('./preAllumageReportExporter.js');}
const SPECIAL_PANEL_DEFAULTS = ['p-regulation', 'p-releves', 'p-equip', 'p-remarques', 'p-photos'];
const HEAVY_LAZY_PANELS = new Set(['p-equip', 'p-releves']);
const PAGER_PRUNE_DELAY_MS = 700;

const VisitPanelHost = memo(function VisitPanelHost({
  visiteId,
  panelId,
  sections,
  special,
  onSaved,
  tabOrder,
  panelLabels,
  panels,
  intranetLinked,
}) {
  if (special) {
    if (panelId === 'p-regulation') return <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} />;
    if (panelId === 'p-releves') return <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} />;
    if (panelId === 'p-equip') return <GuidedEquipmentPanel visiteId={visiteId} />;
    if (panelId === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} tabOrder={tabOrder} panelLabels={panelLabels} panels={panels} intranetLinked={intranetLinked} />;
    if (panelId === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
  }
  return <TrameGenericPanel visiteId={visiteId} panelId={panelId} sections={sections} onSaved={onSaved} />;
});

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const { width } = useWindowDimensions();
  const modeTablette = width >= 900;
  const pagerWidth = Math.max(1, modeTablette ? width - 205 : width);
  const pagerWidthRef = useRef(pagerWidth);
  pagerWidthRef.current = pagerWidth;

  const [visite, setVisite] = useState(null);
  const [vmcCaissons, setVmcCaissons] = useState([]);
  const [activeTab, setActiveTab] = useState('p-infos');
  const activeTabRef = useRef('p-infos');
  const tabOrderRef = useRef([]);
  const progressionTimerRef = useRef(null);
  const transitionRef = useRef(false);
  const pagerX = useRef(new Animated.Value(0)).current;
  const gestureStartIndexRef = useRef(0);
  const finishSwipeRef = useRef(null);
  const ensureMountedRef = useRef(null);
  const pagerPruneTimerRef = useRef(null);
  const stickyHeavyPanelsRef = useRef(new Set());
  const mountedPanelIdsRef = useRef(new Set(['p-infos']));
  const [mountedPanelIds, setMountedPanelIds] = useState(() => new Set(['p-infos']));
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  const tabOrderBase = trame.ui?.tabOrder || [];
  const panelLabelsBase = trame.ui?.labels || {};
  const panels = trame.ui?.panels || {};
  const specialPanels = useMemo(() => new Set(trame.ui?.specialPanels || SPECIAL_PANEL_DEFAULTS), [trame.id, trame.ui?.specialPanels]);
  const vmcActifs = useMemo(() => new Set(
    trame.id === 'vmc'
      ? (vmcCaissons.length ? vmcCaissons.filter((c) => c.actif).map((c) => c.panelId) : ['p-vmc-c1'])
      : []
  ), [trame.id, vmcCaissons]);
  const tabOrder = useMemo(() => trame.id === 'vmc'
    ? tabOrderBase.filter((pid) => !/^p-vmc-c[1-6]$/.test(pid) || vmcActifs.has(pid))
    : tabOrderBase, [trame.id, tabOrderBase, vmcActifs]);
  const panelLabels = useMemo(() => trame.id === 'vmc'
    ? {
        ...panelLabelsBase,
        ...Object.fromEntries(vmcCaissons.filter((c) => c.actif).map((c) => [c.panelId, `N°${c.index} · ${c.nom}`])),
      }
    : panelLabelsBase, [trame.id, panelLabelsBase, vmcCaissons]);
  const tabsReels = useMemo(() => tabOrder.filter((t) => t !== 'SEP'), [tabOrder]);
  const tabsSignature = tabsReels.join('|');

  const addMountedPanels = useCallback((ids, { stickyHeavy = false } = {}) => {
    const next = new Set(mountedPanelIdsRef.current);
    let changed = false;
    for (const raw of ids || []) {
      const id = String(raw || '');
      if (!id) continue;
      if (!next.has(id)) { next.add(id); changed = true; }
      if (stickyHeavy && HEAVY_LAZY_PANELS.has(id)) stickyHeavyPanelsRef.current.add(id);
    }
    if (changed) {
      mountedPanelIdsRef.current = next;
      setMountedPanelIds(next);
    }
    return changed;
  }, []);
  ensureMountedRef.current = addMountedPanels;

  const desiredPagerPanels = useCallback((tabId) => {
    const tabs = tabOrderRef.current;
    const index = tabs.indexOf(tabId);
    const desired = new Set();
    if (index >= 0) {
      const candidates = [tabs[index - 1], tabs[index], tabs[index + 1]].filter(Boolean);
      for (const panelId of candidates) {
        if (panelId === tabId || !HEAVY_LAZY_PANELS.has(panelId) || stickyHeavyPanelsRef.current.has(panelId)) desired.add(panelId);
      }
    }
    for (const panelId of stickyHeavyPanelsRef.current) {
      if (tabs.includes(panelId)) desired.add(panelId);
    }
    return desired;
  }, []);

  const warmPagerWindow = useCallback((tabId) => {
    if (pagerPruneTimerRef.current) clearTimeout(pagerPruneTimerRef.current);
    const desired = desiredPagerPanels(tabId);
    addMountedPanels([...desired]);
    pagerPruneTimerRef.current = setTimeout(() => {
      const keep = desiredPagerPanels(activeTabRef.current);
      mountedPanelIdsRef.current = keep;
      setMountedPanelIds(keep);
      pagerPruneTimerRef.current = null;
    }, PAGER_PRUNE_DELAY_MS);
  }, [addMountedPanels, desiredPagerPanels]);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tabOrderRef.current = tabsReels; }, [tabsSignature]);
  useEffect(() => () => {
    if (progressionTimerRef.current) clearTimeout(progressionTimerRef.current);
    if (pagerPruneTimerRef.current) clearTimeout(pagerPruneTimerRef.current);
    pagerX.stopAnimation();
    invaliderCacheTrameGenerique(visiteId);
    invaliderCacheRegulation(visiteId);
  }, [pagerX, visiteId]);

  useEffect(() => {
    if (!visite || tabsReels.length === 0) return;
    tabOrderRef.current = tabsReels;
    let current = activeTabRef.current;
    if (!tabsReels.includes(current)) {
      current = tabsReels[0];
      activeTabRef.current = current;
      setActiveTab(current);
    }
    const index = tabsReels.indexOf(current);
    transitionRef.current = false;
    pagerX.stopAnimation();
    pagerX.setValue(-Math.max(0, index) * pagerWidth);
    addMountedPanels([current], { stickyHeavy: true });
    warmPagerWindow(current);
  }, [visite?.trame_id, tabsSignature, pagerWidth, addMountedPanels, warmPagerWindow, pagerX]);

  const completeTabChange = useCallback((prochain) => {
    activeTabRef.current = prochain;
    setActiveTab(prochain);
    transitionRef.current = false;
    requestAnimationFrame(() => warmPagerWindow(prochain));
  }, [warmPagerWindow]);

  const animateToTab = useCallback((prochain, duration = 145) => {
    const tabs = tabOrderRef.current;
    const targetIndex = tabs.indexOf(prochain);
    if (targetIndex < 0) { transitionRef.current = false; return; }
    const wasMounted = mountedPanelIdsRef.current.has(prochain);
    addMountedPanels([prochain], { stickyHeavy: true });
    const start = () => {
      Animated.timing(pagerX, {
        toValue: -targetIndex * pagerWidthRef.current,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) completeTabChange(prochain);
        else transitionRef.current = false;
      });
    };
    if (wasMounted) start(); else requestAnimationFrame(start);
  }, [addMountedPanels, completeTabChange, pagerX]);

  const changerOnglet = useCallback((prochain, anime = true) => {
    if (!prochain || prochain === activeTabRef.current || transitionRef.current) return;
    Keyboard.dismiss();
    const tabs = tabOrderRef.current;
    const from = tabs.indexOf(activeTabRef.current);
    const to = tabs.indexOf(prochain);
    if (from < 0 || to < 0) return;
    const wasMounted = mountedPanelIdsRef.current.has(prochain);
    addMountedPanels([prochain], { stickyHeavy: true });

    if (!anime || Math.abs(to - from) !== 1 || pagerWidthRef.current <= 0) {
      transitionRef.current = true;
      const commit = () => {
        pagerX.stopAnimation();
        pagerX.setValue(-to * pagerWidthRef.current);
        completeTabChange(prochain);
      };
      if (wasMounted) commit(); else requestAnimationFrame(commit);
      return;
    }

    transitionRef.current = true;
    animateToTab(prochain, 155);
  }, [addMountedPanels, animateToTab, completeTabChange, pagerX]);

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
    const idx = Math.max(0, Math.min(tabs.length - 1, gestureStartIndexRef.current));
    const w = pagerWidthRef.current;
    const threshold = Math.max(54, w * 0.12);
    const versSuivant = g.dx < -threshold || g.vx < -0.48;
    const versPrecedent = g.dx > threshold || g.vx > 0.48;
    const prochain = versSuivant && idx < tabs.length - 1 ? tabs[idx + 1] : versPrecedent && idx > 0 ? tabs[idx - 1] : null;

    if (!prochain) {
      Animated.spring(pagerX, { toValue: -idx * w, speed: 28, bounciness: 0, useNativeDriver: true }).start(() => {
        transitionRef.current = false;
        warmPagerWindow(activeTabRef.current);
      });
      return;
    }

    animateToTab(prochain, 135);
  }, [animateToTab, pagerX, warmPagerWindow]);
  finishSwipeRef.current = terminerSwipe;

  const swipeHandlers = useRef(null);
  if (!swipeHandlers.current) {
    swipeHandlers.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && Math.abs(g.dx) > 9 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        const tabs = tabOrderRef.current;
        gestureStartIndexRef.current = Math.max(0, tabs.indexOf(activeTabRef.current));
        transitionRef.current = true;
        pagerX.stopAnimation();
      },
      onPanResponderMove: (_evt, g) => {
        const tabs = tabOrderRef.current;
        const idx = Math.max(0, Math.min(tabs.length - 1, gestureStartIndexRef.current));
        const w = pagerWidthRef.current;
        let dx = g.dx;
        if ((idx === 0 && dx > 0) || (idx === tabs.length - 1 && dx < 0)) dx *= 0.24;
        const target = dx < -36 && idx < tabs.length - 1 ? tabs[idx + 1] : dx > 36 && idx > 0 ? tabs[idx - 1] : null;
        if (target && !mountedPanelIdsRef.current.has(target)) ensureMountedRef.current?.([target]);
        pagerX.setValue(-idx * w + dx);
      },
      onPanResponderRelease: (_evt, g) => finishSwipeRef.current?.(g),
      onPanResponderTerminate: () => {
        const idx = Math.max(0, gestureStartIndexRef.current);
        Animated.spring(pagerX, { toValue: -idx * pagerWidthRef.current, speed: 28, bounciness: 0, useNativeDriver: true }).start(() => {
          transitionRef.current = false;
        });
      },
      onPanResponderTerminationRequest: () => false,
    });
  }

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
  const [reportExporting, setReportExporting] = useState(false);
  const exporter = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      Keyboard.dismiss();
      await attendre(180);
      const resultat = await chargerExcelExportModule().exporterEtPartager(visiteId);
      if (resultat?.stats?.reseauxSupplementaires > 0) {
        Alert.alert('Export complet', `${resultat.stats.reseauxSupplementaires} réseau(x) supplémentaire(s) ont été placés dans la feuille « RESEAUX COMPLEMENTAIRES » afin de ne perdre aucune donnée.`);
      }
    } catch (e) {
      Alert.alert('Erreur export', String(e.message || e));
    } finally { setExporting(false); }
  };

  const genererRapportPreAllumage = async (format) => {
    if (reportExporting) return;
    setReportExporting(true);
    try {
      Keyboard.dismiss();
      await attendre(120);
      const resultat = await chargerPreAllumageReportModule().exporterRapportPreAllumage(visiteId, format);
      if (!resultat?.annule) Alert.alert('Rapport Pré-allumage généré', `${resultat.nom} a été enregistré dans le dossier choisi.`);
    } catch (e) {
      Alert.alert('Génération impossible', String(e?.message || e));
    } finally { setReportExporting(false); }
  };

  const choisirFormatRapportPreAllumage = () => {
    if (reportExporting) return;
    Alert.alert('Rapport Pré-allumage', 'Choisis le format à générer.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Word', onPress: () => genererRapportPreAllumage('word') },
      { text: 'PDF', onPress: () => genererRapportPreAllumage('pdf') },
    ]);
  };

  const enregistrerAnomalie = async () => {
    const texte = anomalieTxt.trim();
    if (!texte) return;
    await ajouterRemarqueVisite(visiteId, { poste: 'Observation', prestation: texte, origine: 'Anomalie rapide' });
    setAnomalieTxt('');
    setAnomalieVisible(false);
    if (tabsReels.includes('p-remarques')) changerOnglet('p-remarques');
  };

  if (!visite) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /></View>;

  const intranetLinked = Boolean(visite?.api_remote_local_id) && Number(visite?.api_is_historical) !== 1;
  const pagerPanels = tabsReels.filter((panelId) => panelId === activeTab || mountedPanelIds.has(panelId));
  const animatedContent = (
    <View style={{ flex: 1, overflow: 'hidden' }} {...swipeHandlers.current.panHandlers}>
      {pagerPanels.map((panelId) => {
        const index = tabsReels.indexOf(panelId);
        return <Animated.View
          key={panelId}
          pointerEvents={panelId === activeTab ? 'auto' : 'none'}
          style={{ position: 'absolute', top: 0, bottom: 0, left: index * pagerWidth, width: pagerWidth, transform: [{ translateX: pagerX }] }}
        >
          <VisitPanelHost
            visiteId={visiteId}
            panelId={panelId}
            sections={panels[panelId]}
            special={specialPanels.has(panelId)}
            onSaved={onSaved}
            tabOrder={tabOrder}
            panelLabels={panelLabels}
            panels={panels}
            intranetLinked={intranetLinked}
          />
        </Animated.View>;
      })}
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
          {trame.id === 'pre_allumage' ? <TouchableOpacity style={styles.noteBtn} onPress={choisirFormatRapportPreAllumage} disabled={reportExporting}><Text style={styles.noteBtnText}>{reportExporting ? 'Rapport…' : 'PDF / Word'}</Text></TouchableOpacity> : null}
          <TouchableOpacity style={styles.exportBtn} onPress={exporter} disabled={exporting}><Text style={styles.exportBtnText}>{exporting ? '...' : `Excel ${trame.nom}`}</Text></TouchableOpacity>
        </View>
        <View style={styles.progressRow}><View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${visite.progression_pct}%` }]} /></View><Text style={styles.progressPct}>{visite.progression_pct}%</Text></View>
        {!(trame.id === 'pre_allumage' && activeTab === 'p-pa-batiments') ? <PhotoReferenceAccess visiteId={visiteId} remoteLocalId={visite.api_remote_local_id || null} /> : null}
        <IntranetVisitSyncControl visite={visite} onVisitChanged={charger} />
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
