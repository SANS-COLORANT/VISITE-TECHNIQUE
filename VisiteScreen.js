/** Écran Visite — pager natif, swipe interactif et panneaux gardés chauds. */
import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions, Animated, Easing } from 'react-native';
import { StyleSheet } from 'react-native';
import { SWIPE_NEIGHBOUR_OPACITY, SWIPE_NEIGHBOUR_SCALE, rubberBand, settleSpring, shouldStartSwipe, swipeDirection } from './swipeNavigation.js';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, styles } from './styles.js';
import { PhotoReferenceAccess } from './PhotoReferenceAccess.js';
import { IntranetVisitSyncControl } from './IntranetVisitSync.js';
import { useRelecture } from './RelectureSheet.js';
import { appliquerMotif, motifActif, motifsPourOnglet } from './motifsReserve.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ProgressRing, AmbientBackground } from './premiumChrome.js';
import { Picto, ACTION_PICTOS } from './MetraPictos.js';
import { MarqueeText } from './VisitKit.js';
import { VisitStatusSheet } from './VisitStatusSheet.js';
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
import { SectionRail, SideSectionList, VisitActionBar } from './VisitChrome.js';
import { calculerEtatOnglets } from './visitTabStatusDb.js';
import { estVisiteARattacher } from './quickVisitDb.js';
import { AttachVisitSheet } from './AttachVisitSheet.js';
import { VisitSearchSheet } from './VisitSearchSheet.js';
import { ButtonGlow } from './ButtonGlow.js';
import { feedback, hapticTick } from './fieldFeedback.js';
import { ToastHost, showToast } from './PremiumDialogs.js';
import { AideReglementaireHost } from './AideReglementaire.js';
import { getPrefSync, PREFS } from './uiPrefs.js';
import { SignatureSheet, enregistrerSignatureVisite, lireSignatureVisite } from './visitSignature.js';
import { SkeletonVisit } from './Skeleton.js';

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
  trameId,
  onRegisterLocalSwipe,
  nextPanel,
  onNextPanel,
}) {
  if (special) {
    if (panelId === 'p-regulation') return <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} />;
    if (panelId === 'p-releves') return <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} trameId={trameId} panels={panels} />;
    if (panelId === 'p-equip') return <GuidedEquipmentPanel visiteId={visiteId} trameId={trameId} />;
    if (panelId === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} tabOrder={tabOrder} panelLabels={panelLabels} panels={panels} intranetLinked={intranetLinked} trameId={trameId} />;
    if (panelId === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
  }
  return <TrameGenericPanel visiteId={visiteId} panelId={panelId} sections={sections} onSaved={onSaved} onRegisterLocalSwipe={onRegisterLocalSwipe} nextPanel={nextPanel} onNextPanel={onNextPanel} trameId={trameId} />;
});

// « Enregistré il y a 2 min » (court sur téléphone).
function depuisSauvegarde(ts, court = false) {
  if (!ts) return court ? '' : 'Enregistré';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 20) return court ? 'à l’instant' : 'Enregistré à l’instant';
  const libelle = s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
  return court ? `il y a ${libelle}` : `Enregistré il y a ${libelle}`;
}

