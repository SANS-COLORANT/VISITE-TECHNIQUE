/**
 * VISITE TECHNIQUE — Point d'entrée.
 *
 * Navigation "maison" (un simple useState qui garde l'écran actif), sans
 * aucune dépendance à @react-navigation : ces librairies posaient des
 * problèmes de compatibilité récurrents avec l'environnement Snack
 * (modules natifs manquants, versions incompatibles). Une pile de 2-3
 * écrans ne justifie pas une vraie librairie de navigation.
 *
 * Dépendances npm nécessaires :
 *   expo-sqlite, expo-image-picker
 *   (plus aucune dépendance de navigation)
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';

import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { HomeScreen } from './HomeScreen.js';
import { ClientSitesScreen } from './ClientSitesScreen.js';
import { VisiteScreen } from './VisiteScreen.js';

/** Petite barre de titre réutilisable, avec bouton retour optionnel. */
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

  // Pile de navigation minimale : un tableau d'écrans empilés.
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);

  useEffect(() => {
    getDb().then(() => setDbReady(true)).catch((err) => setDbError(err));
  }, []);

  const navigate = (name, params = {}) => {
    setStack((s) => [...s, { name, params }]);
  };
  const goBack = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Erreur de démarrage</Text>
        <Text style={styles.errorText}>{String(dbError.message || dbError)}</Text>
      </View>
    );
  }
  if (!dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.orange} />
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
      {current.name === 'Visite' && (
        <VisiteScreen navigation={navigation} route={route} onBack={goBack} />
      )}
    </View>
  );
}
