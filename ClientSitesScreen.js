/** Écran Sites d'un client + carte multi-sites + gestion en masse. */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const mapRef = useRef(null);

  const charger = useCallback(async () => {
    const liste = await listerSitesClient(clientId);
    setSites(liste);
    return liste;
  }, [clientId]);
  useEffect(useCallback(() => { charger(); }, [charger]));

  const sitesGps = useMemo(() => sitesAvecGps(sites), [sites]);
  const sansGps = sites.length - sitesGps.length;
  const sansAdresse = sites.filter((s) => !String(s.adresse || '').trim()).length;

  const ajusterCarte = useCallback(() => {
    if (!mapRef.current || !sitesGps.length) return;
    const coords = sitesGps.map((s) => ({ latitude: Number(s.latitude), longitude: Number(s.longitude) }));
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    }, 120);
  }, [sitesGps]);

  useEffect(() => { ajusterCarte(); }, [ajusterCarte]);

  const ajouterSiteFn = async () => {
    if (!nouveauNom.trim()) { Alert.alert('Nom requis', 'Merci de saisir le nom du site.'); return; }
    await creerSite({ clientId, nomSite: nouveauNom.trim(), adresse: nouvelleAdresse.trim() || null });
    setNouveauNom(''); setNouvelleAdresse(''); setModalVisible(false); await charger();
  };

  const ouvrirSite = (site) => {
    navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site });
  };

  const CarteClient = () => (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Carte du parc</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
            {sitesGps.length} site{sitesGps.length > 1 ? 's' : ''} positionné{sitesGps.length > 1 ? 's' : ''}{sansGps > 0 ? ` · ${sansGps} à positionner` : ''}
          </Text>
        </View>
        {sitesGps.length > 1 ? (
          <TouchableOpacity onPress={ajusterCarte} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Tout voir</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {sitesGps.length > 0 ? (
        <View style={{ height: 250, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E3E5E8' }}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            onMapReady={ajusterCarte}
            initialRegion={{
              latitude: Number(sitesGps[0].latitude),
              longitude: Number(sitesGps[0].longitude),
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
          >
            {sitesGps.map((site) => (
              <Marker
                key={site.id}
                coordinate={{ latitude: Number(site.latitude), longitude: Number(site.longitude) }}
                title={site.nom_site}
                description={site.adresse || site.localisation_note || 'Site technique'}
              >
                <Callout onPress={() => ouvrirSite(site)}>
                  <View style={{ minWidth: 180, maxWidth: 240, padding: 4 }}>
                    <Text style={{ fontWeight: '800', fontSize: 14 }}>{site.nom_site}</Text>
                    {site.adresse ? <Text style={{ marginTop: 3, fontSize: 12 }}>{site.adresse}</Text> : null}
                    {site.localisation_note ? <Text style={{ marginTop: 3, fontSize: 11, color: '#666' }}>{site.localisation_note}</Text> : null}
                    <Text style={{ marginTop: 7, color: COLORS.primary, fontWeight: '700' }}>Ouvrir le site ›</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
        </View>
      ) : (
        <View style={{ padding: 18, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
          <Text style={{ fontWeight: '700' }}>Aucun point GPS enregistré</Text>
          <Text style={{ color: COLORS.muted, marginTop: 5, fontSize: 12 }}>Utilise « Gérer » pour saisir les adresses puis les localiser automatiquement.</Text>
        </View>
      )}
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
            <CarteClient />
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
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirSite(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nom_site}</Text>
              {item.adresse ? <Text style={styles.cardSub}>{item.adresse}</Text> : <Text style={{ color: '#A26A00', fontSize: 12 }}>Adresse à renseigner</Text>}
              {Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)) ? (
                <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>📍 {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</Text>
              ) : (
                <Text style={{ color: '#A26A00', fontSize: 11, marginTop: 4 }}>📍 Point GPS à renseigner</Text>
              )}
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

      <SiteAddressManager
        visible={gestionVisible}
        clientId={clientId}
        sites={sites}
        onClose={() => setGestionVisible(false)}
        onChanged={charger}
      />
    </View>
  );
}

export { ClientSitesScreen };
