import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS, styles } from './styles.js';
import { listerSitesClient } from './db.js';
import { coordonneeValide, synchroniserCoordonneesClient } from './siteGeoDb.js';

const MAP_W = 960;
const MAP_H = 560;
const PAD = 54;

function projeterSites(sites) {
  const valides = (sites || []).filter((s) => coordonneeValide(s.latitude, s.longitude));
  if (!valides.length) return [];
  const lats = valides.map((s) => Number(s.latitude));
  const lngs = valides.map((s) => Number(s.longitude));
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  if (Math.abs(maxLat - minLat) < 0.002) { minLat -= 0.002; maxLat += 0.002; }
  if (Math.abs(maxLng - minLng) < 0.002) { minLng -= 0.002; maxLng += 0.002; }
  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;
  return valides.map((site) => ({
    site,
    x: PAD + ((Number(site.longitude) - minLng) / spanLng) * (MAP_W - PAD * 2),
    y: PAD + ((maxLat - Number(site.latitude)) / spanLat) * (MAP_H - PAD * 2),
  }));
}

function ClientMapScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [sites, setSites] = useState([]);
  const [selection, setSelection] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    if (!clientId) return;
    const liste = await listerSitesClient(clientId);
    setSites(Array.isArray(liste) ? liste : []);
  }, [clientId]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        if (!actif) return;
        await charger();
        const r = await synchroniserCoordonneesClient(clientId);
        if (!actif) return;
        if (r.positionnes) await charger();
      } catch {
        // La carte doit rester exploitable hors connexion avec les points déjà mis en cache.
      }
    })();
    return () => { actif = false; };
  }, [clientId, charger]);

  const filtre = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => `${s.nom_site || ''} ${s.adresse || ''}`.toLowerCase().includes(q));
  }, [sites, recherche]);

  const points = useMemo(() => projeterSites(filtre), [filtre]);
  const sansPosition = filtre.filter((s) => !coordonneeValide(s.latitude, s.longitude));

  const synchroniser = async () => {
    if (!clientId || syncing) return;
    try {
      setSyncing(true);
      setMessage('Synchronisation des adresses…');
      const r = await synchroniserCoordonneesClient(clientId, { force: true });
      await charger();
      setMessage(`${r.positionnes} adresse${r.positionnes > 1 ? 's' : ''} positionnée${r.positionnes > 1 ? 's' : ''}${r.indisponibles ? ` · ${r.indisponibles} à reprendre avec Internet` : ''}`);
    } catch (e) {
      setMessage('Connexion indisponible : les positions déjà enregistrées restent visibles.');
    } finally {
      setSyncing(false);
    }
  };

  const ouvrirUrl = async (url, titre) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(titre, `Impossible d’ouvrir ${titre}.`);
    }
  };

  const ouvrirGoogleMaps = (site) => {
    const q = encodeURIComponent(String(site?.adresse || site?.nom_site || '').trim());
    if (!q) return;
    ouvrirUrl(`https://www.google.com/maps/search/?api=1&query=${q}`, 'Google Maps');
  };

  const ouvrirGoogleEarth = (site) => {
    const q = encodeURIComponent(String(site?.adresse || site?.nom_site || '').trim());
    if (!q) return;
    ouvrirUrl(`https://earth.google.com/web/search/${q}`, 'Google Earth');
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.ink }}>Carte METRA · {nomClient || 'Client'}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
            Les points déjà calculés restent disponibles hors connexion. Une connexion n’est utilisée que pour positionner une nouvelle adresse ou ouvrir Google Maps / Earth.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher un site ou une adresse"
        />

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line }}>
            <Text style={{ fontSize: 19, fontWeight: '900' }}>{points.length}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>sites visibles sur la carte</Text>
          </View>
          <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line }}>
            <Text style={{ fontSize: 19, fontWeight: '900' }}>{sansPosition.length}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>adresses en attente de synchronisation</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} disabled={syncing} onPress={synchroniser}>
          <Text style={styles.btnSecondaryText}>{syncing ? 'Synchronisation…' : '↻ Actualiser les positions depuis les adresses'}</Text>
        </TouchableOpacity>
        {syncing ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
        {message ? <Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 8 }}>{message}</Text> : null}

        <View style={{ marginTop: 14, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F5F7F8', borderWidth: 1, borderColor: COLORS.line }}>
          {points.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <Svg width={MAP_W} height={MAP_H}>
                <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#F5F7F8" />
                {[1,2,3,4,5].map((n) => <Line key={`v${n}`} x1={(MAP_W / 6) * n} y1="0" x2={(MAP_W / 6) * n} y2={MAP_H} stroke="#DCE2E6" strokeWidth="1" />)}
                {[1,2,3,4].map((n) => <Line key={`h${n}`} x1="0" y1={(MAP_H / 5) * n} x2={MAP_W} y2={(MAP_H / 5) * n} stroke="#DCE2E6" strokeWidth="1" />)}
                <SvgText x={MAP_W - 30} y="26" fontSize="13" fontWeight="700" fill="#69757D">N</SvgText>
                {points.map(({ site, x, y }) => {
                  const selected = selection?.id === site.id;
                  return (
                    <G key={site.id} onPress={() => setSelection(site)}>
                      <Circle cx={x} cy={y} r={selected ? 13 : 10} fill={selected ? '#10384B' : '#F07E31'} stroke="#fff" strokeWidth="3" />
                      <SvgText x={x + 14} y={y + 4} fontSize="11" fontWeight="700" fill="#25313A">{String(site.nom_site || 'Site').slice(0, 28)}</SvgText>
                    </G>
                  );
                })}
              </Svg>
            </ScrollView>
          ) : (
            <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ fontWeight: '800', textAlign: 'center' }}>Aucun point cartographique disponible pour cette sélection.</Text>
              <Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 6 }}>Les adresses restent enregistrées et seront positionnées automatiquement dès qu’une connexion sera disponible.</Text>
            </View>
          )}
        </View>

        {selection ? (
          <View style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line }}>
            <Text style={{ fontSize: 17, fontWeight: '900' }}>{selection.nom_site}</Text>
            <Text style={{ color: COLORS.inkSoft, marginTop: 4 }}>{selection.adresse || 'Adresse à renseigner'}</Text>
            {selection.localisation_note ? <Text style={{ color: COLORS.muted, marginTop: 5 }}>{selection.localisation_note}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('SiteVisites', { siteId: selection.id, nomSite: selection.nom_site })}><Text style={styles.btnPrimaryText}>Ouvrir le site</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => ouvrirGoogleMaps(selection)}><Text style={styles.btnSecondaryText}>Google Maps ↗</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => ouvrirGoogleEarth(selection)}><Text style={styles.btnSecondaryText}>Google Earth ↗</Text></TouchableOpacity>
            </View>
          </View>
        ) : null}

        {sansPosition.length ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.sectionLabel}>Adresses à synchroniser</Text>
            {sansPosition.map((site) => (
              <TouchableOpacity key={site.id} style={[styles.card, { marginTop: 8 }]} onPress={() => setSelection(site)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{site.nom_site}</Text>
                  <Text style={styles.cardSub}>{site.adresse || 'Adresse à renseigner'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export { ClientMapScreen };
