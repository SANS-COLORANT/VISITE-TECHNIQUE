/** Écran Visite — pager natif, swipe interactif et panneaux gardés chauds. */
import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { PhotoReferenceAccess } from './PhotoReferenceAccess.js';
import { IntranetVisitSyncControl } from './IntranetVisitSync.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { IconOrb, GlassCard, ProgressRing } from './premiumChrome.js';
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
import { CompanionTabletModal } from './CompanionTabletModal.js';
import { flushDurableAutosaves } from './durableAutosave.js';
import { recupererPhotosEnAttente } from './photoPersistenceJournal.js';
import { flushNavigationMemory, getNavigationState, hydrateNavigationState, setNavigationState } from './navigationMemory.js';
import { getVisitRuntime, markVisitHot, patchVisitUiState } from './visitRuntimeCache.js';
import { getSaveActivity, subscribeSaveActivity } from './saveActivity.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { prewarmPhotoCaptureContext } from './photoCaptureContext.js';
import { loadVisitPhotos } from './photoRuntimeCache.js';
import { SectionRail, SideSectionList, AvisCounters, VisitActionBar } from './VisitChrome.js';
import { calculerEtatOnglets } from './visitTabStatusDb.js';
import { estVisiteARattacher } from './quickVisitDb.js';
import { AttachVisitSheet } from './AttachVisitSheet.js';

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
  onRegisterLocalSwipe,
}) {
  if (special) {
    if (panelId === 'p-regulation') return <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} />;
    if (panelId === 'p-releves') return <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} />;
    if (panelId === 'p-equip') return <GuidedEquipmentPanel visiteId={visiteId} />;
    if (panelId === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} tabOrder={tabOrder} panelLabels={panelLabels} panels={panels} intranetLinked={intranetLinked} />;
    if (panelId === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
  }
  return <TrameGenericPanel visiteId={visiteId} panelId={panelId} sections={sections} onSaved={onSaved} onRegisterLocalSwipe={onRegisterLocalSwipe} />;
});

