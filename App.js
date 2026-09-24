/** VISITE TECHNIQUE — point d'entrée natif Android. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard, PanResponder, useWindowDimensions } from 'react-native';
import { PhotoDownloadBanner } from './PhotoDownloadStatus.js';
import { IntranetVisitSyncBanner, IntranetVisitSyncRuntime } from './IntranetVisitSync.js';
import { IntranetStructureRuntime } from './IntranetStructureRuntime.js';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
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
import { CompanionPhoneScreen } from './CompanionPhoneScreen.js';
import { CvcIcon } from './MetraCvcIcons.js';

const SPLASH_BG = '#FBF0E1';
const MISSION_ROUTES = new Set(['Missions', 'MissionCreate', 'Mission', 'MissionVisit', 'MissionReport', 'MissionTechnicalGraph', 'MissionEquipment', 'MissionStructure', 'MissionTechnicalStructure', 'MissionPlan', 'MissionMap', 'MissionCalculation', 'MissionTests', 'MissionScenarios', 'MissionExcelMapping', 'MissionPhotoAnnotations', 'MissionActions', 'MissionDocuments', 'MissionSignature', 'MissionWorkflow', 'MissionPackage', 'MissionDocumentInbox', 'MissionMeasurements', 'MissionMeasurementCampaign', 'MissionReserveClearance', 'MissionSubjects', 'MissionP3Dashboard', 'MissionReceptionBoard', 'MissionExpertise', 'MissionCampaignDashboard', 'MissionAmoDashboard', 'MissionControlBoard']);
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

function SimpleHeader({ title, onBack, visualPack, rightAction = null }) {
  const uri = resolveVisualPackAssetUri(visualPack, visualPack?.interface?.headerLogo);
  return <View style={styles.simpleHeader}>
    {onBack ? <TouchableOpacity style={styles.simpleHeaderBack} onPress={onBack}><Text style={styles.simpleHeaderBackText}>←</Text></TouchableOpacity> : <View style={styles.simpleHeaderBack} />}
    <Text style={styles.simpleHeaderTitle}>{title}</Text>
    <View style={[styles.simpleHeaderBack, rightAction ? { width: 104, alignItems: 'flex-end' } : null]}>{rightAction ? <TouchableOpacity onPress={rightAction.onPress} style={{ minWidth: 78, minHeight: 32, paddingHorizontal: 9, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }}><Text style={{ fontSize: 10.5, fontWeight: '900', color: COLORS.text }}>{rightAction.label}</Text></TouchableOpacity> : (uri ? <VisualPackAsset uri={uri} style={{ width: 34, height: 26 }} /> : null)}</View>
  </View>;
}

function MissionHeader({ title, onBack, visualPack, root = false }) {
  const uri = resolveVisualPackAssetUri(visualPack, visualPack?.interface?.headerLogo);
  return <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MISSION_COLORS.accentStrong, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accent }}>
    {onBack ? <TouchableOpacity style={{ width: 40, minHeight: 34, alignItems: 'flex-start', justifyContent: 'center' }} onPress={onBack}><Text style={{ fontSize: 21, color: '#DDF2E5', fontWeight: '800' }}>←</Text></TouchableOpacity> : <View style={{ width: 40 }} />}
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 8.5, color: '#BFE2CC', fontWeight: '900', letterSpacing: 1.1 }}>{root ? 'UNIVERS MISSIONS' : 'MISSIONS'}</Text>
      <Text style={{ marginTop: 1, textAlign: 'center', fontSize: 15.5, fontWeight: '900', color: '#FFFFFF' }}>{title}</Text>
    </View>
    <View style={{ width: 40, alignItems: 'flex-end', justifyContent: 'center' }}>{uri ? <VisualPackAsset uri={uri} style={{ width: 34, height: 26 }} /> : null}</View>
  </View>;
}

function GlobalHomeButton({ onPress, missionMode = false }) {
  const accent = missionMode ? MISSION_COLORS.accent : COLORS.orange;
  return <TouchableOpacity onPress={onPress} style={{ position: 'absolute', left: 18, bottom: 20, minHeight: 46, paddingHorizontal: 15, borderRadius: 23, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, elevation: 9, zIndex: 260 }}>
    <Text style={{ color: accent, fontSize: 20, fontWeight: '900' }}>{missionMode ? '◎' : '⌂'}</Text><Text style={{ color: missionMode ? MISSION_COLORS.accentStrong : COLORS.ink, fontSize: 11.5, fontWeight: '900' }}>{missionMode ? 'Missions' : 'Accueil'}</Text>
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

  return <View key={`visual-${visualRevision}-${visualPack.id}`} style={{ flex: 1, backgroundColor: missionMode ? MISSION_COLORS.bg : COLORS.bg }} {...(backSwipeEnabled ? backSwipeResponder.panHandlers : {})}>
    <IntranetStructureRuntime />
    <IntranetVisitSyncRuntime />
    <IntranetVisitSyncBanner />
    <PhotoDownloadBanner />

    {current.name === 'Home' ? <><SimpleHeader title="Visite Technique" visualPack={visualPack} rightAction={phoneIntegralMode ? { label: 'Changer de mode', onPress: onPhoneModeExit } : null} /><HomeScreen navigation={navigation} route={route} onR1LongPress={() => setR1Visible(true)} missionsEnabled={missionsVisible} /></> : null}
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
    {current.name === 'Visite' ? <><DeferredScreen name="Visite" navigation={navigation} route={route} onBack={goBack} />{lab3dVisible ? <Lab3DFab onPress={() => navigate('Lab3D', { visiteId: current.params?.visiteId })} bottom={hydraulicVisible ? 72 : 20} label="⬡ LAB 3D du site" /> : null}{hydraulicVisible ? <TouchableOpacity onPress={() => navigate('HydraulicSchema', { visiteId: current.params?.visiteId })} style={{ position: 'absolute', right: 18, bottom: 20, minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', elevation: 4, zIndex: 200 }}><Text>⌁ Schéma technique</Text></TouchableOpacity> : null}</> : null}
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

    {current.name !== 'Home' && current.name !== 'Missions' ? <GlobalHomeButton missionMode={missionMode} onPress={missionMode ? goMissionsHome : goHome} /> : null}
    <R1EasterEgg visible={r1Visible} onFinish={() => setR1Visible(false)} />
  </View>;
}

function PhoneModeChooser({ onChoose }) {
  const [palette, setPalette] = useState(() => ({ main: COLORS.orange, dark: COLORS.orangeDark, light: COLORS.orangeLight }));
  const [pack, setPack] = useState(null);

  useEffect(() => {
    let alive = true;
    getActiveVisualPack()
      .then((activePack) => {
        if (!alive) return;
        setRuntimeVisualPalette(activePack?.colors);
        setPack(activePack || null);
        setPalette({
          main: activePack?.colors?.main || COLORS.orange,
          dark: activePack?.colors?.dark || COLORS.orangeDark,
          light: activePack?.colors?.light || COLORS.orangeLight,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const logoUri = resolveVisualPackAssetUri(pack, pack?.interface?.headerLogo);

  return <View style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: 58, paddingHorizontal: 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 26 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.ink }}>Choisir le mode téléphone</Text>
        <Text style={{ marginTop: 7, color: COLORS.inkSoft, lineHeight: 19 }}>Version complète sur téléphone ou compagnon photo de la tablette.</Text>
      </View>
      {logoUri ? <VisualPackAsset uri={logoUri} style={{ width: 48, height: 38 }} /> : null}
    </View>

    <TouchableOpacity onPress={() => onChoose('integral')} activeOpacity={0.84} style={{ minHeight: 164, padding: 18, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, marginBottom: 12 }}>
      <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: palette.light, alignItems: 'center', justifyContent: 'center' }}><CvcIcon name="tools" size={34} color={palette.main} /></View>
      <Text style={{ marginTop: 16, fontSize: 18.5, fontWeight: '900', color: COLORS.ink }}>Version intégrale</Text>
      <Text style={{ marginTop: 5, color: COLORS.inkSoft, lineHeight: 18 }}>Clients, sites, visites, saisies, équipements, photos et exports dans l’interface complète.</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => onChoose('companion')} activeOpacity={0.84} style={{ minHeight: 164, padding: 18, borderRadius: 18, backgroundColor: palette.light, borderWidth: 1.5, borderColor: palette.main }}>
      <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.main }}><CvcIcon name="camera" size={34} color={palette.main} /></View>
      <Text style={{ marginTop: 16, fontSize: 18.5, fontWeight: '900', color: COLORS.ink }}>Compagnon</Text>
      <Text style={{ marginTop: 5, color: COLORS.inkSoft, lineHeight: 18 }}>Scanne le QR d’une visite ou d’un client puis prends les photos directement dans les bonnes rubriques.</Text>
      <View style={{ marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: COLORS.white }}>
        <Text style={{ color: palette.dark, fontSize: 10.5, fontWeight: '900' }}>TABLETTE + TÉLÉPHONE</Text>
      </View>
    </TouchableOpacity>
  </View>;
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const phone = Math.min(width, height) < 600;
  const [phoneMode, setPhoneMode] = useState(null);

  useEffect(() => {
    if (!phone) setPhoneMode(null);
  }, [phone]);

  if (phone && !phoneMode) return <AppErrorBoundary><PhoneModeChooser onChoose={setPhoneMode} /></AppErrorBoundary>;
  if (phone && phoneMode === 'companion') return <AppErrorBoundary><CompanionPhoneScreen onExit={() => setPhoneMode(null)} /></AppErrorBoundary>;
  return <AppErrorBoundary><AppContent phoneIntegralMode={phone && phoneMode === 'integral'} onPhoneModeExit={() => setPhoneMode(null)} /></AppErrorBoundary>;
}
