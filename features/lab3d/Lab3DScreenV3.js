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
import Svg from 'react-native-svg';
import {
  LAB3D_ARCHITECTURE_PRESETS,
  LAB3D_DN,
  LAB3D_EQUIPMENT_PRESETS,
  LAB3D_NETWORK_TYPES,
  LAB3D_OPENING_PRESETS,
  buildAttachedNetworkPoints,
  createArchitectureObject,
  createEquipmentFromLab3d,
  createLab3dNetwork,
  createOpeningOnWall,
  createRectangularRoom,
  getNetworkRouteMeta,
  loadLab3dExtendedSite,
  moveNetworkRoute,
  normalizeAttachedNetwork,
  persistLab3dNetwork,
  persistNetworksForObject,
  persistOpeningsForWall,
  placeExistingEquipment,
  reflowNetworksForObject,
  reflowOpeningsForWall,
  removeLab3dNetwork,
  removeLab3dObject,
  removeLab3dOpening,
  reverseNetworkDirection,
  setMasonryBase,
  updateLab3dEquipmentData,
  updateLab3dNetwork,
  updateLab3dObject,
  upgradeNetworkGeometry,
} from './lab3dExtendedDb.js';
import {
  LAB3D_SKIN_LIBRARY,
  getSkinByKey,
  listSkinsForType,
  resolveEquipmentSkin,
  skinDisplayName,
} from './equipmentSkinLibrary.js';
import {
  ArchitectureLowPoly,
  EquipmentLowPoly,
  LAB3D_RENDER_COLORS,
  MasonryBaseLowPoly,
  NetworkLowPoly,
  ObjectLabel,
  OpeningLowPoly,
  RemarkMarker,
  SceneGrid3D,
  cameraPoint3d,
  project3d,
} from './Lab3DRenderer.js';

const BG = LAB3D_RENDER_COLORS.bg;
const CYAN = LAB3D_RENDER_COLORS.cyan;
const MUTED = '#91A7B5';
const PANEL = '#102331';
const PANEL_2 = '#173244';
const WHITE = '#F5FBFF';
const RED = '#FF5D63';
const AXIS = { X: LAB3D_RENDER_COLORS.axisX, Y: LAB3D_RENDER_COLORS.axisY, Z: LAB3D_RENDER_COLORS.axisZ };
const DEFAULT_CAMERA = { zoom: 52, offsetX: 0, offsetY: 0, yaw: 45, pitch: 30, targetX: 0, targetY: 0, targetZ: 0 };
const RADIAL_RADIUS = 80;
const NETWORK_COLORS = {
  chauffage_depart: '#EF635F', chauffage_retour: '#4E8FE6', ecs: '#F39A4A', efs: '#51B7E8',
  bouclage_ecs: '#D98B55', gaz: '#F0D95C', condensats: '#A8C4D0', fioul: '#8E8070', autre: '#B6C8D0',
};

const n = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snap = (value, step) => Math.round(value / step) * step;
const angleDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const haptic = (duration = 8) => { try { Vibration.vibrate(duration); } catch (_) {} };

function TinyButton({ label, onPress, active = false, danger = false, disabled = false, flex = false }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{
    minHeight: 40, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: danger ? '#93484B' : active ? CYAN : '#345567',
    backgroundColor: active ? '#174B63' : danger ? '#3A2025' : PANEL_2,
    opacity: disabled ? 0.42 : 1, alignItems: 'center', justifyContent: 'center', flex: flex ? 1 : undefined,
  }}><Text style={{ color: danger ? '#FF9A9E' : WHITE, fontWeight: '800', fontSize: 12 }}>{label}</Text></TouchableOpacity>;
}

