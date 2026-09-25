import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getDb } from './db.js';
import { creerVisiteProduction } from './visitCreationDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { IntranetSiteLocalsPanel } from './IntranetStructureUi.js';

export function IntranetStructureScreen({ route, navigation }) {
  const { siteId, nomSite } = route?.params || {};
  const [creatingVisit, setCreatingVisit] = useState(false);

  const startVisit = async (context) => {
    if (creatingVisit || !siteId) return;
    if (!context?.localTrameId) {
      Alert.alert('Trame non reconnue', 'Cette trame Intranet ne possède pas encore de correspondance sûre dans METRA.');
      return;
    }
    setCreatingVisit(true);
    try {
      const visiteId = await creerVisiteProduction({
        siteId,
        mode: 'complete',
        trameId: context.localTrameId,
        installationId: context.installationId || null,
        apiRemoteClientId: context.remoteClientId || null,
        apiRemoteLocalId: context.remoteLocalId || null,
        apiRemoteTrameId: context.remoteTrameId || null,
      });
      const database = await getDb();
      await preremplirVisiteDepuisContexte(database, visiteId);
      navigation.navigate('Visite', { visiteId });
    } catch (error) {
      Alert.alert('Création de visite impossible', String(error?.message || error));
    } finally { setCreatingVisit(false); }
  };

  return <View style={{ flex: 1 }}>
    <View style={[styles.content, { paddingBottom: 8 }]}> 
      <Text style={styles.sectionLabel}>Locaux techniques · {nomSite || 'Site'}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginBottom: 12 }}>
        Les nouveaux locaux sont enregistrés d’abord sur la tablette. Une visite peut être commencée immédiatement ; son rattachement Intranet est complété automatiquement lorsque la création du local est confirmée par le serveur.
      </Text>
      {creatingVisit ? <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 11, marginBottom: 8 }}>Préparation de la visite…</Text> : null}
    </View>
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      <IntranetSiteLocalsPanel siteId={siteId} onStartVisit={startVisit} />
    </View>
  </View>;
}
