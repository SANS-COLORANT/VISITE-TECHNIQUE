import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import {
  LAB3D_DN,
  LAB3D_EQUIPMENT_PRESETS,
  LAB3D_NETWORK_TYPES,
  createEquipmentFromLab3d,
  createLab3dNetwork,
  loadLab3dSite,
  placeExistingEquipment,
  removeLab3dNetwork,
  removeLab3dObject,
  setMasonryBase,
  updateLab3dEquipmentData,
  updateLab3dNetwork,
  updateLab3dObject,
} from './lab3dDb.js';

const BG = '#07121E';
const GRID_MINOR = '#123A55';
const GRID_MAJOR = '#1B6D96';
const CYAN = '#5DD8FF';
const MUTED = '#91A7B5';
const PANEL = '#102331';
const PANEL_2 = '#173244';
const WHITE = '#F5FBFF';
const RED = '#FF5D63';
const AXIS = { X: '#FF6B6B', Y: '#55C7FF', Z: '#78E08F' };
const DEFAULT_CAMERA = { zoom: 52, offsetX: 0, offsetY: 0, yaw: 45, pitch: 30, targetX: 0, targetY: 0, targetZ: 0 };
const RADIAL_RADIUS = 78;

const EQUIPMENT_COLORS = {
  chaudiere: '#D88A46', pompe: '#4FA7D8', adoucisseur: '#5BBACF', ballon: '#7F93B6',
  vase_expansion: '#9B7EC8', echangeur: '#C1A457', bouteille: '#6E9CAD', cta: '#728C9D',
  vmc: '#7097A7', ventilateur: '#6BB0B8', armoire: '#9B9AA0', bac_sel: '#9CBCD0', equipement: '#7891A2',
};
const NETWORK_COLORS = {
  chauffage_depart: '#EF635F', chauffage_retour: '#4E8FE6', ecs: '#F39A4A', efs: '#51B7E8',
  bouclage_ecs: '#D98B55', gaz: '#F0D95C', condensats: '#A8C4D0', fioul: '#8E8070', autre: '#B6C8D0',
};
const RADIAL_ACTIONS = {
  main: [
    { key: 'move', label: 'Déplacer', icon: '✥', angle: -90 },
    { key: 'rotate', label: 'Tourner', icon: '↻', angle: -30 },
    { key: 'dimensions', label: 'Dimensions', icon: '↔', angle: 30 },
    { key: 'network', label: 'Réseaux', icon: '⌁', angle: 90 },
    { key: 'base', label: 'Socle', icon: '▰', angle: 150 },
    { key: 'more', label: 'Plus', icon: '•••', angle: 210 },
  ],
  axis: [
    { key: 'axisZ', label: 'Z · Haut', icon: 'Z', angle: -90 },
    { key: 'axisY', label: 'Y · Prof.', icon: 'Y', angle: 30 },
    { key: 'axisX', label: 'X · Lat.', icon: 'X', angle: 150 },
  ],
  rotate: [
    { key: 'rotateLeft', label: '−90°', icon: '↶', angle: -120 },
    { key: 'rotateRight', label: '+90°', icon: '↷', angle: -60 },
    { key: 'rotateExact', label: 'Angle', icon: '°', angle: 90 },
  ],
  more: [
    { key: 'info', label: 'Infos', icon: 'i', angle: -120 },
    { key: 'focus', label: 'Cadrer', icon: '◎', angle: -60 },
    { key: 'delete', label: 'Retirer', icon: '×', angle: 90, danger: true },
  ],
};

const num = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snap = (value, step) => Math.round(value / step) * step;
const deg = (value) => value * Math.PI / 180;
const angleDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const haptic = (duration = 8) => { try { Vibration.vibrate(duration); } catch (_) {} };

function cameraPoint(point, viewport, camera) {
  const scale = num(camera.zoom, 52);
  const yaw = deg(num(camera.yaw, 45));
  const pitch = deg(clamp(num(camera.pitch, 30), 5, 90));
  const dx = num(point.x) - num(camera.targetX);
  const dy = num(point.y) - num(camera.targetY);
  const dz = num(point.z) - num(camera.targetZ);
  const rx = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const ry = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const cx = viewport.width / 2 + num(camera.offsetX);
  const cy = viewport.height * 0.56 + num(camera.offsetY);
  return {
    x: cx + rx * scale,
    y: cy + (ry * Math.sin(pitch) - dz * Math.cos(pitch)) * scale,
    depth: ry * Math.cos(pitch) + dz * Math.sin(pitch),
  };
}

function project(point, viewport, camera) {
  const p = cameraPoint(point, viewport, camera);
  return { x: p.x, y: p.y };
}

function polygonPoints(points, viewport, camera) {
  return points.map((point) => {
    const p = project(point, viewport, camera);
    return `${p.x},${p.y}`;
  }).join(' ');
}

function Cuboid({ object, viewport, camera, selected = false, support = false }) {
  const overhang = support ? num(object.params?.support?.overhang, 0.05) : 0;
  const width = support ? num(object.params?.support?.width, num(object.width) + overhang * 2) : num(object.width, 1);
  const depth = support ? num(object.params?.support?.depth, num(object.depth) + overhang * 2) : num(object.depth, 0.6);
  const height = support ? num(object.params?.support?.height, 0.10) : num(object.height, 1);
  const z = support ? num(object.z) - height : num(object.z);
  const x = num(object.x);
  const y = num(object.y);
  const hw = width / 2;
  const hd = depth / 2;
  const rad = deg(num(object.rotation_deg));
  const rotate = (px, py) => ({ x: x + px * Math.cos(rad) - py * Math.sin(rad), y: y + px * Math.sin(rad) + py * Math.cos(rad) });
  const a = rotate(-hw, -hd); const b = rotate(hw, -hd); const c = rotate(hw, hd); const d = rotate(-hw, hd);
  const bottom = [a, b, c, d].map((p) => ({ ...p, z }));
  const top = [a, b, c, d].map((p) => ({ ...p, z: z + height }));
  const color = support ? '#777B7E' : (EQUIPMENT_COLORS[object.subtype] || EQUIPMENT_COLORS.equipement);
  const faces = [
    { points: [bottom[0], bottom[1], top[1], top[0]], opacity: support ? 0.42 : 0.54 },
    { points: [bottom[1], bottom[2], top[2], top[1]], opacity: support ? 0.58 : 0.72 },
    { points: [bottom[2], bottom[3], top[3], top[2]], opacity: support ? 0.48 : 0.62 },
    { points: [bottom[3], bottom[0], top[0], top[3]], opacity: support ? 0.50 : 0.66 },
    { points: top, opacity: support ? 0.82 : 0.95 },
  ].map((face, index) => ({
    ...face,
    key: index,
    depth: face.points.reduce((sum, point) => sum + cameraPoint(point, viewport, camera).depth, 0) / face.points.length,
  })).sort((left, right) => left.depth - right.depth);
  return <>{faces.map((face) => <Polygon key={face.key} points={polygonPoints(face.points, viewport, camera)} fill={color} opacity={face.opacity} stroke={selected ? CYAN : '#B8CDD8'} strokeWidth={selected ? 2.2 : 0.8} />)}</>;
}

