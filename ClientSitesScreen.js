/** Écran Sites d'un client + gestion GPS/adresses sans carte native. */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerSitesClient, creerSite } from './db.js';
import { sitesAvecGps } from './siteGeoDb.js';
import { SiteAddressManager } from './SiteAddressManager.js';

function ClientSitesScreen({ route, navigation }) {
  const { clientId } = route.params;
  const [sites, setSites] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [gestionVisible, setGestionVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleAdresse, setNouvelleAdresse] = useState('');

  const charger = useCallback(async () => {
    const liste = await listerSitesClient(clientId);
    setSites(liste);
    return liste;
  }, [clientId]);
  useEffect(useCallback(() => { charger(); }, [charger]));

  const sitesGps = useMemo(() => sitesAvecGps(sites), [sites]);
  const sansGps = sites.length - sitesGps.length;
  const sansAdresse = sites.filter((s) => !String(s.adresse || '').trim()).length;

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) { Alert.alert('Nom requis', 'Merci de saisir le nom du site.'); return; }
    await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: nouvelleAdresse.trim() || null });
    setNouveauNom(''); setNouvelleAdresse(''); setModalVisible(false); await charger();
  };

  const ouvrirSite = (site) => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site });

  const ouvrirGoogleMaps = async (site) => {
    const lat = Number(site.latitude);
    const lng = Number(site.longitude);
    const query = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : String(site.adresse || '').trim();
    if (!query) return;
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch {
      Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps.");
    }
  };

  const ResumeLocalisation = () => (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.sectionLabel}>Localisation du parc</Text>
      <View style={{ marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800' }}>{sitesGps.length}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>sites avec GPS</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800' }}>{sansGps}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>à positionner</Text>
          </View>
        </View>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 10 }}>
          Les points GPS sont conservés dans l'application. Google Maps s'ouvre uniquement quand tu le demandes, sans carte native intégrée.
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={sites}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <ResumeLocalisation />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setGestionVisible(true)}>
                <Text style={styles.btnSecondaryText}>⚙️ Gérer les sites</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => setModalVisible(true)}>
                <Text style={styles.btnPrimaryText}>+ Ajouter un site</Text>
              </TouchableOpacity>
            </View>
            {(sansAdresse > 0 || sansGps > 0) ? (
              <View style={{ backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: '#F0D99B', borderRadius: 12, padding: 10, marginBottom: 14 }}>
                <Text style={{ color: '#7A5700', fontSize: 12, fontWeight: '700' }}>
                  {sansAdresse ? `${sansAdresse} site${sansAdresse > 1 ? 's' : ''} sans adresse` : ''}{sansAdresse && sansGps ? ' · ' : ''}{sansGps ? `${sansGps} sans point GPS` : ''}
                </Text>
              </View>
            ) : null}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Sites</Text>
              <Text style={{ color: COLORS.muted, fontSize: 12 }}>{sites.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const hasGps = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirSite(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.nom_site}</Text>
                {item.adresse ? <Text style={styles.cardSub}>{item.adresse}</Text> : <Text style={{ color: '#A26A00', fontSize: 12 }}>Adresse à renseigner</Text>}
                {hasGps ? (
                  <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <Text style={{ color: COLORS.muted, fontSize: 11 }}>📍 {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</Text>
                    <TouchableOpacity onPress={(e) => { e?.stopPropagation?.(); ouvrirGoogleMaps(item); }}>
                      <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>Google Maps ↗</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: '#A26A00', fontSize: 11, marginTop: 4 }}>📍 Point GPS à renseigner</Text>
                )}
              </View>
              <View style={[styles.badge, item.statut === 'Actif' ? styles.badgeActif : styles.badgeInactif]}>
                <Text style={[styles.badgeText, item.statut === 'Actif' ? styles.badgeTextActif : styles.badgeTextInactif]}>{item.statut || 'Actif'}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Nouveau site</Text>
            <TextInput style={styles.input} placeholder="Nom du site" value={nouveauNom} onChangeText={setNouveauNom} />
            <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Adresse (optionnel)" value={nouvelleAdresse} onChangeText={setNouvelleAdresse} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={ajouterSiteFn}><Text style={styles.btnPrimaryText}>Créer</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SiteAddressManager visible={gestionVisible} clientId={clientId} sites={sites} onClose={() => setGestionVisible(false)} onChanged={charger} />
    </View>
  );
}

export { ClientSitesScreen };
