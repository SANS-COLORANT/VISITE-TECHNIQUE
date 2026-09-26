/** VISITE TECHNIQUE — point d'entrée natif Android. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard, PanResponder, ScrollView, useWindowDimensions } from 'react-native';
import { PhotoDownloadBanner } from './PhotoDownloadStatus.js';
import { IntranetVisitSyncBanner, IntranetVisitSyncRuntime } from './IntranetVisitSync.js';
import { IntranetStructureRuntime } from './IntranetStructureRuntime.js';
import { getDb } from './db.js';
import { COLORS, FONTS, styles } from './styles.js';
import { MISSION_COLORS } from './missionTheme.js';
import { HomeScreen } from './HomeScreen.js';
import { HydraulicSchemaWorkspace } from './HydraulicSchemaWorkspace.js';
import { getHydraulicSchemaVisible, getLab3DVisible, getMissionsVisible, subscribeLabFeatureChanges } from './featureSettings.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { R1EasterEgg } from './R1EasterEgg.js';
import { VisualPackLoadingScreen } from './visual-packs/runtime/VisualPackLoadingScreen.js';
import { VisualPackAsset } from './visual-packs/runtime/VisualPackAsset.js';
import { setRuntimeVisualPalette } from './visual-packs/runtime/visualPaletteRuntime.js';
import { getActiveVisualPack, getVisualPackStartupDuration, resolveVisualPackAssetUri } from './visual-packs/runtime/visualPackManager.js';
import { SpiralActiveDock } from './visual-packs/spiral-active/SpiralActiveDock.js';
import { CompanionPhoneScreen } from './CompanionPhoneScreen.js';
import { PhotoPhoneScreen } from './PhotoPhoneScreen.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { useAppFonts } from './AppFonts.js';
import { LinearGradient } from 'expo-linear-gradient';
import { AmbientBackground } from './premiumChrome.js';
import { BottomTabBar } from './BottomTabBar.js';
import { QuickVisitSheet } from './QuickVisitSheet.js';

const SPLASH_BG = '#FBF0E1';
const MISSION_ROUTES = new Set(['Missions', 'MissionCreate', 'Mission', 'MissionVisit', 'MissionReport', 'MissionTechnicalGraph', 'MissionEquipment', 'MissionStructure', 'MissionTechnicalStructure', 'MissionPlan', 'MissionMap', 'MissionCalculation', 'MissionTests', 'MissionScenarios', 'MissionExcelMapping', 'MissionPhotoAnnotations', 'MissionActions', 'MissionDocuments', 'MissionSignature', 'MissionWorkflow', 'MissionPackage', 'MissionDocumentInbox', 'MissionMeasurements', 'MissionMeasurementCampaign', 'MissionReserveClearance', 'MissionSubjects', 'MissionP3Dashboard', 'MissionReceptionBoard', 'MissionExpertise', 'MissionCampaignDashboard', 'MissionAmoDashboard', 'MissionControlBoard']);
const TAB_BAR_HIDDEN_ROUTES = new Set(['Visite', 'Report', 'Lab3D', 'HydraulicSchema']);
const CLIENT_TAB_ROUTES = new Set(['MetraDirectory', 'ClientSites', 'SiteLocals', 'SiteVisites', 'ClientMap', 'ClientPilotage', 'ClientDocuments', 'ClientPatrimoine', 'ClientTechnicalMatrix', 'IntranetStructure']);
const BACK_SWIPE_ROUTES = new Set(['MetraDirectory', 'ClientSites', 'SiteLocals', 'SiteVisites', 'ClientPilotage', 'ClientDocuments', 'ClientPatrimoine', 'ClientTechnicalMatrix', 'IntranetStructure', 'Parametres']);

const DEFERRED_SCREEN_LOADERS = Object.freeze({
  MetraDirectory: () => require('./MetraDirectoryScreen.js').MetraDirectoryScreen,
  ClientSites: () => require('./ClientSitesScreen.js').ClientSitesScreen,
  SiteLocals: () => require('./SiteLocalsScreen.js').SiteLocalsScreen,
  ClientMap: () => require('./ClientMapScreen.js').ClientMapScreen,
  ClientPatrimoine: () => require('./ClientPatrimoineScreen.js').ClientPatrimoineScreen,
  ClientTechnicalMatrix: () => require('./ClientTechnicalMatrixScreen.js').ClientTechnicalMatrixScreen,
  ClientPilotage: () => require('./ClientPilotageScreen.js').ClientPilotageScreen,
  ClientDocuments: () => require('./ClientDocumentsScreen.js').ClientDocumentsScreen,
  IntranetStructure: () => require('./IntranetStructureScreen.js').IntranetStructureScreen,
  Visite: () => require('./VisiteScreen.js').VisiteScreen,
  SiteVisites: () => require('./SiteVisitesScreen.js').SiteVisitesScreen,
  Report: () => require('./ReportScreen.js').ReportScreen,
  Lab3D: () => require('./Lab3DScreen.js').Lab3DScreen,
  Parametres: () => require('./visual-packs/runtime/VisualPacksSettingsScreen.js').VisualPacksSettingsScreen,
  Missions: () => require('./MissionsHomeScreen.js').MissionsHomeScreen,
  MissionCreate: () => require('./MissionCreateScreen.js').MissionCreateScreen,
  Mission: () => require('./MissionScreen.js').MissionScreen,
  MissionVisit: () => require('./MissionVisitScreen.js').MissionVisitScreen,
  MissionReport: () => require('./MissionReportScreen.js').MissionReportScreen,
  MissionTechnicalGraph: () => require('./MissionTechnicalGraphScreen.js').MissionTechnicalGraphScreen,
  MissionEquipment: () => require('./MissionEquipmentScreen.js').MissionEquipmentScreen,
  MissionStructure: () => require('./MissionStructureScreen.js').MissionStructureScreen,
  MissionTechnicalStructure: () => require('./MissionTechnicalStructureScreen.js').MissionTechnicalStructureScreen,
  MissionPlan: () => require('./MissionPlanScreen.js').MissionPlanScreen,
  MissionMap: () => require('./MissionMapScreen.js').MissionMapScreen,
  MissionCalculation: () => require('./MissionCalculationScreen.js').MissionCalculationScreen,
  MissionTests: () => require('./MissionTestsScreen.js').MissionTestsScreen,
  MissionScenarios: () => require('./MissionScenarioScreen.js').MissionScenarioScreen,
  MissionExcelMapping: () => require('./MissionExcelMappingScreen.js').MissionExcelMappingScreen,
  MissionPhotoAnnotations: () => require('./MissionPhotoAnnotationScreen.js').MissionPhotoAnnotationScreen,
  MissionActions: () => require('./MissionActionsScreen.js').MissionActionsScreen,
  MissionDocuments: () => require('./MissionDocumentsScreen.js').MissionDocumentsScreen,
  MissionSignature: () => require('./MissionSignatureScreen.js').MissionSignatureScreen,
  MissionWorkflow: () => require('./MissionWorkflowScreen.js').MissionWorkflowScreen,
  MissionPackage: () => require('./MissionPackageScreen.js').MissionPackageScreen,
  MissionDocumentInbox: () => require('./MissionDocumentInboxScreen.js').MissionDocumentInboxScreen,
  MissionMeasurements: () => require('./MissionMeasurementsScreen.js').MissionMeasurementsScreen,
  MissionMeasurementCampaign: () => require('./MissionMeasurementCampaignScreen.js').MissionMeasurementCampaignScreen,
  MissionReserveClearance: () => require('./MissionReserveClearanceScreen.js').MissionReserveClearanceScreen,
  MissionSubjects: () => require('./MissionSubjectsScreen.js').MissionSubjectsScreen,
  MissionP3Dashboard: () => require('./MissionP3DashboardScreen.js').MissionP3DashboardScreen,
  MissionReceptionBoard: () => require('./MissionReceptionBoardScreen.js').MissionReceptionBoardScreen,
  MissionExpertise: () => require('./MissionExpertiseScreen.js').MissionExpertiseScreen,
  MissionCampaignDashboard: () => require('./MissionCampaignDashboardScreen.js').MissionCampaignDashboardScreen,
  MissionAmoDashboard: () => require('./MissionAmoDashboardScreen.js').MissionAmoDashboardScreen,
  MissionControlBoard: () => require('./MissionControlBoardScreen.js').MissionControlBoardScreen,
});

function DeferredScreen({ name, ...props }) {
  const Component = DEFERRED_SCREEN_LOADERS[name]?.();
  return Component ? <Component {...props} /> : null;
}

/**
 * Le pack visuel "spiral-active" (scène d'accueil animée) a son propre
 * habillage d'en-tête, distinct du header standard — c'est le seul pack à
 * en avoir besoin, donc géré ici plutôt qu'en threadant une prop
 * supplémentaire à travers tous les appels de SimpleHeader.
 */
