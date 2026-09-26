import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { getDb } from './db.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { relierEquipementsMission } from './missionDomainDb.js';
import { resolveEquipmentCategory } from './missionEquipmentCatalog.js';
import { CvcIcon } from './MetraCvcIcons.js';

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

function categoryBadge(row) {
  const key = resolveEquipmentCategory(row.type, (() => {
    try { return JSON.parse(row.properties_json || '{}')?.categoryKey || null; } catch { return null; }
  })())?.key;
  const badges = {
    boiler: 'CH',
    burner: 'BR',
    pump: 'P',
    heat_exchanger: 'EX',
    valve: 'V',
    expansion: 'EP',
    ecs_tank: 'ECS',
    vmc_box: 'VMC',
    cta: 'CTA',
    fan: 'F',
    filter: 'FL',
    heat_pump: 'PAC',
    chiller: 'GF',
    outdoor_unit: 'UE',
    indoor_unit: 'UI',
    fan_coil: 'VC',
    rooftop: 'RT',
    plc: 'GTB',
    sensor: 'S',
    actuator: 'A',
    gateway: 'GW',
    meter: 'C',
    water_treatment: 'TE',
  };
  return badges[key] || 'EQ';
}

function relationPresentation(rel) {
  const type = String(rel?.relation_type || '').toLowerCase();
  if (type.includes('control') || type.includes('commande')) return { dash: '6,4', width: 1.8 };
  if (type.includes('return') || type.includes('retour')) return { dash: '3,3', width: 2.2 };
  return { dash: null, width: 2.4 };
}

const RELATION_PRESETS = Object.freeze([
  ['feeds', 'Alimente'],
  ['serves', 'Dessert'],
  ['controls', 'Commande'],
  ['measures', 'Mesure / sonde'],
  ['return', 'Retour'],
  ['connected_to', 'Raccordé à'],
]);

function equipmentCategoryKey(row) {
  return resolveEquipmentCategory(row?.type, (() => {
    try { return JSON.parse(row?.properties_json || '{}')?.categoryKey || null; } catch { return null; }
  })())?.key || 'other';
}

