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

  const charger = useCallback(async () => {
    const [c, v, s] = await Promise.all([listerClients(), listerVisitesEnCours(), compterVisites()]);
    setClients(c); setVisitesEnCours(v); setStats(s);
  }, []);

  useEffect(() => {
    charger().catch((e) => console.warn('Chargement accueil impossible', e));
  }, [charger]);

  const onRefresh = async () => { setRefreshing(true); await charger(); setRefreshing(false); };

  const confirmerSuppressionVisite = (visite) => {
    Alert.alert('Supprimer cette visite ?', `« ${visite.nom_client} — ${visite.nom_site} » et toutes les données propres à cette visite seront définitivement supprimées.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerVisiteComplete(visite.id); await charger(); } },
    ]);
  };

  const confirmerSuppressionClient = async (client) => {
    try {
      const resume = await getResumeSuppressionClient(client.id);
      if (!resume) return;
      Alert.alert('Supprimer ce client ?', `« ${resume.nom} » contient ${resume.sites} site${resume.sites > 1 ? 's' : ''} et ${resume.visites} visite${resume.visites > 1 ? 's' : ''}. Tout le contenu associé sera définitivement supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer tout', style: 'destructive', onPress: async () => {
          try { await supprimerClientComplet(client.id); await charger(); }
          catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
        } },
      ]);
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
      setClients((courants) => [...courants, { id, nom, code_exploitant: codeExploitant, adresse: null }].sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' })));
      setNouveauNom(''); setNouveauCode(''); setModalVisible(false);
    } catch (e) { Alert.alert('Création impossible', String(e.message || e)); }
    finally { setCreationClient(false); }
  };

  const choisirExcel = async () => {
    try {
      const lot = await choisirEtAnalyserExcels();
      if (!lot) return;
      if (!lot.analyses.length) {
        const detail = lot.erreurs.map((e) => `${e.nomFichier} : ${e.message}`).join('\n');
        Alert.alert('Aucun fichier importable', detail || 'Aucune trame Excel reconnue.');
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

      if (resultats.length === 1 && reussis.length === 1) {
        navigation.navigate('Visite', { visiteId: reussis[0].visiteId });
      } else {
        const lignes = [`${reussis.length} visite(s) importée(s).`];
        if (deja.length) lignes.push(`${deja.length} fichier(s) déjà importé(s).`);
        if (echecs.length) lignes.push(`${echecs.length} échec(s).`);
        Alert.alert('Import Excel terminé', lignes.join('\n'));
      }
    } catch (e) { Alert.alert('Erreur pendant l’import', String(e.message || e)); }
    finally { setImportEnCours(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.homeTopRow}>
        <TouchableOpacity style={styles.importExcelBtn} onPress={choisirExcel}><Text style={styles.importExcelBtnText}>⇧ Importer Excel(s)</Text></TouchableOpacity>
        <TouchableOpacity style={styles.parametresBtn} onPress={() => navigation.navigate('Parametres')}><Text style={styles.parametresBtnText}>⚙ Paramètres</Text></TouchableOpacity>
      </View>
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.orange} />}
        ListHeaderComponent={<>
          <View style={styles.statRow}><StatCard num={stats.enCours} label="En cours" /><StatCard num={stats.terminees} label="Terminées" /></View>
          {visitesEnCours.length > 0 && <><Text style={styles.sectionLabel}>Visites en cours</Text>{visitesEnCours.map((v) => (
            <TouchableOpacity key={v.id} style={styles.card} activeOpacity={0.7} onPress={() => navigation.navigate('Visite', { visiteId: v.id })}>
              <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{v.nom_client}</Text><Text style={styles.cardSub}>{v.nom_site}</Text></View>
              <View style={styles.badge}><Text style={styles.badgeText}>{v.progression_pct}%</Text></View>
              <TouchableOpacity style={styles.deleteVisiteBtn} onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionVisite(v); }} accessibilityLabel={`Supprimer la visite ${v.nom_client} ${v.nom_site}`}><Text style={styles.deleteVisiteBtnText}>✕</Text></TouchableOpacity>
            </TouchableOpacity>
          ))}</>}
          <View style={styles.sectionHeaderRow}>
            <TouchableOpacity activeOpacity={1} delayLongPress={4000} onLongPress={onR1LongPress}>
              <Text style={styles.sectionLabel}>Clients</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(true)}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity>
          </View>
        </>}
        data={clients}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => navigation.navigate('ClientSites', { clientId: item.id, nomClient: item.nom })}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom}</Text>{item.code_exploitant ? <Text style={styles.cardSub}>{item.code_exploitant}</Text> : null}</View>
            <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionClient(item); }} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginRight: 2 }} accessibilityLabel={`Supprimer ${item.nom}`}><Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text></TouchableOpacity>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<View style={[styles.empty,{paddingVertical:36}]}><Text style={styles.emptyText}>Aucun client</Text><Text style={[styles.emptySub,{marginTop:6,textAlign:'center'}]}>Crée ton premier client ou importe une ou plusieurs trames Excel existantes.</Text><View style={{flexDirection:'row',gap:10,marginTop:18,flexWrap:'wrap',justifyContent:'center'}}><TouchableOpacity style={styles.btnPrimary} onPress={() => setModalVisible(true)}><Text style={styles.btnPrimaryText}>+ Créer un client</Text></TouchableOpacity><TouchableOpacity style={styles.btnSecondary} onPress={choisirExcel}><Text style={styles.btnSecondaryText}>⇧ Importer Excel(s)</Text></TouchableOpacity></View></View>}
      />

      <Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Nouveau client</Text><TextInput style={styles.input} placeholder="Nom du client" value={nouveauNom} onChangeText={setNouveauNom} editable={!creationClient} /><TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Code exploitant (optionnel)" value={nouveauCode} onChangeText={setNouveauCode} editable={!creationClient} /><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)} disabled={creationClient}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={ajouterClient} disabled={creationClient}><Text style={styles.btnPrimaryText}>{creationClient ? 'Création…' : 'Créer'}</Text></TouchableOpacity></View></View></View></Modal>

      <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={() => setImportBatch(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Import Excel en lot</Text>
          {importBatch ? <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator>
            <Text style={styles.importHint}>{importBatch.analyses.length} fichier(s) reconnu(s){importBatch.erreurs.length ? ` · ${importBatch.erreurs.length} ignoré(s)` : ''}</Text>
            {importBatch.analyses.map((a, index) => (
              <View key={`${a.sourceId || a.nomFichier}-${index}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                <Text style={styles.importFileName}>{a.nomFichier}</Text>
                <Text style={styles.importSiteTitle}>{a.client} · {a.site}</Text>
                <Text style={styles.cardSub}>{a.dateVisite} · {a.trameNom || a.trameId} · {a.materiel.length} équipement(s) · {a.remarques.length} réserve(s)</Text>
              </View>
            ))}
            {importBatch.erreurs.length ? <View style={{ marginTop: 12 }}><Text style={[styles.fieldLabel,{color:COLORS.red||'#B42318'}]}>Fichiers non importables</Text>{importBatch.erreurs.map((e,i)=><Text key={`${e.nomFichier}-${i}`} style={styles.cardSub}>• {e.nomFichier} — {e.message}</Text>)}</View> : null}
          </ScrollView> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setImportBatch(null)} disabled={importEnCours}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={confirmerImport} disabled={importEnCours}><Text style={styles.btnPrimaryText}>{importEnCours ? 'Import…' : `Importer ${importBatch?.analyses?.length || 0}`}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

function StatCard({ num, label }) { return <View style={styles.statCard}><Text style={styles.statNum}>{num}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
export { HomeScreen };