function VisiteScreen({ route, onBack }) {
  const { visiteId, visitePreview = null } = route.params;
  const visitNavKey = `visit:${String(visiteId || '')}`;
  const runtimeInitial = getVisitRuntime(visiteId);
  const initialPreview = visitePreview || runtimeInitial?.preview || null;
  const initialTab = runtimeInitial?.ui?.activeTab || getNavigationState(visitNavKey)?.activeTab || 'p-infos';
  const { width, height } = useWindowDimensions();
  const appareilTablette = Math.min(width, height) >= 600;
  const modeTablette = width >= 900;
  const pagerWidth = Math.max(1, modeTablette ? width - 205 : width);
  const pagerWidthRef = useRef(pagerWidth);
  pagerWidthRef.current = pagerWidth;

  const [visite, setVisite] = useState(() => initialPreview ? { ...initialPreview, progression_pct: Number(initialPreview.progression_pct || 0) } : null);
  const [chargementErreur, setChargementErreur] = useState(null); // VISIT_OPEN_FAIL_SAFE_V1 · VISIT_OPEN_FAST_V2
  const [vmcCaissons, setVmcCaissons] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const activeTabRef = useRef(initialTab);
  const desiredRestoreTabRef = useRef(initialTab);
  const [saveActivity, setSaveActivity] = useState(() => getSaveActivity());
  const tabOrderRef = useRef([]);
  const progressionTimerRef = useRef(null);
  const transitionRef = useRef(false);
  const pagerX = useRef(new Animated.Value(0)).current;
  const preAllumageLocalX = useRef(new Animated.Value(0)).current;
  const preAllumageLocalSwipeRef = useRef(null);
  const trameIdRef = useRef(DEFAULT_TRAME_ID);
  const gestureModeRef = useRef('tabs');
  const gestureStartIndexRef = useRef(0);
  const finishSwipeRef = useRef(null);
  const finishLocalSwipeRef = useRef(null);
  const ensureMountedRef = useRef(null);
  const pagerPruneTimerRef = useRef(null);
  const stickyHeavyPanelsRef = useRef(new Set());
  const mountedPanelIdsRef = useRef(new Set([initialTab]));
  const [mountedPanelIds, setMountedPanelIds] = useState(() => new Set([initialTab]));
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');
  const [companionVisible, setCompanionVisible] = useState(false);
  const [tabStatus, setTabStatus] = useState({ tabs: {}, avis: null });
  const [visiteARattacher, setVisiteARattacher] = useState(false);
  const [clavierVisible, setClavierVisible] = useState(false);
  const [rattachementVisible, setRattachementVisible] = useState(false);

  const rafraichirEtatOnglets = useCallback(() => {
    calculerEtatOnglets(visiteId, trameIdRef.current)
      .then((etat) => setTabStatus(etat))
      .catch((e) => console.warn('État des onglets non calculé', e));
  }, [visiteId]);

  useEffect(() => {
    let alive = true;
    estVisiteARattacher(visiteId).then((v) => { if (alive) setVisiteARattacher(v); }).catch(() => {});
    return () => { alive = false; };
  }, [visiteId]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setClavierVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setClavierVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  trameIdRef.current = trame.id;
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

  useEffect(() => subscribeSaveActivity(setSaveActivity), []);

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(visitNavKey).then((state) => {
      if (!alive || !state?.activeTab) return;
      desiredRestoreTabRef.current = state.activeTab;
      const tabs = tabOrderRef.current;
      const idx = tabs.indexOf(state.activeTab);
      if (idx < 0) return;
      activeTabRef.current = state.activeTab;
      setActiveTab(state.activeTab);
      addMountedPanels([state.activeTab], { stickyHeavy: true });
      pagerX.stopAnimation();
      pagerX.setValue(-idx * pagerWidthRef.current);
      warmPagerWindow(state.activeTab);
    }).catch(() => {});
    return () => { alive = false; };
  }, [visitNavKey, addMountedPanels, pagerX, warmPagerWindow]);

  useEffect(() => {
    markVisitHot(visiteId, { preview: visite || initialPreview || null, ui: { activeTab: activeTabRef.current } });
  }, [visiteId]);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tabOrderRef.current = tabsReels; }, [tabsSignature]);
  useEffect(() => () => {
    if (progressionTimerRef.current) clearTimeout(progressionTimerRef.current);
    if (pagerPruneTimerRef.current) clearTimeout(pagerPruneTimerRef.current);
    pagerX.stopAnimation();
    preAllumageLocalX.stopAnimation();
    // Les trois dernières visites restent chaudes en mémoire. Ne pas vider les
    // caches ici : revenir dans une visite doit être instantané.
  }, [pagerX, preAllumageLocalX]);

  useEffect(() => {
    if (!visite || tabsReels.length === 0) return;
    tabOrderRef.current = tabsReels;
    let current = desiredRestoreTabRef.current || activeTabRef.current;
    if (!tabsReels.includes(current)) {
      current = tabsReels[0];
      activeTabRef.current = current;
      setActiveTab(current);
    }
    desiredRestoreTabRef.current = null;
    const index = tabsReels.indexOf(current);
    transitionRef.current = false;
    pagerX.stopAnimation();
    pagerX.setValue(-Math.max(0, index) * pagerWidth);
    preAllumageLocalX.setValue(0);
    addMountedPanels([current], { stickyHeavy: true });
    warmPagerWindow(current);
  }, [visite?.trame_id, tabsSignature, pagerWidth, addMountedPanels, warmPagerWindow, pagerX, preAllumageLocalX]);

  const completeTabChange = useCallback((prochain) => {
    flushDurableAutosaves().catch(() => {});
    activeTabRef.current = prochain;
    setActiveTab(prochain);
    patchVisitUiState(visiteId, { activeTab: prochain });
    setNavigationState(visitNavKey, { activeTab: prochain });
    transitionRef.current = false;
    requestAnimationFrame(() => warmPagerWindow(prochain));
  }, [visiteId, visitNavKey, warmPagerWindow]);

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
    setNavigationState(visitNavKey, { activeTab: activeTabRef.current });
    Promise.allSettled([flushDurableAutosaves(), flushNavigationMemory()])
      .finally(() => setTimeout(() => onBack?.(), 0));
  }, [onBack, visitNavKey]);

  const charger = useCallback(async ({ forceCaches = false } = {}) => {
    setChargementErreur(null);

    let v = null;
    try {
      // Lecture minimale : site + client + local arrivent dans une seule requête.
      // Si un preview a été transmis par la liste, l'écran est déjà visible avant
      // même cette lecture.
      v = await getVisite(visiteId);
      if (!v) throw new Error('Visite introuvable dans la base locale.');
      setVisite((courante) => {
        const next = {
          ...(courante || {}),
          ...v,
          progression_pct: Number(courante?.progression_pct ?? v.progression_pct ?? 0),
        };
        markVisitHot(visiteId, { preview: next, ui: { activeTab: activeTabRef.current } });
        return next;
      });
    } catch (e) {
      console.warn('Ouverture visite impossible', e);
      setChargementErreur(String(e?.message || e || 'Erreur inconnue'));
      return;
    }

    // Tout le reste se prépare sans bloquer l'affichage. Le préremplissage est
    // marqué durablement : pour une visite déjà préparée, ce passage coûte une
    // simple lecture _meta. Les caches chauds ne sont rechargés que si nécessaire.
    void (async () => {
      try {
        const db = await getDb();
        let prefillEffectif = false;
        try {
          const resultatPrefill = await preremplirVisiteDepuisContexte(db, visiteId);
          prefillEffectif = resultatPrefill !== undefined;
        } catch (e) {
          console.warn('Préremplissage visite incomplet', e);
        }

        if (forceCaches || prefillEffectif) {
          invaliderCacheTrameGenerique(visiteId);
          invaliderCacheRegulation(visiteId);
        }

        const estVmc = (v?.trame_id || DEFAULT_TRAME_ID) === 'vmc';
        const [caissons] = await Promise.all([
          estVmc ? chargerCaissonsVmc(visiteId).catch(() => []) : Promise.resolve([]),
          prechargerDonneesTrameGenerique(visiteId, forceCaches || prefillEffectif),
          prechargerRegulation(visiteId, forceCaches || prefillEffectif),
        ]);
        setVmcCaissons(caissons || []);
        rafraichirEtatOnglets();

        try {
          const progression = await recalculerProgressionVisite(db, visiteId);
          setVisite((courante) => {
            const next = courante ? { ...courante, ...v, progression_pct: progression } : { ...v, progression_pct: progression };
            markVisitHot(visiteId, { preview: next, ui: { activeTab: activeTabRef.current } });
            return next;
          });
        } catch (e) {
          console.warn('Progression initiale non recalculée', e);
        }
      } catch (e) {
        console.warn('Initialisation secondaire de la visite incomplète', e);
      }
    })();
  }, [visiteId, rafraichirEtatOnglets]);

  useEffect(() => {
    let actif = true;
    prewarmCameraRuntime().catch(() => {});
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    recupererPhotosEnAttente(visiteId)
      .then((recovered) => loadVisitPhotos(visiteId, { force: Boolean(recovered) }).catch(() => {}))
      .catch((e) => console.warn('Récupération photo interrompue', e));
    charger().catch((e) => {
      if (!actif) return;
      console.warn('Chargement visite interrompu', e);
      setChargementErreur(String(e?.message || e || 'Erreur inconnue'));
    });
    return () => { actif = false; };
  }, [charger, visiteId]);

  const onSaved = useCallback(() => {
    if (progressionTimerRef.current) clearTimeout(progressionTimerRef.current);
    progressionTimerRef.current = setTimeout(async () => {
      try {
        const db = await getDb();
        const progression = await recalculerProgressionVisite(db, visiteId);
        setVisite((actuelle) => {
          if (!actuelle) return actuelle;
          const next = { ...actuelle, progression_pct: progression };
          markVisitHot(visiteId, { preview: next, ui: { activeTab: activeTabRef.current } });
          return next;
        });
        rafraichirEtatOnglets();
      } catch (e) {
        console.warn('Progression visite non recalculée', e);
      } finally {
        progressionTimerRef.current = null;
      }
    }, 1200);
  }, [visiteId, rafraichirEtatOnglets]);

  const onCaissonsChange = useCallback((next) => {
    setVmcCaissons(next || []);
    invaliderCacheTrameGenerique(visiteId);
    onSaved();
  }, [visiteId, onSaved]);

  const enregistrerSwipeLocalPreAllumage = useCallback((handler) => {
    preAllumageLocalSwipeRef.current = typeof handler === 'function' ? handler : null;
  }, []);

  const terminerSwipeLocalPreAllumage = useCallback((g) => {
    const w = pagerWidthRef.current;
    const threshold = Math.max(44, w * 0.065);
    const versSuivant = g.dx < -threshold || g.vx < -0.42;
    const versPrecedent = g.dx > threshold || g.vx > 0.42;
    const direction = versSuivant ? 1 : versPrecedent ? -1 : 0;
    const peutChanger = direction ? preAllumageLocalSwipeRef.current?.(direction, false) : false;
    if (!peutChanger) {
      Animated.spring(preAllumageLocalX, { toValue: 0, speed: 28, bounciness: 0, useNativeDriver: true }).start(() => {
        transitionRef.current = false;
      });
      return;
    }
    Animated.timing(preAllumageLocalX, {
      toValue: direction > 0 ? -w : w,
      duration: 115,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) { transitionRef.current = false; return; }
      const changed = preAllumageLocalSwipeRef.current?.(direction, true);
      if (!changed) {
        preAllumageLocalX.setValue(0);
        transitionRef.current = false;
        return;
      }
      preAllumageLocalX.setValue(direction > 0 ? w : -w);
      requestAnimationFrame(() => {
        Animated.timing(preAllumageLocalX, {
          toValue: 0,
          duration: 165,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => { transitionRef.current = false; });
      });
    });
  }, [preAllumageLocalX]);
  finishLocalSwipeRef.current = terminerSwipeLocalPreAllumage;

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
      onMoveShouldSetPanResponder: (_evt, g) => {
        if (transitionRef.current || Math.abs(g.dx) <= 9 || Math.abs(g.dx) <= Math.abs(g.dy) * 1.35) return false;
        const localMode = trameIdRef.current === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments';
        return localMode ? typeof preAllumageLocalSwipeRef.current === 'function' : true;
      },
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        const localMode = trameIdRef.current === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments' && typeof preAllumageLocalSwipeRef.current === 'function';
        gestureModeRef.current = localMode ? 'preallumage-local' : 'tabs';
        transitionRef.current = true;
        if (localMode) {
          preAllumageLocalX.stopAnimation();
          return;
        }
        const tabs = tabOrderRef.current;
        gestureStartIndexRef.current = Math.max(0, tabs.indexOf(activeTabRef.current));
        pagerX.stopAnimation();
      },
      onPanResponderMove: (_evt, g) => {
        if (gestureModeRef.current === 'preallumage-local') {
          const direction = g.dx < 0 ? 1 : -1;
          const peutChanger = preAllumageLocalSwipeRef.current?.(direction, false);
          preAllumageLocalX.setValue(peutChanger ? g.dx : g.dx * 0.20);
          return;
        }
        const tabs = tabOrderRef.current;
        const idx = Math.max(0, Math.min(tabs.length - 1, gestureStartIndexRef.current));
        const w = pagerWidthRef.current;
        let dx = g.dx;
        if ((idx === 0 && dx > 0) || (idx === tabs.length - 1 && dx < 0)) dx *= 0.24;
        const target = dx < -36 && idx < tabs.length - 1 ? tabs[idx + 1] : dx > 36 && idx > 0 ? tabs[idx - 1] : null;
        if (target && !mountedPanelIdsRef.current.has(target)) ensureMountedRef.current?.([target]);
        pagerX.setValue(-idx * w + dx);
      },
      onPanResponderRelease: (_evt, g) => {
        if (gestureModeRef.current === 'preallumage-local') finishLocalSwipeRef.current?.(g);
        else finishSwipeRef.current?.(g);
      },
      onPanResponderTerminate: () => {
        if (gestureModeRef.current === 'preallumage-local') {
          Animated.spring(preAllumageLocalX, { toValue: 0, speed: 28, bounciness: 0, useNativeDriver: true }).start(() => {
            transitionRef.current = false;
          });
          return;
        }
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

  if (!visite && chargementErreur) return <View style={[styles.center, { paddingHorizontal: 24 }]}>
    <Text style={{ color: COLORS.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>Impossible d’ouvrir la visite</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 8, textAlign: 'center' }}>{chargementErreur}</Text>
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
      <TouchableOpacity style={styles.btnSecondary} onPress={retourSecurise}><Text style={styles.btnSecondaryText}>Retour</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btnPrimary} onPress={() => charger({ forceCaches: true })}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity>
    </View>
  </View>;
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
          <Animated.View style={{ flex: 1, transform: panelId === 'p-pa-batiments' ? [{ translateX: preAllumageLocalX }] : [] }}>
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
              onRegisterLocalSwipe={trame.id === 'pre_allumage' && panelId === 'p-pa-batiments' ? enregistrerSwipeLocalPreAllumage : undefined}
            />
          </Animated.View>
        </Animated.View>;
      })}
    </View>
  );

  const totauxOnglets = tabsReels.reduce((acc, pid) => {
    const st = tabStatus.tabs?.[pid];
    if (st?.total) { acc.total += st.total; acc.done += st.done; }
    return acc;
  }, { total: 0, done: 0 });
  const allerAuxPhotos = () => { if (tabsReels.includes('p-photos')) changerOnglet('p-photos'); };
  const sousTitre = visiteARattacher
    ? ['Visite rapide', trame.nom, visite.date_visite].filter(Boolean).join(' · ')
    : [visite.nom_client, visite.nom_installation, trame.nom, visite.mode_visite === 'express' ? 'Mode Express' : null].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={styles.visiteTopbar}>
        <View style={styles.visiteHeaderRow}>
          <TouchableOpacity accessibilityLabel="Retour" style={styles.visiteBackBtn} onPress={retourSecurise}><CvcIcon name="chevron-left" size={20} color={COLORS.ink} strokeWidth={2.2} /></TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.visiteTitle}>{visite.nom_site}</Text>
            <Text numberOfLines={1} style={styles.cardSub}>{sousTitre}</Text>
          </View>
          {appareilTablette ? (
            <TouchableOpacity accessibilityLabel="Compagnon téléphone" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginLeft: 8 }} onPress={() => setCompanionVisible(true)}>
              <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={40}><CvcIcon name="device" size={19} color={COLORS.orangeDark} /></IconOrb>
            </TouchableOpacity>
          ) : null}
          {trame.id === 'pre_allumage' ? (
            <TouchableOpacity accessibilityLabel="Exporter en PDF ou Word" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginLeft: 8 }} onPress={choisirFormatRapportPreAllumage} disabled={reportExporting}>
              <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={40}>{reportExporting ? <ActivityIndicator size="small" color={COLORS.orangeDark} /> : <CvcIcon name="document" size={19} color={COLORS.orangeDark} />}</IconOrb>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityLabel={`Exporter en Excel ${trame.nom}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[styles.iconAction, styles.iconActionDark]} onPress={exporter} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={COLORS.white} /> : <CvcIcon name="export" size={19} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
        <GlassCard style={{ marginBottom: 10 }}>
          <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 54, height: 54 }}>
              <ProgressRing pct={visite.progression_pct} size={54} strokeWidth={6} accent={COLORS.orange} />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text accessibilityLiveRegion="polite" style={{ fontFamily: FONTS.black, fontSize: 12.5, color: COLORS.ink }}>{visite.progression_pct}%</Text>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 13.5, fontFamily: FONTS.bold, color: COLORS.ink }}>
                {totauxOnglets.total ? `${totauxOnglets.done} sur ${totauxOnglets.total} renseignés` : [trame.nom, visite.date_visite].filter(Boolean).join(' · ')}
              </Text>
              <AvisCounters avis={tabStatus.avis} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                <CvcIcon
                  name={saveActivity.lastError ? 'cloud-off' : saveActivity.pending ? 'cloud-sync' : 'control'}
                  size={14}
                  color={saveActivity.lastError ? '#B42318' : saveActivity.pending ? '#A15C12' : '#2E7D32'}
                />
                <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '700', fontFamily: FONTS.bodySemi, color: saveActivity.lastError ? '#B42318' : saveActivity.pending ? '#A15C12' : '#2E7D32' }}>
                  {saveActivity.lastError ? 'Erreur de sauvegarde' : saveActivity.pending ? `${saveActivity.pending} en attente` : 'Enregistré'}
                </Text>
              </View>
            </View>
            {visiteARattacher ? (
              <TouchableOpacity accessibilityLabel="Rattacher cette visite à un client" onPress={() => setRattachementVisible(true)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: COLORS.amberBg, borderWidth: 1, borderColor: 'rgba(180,83,9,0.3)', alignItems: 'center' }}><Text style={{ fontSize: 10.5, fontFamily: FONTS.bodyBold, color: COLORS.amber }}>À rattacher</Text><Text style={{ fontSize: 9.5, fontFamily: FONTS.bodySemi, color: COLORS.amber, marginTop: 1 }}>Choisir un client</Text></TouchableOpacity>
            ) : <IntranetVisitSyncControl compact visite={visite} onVisitChanged={() => charger({ forceCaches: true })} />}
          </View>
        </GlassCard>
        {!(trame.id === 'pre_allumage' && activeTab === 'p-pa-batiments') ? <PhotoReferenceAccess visiteId={visiteId} remoteLocalId={visite.api_remote_local_id || null} /> : null}
        {visite.mode_visite === 'express' && <Text style={styles.expressHint}>⚡ Données reprises de la visite précédente · index et mesures variables à actualiser</Text>}
        {trame.id === 'vmc' && vmcCaissons.length > 0 ? <VmcCaissonManager visiteId={visiteId} caissons={vmcCaissons} onChange={onCaissonsChange} onNavigate={changerOnglet} activePanelId={activeTab} tabStates={tabStatus.tabs} /> : null}
        {!modeTablette && <SectionRail tabOrder={tabOrder} labels={panelLabels} activeTab={activeTab} onSelect={changerOnglet} tabStates={tabStatus.tabs} />}
      </View>

      {modeTablette ? <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 205, backgroundColor: 'rgba(255,255,255,0.55)', borderRightWidth: 1, borderRightColor: 'rgba(22,21,15,0.08)' }}>
          <SideSectionList tabOrder={tabOrder} labels={panelLabels} activeTab={activeTab} onSelect={changerOnglet} tabStates={tabStatus.tabs} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{animatedContent}</View>
      </View> : animatedContent}
      {!clavierVisible ? <VisitActionBar onNote={ouvrirNote} onPhoto={allerAuxPhotos} onAnomalie={() => setAnomalieVisible(true)} /> : null}

      <Modal visible={noteVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Note libre — {trame.nom}</Text>
        <TextInput style={[styles.input, { height: 160, textAlignVertical: 'top' }]} multiline value={noteTxt} onChangeText={onChangeNoteTxt} placeholder="Notes générales sur la visite..." />
        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={fermerNote}><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
      </View></View></Modal>
      <AttachVisitSheet
        visible={rattachementVisible}
        visiteId={visiteId}
        nomSiteActuel={visite.nom_site}
        onClose={() => setRattachementVisible(false)}
        onAttached={() => {
          setRattachementVisible(false);
          setVisiteARattacher(false);
          invaliderCacheTrameGenerique(visiteId);
          charger({ forceCaches: true }).catch(() => {});
        }}
      />
      <CompanionTabletModal visible={companionVisible} visiteId={visiteId} onClose={() => setCompanionVisible(false)} />
      <Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter une anomalie</Text><Text style={styles.importHint}>Décris rapidement le constat. La réserve créée sera entièrement modifiable dans la synthèse.</Text>
        <TextInput style={[styles.input, { minHeight: 100, marginTop: 12, textAlignVertical: 'top' }]} multiline autoFocus value={anomalieTxt} onChangeText={setAnomalieTxt} placeholder="Ex. Pompe défaillante, température de départ trop basse…" />
        <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setAnomalieVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrerAnomalie}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
      </View></View></Modal>
    </View>
  );
}

export { VisiteScreen };