function suggestedRelation(source, target) {
  const a = equipmentCategoryKey(source);
  const b = equipmentCategoryKey(target);
  if (a === 'outdoor_unit' && b === 'indoor_unit') return ['serves', 'UE → UI'];
  if (a === 'sensor' && ['plc','actuator','valve'].includes(b)) return ['measures', 'Mesure / information'];
  if (['plc','gateway'].includes(a) && ['actuator','valve','pump','boiler','heat_pump','indoor_unit'].includes(b)) return ['controls', 'Commande'];
  if (a === 'actuator' && b === 'valve') return ['controls', 'Actionne'];
  if (a === 'meter') return ['measures', 'Mesure'];
  return ['feeds', 'Alimente'];
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

export function MissionTechnicalGraphScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [relations, setRelations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [relationModal, setRelationModal] = useState(false);
  const [relationType, setRelationType] = useState('feeds');
  const [relationLabel, setRelationLabel] = useState('Alimente');
  const [siteFilter, setSiteFilter] = useState('all');
  const [query, setQuery] = useState('');

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

  const onNodePress = (node) => {
    if (!linkMode) {
      setSelected(node);
      return;
    }
    if (!linkSource) {
      setLinkSource(node);
      setSelected(node);
      return;
    }
    if (linkSource.id === node.id) {
      setLinkSource(null);
      setSelected(null);
      return;
    }
    setLinkTarget(node);
    const suggestion = suggestedRelation(linkSource, node);
    setRelationType(suggestion[0]);
    setRelationLabel(suggestion[1]);
    setRelationModal(true);
  };

  const saveRelation = async () => {
    if (!linkSource || !linkTarget) return;
    try {
      await relierEquipementsMission({
        missionId,
        sourceEquipmentId: linkSource.id,
        targetEquipmentId: linkTarget.id,
        relationType: relationType || 'linked_to',
        label: relationLabel || null,
      });
      setRelationModal(false);
      setLinkSource(null);
      setLinkTarget(null);
      setSelected(null);
      await load();
    } catch (e) {
      Alert.alert('Relation non créée', String(e?.message || e));
    }
  };

  const sites = useMemo(() => {
    const map = new Map();
    equipment.forEach((row) => {
      if (row.site_id && !map.has(row.site_id)) map.set(row.site_id, row.site_name || 'Site');
    });
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [equipment]);

  const visibleEquipment = useMemo(() => {
    const q = query.trim().toLowerCase();
    return equipment.filter((row) => {
      if (siteFilter !== 'all' && row.site_id !== siteFilter) return false;
      if (!q) return true;
      return [row.type,row.brand,row.model,row.location_label,row.site_name]
        .some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [equipment, siteFilter, query]);

  const visibleIds = useMemo(() => new Set(visibleEquipment.map((row) => row.id)), [visibleEquipment]);
  const visibleRelations = useMemo(
    () => relations.filter((rel) => visibleIds.has(rel.source_equipment_id) && visibleIds.has(rel.target_equipment_id)),
    [relations, visibleIds]
  );
  const layout = useMemo(() => buildLayout(visibleEquipment, visibleRelations), [visibleEquipment, visibleRelations]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={MISSION_COLORS.accent} /><Text style={{ marginTop: 8, color: COLORS.muted }}>Construction du synoptique…</Text></View>;
  }

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Relations techniques</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Les traits représentent de vraies relations structurées entre équipements. Touchez un équipement pour afficher son contexte.
      </Text>
      <TextInput
        style={[styles.input, missionStyles.input, { marginTop: 9 }]}
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher chaudière, pompe, CTA, UE, UI, local…"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginTop: 7 }}>
        <TouchableOpacity
          onPress={() => setSiteFilter('all')}
          style={{ borderWidth: 1, borderColor: siteFilter === 'all' ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: siteFilter === 'all' ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6 }}
        >
          <Text style={{ color: siteFilter === 'all' ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontFamily: FONTS.bold }}>Tous les sites</Text>
        </TouchableOpacity>
        {sites.map((site) => <TouchableOpacity
          key={site.id}
          onPress={() => setSiteFilter(site.id)}
          style={{ borderWidth: 1, borderColor: siteFilter === site.id ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: siteFilter === site.id ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6 }}
        >
          <Text style={{ color: siteFilter === site.id ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontFamily: FONTS.bold }}>{site.label}</Text>
        </TouchableOpacity>)}
      </ScrollView>
      <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 5 }}>{visibleEquipment.length} équipement(s) · {visibleRelations.length} liaison(s) affichée(s)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
        <TouchableOpacity
          onPress={() => { setLinkMode((v) => !v); setLinkSource(null); setLinkTarget(null); setSelected(null); }}
          style={[styles.btnSecondary, missionStyles.secondaryButton, linkMode ? { backgroundColor: MISSION_COLORS.accentLight, borderColor: MISSION_COLORS.accent } : null]}
        >
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{linkMode ? 'Terminer les liaisons' : '＋ Relier des équipements'}</Text>
        </TouchableOpacity>
        {linkMode ? <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, alignSelf: 'center' }}>{linkSource ? 'Source : ' + nodeLabel(linkSource) + ' → choisissez la cible' : 'Choisissez l’équipement source'}</Text> : null}
      </View>
    </View>

    {!visibleEquipment.length ? <View style={{ padding: 16 }}>
      <View style={[styles.card, missionStyles.card]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 11, lineHeight: 16 }}>
          Aucun équipement Mission n’est encore disponible. Importez un inventaire Excel ou créez les équipements nécessaires à la Mission.
        </Text>
      </View>
    </View> : null}

    {visibleEquipment.length ? <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ minWidth: layout.width }}>
      <ScrollView contentContainerStyle={{ width: layout.width, minHeight: layout.height }}>
        <Svg width={layout.width} height={layout.height}>
          {visibleRelations.map((rel) => {
            const a = layout.nodes.get(rel.source_equipment_id);
            const b = layout.nodes.get(rel.target_equipment_id);
            if (!a || !b) return null;
            const presentation = relationPresentation(rel);
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const arrow = 9;
            return <G key={rel.id}>
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={MISSION_COLORS.accentLineStrong}
                strokeWidth={presentation.width}
                strokeDasharray={presentation.dash || undefined}
              />
              <Line
                x1={x2}
                y1={y2}
                x2={x2 - arrow * Math.cos(angle - Math.PI / 6)}
                y2={y2 - arrow * Math.sin(angle - Math.PI / 6)}
                stroke={MISSION_COLORS.accentLineStrong}
                strokeWidth={presentation.width}
              />
              <Line
                x1={x2}
                y1={y2}
                x2={x2 - arrow * Math.cos(angle + Math.PI / 6)}
                y2={y2 - arrow * Math.sin(angle + Math.PI / 6)}
                stroke={MISSION_COLORS.accentLineStrong}
                strokeWidth={presentation.width}
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
            return <G key={node.id} onPress={() => onNodePress(node)}>
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
              <Circle cx={node.x + 19} cy={node.y + 19} r="11" fill={MISSION_COLORS.accentSoft} stroke={MISSION_COLORS.accentLineStrong} strokeWidth="1" />
              <SvgText x={node.x + 19} y={node.y + 22} textAnchor="middle" fontSize="7" fontWeight="900" fill={MISSION_COLORS.accentStrong}>
                {categoryBadge(node)}
              </SvgText>
              <SvgText x={node.x + 36} y={node.y + 22} fontSize="10" fontWeight="700" fill={MISSION_COLORS.accentStrong}>
                {nodeLabel(node).slice(0, 19)}
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
          <Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.black, fontSize: 13 }}>{nodeLabel(selected)}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 3 }}>{subLabel(selected) || 'Caractéristiques à compléter'}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, marginTop: 3 }}>{selected.site_name || ''}{selected.location_label ? ' · ' + selected.location_label : ''}</Text>
          <TouchableOpacity
            style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'flex-start', marginTop: 8 }]}
            onPress={() => navigation.navigate('MissionEquipment', { missionId, equipmentId: selected.id, siteId: selected.site_id })}
          >
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Ouvrir la fiche équipement</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 5 }}><CvcIcon name="close" size={16} color={COLORS.inkFaint} strokeWidth={2.1} /></TouchableOpacity>
      </View>
    </View> : null}
    <Modal visible={relationModal} transparent animationType="fade" onRequestClose={() => setRelationModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Créer la relation</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10, lineHeight: 14, marginBottom: 10 }}>
          {linkSource ? nodeLabel(linkSource) : ''} → {linkTarget ? nodeLabel(linkTarget) : ''}
        </Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontFamily: FONTS.black, marginBottom: 5 }}>RELATION RAPIDE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 43, marginBottom: 8 }}>
          {RELATION_PRESETS.map(([key,label]) => {
            const selectedPreset = relationType === key;
            return <TouchableOpacity
              key={key}
              onPress={() => { setRelationType(key); setRelationLabel(label); }}
              style={{
                borderWidth: 1,
                borderColor: selectedPreset ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
                backgroundColor: selectedPreset ? MISSION_COLORS.accentLight : '#FFFFFF',
                borderRadius: 10,
                paddingHorizontal: 9,
                paddingVertical: 7,
                marginRight: 6,
              }}
            >
              <Text style={{ color: selectedPreset ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.6, fontFamily: FONTS.black }}>{label}</Text>
            </TouchableOpacity>;
          })}
        </ScrollView>
        <TextInput style={[styles.input, missionStyles.input]} value={relationLabel} onChangeText={setRelationLabel} placeholder="Libellé de la relation" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => { setRelationModal(false); setLinkTarget(null); }}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveRelation}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Relier</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
