import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';

const NODE_W = 150;
const NODE_H = 60;
const X_GAP = 55;
const Y_GAP = 28;

function nodeLabel(row) {
  return row.type || row.model || row.brand || 'Équipement';
}

function subLabel(row) {
  return [row.brand, row.model].filter(Boolean).join(' · ');
}

function buildLayout(equipment, relations) {
  const byId = new Map(equipment.map((item) => [item.id, item]));
  const incoming = new Map();
  const outgoing = new Map();

  equipment.forEach((item) => {
    incoming.set(item.id, []);
    outgoing.set(item.id, []);
  });
  relations.forEach((rel) => {
    if (!byId.has(rel.source_equipment_id) || !byId.has(rel.target_equipment_id)) return;
    outgoing.get(rel.source_equipment_id).push(rel);
    incoming.get(rel.target_equipment_id).push(rel);
  });

  const roots = equipment.filter((item) => (incoming.get(item.id) || []).length === 0);
  const seed = roots.length ? roots : equipment.slice(0, 1);
  const level = new Map(seed.map((item) => [item.id, 0]));
  const queue = seed.map((item) => item.id);

  while (queue.length) {
    const id = queue.shift();
    const current = level.get(id) || 0;
    for (const rel of outgoing.get(id) || []) {
      const next = rel.target_equipment_id;
      const nextLevel = current + 1;
      if (!level.has(next) || level.get(next) < nextLevel) {
        level.set(next, nextLevel);
        if (nextLevel < 8) queue.push(next);
      }
    }
  }

  equipment.forEach((item) => {
    if (!level.has(item.id)) level.set(item.id, 0);
  });

  const groups = new Map();
  equipment.forEach((item) => {
    const l = level.get(item.id) || 0;
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(item);
  });

  const nodes = new Map();
  let maxRows = 1;
  for (const [l, items] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    maxRows = Math.max(maxRows, items.length);
    items.forEach((item, row) => {
      nodes.set(item.id, {
        ...item,
        x: 20 + l * (NODE_W + X_GAP),
        y: 20 + row * (NODE_H + Y_GAP),
      });
    });
  }

  const maxLevel = Math.max(0, ...[...groups.keys()]);
  return {
    nodes,
    width: Math.max(360, 40 + (maxLevel + 1) * (NODE_W + X_GAP)),
    height: Math.max(320, 40 + maxRows * (NODE_H + Y_GAP)),
  };
}

export function MissionTechnicalGraphScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [relations, setRelations] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    try {
      const db = await getDb();
      const [eq, rel] = await Promise.all([
        db.getAllAsync(
          'SELECT e.*,s.name AS site_name,l.label AS location_label FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id LEFT JOIN mission_sites s ON s.id=e.site_id LEFT JOIN mission_locations l ON l.id=e.location_id WHERE ml.mission_id=? ORDER BY s.name,e.type,e.brand,e.model',
          [missionId]
        ),
        db.getAllAsync('SELECT * FROM mission_equipment_relations WHERE mission_id=? ORDER BY created_at', [missionId]),
      ]);
      setEquipment(eq || []);
      setRelations(rel || []);
    } catch (e) {
      Alert.alert('Synoptique indisponible', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  const layout = useMemo(() => buildLayout(equipment, relations), [equipment, relations]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={MISSION_COLORS.accent} /><Text style={{ marginTop: 8, color: COLORS.muted }}>Construction du synoptique…</Text></View>;
  }

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Relations techniques</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Les traits représentent de vraies relations structurées entre équipements. Touchez un équipement pour afficher son contexte.
      </Text>
    </View>

    {!equipment.length ? <View style={{ padding: 16 }}>
      <View style={[styles.card, missionStyles.card]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 16 }}>
          Aucun équipement Mission n’est encore disponible. Importez un inventaire Excel ou créez les équipements nécessaires à la Mission.
        </Text>
      </View>
    </View> : null}

    {equipment.length ? <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ minWidth: layout.width }}>
      <ScrollView contentContainerStyle={{ width: layout.width, minHeight: layout.height }}>
        <Svg width={layout.width} height={layout.height}>
          {relations.map((rel) => {
            const a = layout.nodes.get(rel.source_equipment_id);
            const b = layout.nodes.get(rel.target_equipment_id);
            if (!a || !b) return null;
            return <G key={rel.id}>
              <Line
                x1={a.x + NODE_W}
                y1={a.y + NODE_H / 2}
                x2={b.x}
                y2={b.y + NODE_H / 2}
                stroke={MISSION_COLORS.accentLineStrong}
                strokeWidth="2"
              />
              <SvgText
                x={(a.x + NODE_W + b.x) / 2}
                y={(a.y + b.y) / 2 + NODE_H / 2 - 5}
                fontSize="8"
                fill={MISSION_COLORS.accentDark}
                textAnchor="middle"
              >
                {String(rel.label || rel.relation_type || '').slice(0, 28)}
              </SvgText>
            </G>;
          })}
          {[...layout.nodes.values()].map((node) => {
            const active = selected?.id === node.id;
            return <G key={node.id} onPress={() => setSelected(node)}>
              <Rect
                x={node.x}
                y={node.y}
                rx="12"
                ry="12"
                width={NODE_W}
                height={NODE_H}
                fill={active ? MISSION_COLORS.accentLight : '#FFFFFF'}
                stroke={active ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong}
                strokeWidth={active ? '2.5' : '1.5'}
              />
              <SvgText x={node.x + 10} y={node.y + 22} fontSize="10" fontWeight="700" fill={MISSION_COLORS.accentStrong}>
                {nodeLabel(node).slice(0, 24)}
              </SvgText>
              <SvgText x={node.x + 10} y={node.y + 39} fontSize="8.5" fill={COLORS.inkSoft}>
                {subLabel(node).slice(0, 28)}
              </SvgText>
              <SvgText x={node.x + 10} y={node.y + 52} fontSize="7.5" fill={COLORS.inkFaint}>
                {(node.location_label || node.site_name || '').slice(0, 31)}
              </SvgText>
            </G>;
          })}
        </Svg>
      </ScrollView>
    </ScrollView> : null}

    {selected ? <View style={[styles.card, missionStyles.card, { margin: 16, marginTop: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 13 }}>{nodeLabel(selected)}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 3 }}>{subLabel(selected) || 'Caractéristiques à compléter'}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, marginTop: 3 }}>{selected.site_name || ''}{selected.location_label ? ' · ' + selected.location_label : ''}</Text>
        </View>
        <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 5 }}><Text style={{ color: COLORS.inkFaint }}>✕</Text></TouchableOpacity>
      </View>
    </View> : null}
  </View>;
}
