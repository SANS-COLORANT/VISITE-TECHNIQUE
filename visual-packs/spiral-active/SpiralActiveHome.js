import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { getActivationStatus } from '../../symfonyApi.js';
import { HomeBuildingScene } from './HomeBuildingScene.js';
import { SpiralActiveDock } from './SpiralActiveDock.js';

const PALETTE = {
  paper: '#F4F1E8',
  ink: '#10161C',
  orange: '#F26426',
  green: '#78A84D',
  glass: 'rgba(11,16,20,0.68)',
  glassStrong: 'rgba(10,15,19,0.80)',
  line: 'rgba(255,255,255,0.18)',
  white: '#FFFFFF',
  mutedWhite: 'rgba(255,255,255,0.70)',
};

const SECTORS = [
  { label: 'Copro', icon: '⌂' },
  { label: 'Bailleur', icon: '▥' },
  { label: 'Collectivité', icon: '◇' },
  { label: 'Tertiaire', icon: '▤' },
];

function formatLastSync(value) {
  if (!value) return 'Jamais synchronisé';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Synchronisation enregistrée';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SectorButton({ item, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.sectorButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={styles.sectorIconWrap}>
        <Text style={styles.sectorIcon} maxFontSizeMultiplier={1.05}>{item.icon}</Text>
      </View>
      <Text
        style={styles.sectorText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.80}
        maxFontSizeMultiplier={1.05}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

function GlassAction({ title, subtitle, primary = false, onPress, disabled = false, testID, style }) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.glassAction, primary ? styles.glassActionPrimary : null, disabled ? styles.glassActionDisabled : null, style]}
      onPress={onPress}
    >
      <View style={styles.actionTextWrap}>
        <Text
          style={[styles.actionTitle, primary ? styles.actionTitlePrimary : null]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={primary ? 0.82 : 0.78}
          maxFontSizeMultiplier={1.08}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={styles.actionSubtitle}
            numberOfLines={primary ? 1 : 2}
            maxFontSizeMultiplier={1.08}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={styles.actionArrow} maxFontSizeMultiplier={1.05}>›</Text>
    </TouchableOpacity>
  );
}

