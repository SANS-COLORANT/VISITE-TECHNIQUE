import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { exporterDernieresVisitesClient } from './clientBatchExport.js';
import { garantirRacineMetra, initialiserArborescenceClient, obtenirRacineMetra } from './metraStorage.js';

function ActionCard({ title, text, action, secondary = false, disabled = false }) {
  return <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14, marginBottom: 10 }}><Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.ink }}>{title}</Text><Text style={{ marginTop: 5, color: COLORS.muted, fontSize: 11.5, lineHeight: 17 }}>{text}</Text><TouchableOpacity disabled={disabled} onPress={action} style={[secondary ? styles.btnSecondary : styles.btnPrimary, { marginTop: 12 }, disabled && { opacity: 0.45 }]}><Text style={secondary ? styles.btnSecondaryText : styles.btnPrimaryText}>{title}</Text></TouchableOpacity></View>;
}

export function ClientDocumentsScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [busy, setBusy] = useState(false);
  const [racine, setRacine] = useState(null);

  const chargerStockage = useCallback(async () => setRacine(await obtenirRacineMetra()), []);
  useEffect(() => { chargerStockage(); }, [chargerStockage]);

  const preparerStockage = async () => {
    try {
      setBusy(true);
      const uri = await garantirRacineMetra();
      setRacine(uri);
      if (!uri) {
        Alert.alert('Stockage METRA', "L'autorisation du dossier Documents est nécessaire une seule fois pour classer automatiquement les fichiers.");
        return null;
      }
      // Matérialise immédiatement l'arborescence des clients/sites/visites
      // existants. Les prochaines visites créeront leur dossier à la création.
      await initialiserArborescenceClient(clientId);
      return uri;
    } catch (e) {
      Alert.alert('Stockage METRA', String(e?.message || e));
      return null;
    } finally { setBusy(false); }
  };

  const garantirStockageClient = async () => {
    if (!racine) return preparerStockage();
    try {
      setBusy(true);
      await initialiserArborescenceClient(clientId);
      return racine;
    } catch (e) {
      // Une autorisation SAF peut avoir été révoquée par Android. Le service
      // central la redemandera proprement au prochain passage si nécessaire.
      return preparerStockage();
    } finally { setBusy(false); }
  };

  const ouvrirRapports = async () => {
    const uri = await garantirStockageClient();
    if (!uri) return;
    navigation.navigate('Report', { clientId });
  };

  const exporterExcel = async () => {
    const uri = await garantirStockageClient();
    if (!uri) return;
    setBusy(true);
    try {
      const resultat = await exporterDernieresVisitesClient(clientId);
      if (resultat?.annule) return;
      const ok = resultat?.enregistres?.length || 0;
      const erreurs = resultat?.erreurs?.length || 0;
      Alert.alert('Export terminé', `${ok} fichier(s) Excel classé(s) automatiquement dans METRA${erreurs ? ` · ${erreurs} erreur(s)` : ''}.`);
    } catch (e) {
      Alert.alert('Export impossible', String(e?.message || e));
    } finally { setBusy(false); }
  };

  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={styles.content}>
    <Text style={styles.sectionTitle}>Documents & exports</Text>
    <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 14 }}>{nomClient || 'Client'} · rapports et fichiers de traitement regroupés au même endroit</Text>

    <View style={{ padding: 12, borderRadius: 12, backgroundColor: racine ? '#EEF8F1' : '#FFF8E7', borderWidth: 1, borderColor: racine ? '#B7DEC2' : '#F0D99B', marginBottom: 14 }}>
      <Text style={{ fontWeight: '900', color: racine ? '#1E6A36' : '#7A5700' }}>{racine ? '✓ Classement automatique actif' : 'Classement automatique à autoriser'}</Text>
      <Text style={{ marginTop: 4, fontSize: 11, color: COLORS.muted }}>{racine ? 'Photos, PDF, Word et Excel sont rangés dans Documents/METRA selon Client → Site → Visite.' : "Android demandera une seule fois l'accès au dossier Documents. Ensuite METRA crée et utilise automatiquement toute l'arborescence."}</Text>
      {!racine ? <TouchableOpacity disabled={busy} style={[styles.btnSecondary, { marginTop: 9 }]} onPress={preparerStockage}><Text style={styles.btnSecondaryText}>Autoriser Documents/METRA</Text></TouchableOpacity> : null}
    </View>

    <ActionCard disabled={busy} title="Créer un rapport PDF / Word" text="Choisir les dernières visites, le contenu, les photos et le format. Les fichiers générés sont ensuite classés automatiquement dans le dossier du client ou de la visite." action={ouvrirRapports} />
    <ActionCard disabled={busy} secondary title="Exporter les dernières visites en Excel" text="Un fichier Excel par dernière visite, classé automatiquement par client, site et visite pour transmission ou traitement." action={exporterExcel} />

    {busy ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><ActivityIndicator color={COLORS.orange}/><Text style={{ color: COLORS.muted }}>Traitement en cours…</Text></View> : null}
  </ScrollView>;
}
