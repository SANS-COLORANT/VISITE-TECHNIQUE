import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { exporterGeoJsonMission, exporterGeoPackageMission, importerGeoJsonMission } from './missionPlanDb.js';

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

export function MissionMapScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [geometries, setGeometries] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [stats, setStats] = useState([]);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [geo, siteRows, statRows] = await Promise.all([
      db.getAllAsync("SELECT * FROM mission_geometries WHERE mission_id=? AND coordinate_space IN ('geo','wgs84','epsg:4326') ORDER BY created_at", [missionId]),
      db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
      db.getAllAsync(
        `SELECT s.id,s.name,
          (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id) AS visits_total,
          (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id AND v.status='completed') AS visits_done,
          (SELECT COUNT(*) FROM mission_points p WHERE p.mission_id=? AND p.site_id=s.id AND p.status NOT IN ('closed','cancelled')) AS open_points
         FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id
         WHERE l.mission_id=? ORDER BY s.name`,
        [missionId, missionId, missionId, missionId]
      ),
    ]);
    setGeometries(geo || []);
    setSites(siteRows || []);
    setStats(statRows || []);
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

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
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
        ><Text style={{ color: selectedSiteId === site.id ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontWeight: '800' }}>{site.name}</Text></TouchableOpacity>)}
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={importGeo}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={exportGeo}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ GeoJSON</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={async () => { try { await exporterGeoPackageMission(missionId); } catch (e) { Alert.alert('GeoPackage', String(e?.message || e)); } }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇩ GeoPackage</Text></TouchableOpacity>
      </View>
    </View>

    <MapView style={{ flex: 1 }} initialRegion={region} onLongPress={addSitePoint}>
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
            description={siteStat ? (String(siteStat.visits_done || 0) + '/' + String(siteStat.visits_total || 0) + ' visite(s) · ' + String(siteStat.open_points || 0) + ' point(s) ouvert(s)') : 'Géométrie Mission'}
          />;
        }
        if (geometry.type === 'LineString') return <Polyline key={row.id} coordinates={coords} strokeWidth={4} />;
        if (geometry.type === 'Polygon') return <Polygon key={row.id} coordinates={coords} strokeWidth={3} fillColor="rgba(47,125,88,0.12)" />;
        return null;
      })}
    </MapView>

    <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF' }}>
      <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 9.5, fontWeight: '900', marginBottom: 4 }}>PROGRESSION MULTI-SITES</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 9 }} numberOfLines={2}>
        {stats.map((s) => s.name + ' ' + (s.visits_done || 0) + '/' + (s.visits_total || 0) + (Number(s.open_points || 0) ? ' · ' + s.open_points + ' ouvert(s)' : '')).join('   •   ') || 'Aucune donnée de progression.'}
      </Text>
    </View>
  </View>;
}
