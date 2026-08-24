/** Écran Historique des visites d'un site + localisation GPS sans carte native. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, Linking, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { COLORS, styles } from './styles.js';
import { listerVisitesSite, getDb } from './db.js';
import { creerVisiteProduction } from './visitCreationDb.js';
import { supprimerVisiteComplete } from './entityManagementDb.js';
import { getSiteLocalisation, enregistrerSiteLocalisation, coordonneeValide } from './siteGeoDb.js';
import { modifierSiteRapide } from './siteBulkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { listerTramesDisponibles, obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';

const STATUT_LABELS = { en_cours: 'En cours', terminee: 'Terminée', a_completer: 'À compléter', exportee: 'Exportée' };

function SiteVisitesScreen({ route, navigation }) {
  const { siteId, nomSite } = route.params;
  const [visites, setVisites] = useState([]);
  const [site, setSite] = useState(null);
  const [choixModeVisible, setChoixModeVisible] = useState(false);
  const [trameChoisie, setTrameChoisie] = useState(DEFAULT_TRAME_ID);
  const [gpsVisible, setGpsVisible] = useState(false);
  const [adresse, setAdresse] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [note, setNote] = useState('');
  const [localisationEnCours, setLocalisationEnCours] = useState(false);
  const tramesDisponibles = listerTramesDisponibles();

  const charger = useCallback(async () => {
    const [v, s] = await Promise.all([listerVisitesSite(siteId), getSiteLocalisation(siteId)]);
    setVisites(v);
    setSite(s);
    if (s) {
      setAdresse(s.adresse || '');
      setLatitude(s.latitude === null || s.latitude === undefined ? '' : String(s.latitude));
      setLongitude(s.longitude === null || s.longitude === undefined ? '' : String(s.longitude));
      setNote(s.localisation_note || '');
    }
  }, [siteId]);

  useEffect(() => { charger(); }, [charger]);

  const ouvrirNouvelleVisite = () => {
    const derniereTrame = visites[0]?.trame_id;
    setTrameChoisie(derniereTrame || DEFAULT_TRAME_ID);
    setChoixModeVisible(true);
  };

  const nouvelleVisite = async (mode) => {
    if (mode === 'express' && visites.length === 0) return;
    const trameId = mode === 'express'
      ? (visites[0]?.trame_id || trameChoisie || DEFAULT_TRAME_ID)
      : (trameChoisie || DEFAULT_TRAME_ID);
    setChoixModeVisible(false);
    const visiteId = await creerVisiteProduction({ siteId, mode, trameId });
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    navigation.navigate('Visite', { visiteId });
  };

  const confirmerSuppressionVisite = (visite) => {
    Alert.alert(
      'Supprimer cette visite ?',
      `La visite du ${visite.date_visite || 'date non renseignée'} et toutes ses photos, réserves, relevés et observations propres seront définitivement supprimées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try { await supprimerVisiteComplete(visite.id); await charger(); }
          catch (e) { Alert.alert('Suppression impossible', String(e.message || e)); }
        } },
      ]
    );
  };

  const utiliserMaPosition = async () => {
    try {
      setLocalisationEnCours(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission requise', "L'accès à la position est nécessaire pour enregistrer le point GPS du site.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLatitude(String(lat));
      setLongitude(String(lng));
      await modifierSiteRapide(siteId, { adresse, note });
      await enregistrerSiteLocalisation(siteId, { latitude: lat, longitude: lng, precisionGps: pos.coords.accuracy, note });
      await charger();
      setGpsVisible(false);
    } catch (e) {
      Alert.alert('Localisation impossible', String(e.message || e));
    } finally {
      setLocalisationEnCours(false);
    }
  };

  const localiserDepuisAdresse = async () => {
    if (!adresse.trim()) { Alert.alert('Adresse requise', "Saisis d'abord l'adresse du site."); return; }
    try {
      setLocalisationEnCours(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Autorisation de localisation refusée');
      const resultats = await Location.geocodeAsync(adresse.trim());
      const p = resultats?.[0];
      if (!p || !coordonneeValide(p.latitude, p.longitude)) throw new Error('Adresse non localisée');
      setLatitude(String(p.latitude));
      setLongitude(String(p.longitude));
      await modifierSiteRapide(siteId, { adresse, note });
      await enregistrerSiteLocalisation(siteId, { latitude: p.latitude, longitude: p.longitude, note });
      await charger();
      setGpsVisible(false);
    } catch (e) {
      Alert.alert('Géocodage impossible', String(e.message || e));
    } finally {
      setLocalisationEnCours(false);
    }
  };

  const enregistrerGpsManuel = async () => {
    const lat = Number(String(latitude).replace(',', '.'));
    const lng = Number(String(longitude).replace(',', '.'));
    if (!coordonneeValide(lat, lng)) {
      Alert.alert('Coordonnées invalides', 'Vérifie la latitude et la longitude.');
      return;
    }
    try {
      await modifierSiteRapide(siteId, { adresse, note });
      await enregistrerSiteLocalisation(siteId, { latitude: lat, longitude: lng, note });
      setGpsVisible(false);
      await charger();
    } catch (e) {
      Alert.alert('Erreur', String(e.message || e));
    }
  };

  const ouvrirGoogleMaps = async () => {
    if (!site) return;
    const query = coordonneeValide(site.latitude, site.longitude)
      ? `${Number(site.latitude)},${Number(site.longitude)}`
      : String(site.adresse || '').trim();
    if (!query) return;
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
    } catch {
      Alert.alert('Google Maps', "Impossible d'ouvrir Google Maps.");
    }
  };

  const aGps = !!site && coordonneeValide(site.latitude, site.longitude);

  const LocalisationHeader = () => (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionLabel}>Localisation technique</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{site?.adresse || 'Adresse à renseigner'}</Text>
        </View>
        <TouchableOpacity onPress={() => setGpsVisible(true)} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{aGps || site?.adresse ? 'Modifier' : '+ Positionner'}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E5E8' }}>
        {aGps ? (
          <>
            <Text style={{ fontWeight: '800' }}>📍 {Number(site.latitude).toFixed(6)}, {Number(site.longitude).toFixed(6)}</Text>
            {site.precision_gps ? <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>Précision GPS ≈ {Math.round(site.precision_gps)} m</Text> : null}
            {site.localisation_note ? <Text style={{ marginTop: 7, color: '#555' }}>{site.localisation_note}</Text> : null}
            <TouchableOpacity onPress={ouvrirGoogleMaps} style={{ marginTop: 10, paddingVertical: 8 }}>
              <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Ouvrir dans Google Maps ↗</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontWeight: '700' }}>📍 Aucun point GPS</Text>
            <Text style={{ color: COLORS.muted, marginTop: 5, fontSize: 12 }}>{site?.adresse ? "L'adresse est renseignée : utilise « Localiser depuis l'adresse »." : 'Ajoute une adresse ou enregistre le point exact du local technique.'}</Text>
            {site?.adresse ? (
              <TouchableOpacity onPress={ouvrirGoogleMaps} style={{ marginTop: 8, paddingVertical: 6 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Rechercher l'adresse dans Google Maps ↗</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visites}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<View><LocalisationHeader /><Text style={styles.sectionLabel}>Historique des visites — {nomSite}</Text></View>}
        renderItem={({ item }) => {
          const trame = obtenirTrame(item.trame_id || DEFAULT_TRAME_ID);
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => navigation.navigate('Visite', { visiteId: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.date_visite || 'Sans date'}</Text>
                <Text style={styles.cardSub}>{trame.nom}{item.technicien ? ` · ${item.technicien}` : ''}</Text>
              </View>
              <View style={styles.badge}><Text style={styles.badgeText}>{STATUT_LABELS[item.statut] || item.statut} · {item.progression_pct}%</Text></View>
              <TouchableOpacity
                onPress={(e) => { e?.stopPropagation?.(); confirmerSuppressionVisite(item); }}
                style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}
                accessibilityLabel={`Supprimer la visite du ${item.date_visite || ''}`}
              >
                <Text style={{ color: COLORS.red || '#B42318', fontSize: 18, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucune visite pour ce site pour l'instant.</Text><Text style={styles.emptySub}>Lance la première avec le bouton ci-dessous.</Text></View>}
      />
      <View style={styles.fabBar}>
        <TouchableOpacity style={[styles.btnPrimary, styles.fabButton]} onPress={ouvrirNouvelleVisite}><Text style={styles.btnPrimaryText}>+ Nouvelle visite</Text></TouchableOpacity>
      </View>

      <Modal visible={gpsVisible} transparent animationType="fade" onRequestClose={() => setGpsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Adresse et position du site</Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>L'adresse sert au géocodage. Le point GPS peut ensuite être remplacé par la position exacte de l'accès technique.</Text>
            <TextInput style={styles.input} placeholder="Adresse complète" value={adresse} onChangeText={setAdresse} />
            <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} disabled={localisationEnCours || !adresse.trim()} onPress={localiserDepuisAdresse}>
              <Text style={styles.btnSecondaryText}>{localisationEnCours ? 'Localisation…' : "🗺️ Localiser depuis l'adresse"}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Latitude" keyboardType="decimal-pad" value={latitude} onChangeText={setLatitude} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Longitude" keyboardType="decimal-pad" value={longitude} onChangeText={setLongitude} />
            </View>
            <TextInput style={[styles.input, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]} placeholder="Note d'accès : parking P2, porte chaufferie, sous-sol…" multiline value={note} onChangeText={setNote} />
            <TouchableOpacity style={[styles.btnSecondary, { marginTop: 12 }]} disabled={localisationEnCours} onPress={utiliserMaPosition}>
              <Text style={styles.btnSecondaryText}>{localisationEnCours ? 'Localisation…' : '📍 Utiliser ma position actuelle'}</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setGpsVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={enregistrerGpsManuel}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={choixModeVisible} transparent animationType="fade" onRequestClose={() => setChoixModeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Nouvelle visite</Text>
              <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Trame de visite</Text>
              {tramesDisponibles.map((trame) => {
                const selected = trameChoisie === trame.id;
                return (
                  <TouchableOpacity
                    key={trame.id}
                    style={[styles.visitModeCard, selected && { borderColor: COLORS.primary, backgroundColor: '#FFF7EF' }]}
                    onPress={() => setTrameChoisie(trame.id)}
                  >
                    <Text style={styles.visitModeIcon}>{selected ? '✓' : '📄'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visitModeTitle}>{trame.nom}</Text>
                      <Text style={styles.visitModeText}>{trame.description || `Trame ${trame.nom}`}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.fieldLabel, { marginTop: 14, marginBottom: 8 }]}>Mode</Text>
              <TouchableOpacity style={[styles.visitModeCard, visites.length === 0 && { opacity: 0.45 }]} disabled={visites.length === 0} onPress={() => nouvelleVisite('express')}>
                <Text style={styles.visitModeIcon}>⚡</Text>
                <View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>Visite Express</Text><Text style={styles.visitModeText}>{visites.length === 0 ? 'Disponible après une première visite complète.' : 'Reprend automatiquement la trame de la dernière visite et les informations stables.'}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.visitModeCard} onPress={() => nouvelleVisite('complete')}>
                <Text style={styles.visitModeIcon}>📋</Text>
                <View style={{ flex: 1 }}><Text style={styles.visitModeTitle}>Visite complète</Text><Text style={styles.visitModeText}>Parcourt toute la trame sélectionnée pour une première visite ou un audit détaillé.</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => setChoixModeVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { SiteVisitesScreen };
