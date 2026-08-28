/** VISITE TECHNIQUE — point d'entrée natif Android. */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard } from 'react-native';

import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { HomeScreen } from './HomeScreen.js';
import { ClientSitesScreen } from './ClientSitesScreen.js';
import { ClientPatrimoineScreen } from './ClientPatrimoineScreen.js';
import { VisiteScreen } from './VisiteScreen.js';
import { ParametresWithThemeScreen } from './ParametresWithThemeScreen.js';
import { SiteVisitesScreen } from './SiteVisitesScreen.js';
import { ReportScreen } from './ReportScreen.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { VisualPackLoadingScreen } from './VisualPackLoadingScreen.js';
import { VisualPackAsset } from './VisualPackAsset.js';
import { R1EasterEgg } from './R1EasterEgg.js';
import { getAppThemeMode } from './themePreference.js';
import { setRuntimeThemeMode, setRuntimeVisualPalette } from './themeRuntime.js';
import {
  getActiveVisualPack,
  getVisualPackStartupDuration,
  resolveVisualPackAssetUri,
} from './visualPackManager.js';

const SPLASH_BG = '#FBF0E1';

function SimpleHeader({ title, onBack, visualPack }) {
  const headerLogoUri = resolveVisualPackAssetUri(visualPack, visualPack?.interface?.headerLogo);
  return (
    <View style={styles.simpleHeader}>
      {onBack ? (
        <TouchableOpacity style={styles.simpleHeaderBack} onPress={onBack}>
          <Text style={styles.simpleHeaderBackText}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.simpleHeaderBack} />
      )}
      <Text style={styles.simpleHeaderTitle}>{title}</Text>
      <View style={styles.simpleHeaderBack}>
        {headerLogoUri ? <VisualPackAsset uri={headerLogoUri} style={{ width: 34, height: 26 }} /> : null}
      </View>
    </View>
  );
}

function AppContent() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [themeMode, setThemeMode] = useState(null);
  const [visualPack, setVisualPack] = useState(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);
  const [r1Visible, setR1Visible] = useState(false);

  const initialiser = useCallback(async () => {
    setDbReady(false);
    setDbError(null);
    setThemeMode(null);
    setVisualPack(null);
    try {
      await getDb();
      const mode = await getAppThemeMode();
      const pack = await getActiveVisualPack(mode);
      setRuntimeThemeMode(mode);
      setRuntimeVisualPalette(pack?.colors);
      setThemeMode(mode);
      setVisualPack(pack);
      const animationMs = getVisualPackStartupDuration(pack, mode);
      await new Promise((resolve) => setTimeout(resolve, animationMs));
      setDbReady(true);
    } catch (err) {
      setDbError(err);
    }
  }, []);

  useEffect(() => { initialiser(); }, [initialiser]);

  const navigate = useCallback((name, params = {}) => {
    setStack((s) => {
      const current = s[s.length - 1];
      if (current?.name === name && JSON.stringify(current.params || {}) === JSON.stringify(params || {})) return s;
      return [...s, { name, params }];
    });
  }, []);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => { setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, 0);
  }, []);

  const handleThemeChanged = useCallback((mode, pack) => {
    setRuntimeThemeMode(mode);
    setRuntimeVisualPalette(pack?.colors);
    setThemeMode(mode);
    setVisualPack(pack);
    setThemeRevision((v) => v + 1);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (r1Visible) return true;
      if (stack.length <= 1) return false;
      goBack(); return true;
    });
    return () => subscription.remove();
  }, [stack.length, goBack, r1Visible]);

  if (dbError) return <View style={styles.center}><Text style={styles.errorTitle}>Erreur de démarrage</Text><Text style={styles.errorText}>{String(dbError.message || dbError)}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 18 }]} onPress={initialiser}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity></View>;
  if (!themeMode || !visualPack) return <View style={{ flex: 1, backgroundColor: SPLASH_BG }} />;
  if (!dbReady) return <VisualPackLoadingScreen pack={visualPack} themeMode={themeMode} />;

  const current = stack[stack.length - 1];
  const navigation = { navigate, goBack };
  const route = { params: current.params };

  return (
    <View key={`theme-${themeRevision}-${visualPack.id}`} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {current.name === 'Home' && <><SimpleHeader title="Visite Technique" visualPack={visualPack} /><HomeScreen navigation={navigation} route={route} onR1LongPress={() => setR1Visible(true)} /></>}
      {current.name === 'ClientSites' && <><SimpleHeader title={current.params?.nomClient || 'Sites'} onBack={goBack} visualPack={visualPack} /><ClientSitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'ClientPatrimoine' && <><SimpleHeader title="Synthèse patrimoine" onBack={goBack} visualPack={visualPack} /><ClientPatrimoineScreen navigation={navigation} route={route} /></>}
      {current.name === 'SiteVisites' && <><SimpleHeader title={current.params?.nomSite || 'Visites'} onBack={goBack} visualPack={visualPack} /><SiteVisitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'Visite' && <VisiteScreen navigation={navigation} route={route} onBack={goBack} />}
      {current.name === 'Report' && <ReportScreen route={route} onBack={goBack} />}
      {current.name === 'Parametres' && <><SimpleHeader title="Paramètres" onBack={goBack} visualPack={visualPack} /><ParametresWithThemeScreen themeMode={themeMode} visualPack={visualPack} onThemeChanged={handleThemeChanged} /></>}
      <R1EasterEgg visible={r1Visible} onFinish={() => setR1Visible(false)} />
    </View>
  );
}

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }
