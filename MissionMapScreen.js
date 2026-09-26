import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { LocalTile, Marker, Overlay, Polygon, Polyline } from 'react-native-maps';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { exporterGeoJsonMission, exporterGeoPackageMission, importerGeoJsonMission } from './missionPlanDb.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import {
  configurerRasterMission,
  importerRasterMission,
  importerTuilesXyzMission,
  listerCouchesCarteMission,
  mettreAJourCoucheCarteMission,
  supprimerCoucheCarteMission,
} from './missionMapLayerDb.js';

function parse(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function coordinateList(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [{ latitude: Number(geometry.coordinates?.[1]), longitude: Number(geometry.coordinates?.[0]) }];
  if (geometry.type === 'LineString') return (geometry.coordinates || []).map((c) => ({ latitude: Number(c[1]), longitude: Number(c[0]) }));
  if (geometry.type === 'Polygon') return (geometry.coordinates?.[0] || []).map((c) => ({ latitude: Number(c[1]), longitude: Number(c[0]) }));
  return [];
}

function regionFromGeometries(rows) {
  const coords = rows.flatMap((row) => coordinateList(parse(row.geojson))).filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
  if (!coords.length) return { latitude: 46.603354, longitude: 1.888334, latitudeDelta: 8, longitudeDelta: 8 };
  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.01, (maxLon - minLon) * 1.5),
  };
}

