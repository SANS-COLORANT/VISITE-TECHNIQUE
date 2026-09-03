/** Écran Sites d'un client + accès pilotage, carte et documents. */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerSitesClient, creerSite } from './db.js';
import { getResumeSuppressionSite, supprimerSiteComplet } from './entityManagementDb.js';
import { synchroniserCoordonneesSite } from './siteGeoDb.js';
import { SiteAddressManager, composerAdresse } from './SiteAddressManager.js';

const adresseVide = () => ({ numero: '', voie: '', complement: '', codePostal: '', ville: '' });

function ClientSitesScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [gestionVisible, setGestionVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState(adresseVide);

  const charger = useCallback(async () => {
    if (!clientId) { setSites([]); return []; }
    const liste = await listerSitesClient(clientId);
    setSites(Array.isArray(liste) ? liste : []);
    return liste;
  }, [clientId]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try { if (actif) await charger(); }
      catch (e) { if (actif) Alert.alert('Sites', String(e?.message || e)); }
    })();
    return () => { actif = false; };
  }, [charger]);

  const sansAdresse = sites.filter((s) => !String(s.adresse || '').trim()).length;
  const avecAdresse = sites.length - sansAdresse;
  const patchNouvelleAdresse = (patch) => setNouvelleAdresse((prev) => ({ ...prev, ...patch }));

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) return Alert.alert('Nom requis', 'Merci de saisir le nom du site.');
    const adresse = composerAdresse(nouvelleAdresse);
    try {
      const siteId = await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: adresse || null });
      setNouveauNom(''); setNouvelleAdresse(adresseVide()); setModalVisible(false);
      await charger();
      if (adresse) synchroniserCoordonneesSite(siteId, adresse).then(charger).catch(() => {});
    } catch (e) { Alert.alert('Création impossible', String(e?.message || e)); }
  };

  const ouvrirSite = (site) => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site });

  const confirmerSuppressionSite = async (site) => {
    try {
      const resume = await getResumeSuppressionSite(site.id);
      if (!resume) return;
      Alert.alert('Supprimer ce site ?', `« ${resume.nom_site} » contient ${resume.visites} visite(s) et ${resume.equipements} équipement(s) permanent(s). Tout sera définitivement supprimé.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer tout', style: 'destructive', onPress: async () => { try { await supprimerSiteComplet(site.id); await charger(); } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); } } },
      ]);
    } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
  };

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <FlatList
      contentContainerStyle={styles.content}
      data={sites}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<View>
        <Text style={styles.sectionLabel}>Patrimoine client</Text>
        <View style={{ marginTop: 8, marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{sites.length}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>sites</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{avecAdresse}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>adresses renseignées</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 22, fontWeight: '800' }}>{sansAdresse}</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>à compléter</Text></View></View>
        </View>

        <TouchableOpacity style={[styles.btnPrimary, { marginBottom: 8 }]} onPress={() => navigation.navigate('ClientPilotage', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnPrimaryText}>▦ Pilotage · cartographie & synthèse</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { marginBottom: 8 }]} onPress={() => navigation.navigate('ClientMap', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnSecondaryText}>🗺 Carte METRA des sites</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { marginBottom: 8 }]} onPress={() => setGestionVisible(true)}><Text style={styles.btnSecondaryText}>✎ Gérer · renommer · dupliquer · groupes</Text></TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => setModalVisible(true)}><Text style={styles.btnPrimaryText}>+ Ajouter un site</Text></TouchableOpacity><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => navigation.navigate('ClientDocuments', { clientId, nomClient })} disabled={!sites.length}><Text style={styles.btnPrimaryText}>📄 Documents & exports</Text></TouchableOpacity></View>

        {sansAdresse > 0 ? <View style={{ backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: '#F0D99B', borderRadius: 12, padding: 10, marginBottom: 14 }}><Text style={{ color: '#7A5700', fontSize: 12, fontWeight: '700' }}>{sansAdresse} site(s) sans adresse complète</Text></View> : null}
        <View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>Sites</Text><Text style={{ color: COLORS.muted, fontSize: 12 }}>{sites.length}</Text></View>
      </View>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirSite(item)}>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom_site}</Text>{item.adresse ? <Text style={styles.cardSub}>{item.adresse}</Text> : <Text style={{ color: '#A26A00', fontSize: 12 }}>Adresse à renseigner</Text>}{item.localisation_note ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>{item.localisation_note}</Text> : null}</View>
        <View style={[styles.badge, item.statut === 'Actif' ? styles.badgeActif : styles.badgeInactif]}><Text style={[styles.badgeText, item.statut === 'Actif' ? styles.badgeTextActif : styles.badgeTextInactif]}>{item.statut || 'Actif'}</Text></View>
        <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); setGestionVisible(true); }} style={{ minWidth: 40, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}><Text style={{ color: COLORS.inkSoft, fontSize: 20, fontWeight: '900' }}>⋯</Text></TouchableOpacity>
        <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionSite(item); }} style={{ minWidth: 38, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.red || '#B42318', fontSize: 16, fontWeight: '800' }}>✕</Text></TouchableOpacity>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
    />

    <Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Nouveau site</Text><TextInput style={styles.input} placeholder="Nom du site" value={nouveauNom} onChangeText={setNouveauNom}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><TextInput style={[styles.input, { width: 84 }]} placeholder="N°" value={nouvelleAdresse.numero} keyboardType="numbers-and-punctuation" onChangeText={(v) => patchNouvelleAdresse({ numero: v })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Rue / avenue / voie" value={nouvelleAdresse.voie} onChangeText={(v) => patchNouvelleAdresse({ voie: v })}/></View><TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Complément : bâtiment, entrée…" value={nouvelleAdresse.complement} onChangeText={(v) => patchNouvelleAdresse({ complement: v })}/><View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><TextInput style={[styles.input, { width: 120 }]} placeholder="Code postal" value={nouvelleAdresse.codePostal} keyboardType="number-pad" maxLength={5} onChangeText={(v) => patchNouvelleAdresse({ codePostal: v.replace(/\D/g, '').slice(0, 5) })}/><TextInput style={[styles.input, { flex: 1 }]} placeholder="Ville" value={nouvelleAdresse.ville} onChangeText={(v) => patchNouvelleAdresse({ ville: v })}/></View><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={ajouterSiteFn}><Text style={styles.btnPrimaryText}>Créer</Text></TouchableOpacity></View></View></View></Modal>

    <SiteAddressManager visible={gestionVisible} clientId={clientId} sites={sites} onClose={() => setGestionVisible(false)} onChanged={charger}/>
  </View>;
}

export { ClientSitesScreen };
