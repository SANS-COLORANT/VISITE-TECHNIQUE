/** Écran Accueil. */

import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, styles } from './styles';
import { listerClients, creerClient, listerVisitesEnCours, compterVisites } from './db';

// ============================================================================
// 7. ÉCRAN ACCUEIL
// ============================================================================

function HomeScreen({ navigation }) {
  const [clients, setClients] = useState([]);
  const [visitesEnCours, setVisitesEnCours] = useState([]);
  const [stats, setStats] = useState({ enCours: 0, terminees: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');

  const charger = useCallback(async () => {
    const [c, v, s] = await Promise.all([listerClients(), listerVisitesEnCours(), compterVisites()]);
    setClients(c); setVisitesEnCours(v); setStats(s);
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  const onRefresh = async () => { setRefreshing(true); await charger(); setRefreshing(false); };

  const ajouterClient = async () => {
    if (!nouveauNom.trim()) { Alert.alert('Nom requis', 'Merci de saisir le nom du client.'); return; }
    await creerClient({ nom: nouveauNom.trim(), codeExploitant: nouveauCode.trim() || null });
    setNouveauNom(''); setNouveauCode(''); setModalVisible(false); charger();
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} />}
        ListHeaderComponent={
          <>
            <View style={styles.statRow}>
              <StatCard num={stats.enCours} label="En cours" />
              <StatCard num={stats.terminees} label="Terminées" />
            </View>
            {visitesEnCours.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Visites en cours</Text>
                {visitesEnCours.map((v) => (
                  <TouchableOpacity key={v.id} style={styles.card} activeOpacity={0.7}
                    onPress={() => navigation.navigate('Visite', { visiteId: v.id })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{v.nom_client}</Text>
                      <Text style={styles.cardSub}>{v.nom_site}</Text>
                    </View>
                    <View style={styles.badge}><Text style={styles.badgeText}>{v.progression_pct}%</Text></View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Clients</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)}>
                <Text style={styles.addLink}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        data={clients}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7}
            onPress={() => navigation.navigate('ClientSites', { clientId: item.id, nomClient: item.nom })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nom}</Text>
              {item.code_exploitant ? <Text style={styles.cardSub}>{item.code_exploitant}</Text> : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun client pour l'instant.</Text></View>}
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <TextInput style={styles.input} placeholder="Nom du client" value={nouveauNom} onChangeText={setNouveauNom} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Code exploitant (optionnel)" value={nouveauCode} onChangeText={setNouveauCode} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={ajouterClient}>
                <Text style={styles.btnPrimaryText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ num, label }) {
  return <View style={styles.statCard}><Text style={styles.statNum}>{num}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}


export { HomeScreen };