// Statut de sauvegarde isolé : ses mises à jour (à chaque enregistrement et
// toutes les 15 s pour « il y a … ») ne redessinent plus tout l'écran Visite.
const SaveStatusBadge = memo(function SaveStatusBadge({ court = false }) {
  const [saveActivity, setSaveActivity] = useState(() => getSaveActivity());
  const [, setHorloge] = useState(0);
  useEffect(() => subscribeSaveActivity(setSaveActivity), []);
  useEffect(() => { const t = setInterval(() => setHorloge((n) => n + 1), 15000); return () => clearInterval(t); }, []);
  return (
    <View accessibilityLabel={saveActivity.lastError ? 'Erreur de sauvegarde' : saveActivity.pending ? `${saveActivity.pending} en attente` : 'Enregistré'} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <CvcIcon
        name={saveActivity.lastError ? 'cloud-off' : saveActivity.pending ? 'cloud-sync' : 'control'}
        size={14}
        color={saveActivity.lastError ? '#B42318' : saveActivity.pending ? '#A15C12' : '#2E7D32'}
      />
      <Text accessibilityLiveRegion="polite" numberOfLines={1} style={{ fontSize: 11, fontFamily: FONTS.bodySemi, color: saveActivity.lastError ? '#B42318' : saveActivity.pending ? '#A15C12' : '#2E7D32' }}>
        {saveActivity.lastError ? 'Erreur' : saveActivity.pending ? `${saveActivity.pending} en attente` : depuisSauvegarde(saveActivity.lastSavedAt, court)}
      </Text>
    </View>
  );
});

