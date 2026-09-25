import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';

function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function displayMoney(value) {
  return amount(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
}

function parseCriticality(value) {
  try {
    const obj = value ? JSON.parse(value) : {};
    return Object.entries(obj)
      .filter(([key, v]) => key !== 'reason' && Boolean(v))
      .map(
        ([key]) =>
          ({
            security: 'Sécurité',
            regulatory: 'Réglementaire',
            continuity: 'Continuité',
            energy: 'Énergie',
            comfort: 'Confort',
            asset: 'Patrimoine'
          })[key] || key
      );
  } catch {
    return [];
  }
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: 9,
        paddingVertical: 7,
        marginRight: 6,
        marginBottom: 6
      }}
    >
      <Text
        style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontWeight: '900' }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function MissionP3DashboardScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const year = new Date().getFullYear();
  const [equipment, setEquipment] = useState([]);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const rows = await db.getAllAsync(
      `SELECT e.*,s.name AS site_name,l.label AS location_label
       FROM mission_equipment e
       JOIN mission_site_links ml ON ml.site_id=e.site_id
       LEFT JOIN mission_sites s ON s.id=e.site_id
       LEFT JOIN mission_locations l ON l.id=e.location_id
       WHERE ml.mission_id=?
       ORDER BY
         CASE WHEN e.replacement_year IS NULL THEN 1 ELSE 0 END,
         e.replacement_year,
         s.name,e.type,e.brand,e.model`,
      [missionId]
    );
    setEquipment(rows || []);
  }, [missionId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const withCost = equipment.filter((row) => amount(row.replacement_cost) > 0);
    const due = equipment.filter((row) => Number(row.replacement_year) > 0 && Number(row.replacement_year) <= year);
    const next3 = equipment.filter(
      (row) => Number(row.replacement_year) > year && Number(row.replacement_year) <= year + 3
    );
    const missing = equipment.filter(
      (row) => !row.replacement_year || !row.replacement_cost || !row.expected_lifetime_years
    );
    return {
      total: equipment.length,
      totalCost: withCost.reduce((sum, row) => sum + amount(row.replacement_cost), 0),
      dueCount: due.length,
      dueCost: due.reduce((sum, row) => sum + amount(row.replacement_cost), 0),
      next3Count: next3.length,
      next3Cost: next3.reduce((sum, row) => sum + amount(row.replacement_cost), 0),
      missingCount: missing.length
    };
  }, [equipment, year]);

  const rows = useMemo(() => {
    if (filter === 'due')
      return equipment.filter((row) => Number(row.replacement_year) > 0 && Number(row.replacement_year) <= year);
    if (filter === 'next3')
      return equipment.filter((row) => Number(row.replacement_year) > year && Number(row.replacement_year) <= year + 3);
    if (filter === 'missing')
      return equipment.filter((row) => !row.replacement_year || !row.replacement_cost || !row.expected_lifetime_years);
    return equipment;
  }, [equipment, filter, year]);

  const buckets = useMemo(() => {
    const map = new Map();
    for (const row of equipment) {
      const target = Number(row.replacement_year);
      if (!target) continue;
      const current = map.get(target) || { year: target, count: 0, cost: 0 };
      current.count += 1;
      current.cost += amount(row.replacement_cost);
      map.set(target, current);
    }
    return [...map.values()].sort((a, b) => a.year - b.year).slice(0, 12);
  }, [equipment]);

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={[styles.sectionTitle, missionStyles.title]}>P2 / P3 · projection patrimoniale</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
          Cette vue consolide uniquement les données déjà renseignées dans les fiches équipements : état, durée de vie
          indicative, coût et année de renouvellement. METRA ne transforme pas cette projection en décision
          contractuelle automatique.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
          {[
            [stats.total, 'équipements'],
            [displayMoney(stats.totalCost), 'coûts renseignés'],
            [stats.dueCount + ' · ' + displayMoney(stats.dueCost), 'échéus / ' + year],
            [stats.next3Count + ' · ' + displayMoney(stats.next3Cost), 'sur 3 ans'],
            [stats.missingCount, 'à compléter']
          ].map(([value, label]) => (
            <View
              key={label}
              style={[missionStyles.statBox, { minWidth: '30%', flexGrow: 1, padding: 10, borderRadius: 11 }]}
            >
              <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13.5, fontWeight: '900' }}>{value}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.1, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        {buckets.length ? (
          <>
            <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>
              Projection par année
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {buckets.map((bucket) => (
                <View key={bucket.year} style={[missionStyles.card, { width: 140, padding: 10, marginRight: 7 }]}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13, fontWeight: '900' }}>
                    {bucket.year}
                  </Text>
                  <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 3 }}>{bucket.count} équipement(s)</Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>
                    {displayMoney(bucket.cost)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Inventaire patrimonial</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 7 }}>
          <Chip label="Tous" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={'Échéus / ' + year} selected={filter === 'due'} onPress={() => setFilter('due')} />
          <Chip label={'≤ ' + (year + 3)} selected={filter === 'next3'} onPress={() => setFilter('next3')} />
          <Chip label="À compléter" selected={filter === 'missing'} onPress={() => setFilter('missing')} />
        </View>

        {rows.map((row) => {
          const axes = parseCriticality(row.criticality_json);
          const missing = [
            !row.expected_lifetime_years ? 'durée de vie' : null,
            !row.replacement_cost ? 'coût' : null,
            !row.replacement_year ? 'année cible' : null
          ].filter(Boolean);
          return (
            <TouchableOpacity
              key={row.id}
              activeOpacity={0.82}
              onPress={() =>
                navigation.navigate('MissionEquipment', { missionId, siteId: row.site_id, equipmentId: row.id })
              }
              style={[missionStyles.card, { padding: 11, marginBottom: 8 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.ink, fontSize: 10.8, fontWeight: '900' }}>
                    {row.type || 'Équipement'}
                  </Text>
                  <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 3 }}>
                    {[row.brand, row.model].filter(Boolean).join(' · ') || 'Identification à compléter'}
                  </Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 3 }}>
                    {[row.site_name, row.location_label, row.state].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 10, fontWeight: '900' }}>
                    {row.replacement_year || 'Année ?'}
                  </Text>
                  <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 3 }}>
                    {row.replacement_cost ? displayMoney(row.replacement_cost) : 'Coût ?'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 5 }}>
                Durée de vie : {row.expected_lifetime_years || '?'} ans
                {axes.length ? ' · Axes : ' + axes.join(', ') : ''}
              </Text>
              {missing.length ? (
                <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.2, marginTop: 4 }}>
                  À compléter : {missing.join(', ')}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {!rows.length ? (
          <View style={[missionStyles.card, { padding: 14 }]}>
            <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun équipement dans cette sélection.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