export function MissionMapScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [geometries, setGeometries] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [stats, setStats] = useState([]);
  const [mapLayers, setMapLayers] = useState([]);
  const [layersModal, setLayersModal] = useState(false);
  const [rasterLayer, setRasterLayer] = useState(null);
  const [rasterDraft, setRasterDraft] = useState({ north: '', south: '', east: '', west: '', opacity: '0.75' });
  const [layerBusy, setLayerBusy] = useState(false);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [geo, siteRows, statRows, layerRows] = await Promise.all([
      db.getAllAsync("SELECT * FROM mission_geometries WHERE mission_id=? AND coordinate_space IN ('geo','wgs84','epsg:4326') ORDER BY created_at", [missionId]),
      db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
      db.getAllAsync(
        `SELECT s.id,s.name,
          (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id) AS visits_total,
          (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id AND v.status='completed') AS visits_done,
          (SELECT COUNT(*) FROM mission_points p WHERE p.mission_id=? AND p.site_id=s.id AND p.status NOT IN ('closed','cancelled')) AS open_points,
          (SELECT COUNT(*) FROM mission_points p WHERE p.mission_id=? AND p.site_id=s.id AND p.status NOT IN ('closed','cancelled')
             AND (LOWER(COALESCE(p.priority,'')) LIKE '%crit%' OR LOWER(COALESCE(p.priority,'')) LIKE '%urgent%' OR LOWER(COALESCE(p.priority,'')) LIKE '%haute%')) AS critical_points
         FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id
         WHERE l.mission_id=? ORDER BY s.name`,
        [missionId, missionId, missionId, missionId, missionId]
      ),
      listerCouchesCarteMission(missionId),
    ]);
    setGeometries(geo || []);
    setSites(siteRows || []);
    setStats(statRows || []);
    setMapLayers(layerRows || []);
    if (!selectedSiteId && siteRows?.[0]?.id) setSelectedSiteId(siteRows[0].id);
  }, [missionId, selectedSiteId]);

  React.useEffect(() => { load(); }, [load]);

  const region = useMemo(() => regionFromGeometries(geometries), [geometries]);
  const sitePointById = useMemo(() => {
    const map = new Map();
    geometries.forEach((row) => {
      if (!row.site_id) return;
      const geo = parse(row.geojson);
      if (geo?.type === 'Point' && !map.has(row.site_id)) map.set(row.site_id, geo);
    });
    return map;
  }, [geometries]);

  const visibleRasterLayers = useMemo(
    () => mapLayers.filter((layer) => Number(layer.visible) === 1 && layer.type === 'raster' && layer.data?.bounds),
    [mapLayers]
  );
  const visibleTileLayers = useMemo(
    () => mapLayers.filter((layer) => Number(layer.visible) === 1 && layer.type === 'xyz_tiles' && layer.data?.pathTemplate),
    [mapLayers]
  );

  const addSitePoint = async (event) => {
    if (!selectedSiteId) {
      Alert.alert('Site à sélectionner', 'Choisis le Site à positionner avant de maintenir le doigt sur la carte.');
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const db = await getDb();
    const site = sites.find((s) => s.id === selectedSiteId);
    await db.runAsync(
      'INSERT INTO mission_geometries(id,mission_id,site_id,geometry_type,geojson,coordinate_space,label) VALUES(?,?,?,?,?,?,?)',
      [createId('mgeo'), missionId, selectedSiteId, 'point', JSON.stringify({ type: 'Point', coordinates: [longitude, latitude] }), 'epsg:4326', site?.name || 'Site']
    );
    await load();
  };

  const importGeo = async () => {
    try {
      const result = await importerGeoJsonMission({ missionId });
      if (result) {
        await load();
        Alert.alert('Couche SIG importée', String(result.featureCount || 0) + ' géométrie(s) intégrée(s).');
      }
    } catch (e) { Alert.alert('Import SIG impossible', String(e?.message || e)); }
  };

  const exportGeo = async () => {
    try { await exporterGeoJsonMission(missionId, { share: true }); }
    catch (e) { Alert.alert('Export SIG impossible', String(e?.message || e)); }
  };

  const importRaster = async () => {
    if (layerBusy) return;
    setLayerBusy(true);
    try {
      const result = await importerRasterMission({ missionId });
      if (!result) return;
      setRasterLayer(result);
      setRasterDraft({ north: '', south: '', east: '', west: '', opacity: '0.75' });
      await load();
    } catch (e) {
      Alert.alert('Raster impossible', String(e?.message || e));
    } finally {
      setLayerBusy(false);
    }
  };

  const saveRasterBounds = async () => {
    if (!rasterLayer?.id) return;
    try {
      await configurerRasterMission(rasterLayer.id, rasterDraft);
      setRasterLayer(null);
      await load();
    } catch (e) {
      Alert.alert('Calage raster impossible', String(e?.message || e));
    }
  };

  const editRaster = (layer) => {
    const bounds = layer.data?.bounds || {};
    setRasterLayer({ id: layer.id, label: layer.label });
    setRasterDraft({
      north: bounds.north === undefined ? '' : String(bounds.north),
      south: bounds.south === undefined ? '' : String(bounds.south),
      east: bounds.east === undefined ? '' : String(bounds.east),
      west: bounds.west === undefined ? '' : String(bounds.west),
      opacity: String(layer.style?.opacity ?? 0.75),
    });
  };

  const importTiles = async () => {
    if (layerBusy) return;
    setLayerBusy(true);
    try {
      const result = await importerTuilesXyzMission({ missionId });
      if (result) {
        await load();
        Alert.alert('Tuiles hors ligne importées', 'Zoom ' + result.minZoom + ' à ' + result.maxZoom + '. Le fond peut maintenant fonctionner sans réseau.');
      }
    } catch (e) {
      Alert.alert('Tuiles XYZ impossibles', String(e?.message || e));
    } finally {
      setLayerBusy(false);
    }
  };

  const toggleLayer = async (layer) => {
    await mettreAJourCoucheCarteMission(layer.id, { visible: !Number(layer.visible) });
    await load();
  };

  const removeLayer = (layer) => {
    Alert.alert('Supprimer cette couche ?', layer.label || 'Couche cartographique', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supprimerCoucheCarteMission(layer.id);
          await load();
        },
      },
    ]);
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Cartographie Mission</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 9.7, lineHeight: 14 }}>
        Maintiens le doigt sur la carte pour positionner le Site sélectionné. Les géométries restent exportables vers QGIS/SIG.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {sites.map((site) => <TouchableOpacity
          key={site.id}
          onPress={() => setSelectedSiteId(site.id)}
          style={{ borderRadius: 10, borderWidth: 1, borderColor: selectedSiteId === site.id ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selectedSiteId === site.id ? MISSION_COLORS.accentLight : '#FFFFFF', paddingHorizontal: 9, paddingVertical: 6 }}
        ><Text style={{ color: selectedSiteId === site.id ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontFamily: FONTS.bold }}>{site.name}</Text></TouchableOpacity>)}
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={importGeo}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={exportGeo}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={async () => { try { await exporterGeoPackageMission(missionId); } catch (e) { Alert.alert('GeoPackage', String(e?.message || e)); } }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ GeoPackage</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={layerBusy} onPress={importRaster}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Raster local</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} disabled={layerBusy} onPress={importTiles}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Tuiles XYZ ZIP</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setLayersModal(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Couches ({mapLayers.length})</Text></TouchableOpacity>
      </View>
    </View>

    <MapView
      style={{ flex: 1 }}
      initialRegion={region}
      onLongPress={addSitePoint}
      mapType={visibleTileLayers.length ? 'none' : 'standard'}
    >
      {visibleTileLayers.map((layer) => <LocalTile
        key={layer.id}
        pathTemplate={layer.data.pathTemplate}
        tileSize={Number(layer.data.tileSize || 256)}
        zIndex={-2}
      />)}
      {visibleRasterLayers.map((layer) => {
        const b = layer.data.bounds;
        return <Overlay
          key={layer.id}
          image={{ uri: layer.source_uri }}
          bounds={[[Number(b.south), Number(b.west)], [Number(b.north), Number(b.east)]]}
          opacity={Number(layer.style?.opacity ?? 0.75)}
        />;
      })}
      {geometries.map((row) => {
        const geometry = parse(row.geojson);
        const coords = coordinateList(geometry);
        if (!geometry || !coords.length) return null;
        if (geometry.type === 'Point') {
          const siteStat = stats.find((s) => s.id === row.site_id);
          return <Marker
            key={row.id}
            coordinate={coords[0]}
            title={row.label || siteStat?.name || 'Point METRA'}
            description={siteStat ? (String(siteStat.visits_done || 0) + '/' + String(siteStat.visits_total || 0) + ' visite(s) · ' + String(siteStat.open_points || 0) + ' point(s) ouvert(s)' + (Number(siteStat.critical_points || 0) ? ' · ' + siteStat.critical_points + ' critique(s)' : '')) : 'Géométrie Mission'}
            pinColor={Number(siteStat?.critical_points || 0) ? '#8B3A3A' : Number(siteStat?.open_points || 0) ? '#C78120' : MISSION_COLORS.accent}
            onCalloutPress={() => row.site_id && navigation.navigate('MissionStructure', { missionId, siteId: row.site_id })}
          />;
        }
        if (geometry.type === 'LineString') return <Polyline key={row.id} coordinates={coords} strokeWidth={4} />;
        if (geometry.type === 'Polygon') return <Polygon key={row.id} coordinates={coords} strokeWidth={3} fillColor="rgba(47,125,88,0.12)" />;
        return null;
      })}
    </MapView>

    <Modal visible={layersModal} transparent animationType="fade" onRequestClose={() => setLayersModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Couches cartographiques</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 8 }}>
          GeoJSON, raster géoréférencé et tuiles XYZ peuvent rester disponibles hors ligne. Le fond web est masqué lorsqu’une couche XYZ locale est active.
        </Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {mapLayers.map((layer) => <View key={layer.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => toggleLayer(layer)} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: Number(layer.visible) ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong, backgroundColor: Number(layer.visible) ? MISSION_COLORS.accentLight : '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.black }}>{Number(layer.visible) ? '✓' : ''}</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontSize: 10.3, fontFamily: FONTS.black }}>{layer.label}</Text>
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>{layer.type} · {Number(layer.offline_available) ? 'hors ligne' : 'métadonnées'}</Text>
              </View>
              {layer.type === 'raster' ? <TouchableOpacity onPress={() => editRaster(layer)} style={{ padding: 6 }}><Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9, fontFamily: FONTS.bold }}>Caler</Text></TouchableOpacity> : null}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => removeLayer(layer)} style={{ padding: 6 }}><CvcIcon name="close" size={14} color={'#8B3A3A'} strokeWidth={2.1} /></TouchableOpacity>
            </View>
          </View>)}
          {!mapLayers.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, paddingVertical: 12 }}>Aucune couche importée.</Text> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setLayersModal(false)}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!rasterLayer} transparent animationType="fade" onRequestClose={() => setRasterLayer(null)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Caler le raster</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 9 }}>
          Indique les limites WGS84 de l’image. Le fichier lui-même reste stocké localement dans la Mission.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} keyboardType="decimal-pad" value={rasterDraft.north} onChangeText={(v) => setRasterDraft((p) => ({ ...p, north: v }))} placeholder="Latitude Nord" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 7 }]} keyboardType="decimal-pad" value={rasterDraft.south} onChangeText={(v) => setRasterDraft((p) => ({ ...p, south: v }))} placeholder="Latitude Sud" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 7 }]} keyboardType="decimal-pad" value={rasterDraft.east} onChangeText={(v) => setRasterDraft((p) => ({ ...p, east: v }))} placeholder="Longitude Est" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 7 }]} keyboardType="decimal-pad" value={rasterDraft.west} onChangeText={(v) => setRasterDraft((p) => ({ ...p, west: v }))} placeholder="Longitude Ouest" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 7 }]} keyboardType="decimal-pad" value={rasterDraft.opacity} onChangeText={(v) => setRasterDraft((p) => ({ ...p, opacity: v }))} placeholder="Opacité 0 à 1" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setRasterLayer(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Plus tard</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveRasterBounds}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer le calage</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>

    <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF' }}>
      <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 9.5, fontFamily: FONTS.black, marginBottom: 4 }}>PROGRESSION MULTI-SITES</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 9 }} numberOfLines={2}>
        {stats.map((s) => s.name + ' ' + (s.visits_done || 0) + '/' + (s.visits_total || 0) + (Number(s.open_points || 0) ? ' · ' + s.open_points + ' ouvert(s)' : '') + (Number(s.critical_points || 0) ? ' · ' + s.critical_points + ' critique(s)' : '')).join('   •   ') || 'Aucune donnée de progression.'}
      </Text>
    </View>
  </View>;
}
