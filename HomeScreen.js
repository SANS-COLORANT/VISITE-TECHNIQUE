/** Écran Accueil. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerClients, creerClient, listerVisitesEnCours, compterVisites } from './db.js';
import { supprimerVisiteComplete, getResumeSuppressionClient, supprimerClientComplet } from './entityManagementDb.js';
import { choisirEtAnalyserExcels, importerAnalysesExcel } from './batchExcel.js';

function HomeScreen({ navigation, onR1LongPress }) {
  const [clients, setClients] = useState([]);
  const [visitesEnCours, setVisitesEnCours] = useState([]);
  const [stats, setStats] = useState({ enCours: 0, terminees: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');
  const [creationClient, setCreationClient] = useState(false);
  const [importBatch, setImportBatch] = useState(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const charger = useCallback(async () => {
    const [c, v, s] = await Promise.all([listerClients(), listerVisitesEnCours(), compterVisites()]);
    setClients(c);
    setVisitesEnCours(v);
    setStats(s);
  }, []);

  useEffect(() => { charger().catch((e) => console.warn('Chargement accueil impossible', e)); }, [charger]);

  const onRefresh = async () => { setRefreshing(true); await charger(); setRefreshing(false); };
  const openDirectory = () => navigation.navigate('MetraDirectory', { query: quickSearch.trim() });

  const confirmerSuppressionVisite = (v) => Alert.alert(
    'Supprimer cette visite ?',
    `« ${v.nom_client} — ${v.nom_site} » et toutes les données propres à cette visite seront définitivement supprimées.`,
    [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerVisiteComplete(v.id); await charger(); } }]
  );

  const confirmerSuppressionClient = async (client) => {
    try {
      const r = await getResumeSuppressionClient(client.id);
      if (!r) return;
      Alert.alert(
        'Supprimer ce client ?',
        `« ${r.nom} » contient ${r.sites} site(s) et ${r.visites} visite(s). Tout le contenu associé sera définitivement supprimé.`,
        [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer tout', style: 'destructive', onPress: async () => {
          try { await supprimerClientComplet(client.id); await charger(); }
          catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
        } }]
      );
    } catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
  };

  const ajouterClient = async () => {
    const nom = nouveauNom.trim();
    const codeExploitant = nouveauCode.trim() || null;
    if (!nom) { Alert.alert('Nom requis', 'Merci de saisir le nom du client.'); return; }
    if (creationClient) return;
    setCreationClient(true);
    try {
      const id = await creerClient({ nom, codeExploitant });
      setClients((c) => [...c, { id, nom, code_exploitant: codeExploitant, adresse: null }].sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })));
      setNouveauNom('');
      setNouveauCode('');
      setModalVisible(false);
    } catch (e) { Alert.alert('Création impossible', String(e.message || e)); }
    finally { setCreationClient(false); }
  };

  const choisirExcel = async () => {
    try {
      const lot = await choisirEtAnalyserExcels();
      if (!lot) return;
      if (!lot.analyses.length) {
        Alert.alert('Aucun fichier importable', lot.erreurs.map((e) => `${e.nomFichier} : ${e.message}`).join('\n') || 'Aucune trame Excel reconnue.');
        return;
      }
      setImportBatch(lot);
    } catch (e) { Alert.alert('Import impossible', String(e.message || e)); }
  };

  const confirmerImport = async () => {
    if (!importBatch?.analyses?.length || importEnCours) return;
    setImportEnCours(true);
    try {
      const resultats = await importerAnalysesExcel(importBatch.analyses);
      const reussis = resultats.filter((r) => r.ok && !r.dejaImporte);
      const deja = resultats.filter((r) => r.ok && r.dejaImporte);
      const echecs = resultats.filter((r) => !r.ok);
      setImportBatch(null);
      await charger();
      if (resultats.length === 1 && reussis.length === 1) navigation.navigate('Visite', { visiteId: reussis[0].visiteId });
      else Alert.alert('Import Excel terminé', [
        `${reussis.length} visite(s) importée(s).`,
        deja.length ? `${deja.length} fichier(s) déjà importé(s).` : null,
        echecs.length ? `${echecs.length} échec(s).` : null,
      ].filter(Boolean).join('\n'));
    } catch (e) { Alert.alert('Erreur pendant l’import', String(e.message || e)); }
    finally { setImportEnCours(false); }
  };

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <View style={styles.homeTopRow}>
      <TouchableOpacity style={styles.importExcelBtn} onPress={choisirExcel}><Text style={styles.importExcelBtnText}>⇧ Importer Excel(s)</Text></TouchableOpacity>
      <View style={{ flex: 1 }} />
      <TouchableOpacity style={styles.parametresBtn} onPress={() => navigation.navigate('Parametres')}><Text style={styles.parametresBtnText}>⚙ Paramètres</Text></TouchableOpacity>
    </View>

    <FlatList
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} />}
      data={clients}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={<>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E6E8EC', padding: 13, marginBottom: 16 }}>
          <Text style={{ color: COLORS.ink || '#17212B', fontSize: 13.5, fontWeight: '900', marginBottom: 9 }}>Accès rapide au patrimoine</Text>
          <View style={{ minHeight: 50, borderRadius: 14, backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: '#ECEEF1', flexDirection: 'row', alignItems: 'center', paddingLeft: 13 }}>
            <Text style={{ fontSize: 21, color: '#98A2B3', marginRight: 9 }}>⌕</Text>
            <TextInput
              value={quickSearch}
              onChangeText={setQuickSearch}
              onSubmitEditing={openDirectory}
              onFocus={() => {}}
              placeholder="Client, site, ville, adresse, équipement…"
              placeholderTextColor="#98A2B3"
              style={{ flex: 1, color: COLORS.ink || '#17212B', fontSize: 14.5, paddingVertical: 12 }}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity onPress={openDirectory} style={{ minWidth: 50, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.orange || '#E86F2D', fontWeight: '900', fontSize: 18 }}>→</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: COLORS.muted || '#667085', fontSize: 11.5, marginTop: 8 }}>Recherche METRA + données Intranet déjà synchronisées · utilisable hors connexion.</Text>
        </View>

        <View style={styles.statRow}><StatCard num={stats.enCours} label="En cours" /><StatCard num={stats.terminees} label="Terminées" /></View>

        {visitesEnCours.length > 0 && <>
          <Text style={styles.sectionLabel}>Visites en cours</Text>
          {visitesEnCours.map((v) => <TouchableOpacity key={v.id} style={styles.card} onPress={() => navigation.navigate('Visite', { visiteId: v.id })}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{v.nom_client}</Text><Text style={styles.cardSub}>{v.nom_site}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{v.progression_pct}%</Text></View>
            <TouchableOpacity style={styles.deleteVisiteBtn} onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionVisite(v); }}><Text style={styles.deleteVisiteBtnText}>✕</Text></TouchableOpacity>
          </TouchableOpacity>)}
        </>}

        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity activeOpacity={1} delayLongPress={4000} onLongPress={onR1LongPress}><Text style={styles.sectionLabel}>Clients locaux</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setModalVisible(true)}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity>
        </View>
      </>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('ClientSites', { clientId: item.id, nomClient: item.nom })}>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom}</Text>{item.code_exploitant ? <Text style={styles.cardSub}>{item.code_exploitant}</Text> : null}</View>
        <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionClient(item); }} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text></TouchableOpacity>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun client local</Text><Text style={styles.emptySub}>Utilise la recherche ci-dessus pour retrouver un client ou un site synchronisé, ou crée un client manuellement.</Text></View>}
    />

    <Modal visible={modalVisible} transparent animationType="fade">
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Nouveau client</Text>
        <TextInput style={styles.input} placeholder="Nom du client" value={nouveauNom} onChangeText={setNouveauNom} />
        <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Code exploitant (optionnel)" value={nouveauCode} onChangeText={setNouveauCode} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={ajouterClient}><Text style={styles.btnPrimaryText}>{creationClient ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Import Excel en lot</Text>
        {importBatch ? <ScrollView style={{ maxHeight: 430 }}>{importBatch.analyses.map((a, index) => <View key={`${a.sourceId || a.nomFichier}-${index}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line }}><Text style={styles.importFileName}>{a.nomFichier}</Text><Text style={styles.importSiteTitle}>{a.client} · {a.site}</Text></View>)}</ScrollView> : null}
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setImportBatch(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={confirmerImport}><Text style={styles.btnPrimaryText}>{importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

function StatCard({ num, label }) { return <View style={styles.statCard}><Text style={styles.statNum}>{num}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

export { HomeScreen };