function VisiteScreen({ route, onBack }) {
  const { visiteId, visitePreview = null } = route.params;
  const visitNavKey = `visit:${String(visiteId || '')}`;
  const runtimeInitial = getVisitRuntime(visiteId);
  const initialPreview = visitePreview || runtimeInitial?.preview || null;
  const initialTab = runtimeInitial?.ui?.activeTab || getNavigationState(visitNavKey)?.activeTab || 'p-infos';
  const { width, height } = useWindowDimensions();
  // Mode Photo : saisie rapide terrain ouverte depuis la barre d'actions.
  const [modePhotoVisible, setModePhotoVisible] = useState(false);
  const [photoRev, setPhotoRev] = useState(0);
  const [signatureVisible, setSignatureVisible] = useState(false);
  const [signature, setSignature] = useState(null);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  // Onglets en bas, à portée de pouce (Réglages › Affichage terrain).
  const ongletsEnBas = useMemo(() => getPrefSync(PREFS.ongletsEnBas, '0') === '1', []);
  const repriseAnnonceeRef = useRef(false);
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
  const [anomaliePerimetre, setAnomaliePerimetre] = useState('');
  const [companionVisible, setCompanionVisible] = useState(false);
  const [tabStatus, setTabStatus] = useState({ tabs: {}, avis: null });
  const [visiteARattacher, setVisiteARattacher] = useState(false);
  const [clavierVisible, setClavierVisible] = useState(false);
  const [rattachementVisible, setRattachementVisible] = useState(false);
  // Feuille d'état ouverte en touchant la jauge de l'en-tête (remplace la carte d'avancement).
  const [statutVisible, setStatutVisible] = useState(false);
  const [rechercheVisible, setRechercheVisible] = useState(false);

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
  // Onglet suivant de chaque panneau (objets stables : pas de rendu inutile).
  const nextPanelById = useMemo(() => {
    const map = {};
    tabsReels.forEach((pid, i) => {
      const next = tabsReels[i + 1];
      if (next) map[pid] = { id: next, label: `Suivant : ${panelLabels[next] || next}` };
    });
    return map;
  }, [tabsSignature, panelLabels]);

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

  // « Enregistré il y a … » reste à jour.
  useEffect(() => { lireSignatureVisite(visiteId).then(setSignature).catch(() => {}); }, [visiteId]);
  // Reprise d'une visite : on rappelle où l'on reprend.
  const panelLabelsRef = useRef(panelLabels);
  panelLabelsRef.current = panelLabels;
  const visiteChargee = Boolean(visite);
  useEffect(() => {
    if (repriseAnnonceeRef.current || !visiteChargee) return undefined;
    const timer = setTimeout(() => {
      repriseAnnonceeRef.current = true;
      const tab = activeTabRef.current; const premier = tabOrderRef.current?.[0];
      const label = panelLabelsRef.current?.[tab];
      if (tab && premier && tab !== premier && label) showToast(`Reprise à l’onglet « ${label} »`, { duration: 2200 });
    }, 900);
    return () => clearTimeout(timer);
  }, [visiteChargee]);

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

  const animateToTab = useCallback((prochain, velocityX = 0) => {
    const tabs = tabOrderRef.current;
    const targetIndex = tabs.indexOf(prochain);
    if (targetIndex < 0) { transitionRef.current = false; return; }
    const wasMounted = mountedPanelIdsRef.current.has(prochain);
    addMountedPanels([prochain], { stickyHeavy: true });
    const start = () => {
      // Ressort critique (sans rebond) qui reprend la vitesse du doigt : fluide et vif.
      Animated.spring(pagerX, {
        toValue: -targetIndex * pagerWidthRef.current,
        ...settleSpring(velocityX),
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
    animateToTab(prochain, 0);
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
    const direction = swipeDirection(g.dx, g.vx, w);
    const peutChanger = direction ? preAllumageLocalSwipeRef.current?.(direction, false) : false;
    if (!peutChanger) {
      Animated.spring(preAllumageLocalX, { toValue: 0, ...settleSpring(g.vx), useNativeDriver: true }).start(() => {
        transitionRef.current = false;
      });
      return;
    }
    Animated.spring(preAllumageLocalX, {
      toValue: direction > 0 ? -w : w,
      ...settleSpring(g.vx),
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
        Animated.spring(preAllumageLocalX, { toValue: 0, ...settleSpring(0), useNativeDriver: true }).start(() => { transitionRef.current = false; });
      });
    });
  }, [preAllumageLocalX]);
  finishLocalSwipeRef.current = terminerSwipeLocalPreAllumage;

  const terminerSwipe = useCallback((g) => {
    const tabs = tabOrderRef.current;
    const idx = Math.max(0, Math.min(tabs.length - 1, gestureStartIndexRef.current));
    const w = pagerWidthRef.current;
    // Un geste court ou un petit coup de doigt suffit (voir swipeNavigation.js).
    const direction = swipeDirection(g.dx, g.vx, w);
    const prochain = direction > 0 && idx < tabs.length - 1 ? tabs[idx + 1] : direction < 0 && idx > 0 ? tabs[idx - 1] : null;

    if (!prochain) {
      Animated.spring(pagerX, { toValue: -idx * w, ...settleSpring(g.vx), useNativeDriver: true }).start(() => {
        transitionRef.current = false;
        warmPagerWindow(activeTabRef.current);
      });
      return;
    }

    animateToTab(prochain, g.vx);
  }, [animateToTab, pagerX, warmPagerWindow]);
  finishSwipeRef.current = terminerSwipe;

  const swipeHandlers = useRef(null);
  if (!swipeHandlers.current) {
    swipeHandlers.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        // Geste horizontal accepté dès qu'il domine un peu (un glissé au pouce
        // n'est jamais parfaitement horizontal) ; le vertical reste au défilement.
        if (transitionRef.current || !shouldStartSwipe(g.dx, g.dy)) return false;
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
          preAllumageLocalX.setValue(rubberBand(g.dx, !peutChanger));
          return;
        }
        const tabs = tabOrderRef.current;
        const idx = Math.max(0, Math.min(tabs.length - 1, gestureStartIndexRef.current));
        const w = pagerWidthRef.current;
        const dx = rubberBand(g.dx, (idx === 0 && g.dx > 0) || (idx === tabs.length - 1 && g.dx < 0));
        // La page voisine est montée dès le début du geste : pas d'à-coup au premier pixel.
        const target = dx < -10 && idx < tabs.length - 1 ? tabs[idx + 1] : dx > 10 && idx > 0 ? tabs[idx - 1] : null;
        if (target && !mountedPanelIdsRef.current.has(target)) ensureMountedRef.current?.([target]);
        pagerX.setValue(-idx * w + dx);
      },
      onPanResponderRelease: (_evt, g) => {
        if (gestureModeRef.current === 'preallumage-local') finishLocalSwipeRef.current?.(g);
        else finishSwipeRef.current?.(g);
      },
      onPanResponderTerminate: () => {
        if (gestureModeRef.current === 'preallumage-local') {
          Animated.spring(preAllumageLocalX, { toValue: 0, ...settleSpring(0), useNativeDriver: true }).start(() => {
            transitionRef.current = false;
          });
          return;
        }
        const idx = Math.max(0, gestureStartIndexRef.current);
        Animated.spring(pagerX, { toValue: -idx * pagerWidthRef.current, ...settleSpring(0), useNativeDriver: true }).start(() => {
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
  // Vérification avant export : éléments non renseignés et N.S sans photo,
  // avec accès direct au premier onglet incomplet.
  const verifierAvantExport = async (lancer) => {
    let nsSansPhoto = 0;
    try {
      const db = await getDb();
      const row = await db.getFirstAsync(
        `SELECT COUNT(*) n FROM controles_visite c WHERE c.visite_id=? AND c.avis='N.S'
         AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.visite_id=c.visite_id AND p.entite_key=c.section_code || '||' || c.cle)`,
        [visiteId]
      );
      nsSansPhoto = Number(row?.n || 0);
    } catch (e) { console.warn('Vérification photos avant export', e); }
    const manquants = Math.max(0, totauxOnglets.total - totauxOnglets.done);
    if (!manquants && !nsSansPhoto) { lancer(); return; }
    const premierIncomplet = tabsReels.find((pid) => ['empty', 'partial', 'alert'].includes(tabStatus.tabs?.[pid]?.state) && (tabStatus.tabs[pid].done < tabStatus.tabs[pid].total));
    const lignes = [
      manquants ? `• ${manquants} élément${manquants > 1 ? 's' : ''} non renseigné${manquants > 1 ? 's' : ''}` : null,
      nsSansPhoto ? `• ${nsSansPhoto} contrôle${nsSansPhoto > 1 ? 's' : ''} N.S sans photo` : null,
    ].filter(Boolean).join('\n');
    Alert.alert('Avant d’exporter', `${lignes}\n\nTu peux exporter maintenant ou compléter d’abord.`, [
      premierIncomplet ? { text: 'Compléter', style: 'cancel', onPress: () => changerOnglet(premierIncomplet) } : { text: 'Annuler', style: 'cancel' },
      { text: 'Exporter quand même', onPress: lancer },
    ]);
  };

  // Fin de visite : aperçu du rapport, signature client, export Excel.
  const apercuRapport = async () => {
    if (apercuEnCours) return;
    setApercuEnCours(true);
    try { Keyboard.dismiss(); await require('./visitReportPreview.js').apercuRapportVisite(visiteId); }
    catch (e) { Alert.alert('Aperçu impossible', String(e?.message || e)); }
    finally { setApercuEnCours(false); }
  };
  const menuFinVisite = () => {
    const boutons = [];
    if (trame.id !== 'pre_allumage') boutons.push({ text: 'Aperçu du rapport', onPress: apercuRapport });
    boutons.push({ text: signature ? 'Modifier la signature' : 'Signature du client', onPress: () => setSignatureVisible(true) });
    boutons.push({ text: 'Exporter en Excel', onPress: () => verifierAvantExport(exporter) });
    boutons.push({ text: 'Annuler', style: 'cancel' });
    Alert.alert('Terminer la visite', signature ? `Signée par ${signature.nom || 'le client'}.` : 'Vérifie le rendu, fais signer le client, puis exporte.', boutons);
  };
  const enregistrerSignature = async (sig) => {
    setSignatureVisible(false);
    try { await enregistrerSignatureVisite(visiteId, sig); setSignature(sig); feedback('Signature enregistrée'); }
    catch (e) { Alert.alert('Signature non enregistrée', String(e?.message || e)); }
  };

  const exporter = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      Keyboard.dismiss();
      await attendre(180);
      const resultat = await chargerExcelExportModule().exporterEtPartager(visiteId);
      if (resultat && !resultat.annule) feedback('Export Excel prêt');
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
    const texte = anomalieTxt.trim().replace(/\s*:\s*$/, '');
    if (!texte) return;
    if (trame.id === 'reseau_chaleur_v1' && !anomaliePerimetre) {
      Alert.alert('Périmètre requis', 'Choisis Primaire ou Secondaire pour cette anomalie.');
      return;
    }
    await ajouterRemarqueVisite(visiteId, { poste: 'Observation', prestation: texte, origine: 'Anomalie rapide', perimetre: trame.id === 'reseau_chaleur_v1' ? anomaliePerimetre : null });
    feedback('Anomalie ajoutée aux réserves');
    setAnomalieTxt('');
    setAnomaliePerimetre('');
    setAnomalieVisible(false);
    if (tabsReels.includes('p-remarques')) changerOnglet('p-remarques');
  };

  const tabStatusRef = useRef(tabStatus);
  tabStatusRef.current = tabStatus;
  const getOngletsRelecture = useCallback(() => tabStatusRef.current?.tabs || {}, []);
  const motifsAnomalie = useMemo(() => motifsPourOnglet(panelLabels?.[activeTab] || ''), [panelLabels, activeTab]);
  const relecture = useRelecture({ visiteId, getOnglets: getOngletsRelecture, labels: panelLabels, ordre: tabsReels, onOpenOnglet: changerOnglet });

  if (!visite && chargementErreur) return <View style={[styles.center, { paddingHorizontal: 24 }]}>
    <Text style={{ color: COLORS.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>Impossible d’ouvrir la visite</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 8, textAlign: 'center' }}>{chargementErreur}</Text>
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
      <TouchableOpacity style={styles.btnSecondary} onPress={retourSecurise}><Text style={styles.btnSecondaryText}>Retour</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btnPrimary} onPress={() => charger({ forceCaches: true })}><ButtonGlow /><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity>
    </View>
  </View>;
  if (!visite) return <SkeletonVisit />;

  const intranetLinked = Boolean(visite?.api_remote_local_id) && Number(visite?.api_is_historical) !== 1;
  const pagerPanels = tabsReels.filter((panelId) => panelId === activeTab || mountedPanelIds.has(panelId));
  const animatedContent = (
    <View style={{ flex: 1, overflow: 'hidden' }} {...swipeHandlers.current.panHandlers}>
      {pagerPanels.map((panelId) => {
        const index = tabsReels.indexOf(panelId);
        return <Animated.View
          key={`${panelId}-${photoRev}`}
          pointerEvents={panelId === activeTab ? 'auto' : 'none'}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: index * pagerWidth, width: pagerWidth,
            opacity: pagerX.interpolate({ inputRange: [(-index - 1) * pagerWidth, -index * pagerWidth, (-index + 1) * pagerWidth], outputRange: [SWIPE_NEIGHBOUR_OPACITY, 1, SWIPE_NEIGHBOUR_OPACITY], extrapolate: 'clamp' }),
            transform: [{ translateX: pagerX }, { scale: pagerX.interpolate({ inputRange: [(-index - 1) * pagerWidth, -index * pagerWidth, (-index + 1) * pagerWidth], outputRange: [SWIPE_NEIGHBOUR_SCALE, 1, SWIPE_NEIGHBOUR_SCALE], extrapolate: 'clamp' }) }],
          }}
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
              trameId={trame.id}
              onRegisterLocalSwipe={trame.id === 'pre_allumage' && panelId === 'p-pa-batiments' ? enregistrerSwipeLocalPreAllumage : undefined}
              nextPanel={nextPanelById[panelId] || null}
              onNextPanel={changerOnglet}
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
  // En-tête sur une ligne : boutons ronds en pictogrammes, jauge ~30 px.
  const headerBtn = appareilTablette ? 42 : 35;
  const headerPicto = appareilTablette ? 22 : 19;
  const btnSize = { width: headerBtn, height: headerBtn, borderRadius: headerBtn / 2 };
  const ringSize = appareilTablette ? 38 : 31;
  const ouvrirRecherche = () => setRechercheVisible(true);
  const fermerModePhoto = () => {
    setModePhotoVisible(false);
    // Les saisies du Mode Photo vont directement en base : on recharge la
    // visite et on remonte les onglets déjà ouverts.
    invaliderCacheTrameGenerique(visiteId);
    setPhotoRev((n) => n + 1);
    charger({ forceCaches: true }).catch(() => {});
  };
  // Seconde ligne : local · client · trame (défile si elle est trop longue).
  const sousTitre = visiteARattacher
    ? ['Visite rapide', trame.nom, visite.date_visite].filter(Boolean).join(' · ')
    : [visite.nom_installation, visite.nom_client, trame.nom, visite.mode_visite === 'express' ? 'Mode Express' : null].filter(Boolean).join(' · ');
  const ouvrirRattachement = () => {
    setStatutVisible(false);
    setTimeout(() => setRattachementVisible(true), 260);
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <View style={styles.visiteTopbar}>
        <View style={hs.row}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" hitSlop={HEADER_HIT} style={[hs.btn, btnSize]} onPress={retourSecurise}><CvcIcon name="chevron-left" size={appareilTablette ? 21 : 19} color={COLORS.ink} strokeWidth={2.2} /></TouchableOpacity>
          <View style={hs.titleBlock}>
            <Text numberOfLines={1} style={[hs.title, appareilTablette && { fontSize: 17 }]}>{visite.nom_site}</Text>
            <MarqueeText text={sousTitre} style={[hs.subtitle, appareilTablette && { fontSize: 12.5 }]} />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Avancement de la visite : ${visite.progression_pct} %${visiteARattacher ? ', visite à rattacher' : ''}. Ouvrir l’état de la visite`}
            hitSlop={HEADER_HIT}
            onPress={() => setStatutVisible(true)}
            style={[hs.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
          >
            <ProgressRing pct={visite.progression_pct} size={ringSize} strokeWidth={3.5} accent={COLORS.orange} />
            <View style={hs.ringLabel} pointerEvents="none">
              <Text accessibilityLiveRegion="polite" style={[hs.ringText, { fontSize: ringSize > 34 ? 10 : 8.5 }]}>{visite.progression_pct}%</Text>
            </View>
            {visiteARattacher ? <View style={hs.ringAlert} /> : null}
          </TouchableOpacity>
          {!(trame.id === 'pre_allumage' && activeTab === 'p-pa-batiments') ? <PhotoReferenceAccess visiteId={visiteId} remoteLocalId={visite.api_remote_local_id || null} variant="icon" iconSize={headerBtn} /> : null}
          {appareilTablette ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Compagnon téléphone" hitSlop={HEADER_HIT} style={[hs.btn, btnSize]} onPress={() => setCompanionVisible(true)}>
              <Picto name={ACTION_PICTOS.compagnon} size={headerPicto} />
            </TouchableOpacity>
          ) : null}
          {trame.id === 'pre_allumage' ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exporter le rapport Pré-allumage en PDF ou Word" hitSlop={HEADER_HIT} style={[hs.btn, btnSize]} onPress={() => verifierAvantExport(choisirFormatRapportPreAllumage)} disabled={reportExporting}>
              {reportExporting ? <ActivityIndicator size="small" color={COLORS.orangeDark} /> : <CvcIcon name="document" size={headerPicto - 2} color={COLORS.orangeDark} />}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Télécharger l’export Excel ${trame.nom}`} hitSlop={HEADER_HIT} style={[hs.btn, btnSize]} onPress={() => verifierAvantExport(exporter)} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={COLORS.orangeDark} /> : <Picto name={ACTION_PICTOS.telecharger} size={headerPicto} />}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Terminer la visite : aperçu, signature, export Excel ${trame.nom}`} hitSlop={HEADER_HIT} onPress={menuFinVisite} disabled={exporting || apercuEnCours}>
            <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[hs.btnMain, btnSize]}>
              {apercuEnCours ? <ActivityIndicator size="small" color={COLORS.white} /> : <Picto name={ACTION_PICTOS.terminer} size={headerPicto} mono={COLORS.white} strokeWidth={2} />}
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {trame.id === 'vmc' && vmcCaissons.length > 0 ? <VmcCaissonManager visiteId={visiteId} caissons={vmcCaissons} onChange={onCaissonsChange} onNavigate={changerOnglet} activePanelId={activeTab} tabStates={tabStatus.tabs} /> : null}
        {!modeTablette && !ongletsEnBas && <SectionRail tabOrder={tabOrder} labels={panelLabels} activeTab={activeTab} onSelect={changerOnglet} tabStates={tabStatus.tabs} trameId={trame.id} onSearch={ouvrirRecherche} pagerX={pagerX} pagerWidth={pagerWidth} pageOrder={tabsReels} visiteId={visiteId} />}
      </View>

      {modeTablette ? <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 205, backgroundColor: 'rgba(255,255,255,0.55)', borderRightWidth: 1, borderRightColor: 'rgba(22,21,15,0.08)' }}>
          <SideSectionList tabOrder={tabOrder} labels={panelLabels} activeTab={activeTab} onSelect={changerOnglet} tabStates={tabStatus.tabs} trameId={trame.id} onSearch={ouvrirRecherche} visiteId={visiteId} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>{animatedContent}</View>
      </View> : animatedContent}
      {!clavierVisible && !modeTablette && ongletsEnBas ? <View style={{ paddingHorizontal: 12, paddingTop: 8, marginBottom: -12 }}><SectionRail tabOrder={tabOrder} labels={panelLabels} activeTab={activeTab} onSelect={changerOnglet} tabStates={tabStatus.tabs} trameId={trame.id} onSearch={ouvrirRecherche} pagerX={pagerX} pagerWidth={pagerWidth} pageOrder={tabsReels} visiteId={visiteId} /></View> : null}
      <AideReglementaireHost />
      {!clavierVisible ? <VisitActionBar onNote={ouvrirNote} onPhoto={() => setModePhotoVisible(true)} photoLabel="Mode Photo" onAnomalie={() => setAnomalieVisible(true)} /> : null}

      <Modal visible={noteVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Note libre — {trame.nom}</Text>
        <TextInput style={[styles.input, { height: 160, textAlignVertical: 'top' }]} multiline value={noteTxt} onChangeText={onChangeNoteTxt} placeholder="Notes générales sur la visite..." />
        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={fermerNote}><ButtonGlow /><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
      </View></View></Modal>
      <VisitStatusSheet
        visible={statutVisible}
        onClose={() => setStatutVisible(false)}
        pct={visite.progression_pct}
        done={totauxOnglets.done}
        total={totauxOnglets.total}
        avis={tabStatus.avis}
        trameId={trame.id}
        trameNom={[trame.nom, visite.date_visite].filter(Boolean).join(' · ')}
        express={visite.mode_visite === 'express'}
        saveStatus={<SaveStatusBadge />}
        intranet={visiteARattacher ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Rattacher cette visite à un client" onPress={ouvrirRattachement} style={hs.attach}>
            <Text style={hs.attachTitle}>À rattacher</Text>
            <Text style={hs.attachSub}>Choisir un client</Text>
          </TouchableOpacity>
        ) : <IntranetVisitSyncControl visite={visite} onVisitChanged={() => charger({ forceCaches: true })} beforeSend={relecture.demander} />}
        onVoirReserves={tabsReels.includes('p-remarques') ? () => { setStatutVisible(false); changerOnglet('p-remarques'); } : null}
      />
      {relecture.sheet}
      <VisitSearchSheet visible={rechercheVisible} onClose={() => setRechercheVisible(false)} panels={panels} tabs={tabsReels} labels={panelLabels} onOpen={changerOnglet} />
      <AttachVisitSheet
        visible={rattachementVisible}
        visiteId={visiteId}
        nomSiteActuel={visite.nom_site}
        onClose={() => setRattachementVisible(false)}
        onAttached={() => {
          setRattachementVisible(false);
          setVisiteARattacher(false);
          feedback('Visite rattachée au client');
          invaliderCacheTrameGenerique(visiteId);
          charger({ forceCaches: true }).catch(() => {});
        }}
      />
      <CompanionTabletModal visible={companionVisible} visiteId={visiteId} onClose={() => setCompanionVisible(false)} />
      <SignatureSheet visible={signatureVisible} initial={signature} onClose={() => setSignatureVisible(false)} onSave={enregistrerSignature} />
      <Modal visible={modePhotoVisible} animationType="slide" statusBarTranslucent onRequestClose={fermerModePhoto}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <AmbientBackground accent={COLORS.orange} />
          {modePhotoVisible ? (() => { const { PhotoPhoneScreen } = require('./PhotoPhoneScreen.js'); return <PhotoPhoneScreen visiteId={visiteId} onExit={fermerModePhoto} />; })() : null}
          {modePhotoVisible ? <ToastHost bottom={28} /> : null}
        </View>
      </Modal>
      <Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter une anomalie</Text><Text style={styles.importHint}>Décris rapidement le constat. La réserve créée sera entièrement modifiable dans la synthèse.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginTop: 12, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {motifsAnomalie.map((motif) => { const on = motifActif(anomalieTxt, motifsAnomalie) === motif; return <TouchableOpacity key={motif} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setAnomalieTxt(appliquerMotif(anomalieTxt, motif, motifsAnomalie))} style={[styles.avisChip, { flex: 0, paddingHorizontal: 12 }, on && { backgroundColor: COLORS.orangeLight, borderColor: COLORS.orange }]}>
            <Text style={[styles.avisChipText, on && { color: COLORS.orangeDark }]}>{motif}</Text>
          </TouchableOpacity>; })}
        </ScrollView>
        <TextInput style={[styles.input, { minHeight: 100, marginTop: 10, textAlignVertical: 'top' }]} multiline autoFocus value={anomalieTxt} onChangeText={setAnomalieTxt} placeholder="Ex. Pompe défaillante, température de départ trop basse…" />
        {trame.id === 'reseau_chaleur_v1' ? <View style={{ marginTop: 12 }}>
          <Text style={styles.fieldLabel}>Périmètre concerné · obligatoire</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 7 }}>
            {['Primaire','Secondaire'].map((p) => <TouchableOpacity key={p} onPress={() => setAnomaliePerimetre(p)} style={[styles.avisChip, anomaliePerimetre === p && { backgroundColor: COLORS.orangeLight, borderColor: COLORS.orange }]}>
              <Text style={[styles.avisChipText, anomaliePerimetre === p && { color: COLORS.orangeDark }]}>{p}</Text>
            </TouchableOpacity>)}
          </View>
        </View> : null}
        <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => { setAnomalieVisible(false); setAnomaliePerimetre(''); }}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrerAnomalie}><ButtonGlow /><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
      </View></View></Modal>
    </View>
  );
}

const HEADER_HIT = { top: 6, bottom: 6, left: 3, right: 3 };

const hs = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  btn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  btnMain: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  titleBlock: { flex: 1, minWidth: 0, marginLeft: 2, marginRight: 2 },
  title: { fontSize: 15, fontFamily: FONTS.black, color: COLORS.ink },
  subtitle: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
  ring: { backgroundColor: '#FDFCFA' },
  ringLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: FONTS.black, color: COLORS.ink },
  ringAlert: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.amber, borderWidth: 1.5, borderColor: '#FDFCFA' },
  attach: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: COLORS.amberBg, borderWidth: 1, borderColor: 'rgba(180,83,9,0.3)', alignItems: 'center' },
  attachTitle: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.amber },
  attachSub: { fontSize: 10, fontFamily: FONTS.bodySemi, color: COLORS.amber, marginTop: 1 },
});

export { VisiteScreen };