function SimpleHeader({ title, onBack, visualPack, rightAction = null }) {
  const uri = resolveVisualPackAssetUri(visualPack, visualPack?.interface?.headerLogo);
  const spiralActive = visualPack?.id === 'spiral-active' || visualPack?.interface?.experimentalSpiralDock === true;

  if (spiralActive) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFDF8', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: '#DDE2E3' }}>
      {onBack ? <TouchableOpacity onPress={onBack} style={{ width: 44, height: 40, alignItems: 'flex-start', justifyContent: 'center' }}><Text style={{ color: '#14202C', fontSize: 22, fontWeight: '700' }}>←</Text></TouchableOpacity> : <View style={{ width: 44 }} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ color: '#14202C', fontSize: 9, fontWeight: '900', letterSpacing: 2 }}>METRA</Text>
        <Text numberOfLines={1} style={{ marginTop: 2, color: '#14202C', fontSize: 16, fontWeight: '900', fontFamily: FONTS.black, letterSpacing: -0.25 }}>{title}</Text>
        <View style={{ marginTop: 6, width: 34, height: 3, backgroundColor: '#F26426', transform: [{ skewX: '-18deg' }] }} />
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{uri ? <VisualPackAsset uri={uri} style={{ width: 34, height: 26 }} /> : <View style={{ width: 10, height: 24, backgroundColor: '#DCEFF1', transform: [{ skewX: '-16deg' }] }} />}</View>
    </View>;
  }

  return <View style={styles.simpleHeader}>
    {onBack ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.simpleHeaderBack} onPress={onBack}><CvcIcon name="chevron-left" size={20} color={COLORS.ink} strokeWidth={2.3} /></TouchableOpacity> : null}
    <Text numberOfLines={1} style={styles.simpleHeaderTitle}>{title}</Text>
    {rightAction ? <TouchableOpacity onPress={rightAction.onPress} style={styles.headerPill}><Text style={styles.headerPillText}>{rightAction.label}</Text></TouchableOpacity> : (uri ? <VisualPackAsset uri={uri} style={{ width: 34, height: 26 }} /> : null)}
  </View>;
}

