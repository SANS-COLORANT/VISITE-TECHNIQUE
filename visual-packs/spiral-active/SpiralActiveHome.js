import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { getActivationStatus } from '../../symfonyApi.js';
import { HomeBuildingScene } from './HomeBuildingScene.js';
import { SpiralActiveDock } from './SpiralActiveDock.js';
import { getHomeLayout } from './homeSceneModel.js';

const MANIFEST = require('./manifest.json');
const PALETTE = {
  paper: '#F4F1E8', ink: '#10161C', orange: '#F26426', green: '#78A84D',
  glass: 'rgba(11,16,20,0.68)', glassStrong: 'rgba(10,15,19,0.80)',
  line: 'rgba(255,255,255,0.18)', mutedWhite: 'rgba(255,255,255,0.78)',
};
const SECTORS = [
  { label: 'Copro', icon: '\u2302' }, { label: 'Bailleur', icon: '\u25a5' },
  { label: 'Collectivit\u00e9', icon: '\u25c7' }, { label: 'Tertiaire', icon: '\u25a4' },
];
function formatLastSync(value) {
  if (!value) return 'Jamais synchronis\u00e9';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Synchronisation enregistr\u00e9e';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} \u00b7 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function SectorButton({ item, onPress, width }) {
  return (
    <TouchableOpacity activeOpacity={0.86} style={[styles.sectorButton, { width }]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={item.label}>
      <View style={styles.sectorIconWrap}><Text allowFontScaling={false} style={styles.sectorIcon}>{item.icon}</Text></View>
      <Text style={styles.sectorText}>{item.label}</Text>
    </TouchableOpacity>
  );
}
function GlassAction({ title, subtitle, primary = false, onPress, disabled = false, testID, style }) {
  return (
    <TouchableOpacity testID={testID} activeOpacity={0.88} accessibilityRole="button"
      accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={[styles.glassAction, primary && styles.glassActionPrimary, disabled && styles.glassActionDisabled, style]}>
      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]}>{title}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text allowFontScaling={false} style={styles.actionArrow}>{'\u203a'}</Text>
    </TouchableOpacity>
  );
}

