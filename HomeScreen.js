/** Écran Accueil. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerClients, creerClient, listerVisitesEnCours, compterVisites } from './db.js';
import { supprimerVisiteComplete, getResumeSuppressionClient, supprimerClientComplet } from './entityManagementDb.js';
import { choisirEtAnalyserExcel, importerAnalyseExcel } from './excelImport.js';

function HomeScreen({ navigation }) {
  const [clients, setClients] = useState([]);
  const [visitesEnCours, setVisitesEnCours] = useState([]);
  const [stats, setStats] = useState({ enCours: 0, terminees: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importEnCours, setImportEnCours] = useState(false);

  const charger = useCallback(async () => {
    const [c, v, s] = await Promise.all([listerClients(), listerVisitesEnCours(), compterVisites()]);
    setClients(c); setVisitesEnCours(v); setStats(s);
  }, []);

  useEffect(useCallback(() => { charger(); }, [charger]));

  const onRefresh = async () => { setRefreshing(true); await charger(); setRefreshing(false); };

  const confirmerSuppressionVisite = (visite) => {
    Alert.alert(
      'Supprimer cette visite ?',
      `« ${visite.nom_client} — ${visite.nom_site} » et toutes les données propres à cette visite seront définitivement supprimées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerVisiteComplete(visite.id); await charger(); } },
      ]
    );
  };

  const confirmerSuppressionClient = async (client) => {
    try {
      const resume = await getResumeSuppressionClient(client.id);
      if (!resume) return;
      Alert.alert(
        'Supprimer ce client ?',
        `« ${resume.nom} » contient ${resume.sites} site${resume.sites > 1 ? 's' : ''} et ${resume.visites} visite${resume.visites > 1 ? 's' : ''}. Tout le contenu associé sera définitivement supprimé.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer tout', style: 'destructive', onPress: async () => {
            try { await supprimerClientComplet(client.id); await charger(); }
            catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
          } },
        ]
      );
    } catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
  };

  const ajouterClient = async () => {
    if (!nouveauNom.trim()) { Alert.alert('Nom requis', 'Merci de saisir le nom du client.'); return; }
    await creerClient({ nom: nouveauNom.trim(), codeExploitant: nouveauCode.trim() || null });
    setNouveauNom(''); setNouveauCode(''); setModalVisible(false); charger();
  };

  const choisirExcel = async () => {
    try {
      const analyse = await choisirEtAnalyserExcel();
      if (analyse) setImportPreview(analyse);
    } catch (e) {
      Alert.alert('Import impossible', String(e.message || e));
    }
  };

  const confirmerImport = async () => {
    if (!importPreview || importEnCours) return;
    setImportEnCours(true);
    try {
      const resultat = await importerAnalyseExcel(importPreview);
      setImportPreview(null);
      await charger();
      if (resultat.dejaImporte) Alert.alert('Déjà importé', 'Ce fichier a déjà été intégré dans l’application.');
      else navigation.navigate('Visite', { visiteId: resultat.visiteId });
    } catch (e) {
      Alert.alert('Erreur pendant l’import', String(e.message || e));
    } finally {
      setImportEnCours(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.homeTopRow}>
        <TouchableOpacity style={styles.importExcelBtn} onPress={choisirExcel}>
          <Text style={styles.importExcelBtnText}>⇧ Importer Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.parametresBtn} onPress={() => navigation.navigate('Parametres')}>
          <Text style={styles.parametresBtnText}>⚙ Paramètres</Text>
        </TouchableOpacity>
      </View>
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
                    <TouchableOpacity style={styles.deleteVisiteBtn} onPress={() => confirmerSuppressionVisite(v)}>
                      <Text style={styles.deleteVisiteBtnText}>✕</Text>
                    </TouchableOpacity>
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
            <TouchableOpacity
              onPress={() => confirmerSuppressionClient(item)}
              style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginRight: 2 }}
              accessibilityLabel={`Supprimer ${item.nom}`}
            >
              <Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text>
            </TouchableOpacity>
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
      <Modal visible={!!importPreview} transparent animationType="fade" onRequestClose={() => setImportPreview(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Aperçu de l’import Excel</Text>
            {importPreview && (
              <>
                <Text style={styles.importFileName}>{importPreview.nomFichier}</Text>
                <Text style={styles.importSiteTitle}>{importPreview.client} · {importPreview.site}</Text>
                <Text style={styles.cardSub}>{importPreview.adresse || 'Adresse non renseignée'} · {importPreview.dateVisite}</Text>
                <View style={styles.importStatsGrid}>
                  <ImportStat nombre={importPreview.champs.length} label="Champs" />
                  <ImportStat nombre={importPreview.controles.length} label="Contrôles" />
                  <ImportStat nombre={importPreview.materiel.length} label="Équipements" />
                  <ImportStat nombre={importPreview.reseaux.length} label="Réseaux" />
                  <ImportStat nombre={importPreview.compteurs.length} label="Compteurs" />
                  <ImportStat nombre={importPreview.remarques.length} label="Réserves" />
                </View>
                <Text style={styles.importHint}>Vérifie ces informations avant de créer la visite. Le fichier original ne sera pas modifié.</Text>
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setImportPreview(null)} disabled={importEnCours}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={confirmerImport} disabled={importEnCours}>
                <Text style={styles.btnPrimaryText}>{importEnCours ? 'Import…' : 'Intégrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ImportStat({ nombre, label }) {
  return <View style={styles.importStat}><Text style={styles.importStatNumber}>{nombre}</Text><Text style={styles.importStatLabel}>{label}</Text></View>;
}

function StatCard({ num, label }) {
  return <View style={styles.statCard}><Text style={styles.statNum}>{num}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export { HomeScreen };
