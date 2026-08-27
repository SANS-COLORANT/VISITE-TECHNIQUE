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
import { MetraLoadingScreen } from './MetraLoadingScreen.js';
import { DoomLoadingScreen, DOOM_ANIMATION_MS } from './DoomLoadingScreen.js';
import { R1EasterEgg } from './R1EasterEgg.js';
import { getAppThemeMode, THEME_ANIMATED } from './themePreference.js';
import { setRuntimeThemeMode } from './themeRuntime.js';

const CLASSIC_LOADING_ANIMATION_MS = 2300;
const SPLASH_BG = '#FBF0E1';

function SimpleHeader({ title, onBack }) {
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
      <View style={styles.simpleHeaderBack} />
    </View>
  );
}

function AppContent() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [themeMode, setThemeMode] = useState(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);
  const [r1Visible, setR1Visible] = useState(false);

  const initialiser = useCallback(async () => {
    setDbReady(false);
    setDbError(null);
    setThemeMode(null);
    try {
      await getDb();
      const mode = await getAppThemeMode();
      setRuntimeThemeMode(mode);
      setThemeMode(mode);
      const animationMs = mode === THEME_ANIMATED ? DOOM_ANIMATION_MS : CLASSIC_LOADING_ANIMATION_MS;
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

  const handleThemeChanged = useCallback((mode) => {
    setRuntimeThemeMode(mode);
    setThemeMode(mode);
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
  if (!themeMode) return <View style={{ flex: 1, backgroundColor: SPLASH_BG }} />;
  if (!dbReady) return themeMode === THEME_ANIMATED ? <DoomLoadingScreen /> : <MetraLoadingScreen />;

  const current = stack[stack.length - 1];
  const navigation = { navigate, goBack };
  const route = { params: current.params };

  return (
    <View key={`theme-${themeRevision}`} style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {current.name === 'Home' && <><SimpleHeader title="Visite Technique" /><HomeScreen navigation={navigation} route={route} onR1LongPress={() => setR1Visible(true)} /></>}
      {current.name === 'ClientSites' && <><SimpleHeader title={current.params?.nomClient || 'Sites'} onBack={goBack} /><ClientSitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'ClientPatrimoine' && <><SimpleHeader title="Synthèse patrimoine" onBack={goBack} /><ClientPatrimoineScreen navigation={navigation} route={route} /></>}
      {current.name === 'SiteVisites' && <><SimpleHeader title={current.params?.nomSite || 'Visites'} onBack={goBack} /><SiteVisitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'Visite' && <VisiteScreen navigation={navigation} route={route} onBack={goBack} />}
      {current.name === 'Report' && <ReportScreen route={route} onBack={goBack} />}
      {current.name === 'Parametres' && <><SimpleHeader title="Paramètres" onBack={goBack} /><ParametresWithThemeScreen themeMode={themeMode} onThemeChanged={handleThemeChanged} /></>}
      <R1EasterEgg visible={r1Visible} onFinish={() => setR1Visible(false)} />
    </View>
  );
}

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }
