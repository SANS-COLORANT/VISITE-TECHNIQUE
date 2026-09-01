import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Svg, Line, Polyline, Circle, Rect } from 'react-native-svg';
import { COLORS, styles } from './styles.js';
import { getChampsVisite, listerMateriel, upsertChamp } from './db.js';
import { EquipmentIcon } from './HydraulicEquipmentSvg.js';
import {
  HYDRAULIC_EQUIPMENT_TYPES,
  HYDRAULIC_GROUPS,
  hydraulicEquipmentDefinition,
  hydraulicIconType,
  hydraulicPorts,
  mapMaterialToHydraulicType,
  searchHydraulicEquipment,
} from './hydraulicEquipmentLibrary.js';

const CANVAS_W = 1500;
const CANVAS_H = 950;
const ITEM_W = 116;
const ITEM_H = 140;
const ICON_SIZE = 94;
const ICON_X = 11;
const ICON_Y = 26;
const SCHEMA_SECTION = 'schema.hydraulique';
const SCHEMA_KEY = 'layout_v1';
const EMPTY_SCHEMA = { version: 1, equipment: [], connections: [], networks: [], annotations: [] };
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.35;
const ZOOM_STEP = 0.1;

const MEDIUMS = {
  hot: { label: 'Aller chaud', color: '#EF5A2A', soft: '#FFF0EA' },
  cold: { label: 'Retour froid', color: '#357DED', soft: '#EAF2FF' },
  air: { label: 'Air VMC', color: '#44AFCF', soft: '#E8F8FC' },
};
const STATUS = {
  ok: { label: 'Conforme', color: COLORS.green, soft: COLORS.greenBg },
  warning: { label: 'À surveiller', color: COLORS.amber, soft: COLORS.amberBg },
  fault: { label: 'Défaut', color: COLORS.red, soft: COLORS.redBg },
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const compactPoints = (points) => points.filter((point, index, array) => point && (index === 0 || point.x !== array[index - 1]?.x || point.y !== array[index - 1]?.y));
const equipmentById = (schema, id) => schema.equipment.find((item) => item.id === id) || null;

function endpointPoint(schema, endpoint) {
  if (!endpoint) return null;
  if (endpoint.free) return { x: Number(endpoint.x) || 0, y: Number(endpoint.y) || 0, side: 'center', free: true };
  const item = equipmentById(schema, endpoint.equipmentId);
  if (!item) return null;
  const port = hydraulicPorts(item.type).find((candidate) => candidate.id === endpoint.portId);
  if (!port) return null;
  return {
    x: item.x + ICON_X + (port.x / 128) * ICON_SIZE,
    y: item.y + ICON_Y + (port.y / 128) * ICON_SIZE,
    side: port.x <= 15 ? 'left' : port.x >= 113 ? 'right' : port.y <= 15 ? 'top' : port.y >= 113 ? 'bottom' : 'center',
  };
}

function stubFor(point, distance = 30) {
  if (!point || point.free) return point;
  if (point.side === 'left') return { x: point.x - distance, y: point.y };
  if (point.side === 'right') return { x: point.x + distance, y: point.y };
  if (point.side === 'top') return { x: point.x, y: point.y - distance };
  if (point.side === 'bottom') return { x: point.x, y: point.y + distance };
  return { x: point.x + distance, y: point.y };
}

function routeCenter(schema, connection) {
  if (connection?.via && Number.isFinite(Number(connection.via.x)) && Number.isFinite(Number(connection.via.y))) {
    return { x: Number(connection.via.x), y: Number(connection.via.y) };
  }
  const a = endpointPoint(schema, connection?.from);
  const b = endpointPoint(schema, connection?.to);
  if (!a || !b) return { x: CANVAS_W / 2, y: CANVAS_H / 2 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function connectionPoints(schema, connection) {
  const a = endpointPoint(schema, connection.from);
  const b = endpointPoint(schema, connection.to);
  if (!a || !b) return [];
  const sa = stubFor(a);
  const sb = stubFor(b);
  const via = routeCenter(schema, connection);
  const points = [a, sa];
  const firstHorizontal = Math.abs(via.x - sa.x) >= Math.abs(via.y - sa.y);
  if (firstHorizontal) points.push({ x: via.x, y: sa.y });
  else points.push({ x: sa.x, y: via.y });
  points.push(via);
  const lastHorizontal = Math.abs(sb.x - via.x) >= Math.abs(sb.y - via.y);
  if (lastHorizontal) points.push({ x: sb.x, y: via.y });
  else points.push({ x: via.x, y: sb.y });
  points.push(sb, b);
  return compactPoints(points);
}

function pointAlong(points, progress) {
  if (!points || points.length < 2) return points?.[0] || { x: 0, y: 0 };
  const segments = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, len });
    total += len;
  }
  if (!total) return points[0];
  let target = clamp(progress, 0, 1) * total;
  for (const segment of segments) {
    if (target <= segment.len || segment === segments[segments.length - 1]) {
      const t = segment.len ? target / segment.len : 0;
      return { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t };
    }
    target -= segment.len;
  }
  return points[points.length - 1];
}

function ToolbarButton({ active, danger, disabled, onPress, children, style }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[{ minHeight: 38, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: active ? COLORS.orange : danger ? '#F2B8B8' : COLORS.line, backgroundColor: active ? COLORS.orangeLight : danger ? COLORS.redBg : COLORS.white, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.45 : 1 }, style]}><Text style={{ fontSize: 11.5, fontWeight: '800', color: active ? COLORS.orangeDark : danger ? COLORS.red : COLORS.ink }}>{children}</Text></TouchableOpacity>;
}

function ChoiceChip({ active, color, soft, onPress, children }) {
  return <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 9, minHeight: 34, borderRadius: 9, borderWidth: 1, borderColor: active ? color : COLORS.line, backgroundColor: active ? soft : COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '800', color: active ? color : COLORS.inkSoft }}>{children}</Text></TouchableOpacity>;
}

function MovableEquipment({ item, selected, connectMode, pendingPort, phase, zoom, onSelect, onMove, onPortPress }) {
  const currentRef = useRef({ x: item.x, y: item.y });
  const startRef = useRef({ x: item.x, y: item.y });
  const moveRef = useRef(onMove);
  useEffect(() => { currentRef.current = { x: item.x, y: item.y }; }, [item.x, item.y]);
  useEffect(() => { moveRef.current = onMove; }, [onMove]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => { startRef.current = { ...currentRef.current }; },
    onPanResponderMove: (_evt, gesture) => moveRef.current(item.id, clamp(startRef.current.x + gesture.dx / zoom, 0, CANVAS_W - ITEM_W), clamp(startRef.current.y + gesture.dy / zoom, 0, CANVAS_H - ITEM_H)),
  }), [item.id, zoom]);
  const iconType = hydraulicIconType(item.type);
  return <View style={{ position: 'absolute', left: item.x, top: item.y, width: ITEM_W, height: ITEM_H, zIndex: selected ? 30 : 20 }}>
    <View {...pan.panHandlers} style={{ height: 24, borderRadius: 8, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selected ? COLORS.orangeLight : '#F3F3F0', borderWidth: 1, borderColor: selected ? '#F3C89B' : COLORS.line }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 10.5, fontWeight: '800', color: COLORS.ink }}>{item.label || hydraulicEquipmentDefinition(item.type)?.label}</Text><Text style={{ fontSize: 12, color: COLORS.inkFaint }}>↕</Text></View>
    <TouchableOpacity activeOpacity={0.9} onPress={() => onSelect(item.id)} style={{ position: 'absolute', left: ICON_X, top: ICON_Y, width: ICON_SIZE, height: ICON_SIZE }}><View style={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: 8, backgroundColor: selected ? '#FFF8F2' : 'transparent', borderWidth: selected ? 2 : 0, borderColor: COLORS.orange }}><EquipmentIcon type={iconType} size={ICON_SIZE} phase={phase} running={item.running !== false} secondaryRunning={item.secondaryRunning !== false} status={item.status || 'ok'} valvePosition={item.valvePosition ?? 50} /></View></TouchableOpacity>
    {connectMode ? hydraulicPorts(item.type).map((port) => {
      const pending = pendingPort?.equipmentId === item.id && pendingPort?.portId === port.id;
      return <TouchableOpacity key={port.id} onPress={() => onPortPress(item.id, port.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ position: 'absolute', left: ICON_X + (port.x / 128) * ICON_SIZE - 7, top: ICON_Y + (port.y / 128) * ICON_SIZE - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: pending ? '#FFD54A' : COLORS.white, borderWidth: 3, borderColor: pending ? '#A87400' : COLORS.orange, zIndex: 60 }} />;
    }) : null}
    {item.source === 'visit-equipment' ? <View style={{ position: 'absolute', left: 8, right: 8, bottom: 0, alignItems: 'center' }}><Text numberOfLines={1} style={{ fontSize: 8.5, color: COLORS.inkFaint }}>Équipement visite</Text></View> : null}
  </View>;
}

function FreeEndpointHandle({ endpoint, endpointKey, connectionId, selected, zoom, onMove, onSelect }) {
  const currentRef = useRef({ x: endpoint.x, y: endpoint.y });
  const startRef = useRef({ x: endpoint.x, y: endpoint.y });
  useEffect(() => { currentRef.current = { x: endpoint.x, y: endpoint.y }; }, [endpoint.x, endpoint.y]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => { startRef.current = { ...currentRef.current }; onSelect(connectionId); },
    onPanResponderMove: (_evt, gesture) => onMove(connectionId, endpointKey, clamp(startRef.current.x + gesture.dx / zoom, 0, CANVAS_W), clamp(startRef.current.y + gesture.dy / zoom, 0, CANVAS_H)),
  }), [connectionId, endpointKey, onMove, onSelect, zoom]);
  return <View {...pan.panHandlers} style={{ position: 'absolute', left: endpoint.x - 12, top: endpoint.y - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: selected ? COLORS.orange : COLORS.white, borderWidth: 3, borderColor: selected ? COLORS.orangeDark : COLORS.inkSoft, zIndex: 70, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? COLORS.white : COLORS.inkSoft }} /></View>;
}

function MovableConnectionHandle({ schema, connection, selected, zoom, onSelect, onMove }) {
  const center = routeCenter(schema, connection);
  const snapshotRef = useRef(null);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      onSelect(connection.id);
      snapshotRef.current = {
        via: routeCenter(schema, connection),
        from: connection.from?.free ? { ...connection.from } : null,
        to: connection.to?.free ? { ...connection.to } : null,
      };
    },
    onPanResponderMove: (_evt, gesture) => {
      if (!snapshotRef.current) return;
      onMove(connection.id, snapshotRef.current, gesture.dx / zoom, gesture.dy / zoom);
    },
  }), [connection, onMove, onSelect, schema, zoom]);
  return <View {...pan.panHandlers} style={{ position: 'absolute', left: center.x - 20, top: center.y - 20, width: 40, height: 40, borderRadius: 20, zIndex: 65, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? 'rgba(242,100,38,0.18)' : 'rgba(255,255,255,0.04)' }}><View style={{ width: selected ? 16 : 10, height: selected ? 16 : 10, borderRadius: 8, backgroundColor: selected ? COLORS.orange : 'rgba(90,90,90,0.30)', borderWidth: selected ? 3 : 1, borderColor: COLORS.white }} /></View>;
}

function ConnectionsLayer({ schema, phase, selectedConnectionId, onSelectConnection }) {
  return <Svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', left: 0, top: 0 }}>
    {schema.connections.map((connection) => {
      const points = connectionPoints(schema, connection);
      if (points.length < 2) return null;
      const pointString = points.map((point) => `${point.x},${point.y}`).join(' ');
      const medium = MEDIUMS[connection.medium] || MEDIUMS.hot;
      const selected = connection.id === selectedConnectionId;
      const base = (phase % 360) / 360;
      return <React.Fragment key={connection.id}>
        {selected ? <Polyline points={pointString} fill="none" stroke="#FFF1E8" strokeWidth="15" strokeLinejoin="round" strokeLinecap="round" /> : null}
        <Polyline points={pointString} fill="none" stroke={medium.color} strokeWidth={selected ? 8 : 6} strokeOpacity="0.84" strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={pointString} fill="none" stroke="rgba(0,0,0,0.001)" strokeWidth="28" strokeLinejoin="round" strokeLinecap="round" onPress={() => onSelectConnection(connection.id)} />
        {[0, 0.25, 0.5, 0.75].map((offset) => {
          let progress = (base + offset) % 1;
          if (connection.direction === -1) progress = 1 - progress;
          const point = pointAlong(points, progress);
          return <Circle key={offset} cx={point.x} cy={point.y} r={selected ? 5.5 : 4.5} fill={medium.color} stroke="#FFFFFF" strokeWidth="1.5" />;
        })}
      </React.Fragment>;
    })}
  </Svg>;
}

function GridLayer() {
  const vertical = [], horizontal = [];
  for (let x = 0; x <= CANVAS_W; x += 40) vertical.push(<Line key={`v${x}`} x1={x} y1="0" x2={x} y2={CANVAS_H} stroke="#EDEDE8" strokeWidth="1" />);
  for (let y = 0; y <= CANVAS_H; y += 40) horizontal.push(<Line key={`h${y}`} x1="0" y1={y} x2={CANVAS_W} y2={y} stroke="#EDEDE8" strokeWidth="1" />);
  return <Svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', left: 0, top: 0 }}><Rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="#FCFCFA" />{vertical}{horizontal}</Svg>;
}

function materialLabel(material) {
  const designation = String(material?.designation || '').trim();
  const model = [material?.marque, material?.modele].filter(Boolean).join(' ');
  return designation && designation !== 'Équipement' ? designation : model || material?.categorie || 'Équipement';
}

function appendVisitEquipment(schemaInput, materials) {
  const schema = { ...EMPTY_SCHEMA, ...schemaInput, equipment: [...(schemaInput?.equipment || [])], connections: [...(schemaInput?.connections || [])] };
  const existingMaterialIds = new Set(schema.equipment.map((item) => item.materialId).filter(Boolean));
  const existingEquipmentIds = new Set(schema.equipment.map((item) => item.equipmentId).filter(Boolean));
  const additions = (materials || []).filter((material) => !existingMaterialIds.has(material.id) && !(material.equipement_id && existingEquipmentIds.has(material.equipement_id)));
  additions.forEach((material, index) => {
    const count = schema.equipment.length;
    const type = mapMaterialToHydraulicType(material);
    schema.equipment.push({
      id: uid('eq'),
      type,
      label: materialLabel(material),
      x: clamp(55 + (count % 8) * 155, 0, CANVAS_W - ITEM_W),
      y: clamp(60 + (Math.floor(count / 8) % 6) * 150, 0, CANVAS_H - ITEM_H),
      running: true,
      secondaryRunning: true,
      status: String(material.etat || '').toLowerCase().includes('hors') || String(material.etat || '').toLowerCase().includes('dégrad') ? 'fault' : String(material.etat || '').toLowerCase().includes('surve') ? 'warning' : 'ok',
      valvePosition: 50,
      materialId: material.id,
      equipmentId: material.equipement_id || null,
      source: 'visit-equipment',
      metadata: { categorie: material.categorie || '', marque: material.marque || '', modele: material.modele || '' },
      __syncIndex: index,
    });
  });
  schema.equipment = schema.equipment.map(({ __syncIndex, ...item }) => item);
  return { schema, added: additions.length };
}

