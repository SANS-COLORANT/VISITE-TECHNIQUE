import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Svg, Line, Polyline, Circle, Rect } from 'react-native-svg';
import { COLORS, styles } from './styles.js';
import { getChampsVisite, upsertChamp } from './db.js';
import { EquipmentIcon, EQUIPMENT_TYPES, PORTS_BY_TYPE, equipmentTypeLabel } from './HydraulicEquipmentSvg.js';

const CANVAS_W = 1120;
const CANVAS_H = 700;
const ITEM_W = 112;
const ITEM_H = 136;
const ICON_SIZE = 92;
const ICON_X = 10;
const ICON_Y = 25;
const SCHEMA_SECTION = 'schema.hydraulique';
const SCHEMA_KEY = 'layout_v1';
const MEDIUMS = {
  hot: { label: 'Aller chaud', color: '#EF5A2A', soft: '#FFF0EA' },
  cold: { label: 'Retour froid', color: '#357DED', soft: '#EAF2FF' },
  air: { label: 'Air VMC', color: '#44AFCF', soft: '#E8F8FC' },
};
const STATUS = {
  ok: { label: 'Conforme', color: COLORS.green },
  warning: { label: 'Attention', color: COLORS.amber },
  fault: { label: 'Défaut', color: COLORS.red },
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const equipmentById = (schema, id) => schema.equipment.find((item) => item.id === id) || null;
const portDefinition = (type, portId) => (PORTS_BY_TYPE[type] || []).find((p) => p.id === portId) || null;

function absolutePort(item, portId) {
  if (!item) return null;
  const p = portDefinition(item.type, portId);
  if (!p) return null;
  return {
    x: item.x + ICON_X + (p.x / 128) * ICON_SIZE,
    y: item.y + ICON_Y + (p.y / 128) * ICON_SIZE,
    side: p.x <= 15 ? 'left' : p.x >= 113 ? 'right' : p.y <= 15 ? 'top' : p.y >= 113 ? 'bottom' : 'center',
  };
}

function stubFor(point, distance = 28) {
  if (!point) return null;
  if (point.side === 'left') return { x: point.x - distance, y: point.y };
  if (point.side === 'right') return { x: point.x + distance, y: point.y };
  if (point.side === 'top') return { x: point.x, y: point.y - distance };
  if (point.side === 'bottom') return { x: point.x, y: point.y + distance };
  return { x: point.x + distance, y: point.y };
}

function orthogonalPoints(a, b) {
  if (!a || !b) return [];
  const sa = stubFor(a);
  const sb = stubFor(b);
  const points = [{ x: a.x, y: a.y }, sa];
  const dx = Math.abs(sb.x - sa.x);
  const dy = Math.abs(sb.y - sa.y);
  if (dx >= dy) {
    const midX = (sa.x + sb.x) / 2;
    points.push({ x: midX, y: sa.y }, { x: midX, y: sb.y });
  } else {
    const midY = (sa.y + sb.y) / 2;
    points.push({ x: sa.x, y: midY }, { x: sb.x, y: midY });
  }
  points.push(sb, { x: b.x, y: b.y });
  return points.filter((p, idx, arr) => idx === 0 || p.x !== arr[idx - 1].x || p.y !== arr[idx - 1].y);
}

function pointAlong(points, progress) {
  if (!points || points.length < 2) return points?.[0] || { x: 0, y: 0 };
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, len });
    total += len;
  }
  if (!total) return points[0];
  let target = clamp(progress, 0, 1) * total;
  for (const seg of segments) {
    if (target <= seg.len || seg === segments[segments.length - 1]) {
      const t = seg.len ? target / seg.len : 0;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    }
    target -= seg.len;
  }
  return points[points.length - 1];
}

function ToolbarButton({ active, danger, onPress, children, style }) {
  return <TouchableOpacity onPress={onPress} style={[{ minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: active ? COLORS.orange : danger ? '#F2B8B8' : COLORS.line, backgroundColor: active ? COLORS.orangeLight : danger ? COLORS.redBg : COLORS.white, justifyContent: 'center', alignItems: 'center' }, style]}><Text style={{ fontSize: 12, fontWeight: '800', color: active ? COLORS.orangeDark : danger ? COLORS.red : COLORS.ink }}>{children}</Text></TouchableOpacity>;
}

