/** Écran Sites d'un client. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerSitesClient, creerSite, creerVisite } from './db.js';

// ============================================================================
// 8. ÉCRAN SITES D'UN CLIENT
// ============================================================================

function ClientSitesScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState('');

  const charger = useCallback(() => { listerSitesClient(clientId).then(setSites); }, [clientId]);
  useEffect(useCallback(() => { charger(); }, [charger]));

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) { Alert.alert('Nom requis', 'Merci de saisir le nom du site.'); return; }
    await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: nouvelleAdresse.trim() || null });
    setNouveauNom(''); setNouvelleAdresse(''); setModalVisible(false); charger();
  };

  const demarrerVisite = async (site) => {
    const visiteId = await creerVisite({ siteId: site.id, technicien: 'Moi' });
    navigation.navigate('Visite', { visiteId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={sites}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Sites</Text>
            <TouchableOpacity onPress={() => setModalVisible(true)}>
              <Text style={styles.addLink}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => demarrerVisite(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nom_site}</Text>
              {item.adresse ? <Text style={styles.cardSub}>{item.adresse}</Text> : null}
            </View>
            <View style={[styles.badge, item.statut === 'Actif' ? styles.badgeActif : styles.badgeInactif]}>
              <Text style={[styles.badgeText, item.statut === 'Actif' ? styles.badgeTextActif : styles.badgeTextInactif]}>
                {item.statut || 'Actif'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nouveau site</Text>
            <TextInput style={styles.input} placeholder="Nom du site" value={nouveauNom} onChangeText={setNouveauNom} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Adresse (optionnel)" value={nouvelleAdresse} onChangeText={setNouvelleAdresse} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={ajouterSiteFn}>
                <Text style={styles.btnPrimaryText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


export { ClientSitesScreen };