function Field({ label, value, onChangeText, keyboardType = 'decimal-pad', placeholder = '' }) {
  return <View style={{ marginBottom: 10 }}><Text style={{ color: MUTED, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>{label}</Text><TextInput value={String(value ?? '')} placeholder={placeholder} placeholderTextColor="#607784" onChangeText={onChangeText} keyboardType={keyboardType} style={{ backgroundColor: '#0B1A25', color: WHITE, borderRadius: 9, borderWidth: 1, borderColor: '#355568', paddingHorizontal: 11, minHeight: 42 }} /></View>;
}

function Sheet({ visible, title, subtitle = null, onClose, children, maxHeight = '86%' }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}><View style={{ maxHeight, backgroundColor: PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: subtitle ? 3 : 12 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', flex: 1 }}>{title}</Text><TouchableOpacity onPress={onClose}><Text style={{ color: MUTED, fontSize: 24 }}>×</Text></TouchableOpacity></View>{subtitle ? <Text style={{ color: MUTED, marginBottom: 12 }}>{subtitle}</Text> : null}{children}</View></View></Modal>;
}

function ModalCard({ visible, title, onClose, children }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 18 }}><View style={{ backgroundColor: PANEL, borderRadius: 18, padding: 16, maxHeight: '90%' }}><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', flex: 1 }}>{title}</Text><TouchableOpacity onPress={onClose}><Text style={{ color: MUTED, fontSize: 24 }}>×</Text></TouchableOpacity></View>{children}</View></View></Modal>;
}

const ACTION_SETS = {
  equipment: [
    { key: 'move', label: 'Déplacer', icon: '✥', angle: -90 },
    { key: 'rotate', label: 'Tourner', icon: '↻', angle: -30 },
    { key: 'dimensions', label: 'Dimensions', icon: '↔', angle: 30 },
    { key: 'network', label: 'Réseau', icon: '⌁', angle: 90 },
    { key: 'base', label: 'Socle', icon: '▰', angle: 150 },
    { key: 'more', label: 'Plus', icon: '•••', angle: 210 },
  ],
  wall: [
    { key: 'move', label: 'Déplacer', icon: '✥', angle: -90 },
    { key: 'rotate', label: 'Tourner', icon: '↻', angle: -30 },
    { key: 'dimensions', label: 'Dimensions', icon: '↔', angle: 30 },
    { key: 'opening', label: 'Ouverture', icon: '▯', angle: 90 },
    { key: 'focus', label: 'Cadrer', icon: '◎', angle: 150 },
    { key: 'more', label: 'Plus', icon: '•••', angle: 210 },
  ],
  architecture: [
    { key: 'move', label: 'Déplacer', icon: '✥', angle: -90 },
    { key: 'rotate', label: 'Tourner', icon: '↻', angle: -30 },
    { key: 'dimensions', label: 'Dimensions', icon: '↔', angle: 30 },
    { key: 'focus', label: 'Cadrer', icon: '◎', angle: 90 },
    { key: 'more', label: 'Plus', icon: '•••', angle: 180 },
  ],
  network: [
    { key: 'move', label: 'Déplacer', icon: '✥', angle: -90 },
    { key: 'dn', label: 'DN', icon: 'Ø', angle: -30 },
    { key: 'direction', label: 'Sens', icon: '⇄', angle: 30 },
    { key: 'type', label: 'Type', icon: '≈', angle: 90 },
    { key: 'route', label: 'Tracé', icon: '⌁', angle: 150 },
    { key: 'more', label: 'Plus', icon: '•••', angle: 210 },
  ],
  opening: [
    { key: 'editOpening', label: 'Dimensions', icon: '↔', angle: -90 },
    { key: 'deleteOpening', label: 'Supprimer', icon: '×', angle: 90, danger: true },
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
  equipmentMore: [
    { key: 'skin', label: 'Skin 3D', icon: '◈', angle: -135 },
    { key: 'info', label: 'Infos', icon: 'i', angle: -45 },
    { key: 'focus', label: 'Cadrer', icon: '◎', angle: 45 },
    { key: 'deleteObject', label: 'Retirer', icon: '×', angle: 135, danger: true },
  ],
  objectMore: [
    { key: 'focus', label: 'Cadrer', icon: '◎', angle: -90 },
    { key: 'deleteObject', label: 'Supprimer', icon: '×', angle: 90, danger: true },
  ],
  networkMore: [
    { key: 'focusNetwork', label: 'Cadrer', icon: '◎', angle: -90 },
    { key: 'deleteNetwork', label: 'Supprimer', icon: '×', angle: 90, danger: true },
  ],
};

function RadialMenu({ menu, entityLabel, onAction, onClose }) {
  if (!menu) return null;
  const actions = ACTION_SETS[menu.mode] || ACTION_SETS.equipment;
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: menu.x - 116, top: menu.y - 116, width: 232, height: 232 }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 43, top: 43, width: 146, height: 146, borderRadius: 73, backgroundColor: '#06111ADC', borderWidth: 1, borderColor: '#31576C' }} />
    {actions.map((action) => {
      const rad = action.angle * Math.PI / 180;
      const left = 116 + Math.cos(rad) * RADIAL_RADIUS - 29;
      const top = 116 + Math.sin(rad) * RADIAL_RADIUS - 29;
      const hovered = menu.hovered === action.key;
      return <TouchableOpacity key={action.key} onPress={() => onAction(action.key)} style={{ position: 'absolute', left, top, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: hovered ? 2 : 1, borderColor: action.danger ? '#FF7A80' : hovered ? CYAN : '#477186', backgroundColor: action.danger ? '#53252B' : hovered ? '#16617D' : '#143143', transform: [{ scale: hovered ? 1.11 : 1 }] }}><Text style={{ color: action.danger ? '#FFB0B4' : WHITE, fontWeight: '900', fontSize: action.icon.length > 2 ? 11 : 19 }}>{action.icon}</Text><Text numberOfLines={1} style={{ color: action.danger ? '#FFB0B4' : '#D8EEF8', fontSize: 8, fontWeight: '800', marginTop: 1 }}>{action.label}</Text></TouchableOpacity>;
    })}
    <TouchableOpacity onPress={onClose} style={{ position: 'absolute', left: 85, top: 85, width: 62, height: 62, borderRadius: 31, backgroundColor: '#0B202D', borderWidth: 2, borderColor: CYAN, alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={2} style={{ color: WHITE, fontWeight: '900', fontSize: 10, textAlign: 'center', maxWidth: 52 }}>{String(entityLabel || 'Actions').slice(0, 15)}</Text><Text style={{ color: MUTED, fontSize: 10 }}>×</Text></TouchableOpacity>
  </View>;
}

function networkLabel(typeCode) {
  return LAB3D_NETWORK_TYPES.find((item) => item.code === typeCode)?.label || typeCode || 'Réseau';
}

export function Lab3DScreen({ route, navigation }) {
  const requestedSiteId = route?.params?.siteId || null;
  const requestedVisitId = route?.params?.visiteId || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [objects, setObjects] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [openings, setOpenings] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState(null);
  const [axis, setAxis] = useState('X');
  const [objectMoveMode, setObjectMoveMode] = useState(false);
  const [networkMoveMode, setNetworkMoveMode] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: 520 });
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  const [radialMenu, setRadialMenu] = useState(null);

  const [equipmentModal, setEquipmentModal] = useState(false);
  const [libraryModal, setLibraryModal] = useState(false);
  const [architectureModal, setArchitectureModal] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [dimensionModal, setDimensionModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [rotationModal, setRotationModal] = useState(false);
  const [skinModal, setSkinModal] = useState(false);
  const [networkCreateModal, setNetworkCreateModal] = useState(false);
  const [networkDnModal, setNetworkDnModal] = useState(false);
  const [networkTypeModal, setNetworkTypeModal] = useState(false);
  const [networkRouteModal, setNetworkRouteModal] = useState(false);
  const [openingModal, setOpeningModal] = useState(false);
  const [openingEditModal, setOpeningEditModal] = useState(false);

  const [networkDraft, setNetworkDraft] = useState(null);
  const [networkType, setNetworkType] = useState('chauffage_depart');
  const [networkDn, setNetworkDn] = useState(50);
  const [editForm, setEditForm] = useState({});
  const [exactValue, setExactValue] = useState('0');
  const [rotationValue, setRotationValue] = useState('0');
  const [roomForm, setRoomForm] = useState({ width: '5', depth: '4', height: '2.6', thickness: '0.18' });
  const [openingForm, setOpeningForm] = useState({ kind: 'door', width: '0.9', height: '2.05', sill: '0', offset: '0' });
  const [networkRouteForm, setNetworkRouteForm] = useState({ offsetX: '0', offsetY: '0', elevation: '2' });

  const sceneRef = useRef(null);
  const sceneFrameRef = useRef({ x: 0, y: 0, width: 800, height: 520 });
  const latestObjects = useRef(objects);
  const latestNetworks = useRef(networks);
  const latestOpenings = useRef(openings);
  const latestCamera = useRef(camera);
  const touchingEntityRef = useRef(false);
  const radialGestureRef = useRef({ active: false, entityType: null, entityId: null, hovered: null });
  const suppressTapRef = useRef(null);
  const objectDragRef = useRef(null);
  const networkDragRef = useRef(null);
  const cameraGestureRef = useRef(null);
  const inertiaFrameRef = useRef(null);
  const lastObjectTapRef = useRef({ id: null, at: 0 });
  const lastEmptyTapRef = useRef(0);

  latestObjects.current = objects;
  latestNetworks.current = networks;
  latestOpenings.current = openings;
  latestCamera.current = camera;

  const reload = useCallback(async ({ keepSelection = true } = {}) => {
    try {
      setError(null);
      const loaded = await loadLab3dExtendedSite({ siteId: requestedSiteId, visiteId: requestedVisitId });
      const upgradedNetworks = await upgradeNetworkGeometry(loaded.scene.id, loaded.objects || []);
      setData(loaded);
      setObjects(loaded.objects || []);
      setNetworks(upgradedNetworks || loaded.networks || []);
      setOpenings(loaded.openings || []);
      if (!keepSelection) {
        setSelectedObjectId(null); setSelectedNetworkId(null); setSelectedOpeningId(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [requestedSiteId, requestedVisitId]);

  useEffect(() => { reload({ keepSelection: false }); }, [reload]);
  useEffect(() => () => { if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current); }, []);

  const selectedObject = useMemo(() => objects.find((item) => item.id === selectedObjectId) || null, [objects, selectedObjectId]);
  const selectedNetwork = useMemo(() => networks.find((item) => item.id === selectedNetworkId) || null, [networks, selectedNetworkId]);
  const selectedOpening = useMemo(() => openings.find((item) => item.id === selectedOpeningId) || null, [openings, selectedOpeningId]);
  const equipmentMap = useMemo(() => new Map((data?.equipments || []).map((item) => [item.id, item])), [data?.equipments]);
  const selectedEquipment = selectedObject?.equipment_id ? equipmentMap.get(selectedObject.equipment_id) || null : null;
  const selectedSkin = selectedObject?.kind === 'equipment' ? resolveEquipmentSkin(selectedEquipment || {}, selectedObject) : null;

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = null;
  }, []);

  const startInertia = useCallback((yawVelocity, pitchVelocity) => {
    stopInertia();
    let vy = yawVelocity;
    let vp = pitchVelocity;
    const tick = () => {
      vy *= 0.90; vp *= 0.90;
      if (Math.abs(vy) < 0.025 && Math.abs(vp) < 0.025) { inertiaFrameRef.current = null; return; }
      setCamera((current) => ({ ...current, yaw: current.yaw + vy, pitch: clamp(current.pitch + vp, 8, 82) }));
      inertiaFrameRef.current = requestAnimationFrame(tick);
    };
    inertiaFrameRef.current = requestAnimationFrame(tick);
  }, [stopInertia]);

  const measureScene = useCallback(() => {
    sceneRef.current?.measureInWindow?.((x, y, width, height) => { sceneFrameRef.current = { x, y, width, height }; });
  }, []);

  const fitScene = useCallback((preset = 'iso') => {
    const currentObjects = latestObjects.current;
    const yaw = preset === 'top' ? 0 : 45;
    const pitch = preset === 'top' ? 88 : 30;
    if (!currentObjects.length) { setCamera({ ...DEFAULT_CAMERA, yaw, pitch }); return; }
    const minX = Math.min(...currentObjects.map((item) => n(item.x) - n(item.width, 1) / 2));
    const maxX = Math.max(...currentObjects.map((item) => n(item.x) + n(item.width, 1) / 2));
    const minY = Math.min(...currentObjects.map((item) => n(item.y) - n(item.depth, 1) / 2));
    const maxY = Math.max(...currentObjects.map((item) => n(item.y) + n(item.depth, 1) / 2));
    const maxZ = Math.max(...currentObjects.map((item) => n(item.z) + n(item.height, 1)), 1);
    const span = Math.max(maxX - minX + 1.2, maxY - minY + 1.2, maxZ + 1.0, 3);
    const scale = clamp(Math.min(viewport.width / (span * 1.55), viewport.height / (span * 1.15)), 20, 76);
    setCamera({ zoom: scale, offsetX: 0, offsetY: 0, yaw, pitch, targetX: (minX + maxX) / 2, targetY: (minY + maxY) / 2, targetZ: maxZ * 0.30 });
  }, [viewport.height, viewport.width]);

  const focusObject = useCallback((object) => {
    if (!object) return;
    stopInertia();
    setCamera((current) => ({ ...current, targetX: n(object.x), targetY: n(object.y), targetZ: n(object.z) + n(object.height, 1) * 0.45, offsetX: 0, offsetY: 0, zoom: clamp(Math.max(current.zoom, 64), 28, 96) }));
    haptic(9);
  }, [stopInertia]);

  const focusNetwork = useCallback((network) => {
    if (!network?.points?.length) return;
    const xs = network.points.map((p) => n(p.x)); const ys = network.points.map((p) => n(p.y)); const zs = network.points.map((p) => n(p.z));
    setCamera((current) => ({ ...current, targetX: (Math.min(...xs) + Math.max(...xs)) / 2, targetY: (Math.min(...ys) + Math.max(...ys)) / 2, targetZ: (Math.min(...zs) + Math.max(...zs)) / 2, offsetX: 0, offsetY: 0, zoom: clamp(Math.max(current.zoom, 62), 28, 96) }));
    haptic(9);
  }, []);

  const previewObjectPatch = useCallback((objectId, patch) => {
    const currentObjects = latestObjects.current;
    const nextObjects = currentObjects.map((item) => item.id === objectId ? { ...item, ...patch } : item);
    const moved = nextObjects.find((item) => item.id === objectId);
    let nextNetworks = latestNetworks.current;
    let nextOpenings = latestOpenings.current;
    if (moved?.kind === 'equipment') nextNetworks = reflowNetworksForObject(nextNetworks, nextObjects, objectId);
    if (moved?.kind === 'architecture' && moved.subtype === 'wall') nextOpenings = reflowOpeningsForWall(nextOpenings, moved);
    latestObjects.current = nextObjects; latestNetworks.current = nextNetworks; latestOpenings.current = nextOpenings;
    setObjects(nextObjects); setNetworks(nextNetworks); setOpenings(nextOpenings);
    return { object: moved, networks: nextNetworks, openings: nextOpenings };
  }, []);

  const persistObjectAndAttachments = useCallback(async (objectId) => {
    const object = latestObjects.current.find((item) => item.id === objectId);
    if (!object) return;
    await updateLab3dObject(object.id, { x: object.x, y: object.y, z: object.z, width: object.width, depth: object.depth, height: object.height, rotation_deg: object.rotation_deg, params: object.params });
    if (object.kind === 'equipment') await persistNetworksForObject(latestNetworks.current, object.id);
    if (object.kind === 'architecture' && object.subtype === 'wall') await persistOpeningsForWall(latestOpenings.current, object.id);
  }, []);

  const applyCameraMulti = useCallback((touches, state) => {
    const a = touches[0]; const b = touches[1];
    const centerX = (a.pageX + b.pageX) / 2; const centerY = (a.pageY + b.pageY) / 2;
    const distance = Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY));
    const ratio = distance / state.distance;
    setCamera((current) => ({ ...current, zoom: clamp(state.start.zoom * ratio, 20, 112), offsetX: state.start.offsetX + centerX - state.centerX, offsetY: state.start.offsetY + centerY - state.centerY }));
  }, []);

  const interactionPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) return true;
      return Boolean((objectMoveMode && selectedObjectId) || (networkMoveMode && selectedNetworkId));
    },
    onMoveShouldSetPanResponder: (event, gesture) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) return true;
      if ((objectMoveMode && selectedObjectId) || (networkMoveMode && selectedNetworkId)) return Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1;
      if (touchingEntityRef.current || radialMenu) return false;
      return Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4;
    },
    onPanResponderGrant: (event) => {
      stopInertia();
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        const a = touches[0]; const b = touches[1];
        cameraGestureRef.current = { mode: 'multi', start: { ...latestCamera.current }, centerX: (a.pageX + b.pageX) / 2, centerY: (a.pageY + b.pageY) / 2, distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) };
        return;
      }
      if (objectMoveMode && selectedObjectId) {
        const object = latestObjects.current.find((item) => item.id === selectedObjectId);
        if (object) objectDragRef.current = { object: { ...object }, startValue: n(object[axis.toLowerCase()]) };
        return;
      }
      if (networkMoveMode && selectedNetworkId) {
        const network = latestNetworks.current.find((item) => item.id === selectedNetworkId);
        if (network) networkDragRef.current = { network: JSON.parse(JSON.stringify(network)) };
        return;
      }
      cameraGestureRef.current = { mode: 'orbit', start: { ...latestCamera.current }, lastDx: 0, lastDy: 0, lastAt: Date.now(), velocityYaw: 0, velocityPitch: 0 };
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches || [];
      if (touches.length >= 2) {
        let state = cameraGestureRef.current;
        const a = touches[0]; const b = touches[1];
        if (!state || state.mode !== 'multi') state = cameraGestureRef.current = { mode: 'multi', start: { ...latestCamera.current }, centerX: (a.pageX + b.pageX) / 2, centerY: (a.pageY + b.pageY) / 2, distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) };
        applyCameraMulti(touches, state); return;
      }
      if (objectDragRef.current && objectMoveMode) {
        const start = objectDragRef.current.object;
        const key = axis.toLowerCase();
        const origin = { x: n(start.x), y: n(start.y), z: n(start.z) };
        const unit = { ...origin, [key]: n(origin[key]) + 1 };
        const a = project3d(origin, viewport, latestCamera.current); const b = project3d(unit, viewport, latestCamera.current);
        const vx = b.x - a.x; const vy = b.y - a.y; const len2 = Math.max(1, vx * vx + vy * vy);
        const worldDelta = (gesture.dx * vx + gesture.dy * vy) / len2;
        const step = n(data?.scene?.grid_step, 0.25);
        let value = snap(objectDragRef.current.startValue + worldDelta, step);
        if (axis === 'Z') value = Math.max(0, value);
        previewObjectPatch(start.id, { [key]: value });
        return;
      }
      if (networkDragRef.current && networkMoveMode) {
        const start = networkDragRef.current.network;
        const origin = { x: 0, y: 0, z: 0 }; const key = axis.toLowerCase(); const unit = { ...origin, [key]: 1 };
        const a = project3d(origin, viewport, latestCamera.current); const b = project3d(unit, viewport, latestCamera.current);
        const vx = b.x - a.x; const vy = b.y - a.y; const len2 = Math.max(1, vx * vx + vy * vy);
        const worldDelta = (gesture.dx * vx + gesture.dy * vy) / len2;
        const step = n(data?.scene?.grid_step, 0.25);
        const delta = snap(worldDelta, step);
        const moved = moveNetworkRoute(start, latestObjects.current, axis, delta);
        latestNetworks.current = latestNetworks.current.map((item) => item.id === start.id ? moved : item);
        setNetworks(latestNetworks.current);
        return;
      }
      const state = cameraGestureRef.current;
      if (!state || state.mode !== 'orbit') return;
      const now = Date.now(); const dt = Math.max(16, now - state.lastAt);
      const dxStep = gesture.dx - state.lastDx; const dyStep = gesture.dy - state.lastDy;
      state.velocityYaw = dxStep * 0.35 * (16 / dt); state.velocityPitch = -dyStep * 0.25 * (16 / dt);
      state.lastDx = gesture.dx; state.lastDy = gesture.dy; state.lastAt = now;
      setCamera((current) => ({ ...current, yaw: state.start.yaw + gesture.dx * 0.35, pitch: clamp(state.start.pitch - gesture.dy * 0.25, 8, 82) }));
    },
    onPanResponderRelease: async () => {
      const cameraState = cameraGestureRef.current;
      cameraGestureRef.current = null;
      if (objectDragRef.current) {
        const id = objectDragRef.current.object.id; objectDragRef.current = null; setObjectMoveMode(false);
        try { await persistObjectAndAttachments(id); haptic(9); } catch (err) { Alert.alert('Déplacement', String(err.message || err)); }
        return;
      }
      if (networkDragRef.current) {
        const id = networkDragRef.current.network.id; networkDragRef.current = null; setNetworkMoveMode(false);
        const network = latestNetworks.current.find((item) => item.id === id);
        try { await persistLab3dNetwork(network); haptic(9); } catch (err) { Alert.alert('Réseau', String(err.message || err)); }
        return;
      }
      if (cameraState?.mode === 'orbit') startInertia(cameraState.velocityYaw || 0, cameraState.velocityPitch || 0);
    },
    onPanResponderTerminate: () => { objectDragRef.current = null; networkDragRef.current = null; cameraGestureRef.current = null; setObjectMoveMode(false); setNetworkMoveMode(false); },
  }), [applyCameraMulti, axis, data?.scene?.grid_step, networkMoveMode, objectMoveMode, persistObjectAndAttachments, previewObjectPatch, radialMenu, selectedNetworkId, selectedObjectId, startInertia, stopInertia, viewport]);

  const selectObject = useCallback(async (object) => {
    setSelectedNetworkId(null); setSelectedOpeningId(null); setRadialMenu(null);
    if (networkDraft && object.kind === 'equipment' && object.id !== networkDraft.start.id) {
      try {
        const createdRaw = await createLab3dNetwork(data.scene.id, { typeCode: networkDraft.typeCode, diameterMm: networkDraft.diameterMm, start: networkDraft.start, end: object });
        const created = normalizeAttachedNetwork(createdRaw, latestObjects.current);
        await persistLab3dNetwork(created);
        latestNetworks.current = [...latestNetworks.current, created]; setNetworks(latestNetworks.current);
        setNetworkDraft(null); setSelectedObjectId(object.id); haptic(12);
      } catch (err) { Alert.alert('Réseau', String(err.message || err)); }
      return;
    }
    setSelectedObjectId(object.id);
  }, [data?.scene?.id, networkDraft]);

  const handleObjectTap = useCallback((object) => {
    touchingEntityRef.current = false;
    if (suppressTapRef.current === `object:${object.id}`) { suppressTapRef.current = null; return; }
    const now = Date.now();
    if (lastObjectTapRef.current.id === object.id && now - lastObjectTapRef.current.at < 320) {
      lastObjectTapRef.current = { id: null, at: 0 }; selectObject(object); focusObject(object); return;
    }
    lastObjectTapRef.current = { id: object.id, at: now }; selectObject(object);
  }, [focusObject, selectObject]);

  const handleEmptyPress = useCallback(() => {
    const now = Date.now();
    setRadialMenu(null); setObjectMoveMode(false); setNetworkMoveMode(false); setSelectedObjectId(null); setSelectedNetworkId(null); setSelectedOpeningId(null);
    if (now - lastEmptyTapRef.current < 320) { lastEmptyTapRef.current = 0; fitScene('iso'); haptic(8); }
    else lastEmptyTapRef.current = now;
  }, [fitScene]);

  const radialActionsFor = useCallback((entityType, entityId, mode = null) => {
    if (mode) return ACTION_SETS[mode] || [];
    if (entityType === 'network') return ACTION_SETS.network;
    if (entityType === 'opening') return ACTION_SETS.opening;
    const object = latestObjects.current.find((item) => item.id === entityId);
    if (object?.kind === 'equipment') return ACTION_SETS.equipment;
    if (object?.subtype === 'wall') return ACTION_SETS.wall;
    return ACTION_SETS.architecture;
  }, []);

  const modeForEntity = useCallback((entityType, entityId) => {
    if (entityType === 'network') return 'network';
    if (entityType === 'opening') return 'opening';
    const object = latestObjects.current.find((item) => item.id === entityId);
    if (object?.kind === 'equipment') return 'equipment';
    if (object?.subtype === 'wall') return 'wall';
    return 'architecture';
  }, []);

  const openRadial = useCallback((entityType, entityId, event, fallbackLocal = null) => {
    measureScene();
    const frame = sceneFrameRef.current;
    const native = event?.nativeEvent || {};
    const touch = native.touches?.[0] || native.changedTouches?.[0] || native;
    let pageX = n(touch.pageX, NaN); let pageY = n(touch.pageY, NaN);
    if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) {
      pageX = frame.x + n(fallbackLocal?.x, viewport.width / 2); pageY = frame.y + n(fallbackLocal?.y, viewport.height / 2);
    }
    const localX = clamp(pageX - frame.x, 116, Math.max(116, viewport.width - 116));
    const localY = clamp(pageY - frame.y, 116, Math.max(116, viewport.height - 116));
    const centerPageX = frame.x + localX; const centerPageY = frame.y + localY;
    const mode = modeForEntity(entityType, entityId);
    radialGestureRef.current = { active: true, entityType, entityId, hovered: null, centerPageX, centerPageY };
    if (entityType === 'object') { setSelectedObjectId(entityId); setSelectedNetworkId(null); setSelectedOpeningId(null); }
    if (entityType === 'network') { setSelectedNetworkId(entityId); setSelectedObjectId(null); setSelectedOpeningId(null); }
    if (entityType === 'opening') { setSelectedOpeningId(entityId); setSelectedObjectId(null); setSelectedNetworkId(null); }
    setObjectMoveMode(false); setNetworkMoveMode(false);
    setRadialMenu({ entityType, entityId, x: localX, y: localY, mode, hovered: null });
    suppressTapRef.current = `${entityType}:${entityId}`;
    haptic(11);
  }, [measureScene, modeForEntity, viewport.height, viewport.width]);

  const updateRadialFromTouch = useCallback((entityType, entityId, event) => {
    const gesture = radialGestureRef.current;
    if (!gesture.active || gesture.entityType !== entityType || gesture.entityId !== entityId) return;
    const native = event.nativeEvent || {};
    const touch = native.touches?.[0] || native.changedTouches?.[0] || native;
    const pageX = n(touch.pageX, NaN); const pageY = n(touch.pageY, NaN);
    if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) return;
    const dx = pageX - gesture.centerPageX; const dy = pageY - gesture.centerPageY;
    const radius = Math.hypot(dx, dy);
    let hovered = null;
    if (radius > 28) {
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const menuMode = radialMenu?.mode || modeForEntity(entityType, entityId);
      const actions = radialActionsFor(entityType, entityId, menuMode);
      hovered = actions.reduce((best, action) => !best || angleDistance(angle, action.angle) < angleDistance(angle, best.angle) ? action : best, null)?.key || null;
    }
    if (gesture.hovered !== hovered) {
      gesture.hovered = hovered; if (hovered) haptic(3);
      setRadialMenu((menu) => menu && menu.entityType === entityType && menu.entityId === entityId ? { ...menu, hovered } : menu);
    }
  }, [modeForEntity, radialActionsFor, radialMenu?.mode]);

  const setRadialSubmenu = (mode) => {
    setRadialMenu((menu) => menu ? { ...menu, mode, hovered: null } : menu);
    radialGestureRef.current.hovered = null;
  };

  const openObjectDimensions = useCallback((object) => {
    if (!object) return;
    const equipment = object.equipment_id ? equipmentMap.get(object.equipment_id) : null;
    setSelectedObjectId(object.id);
    setEditForm({ width: object.width, depth: object.depth, height: object.height, z: object.z, label: object.label || '', designation: equipment?.designation || object.label || '', marque: equipment?.marque || '', modele: equipment?.modele || '', supportHeight: object.params?.support?.height ?? 0.10, supportOverhang: object.params?.support?.overhang ?? 0.05 });
    setDimensionModal(true);
  }, [equipmentMap]);

  const rotateObject = useCallback(async (object, direction) => {
    if (!object) return;
    const rotation_deg = ((n(object.rotation_deg) + direction * 90) % 360 + 360) % 360;
    previewObjectPatch(object.id, { rotation_deg }); await persistObjectAndAttachments(object.id); haptic(9);
  }, [persistObjectAndAttachments, previewObjectPatch]);

  const deleteObject = useCallback((object) => {
    if (!object) return;
    const isEquipment = object.kind === 'equipment';
    Alert.alert(isEquipment ? 'Retirer de la maquette ?' : 'Supprimer cet élément ?', isEquipment ? "L'équipement reste enregistré dans le patrimoine du site." : 'Cet élément de la maquette sera supprimé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: isEquipment ? 'Retirer de la 3D' : 'Supprimer', style: 'destructive', onPress: async () => {
        if (object.subtype === 'wall') {
          const attached = latestOpenings.current.filter((opening) => opening.wall_id === object.id);
          for (const opening of attached) await removeLab3dOpening(opening.id);
        }
        await removeLab3dObject(object.id); setSelectedObjectId(null); setRadialMenu(null); await reload({ keepSelection: false });
      } },
    ]);
  }, [reload]);

  const deleteNetwork = useCallback((network) => {
    if (!network) return;
    Alert.alert('Supprimer ce réseau ?', `${networkLabel(network.type_code)} · DN${network.diameter_mm || '-'}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await removeLab3dNetwork(network.id); setSelectedNetworkId(null); setRadialMenu(null); await reload(); } },
    ]);
  }, [reload]);

  const executeRadialAction = useCallback(async (entityType, entityId, key) => {
    if (key === 'move') { setRadialSubmenu('axis'); return; }
    if (key === 'rotate') { setRadialSubmenu('rotate'); return; }
    if (key === 'more') {
      if (entityType === 'network') setRadialSubmenu('networkMore');
      else {
        const object = latestObjects.current.find((item) => item.id === entityId);
        setRadialSubmenu(object?.kind === 'equipment' ? 'equipmentMore' : 'objectMore');
      }
      return;
    }
    if (entityType === 'object') {
      const object = latestObjects.current.find((item) => item.id === entityId);
      if (!object) { setRadialMenu(null); return; }
      if (key === 'axisX' || key === 'axisY' || key === 'axisZ') { setSelectedObjectId(entityId); setAxis(key.slice(-1)); setObjectMoveMode(true); setNetworkMoveMode(false); setRadialMenu(null); haptic(9); return; }
      if (key === 'rotateLeft') { setRadialMenu(null); await rotateObject(object, -1); return; }
      if (key === 'rotateRight') { setRadialMenu(null); await rotateObject(object, 1); return; }
      if (key === 'rotateExact') { setSelectedObjectId(entityId); setRotationValue(String(n(object.rotation_deg).toFixed(0))); setRotationModal(true); setRadialMenu(null); return; }
      if (key === 'dimensions' || key === 'info') { setRadialMenu(null); openObjectDimensions(object); return; }
      if (key === 'network' && object.kind === 'equipment') { setSelectedObjectId(entityId); setNetworkType('chauffage_depart'); setNetworkDn(50); setNetworkCreateModal(true); setRadialMenu(null); return; }
      if (key === 'base' && object.kind === 'equipment') { setRadialMenu(null); await setMasonryBase(object); await reload(); haptic(9); return; }
      if (key === 'skin' && object.kind === 'equipment') { setSelectedObjectId(entityId); setSkinModal(true); setRadialMenu(null); return; }
      if (key === 'opening' && object.subtype === 'wall') { setSelectedObjectId(entityId); setOpeningForm({ kind: 'door', width: '0.9', height: '2.05', sill: '0', offset: '0' }); setOpeningModal(true); setRadialMenu(null); return; }
      if (key === 'focus') { setRadialMenu(null); focusObject(object); return; }
      if (key === 'deleteObject') { setRadialMenu(null); deleteObject(object); return; }
    }
    if (entityType === 'network') {
      const network = latestNetworks.current.find((item) => item.id === entityId);
      if (!network) { setRadialMenu(null); return; }
      if (key === 'axisX' || key === 'axisY' || key === 'axisZ') { setSelectedNetworkId(entityId); setAxis(key.slice(-1)); setNetworkMoveMode(true); setObjectMoveMode(false); setRadialMenu(null); haptic(9); return; }
      if (key === 'dn') { setSelectedNetworkId(entityId); setNetworkDnModal(true); setRadialMenu(null); return; }
      if (key === 'direction') {
        const reversed = reverseNetworkDirection(network); latestNetworks.current = latestNetworks.current.map((item) => item.id === entityId ? reversed : item); setNetworks(latestNetworks.current); await persistLab3dNetwork(reversed); setRadialMenu(null); haptic(10); return;
      }
      if (key === 'type') { setSelectedNetworkId(entityId); setNetworkType(network.type_code || 'autre'); setNetworkTypeModal(true); setRadialMenu(null); return; }
      if (key === 'route') {
        const meta = getNetworkRouteMeta(network, latestObjects.current); setSelectedNetworkId(entityId);
        setNetworkRouteForm({ offsetX: String(meta.offsetX.toFixed(2)), offsetY: String(meta.offsetY.toFixed(2)), elevation: String(meta.elevation.toFixed(2)) });
        setNetworkRouteModal(true); setRadialMenu(null); return;
      }
      if (key === 'focusNetwork') { setRadialMenu(null); focusNetwork(network); return; }
      if (key === 'deleteNetwork') { setRadialMenu(null); deleteNetwork(network); return; }
    }
    if (entityType === 'opening') {
      const opening = latestOpenings.current.find((item) => item.id === entityId);
      if (!opening) return;
      if (key === 'editOpening') { setSelectedOpeningId(entityId); setOpeningForm({ kind: opening.kind, width: String(n(opening.width).toFixed(2)), height: String(n(opening.height).toFixed(2)), sill: String(n(opening.z).toFixed(2)), offset: String(n(opening.params?.offset).toFixed(2)) }); setOpeningEditModal(true); setRadialMenu(null); return; }
      if (key === 'deleteOpening') { setRadialMenu(null); Alert.alert('Supprimer cette ouverture ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await removeLab3dOpening(entityId); setSelectedOpeningId(null); await reload(); } }]); }
    }
  }, [deleteNetwork, deleteObject, focusNetwork, focusObject, openObjectDimensions, reload, rotateObject]);

  const releaseRadial = useCallback((entityType, entityId) => {
    const gesture = radialGestureRef.current;
    radialGestureRef.current = { active: false, entityType: null, entityId: null, hovered: null };
    if (gesture.active && gesture.entityType === entityType && gesture.entityId === entityId && gesture.hovered) executeRadialAction(entityType, entityId, gesture.hovered);
  }, [executeRadialAction]);

  const saveDimensions = async () => {
    const object = latestObjects.current.find((item) => item.id === selectedObjectId);
    if (!object) return;
    const width = Math.max(0.05, n(editForm.width, object.width)); const depth = Math.max(0.05, n(editForm.depth, object.depth)); const height = Math.max(0.05, n(editForm.height, object.height)); const z = object.kind === 'equipment' ? Math.max(0, n(editForm.z, object.z)) : n(editForm.z, object.z);
    let params = object.params || {};
    if (params.support?.type === 'masonry') {
      const overhang = Math.max(0, n(editForm.supportOverhang, 0.05));
      params = { ...params, support: { ...params.support, overhang, height: Math.max(0.02, n(editForm.supportHeight, 0.10)), width: width + overhang * 2, depth: depth + overhang * 2 } };
    }
    const label = object.kind === 'equipment' ? (editForm.designation || object.label) : (editForm.label || object.label);
    previewObjectPatch(object.id, { width, depth, height, z, label, params });
    if (object.equipment_id) await updateLab3dEquipmentData(object.equipment_id, { designation: editForm.designation, marque: editForm.marque, modele: editForm.modele });
    await persistObjectAndAttachments(object.id); setDimensionModal(false); await reload(); haptic(9);
  };

  const saveExactPosition = async () => {
    const object = latestObjects.current.find((item) => item.id === selectedObjectId); if (!object) return;
    const key = axis.toLowerCase(); let value = n(exactValue, object[key]); if (axis === 'Z' && object.kind === 'equipment') value = Math.max(0, value);
    previewObjectPatch(object.id, { [key]: value }); await persistObjectAndAttachments(object.id); setPositionModal(false); setObjectMoveMode(false); haptic(9);
  };

  const saveExactRotation = async () => {
    const object = latestObjects.current.find((item) => item.id === selectedObjectId); if (!object) return;
    const rotation_deg = ((n(rotationValue, object.rotation_deg) % 360) + 360) % 360;
    previewObjectPatch(object.id, { rotation_deg }); await persistObjectAndAttachments(object.id); setRotationModal(false); haptic(9);
  };

  const placeEquipment = async (equipment) => {
    try {
      const index = objects.filter((item) => item.kind === 'equipment').length;
      const object = await placeExistingEquipment(data.scene.id, equipment, { x: n(camera.targetX) + (index % 3) * 0.6, y: n(camera.targetY) + Math.floor(index / 3) * 0.6, z: 0 });
      setEquipmentModal(false); await reload(); setSelectedObjectId(object.id); focusObject(object);
    } catch (err) { Alert.alert('Placement', String(err.message || err)); }
  };

  const createEquipment = async (preset) => {
    try {
      const result = await createEquipmentFromLab3d(data.siteId, data.scene.id, preset.code, { x: n(camera.targetX), y: n(camera.targetY), z: 0 });
      setLibraryModal(false); await reload(); setSelectedObjectId(result.object.id); focusObject(result.object);
    } catch (err) { Alert.alert('Bibliothèque 3D', String(err.message || err)); }
  };

  const applySkin = async (key) => {
    const object = latestObjects.current.find((item) => item.id === selectedObjectId); if (!object) return;
    const params = { ...(object.params || {}), visualSkinKey: key };
    await updateLab3dObject(object.id, { params });
    latestObjects.current = latestObjects.current.map((item) => item.id === object.id ? { ...item, params } : item); setObjects(latestObjects.current); setSkinModal(false); haptic(8);
  };

  const confirmNetworkStart = () => {
    const object = latestObjects.current.find((item) => item.id === selectedObjectId); if (!object || object.kind !== 'equipment') return;
    setNetworkCreateModal(false); setNetworkDraft({ start: object, typeCode: networkType, diameterMm: networkDn }); setRadialMenu(null); setObjectMoveMode(false);
  };

  const saveNetworkDn = async (dn) => {
    const network = latestNetworks.current.find((item) => item.id === selectedNetworkId); if (!network) return;
    const next = { ...network, diameter_mm: dn }; await updateLab3dNetwork(network.id, { diameter_mm: dn }); latestNetworks.current = latestNetworks.current.map((item) => item.id === network.id ? next : item); setNetworks(latestNetworks.current); setNetworkDnModal(false); haptic(7);
  };

  const saveNetworkType = async (typeCode) => {
    const network = latestNetworks.current.find((item) => item.id === selectedNetworkId); if (!network) return;
    const next = { ...network, type_code: typeCode }; await updateLab3dNetwork(network.id, { type_code: typeCode }); latestNetworks.current = latestNetworks.current.map((item) => item.id === network.id ? next : item); setNetworks(latestNetworks.current); setNetworkTypeModal(false); haptic(7);
  };

  const saveNetworkRoute = async () => {
    const network = latestNetworks.current.find((item) => item.id === selectedNetworkId); if (!network) return;
    const points = buildAttachedNetworkPoints(network, latestObjects.current, { offsetX: n(networkRouteForm.offsetX), offsetY: n(networkRouteForm.offsetY), elevation: Math.max(0.1, n(networkRouteForm.elevation, 2)) });
    const next = { ...network, points }; latestNetworks.current = latestNetworks.current.map((item) => item.id === network.id ? next : item); setNetworks(latestNetworks.current); await persistLab3dNetwork(next); setNetworkRouteModal(false); haptic(8);
  };

  const createArchitecture = async (preset) => {
    try {
      if (preset.code === 'room') { setArchitectureModal(false); setRoomModal(true); return; }
      if (preset.code === 'stair') {
        const object = await createArchitectureObject(data.scene.id, 'stair', { label: 'Escalier', x: n(camera.targetX), y: n(camera.targetY), width: 1, depth: 2.2, height: 1.5, params: { steps: 8 } });
        setArchitectureModal(false); await reload(); setSelectedObjectId(object.id); focusObject(object); return;
      }
      if (preset.code === 'wall') {
        const object = await createArchitectureObject(data.scene.id, 'wall', { label: 'Mur', x: n(camera.targetX), y: n(camera.targetY), width: 3, depth: 0.18, height: 2.6, params: { side: 'custom' } });
        setArchitectureModal(false); await reload(); setSelectedObjectId(object.id); focusObject(object);
      }
    } catch (err) { Alert.alert('Architecture', String(err.message || err)); }
  };

  const saveRoom = async () => {
    try {
      await createRectangularRoom(data.scene.id, { width: n(roomForm.width, 5), depth: n(roomForm.depth, 4), height: n(roomForm.height, 2.6), thickness: n(roomForm.thickness, 0.18), x: n(camera.targetX), y: n(camera.targetY) });
      setRoomModal(false); await reload({ keepSelection: false }); setTimeout(() => fitScene('iso'), 50); haptic(10);
    } catch (err) { Alert.alert('Création du local', String(err.message || err)); }
  };

  const chooseOpeningKind = (kind) => {
    const preset = LAB3D_OPENING_PRESETS.find((item) => item.code === kind) || LAB3D_OPENING_PRESETS[0];
    setOpeningForm((current) => ({ ...current, kind, width: String(preset.width), height: String(preset.height), sill: String(preset.sill) }));
  };

  const saveNewOpening = async () => {
    const wall = latestObjects.current.find((item) => item.id === selectedObjectId); if (!wall) return;
    try {
      await createOpeningOnWall(data.scene.id, wall, openingForm.kind, { width: n(openingForm.width), height: n(openingForm.height), sill: n(openingForm.sill), offset: n(openingForm.offset) });
      setOpeningModal(false); await reload(); haptic(9);
    } catch (err) { Alert.alert('Ouverture', String(err.message || err)); }
  };

  const saveOpeningEdit = async () => {
    const opening = latestOpenings.current.find((item) => item.id === selectedOpeningId); if (!opening) return;
    const wall = latestObjects.current.find((item) => item.id === opening.wall_id); if (!wall) return;
    const oldId = opening.id;
    await removeLab3dOpening(oldId);
    const created = await createOpeningOnWall(data.scene.id, wall, openingForm.kind, { width: n(openingForm.width), height: n(openingForm.height), sill: n(openingForm.sill), offset: n(openingForm.offset) });
    setSelectedOpeningId(created.id); setOpeningEditModal(false); await reload(); haptic(8);
  };

  const markersByObject = useMemo(() => {
    const map = new Map();
    for (const remark of data?.remarks || []) {
      const object = objects.find((item) => item.equipment_id === remark.reference_id); if (!object) continue;
      const list = map.get(object.id) || []; list.push(remark); map.set(object.id, list);
    }
    return map;
  }, [data?.remarks, objects]);

  const unplaced = useMemo(() => (data?.equipments || []).filter((item) => !Number(item.placed_3d)), [data?.equipments]);

  const sortedObjectsForHits = useMemo(() => [...objects].sort((a, b) => {
    const ac = cameraPoint3d({ x: a.x, y: a.y, z: n(a.z) + n(a.height) * 0.5 }, viewport, camera);
    const bc = cameraPoint3d({ x: b.x, y: b.y, z: n(b.z) + n(b.height) * 0.5 }, viewport, camera);
    return ac.depth - bc.depth;
  }), [camera, objects, viewport]);

  const radialEntityLabel = useMemo(() => {
    if (!radialMenu) return '';
    if (radialMenu.entityType === 'object') return objects.find((item) => item.id === radialMenu.entityId)?.label || 'Objet';
    if (radialMenu.entityType === 'network') { const network = networks.find((item) => item.id === radialMenu.entityId); return network ? `DN${network.diameter_mm || '-'} ${networkLabel(network.type_code)}` : 'Réseau'; }
    if (radialMenu.entityType === 'opening') return openings.find((item) => item.id === radialMenu.entityId)?.kind || 'Ouverture';
    return 'Actions';
  }, [networks, objects, openings, radialMenu]);

  if (loading) return <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={CYAN} /><Text style={{ color: MUTED, marginTop: 10 }}>Chargement de LAB 3D…</Text></View>;
  if (error) return <View style={{ flex: 1, backgroundColor: BG, padding: 24, justifyContent: 'center' }}><Text style={{ color: RED, fontSize: 18, fontWeight: '900' }}>LAB 3D indisponible</Text><Text style={{ color: WHITE, marginTop: 8 }}>{String(error.message || error)}</Text><TinyButton label="Réessayer" onPress={() => { setLoading(true); reload(); }} /></View>;

  return <View style={{ flex: 1, backgroundColor: BG }}>
    <View style={{ paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#091824', borderBottomWidth: 1, borderBottomColor: '#163548' }}>
      <View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 15 }}>{data?.nomSite || 'Site'} · LAB 3D</Text><Text style={{ color: MUTED, fontSize: 10 }}>{requestedVisitId ? 'Maquette du site · couche visite' : 'Maquette permanente'} · {objects.filter((item) => item.kind === 'equipment').length} équipement(s) · {networks.length} réseau(x)</Text></View>
      <TinyButton label="⌂" onPress={() => fitScene('iso')} />
      <TinyButton label="◇ ISO" onPress={() => setCamera((c) => ({ ...c, yaw: 45, pitch: 30 }))} />
      <TinyButton label="⬆ Dessus" onPress={() => fitScene('top')} />
      <TinyButton label="−" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom - 8, 20, 112) }))} />
      <TinyButton label="+" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom + 8, 20, 112) }))} />
    </View>

    <View ref={sceneRef} style={{ flex: 1, overflow: 'hidden' }} onLayout={(event) => { setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }); setTimeout(measureScene, 0); }} {...interactionPanResponder.panHandlers}>
      <Svg width="100%" height="100%" style={{ backgroundColor: BG }} onPress={handleEmptyPress}>
        <SceneGrid3D viewport={viewport} camera={camera} step={data?.scene?.grid_step} />

        {objects.filter((object) => object.kind === 'architecture').map((object) => <React.Fragment key={`arch-${object.id}`}><ArchitectureLowPoly object={object} viewport={viewport} camera={camera} selected={selectedObjectId === object.id} />{selectedObjectId === object.id ? <ObjectLabel object={object} viewport={viewport} camera={camera} selected /> : null}</React.Fragment>)}

        {openings.map((opening) => {
          const wall = objects.find((item) => item.id === opening.wall_id);
          return <OpeningLowPoly key={opening.id} opening={opening} wall={wall} viewport={viewport} camera={camera} selected={selectedOpeningId === opening.id} />;
        })}

        {networks.map((network) => <NetworkLowPoly key={network.id} network={network} viewport={viewport} camera={camera} color={NETWORK_COLORS[network.type_code] || NETWORK_COLORS.autre} selected={selectedNetworkId === network.id} />)}

        {objects.filter((object) => object.kind === 'equipment').map((object) => {
          const equipment = equipmentMap.get(object.equipment_id) || {};
          const skin = resolveEquipmentSkin(equipment, object);
          return <React.Fragment key={`eq-${object.id}`}><MasonryBaseLowPoly object={object} viewport={viewport} camera={camera} /><EquipmentLowPoly object={object} equipment={equipment} skin={skin} viewport={viewport} camera={camera} selected={selectedObjectId === object.id} /><ObjectLabel object={object} viewport={viewport} camera={camera} selected={selectedObjectId === object.id} />{(markersByObject.get(object.id) || []).map((remark, index) => <RemarkMarker key={remark.id} object={object} index={index} viewport={viewport} camera={camera} />)}</React.Fragment>;
        })}
      </Svg>

      {networks.flatMap((network) => (network.points || []).slice(0, -1).map((point, index) => {
        const a = project3d(point, viewport, camera); const b = project3d(network.points[index + 1], viewport, camera);
        const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.max(24, Math.hypot(dx, dy));
        if (Math.hypot(dx, dy) < 4) return null;
        const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2; const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return <Pressable key={`net-hit-${network.id}-${index}`} onPressIn={() => { touchingEntityRef.current = true; stopInertia(); }} onPress={() => { touchingEntityRef.current = false; if (suppressTapRef.current === `network:${network.id}`) { suppressTapRef.current = null; return; } setSelectedNetworkId(network.id); setSelectedObjectId(null); setSelectedOpeningId(null); }} onLongPress={(event) => openRadial('network', network.id, event, { x: mx, y: my })} onTouchMove={(event) => updateRadialFromTouch('network', network.id, event)} onPressOut={() => { touchingEntityRef.current = false; releaseRadial('network', network.id); }} delayLongPress={420} style={{ position: 'absolute', left: mx - len / 2, top: my - 18, width: len, height: 36, transform: [{ rotate: `${angle}deg` }], borderRadius: 18 }} />;
      }).filter(Boolean))}

      {sortedObjectsForHits.map((object) => {
        const center = project3d({ x: object.x, y: object.y, z: n(object.z) + n(object.height) * 0.5 }, viewport, camera);
        const maxDim = Math.max(n(object.width, 1), n(object.depth, 0.6));
        const hit = clamp(maxDim * camera.zoom * (object.kind === 'architecture' ? 0.55 : 0.68), object.subtype === 'wall' ? 36 : 42, object.subtype === 'wall' ? 86 : 92);
        return <Pressable key={`obj-hit-${object.id}`} onPressIn={() => { touchingEntityRef.current = true; stopInertia(); }} onPress={() => handleObjectTap(object)} onLongPress={(event) => openRadial('object', object.id, event, center)} onTouchMove={(event) => updateRadialFromTouch('object', object.id, event)} onPressOut={() => { touchingEntityRef.current = false; releaseRadial('object', object.id); }} delayLongPress={420} style={{ position: 'absolute', left: center.x - hit / 2, top: center.y - hit / 2, width: hit, height: hit, borderRadius: hit / 2 }} />;
      })}

      {openings.map((opening) => {
        const center = project3d({ x: opening.x, y: opening.y, z: n(opening.z) + n(opening.height) * 0.5 }, viewport, camera);
        const hitW = clamp(n(opening.width, 0.9) * camera.zoom * 0.55, 38, 86); const hitH = clamp(n(opening.height, 1) * camera.zoom * 0.42, 42, 96);
        return <Pressable key={`opening-hit-${opening.id}`} onPressIn={() => { touchingEntityRef.current = true; stopInertia(); }} onPress={() => { touchingEntityRef.current = false; if (suppressTapRef.current === `opening:${opening.id}`) { suppressTapRef.current = null; return; } setSelectedOpeningId(opening.id); setSelectedObjectId(null); setSelectedNetworkId(null); }} onLongPress={(event) => openRadial('opening', opening.id, event, center)} onTouchMove={(event) => updateRadialFromTouch('opening', opening.id, event)} onPressOut={() => { touchingEntityRef.current = false; releaseRadial('opening', opening.id); }} delayLongPress={420} style={{ position: 'absolute', left: center.x - hitW / 2, top: center.y - hitH / 2, width: hitW, height: hitH, borderRadius: 8 }} />;
      })}

      <RadialMenu menu={radialMenu} entityLabel={radialEntityLabel} onAction={(key) => radialMenu && executeRadialAction(radialMenu.entityType, radialMenu.entityId, key)} onClose={() => { radialGestureRef.current = { active: false, entityType: null, entityId: null, hovered: null }; setRadialMenu(null); }} />

      {networkDraft ? <View style={{ position: 'absolute', left: 12, right: 12, top: 10, backgroundColor: '#16384BEE', borderRadius: 12, borderWidth: 1, borderColor: CYAN, padding: 10, flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>Réseau {networkLabel(networkDraft.typeCode)} · DN{networkDraft.diameterMm}</Text><Text style={{ color: '#C5E9F8', fontSize: 11 }}>Départ : {networkDraft.start.label}. Touchez l'équipement d'arrivée.</Text></View><TinyButton label="Annuler" onPress={() => setNetworkDraft(null)} /></View> : null}

      {objectMoveMode && selectedObject ? <View style={{ position: 'absolute', top: 10, right: 12, padding: 9, borderRadius: 12, backgroundColor: '#132C3BEE', borderWidth: 1, borderColor: AXIS[axis], minWidth: 178 }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 11 }}>Déplacement objet · axe {axis}</Text><TouchableOpacity onPress={() => { setExactValue(String(n(selectedObject[axis.toLowerCase()]).toFixed(2))); setPositionModal(true); }}><Text style={{ color: AXIS[axis], fontSize: 18, fontWeight: '900', paddingVertical: 4 }}>{axis} : {n(selectedObject[axis.toLowerCase()]).toFixed(2)} m ✎</Text></TouchableOpacity><Text style={{ color: MUTED, fontSize: 9 }}>Le réseau attaché suit l'équipement en direct.</Text></View> : null}

      {networkMoveMode && selectedNetwork ? <View style={{ position: 'absolute', top: 10, right: 12, padding: 9, borderRadius: 12, backgroundColor: '#132C3BEE', borderWidth: 1, borderColor: AXIS[axis], minWidth: 178 }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 11 }}>Déplacement réseau · axe {axis}</Text><Text style={{ color: AXIS[axis], fontSize: 15, fontWeight: '900', paddingVertical: 4 }}>{axis === 'Z' ? 'Élévation' : `Décalage ${axis}`}</Text><Text style={{ color: MUTED, fontSize: 9 }}>Les extrémités restent attachées aux équipements.</Text></View> : null}

      {!selectedObject && !selectedNetwork && !selectedOpening && !radialMenu && !networkDraft ? <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 10, right: 12, alignItems: 'center' }}><Text style={{ color: '#A9C6D4', fontSize: 10, backgroundColor: '#081823CC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>1 doigt vide : orbite · 2 doigts : déplacer/zoom · appui long objet ou réseau : roue</Text></View> : null}
    </View>

    <View style={{ backgroundColor: PANEL, borderTopWidth: 1, borderTopColor: '#284657', padding: 9 }}>
      {!selectedObject && !selectedNetwork && !selectedOpening ? <View style={{ flexDirection: 'row', gap: 6 }}><TinyButton flex label={`Patrimoine${unplaced.length ? ` (${unplaced.length})` : ''}`} onPress={() => setEquipmentModal(true)} /><TinyButton flex label="+ Bibliothèque 3D" onPress={() => setLibraryModal(true)} /><TinyButton flex label="+ Local / architecture" onPress={() => setArchitectureModal(true)} /></View> : null}

      {selectedObject ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{selectedObject.label}</Text><Text style={{ color: MUTED, fontSize: 10 }}>{selectedObject.kind === 'equipment' ? `${skinDisplayName(selectedSkin)} · ` : ''}X {n(selectedObject.x).toFixed(2)} · Y {n(selectedObject.y).toFixed(2)} · Z {n(selectedObject.z).toFixed(2)} m</Text></View><TinyButton label="Actions" active onPress={() => { const center = project3d({ x: selectedObject.x, y: selectedObject.y, z: n(selectedObject.z) + n(selectedObject.height) * 0.5 }, viewport, camera); openRadial('object', selectedObject.id, null, center); radialGestureRef.current.active = false; }} /><TouchableOpacity onPress={() => { setSelectedObjectId(null); setObjectMoveMode(false); setRadialMenu(null); }}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View> : null}

      {selectedNetwork ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{networkLabel(selectedNetwork.type_code)}</Text><Text style={{ color: MUTED, fontSize: 10 }}>DN{selectedNetwork.diameter_mm || '-'} · extrémités attachées · flèche = sens</Text></View><TinyButton label="Actions" active onPress={() => { const points = selectedNetwork.points || []; const middle = points[Math.floor(points.length / 2)] || points[0] || { x: 0, y: 0, z: 0 }; openRadial('network', selectedNetwork.id, null, project3d(middle, viewport, camera)); radialGestureRef.current.active = false; }} /><TouchableOpacity onPress={() => { setSelectedNetworkId(null); setNetworkMoveMode(false); setRadialMenu(null); }}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View> : null}

      {selectedOpening ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{LAB3D_OPENING_PRESETS.find((item) => item.code === selectedOpening.kind)?.label || 'Ouverture'}</Text><Text style={{ color: MUTED, fontSize: 10 }}>{n(selectedOpening.width).toFixed(2)} × {n(selectedOpening.height).toFixed(2)} m</Text></View><TinyButton label="Modifier" active onPress={() => { setOpeningForm({ kind: selectedOpening.kind, width: String(n(selectedOpening.width).toFixed(2)), height: String(n(selectedOpening.height).toFixed(2)), sill: String(n(selectedOpening.z).toFixed(2)), offset: String(n(selectedOpening.params?.offset).toFixed(2)) }); setOpeningEditModal(true); }} /><TouchableOpacity onPress={() => setSelectedOpeningId(null)}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View> : null}
    </View>

    <Sheet visible={equipmentModal} onClose={() => setEquipmentModal(false)} title="Équipements du site" subtitle="Place les équipements déjà connus. Leur marque et modèle déterminent automatiquement le skin 3D quand une correspondance existe."><ScrollView>{unplaced.length ? unplaced.map((equipment) => <TouchableOpacity key={equipment.id} onPress={() => placeEquipment(equipment)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{equipment.visualProfile?.icon} {equipment.designation || equipment.visualProfile?.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{[equipment.marque, equipment.modele].filter(Boolean).join(' · ') || 'Modèle générique paramétrique'}</Text></TouchableOpacity>) : <Text style={{ color: MUTED, paddingVertical: 20 }}>Tous les équipements actifs du site sont déjà placés.</Text>}</ScrollView></Sheet>

    <Sheet visible={libraryModal} onClose={() => setLibraryModal(false)} title="Bibliothèque 3D" subtitle="Modèles procéduraux low-poly. Le skin peut ensuite être automatique selon marque/modèle ou choisi manuellement."><ScrollView>{LAB3D_EQUIPMENT_PRESETS.map((preset) => <TouchableOpacity key={preset.code} onPress={() => createEquipment(preset)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{preset.icon} {preset.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Low-poly détaillé · {preset.width} × {preset.depth} × {preset.height} m · dimensions modifiables</Text></TouchableOpacity>)}</ScrollView></Sheet>

    <Sheet visible={architectureModal} onClose={() => setArchitectureModal(false)} title="Local / architecture" subtitle="Construis le volume de la chaufferie ou sous-station, puis ajoute les ouvertures depuis un mur."><ScrollView>{LAB3D_ARCHITECTURE_PRESETS.map((preset) => <TouchableOpacity key={preset.code} onPress={() => createArchitecture(preset)} style={{ padding: 13, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{preset.icon} {preset.label}</Text>{preset.code === 'room' ? <Text style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>Sol + 4 murs avec hauteur et épaisseur paramétriques.</Text> : null}</TouchableOpacity>)}<View style={{ padding: 12, backgroundColor: '#0D1E29', borderRadius: 12 }}><Text style={{ color: '#BCD5E1', fontSize: 11 }}>Pour une porte, fenêtre, baie ou grille : sélectionne un mur → appui long → Ouverture.</Text></View></ScrollView></Sheet>

    <ModalCard visible={roomModal} onClose={() => setRoomModal(false)} title="Créer la pièce"><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Largeur (m)" value={roomForm.width} onChangeText={(v) => setRoomForm((f) => ({ ...f, width: v }))} /></View><View style={{ flex: 1 }}><Field label="Longueur (m)" value={roomForm.depth} onChangeText={(v) => setRoomForm((f) => ({ ...f, depth: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Hauteur murs (m)" value={roomForm.height} onChangeText={(v) => setRoomForm((f) => ({ ...f, height: v }))} /></View><View style={{ flex: 1 }}><Field label="Épaisseur murs (m)" value={roomForm.thickness} onChangeText={(v) => setRoomForm((f) => ({ ...f, thickness: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setRoomModal(false)} /><TinyButton flex active label="Créer le local" onPress={saveRoom} /></View></ScrollView></ModalCard>

    <ModalCard visible={dimensionModal} onClose={() => setDimensionModal(false)} title={selectedObject?.kind === 'equipment' ? 'Équipement & dimensions' : 'Dimensions de l’élément'}><ScrollView keyboardShouldPersistTaps="handled">{selectedObject?.kind === 'equipment' ? <><Field label="Désignation" value={editForm.designation} keyboardType="default" onChangeText={(v) => setEditForm((f) => ({ ...f, designation: v }))} /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Marque" value={editForm.marque} keyboardType="default" onChangeText={(v) => setEditForm((f) => ({ ...f, marque: v }))} /></View><View style={{ flex: 1 }}><Field label="Modèle" value={editForm.modele} keyboardType="default" onChangeText={(v) => setEditForm((f) => ({ ...f, modele: v }))} /></View></View></> : <Field label="Nom" value={editForm.label} keyboardType="default" onChangeText={(v) => setEditForm((f) => ({ ...f, label: v }))} />}<View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label={selectedObject?.subtype === 'wall' ? 'Longueur X (m)' : 'Largeur X (m)'} value={editForm.width} onChangeText={(v) => setEditForm((f) => ({ ...f, width: v }))} /></View><View style={{ flex: 1 }}><Field label={selectedObject?.subtype === 'wall' ? 'Épaisseur / Y (m)' : 'Profondeur Y (m)'} value={editForm.depth} onChangeText={(v) => setEditForm((f) => ({ ...f, depth: v }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={editForm.height} onChangeText={(v) => setEditForm((f) => ({ ...f, height: v }))} /></View></View><Field label="Z (m)" value={editForm.z} onChangeText={(v) => setEditForm((f) => ({ ...f, z: v }))} />{selectedObject?.params?.support?.type === 'masonry' ? <View style={{ padding: 10, backgroundColor: '#182C35', borderRadius: 12, marginBottom: 10 }}><Text style={{ color: WHITE, fontWeight: '900', marginBottom: 8 }}>Socle maçonné</Text><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Débord (m)" value={editForm.supportOverhang} onChangeText={(v) => setEditForm((f) => ({ ...f, supportOverhang: v }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={editForm.supportHeight} onChangeText={(v) => setEditForm((f) => ({ ...f, supportHeight: v }))} /></View></View></View> : null}<View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setDimensionModal(false)} /><TinyButton flex active label="Enregistrer" onPress={saveDimensions} /></View></ScrollView></ModalCard>

    <ModalCard visible={positionModal} onClose={() => setPositionModal(false)} title={`Position exacte · axe ${axis}`}><Field label={`${axis} (m)`} value={exactValue} onChangeText={setExactValue} /><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setPositionModal(false)} /><TinyButton flex active label="Appliquer" onPress={saveExactPosition} /></View></ModalCard>

    <ModalCard visible={rotationModal} onClose={() => setRotationModal(false)} title="Rotation exacte"><Field label="Angle (°)" value={rotationValue} onChangeText={setRotationValue} /><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setRotationModal(false)} /><TinyButton flex active label="Appliquer" onPress={saveExactRotation} /></View></ModalCard>

    <Sheet visible={skinModal} onClose={() => setSkinModal(false)} title="Skin 3D" subtitle={`Auto utilise marque + modèle. Skin actuel : ${skinDisplayName(selectedSkin)}.`}><ScrollView><TouchableOpacity onPress={() => applySkin('auto')} style={{ padding: 12, backgroundColor: selectedObject?.params?.visualSkinKey ? PANEL_2 : '#174B63', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: CYAN }}><Text style={{ color: WHITE, fontWeight: '900' }}>◈ Automatique marque / modèle</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>Résolution : modèle exact → marque → type → générique.</Text></TouchableOpacity>{listSkinsForType(selectedObject?.subtype).map((skin) => <TouchableOpacity key={skin.key} onPress={() => applySkin(skin.key)} style={{ padding: 12, backgroundColor: selectedObject?.params?.visualSkinKey === skin.key ? '#174B63' : PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: selectedObject?.params?.visualSkinKey === skin.key ? CYAN : '#315266' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: skin.primary, borderWidth: 5, borderColor: skin.accent }} /><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{skin.label}</Text><Text style={{ color: MUTED, fontSize: 10 }}>{skin.variant} · skin procédural low-poly</Text></View></View></TouchableOpacity>)}</ScrollView></Sheet>

    <ModalCard visible={networkCreateModal} onClose={() => setNetworkCreateModal(false)} title="Créer un réseau"><Text style={{ color: MUTED, marginBottom: 10 }}>Choisis le type et le DN puis touche l'équipement d'arrivée.</Text><ScrollView style={{ maxHeight: 220 }}>{LAB3D_NETWORK_TYPES.map((item) => <TouchableOpacity key={item.code} onPress={() => setNetworkType(item.code)} style={{ padding: 9, borderRadius: 9, marginBottom: 5, backgroundColor: networkType === item.code ? '#174B63' : PANEL_2, borderWidth: 1, borderColor: networkType === item.code ? CYAN : '#345567' }}><Text style={{ color: WHITE, fontWeight: '800' }}>{item.label}</Text></TouchableOpacity>)}</ScrollView><Text style={{ color: MUTED, fontWeight: '800', fontSize: 11, marginTop: 10, marginBottom: 6 }}>DIAMÈTRE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={networkDn === dn} onPress={() => setNetworkDn(dn)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TinyButton flex label="Annuler" onPress={() => setNetworkCreateModal(false)} /><TinyButton flex active label="Choisir l'arrivée" onPress={confirmNetworkStart} /></View></ModalCard>

    <Sheet visible={networkDnModal} onClose={() => setNetworkDnModal(false)} title="Diamètre du réseau"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 10 }}>{LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={Number(selectedNetwork?.diameter_mm) === dn} onPress={() => saveNetworkDn(dn)} />)}</ScrollView></Sheet>

    <Sheet visible={networkTypeModal} onClose={() => setNetworkTypeModal(false)} title="Type de réseau"><ScrollView>{LAB3D_NETWORK_TYPES.map((item) => <TouchableOpacity key={item.code} onPress={() => saveNetworkType(item.code)} style={{ padding: 12, backgroundColor: selectedNetwork?.type_code === item.code ? '#174B63' : PANEL_2, borderRadius: 11, marginBottom: 7, borderWidth: 1, borderColor: selectedNetwork?.type_code === item.code ? CYAN : '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{item.label}</Text></TouchableOpacity>)}</ScrollView></Sheet>

    <ModalCard visible={networkRouteModal} onClose={() => setNetworkRouteModal(false)} title="Tracé du réseau"><Text style={{ color: MUTED, marginBottom: 10 }}>Les extrémités restent attachées aux équipements. X/Y déplacent le tronc du réseau, Z règle son élévation.</Text><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Décalage X (m)" value={networkRouteForm.offsetX} onChangeText={(v) => setNetworkRouteForm((f) => ({ ...f, offsetX: v }))} /></View><View style={{ flex: 1 }}><Field label="Décalage Y (m)" value={networkRouteForm.offsetY} onChangeText={(v) => setNetworkRouteForm((f) => ({ ...f, offsetY: v }))} /></View></View><Field label="Élévation du tronc Z (m)" value={networkRouteForm.elevation} onChangeText={(v) => setNetworkRouteForm((f) => ({ ...f, elevation: v }))} /><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setNetworkRouteModal(false)} /><TinyButton flex active label="Appliquer" onPress={saveNetworkRoute} /></View></ModalCard>

    <ModalCard visible={openingModal} onClose={() => setOpeningModal(false)} title="Ajouter une ouverture"><ScrollView keyboardShouldPersistTaps="handled"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>{LAB3D_OPENING_PRESETS.map((preset) => <TinyButton key={preset.code} label={`${preset.icon} ${preset.label}`} active={openingForm.kind === preset.code} onPress={() => chooseOpeningKind(preset.code)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Largeur (m)" value={openingForm.width} onChangeText={(v) => setOpeningForm((f) => ({ ...f, width: v }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={openingForm.height} onChangeText={(v) => setOpeningForm((f) => ({ ...f, height: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Allège / Z (m)" value={openingForm.sill} onChangeText={(v) => setOpeningForm((f) => ({ ...f, sill: v }))} /></View><View style={{ flex: 1 }}><Field label="Décalage sur mur (m)" value={openingForm.offset} onChangeText={(v) => setOpeningForm((f) => ({ ...f, offset: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setOpeningModal(false)} /><TinyButton flex active label="Ajouter" onPress={saveNewOpening} /></View></ScrollView></ModalCard>

    <ModalCard visible={openingEditModal} onClose={() => setOpeningEditModal(false)} title="Modifier l’ouverture"><ScrollView keyboardShouldPersistTaps="handled"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>{LAB3D_OPENING_PRESETS.map((preset) => <TinyButton key={preset.code} label={preset.label} active={openingForm.kind === preset.code} onPress={() => chooseOpeningKind(preset.code)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Largeur (m)" value={openingForm.width} onChangeText={(v) => setOpeningForm((f) => ({ ...f, width: v }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={openingForm.height} onChangeText={(v) => setOpeningForm((f) => ({ ...f, height: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Allège / Z (m)" value={openingForm.sill} onChangeText={(v) => setOpeningForm((f) => ({ ...f, sill: v }))} /></View><View style={{ flex: 1 }}><Field label="Décalage mur (m)" value={openingForm.offset} onChangeText={(v) => setOpeningForm((f) => ({ ...f, offset: v }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><TinyButton flex label="Annuler" onPress={() => setOpeningEditModal(false)} /><TinyButton flex active label="Enregistrer" onPress={saveOpeningEdit} /></View></ScrollView></ModalCard>
  </View>;
}