function HydraulicSchemaScreenV2({ route, onImportJson, importingJson = false }) {
  const visiteId = route?.params?.visiteId;
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [schema, setSchema] = useState(EMPTY_SCHEMA);
  const schemaRef = useRef(schema);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [phase, setPhase] = useState(0);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryGroup, setLibraryGroup] = useState(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [connectMode, setConnectMode] = useState(false);
  const [pendingPort, setPendingPort] = useState(null);
  const [activeMedium, setActiveMedium] = useState('hot');
  const [zoom, setZoom] = useState(0.8);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { schemaRef.current = schema; }, [schema]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [rows, materials] = await Promise.all([getChampsVisite(visiteId), listerMateriel(visiteId)]);
        const row = rows.find((item) => item.section_code === SCHEMA_SECTION && item.cle === SCHEMA_KEY);
        let base = EMPTY_SCHEMA;
        if (row?.valeur) {
          const parsed = JSON.parse(row.valeur);
          if (parsed && Array.isArray(parsed.equipment) && Array.isArray(parsed.connections)) base = { ...EMPTY_SCHEMA, ...parsed, equipment: parsed.equipment, connections: parsed.connections };
        }
        const merged = appendVisitEquipment(base, materials).schema;
        if (mounted) setSchema(merged);
      } catch (error) { console.warn('Schéma technique non chargé', error); }
      finally { if (mounted) setLoaded(true); }
    })();
    return () => { mounted = false; };
  }, [visiteId]);
  useEffect(() => { const timer = setInterval(() => setPhase((value) => (value + 12) % 360), 80); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!loaded || !visiteId) return undefined;
    setSaveState('saving');
    const timer = setTimeout(async () => {
      try { await upsertChamp(visiteId, SCHEMA_SECTION, SCHEMA_KEY, JSON.stringify(schema)); setSaveState('saved'); }
      catch (error) { console.warn('Schéma technique non sauvegardé', error); setSaveState('error'); }
    }, 450);
    return () => clearTimeout(timer);
  }, [schema, loaded, visiteId]);
  useEffect(() => () => { if (visiteId) upsertChamp(visiteId, SCHEMA_SECTION, SCHEMA_KEY, JSON.stringify(schemaRef.current)).catch(() => {}); }, [visiteId]);

  const selectedEquipment = selectedEquipmentId ? equipmentById(schema, selectedEquipmentId) : null;
  const selectedConnection = selectedConnectionId ? schema.connections.find((item) => item.id === selectedConnectionId) : null;
  const libraryItems = useMemo(() => searchHydraulicEquipment(libraryQuery, libraryGroup), [libraryGroup, libraryQuery]);
  const scaledWidth = CANVAS_W * zoom;
  const scaledHeight = CANVAS_H * zoom;
  const innerLeft = (scaledWidth - CANVAS_W) / 2;
  const innerTop = (scaledHeight - CANVAS_H) / 2;

  const patchEquipment = useCallback((id, patch) => setSchema((current) => ({ ...current, equipment: current.equipment.map((item) => item.id === id ? { ...item, ...patch } : item) })), []);
  const moveEquipment = useCallback((id, x, y) => patchEquipment(id, { x, y }), [patchEquipment]);
  const selectEquipment = useCallback((id) => { setSelectedEquipmentId(id); setSelectedConnectionId(null); }, []);
  const selectConnection = useCallback((id) => { setSelectedConnectionId(id); setSelectedEquipmentId(null); }, []);
  const patchConnection = useCallback((id, patch) => setSchema((current) => ({ ...current, connections: current.connections.map((item) => item.id === id ? { ...item, ...patch } : item) })), []);

  const addEquipment = useCallback((type) => {
    const definition = hydraulicEquipmentDefinition(type);
    const count = schema.equipment.length;
    const item = { id: uid('eq'), type, label: definition?.defaultLabel || definition?.label || type, x: clamp(55 + (count % 8) * 155, 0, CANVAS_W - ITEM_W), y: clamp(60 + (Math.floor(count / 8) % 6) * 150, 0, CANVAS_H - ITEM_H), running: type !== 'water_leak', secondaryRunning: true, status: type === 'water_leak' ? 'fault' : 'ok', valvePosition: 50, source: 'manual' };
    setSchema((current) => ({ ...current, equipment: [...current.equipment, item] }));
    setSelectedEquipmentId(item.id); setSelectedConnectionId(null); setLibraryVisible(false);
  }, [schema.equipment.length]);

  const deleteEquipment = useCallback((id) => Alert.alert('Supprimer cet équipement ?', 'Les réseaux raccordés à cet équipement seront également supprimés.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => { setSchema((current) => ({ ...current, equipment: current.equipment.filter((item) => item.id !== id), connections: current.connections.filter((connection) => connection.from?.equipmentId !== id && connection.to?.equipmentId !== id) })); setSelectedEquipmentId(null); setPendingPort((value) => value?.equipmentId === id ? null : value); } }]), []);

  const onPortPress = useCallback((equipmentId, portId) => {
    if (!connectMode) return;
    if (!pendingPort) { setPendingPort({ equipmentId, portId }); setSelectedEquipmentId(equipmentId); setSelectedConnectionId(null); return; }
    if (pendingPort.equipmentId === equipmentId && pendingPort.portId === portId) { setPendingPort(null); return; }
    if (pendingPort.equipmentId === equipmentId) { setPendingPort({ equipmentId, portId }); return; }
    const fromPoint = endpointPoint(schema, pendingPort), toPoint = endpointPoint(schema, { equipmentId, portId });
    const connection = { id: uid('co'), from: pendingPort, to: { equipmentId, portId }, medium: activeMedium, direction: 1, via: fromPoint && toPoint ? { x: (fromPoint.x + toPoint.x) / 2, y: (fromPoint.y + toPoint.y) / 2 } : undefined };
    setSchema((current) => ({ ...current, connections: [...current.connections, connection] }));
    setPendingPort(null); setSelectedConnectionId(connection.id); setSelectedEquipmentId(null);
  }, [activeMedium, connectMode, pendingPort, schema]);

  const finishWithFreeEnd = useCallback(() => {
    if (!pendingPort) return;
    const start = endpointPoint(schema, pendingPort);
    if (!start) return;
    const distance = 190;
    const free = start.side === 'left' ? { free: true, x: clamp(start.x - distance, 20, CANVAS_W - 20), y: start.y }
      : start.side === 'top' ? { free: true, x: start.x, y: clamp(start.y - distance, 20, CANVAS_H - 20) }
        : start.side === 'bottom' ? { free: true, x: start.x, y: clamp(start.y + distance, 20, CANVAS_H - 20) }
          : { free: true, x: clamp(start.x + distance, 20, CANVAS_W - 20), y: start.y };
    const connection = { id: uid('co'), from: pendingPort, to: free, medium: activeMedium, direction: 1, via: { x: (start.x + free.x) / 2, y: (start.y + free.y) / 2 } };
    setSchema((current) => ({ ...current, connections: [...current.connections, connection] }));
    setPendingPort(null); setSelectedConnectionId(connection.id); setSelectedEquipmentId(null);
  }, [activeMedium, pendingPort, schema]);

  const addFreeNetwork = useCallback(() => {
    const existing = schema.connections.length;
    const y = clamp(170 + (existing % 6) * 105, 70, CANVAS_H - 70);
    const from = { free: true, x: 260, y };
    const to = { free: true, x: 670, y };
    const connection = { id: uid('co'), from, to, medium: activeMedium, direction: 1, via: { x: 465, y } };
    setSchema((current) => ({ ...current, connections: [...current.connections, connection] }));
    setSelectedConnectionId(connection.id); setSelectedEquipmentId(null);
  }, [activeMedium, schema.connections.length]);

  const moveFreeEndpoint = useCallback((connectionId, endpointKey, x, y) => setSchema((current) => ({ ...current, connections: current.connections.map((connection) => connection.id === connectionId ? { ...connection, [endpointKey]: { ...connection[endpointKey], free: true, x, y } } : connection) })), []);

  const moveConnection = useCallback((connectionId, snapshot, dx, dy) => setSchema((current) => ({ ...current, connections: current.connections.map((connection) => {
    if (connection.id !== connectionId) return connection;
    const patch = { via: { x: clamp(snapshot.via.x + dx, 0, CANVAS_W), y: clamp(snapshot.via.y + dy, 0, CANVAS_H) } };
    if (snapshot.from && snapshot.to) {
      patch.from = { ...connection.from, x: clamp(snapshot.from.x + dx, 0, CANVAS_W), y: clamp(snapshot.from.y + dy, 0, CANVAS_H) };
      patch.to = { ...connection.to, x: clamp(snapshot.to.x + dx, 0, CANVAS_W), y: clamp(snapshot.to.y + dy, 0, CANVAS_H) };
    }
    return { ...connection, ...patch };
  }) })), []);

  const deleteConnection = useCallback((id) => { setSchema((current) => ({ ...current, connections: current.connections.filter((item) => item.id !== id) })); setSelectedConnectionId(null); }, []);
  const toggleConnectMode = useCallback(() => setConnectMode((value) => { const next = !value; if (!next) setPendingPort(null); return next; }), []);

  const syncVisitEquipment = useCallback(async () => {
    if (!visiteId || syncing) return;
    setSyncing(true);
    try {
      const materials = await listerMateriel(visiteId);
      const result = appendVisitEquipment(schemaRef.current, materials);
      setSchema(result.schema);
      Alert.alert('Équipements synchronisés', result.added ? `${result.added} équipement(s) de la visite ont été ajoutés au schéma.` : 'Tous les équipements de la visite sont déjà présents dans le schéma.');
    } catch (error) { Alert.alert('Synchronisation impossible', String(error?.message || error)); }
    finally { setSyncing(false); }
  }, [syncing, visiteId]);

  const resetSchema = useCallback(() => Alert.alert('Effacer le schéma ?', 'Tous les équipements et réseaux dessinés seront supprimés. Les équipements de la visite pourront être réimportés ensuite.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Effacer', style: 'destructive', onPress: () => { setSchema(EMPTY_SCHEMA); setSelectedEquipmentId(null); setSelectedConnectionId(null); setPendingPort(null); } }]), []);
  const setZoomSafe = useCallback((next) => setZoom(clamp(Number(next) || 1, ZOOM_MIN, ZOOM_MAX)), []);
  const fitZoom = useCallback(() => setZoomSafe(wide ? Math.min(0.9, Math.max(ZOOM_MIN, (width - 330) / CANVAS_W)) : Math.min(0.72, Math.max(ZOOM_MIN, (width - 24) / CANVAS_W))), [setZoomSafe, wide, width]);

  if (!loaded) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Chargement du schéma…</Text></View>;

  const inspector = <View style={{ padding: 12, backgroundColor: COLORS.white, borderLeftWidth: wide ? 1 : 0, borderTopWidth: wide ? 0 : 1, borderColor: COLORS.line }}>
    {selectedEquipment ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.inkFaint, textTransform: 'uppercase' }}>Équipement sélectionné</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.ink, marginTop: 4 }}>{hydraulicEquipmentDefinition(selectedEquipment.type)?.label || selectedEquipment.type}</Text>
      <TextInput style={[styles.input, { marginTop: 10, minHeight: 40 }]} value={selectedEquipment.label || ''} onChangeText={(label) => patchEquipment(selectedEquipment.id, { label })} placeholder="Nom affiché" />
      {selectedEquipment.source === 'visit-equipment' ? <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: COLORS.orangeLight }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.orangeDark }}>Lié à l’onglet Équipements de la visite</Text><Text style={{ marginTop: 2, fontSize: 9.5, color: COLORS.inkSoft }}>{[selectedEquipment.metadata?.marque, selectedEquipment.metadata?.modele].filter(Boolean).join(' · ') || 'Référence terrain'}</Text></View> : null}
      <Text style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>Fonctionnement</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><ChoiceChip active={selectedEquipment.running !== false} color={COLORS.green} soft={COLORS.greenBg} onPress={() => patchEquipment(selectedEquipment.id, { running: true })}>En marche</ChoiceChip><ChoiceChip active={selectedEquipment.running === false} color={COLORS.inkSoft} soft="#F1F1EE" onPress={() => patchEquipment(selectedEquipment.id, { running: false })}>À l'arrêt</ChoiceChip></View>
      <Text style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>État</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{Object.entries(STATUS).map(([key, meta]) => <ChoiceChip key={key} active={(selectedEquipment.status || 'ok') === key} color={meta.color} soft={meta.soft} onPress={() => patchEquipment(selectedEquipment.id, { status: key })}>{meta.label}</ChoiceChip>)}</View>
      {['three_way_valve', 'two_way_valve', 'mixing_valve', 'thermostatic_mixing_valve', 'control_valve', 'duct_damper', 'fire_damper'].includes(selectedEquipment.type) ? <><Text style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 12, marginBottom: 6 }}>Position</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[0, 25, 50, 75, 100].map((value) => <ChoiceChip key={value} active={(selectedEquipment.valvePosition ?? 50) === value} color={COLORS.orangeDark} soft={COLORS.orangeLight} onPress={() => patchEquipment(selectedEquipment.id, { valvePosition: value })}>{value}%</ChoiceChip>)}</View></> : null}
      <Text style={{ fontSize: 10.5, lineHeight: 16, color: COLORS.inkFaint, marginTop: 12 }}>Maintiens la barre grise pour déplacer l’équipement. Le schéma est sauvegardé automatiquement.</Text>
      <ToolbarButton danger onPress={() => deleteEquipment(selectedEquipment.id)} style={{ marginTop: 14 }}>Supprimer du schéma</ToolbarButton>
    </ScrollView> : selectedConnection ? <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.inkFaint, textTransform: 'uppercase' }}>Réseau sélectionné</Text><Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.ink, marginTop: 5 }}>Tracé déplaçable</Text>
      <Text style={{ fontSize: 10.5, lineHeight: 16, color: COLORS.inkSoft, marginTop: 7 }}>Maintiens le point central du réseau puis glisse-le. Les extrémités libres peuvent également être déplacées séparément.</Text>
      <Text style={{ fontSize: 11, color: COLORS.inkSoft, marginTop: 11, marginBottom: 6 }}>Fluide / couleur</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{Object.entries(MEDIUMS).map(([key, meta]) => <ChoiceChip key={key} active={selectedConnection.medium === key} color={meta.color} soft={meta.soft} onPress={() => patchConnection(selectedConnection.id, { medium: key })}>{meta.label}</ChoiceChip>)}</View>
      <ToolbarButton active onPress={() => patchConnection(selectedConnection.id, { direction: selectedConnection.direction === -1 ? 1 : -1 })} style={{ marginTop: 12 }}>↔ Inverser le sens</ToolbarButton>
      <ToolbarButton danger onPress={() => deleteConnection(selectedConnection.id)} style={{ marginTop: 8 }}>Supprimer le réseau</ToolbarButton>
    </ScrollView> : <View><Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.ink }}>Schéma technique</Text><Text style={{ fontSize: 11.5, lineHeight: 18, color: COLORS.inkSoft, marginTop: 7 }}>Les équipements saisis dans la visite sont ajoutés automatiquement. Tu peux aussi ajouter des composants de bibliothèque et dessiner des réseaux raccordés ou totalement libres.</Text><View style={{ marginTop: 11, padding: 9, borderRadius: 9, backgroundColor: '#FFF8F2', borderWidth: 1, borderColor: '#F3D2B4' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: '#A74618' }}>Réseau libre = deux extrémités déplaçables</Text><Text style={{ fontSize: 10, color: COLORS.inkSoft, marginTop: 3 }}>Touchez un réseau pour afficher son point de déplacement.</Text></View></View>}
  </View>;

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <View style={{ paddingHorizontal: 10, paddingVertical: 7, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
        <ToolbarButton active onPress={() => setLibraryVisible(true)}>＋ Équipement</ToolbarButton>
        <ToolbarButton active={connectMode} onPress={toggleConnectMode}>{connectMode ? '✓ Raccorder' : '○ Raccorder'}</ToolbarButton>
        <ToolbarButton onPress={addFreeNetwork}>＋ Réseau libre</ToolbarButton>
        {pendingPort ? <ToolbarButton active onPress={finishWithFreeEnd}>↳ Fin libre</ToolbarButton> : null}
        {Object.entries(MEDIUMS).map(([key, meta]) => <ChoiceChip key={key} active={activeMedium === key} color={meta.color} soft={meta.soft} onPress={() => setActiveMedium(key)}>{meta.label}</ChoiceChip>)}
        <ToolbarButton disabled={syncing} onPress={syncVisitEquipment}>{syncing ? 'Synchronisation…' : '↻ Équipements visite'}</ToolbarButton>
        {onImportJson ? <ToolbarButton disabled={importingJson} onPress={onImportJson}>{importingJson ? 'Import…' : '⇩ JSON METRA'}</ToolbarButton> : null}
        <View style={{ width: 1, height: 28, backgroundColor: COLORS.line, marginHorizontal: 2 }} />
        <ToolbarButton onPress={() => setZoomSafe(zoom - ZOOM_STEP)}>−</ToolbarButton>
        <ToolbarButton onPress={fitZoom}>Ajuster</ToolbarButton>
        <View style={{ minWidth: 48, alignItems: 'center' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.ink }}>{Math.round(zoom * 100)}%</Text></View>
        <ToolbarButton onPress={() => setZoomSafe(zoom + ZOOM_STEP)}>＋</ToolbarButton>
        <ToolbarButton danger onPress={resetSchema}>Effacer</ToolbarButton>
        <View style={{ minWidth: 88, alignItems: 'center' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: saveState === 'error' ? COLORS.red : saveState === 'saving' ? COLORS.amber : COLORS.green }}>{saveState === 'saving' ? 'Sauvegarde…' : saveState === 'error' ? 'Erreur' : '✓ Sauvegardé'}</Text><Text style={{ fontSize: 9, color: COLORS.inkFaint }}>{schema.equipment.length} équip. · {schema.connections.length} réseaux</Text></View>
      </ScrollView>
      {connectMode ? <Text style={{ marginTop: 6, fontSize: 10.5, fontWeight: '700', color: pendingPort ? '#9A6A00' : COLORS.orangeDark }}>{pendingPort ? 'Premier raccord choisi : touche une autre borne, ou utilise « Fin libre ».' : `Raccordement actif — ${MEDIUMS[activeMedium].label}. Touche la borne de départ.`}</Text> : null}
    </View>

    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      <View style={{ flex: wide ? 1 : 0, height: wide ? undefined : 430, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: scaledWidth }}>
          <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ minHeight: scaledHeight }}>
            <View style={{ width: scaledWidth, height: scaledHeight }}>
              <View style={{ position: 'absolute', left: innerLeft, top: innerTop, width: CANVAS_W, height: CANVAS_H, transform: [{ scale: zoom }] }}>
                <GridLayer />
                <ConnectionsLayer schema={schema} phase={phase} selectedConnectionId={selectedConnectionId} onSelectConnection={selectConnection} />
                {schema.connections.map((connection) => <React.Fragment key={`handles-${connection.id}`}>
                  <MovableConnectionHandle schema={schema} connection={connection} selected={selectedConnectionId === connection.id} zoom={zoom} onSelect={selectConnection} onMove={moveConnection} />
                  {connection.from?.free ? <FreeEndpointHandle endpoint={connection.from} endpointKey="from" connectionId={connection.id} selected={selectedConnectionId === connection.id} zoom={zoom} onMove={moveFreeEndpoint} onSelect={selectConnection} /> : null}
                  {connection.to?.free ? <FreeEndpointHandle endpoint={connection.to} endpointKey="to" connectionId={connection.id} selected={selectedConnectionId === connection.id} zoom={zoom} onMove={moveFreeEndpoint} onSelect={selectConnection} /> : null}
                </React.Fragment>)}
                {schema.equipment.map((item) => <MovableEquipment key={item.id} item={item} selected={item.id === selectedEquipmentId} connectMode={connectMode} pendingPort={pendingPort} phase={phase} zoom={zoom} onSelect={selectEquipment} onMove={moveEquipment} onPortPress={onPortPress} />)}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
      <View style={{ width: wide ? 286 : '100%', maxHeight: wide ? undefined : 245 }}>{inspector}</View>
    </View>

    <Modal visible={libraryVisible} transparent animationType="fade" onRequestClose={() => setLibraryVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: wide ? 760 : '94%', maxHeight: '88%' }]}>
        <Text style={styles.modalTitle}>Bibliothèque du schéma technique</Text>
        <Text style={{ fontSize: 10.5, color: COLORS.inkSoft, marginBottom: 9 }}>{HYDRAULIC_EQUIPMENT_TYPES.length} composants techniques disponibles. Les composants spécialisés réutilisent un symbole métier proche tout en conservant leur type exact dans le schéma.</Text>
        <TextInput value={libraryQuery} onChangeText={setLibraryQuery} style={styles.input} placeholder="Rechercher : chaudière, vanne, capteur, VMC…" autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 9 }} contentContainerStyle={{ gap: 6 }}><ChoiceChip active={!libraryGroup} color={COLORS.orangeDark} soft={COLORS.orangeLight} onPress={() => setLibraryGroup(null)}>Tous</ChoiceChip>{HYDRAULIC_GROUPS.map((group) => <ChoiceChip key={group} active={libraryGroup === group} color={COLORS.orangeDark} soft={COLORS.orangeLight} onPress={() => setLibraryGroup(group)}>{group}</ChoiceChip>)}</ScrollView>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {libraryItems.map((item) => <TouchableOpacity key={item.id} onPress={() => addEquipment(item.id)} style={{ width: wide ? '23.5%' : '47.5%', minHeight: 128, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 7, backgroundColor: COLORS.white, alignItems: 'center' }}><EquipmentIcon type={hydraulicIconType(item.id)} size={76} phase={phase} running status={item.id === 'water_leak' ? 'fault' : 'ok'} /><Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.ink, textAlign: 'center', marginTop: 4 }}>{item.label}</Text><Text style={{ fontSize: 8.5, color: COLORS.inkFaint, marginTop: 2 }}>{item.group}</Text></TouchableOpacity>)}
          {!libraryItems.length ? <View style={{ width: '100%', paddingVertical: 26 }}><Text style={{ textAlign: 'center', color: COLORS.inkSoft }}>Aucun équipement correspondant.</Text></View> : null}
        </ScrollView>
        <ToolbarButton onPress={() => setLibraryVisible(false)} style={{ marginTop: 13 }}>Fermer</ToolbarButton>
      </View></View>
    </Modal>
  </View>;
}

export { HydraulicSchemaScreenV2 };