export function SpiralActiveHome({
  visitesEnCours, navigation, choisirExcel, modalVisible, setModalVisible, nouveauNom, setNouveauNom,
  nouveauCode, setNouveauCode, ajouterClient, creationClient, importBatch, setImportBatch,
  confirmerImport, importEnCours, onR1LongPress,
}) {
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [sceneStatus, setSceneStatus] = useState({ phase: 'loading' });
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const layout = getHomeLayout({
    width: viewport?.width || window.width, height: viewport?.height || window.height,
    fontScale: window.fontScale, canvas: MANIFEST.homeScene.canvas,
  });
  const visits = Array.isArray(visitesEnCours) ? visitesEnCours : [];
  const lastVisit = visits[0] || null;
  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const status = await getActivationStatus();
        if (active) setApiStatus(status);
      } catch (_) {
        if (active) setApiStatus(current => current || { activated: false, lastError: 'Statut indisponible' });
      }
    };
    refreshStatus();
    const timer = setInterval(refreshStatus, 20000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  // Existing Intranet semantics are unchanged; this is not a physical-network probe.
  const online = Boolean(apiStatus?.activated && !apiStatus?.lastError);
  const showConnectionDetails = () => {
    const details = online
      ? `Tablette activ\u00e9e.\nDerni\u00e8re synchronisation : ${formatLastSync(apiStatus?.lastSyncAt)}.`
      : `${apiStatus?.lastError || 'Connexion Intranet indisponible.'}\nLes donn\u00e9es d\u00e9j\u00e0 synchronis\u00e9es restent accessibles hors connexion.`;
    Alert.alert(online ? 'ONLINE' : 'OFFLINE', details);
  };
  const openDirectory = () => navigation.navigate('MetraDirectory', { query: '' });
  const openSector = sector => navigation.navigate('MetraDirectory', { query: '', sectorHint: sector });
  const openLastVisit = () => { if (lastVisit?.id) navigation.navigate('Visite', { visiteId: lastVisit.id }); };
  const lastVisitSubtitle = lastVisit
    ? `${lastVisit.nom_client || 'Client'} \u00b7 ${lastVisit.nom_site || 'Site'}`
    : 'Aucune visite en cours \u00e0 reprendre';
  const exploreActions = [
    { icon: '\u2315', label: 'Recherche', caption: 'Clients & sites', onPress: openDirectory },
    { icon: '\u25a6', label: 'Clients', caption: 'R\u00e9pertoire', onPress: openDirectory },
    lastVisit ? { icon: '\u21ba', label: 'Derni\u00e8re visite', caption: 'Reprendre', onPress: openLastVisit } : null,
  ].filter(Boolean);
  const actionActions = [
    { icon: '\u21e7', label: 'Importer Excel', caption: 'Cr\u00e9er une visite', tone: 'action', onPress: choisirExcel },
    { icon: '+', label: 'Nouveau client', caption: 'Cr\u00e9ation locale', tone: 'action', onPress: () => setModalVisible(true) },
    { icon: '\u2699', label: 'R\u00e9glages', caption: 'Apparence', onPress: () => navigation.navigate('Parametres') },
  ];
  const quickActions = [
    { icon: '\u2315', label: 'Recherche', caption: 'R\u00e9pertoire', onPress: openDirectory },
    lastVisit ? { icon: '\u21ba', label: 'Derni\u00e8re visite', caption: 'Reprendre', onPress: openLastVisit }
      : { icon: '\u25a6', label: 'Clients', caption: 'R\u00e9pertoire', onPress: openDirectory },
    { icon: '\u2699', label: 'R\u00e9glages', caption: 'Apparence', onPress: () => navigation.navigate('Parametres') },
  ];
  const measure = ({ nativeEvent: { layout: next } }) => {
    if (next.width > 0 && next.height > 0) setViewport(previous =>
      previous?.width === next.width && previous?.height === next.height ? previous : { width: next.width, height: next.height });
  };
  return (
    <View style={styles.root} onLayout={measure} testID="premium-home-root">
      <View style={[styles.header, { minHeight: layout.headerHeight, paddingHorizontal: layout.margin }]}>
        <TouchableOpacity testID="premium-connectivity-pill" accessibilityRole="button"
          accessibilityLabel={online ? 'ONLINE' : 'OFFLINE'} activeOpacity={0.86}
          style={styles.connectivityPill} onPress={showConnectionDetails}>
          <View style={[styles.statusDot, { backgroundColor: online ? PALETTE.green : PALETTE.orange }]} />
          <Text style={styles.connectivityText}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Param\u00e8tres'} activeOpacity={0.86}
          delayLongPress={4000} onLongPress={onR1LongPress} style={styles.settingsButton}
          onPress={() => navigation.navigate('Parametres')}>
          <Text allowFontScaling={false} style={styles.settingsIcon}>{'\u2699'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ flexGrow: 1 }}
        removeClippedSubviews={false} keyboardShouldPersistTaps="handled" testID="premium-home-scroll">
        <View style={{ flexGrow: 1, minHeight: layout.bodyHeight, paddingTop: layout.contentTop,
          paddingBottom: layout.dockClearance }}>
          <HomeBuildingScene key={sceneAttempt} frame={layout.sceneFrame} onStatus={setSceneStatus} />
          <View style={[styles.content, { width: layout.contentWidth }]}>
            {sceneStatus.phase === 'error' ? (
              <TouchableOpacity accessibilityRole="button" style={styles.sceneNotice}
                onPress={() => { setSceneStatus({ phase: 'loading' }); setSceneAttempt(n => n + 1); }}>
                <Text style={styles.sceneNoticeText}>{'Visuels indisponibles \u00b7 R\u00e9essayer'}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={[styles.sectorRow, { gap: layout.gap }]}>
              {SECTORS.map(item => <SectorButton key={item.label} item={item} width={layout.sectorWidth} onPress={() => openSector(item.label)} />)}
            </View>
            <GlassAction testID="premium-intranet-search" primary title="Recherche Client depuis Intranet"
              subtitle={online ? 'Recherche en ligne et donn\u00e9es locales synchronis\u00e9es' : 'Donn\u00e9es synchronis\u00e9es disponibles hors connexion'} onPress={openDirectory} />
            <View style={[styles.secondaryRow, { flexDirection: layout.secondaryColumns === 2 ? 'row' : 'column' }]}>
              <GlassAction testID="premium-client-access" title="Client" subtitle="Clients, sites et patrimoine"
                onPress={openDirectory} style={layout.secondaryColumns === 2 ? styles.secondaryAction : null} />
              <GlassAction testID="premium-last-visit" title={'Derni\u00e8re visite'} subtitle={lastVisitSubtitle}
                disabled={!lastVisit} onPress={openLastVisit} style={layout.secondaryColumns === 2 ? styles.secondaryAction : null} />
            </View>
          </View>
        </View>
      </ScrollView>
      <SpiralActiveDock exploreActions={exploreActions} actionActions={actionActions} quickActions={quickActions} />
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalKicker}>CLIENT</Text><Text style={styles.modalTitle}>Nouveau client</Text>
          <TextInput style={styles.modalInput} placeholder="Nom du client" placeholderTextColor="#8A929A" value={nouveauNom} onChangeText={setNouveauNom} />
          <TextInput style={styles.modalInput} placeholder="Code exploitant (optionnel)" placeholderTextColor="#8A929A" value={nouveauCode} onChangeText={setNouveauCode} />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirm} onPress={ajouterClient}><Text style={styles.modalConfirmText}>{creationClient ? 'Cr\u00e9ation\u2026' : 'Cr\u00e9er'}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
      <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalKicker}>IMPORT</Text><Text style={styles.modalTitle}>Excel en lot</Text>
          {importBatch ? <ScrollView style={{ maxHeight: 360 }}>
            {importBatch.analyses.map((analysis, index) => <View key={`${analysis.sourceId || analysis.nomFichier}-${index}`} style={styles.importRow}>
              <Text style={styles.importName}>{analysis.nomFichier}</Text><Text style={styles.importSite}>{analysis.client}{' \u00b7 '}{analysis.site}</Text>
            </View>)}
          </ScrollView> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setImportBatch(null)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirm} onPress={confirmerImport}><Text style={styles.modalConfirmText}>{importEnCours ? 'Import\u2026' : `Importer ${importBatch?.analyses?.length || 0}`}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: PALETTE.paper },
  header: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 12, backgroundColor: PALETTE.paper },
  connectivityPill: { minWidth: 112, minHeight: 44, paddingHorizontal: 15, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(15,20,24,0.10)', backgroundColor: 'rgba(255,253,248,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  connectivityText: { color: PALETTE.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, flexShrink: 1 },
  settingsButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(15,20,24,0.10)', backgroundColor: 'rgba(255,253,248,0.92)', alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { color: PALETTE.ink, fontSize: 22 },
  body: { flex: 1 },
  content: { alignSelf: 'center', zIndex: 20 },
  sectorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  sectorButton: { minHeight: 54, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: 'rgba(10,15,19,0.66)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sectorIconWrap: { width: 22, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: 'transparent' },
  sectorIcon: { color: '#FFFFFF', fontSize: 17 },
  sectorText: { flexShrink: 1, color: '#FFFFFF', fontSize: 13.5, fontWeight: '700', backgroundColor: 'transparent' },
  glassAction: { minHeight: 82, borderRadius: 20, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.glass, paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', alignItems: 'center' },
  glassActionPrimary: { minHeight: 90, backgroundColor: PALETTE.glassStrong },
  glassActionDisabled: { backgroundColor: 'rgba(45,51,55,0.74)' },
  actionTextWrap: { flex: 1, minWidth: 0, backgroundColor: 'transparent' },
  actionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', backgroundColor: 'transparent' },
  actionTitlePrimary: { fontSize: 19 },
  actionSubtitle: { marginTop: 5, color: PALETTE.mutedWhite, fontSize: 13, backgroundColor: 'transparent' },
  actionArrow: { marginLeft: 10, color: 'rgba(255,255,255,0.82)', fontSize: 25, flexShrink: 0 },
  secondaryRow: { gap: 12, marginTop: 12 },
  secondaryAction: { flex: 1, minWidth: 0 },
  sceneNotice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderRadius: 12, backgroundColor: '#FFFDF8' },
  sceneNoticeText: { color: PALETTE.ink, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(9,13,17,0.42)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalSheet: { width: '100%', maxWidth: 520, borderRadius: 24, backgroundColor: '#FFFDF8', padding: 22, borderWidth: 1, borderColor: '#DDE1E3', elevation: 18 },
  modalKicker: { color: PALETTE.orange, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  modalTitle: { marginTop: 3, marginBottom: 16, color: PALETTE.ink, fontSize: 22, fontWeight: '900' },
  modalInput: { minHeight: 50, marginBottom: 10, borderRadius: 15, borderWidth: 1, borderColor: '#DDE1E3', backgroundColor: '#F5F5F1', paddingHorizontal: 14, color: PALETTE.ink, fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel: { flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#D7DCE0', alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { color: PALETTE.ink, fontSize: 12.5, fontWeight: '800' },
  modalConfirm: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: PALETTE.ink, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  importRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E3E6E8' },
  importName: { color: PALETTE.ink, fontSize: 12.5, fontWeight: '800' },
  importSite: { marginTop: 2, color: '#6D7780', fontSize: 10.5 },
});