function MissionHeader({ title, onBack, visualPack, root = false }) {
  const uri = resolveVisualPackAssetUri(visualPack, visualPack?.interface?.headerLogo);
  return <View style={styles.simpleHeader}>
    {onBack ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.simpleHeaderBack} onPress={onBack}><CvcIcon name="chevron-left" size={20} color={MISSION_COLORS.accentDark} strokeWidth={2.3} /></TouchableOpacity> : null}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 10, color: MISSION_COLORS.accentDark, fontFamily: FONTS.bodyBold, letterSpacing: 1.1 }}>{root ? 'UNIVERS MISSIONS' : 'MISSIONS'}</Text>
      <Text numberOfLines={1} style={[styles.simpleHeaderTitle, { marginTop: 1 }]}>{title}</Text>
    </View>
    {uri ? <VisualPackAsset uri={uri} style={{ width: 34, height: 26 }} /> : null}
  </View>;
}

function GlobalHomeButton({ onPress, missionMode = false, compact = false }) {
  const accent = missionMode ? MISSION_COLORS.accent : COLORS.orange;
  const accentDark = missionMode ? MISSION_COLORS.accentDark : COLORS.orangeDark;
  const fabShadow = { shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 9 };
  if (compact) {
    return <TouchableOpacity accessibilityRole="button" accessibilityLabel={missionMode ? 'Missions' : 'Accueil'} onPress={onPress} style={[{ position: 'absolute', left: 14, bottom: 14, zIndex: 260 }, fabShadow]}>
      <LinearGradient colors={[accent, accentDark]} start={{ x: 0.2, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
        <CvcIcon name={missionMode ? 'tools' : 'home'} size={24} color={COLORS.white} />
      </LinearGradient>
    </TouchableOpacity>;
  }
  return <TouchableOpacity onPress={onPress} style={[{ position: 'absolute', left: 18, bottom: 20, zIndex: 260 }, fabShadow]}>
    <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ minHeight: 48, paddingHorizontal: 17, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <CvcIcon name={missionMode ? 'tools' : 'home'} size={19} color={COLORS.white} /><Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '900' }}>{missionMode ? 'Missions' : 'Accueil'}</Text>
    </LinearGradient>
  </TouchableOpacity>;
}