function ChoiceChip({ active, color, soft, onPress, children }) {
  return <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 10, minHeight: 34, borderRadius: 9, borderWidth: 1, borderColor: active ? color : COLORS.line, backgroundColor: active ? soft : COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11.5, fontWeight: '800', color: active ? color : COLORS.inkSoft }}>{children}</Text></TouchableOpacity>;
}

function MovableEquipment({ item, selected, connectMode, pendingPort, phase, onSelect, onMove, onPortPress }) {
  const currentRef = useRef({ x: item.x, y: item.y });
  const startRef = useRef({ x: item.x, y: item.y });
  const moveRef = useRef(onMove);
  useEffect(() => { currentRef.current = { x: item.x, y: item.y }; }, [item.x, item.y]);
  useEffect(() => { moveRef.current = onMove; }, [onMove]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
    onPanResponderGrant: () => { startRef.current = { ...currentRef.current }; },
    onPanResponderMove: (_evt, g) => {
      moveRef.current(item.id, clamp(startRef.current.x + g.dx, 0, CANVAS_W - ITEM_W), clamp(startRef.current.y + g.dy, 0, CANVAS_H - ITEM_H));
    },
  }), [item.id]);
  return <View style={{ position: 'absolute', left: item.x, top: item.y, width: ITEM_W, height: ITEM_H, zIndex: selected ? 20 : 10 }}>
    <View {...pan.panHandlers} style={{ height: 23, borderRadius: 8, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selected ? COLORS.orangeLight : '#F3F3F0', borderWidth: 1, borderColor: selected ? '#F3C89B' : COLORS.line }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: COLORS.ink }}>{item.label || equipmentTypeLabel(item.type)}</Text><Text style={{ fontSize: 12, color: COLORS.inkFaint }}>↕</Text></View>
    <TouchableOpacity activeOpacity={0.9} onPress={() => onSelect(item.id)} style={{ position: 'absolute', left: ICON_X, top: ICON_Y, width: ICON_SIZE, height: ICON_SIZE }}><View style={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: 8, backgroundColor: selected ? '#FFF8F2' : 'transparent', borderWidth: selected ? 2 : 0, borderColor: COLORS.orange }}><EquipmentIcon type={item.type} size={ICON_SIZE} phase={phase} running={item.running !== false} secondaryRunning={item.secondaryRunning !== false} status={item.status || 'ok'} valvePosition={item.valvePosition ?? 50} /></View></TouchableOpacity>
    {connectMode ? (PORTS_BY_TYPE[item.type] || []).map((p) => {
      const pending = pendingPort?.equipmentId === item.id && pendingPort?.portId === p.id;
      return <TouchableOpacity key={p.id} onPress={() => onPortPress(item.id, p.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ position: 'absolute', left: ICON_X + (p.x / 128) * ICON_SIZE - 7, top: ICON_Y + (p.y / 128) * ICON_SIZE - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: pending ? '#FFD54A' : COLORS.white, borderWidth: 3, borderColor: pending ? '#A87400' : COLORS.orange, zIndex: 40 }} />;
    }) : null}
  </View>;
}

