/** Écran Historique des visites d'un site — remplace la création automatique. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerVisitesSite, creerVisite } from './db.js';

const STATUT_LABELS = { en_cours: 'En cours', terminee: 'Terminée', a_completer: 'À compléter', exportee: 'Exportée' };

function SiteVisitesScreen({ route, navigation }) {
  const { siteId, nomSite } = route.params;
  const [visites, setVisites] = useState([]);

  const charger = useCallback(() => {
    listerVisitesSite(siteId).then(setVisites);
  }, [siteId]);

  useEffect(() => { charger(); }, [charger]);

  const nouvelleVisite = async () => {
    const visiteId = await creerVisite({ siteId, technicien: 'Moi' });
    navigation.navigate('Visite', { visiteId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visites}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionLabel}>Historique des visites — {nomSite}</Text>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Visite', { visiteId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.date_visite || 'Sans date'}</Text>
              <Text style={styles.cardSub}>{item.technicien || ''}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {STATUT_LABELS[item.statut] || item.statut} · {item.progression_pct}%
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune visite pour ce site pour l'instant.</Text>
            <Text style={styles.emptySub}>Lance la première avec le bouton ci-dessous.</Text>
          </View>
        }
      />
      <View style={styles.fabBar}>
        <TouchableOpacity style={[styles.btnPrimary, styles.fabButton]} onPress={nouvelleVisite}>
          <Text style={styles.btnPrimaryText}>+ Nouvelle visite</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export { SiteVisitesScreen };