function Lab3DFab({ onPress, bottom = 82, label = '⬡ LAB 3D' }) {
  return <TouchableOpacity onPress={onPress} style={{ position: 'absolute', right: 18, bottom, minHeight: 48, paddingHorizontal: 17, borderRadius: 24, backgroundColor: '#10384B', borderWidth: 2, borderColor: '#5DD8FF', alignItems: 'center', justifyContent: 'center', elevation: 9, zIndex: 205 }}><Text style={{ color: '#F5FBFF', fontWeight: '900', fontSize: 12.5 }}>{label}</Text></TouchableOpacity>;
}

function AppContent({ phoneIntegralMode = false, onPhoneModeExit = null }) {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [visualPack, setVisualPack] = useState(null);
  const [visualRevision, setVisualRevision] = useState(0);
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);
  const [r1Visible, setR1Visible] = useState(false);
  const [quickVisitVisible, setQuickVisitVisible] = useState(false);
  const [hydraulicVisible, setHydraulicVisible] = useState(false);
  const [lab3dVisible, setLab3dVisible] = useState(false);
  const [missionsVisible, setMissionsVisibleState] = useState(false);

  const initialiser = useCallback(async () => {
    setDbReady(false);
    setDbError(null);
    setVisualPack(null);
    try {
      await getDb();
      const [pack, schemaVisible, lab3dEnabled, missionsEnabled] = await Promise.all([
        getActiveVisualPack(), getHydraulicSchemaVisible(), getLab3DVisible(), getMissionsVisible(),
      ]);
      setHydraulicVisible(schemaVisible);
      setLab3dVisible(lab3dEnabled);
      setMissionsVisibleState(missionsEnabled);
      setRuntimeVisualPalette(pack?.colors);
      setVisualPack(pack);
      await new Promise((resolve) => setTimeout(resolve, getVisualPackStartupDuration(pack)));
      setDbReady(true);
    } catch (err) { setDbError(err); }
  }, []);

  useEffect(() => { initialiser(); }, [initialiser]);

  const navigate = useCallback((name, params = {}) => setStack((currentStack) => {
    const current = currentStack[currentStack.length - 1];
    return current?.name === name && JSON.stringify(current.params || {}) === JSON.stringify(params || {})
      ? currentStack
      : [...currentStack, { name, params }];
  }), []);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setStack((current) => current.length > 1 ? current.slice(0, -1) : current), 0);
  }, []);

  const currentName = stack[stack.length - 1]?.name || 'Home';
  const backSwipeEnabled = stack.length > 1 && BACK_SWIPE_ROUTES.has(currentName);
  const backSwipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      backSwipeEnabled
      && gesture.dx < -18
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45
    ),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_event, gesture) => {
      if (backSwipeEnabled && (gesture.dx < -82 || gesture.vx < -0.55)) goBack();
    },
  }), [backSwipeEnabled, goBack]);

  const goHome = useCallback(() => {
    Keyboard.dismiss();
    setR1Visible(false);
    setTimeout(() => setStack([{ name: 'Home', params: {} }]), 0);
  }, []);

  const goMissionsHome = useCallback(() => {
    if (!missionsVisible) return goHome();
    Keyboard.dismiss();
    setTimeout(() => setStack([{ name: 'Home', params: {} }, { name: 'Missions', params: { enteredBySwipe: true } }]), 0);
  }, [goHome, missionsVisible]);

  const handleVisualPackChanged = useCallback((pack) => {
    setRuntimeVisualPalette(pack?.colors);
    setVisualPack(pack);
    setVisualRevision((value) => value + 1);
  }, []);

  useEffect(() => subscribeLabFeatureChanges((key, enabled) => {
    if (key === 'hydraulic_schema') setHydraulicVisible(enabled);
    if (key === 'lab_3d') {
      setLab3dVisible(enabled);
      if (!enabled) setStack((current) => current.filter((entry, index) => entry.name !== 'Lab3D' || index === 0));
    }
    if (key === 'missions') {
      setMissionsVisibleState(enabled);
      if (!enabled) setStack((current) => MISSION_ROUTES.has(current[current.length - 1]?.name) ? [{ name: 'Home', params: {} }] : current);
    }
  }), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (r1Visible) return true;
      if (stack.length <= 1) return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [stack.length, goBack, r1Visible]);

  if (dbError) return <View style={styles.center}><Text style={styles.errorTitle}>Erreur de démarrage</Text><Text style={styles.errorText}>{String(dbError.message || dbError)}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 18 }]} onPress={initialiser}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity></View>;
  if (!visualPack) return <View style={{ flex: 1, backgroundColor: SPLASH_BG }} />;
  if (!dbReady) return <VisualPackLoadingScreen pack={visualPack} />;

  const current = stack[stack.length - 1];
  const navigation = { navigate, goBack, goHome, goMissionsHome };
  const route = { params: current.params };
  const missionMode = MISSION_ROUTES.has(current.name);
  const spiralActive = visualPack?.id === 'spiral-active' || visualPack?.interface?.experimentalSpiralDock === true;
  const currentParams = current.params || {};
  const hasClient = !!currentParams.clientId;
  const hasSite = !!currentParams.siteId;
  const hasVisit = !!currentParams.visiteId;

  const resetToTab = (name) => {
    Keyboard.dismiss();
    setR1Visible(false);
    setTimeout(() => setStack(name === 'Home' ? [{ name: 'Home', params: {} }] : [{ name: 'Home', params: {} }, { name, params: {} }]), 0);
  };
  const showTabBar = !spiralActive && !missionMode && !r1Visible && !TAB_BAR_HIDDEN_ROUTES.has(current.name);
  const activeTab = current.name === 'Home' ? 'home' : current.name === 'Parametres' ? 'settings' : CLIENT_TAB_ROUTES.has(current.name) ? 'clients' : null;
  const tabs = [
    { key: 'home', label: 'Accueil', icon: 'home', onPress: () => resetToTab('Home') },
    { key: 'clients', label: 'Clients', icon: 'local', onPress: () => resetToTab('MetraDirectory') },
    { key: 'quick-visit', label: 'Nouvelle visite', icon: 'plus', center: true, onPress: () => { Keyboard.dismiss(); setQuickVisitVisible(true); } },
    missionsVisible ? { key: 'missions', label: 'Missions', icon: 'tools', onPress: goMissionsHome } : null,
    { key: 'settings', label: 'Réglages', icon: 'settings', onPress: () => resetToTab('Parametres') },
  ].filter(Boolean);

  const spiralExploreActions = [
    { icon: '⌂', label: 'Accueil', caption: 'Tableau de bord', onPress: goHome },
    { icon: '⌕', label: 'Recherche', caption: 'Clients & sites', onPress: () => navigate('MetraDirectory', {}) },
    hasClient ? { icon: '▦', label: 'Patrimoine', caption: 'Vue du client', onPress: () => navigate('ClientPatrimoine', { clientId: currentParams.clientId, nomClient: currentParams.nomClient }) } : { icon: '◎', label: 'Clients', caption: 'Répertoire', onPress: () => navigate('MetraDirectory', {}) },
    hasClient ? { icon: '⌖', label: 'Carte', caption: 'Sites du client', onPress: () => navigate('ClientMap', { clientId: currentParams.clientId, nomClient: currentParams.nomClient }) } : { icon: '⚙', label: 'Réglages', caption: 'Apparence', onPress: () => navigate('Parametres') },
  ];
  const spiralActionActions = [
    hasSite ? { icon: '＋', label: 'Visites', caption: 'Ouvrir le site', tone: 'action', onPress: () => navigate('SiteVisites', { ...currentParams }) } : null,
    hasVisit ? { icon: '▤', label: 'Rapport', caption: 'Préparer la sortie', tone: 'action', onPress: () => navigate('Report', { visiteId: currentParams.visiteId }) } : null,
    lab3dVisible && (hasSite || hasVisit) ? { icon: '⬡', label: 'LAB 3D', caption: 'Maquette du site', tone: 'action', onPress: () => navigate('Lab3D', hasVisit ? { visiteId: currentParams.visiteId } : { siteId: currentParams.siteId, nomSite: currentParams.nomSite }) } : null,
    hydraulicVisible && hasVisit ? { icon: '⌁', label: 'Schéma', caption: 'Technique animé', tone: 'action', onPress: () => navigate('HydraulicSchema', { visiteId: currentParams.visiteId }) } : null,
    { icon: '⚙', label: 'Réglages', caption: 'Apparence', onPress: () => navigate('Parametres') },
    stack.length > 1 ? { icon: '←', label: 'Retour', caption: 'Écran précédent', onPress: goBack } : null,
  ].filter(Boolean);
  const spiralQuickActions = [
    { icon: '⌂', label: 'Accueil', caption: 'Tableau de bord', onPress: goHome },
    { icon: '⌕', label: 'Recherche', caption: 'Tout retrouver', onPress: () => navigate('MetraDirectory', {}) },
    stack.length > 1 ? { icon: '←', label: 'Retour', caption: 'Écran précédent', onPress: goBack } : { icon: '⚙', label: 'Réglages', caption: 'Apparence', onPress: () => navigate('Parametres') },
    { icon: '⚙', label: 'Réglages', caption: 'Packs visuels', onPress: () => navigate('Parametres') },
  ];

  return <View key={`visual-${visualRevision}-${visualPack.id}`} style={{ flex: 1, backgroundColor: spiralActive ? '#F4F1E8' : (missionMode ? MISSION_COLORS.bg : COLORS.bg) }} {...(backSwipeEnabled ? backSwipeResponder.panHandlers : {})}>
    {!spiralActive ? <AmbientBackground accent={missionMode ? MISSION_COLORS.accent : COLORS.orange} /> : null}
    <IntranetStructureRuntime />
    <IntranetVisitSyncRuntime />
    <IntranetVisitSyncBanner />
    <PhotoDownloadBanner />

    {current.name === 'Home' ? <>{spiralActive ? <SimpleHeader title="Visite Technique" visualPack={visualPack} rightAction={phoneIntegralMode ? { label: 'Changer de mode', onPress: onPhoneModeExit } : null} /> : null}<HomeScreen navigation={navigation} route={route} spiralPreview={spiralActive} onR1LongPress={() => setR1Visible(true)} missionsEnabled={missionsVisible} headerAction={phoneIntegralMode ? { label: 'Changer de mode', onPress: onPhoneModeExit } : null} /></> : null}
    {current.name === 'MetraDirectory' ? <><SimpleHeader title="Recherche clients & sites" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MetraDirectory" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientSites' ? <><SimpleHeader title={current.params?.nomClient || 'Sites'} onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientSites" navigation={navigation} route={route} /></> : null}
    {current.name === 'SiteLocals' ? <><SimpleHeader title={current.params?.nomSite || 'Locaux'} onBack={goBack} visualPack={visualPack} /><DeferredScreen name="SiteLocals" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientMap' ? <><SimpleHeader title="Carte METRA des sites" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientMap" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientPilotage' ? <><SimpleHeader title="Pilotage patrimoine" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientPilotage" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientDocuments' ? <><SimpleHeader title="Documents & exports" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientDocuments" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientPatrimoine' ? <><SimpleHeader title="Synthèse patrimoine" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientPatrimoine" navigation={navigation} route={route} /></> : null}
    {current.name === 'ClientTechnicalMatrix' ? <><SimpleHeader title="Cartographie technique" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="ClientTechnicalMatrix" navigation={navigation} route={route} /></> : null}
    {current.name === 'IntranetStructure' ? <><SimpleHeader title={`Structure Intranet · ${current.params?.nomSite || 'Site'}`} onBack={goBack} visualPack={visualPack} /><DeferredScreen name="IntranetStructure" navigation={navigation} route={route} /></> : null}
    {current.name === 'SiteVisites' ? <><SimpleHeader title={current.params?.nomLocal ? `${current.params?.nomSite || 'Site'} · ${current.params.nomLocal}` : (current.params?.nomSite || 'Visites')} onBack={goBack} visualPack={visualPack} /><DeferredScreen name="SiteVisites" navigation={navigation} route={route} />{lab3dVisible ? <Lab3DFab onPress={() => navigate('Lab3D', { siteId: current.params?.siteId, nomSite: current.params?.nomSite })} label="⬡ LAB 3D du site" /> : null}</> : null}
    {current.name === 'Visite' ? <><DeferredScreen name="Visite" navigation={navigation} route={route} onBack={goBack} />{lab3dVisible ? <Lab3DFab onPress={() => navigate('Lab3D', { visiteId: current.params?.visiteId })} bottom={hydraulicVisible ? 150 : 98} label="⬡ LAB 3D du site" /> : null}{hydraulicVisible ? <TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 98, minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 200 }}><Text>⌁ Schéma technique</Text></TouchableOpacity> : null}</> : null}
    {current.name === 'HydraulicSchema' ? <><SimpleHeader title="Schéma technique animé" onBack={goBack} visualPack={visualPack} /><HydraulicSchemaWorkspace route={route} /></> : null}
    {current.name === 'Lab3D' && lab3dVisible ? <><SimpleHeader title="LAB 3D · Maquette du site" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="Lab3D" navigation={navigation} route={route} /></> : null}
    {current.name === 'Report' ? <DeferredScreen name="Report" route={route} onBack={goBack} /> : null}
    {current.name === 'Parametres' ? <><SimpleHeader title="Paramètres" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="Parametres" visualPack={visualPack} onVisualPackChanged={handleVisualPackChanged} /></> : null}

    {current.name === 'Missions' && missionsVisible ? <><MissionHeader title="Tableau de bord" onBack={goHome} visualPack={visualPack} root /><DeferredScreen name="Missions" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionCreate' && missionsVisible ? <><MissionHeader title="Nouvelle Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionCreate" navigation={navigation} route={route} /></> : null}
    {current.name === 'Mission' && missionsVisible ? <><MissionHeader title="Dossier Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="Mission" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionVisit' && missionsVisible ? <><MissionHeader title="Visite terrain" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionVisit" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionReport' && missionsVisible ? <><MissionHeader title="Rapport Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionReport" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionTechnicalGraph' && missionsVisible ? <><MissionHeader title="Synoptique technique" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionTechnicalGraph" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionEquipment' && missionsVisible ? <><MissionHeader title="Inventaire Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionEquipment" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionStructure' && missionsVisible ? <><MissionHeader title="Patrimoine Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionStructure" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionTechnicalStructure' && missionsVisible ? <><MissionHeader title="Architecture technique" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionTechnicalStructure" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionPlan' && missionsVisible ? <><MissionHeader title="Plans · PDF · SIG" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionPlan" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionMap' && missionsVisible ? <><MissionHeader title="Cartographie Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionMap" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionCalculation' && missionsVisible ? <><MissionHeader title="Calculs Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionCalculation" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionTests' && missionsVisible ? <><MissionHeader title="Essais · Commissioning" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionTests" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionScenarios' && missionsVisible ? <><MissionHeader title="Scénarios" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionScenarios" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionExcelMapping' && missionsVisible ? <><MissionHeader title="Mapping Excel" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionExcelMapping" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionPhotoAnnotations' && missionsVisible ? <><MissionHeader title="Annotations photo" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionPhotoAnnotations" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionActions' && missionsVisible ? <><MissionHeader title="Actions Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionActions" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionDocuments' && missionsVisible ? <><MissionHeader title="Documents · VISA" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionDocuments" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionSignature' && missionsVisible ? <><MissionHeader title="Signature Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionSignature" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionWorkflow' && missionsVisible ? <><MissionHeader title="Workflow Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionWorkflow" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionPackage' && missionsVisible ? <><MissionHeader title="Dossier complet" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionPackage" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionDocumentInbox' && missionsVisible ? <><MissionHeader title="Inbox documents" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionDocumentInbox" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionMeasurements' && missionsVisible ? <><MissionHeader title="Mesures Mission" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionMeasurements" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionMeasurementCampaign' && missionsVisible ? <><MissionHeader title="Campagnes de mesures" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionMeasurementCampaign" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionReserveClearance' && missionsVisible ? <><MissionHeader title="Levée de réserves" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionReserveClearance" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionSubjects' && missionsVisible ? <><MissionHeader title="Sujets & décisions" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionSubjects" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionP3Dashboard' && missionsVisible ? <><MissionHeader title="Projection P2 / P3" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionP3Dashboard" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionReceptionBoard' && missionsVisible ? <><MissionHeader title="Réception / mise en service" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionReceptionBoard" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionExpertise' && missionsVisible ? <><MissionHeader title="Expertise / sinistre" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionExpertise" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionCampaignDashboard' && missionsVisible ? <><MissionHeader title="Campagne multi-sites" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionCampaignDashboard" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionAmoDashboard' && missionsVisible ? <><MissionHeader title="Pilotage AMO" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionAmoDashboard" navigation={navigation} route={route} /></> : null}
    {current.name === 'MissionControlBoard' && missionsVisible ? <><MissionHeader title="Contrôle ciblé" onBack={goBack} visualPack={visualPack} /><DeferredScreen name="MissionControlBoard" navigation={navigation} route={route} /></> : null}

    {missionMode && current.name !== 'Missions' && !spiralActive ? <GlobalHomeButton compact={phoneIntegralMode} missionMode onPress={goMissionsHome} /> : null}
    {showTabBar ? <BottomTabBar tabs={tabs} activeKey={activeTab} /> : null}
    <QuickVisitSheet
      visible={quickVisitVisible}
      onClose={() => setQuickVisitVisible(false)}
      onCreated={({ visiteId }) => {
        setQuickVisitVisible(false);
        setStack([{ name: 'Home', params: {} }, { name: 'Visite', params: { visiteId } }]);
      }}
    />
    {spiralActive && !r1Visible ? <SpiralActiveDock exploreActions={spiralExploreActions} actionActions={spiralActionActions} quickActions={spiralQuickActions} /> : null}
    <R1EasterEgg visible={r1Visible} onFinish={() => setR1Visible(false)} />
  </View>;
}

function PhoneModeChooser({ onChoose }) {
  const [palette, setPalette] = useState(() => ({ main: COLORS.orange, dark: COLORS.orangeDark, light: COLORS.orangeLight }));
  const [pack, setPack] = useState(null);

  useEffect(() => {
    let alive = true;
    getActiveVisualPack().then((activePack) => {
      if (!alive) return;
      setRuntimeVisualPalette(activePack?.colors);
      setPack(activePack || null);
      setPalette({
        main: activePack?.colors?.main || COLORS.orange,
        dark: activePack?.colors?.dark || COLORS.orangeDark,
        light: activePack?.colors?.light || COLORS.orangeLight,
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const logoUri = resolveVisualPackAssetUri(pack, pack?.interface?.headerLogo);
  const card = { minHeight: 128, padding: 15, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, marginBottom: 10 };
  const mode = (id, icon, title, description, featured = false) => (
    <TouchableOpacity key={id} onPress={() => onChoose(id)} activeOpacity={0.84} style={[card, featured ? { borderWidth: 1.5, borderColor: palette.main, backgroundColor: palette.light } : null]}>
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: featured ? COLORS.white : palette.light, alignItems: 'center', justifyContent: 'center', borderWidth: featured ? 1 : 0, borderColor: palette.main }}>
        <CvcIcon name={icon} size={30} color={palette.main} />
      </View>
      <Text style={{ marginTop: 12, fontSize: 17, fontWeight: '900', color: COLORS.ink }}>{title}</Text>
      <Text style={{ marginTop: 4, color: COLORS.inkSoft, lineHeight: 17, fontSize: 11.5 }}>{description}</Text>
    </TouchableOpacity>
  );

  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 30 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 23, fontWeight: '900', color: COLORS.ink }}>Choisir le mode téléphone</Text>
        <Text style={{ marginTop: 6, color: COLORS.inkSoft, lineHeight: 18 }}>Interface complète, capture terrain rapide ou compagnon de la tablette.</Text>
      </View>
      {logoUri ? <VisualPackAsset uri={logoUri} style={{ width: 46, height: 36 }} /> : null}
    </View>
    {mode('photo', 'camera', 'Mode Photo', 'Accès direct aux relevés, équipements, plaques signalétiques et remarques. OCR local hors ligne.', true)}
    {mode('integral', 'tools', 'Version intégrale', 'Clients, sites, visites, saisies et exports dans l’interface complète.')}
    {mode('companion', 'camera', 'Compagnon', 'Associer ce téléphone à une visite ouverte sur tablette pour capturer et renseigner à distance.')}
  </ScrollView>;
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const phone = Math.min(width, height) < 600;
  const [phoneMode, setPhoneMode] = useState(null);
  const fontsReady = useAppFonts();

  useEffect(() => {
    if (!phone) setPhoneMode(null);
  }, [phone]);

  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: SPLASH_BG }} />;
  if (phone && !phoneMode) return <AppErrorBoundary><PhoneModeChooser onChoose={setPhoneMode} /></AppErrorBoundary>;
  if (phone && phoneMode === 'photo') return <AppErrorBoundary><PhotoPhoneScreen onExit={() => setPhoneMode(null)} /></AppErrorBoundary>;
  if (phone && phoneMode === 'companion') return <AppErrorBoundary><CompanionPhoneScreen onExit={() => setPhoneMode(null)} /></AppErrorBoundary>;
  return <AppErrorBoundary><AppContent phoneIntegralMode={phone && phoneMode === 'integral'} onPhoneModeExit={() => setPhoneMode(null)} /></AppErrorBoundary>;
}
