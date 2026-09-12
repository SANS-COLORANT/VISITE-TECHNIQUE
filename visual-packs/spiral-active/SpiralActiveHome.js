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
  line: 'rgba(255,255,255,0.18)',
  glass: 'rgba(12,17,21,0.54)',
  glassStrong: 'rgba(12,17,21,0.67)',
  white: '#FFFFFF',
  mutedWhite: 'rgba(255,255,255,0.66)',
};

const SECTORS = ['Copro', 'Bailleur', 'Collectivité', 'Tertiaire'];

function formatLastSync(value) {
  if (!value) return 'Aucune synchronisation enregistrée';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Synchronisation enregistrée';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SectorButton({ label, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.sectorButton}
      onPress={onPress}
    >
      <Text style={styles.sectorText}>{label}</Text>
    </TouchableOpacity>
  );
}

function GlassAction({ title, subtitle, primary = false, onPress, disabled = false, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.glassAction, primary ? styles.glassActionPrimary : null, disabled ? styles.glassActionDisabled : null]}
      onPress={onPress}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.actionTitle, primary ? styles.actionTitlePrimary : null]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.actionSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.actionArrow}>›</Text>
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
  const intro = useRef(new Animated.Value(0)).current;
  const [apiStatus, setApiStatus] = useState(null);
  const lastVisit = Array.isArray(visitesEnCours) && visitesEnCours.length ? visitesEnCours[0] : null;
  const contentWidth = Math.min(width - (tablet ? 64 : 28), tablet ? 760 : 620);
  const contentTop = Math.max(tablet ? 246 : 190, Math.min(height * (tablet ? 0.39 : 0.34), tablet ? 312 : 250));

  useEffect(() => {
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: 480,
      delay: 140,
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
  const openSector = (sector) => {
    // Aucun filtre métier sectoriel n'est inventé ici : la catégorie sert d'accès
    // visuel au répertoire tant que le modèle de données ne porte pas ce champ.
    navigation.navigate('MetraDirectory', { query: '', sectorHint: sector });
  };
  const openLastVisit = () => {
    if (lastVisit?.id) navigation.navigate('Visite', { visiteId: lastVisit.id });
  };

  const introOpacity = intro;
  const introY = intro.interpolate({ inputRange: [0, 1], outputRange: [5, 0] });
  const latestSubtitle = lastVisit
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
        <TouchableOpacity
          testID="premium-connectivity-pill"
          accessibilityRole="button"
          activeOpacity={0.86}
          style={styles.connectivityPill}
          onPress={showConnectionDetails}
        >
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
          {SECTORS.map((sector) => <SectorButton key={sector} label={sector} onPress={() => openSector(sector)} />)}
        </View>

        <GlassAction
          testID="premium-intranet-search"
          primary
          title="Recherche Client depuis Intranet"
          subtitle="Données synchronisées · disponibles hors connexion"
          onPress={openDirectory}
        />

        <View style={styles.secondaryRow}>
          <GlassAction
            testID="premium-client-access"
            title="Client"
            subtitle="Clients et sites"
            onPress={openDirectory}
          />
          <GlassAction
            testID="premium-last-visit"
            title="Dernière visite"
            subtitle={latestSubtitle}
            disabled={!lastVisit}
            onPress={openLastVisit}
          />
        </View>
      </Animated.View>

      <SpiralActiveDock exploreActions={exploreActions} actionActions={actionActions} quickActions={quickActions} />

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalKicker}>CLIENT</Text>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nom du client"
              placeholderTextColor="#8A929A"
              value={nouveauNom}
              onChangeText={setNouveauNom}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Code exploitant (optionnel)"
              placeholderTextColor="#8A929A"
              value={nouveauCode}
              onChangeText={setNouveauCode}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={ajouterClient}>
                <Text style={styles.modalConfirmText}>{creationClient ? 'Création…' : 'Créer'}</Text>
              </TouchableOpacity>
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
              <TouchableOpacity style={styles.modalCancel} onPress={() => setImportBatch(null)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmerImport}>
                <Text style={styles.modalConfirmText}>{importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: PALETTE.paper,
  },
  topControls: {
    position: 'absolute',
    top: 22,
    right: 26,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  connectivityPill: {
    minWidth: 108,
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(15,20,24,0.10)',
    backgroundColor: 'rgba(255,253,248,0.86)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotOnline: { backgroundColor: PALETTE.green },
  statusDotOffline: { backgroundColor: PALETTE.orange },
  connectivityText: {
    color: PALETTE.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,20,24,0.10)',
    backgroundColor: 'rgba(255,253,248,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    color: PALETTE.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    position: 'absolute',
    left: '50%',
    zIndex: 25,
  },
  sectorRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 11,
  },
  sectorButton: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: PALETTE.line,
    backgroundColor: 'rgba(12,17,21,0.43)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectorText: {
    color: PALETTE.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  glassAction: {
    minHeight: 68,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.line,
    backgroundColor: PALETTE.glass,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  glassActionPrimary: {
    minHeight: 72,
    backgroundColor: PALETTE.glassStrong,
  },
  glassActionDisabled: {
    opacity: 0.58,
  },
  actionTitle: {
    color: PALETTE.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  actionTitlePrimary: {
    fontSize: 16.5,
  },
  actionSubtitle: {
    marginTop: 3,
    color: PALETTE.mutedWhite,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
  },
  actionArrow: {
    marginLeft: 12,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '300',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 11,
    marginTop: 11,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(7,10,13,0.48)',
  },
  modalSheet: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '84%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#F8F6F0',
    padding: 20,
  },
  modalKicker: {
    color: PALETTE.orange,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  modalTitle: {
    marginTop: 4,
    marginBottom: 15,
    color: PALETTE.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  modalInput: {
    minHeight: 52,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE0DE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: PALETTE.ink,
    fontSize: 14,
  },
  modalActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
  },
  modalCancel: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7DBD9',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#5C646C',
    fontSize: 12,
    fontWeight: '800',
  },
  modalConfirm: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  importRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E3E5E2',
  },
  importName: {
    color: PALETTE.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  importSite: {
    marginTop: 3,
    color: '#6C747B',
    fontSize: 10.5,
  },
});
