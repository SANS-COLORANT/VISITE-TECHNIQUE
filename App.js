/** VISITE TECHNIQUE — point d'entrée natif Android. */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, Keyboard } from 'react-native';

import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { HomeScreen } from './HomeScreen.js';
import { ClientSitesScreen } from './ClientSitesScreen.js';
import { ClientPatrimoineScreen } from './ClientPatrimoineScreen.js';
import { VisiteScreen } from './VisiteScreen.js';
import { ParametresScreen } from './ParametresScreen.js';
import { SiteVisitesScreen } from './SiteVisitesScreen.js';
import { ReportScreen } from './ReportScreen.js';
import { AppErrorBoundary } from './AppErrorBoundary.js';
import { MetraLoadingScreen } from './MetraLoadingScreen.js';
import { R1EasterEgg } from './R1EasterEgg.js';

const LOADING_ANIMATION_MS = 2300;

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
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);
  const [r1Visible, setR1Visible] = useState(false);

  const initialiser = useCallback(async () => {
    setDbReady(false); setDbError(null);
    try {
      await Promise.all([getDb(), new Promise((resolve) => setTimeout(resolve, LOADING_ANIMATION_MS))]);
      setDbReady(true);
    } catch (err) { setDbError(err); }
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (r1Visible) return true;
      if (stack.length <= 1) return false;
      goBack(); return true;
    });
    return () => subscription.remove();
  }, [stack.length, goBack, r1Visible]);

  if (dbError) return <View style={styles.center}><Text style={styles.errorTitle}>Erreur de démarrage</Text><Text style={styles.errorText}>{String(dbError.message || dbError)}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 18 }]} onPress={initialiser}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity></View>;
  if (!dbReady) return <MetraLoadingScreen />;

  const current = stack[stack.length - 1];
  const navigation = { navigate, goBack };
  const route = { params: current.params };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {current.name === 'Home' && <><SimpleHeader title="Visite Technique" /><HomeScreen navigation={navigation} route={route} onR1LongPress={() => setR1Visible(true)} /></>}
      {current.name === 'ClientSites' && <><SimpleHeader title={current.params?.nomClient || 'Sites'} onBack={goBack} /><ClientSitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'ClientPatrimoine' && <><SimpleHeader title="Synthèse patrimoine" onBack={goBack} /><ClientPatrimoineScreen navigation={navigation} route={route} /></>}
      {current.name === 'SiteVisites' && <><SimpleHeader title={current.params?.nomSite || 'Visites'} onBack={goBack} /><SiteVisitesScreen navigation={navigation} route={route} /></>}
      {current.name === 'Visite' && <VisiteScreen navigation={navigation} route={route} onBack={goBack} />}
      {current.name === 'Report' && <ReportScreen route={route} onBack={goBack} />}
      {current.name === 'Parametres' && <><SimpleHeader title="Paramètres" onBack={goBack} /><ParametresScreen /></>}
      <R1EasterEgg visible={r1Visible} onFinish={() => setR1Visible(false)} />
    </View>
  );
}

export default function App() { return <AppErrorBoundary><AppContent /></AppErrorBoundary>; }
