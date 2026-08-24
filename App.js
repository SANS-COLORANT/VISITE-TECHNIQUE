/** VISITE TECHNIQUE — point d'entrée natif Android. */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, BackHandler } from 'react-native';

import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { HomeScreen } from './HomeScreen.js';
import { ClientSitesScreen } from './ClientSitesScreen.js';
import { VisiteScreen } from './VisiteScreen.js';
import { ParametresScreen } from './ParametresScreen.js';
import { SiteVisitesScreen } from './SiteVisitesScreen.js';

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

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);

  const initialiser = useCallback(async () => {
    setDbReady(false);
    setDbError(null);
    try {
      await getDb();
      setDbReady(true);
    } catch (err) {
      setDbError(err);
    }
  }, []);

  useEffect(() => { initialiser(); }, [initialiser]);

  const navigate = useCallback((name, params = {}) => {
    // Évite d'empiler deux fois le même écran lors d'un double tap rapide.
    setStack((s) => {
      const current = s[s.length - 1];
      if (current?.name === name && JSON.stringify(current.params || {}) === JSON.stringify(params || {})) return s;
      return [...s, { name, params }];
    });
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // La navigation interne étant volontairement légère, on raccorde
  // explicitement le bouton Retour Android à notre pile d'écrans.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false; // laisse Android quitter depuis l'accueil
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [stack.length, goBack]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Erreur de démarrage</Text>
        <Text style={styles.errorText}>{String(dbError.message || dbError)}</Text>
        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 18 }]} onPress={initialiser}>
          <Text style={styles.btnPrimaryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.orange} />
        <Text style={[styles.cardSub, { marginTop: 12 }]}>Préparation des données locales…</Text>
      </View>
    );
  }

  const current = stack[stack.length - 1];
  const navigation = { navigate, goBack };
  const route = { params: current.params };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {current.name === 'Home' && (
        <>
          <SimpleHeader title="Visite Technique" />
          <HomeScreen navigation={navigation} route={route} />
        </>
      )}
      {current.name === 'ClientSites' && (
        <>
          <SimpleHeader title={current.params?.nomClient || 'Sites'} onBack={goBack} />
          <ClientSitesScreen navigation={navigation} route={route} />
        </>
      )}
      {current.name === 'SiteVisites' && (
        <>
          <SimpleHeader title={current.params?.nomSite || 'Visites'} onBack={goBack} />
          <SiteVisitesScreen navigation={navigation} route={route} />
        </>
      )}
      {current.name === 'Visite' && (
        <VisiteScreen navigation={navigation} route={route} onBack={goBack} />
      )}
      {current.name === 'Parametres' && (
        <>
          <SimpleHeader title="Paramètres" onBack={goBack} />
          <ParametresScreen />
        </>
      )}
    </View>
  );
}