function ConnectionsLayer({ schema, phase, selectedConnectionId, onSelectConnection }) {
  return <Svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', left: 0, top: 0 }}>
    {schema.connections.map((conn) => {
      const a = absolutePort(equipmentById(schema, conn.from?.equipmentId), conn.from?.portId);
      const b = absolutePort(equipmentById(schema, conn.to?.equipmentId), conn.to?.portId);
      const pts = orthogonalPoints(a, b);
      if (pts.length < 2) return null;
      const pointString = pts.map((p) => `${p.x},${p.y}`).join(' ');
      const medium = MEDIUMS[conn.medium] || MEDIUMS.hot;
      const selected = conn.id === selectedConnectionId;
      const base = ((phase % 360) / 360);
      return <React.Fragment key={conn.id}>
        {selected ? <Polyline points={pointString} fill="none" stroke="#FFF4E8" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" /> : null}
        <Polyline points={pointString} fill="none" stroke={medium.color} strokeWidth={selected ? 7 : 6} strokeOpacity="0.78" strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={pointString} fill="none" stroke="rgba(0,0,0,0.001)" strokeWidth="22" strokeLinejoin="round" strokeLinecap="round" onPress={() => onSelectConnection(conn.id)} />
        {[0, 0.25, 0.5, 0.75].map((offset) => {
          let t = (base + offset) % 1;
          if (conn.direction === -1) t = 1 - t;
          const p = pointAlong(pts, t);
          return <Circle key={offset} cx={p.x} cy={p.y} r={selected ? 5.5 : 4.5} fill={medium.color} stroke="#FFFFFF" strokeWidth="1.5" />;
        })}
      </React.Fragment>;
    })}
  </Svg>;
}

function GridLayer() {
  const vertical = [];
  const horizontal = [];
  for (let x = 0; x <= CANVAS_W; x += 40) vertical.push(<Line key={`v${x}`} x1={x} y1="0" x2={x} y2={CANVAS_H} stroke="#EDEDE8" strokeWidth="1" />);
  for (let y = 0; y <= CANVAS_H; y += 40) horizontal.push(<Line key={`h${y}`} x1="0" y1={y} x2={CANVAS_W} y2={y} stroke="#EDEDE8" strokeWidth="1" />);
  return <Svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', left: 0, top: 0 }}><Rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#FCFCFA" />{vertical}{horizontal}</Svg>;
}

function demoSchema() {
  const boiler = { id: 'eq_demo_boiler', type: 'boiler', label: 'Chaudière 1', x: 70, y: 205, running: true, status: 'ok' };
  const pump = { id: 'eq_demo_pump', type: 'pump', label: 'Pompe primaire', x: 275, y: 225, running: true, status: 'ok' };
  const exchanger = { id: 'eq_demo_hex', type: 'heat_exchanger', label: 'Échangeur', x: 500, y: 185, running: true, status: 'ok' };
  const valve = { id: 'eq_demo_v3v', type: 'three_way_valve', label: 'V3V départ', x: 760, y: 220, running: true, status: 'ok', valvePosition: 55 };
  return { version: 1, equipment: [boiler, pump, exchanger, valve], connections: [
    { id: 'co_demo_1', from: { equipmentId: boiler.id, portId: 'supply' }, to: { equipmentId: pump.id, portId: 'left' }, medium: 'hot', direction: 1 },
    { id: 'co_demo_2', from: { equipmentId: pump.id, portId: 'right' }, to: { equipmentId: exchanger.id, portId: 'hot_left_top' }, medium: 'hot', direction: 1 },
    { id: 'co_demo_3', from: { equipmentId: exchanger.id, portId: 'hot_left_bottom' }, to: { equipmentId: boiler.id, portId: 'return' }, medium: 'cold', direction: 1 },
    { id: 'co_demo_4', from: { equipmentId: exchanger.id, portId: 'cold_right_top' }, to: { equipmentId: valve.id, portId: 'a' }, medium: 'hot', direction: 1 },
    { id: 'co_demo_5', from: { equipmentId: valve.id, portId: 'ab' }, to: { equipmentId: exchanger.id, portId: 'cold_right_bottom' }, medium: 'cold', direction: 1 },
  ] };
}

function HydraulicSchemaScreen({ route }) {
  const visiteId = route?.params?.visiteId;
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [schema, setSchema] = useState({ version: 1, equipment: [], connections: [] });
  const schemaRef = useRef(schema);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [phase, setPhase] = useState(0);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingPort, setPendingPort] = useState(null);
  const [activeMedium, setActiveMedium] = useState('hot');

  useEffect(() => { schemaRef.current = schema; }, [schema]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await getChampsVisite(visiteId);
        const row = rows.find((r) => r.section_code === SCHEMA_SECTION && r.cle === SCHEMA_KEY);
        if (row?.valeur) {
          const parsed = JSON.parse(row.valeur);
          if (mounted && parsed && Array.isArray(parsed.equipment) && Array.isArray(parsed.connections)) setSchema({ version: 1, ...parsed, equipment: parsed.equipment, connections: parsed.connections });
        }
      } catch (e) { console.warn('Schéma hydraulique non chargé', e); }
      finally { if (mounted) setLoaded(true); }
    })();
    return () => { mounted = false; };
  }, [visiteId]);
  useEffect(() => { const timer = setInterval(() => setPhase((p) => (p + 12) % 360), 80); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!loaded || !visiteId) return undefined;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try { await upsertChamp(visiteId, SCHEMA_SECTION, SCHEMA_KEY, JSON.stringify(schema)); setSaveState('saved'); }
      catch (e) { console.warn('Schéma hydraulique non sauvegardé', e); setSaveState('error'); }
    }, 500);
    return () => clearTimeout(timer);
  }, [schema, loaded, visiteId]);
  useEffect(() => () => { if (visiteId) upsertChamp(visiteId, SCHEMA_SECTION, SCHEMA_KEY, JSON.stringify(schemaRef.current)).catch(() => {}); }, [visiteId]);

  const selectedEquipment = selectedEquipmentId ? equipmentById(schema, selectedEquipmentId) : null;
  const selectedConnection = selectedConnectionId ? schema.connections.find((c) => c.id === selectedConnectionId) : null;
  const patchEquipment = useCallback((id, patch) => setSchema((current) => ({ ...current, equipment: current.equipment.map((item) => item.id === id ? { ...item, ...patch } : item) })), []);
  const moveEquipment = useCallback((id, x, y) => patchEquipment(id, { x, y }), [patchEquipment]);
  const selectEquipment = useCallback((id) => { setSelectedEquipmentId(id); setSelectedConnectionId(null); }, []);
  const selectConnection = useCallback((id) => { setSelectedConnectionId(id); setSelectedEquipmentId(null); }, []);

  const addEquipment = (type) => {
    const def = EQUIPMENT_TYPES.find((x) => x.id === type);
    const count = schema.equipment.length;
    const item = { id: uid('eq'), type, label: def?.defaultLabel || def?.label || type, x: clamp(50 + (count % 7) * 145, 0, CANVAS_W - ITEM_W), y: clamp(60 + (Math.floor(count / 7) % 4) * 150, 0, CANVAS_H - ITEM_H), running: type !== 'water_leak', secondaryRunning: true, status: type === 'water_leak' ? 'fault' : 'ok', valvePosition: 50 };
    setSchema((current) => ({ ...current, equipment: [...current.equipment, item] }));
    setSelectedEquipmentId(item.id);
    setSelectedConnectionId(null);
    setLibraryVisible(false);
  };

  const deleteEquipment = (id) => Alert.alert('Supprimer cet équipement ?', 'Les tuyaux raccordés seront également supprimés.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => { setSchema((current) => ({ ...current, equipment: current.equipment.filter((item) => item.id !== id), connections: current.connections.filter((c) => c.from?.equipmentId !== id && c.to?.equipmentId !== id) })); setSelectedEquipmentId(null); setPendingPort((p) => p?.equipmentId === id ? null : p); } }]);

  const onPortPress = (equipmentId, portId) => {
    if (!connectMode) return;
    if (!pendingPort) { setPendingPort({ equipmentId, portId }); setSelectedEquipmentId(equipmentId); setSelectedConnectionId(null); return; }
    if (pendingPort.equipmentId === equipmentId && pendingPort.portId === portId) { setPendingPort(null); return; }
    if (pendingPort.equipmentId === equipmentId) { setPendingPort({ equipmentId, portId }); return; }
    const connection = { id: uid('co'), from: pendingPort, to: { equipmentId, portId }, medium: activeMedium, direction: 1 };
    setSchema((current) => ({ ...current, connections: [...current.connections, connection] }));
    setPendingPort(null); setSelectedConnectionId(connection.id); setSelectedEquipmentId(null);
  };
  const patchConnection = (id, patch) => setSchema((current) => ({ ...current, connections: current.connections.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  const deleteConnection = (id) => { setSchema((current) => ({ ...current, connections: current.connections.filter((c) => c.id !== id) })); setSelectedConnectionId(null); };
  const toggleConnectMode = () => setConnectMode((value) => { const next = !value; if (!next) setPendingPort(null); return next; });
  const loadDemo = () => { const apply = () => { setSchema(demoSchema()); setSelectedEquipmentId(null); setSelectedConnectionId(null); setPendingPort(null); }; if (!schema.equipment.length && !schema.connections.length) apply(); else Alert.alert('Charger le circuit exemple ?', 'Le schéma actuel sera remplacé.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Remplacer', style: 'destructive', onPress: apply }]); };
  const resetSchema = () => Alert.alert('Effacer le schéma ?', 'Tous les équipements et raccordements seront supprimés.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Effacer', style: 'destructive', onPress: () => { setSchema({ version: 1, equipment: [], connections: [] }); setSelectedEquipmentId(null); setSelectedConnectionId(null); setPendingPort(null); } }]);

  if (!loaded) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Chargement du schéma…</Text></View>;

  const inspector = <View style={{ padding: 12, backgroundColor: COLORS.white, borderLeftWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: COLORS.line }}>
    {selectedEquipment ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.inkFaint, textTransform: 'uppercase' }}>Équipement sélectionné</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.ink, marginTop: 4 }}>{equipmentTypeLabel(selectedEquipment.type)}</Text>
      <TextInput style={[styles.input, { marginTop: 10, minHeight: 40 }]} value={selectedEquipment.label || ''} onChangeText={(label) => patchEquipment(selectedEquipment.id, { label })} placeholder="Nom affiché" />
      <Text style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>Fonctionnement</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><ChoiceChip active={selectedEquipment.running !== false} color={COLORS.green} soft={COLORS.greenBg} onPress={() => patchEquipment(selectedEquipment.id, { running: true })}>En marche</ChoiceChip><ChoiceChip active={selectedEquipment.running === false} color={COLORS.inkSoft} soft="#F1F1EE" onPress={() => patchEquipment(selectedEquipment.id, { running: false })}>À l'arrêt</ChoiceChip></View>
      {selectedEquipment.type === 'twin_pump' ? <View style={{ marginTop: 8 }}><ChoiceChip active={selectedEquipment.secondaryRunning !== false} color={COLORS.orangeDark} soft={COLORS.orangeLight} onPress={() => patchEquipment(selectedEquipment.id, { secondaryRunning: selectedEquipment.secondaryRunning === false })}>Pompe 2 {selectedEquipment.secondaryRunning === false ? 'arrêtée' : 'en marche'}</ChoiceChip></View> : null}
      <Text style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>État</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{Object.entries(STATUS).map(([key, meta]) => <ChoiceChip key={key} active={(selectedEquipment.status || 'ok') === key} color={meta.color} soft={key === 'ok' ? COLORS.greenBg : key === 'fault' ? COLORS.redBg : COLORS.amberBg} onPress={() => patchEquipment(selectedEquipment.id, { status: key })}>{meta.label}</ChoiceChip>)}</View>
      {selectedEquipment.type === 'three_way_valve' ? <><Text style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>Position vanne</Text><View style={{ flexDirection: 'row', gap: 7 }}>{[0, 25, 50, 75, 100].map((v) => <ChoiceChip key={v} active={(selectedEquipment.valvePosition ?? 50) === v} color={COLORS.orangeDark} soft={COLORS.orangeLight} onPress={() => patchEquipment(selectedEquipment.id, { valvePosition: v })}>{v}%</ChoiceChip>)}</View></> : null}
      <Text style={{ fontSize: 11, lineHeight: 16, color: COLORS.inkFaint, marginTop: 12 }}>Déplace l'équipement avec la barre grise. Active « Raccorder » pour afficher ses bornes.</Text>
      <ToolbarButton danger onPress={() => deleteEquipment(selectedEquipment.id)} style={{ marginTop: 14 }}>Supprimer l'équipement</ToolbarButton>
    </ScrollView> : selectedConnection ? <View>
      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.inkFaint, textTransform: 'uppercase' }}>Tuyau sélectionné</Text><Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.ink, marginTop: 5 }}>Réseau animé</Text>
      <Text style={{ fontSize: 11.5, color: COLORS.inkSoft, marginTop: 10, marginBottom: 6 }}>Type de fluide / couleur</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{Object.entries(MEDIUMS).map(([key, meta]) => <ChoiceChip key={key} active={selectedConnection.medium === key} color={meta.color} soft={meta.soft} onPress={() => patchConnection(selectedConnection.id, { medium: key })}>{meta.label}</ChoiceChip>)}</View>
      <Text style={{ fontSize: 11, lineHeight: 16, color: COLORS.inkSoft, marginTop: 12 }}>Les points se déplacent du premier raccord vers le second. Inverse le sens si le débit réel circule dans l'autre direction.</Text>
      <ToolbarButton active onPress={() => patchConnection(selectedConnection.id, { direction: selectedConnection.direction === -1 ? 1 : -1 })} style={{ marginTop: 12 }}>↔ Inverser le sens</ToolbarButton><ToolbarButton danger onPress={() => deleteConnection(selectedConnection.id)} style={{ marginTop: 8 }}>Supprimer le tuyau</ToolbarButton>
    </View> : <View><Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.ink }}>Schéma interactif</Text><Text style={{ fontSize: 12, lineHeight: 18, color: COLORS.inkSoft, marginTop: 7 }}>1. Ajoute un équipement. 2. Déplace-le. 3. Active « Raccorder ». 4. Touche une borne puis la borne d'un autre équipement. Le sens animé suit l'ordre de raccordement.</Text><View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#FFF8F2', borderWidth: 1, borderColor: '#F3D2B4' }}><Text style={{ fontSize: 11.5, fontWeight: '800', color: '#A74618' }}>Rouge = aller chaud · Bleu = retour froid</Text><Text style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 3 }}>Le réseau Air VMC est aussi disponible.</Text></View></View>}
  </View>;

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <View style={{ paddingHorizontal: 12, paddingVertical: 9, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 7, alignItems: 'center' }}><ToolbarButton active onPress={() => setLibraryVisible(true)}>＋ Équipement</ToolbarButton><ToolbarButton active={connectMode} onPress={toggleConnectMode}>{connectMode ? '✓ Raccorder' : '○ Raccorder'}</ToolbarButton>{Object.entries(MEDIUMS).map(([key, meta]) => <ChoiceChip key={key} active={activeMedium === key} color={meta.color} soft={meta.soft} onPress={() => setActiveMedium(key)}>{meta.label}</ChoiceChip>)}<ToolbarButton onPress={loadDemo}>Circuit exemple</ToolbarButton><ToolbarButton danger onPress={resetSchema}>Effacer</ToolbarButton><View style={{ minWidth: 88, alignItems: 'center' }}><Text style={{ fontSize: 11, fontWeight: '800', color: saveState === 'error' ? COLORS.red : saveState === 'saving' ? COLORS.amber : COLORS.green }}>{saveState === 'saving' ? 'Sauvegarde…' : saveState === 'error' ? 'Erreur' : '✓ Sauvegardé'}</Text><Text style={{ fontSize: 9.5, color: COLORS.inkFaint }}>{schema.equipment.length} équip. · {schema.connections.length} tuyaux</Text></View></ScrollView>{connectMode ? <Text style={{ marginTop: 7, fontSize: 11.5, fontWeight: '700', color: pendingPort ? '#9A6A00' : COLORS.orangeDark }}>{pendingPort ? 'Premier raccord choisi : touche maintenant la borne de destination.' : `Mode raccordement actif — ${MEDIUMS[activeMedium].label}. Touche la borne de départ.`}</Text> : null}</View>
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}><View style={{ flex: wide ? 1 : 0, height: wide ? undefined : 430, overflow: 'hidden' }}><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: CANVAS_W }}><ScrollView showsVerticalScrollIndicator contentContainerStyle={{ minHeight: CANVAS_H }}><View style={{ width: CANVAS_W, height: CANVAS_H }}><GridLayer /><ConnectionsLayer schema={schema} phase={phase} selectedConnectionId={selectedConnectionId} onSelectConnection={selectConnection} />{schema.equipment.map((item) => <MovableEquipment key={item.id} item={item} selected={item.id === selectedEquipmentId} connectMode={connectMode} pendingPort={pendingPort} phase={phase} onSelect={selectEquipment} onMove={moveEquipment} onPortPress={onPortPress} />)}</View></ScrollView></ScrollView></View><View style={{ width: wide ? 286 : '100%', maxHeight: wide ? undefined : 250 }}>{inspector}</View></View>
    <Modal visible={libraryVisible} transparent animationType="fade" onRequestClose={() => setLibraryVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: wide ? 620 : '92%', maxHeight: '82%' }]}><Text style={styles.modalTitle}>Ajouter un équipement au schéma</Text><Text style={{ fontSize: 11.5, color: COLORS.inkSoft, marginBottom: 10 }}>Bibliothèque V1.5 : style V1 avec parties animables et bornes de raccordement.</Text><ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{EQUIPMENT_TYPES.map((item) => <TouchableOpacity key={item.id} onPress={() => addEquipment(item.id)} style={{ width: wide ? '31%' : '47%', minHeight: 135, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 8, backgroundColor: COLORS.white, alignItems: 'center' }}><EquipmentIcon type={item.id} size={82} phase={phase} running status={item.id === 'water_leak' ? 'fault' : 'ok'} /><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.ink, textAlign: 'center', marginTop: 5 }}>{item.label}</Text></TouchableOpacity>)}</ScrollView><ToolbarButton onPress={() => setLibraryVisible(false)} style={{ marginTop: 14 }}>Fermer</ToolbarButton></View></View></Modal>
  </View>;
}

export { HydraulicSchemaScreen };
