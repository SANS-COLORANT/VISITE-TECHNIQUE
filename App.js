/**
 * VISITE TECHNIQUE — Point d'entrée.
 *
 * Toute la logique vit dans src/ (base de données, référentiel de la trame,
 * bibliothèque de préconisations, composants génériques, écrans). Ce fichier
 * ne fait que monter la navigation.
 *
 * Dépendances npm nécessaires :
 *   expo-sqlite, expo-image-picker,
 *   @react-navigation/native, @react-navigation/stack,
 *   react-native-safe-area-context, react-native-screens
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { HomeScreen } from './HomeScreen.js';
import { ClientSitesScreen } from './ClientSitesScreen.js';
import { VisiteScreen } from './VisiteScreen.js';

const Stack = createStackNavigator();

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    getDb().then(() => setDbReady(true)).catch((err) => setDbError(err));
  }, []);

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

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.white },
            headerTitleStyle: { fontWeight: '600', color: COLORS.ink },
            contentStyle: { backgroundColor: COLORS.bg },
            cardStyle: { backgroundColor: COLORS.bg },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Visite Technique' }} />
          <Stack.Screen
            name="ClientSites"
            component={ClientSitesScreen}
            options={({ route }) => ({ title: route.params?.nomClient ?? 'Sites' })}
          />
          <Stack.Screen name="Visite" component={VisiteScreen} options={{ title: 'Visite', headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