function SceneGrid({ viewport, camera, step = 0.25 }) {
  const size = 10;
  const lines = [];
  const increment = Math.max(0.25, num(step, 0.25));
  let index = 0;
  for (let v = -size; v <= size + 0.001; v += increment) {
    const major = Math.abs(Math.round(v / increment)) % Math.max(1, Math.round(1 / increment)) === 0;
    const stroke = major ? GRID_MAJOR : GRID_MINOR;
    const width = major ? 1.0 : 0.45;
    const p1 = project({ x: -size, y: v, z: 0 }, viewport, camera);
    const p2 = project({ x: size, y: v, z: 0 }, viewport, camera);
    const p3 = project({ x: v, y: -size, z: 0 }, viewport, camera);
    const p4 = project({ x: v, y: size, z: 0 }, viewport, camera);
    lines.push(<Line key={`gx-${index++}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={width} />);
    lines.push(<Line key={`gy-${index++}`} x1={p3.x} y1={p3.y} x2={p4.x} y2={p4.y} stroke={stroke} strokeWidth={width} />);
  }
  const origin = project({ x: 0, y: 0, z: 0 }, viewport, camera);
  const xEnd = project({ x: 2, y: 0, z: 0 }, viewport, camera);
  const yEnd = project({ x: 0, y: 2, z: 0 }, viewport, camera);
  const zEnd = project({ x: 0, y: 0, z: 2 }, viewport, camera);
  return <>{lines}<Line x1={origin.x} y1={origin.y} x2={xEnd.x} y2={xEnd.y} stroke={AXIS.X} strokeWidth={2} /><Line x1={origin.x} y1={origin.y} x2={yEnd.x} y2={yEnd.y} stroke={AXIS.Y} strokeWidth={2} /><Line x1={origin.x} y1={origin.y} x2={zEnd.x} y2={zEnd.y} stroke={AXIS.Z} strokeWidth={2} /></>;
}

function networkLabel(typeCode) {
  return LAB3D_NETWORK_TYPES.find((item) => item.code === typeCode)?.label || typeCode || 'Réseau';
}

function TinyButton({ label, onPress, active = false, danger = false, disabled = false, flex = false }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: danger ? '#93484B' : active ? CYAN : '#345567', backgroundColor: active ? '#174B63' : danger ? '#3A2025' : PANEL_2, opacity: disabled ? 0.42 : 1, alignItems: 'center', justifyContent: 'center', flex: flex ? 1 : undefined }}><Text style={{ color: danger ? '#FF9A9E' : WHITE, fontWeight: '800', fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}

function Field({ label, value, onChangeText, keyboardType = 'decimal-pad' }) {
  return <View style={{ marginBottom: 10 }}><Text style={{ color: MUTED, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>{label}</Text><TextInput value={String(value ?? '')} onChangeText={onChangeText} keyboardType={keyboardType} style={{ backgroundColor: '#0B1A25', color: WHITE, borderRadius: 9, borderWidth: 1, borderColor: '#355568', paddingHorizontal: 11, minHeight: 42 }} /></View>;
}

function RadialMenu({ menu, object, onAction, onClose }) {
  if (!menu || !object) return null;
  const actions = RADIAL_ACTIONS[menu.mode] || RADIAL_ACTIONS.main;
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: menu.x - 112, top: menu.y - 112, width: 224, height: 224 }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 42, top: 42, width: 140, height: 140, borderRadius: 70, backgroundColor: '#06111ACF', borderWidth: 1, borderColor: '#31576C' }} />
    {actions.map((action) => {
      const rad = deg(action.angle);
      const left = 112 + Math.cos(rad) * RADIAL_RADIUS - 28;
      const top = 112 + Math.sin(rad) * RADIAL_RADIUS - 28;
      const hovered = menu.hovered === action.key;
      return <TouchableOpacity key={action.key} onPress={() => onAction(action.key)} style={{ position: 'absolute', left, top, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: hovered ? 2 : 1, borderColor: action.danger ? '#FF7A80' : hovered ? CYAN : '#477186', backgroundColor: action.danger ? '#53252B' : hovered ? '#16617D' : '#143143', transform: [{ scale: hovered ? 1.12 : 1 }] }}>
        <Text style={{ color: action.danger ? '#FFB0B4' : WHITE, fontWeight: '900', fontSize: action.icon.length > 2 ? 11 : 19 }}>{action.icon}</Text>
        <Text numberOfLines={1} style={{ color: action.danger ? '#FFB0B4' : '#D8EEF8', fontSize: 8, fontWeight: '800', marginTop: 1 }}>{action.label}</Text>
      </TouchableOpacity>;
    })}
    <TouchableOpacity onPress={onClose} style={{ position: 'absolute', left: 82, top: 82, width: 60, height: 60, borderRadius: 30, backgroundColor: '#0B202D', borderWidth: 2, borderColor: CYAN, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: WHITE, fontWeight: '900', fontSize: 11, textAlign: 'center' }}>{menu.mode === 'main' ? String(object.label || 'Objet').slice(0, 10) : menu.mode === 'axis' ? 'AXE' : menu.mode === 'rotate' ? 'ROT.' : 'PLUS'}</Text>
      <Text style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>×</Text>
    </TouchableOpacity>
  </View>;
}

export function Lab3DScreen({ route, navigation }) {
  const requestedSiteId = route?.params?.siteId || null;
  const requestedVisitId = route?.params?.visiteId || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [objects, setObjects] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState(null);
  const [axis, setAxis] = useState('X');
  const [moveMode, setMoveMode] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: 520 });
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [radialMenu, setRadialMenu] = useState(null);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [newEquipmentModal, setNewEquipmentModal] = useState(false);
  const [dimensionModal, setDimensionModal] = useState(false);
  const [networkModal, setNetworkModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [rotationModal, setRotationModal] = useState(false);
  const [networkDraft, setNetworkDraft] = useState(null);
  const [networkType, setNetworkType] = useState('chauffage_depart');
  const [networkDn, setNetworkDn] = useState(50);
  const [editForm, setEditForm] = useState({});
  const [exactValue, setExactValue] = useState('0');
  const [rotationValue, setRotationValue] = useState('0');

  const sceneRef = useRef(null);
  const dragStart = useRef(null);
  const latestObjects = useRef(objects);
  const latestCamera = useRef(camera);
  const touchingObjectRef = useRef(false);
  const radialGestureRef = useRef({ active: false, hovered: null, objectId: null });
  const suppressTapRef = useRef(null);
  const lastObjectTapRef = useRef({ id: null, at: 0 });
  const lastEmptyTapRef = useRef(0);
  const lastSnapRef = useRef(null);
  const cameraGestureRef = useRef(null);
  const inertiaFrameRef = useRef(null);
  latestObjects.current = objects;
  latestCamera.current = camera;

  const reload = useCallback(async ({ keepSelection = true } = {}) => {
    try {
      setError(null);
      const loaded = await loadLab3dSite({ siteId: requestedSiteId, visiteId: requestedVisitId });
      setData(loaded);
      setObjects(loaded.objects || []);
      setNetworks(loaded.networks || []);
      if (!keepSelection) { setSelectedId(null); setSelectedNetworkId(null); }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [requestedSiteId, requestedVisitId]);

  useEffect(() => { reload({ keepSelection: false }); }, [reload]);
  useEffect(() => () => { if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current); }, []);

  const selected = useMemo(() => objects.find((item) => item.id === selectedId) || null, [objects, selectedId]);
  const selectedNetwork = useMemo(() => networks.find((item) => item.id === selectedNetworkId) || null, [networks, selectedNetworkId]);
  const selectedEquipment = useMemo(() => data?.equipments?.find((item) => item.id === selected?.equipment_id) || null, [data, selected]);

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = null;
  }, []);

  const startInertia = useCallback((yawVelocity, pitchVelocity) => {
    stopInertia();
    let vy = yawVelocity;
    let vp = pitchVelocity;
    const tick = () => {
      vy *= 0.90;
      vp *= 0.90;
      if (Math.abs(vy) < 0.025 && Math.abs(vp) < 0.025) { inertiaFrameRef.current = null; return; }
      setCamera((current) => ({ ...current, yaw: current.yaw + vy, pitch: clamp(current.pitch + vp, 8, 82) }));
      inertiaFrameRef.current = requestAnimationFrame(tick);
    };
    inertiaFrameRef.current = requestAnimationFrame(tick);
  }, [stopInertia]);

  const fitScene = useCallback((preset = 'iso') => {
    const currentObjects = latestObjects.current;
    const yaw = preset === 'top' ? 0 : 45;
    const pitch = preset === 'top' ? 88 : 30;
    if (!currentObjects.length) {
      setCamera({ ...DEFAULT_CAMERA, yaw, pitch });
      return;
    }
    const xs = currentObjects.map((item) => num(item.x));
    const ys = currentObjects.map((item) => num(item.y));
    const maxZ = Math.max(...currentObjects.map((item) => num(item.z) + num(item.height, 1)), 1);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX + 2.0, maxY - minY + 2.0, maxZ + 1.0, 3);
    const scale = clamp(Math.min(viewport.width / (span * 1.55), viewport.height / (span * 1.15)), 28, 78);
    setCamera({ zoom: scale, offsetX: 0, offsetY: 0, yaw, pitch, targetX: (minX + maxX) / 2, targetY: (minY + maxY) / 2, targetZ: maxZ * 0.28 });
  }, [viewport.height, viewport.width]);

  const focusObject = useCallback((object) => {
    if (!object) return;
    stopInertia();
    setCamera((current) => ({ ...current, targetX: num(object.x), targetY: num(object.y), targetZ: num(object.z) + num(object.height, 1) * 0.45, offsetX: 0, offsetY: 0, zoom: clamp(Math.max(current.zoom, 68), 36, 92) }));
    haptic(10);
  }, [stopInertia]);

  const scenePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (event, gesture) => {
      const touches = event.nativeEvent.touches || [];
      if (moveMode || radialMenu) return false;
      if (touches.length >= 2) return true;
      if (touchingObjectRef.current) return false;
      return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
    },
    onPanResponderGrant: (event) => {
      stopInertia();
      const touches = event.nativeEvent.touches || [];
      const current = latestCamera.current;
      if (touches.length >= 2) {
        const a = touches[0]; const b = touches[1];
        cameraGestureRef.current = { mode: 'multi', start: { ...current }, centerX: (a.pageX + b.pageX) / 2, centerY: (a.pageY + b.pageY) / 2, distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) };
      } else {
        cameraGestureRef.current = { mode: 'orbit', start: { ...current }, lastDx: 0, lastDy: 0, lastAt: Date.now(), velocityYaw: 0, velocityPitch: 0 };
      }
    },
    onPanResponderMove: (event, gesture) => {
      const state = cameraGestureRef.current;
      if (!state) return;
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const a = touches[0]; const b = touches[1];
        if (state.mode !== 'multi') {
          const current = latestCamera.current;
          state.mode = 'multi'; state.start = { ...current };
          state.centerX = (a.pageX + b.pageX) / 2; state.centerY = (a.pageY + b.pageY) / 2;
          state.distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
        }
        const centerX = (a.pageX + b.pageX) / 2;
        const centerY = (a.pageY + b.pageY) / 2;
        const distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
        const ratio = distance / state.distance;
        setCamera((current) => ({ ...current, zoom: clamp(state.start.zoom * ratio, 24, 110), offsetX: state.start.offsetX + centerX - state.centerX, offsetY: state.start.offsetY + centerY - state.centerY }));
        return;
      }
      if (state.mode !== 'orbit') return;
      const now = Date.now();
      const dt = Math.max(16, now - state.lastAt);
      const dxStep = gesture.dx - state.lastDx;
      const dyStep = gesture.dy - state.lastDy;
      state.velocityYaw = (dxStep * 0.35) * (16 / dt);
      state.velocityPitch = (-dyStep * 0.25) * (16 / dt);
      state.lastDx = gesture.dx; state.lastDy = gesture.dy; state.lastAt = now;
      setCamera((current) => ({ ...current, yaw: state.start.yaw + gesture.dx * 0.35, pitch: clamp(state.start.pitch - gesture.dy * 0.25, 8, 82) }));
    },
    onPanResponderRelease: () => {
      const state = cameraGestureRef.current;
      cameraGestureRef.current = null;
      if (state?.mode === 'orbit') startInertia(state.velocityYaw || 0, state.velocityPitch || 0);
    },
    onPanResponderTerminate: () => { cameraGestureRef.current = null; },
  }), [moveMode, radialMenu, startInertia, stopInertia]);

  const commitSelected = useCallback(async (object) => {
    if (!object?.id) return;
    await updateLab3dObject(object.id, { x: object.x, y: object.y, z: object.z });
  }, []);

  const movePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => Boolean(selectedId && moveMode && (event.nativeEvent.touches || []).length >= 1),
    onMoveShouldSetPanResponder: (event, gesture) => Boolean(selectedId && moveMode && ((event.nativeEvent.touches || []).length >= 2 || Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)),
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        stopInertia();
        const a = touches[0]; const b = touches[1];
        cameraGestureRef.current = { mode: 'multi', start: { ...latestCamera.current }, centerX: (a.pageX + b.pageX) / 2, centerY: (a.pageY + b.pageY) / 2, distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) };
        return;
      }
      const object = latestObjects.current.find((item) => item.id === selectedId);
      if (object) { dragStart.current = { ...object }; lastSnapRef.current = num(object[axis.toLowerCase()]); }
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const a = touches[0]; const b = touches[1];
        let state = cameraGestureRef.current;
        if (!state || state.mode !== 'multi') {
          state = { mode: 'multi', start: { ...latestCamera.current }, centerX: (a.pageX + b.pageX) / 2, centerY: (a.pageY + b.pageY) / 2, distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) };
          cameraGestureRef.current = state;
        }
        const centerX = (a.pageX + b.pageX) / 2;
        const centerY = (a.pageY + b.pageY) / 2;
        const distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
        const ratio = distance / state.distance;
        setCamera((current) => ({ ...current, zoom: clamp(state.start.zoom * ratio, 24, 110), offsetX: state.start.offsetX + centerX - state.centerX, offsetY: state.start.offsetY + centerY - state.centerY }));
        return;
      }
      if (cameraGestureRef.current?.mode === 'multi') return;
      const start = dragStart.current;
      if (!start) return;
      const step = num(data?.scene?.grid_step, 0.25);
      const key = axis.toLowerCase();
      const origin = { x: num(start.x), y: num(start.y), z: num(start.z) };
      const unit = { ...origin, [key]: num(origin[key]) + 1 };
      const screenA = project(origin, viewport, latestCamera.current);
      const screenB = project(unit, viewport, latestCamera.current);
      const vx = screenB.x - screenA.x;
      const vy = screenB.y - screenA.y;
      const pixelsPerMeter = Math.max(8, Math.hypot(vx, vy));
      const projectedPixels = (gesture.dx * vx + gesture.dy * vy) / pixelsPerMeter;
      const delta = projectedPixels / pixelsPerMeter;
      const nextValue = axis === 'Z' ? Math.max(0, snap(num(start[key]) + delta, step)) : snap(num(start[key]) + delta, step);
      if (lastSnapRef.current !== nextValue) { lastSnapRef.current = nextValue; haptic(5); }
      setObjects((current) => current.map((item) => item.id === start.id ? { ...item, [key]: nextValue } : item));
    },
    onPanResponderRelease: async () => {
      if (cameraGestureRef.current?.mode === 'multi') { cameraGestureRef.current = null; dragStart.current = null; lastSnapRef.current = null; return; }
      const object = latestObjects.current.find((item) => item.id === selectedId);
      dragStart.current = null;
      lastSnapRef.current = null;
      setMoveMode(false);
      try { await commitSelected(object); haptic(10); } catch (err) { Alert.alert('Déplacement', String(err.message || err)); }
    },
    onPanResponderTerminate: () => { cameraGestureRef.current = null; dragStart.current = null; lastSnapRef.current = null; setMoveMode(false); },
  }), [axis, commitSelected, data?.scene?.grid_step, moveMode, selectedId, stopInertia, viewport]);

  const selectObject = useCallback(async (object) => {
    setSelectedNetworkId(null);
    if (networkDraft && object.id !== networkDraft.start.id) {
      try {
        const created = await createLab3dNetwork(data.scene.id, { typeCode: networkDraft.typeCode, diameterMm: networkDraft.diameterMm, start: networkDraft.start, end: object });
        setNetworks((current) => [...current, created]);
        setNetworkDraft(null);
        setSelectedId(object.id);
        haptic(12);
      } catch (err) { Alert.alert('Réseau', String(err.message || err)); }
      return;
    }
    setSelectedId(object.id);
  }, [data?.scene?.id, networkDraft]);

  const moveByStep = async (direction) => {
    if (!selected) return;
    const step = num(data?.scene?.grid_step, 0.25) * direction;
    const patch = axis === 'X' ? { x: num(selected.x) + step } : axis === 'Y' ? { y: num(selected.y) + step } : { z: Math.max(0, num(selected.z) + step) };
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
    await updateLab3dObject(selected.id, patch);
    haptic(7);
  };

  const rotate = async (direction) => {
    if (!selected) return;
    const rotation_deg = ((num(selected.rotation_deg) + direction * 90) % 360 + 360) % 360;
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, rotation_deg } : item));
    await updateLab3dObject(selected.id, { rotation_deg });
    haptic(10);
  };

  const openDimensions = () => {
    if (!selected) return;
    setEditForm({ width: selected.width, depth: selected.depth, height: selected.height, z: selected.z, designation: selectedEquipment?.designation || selected.label || '', marque: selectedEquipment?.marque || '', modele: selectedEquipment?.modele || '', supportHeight: selected.params?.support?.height ?? 0.10, supportOverhang: selected.params?.support?.overhang ?? 0.05 });
    setDimensionModal(true);
  };

  const saveDimensions = async () => {
    if (!selected) return;
    const width = Math.max(0.1, num(editForm.width, selected.width));
    const depth = Math.max(0.1, num(editForm.depth, selected.depth));
    const height = Math.max(0.1, num(editForm.height, selected.height));
    const z = Math.max(0, num(editForm.z, selected.z));
    let params = selected.params || {};
    if (params.support?.type === 'masonry') {
      const overhang = Math.max(0, num(editForm.supportOverhang, 0.05));
      params = { ...params, support: { ...params.support, overhang, height: Math.max(0.02, num(editForm.supportHeight, 0.10)), width: width + overhang * 2, depth: depth + overhang * 2 } };
    }
    await updateLab3dObject(selected.id, { width, depth, height, z, label: editForm.designation || selected.label, params });
    if (selected.equipment_id) await updateLab3dEquipmentData(selected.equipment_id, { designation: editForm.designation, marque: editForm.marque, modele: editForm.modele });
    setDimensionModal(false);
    await reload();
  };

  const toggleBase = async () => { if (selected) { await setMasonryBase(selected); haptic(10); await reload(); } };

  const deleteSelected = () => {
    if (!selected) return;
    Alert.alert('Retirer de la maquette ?', "L'équipement reste enregistré dans le patrimoine du site.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer de la 3D', style: 'destructive', onPress: async () => { await removeLab3dObject(selected.id); setSelectedId(null); setRadialMenu(null); await reload(); } },
    ]);
  };

  const placeEquipment = async (equipment) => {
    try {
      const index = objects.length;
      const object = await placeExistingEquipment(data.scene.id, equipment, { x: (index % 4) * 1.5, y: Math.floor(index / 4) * 1.4, z: 0 });
      setEquipmentModal(false); await reload(); setSelectedId(object.id); focusObject(object);
    } catch (err) { Alert.alert('Placement', String(err.message || err)); }
  };

  const createEquipment = async (preset) => {
    try {
      const index = objects.length;
      const result = await createEquipmentFromLab3d(data.siteId, data.scene.id, preset.code, { x: (index % 4) * 1.5, y: Math.floor(index / 4) * 1.4, z: 0 });
      setNewEquipmentModal(false); await reload(); setSelectedId(result.object.id); focusObject(result.object);
    } catch (err) { Alert.alert('Nouvel équipement', String(err.message || err)); }
  };

  const startNetwork = () => { if (selected) { setNetworkType('chauffage_depart'); setNetworkDn(50); setNetworkModal(true); } };
  const confirmNetworkStart = () => { setNetworkModal(false); setNetworkDraft({ start: selected, typeCode: networkType, diameterMm: networkDn }); setMoveMode(false); setRadialMenu(null); };
  const changeNetworkDn = async (dn) => { if (selectedNetwork) { await updateLab3dNetwork(selectedNetwork.id, { diameter_mm: dn }); setNetworks((current) => current.map((item) => item.id === selectedNetwork.id ? { ...item, diameter_mm: dn } : item)); haptic(7); } };
  const deleteNetwork = () => { if (selectedNetwork) Alert.alert('Supprimer ce réseau ?', `${networkLabel(selectedNetwork.type_code)} · DN${selectedNetwork.diameter_mm || '-'}`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await removeLab3dNetwork(selectedNetwork.id); setSelectedNetworkId(null); await reload(); } }]); };

  const openRadialMenu = useCallback((object, center) => {
    const x = clamp(center.x, 116, Math.max(116, viewport.width - 116));
    const y = clamp(center.y, 116, Math.max(116, viewport.height - 116));
    setSelectedId(object.id); setSelectedNetworkId(null); setMoveMode(false);
    radialGestureRef.current = { active: true, hovered: null, objectId: object.id, x, y };
    setRadialMenu({ objectId: object.id, x, y, mode: 'main', hovered: null });
    suppressTapRef.current = object.id;
    haptic(12);
  }, [viewport.height, viewport.width]);

  const updateRadialHover = useCallback((object, frame, event) => {
    const gesture = radialGestureRef.current;
    if (!gesture.active || gesture.objectId !== object.id || !radialMenu) return;
    const x = frame.left + num(event.nativeEvent.locationX);
    const y = frame.top + num(event.nativeEvent.locationY);
    const dx = x - radialMenu.x; const dy = y - radialMenu.y;
    const radius = Math.hypot(dx, dy);
    let hovered = null;
    if (radius > 30) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const actions = RADIAL_ACTIONS[radialMenu.mode] || RADIAL_ACTIONS.main;
      hovered = actions.reduce((best, action) => !best || angleDistance(angle, action.angle) < angleDistance(angle, best.angle) ? action : best, null)?.key || null;
    }
    if (gesture.hovered !== hovered) { gesture.hovered = hovered; if (hovered) haptic(4); setRadialMenu((menu) => menu ? { ...menu, hovered } : menu); }
  }, [radialMenu]);

  const executeRadialAction = async (key) => {
    const object = latestObjects.current.find((item) => item.id === selectedId);
    if (!object) { setRadialMenu(null); return; }
    if (key === 'move') { setRadialMenu((menu) => menu ? { ...menu, mode: 'axis', hovered: null } : menu); return; }
    if (key === 'rotate') { setRadialMenu((menu) => menu ? { ...menu, mode: 'rotate', hovered: null } : menu); return; }
    if (key === 'more') { setRadialMenu((menu) => menu ? { ...menu, mode: 'more', hovered: null } : menu); return; }
    if (key === 'axisX' || key === 'axisY' || key === 'axisZ') { setAxis(key.slice(-1)); setMoveMode(true); setRadialMenu(null); haptic(10); return; }
    if (key === 'rotateLeft') { setRadialMenu(null); await rotate(-1); return; }
    if (key === 'rotateRight') { setRadialMenu(null); await rotate(1); return; }
    if (key === 'rotateExact') { setRotationValue(String(num(object.rotation_deg).toFixed(0))); setRotationModal(true); setRadialMenu(null); return; }
    if (key === 'dimensions' || key === 'info') { setRadialMenu(null); openDimensions(); return; }
    if (key === 'network') { setRadialMenu(null); startNetwork(); return; }
    if (key === 'base') { setRadialMenu(null); await toggleBase(); return; }
    if (key === 'focus') { setRadialMenu(null); focusObject(object); return; }
    if (key === 'delete') { setRadialMenu(null); deleteSelected(); }
  };

  const releaseRadialGesture = () => {
    const gesture = radialGestureRef.current;
    radialGestureRef.current = { active: false, hovered: null, objectId: null };
    if (gesture.active && gesture.hovered) executeRadialAction(gesture.hovered);
  };

  const handleObjectTap = useCallback((object) => {
    touchingObjectRef.current = false;
    if (suppressTapRef.current === object.id) { suppressTapRef.current = null; return; }
    const now = Date.now();
    if (lastObjectTapRef.current.id === object.id && now - lastObjectTapRef.current.at < 320) {
      lastObjectTapRef.current = { id: null, at: 0 };
      selectObject(object); focusObject(object);
      return;
    }
    lastObjectTapRef.current = { id: object.id, at: now };
    selectObject(object);
  }, [focusObject, selectObject]);

  const handleEmptyPress = useCallback(() => {
    const now = Date.now();
    setRadialMenu(null); setMoveMode(false); setSelectedId(null); setSelectedNetworkId(null);
    if (now - lastEmptyTapRef.current < 320) { lastEmptyTapRef.current = 0; fitScene('iso'); haptic(10); }
    else lastEmptyTapRef.current = now;
  }, [fitScene]);

  const openExactPosition = () => { if (selected) { setExactValue(String(num(selected[axis.toLowerCase()]).toFixed(2))); setPositionModal(true); } };
  const saveExactPosition = async () => {
    if (!selected) return;
    const key = axis.toLowerCase();
    const value = axis === 'Z' ? Math.max(0, num(exactValue, selected[key])) : num(exactValue, selected[key]);
    await updateLab3dObject(selected.id, { [key]: value });
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, [key]: value } : item));
    setPositionModal(false); setMoveMode(false); haptic(10);
  };
  const saveExactRotation = async () => {
    if (!selected) return;
    const rotation_deg = ((num(rotationValue, selected.rotation_deg) % 360) + 360) % 360;
    await updateLab3dObject(selected.id, { rotation_deg });
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, rotation_deg } : item));
    setRotationModal(false); haptic(10);
  };

  const markersByObject = useMemo(() => {
    const map = new Map();
    for (const remark of data?.remarks || []) {
      const object = objects.find((item) => item.equipment_id === remark.reference_id);
      if (!object) continue;
      const list = map.get(object.id) || []; list.push(remark); map.set(object.id, list);
    }
    return map;
  }, [data?.remarks, objects]);

  if (loading) return <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={CYAN} /><Text style={{ color: MUTED, marginTop: 10 }}>Chargement de LAB 3D…</Text></View>;
  if (error) return <View style={{ flex: 1, backgroundColor: BG, padding: 24, justifyContent: 'center' }}><Text style={{ color: RED, fontSize: 18, fontWeight: '900' }}>LAB 3D indisponible</Text><Text style={{ color: WHITE, marginTop: 8 }}>{String(error.message || error)}</Text><TinyButton label="Réessayer" onPress={() => { setLoading(true); reload(); }} /></View>;

  const unplaced = (data?.equipments || []).filter((item) => !Number(item.placed_3d));
  const radialObject = radialMenu ? objects.find((item) => item.id === radialMenu.objectId) : null;

  return <View style={{ flex: 1, backgroundColor: BG }}>
    <View style={{ paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#091824', borderBottomWidth: 1, borderBottomColor: '#163548' }}>
      <View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 15 }}>{data?.nomSite || 'Site'} · LAB 3D</Text><Text style={{ color: MUTED, fontSize: 10 }}>{requestedVisitId ? 'Maquette du site · couche visite' : 'Maquette permanente'} · {objects.length} équipement(s) · {networks.length} réseau(x)</Text></View>
      <TinyButton label="⌂" onPress={() => fitScene('iso')} />
      <TinyButton label="◇ ISO" onPress={() => setCamera((c) => ({ ...c, yaw: 45, pitch: 30 }))} />
      <TinyButton label="⬆ Dessus" onPress={() => fitScene('top')} />
      <TinyButton label="−" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom - 8, 24, 110) }))} />
      <TinyButton label="+" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom + 8, 24, 110) }))} />
    </View>

    <View ref={sceneRef} style={{ flex: 1, overflow: 'hidden' }} onLayout={(event) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} {...(moveMode ? movePanResponder.panHandlers : scenePanResponder.panHandlers)}>
      <Svg width="100%" height="100%" style={{ backgroundColor: BG }} onPress={handleEmptyPress}>
        <SceneGrid viewport={viewport} camera={camera} step={data?.scene?.grid_step} />
        {networks.map((network) => <React.Fragment key={network.id}>{(network.points || []).slice(0, -1).map((point, index) => { const a = project(point, viewport, camera); const b = project(network.points[index + 1], viewport, camera); return <Line key={`${network.id}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={NETWORK_COLORS[network.type_code] || NETWORK_COLORS.autre} strokeWidth={clamp(2 + num(network.diameter_mm, 50) / 35, 2.5, 8)} strokeLinecap="round" opacity={selectedNetworkId === network.id ? 1 : 0.82} onPress={(event) => { event?.stopPropagation?.(); setSelectedNetworkId(network.id); setSelectedId(null); setMoveMode(false); setRadialMenu(null); }} />; })}</React.Fragment>)}
        {objects.map((object) => <React.Fragment key={object.id}>
          {object.params?.support?.type === 'masonry' ? <Cuboid object={object} viewport={viewport} camera={camera} support /> : null}
          <Cuboid object={object} viewport={viewport} camera={camera} selected={selectedId === object.id} />
          {(() => { const labelPoint = project({ x: object.x, y: object.y, z: num(object.z) + num(object.height) + 0.18 }, viewport, camera); return <SvgText x={labelPoint.x} y={labelPoint.y} fill={selectedId === object.id ? CYAN : '#DCEAF1'} fontSize="11" fontWeight="700" textAnchor="middle">{String(object.label || object.subtype || 'Équipement').slice(0, 24)}</SvgText>; })()}
          {(markersByObject.get(object.id) || []).map((remark, index) => { const marker = project({ x: num(object.x) + 0.25 + index * 0.12, y: num(object.y) - 0.2, z: num(object.z) + num(object.height) + 0.5 + index * 0.15 }, viewport, camera); return <React.Fragment key={remark.id}><Circle cx={marker.x} cy={marker.y} r={8} fill={RED} stroke="#FFF" strokeWidth={1.5} /><SvgText x={marker.x} y={marker.y + 3.5} fill="#FFF" fontSize="8" fontWeight="900" textAnchor="middle">!</SvgText></React.Fragment>; })}
        </React.Fragment>)}
      </Svg>

      {objects.map((object) => {
        const center = project({ x: object.x, y: object.y, z: num(object.z) + num(object.height) * 0.5 }, viewport, camera);
        const hit = clamp(Math.max(num(object.width), num(object.depth)) * camera.zoom * 0.8, 46, 106);
        const frame = { left: center.x - hit / 2, top: center.y - hit / 2, width: hit, height: hit };
        return <Pressable key={`hit-${object.id}`} onPressIn={() => { touchingObjectRef.current = true; stopInertia(); }} onPress={() => handleObjectTap(object)} onLongPress={() => openRadialMenu(object, center)} onTouchMove={(event) => updateRadialHover(object, frame, event)} onPressOut={() => { touchingObjectRef.current = false; releaseRadialGesture(); }} delayLongPress={420} style={{ position: 'absolute', ...frame, borderRadius: hit / 2 }} />;
      })}

      <RadialMenu menu={radialMenu} object={radialObject} onAction={executeRadialAction} onClose={() => { radialGestureRef.current = { active: false, hovered: null, objectId: null }; setRadialMenu(null); }} />

      {networkDraft ? <View style={{ position: 'absolute', left: 12, right: 12, top: 10, backgroundColor: '#16384BEE', borderRadius: 12, borderWidth: 1, borderColor: CYAN, padding: 10, flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>Réseau {networkLabel(networkDraft.typeCode)} · DN{networkDraft.diameterMm}</Text><Text style={{ color: '#C5E9F8', fontSize: 11 }}>Départ : {networkDraft.start.label}. Touchez l'équipement d'arrivée.</Text></View><TinyButton label="Annuler" onPress={() => setNetworkDraft(null)} /></View> : null}

      {moveMode && selected ? <View style={{ position: 'absolute', top: 10, right: 12, padding: 9, borderRadius: 12, backgroundColor: '#132C3BEE', borderWidth: 1, borderColor: AXIS[axis], minWidth: 170 }}>
        <Text style={{ color: WHITE, fontWeight: '900', fontSize: 11 }}>Déplacement {axis} uniquement</Text>
        <TouchableOpacity onPress={openExactPosition} style={{ paddingVertical: 5 }}><Text style={{ color: AXIS[axis], fontSize: 18, fontWeight: '900' }}>{axis} : {num(selected[axis.toLowerCase()]).toFixed(2)} m ✎</Text></TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 5 }}><TinyButton label="− pas" onPress={() => moveByStep(-1)} /><TinyButton label="+ pas" onPress={() => moveByStep(1)} /><TinyButton label="Terminer" onPress={() => setMoveMode(false)} /></View>
      </View> : null}

      {!selected && !selectedNetwork && !radialMenu && !networkDraft ? <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 10, right: 12, alignItems: 'center' }}><Text style={{ color: '#A9C6D4', fontSize: 10, backgroundColor: '#081823CC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>1 doigt sur le vide : orbite · 2 doigts : déplacer · pincer : zoom · double tap : cadrer</Text></View> : null}
    </View>

    <View style={{ backgroundColor: PANEL, borderTopWidth: 1, borderTopColor: '#284657', padding: 9 }}>
      {!selected && !selectedNetwork ? <View style={{ flexDirection: 'row', gap: 7 }}><TinyButton flex label={`Équipements du site${unplaced.length ? ` (${unplaced.length})` : ''}`} onPress={() => setEquipmentModal(true)} /><TinyButton flex label="+ Nouvel équipement" onPress={() => setNewEquipmentModal(true)} /></View> : selected ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{selected.label}</Text><Text style={{ color: MUTED, fontSize: 10 }}>X {num(selected.x).toFixed(2)} · Y {num(selected.y).toFixed(2)} · Z {num(selected.z).toFixed(2)} m · appui long = roue d'actions</Text></View><TinyButton label="Actions" active onPress={() => { const center = project({ x: selected.x, y: selected.y, z: num(selected.z) + num(selected.height) * 0.5 }, viewport, camera); openRadialMenu(selected, center); radialGestureRef.current.active = false; }} /><TouchableOpacity onPress={() => { setSelectedId(null); setMoveMode(false); setRadialMenu(null); }}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View> : <><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{networkLabel(selectedNetwork.type_code)}</Text><Text style={{ color: MUTED, fontSize: 10 }}>DN{selectedNetwork.diameter_mm || '-'} · tracé orthogonal entre équipements</Text></View><TouchableOpacity onPress={() => setSelectedNetworkId(null)}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={Number(selectedNetwork.diameter_mm) === dn} onPress={() => changeNetworkDn(dn)} />)}<TinyButton danger label="Supprimer réseau" onPress={deleteNetwork} /></ScrollView></>}
    </View>

    <Modal visible={equipmentModal} transparent animationType="slide" onRequestClose={() => setEquipmentModal(false)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ maxHeight: '78%', backgroundColor: PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Équipements du site</Text><Text style={{ color: MUTED, marginTop: 3, marginBottom: 12 }}>La maquette utilise le patrimoine permanent du site. Un équipement retiré de la 3D reste dans le patrimoine.</Text><ScrollView>{unplaced.length ? unplaced.map((equipment) => <TouchableOpacity key={equipment.id} onPress={() => placeEquipment(equipment)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{equipment.visualProfile?.icon} {equipment.designation || equipment.visualProfile?.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{[equipment.marque, equipment.modele].filter(Boolean).join(' · ') || 'Modèle générique paramétrique'} · {equipment.visualProfile?.source === 'generic' ? 'fallback 3D générique' : 'profil 3D reconnu'}</Text></TouchableOpacity>) : <Text style={{ color: MUTED, paddingVertical: 20 }}>Tous les équipements actifs du site sont déjà placés.</Text>}</ScrollView><TinyButton label="Fermer" onPress={() => setEquipmentModal(false)} /></View></View></Modal>

    <Modal visible={newEquipmentModal} transparent animationType="slide" onRequestClose={() => setNewEquipmentModal(false)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ maxHeight: '82%', backgroundColor: PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Ajouter depuis la 3D</Text><Text style={{ color: MUTED, marginTop: 3, marginBottom: 12 }}>L'équipement sera immédiatement ajouté au patrimoine permanent du site puis placé dans la maquette.</Text><ScrollView>{LAB3D_EQUIPMENT_PRESETS.map((preset) => <TouchableOpacity key={preset.code} onPress={() => createEquipment(preset)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{preset.icon} {preset.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Base {preset.width} × {preset.depth} × {preset.height} m · dimensions modifiables</Text></TouchableOpacity>)}</ScrollView><TinyButton label="Fermer" onPress={() => setNewEquipmentModal(false)} /></View></View></Modal>

    <Modal visible={dimensionModal} transparent animationType="fade" onRequestClose={() => setDimensionModal(false)}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 18 }}><ScrollView style={{ maxHeight: '90%', backgroundColor: PANEL, borderRadius: 18, padding: 16 }} keyboardShouldPersistTaps="handled"><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', marginBottom: 12 }}>Équipement & dimensions</Text><Field label="Désignation" value={editForm.designation} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, designation: value }))} /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Marque" value={editForm.marque} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, marque: value }))} /></View><View style={{ flex: 1 }}><Field label="Modèle" value={editForm.modele} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, modele: value }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Largeur X (m)" value={editForm.width} onChangeText={(value) => setEditForm((f) => ({ ...f, width: value }))} /></View><View style={{ flex: 1 }}><Field label="Longueur Y (m)" value={editForm.depth} onChangeText={(value) => setEditForm((f) => ({ ...f, depth: value }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={editForm.height} onChangeText={(value) => setEditForm((f) => ({ ...f, height: value }))} /></View></View><Field label="Hauteur par rapport au sol Z (m)" value={editForm.z} onChangeText={(value) => setEditForm((f) => ({ ...f, z: value }))} />{selected?.params?.support?.type === 'masonry' ? <View style={{ marginTop: 5, padding: 12, backgroundColor: '#182C35', borderRadius: 12 }}><Text style={{ color: WHITE, fontWeight: '900', marginBottom: 8 }}>Socle maçonné</Text><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Débord par côté (m)" value={editForm.supportOverhang} onChangeText={(value) => setEditForm((f) => ({ ...f, supportOverhang: value }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur socle (m)" value={editForm.supportHeight} onChangeText={(value) => setEditForm((f) => ({ ...f, supportHeight: value }))} /></View></View></View> : null}<View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 22 }}><TinyButton flex label="Annuler" onPress={() => setDimensionModal(false)} /><TinyButton flex active label="Enregistrer" onPress={saveDimensions} /></View></ScrollView></View></Modal>

    <Modal visible={networkModal} transparent animationType="fade" onRequestClose={() => setNetworkModal(false)}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 18 }}><View style={{ backgroundColor: PANEL, borderRadius: 18, padding: 16, maxHeight: '88%' }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Créer un réseau</Text><Text style={{ color: MUTED, marginTop: 4, marginBottom: 10 }}>Départ : {selected?.label}. Choisis le type et le diamètre, puis touche l'équipement d'arrivée.</Text><Text style={{ color: MUTED, fontWeight: '800', fontSize: 11, marginBottom: 6 }}>TYPE DE RÉSEAU</Text><ScrollView style={{ maxHeight: 250 }}>{LAB3D_NETWORK_TYPES.map((item) => <TouchableOpacity key={item.code} onPress={() => setNetworkType(item.code)} style={{ padding: 10, borderRadius: 9, marginBottom: 5, backgroundColor: networkType === item.code ? '#174B63' : PANEL_2, borderWidth: 1, borderColor: networkType === item.code ? CYAN : '#345567' }}><Text style={{ color: WHITE, fontWeight: '800' }}>{item.label}</Text></TouchableOpacity>)}</ScrollView><Text style={{ color: MUTED, fontWeight: '800', fontSize: 11, marginTop: 10, marginBottom: 6 }}>DIAMÈTRE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={networkDn === dn} onPress={() => setNetworkDn(dn)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TinyButton flex label="Annuler" onPress={() => setNetworkModal(false)} /><TinyButton flex active label="Choisir l'arrivée" onPress={confirmNetworkStart} /></View></View></View></Modal>

    <Modal visible={positionModal} transparent animationType="fade" onRequestClose={() => setPositionModal(false)}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 24 }}><View style={{ backgroundColor: PANEL, borderRadius: 18, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', marginBottom: 12 }}>Position exacte · axe {axis}</Text><Field label={`${axis} (m)`} value={exactValue} onChangeText={setExactValue} /><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setPositionModal(false)} /><TinyButton flex active label="Appliquer" onPress={saveExactPosition} /></View></View></View></Modal>

    <Modal visible={rotationModal} transparent animationType="fade" onRequestClose={() => setRotationModal(false)}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 24 }}><View style={{ backgroundColor: PANEL, borderRadius: 18, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', marginBottom: 12 }}>Rotation exacte</Text><Field label="Angle (°)" value={rotationValue} onChangeText={setRotationValue} /><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setRotationModal(false)} /><TinyButton flex active label="Appliquer" onPress={saveExactRotation} /></View></View></View></Modal>
  </View>;
}