export function SpiralActiveHome({
  visitesEnCours,
  navigation,
  choisirExcel,
  modalVisible,
  setModalVisible,
  nouveauNom,
  setNouveauNom,
  nouveauCode,
  setNouveauCode,
  ajouterClient,
  creationClient,
  importBatch,
  setImportBatch,
  confirmerImport,
  importEnCours,
  onR1LongPress,
}) {
  const { width, height } = useWindowDimensions();
  const tablet = width >= 800;
  const portrait = height > width;
  const intro = useRef(new Animated.Value(0)).current;
  const [apiStatus, setApiStatus] = useState(null);

  const visits = Array.isArray(visitesEnCours) ? visitesEnCours : [];
  const lastVisit = visits[0] || null;
  const contentWidth = Math.min(width - (tablet ? 64 : 28), tablet ? 850 : 620);
  const contentTop = portrait
    ? Math.max(405, Math.min(height * 0.30, 468))
    : Math.max(178, Math.min(height * 0.25, 245));

  useEffect(() => {
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: 520,
      delay: 110,
      easing: Easing.bezier(0.18, 0.8, 0.22, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [intro]);

  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const status = await getActivationStatus();
        if (active) setApiStatus(status);
      } catch (_) {
        if (active) setApiStatus((current) => current || { activated: false, lastError: 'Statut indisponible' });
      }
    };
    refreshStatus();
    const timer = setInterval(refreshStatus, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const online = Boolean(apiStatus?.activated && !apiStatus?.lastError);
  const showConnectionDetails = () => {
    const details = online
      ? `Tablette activée.\nDernière synchronisation : ${formatLastSync(apiStatus?.lastSyncAt)}.`
      : `${apiStatus?.lastError || 'Connexion Intranet indisponible.'}\nLes données déjà synchronisées restent accessibles hors connexion.`;
    Alert.alert(online ? 'ONLINE' : 'OFFLINE', details);
  };

  const openDirectory = () => navigation.navigate('MetraDirectory', { query: '' });
  const openSector = (sector) => navigation.navigate('MetraDirectory', { query: '', sectorHint: sector });
  const openLastVisit = () => {
    if (lastVisit?.id) navigation.navigate('Visite', { visiteId: lastVisit.id });
  };

  const introOpacity = intro;
  const introY = intro.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const lastVisitSubtitle = lastVisit
    ? `${lastVisit.nom_client || 'Client'} · ${lastVisit.nom_site || 'Site'}`
    : 'Aucune visite en cours à reprendre';

  const exploreActions = [
    { icon: '⌕', label: 'Recherche', caption: 'Clients & sites', onPress: openDirectory },
    { icon: '▦', label: 'Clients', caption: 'Répertoire', onPress: openDirectory },
    lastVisit ? { icon: '↺', label: 'Dernière visite', caption: 'Reprendre', onPress: openLastVisit } : null,
  ].filter(Boolean);
  const actionActions = [
    { icon: '⇧', label: 'Importer Excel', caption: 'Créer une visite', tone: 'action', onPress: choisirExcel },
    { icon: '+', label: 'Nouveau client', caption: 'Création locale', tone: 'action', onPress: () => setModalVisible(true) },
    { icon: '⚙', label: 'Réglages', caption: 'Apparence', onPress: () => navigation.navigate('Parametres') },
  ];
  const quickActions = [
    { icon: '⌕', label: 'Recherche', caption: 'Répertoire', onPress: openDirectory },
    lastVisit ? { icon: '↺', label: 'Dernière visite', caption: 'Reprendre', onPress: openLastVisit } : { icon: '▦', label: 'Clients', caption: 'Répertoire', onPress: openDirectory },
    { icon: '⚙', label: 'Réglages', caption: 'Apparence', onPress: () => navigation.navigate('Parametres') },
  ];

  return (
    <View style={styles.root}>
      <HomeBuildingScene />

      <Animated.View style={[styles.topControls, { opacity: introOpacity, transform: [{ translateY: introY }] }]}>
        <TouchableOpacity testID="premium-connectivity-pill" activeOpacity={0.86} style={styles.connectivityPill} onPress={showConnectionDetails}>
          <View style={[styles.statusDot, online ? styles.statusDotOnline : styles.statusDotOffline]} />
          <Text style={styles.connectivityText}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Paramètres"
          activeOpacity={0.86}
          delayLongPress={4000}
          onLongPress={onR1LongPress}
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Parametres')}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.content,
          {
            top: contentTop,
            width: contentWidth,
            marginLeft: -(contentWidth / 2),
            opacity: introOpacity,
            transform: [{ translateY: introY }],
          },
        ]}
      >
        <View style={styles.sectorRow}>
          {SECTORS.map((item) => <SectorButton key={item.label} item={item} onPress={() => openSector(item.label)} />)}
        </View>

        <GlassAction
          testID="premium-intranet-search"
          primary
          title="Recherche Client depuis Intranet"
          subtitle={online ? 'Recherche en ligne et données locales synchronisées' : 'Données synchronisées disponibles hors connexion'}
          onPress={openDirectory}
        />

        <View style={styles.secondaryRow}>
          <GlassAction
            testID="premium-client-access"
            title="Client"
            subtitle="Clients, sites et patrimoine"
            onPress={openDirectory}
            style={styles.secondaryAction}
          />
          <GlassAction
            testID="premium-last-visit"
            title="Dernière visite"
            subtitle={lastVisitSubtitle}
            disabled={!lastVisit}
            onPress={openLastVisit}
            style={styles.secondaryAction}
          />
        </View>
      </Animated.View>

      <SpiralActiveDock exploreActions={exploreActions} actionActions={actionActions} quickActions={quickActions} />

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalKicker}>CLIENT</Text>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <TextInput style={styles.modalInput} placeholder="Nom du client" placeholderTextColor="#8A929A" value={nouveauNom} onChangeText={setNouveauNom} />
            <TextInput style={styles.modalInput} placeholder="Code exploitant (optionnel)" placeholderTextColor="#8A929A" value={nouveauCode} onChangeText={setNouveauCode} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={ajouterClient}><Text style={styles.modalConfirmText}>{creationClient ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalKicker}>IMPORT</Text>
            <Text style={styles.modalTitle}>Excel en lot</Text>
            {importBatch ? (
              <ScrollView style={{ maxHeight: 360 }}>
                {importBatch.analyses.map((analysis, index) => (
                  <View key={`${analysis.sourceId || analysis.nomFichier}-${index}`} style={styles.importRow}>
                    <Text style={styles.importName}>{analysis.nomFichier}</Text>
                    <Text style={styles.importSite}>{analysis.client} · {analysis.site}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setImportBatch(null)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmerImport}><Text style={styles.modalConfirmText}>{importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: PALETTE.paper },
  topControls: { position: 'absolute', top: 24, right: 28, zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectivityPill: { minWidth: 112, minHeight: 42, paddingHorizontal: 15, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(15,20,24,0.10)', backgroundColor: 'rgba(255,253,248,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotOnline: { backgroundColor: PALETTE.green },
  statusDotOffline: { backgroundColor: PALETTE.orange },
  connectivityText: { color: PALETTE.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  settingsButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(15,20,24,0.10)', backgroundColor: 'rgba(255,253,248,0.92)', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  settingsIcon: { color: PALETTE.ink, fontSize: 19, fontWeight: '800' },
  content: { position: 'absolute', left: '50%', zIndex: 25 },
  sectorRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sectorButton: { flex: 1, minWidth: 0, minHeight: 60, paddingHorizontal: 6, borderRadius: 18, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: 'rgba(10,15,19,0.66)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  sectorIconWrap: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectorIcon: { color: '#FFFFFF', fontSize: 13, lineHeight: 15, fontWeight: '800' },
  sectorText: { flexShrink: 1, color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.05, textAlign: 'center' },
  glassAction: { minHeight: 82, borderRadius: 22, borderWidth: 1, borderColor: PALETTE.line, backgroundColor: PALETTE.glass, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  glassActionPrimary: { minHeight: 90, backgroundColor: PALETTE.glassStrong },
  glassActionDisabled: { opacity: 0.78 },
  actionTextWrap: { flex: 1, minWidth: 0 },
  actionTitle: { color: '#FFFFFF', fontSize: 15.5, lineHeight: 20, fontWeight: '800', letterSpacing: -0.2 },
  actionTitlePrimary: { fontSize: 18, lineHeight: 23 },
  actionSubtitle: { marginTop: 4, color: PALETTE.mutedWhite, fontSize: 10.5, lineHeight: 13.5, fontWeight: '600' },
  actionArrow: { marginLeft: 10, color: 'rgba(255,255,255,0.82)', fontSize: 25, lineHeight: 28, fontWeight: '300', flexShrink: 0 },
  secondaryRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  secondaryAction: { flex: 1, minWidth: 0, minHeight: 94 },
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
