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
const ORANGE = '#F39A4A';
const RED = '#FF5D63';
const GREEN = '#58D6A3';
const AXIS = { X: '#FF6B6B', Y: '#55C7FF', Z: '#78E08F' };

const EQUIPMENT_COLORS = {
  chaudiere: '#D88A46', pompe: '#4FA7D8', adoucisseur: '#5BBACF', ballon: '#7F93B6',
  vase_expansion: '#9B7EC8', echangeur: '#C1A457', bouteille: '#6E9CAD', cta: '#728C9D',
  vmc: '#7097A7', ventilateur: '#6BB0B8', armoire: '#9B9AA0', bac_sel: '#9CBCD0', equipement: '#7891A2',
};
const NETWORK_COLORS = {
  chauffage_depart: '#EF635F', chauffage_retour: '#4E8FE6', ecs: '#F39A4A', efs: '#51B7E8',
  bouclage_ecs: '#D98B55', gaz: '#F0D95C', condensats: '#A8C4D0', fioul: '#8E8070', autre: '#B6C8D0',
};

const num = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const snap = (value, step) => Math.round(value / step) * step;

function project(point, viewport, camera) {
  const scale = camera.zoom;
  const cx = viewport.width / 2 + camera.offsetX;
  const cy = viewport.height * 0.56 + camera.offsetY;
  return {
    x: cx + (Number(point.x || 0) - Number(point.y || 0)) * 0.866 * scale,
    y: cy + (Number(point.x || 0) + Number(point.y || 0)) * 0.5 * scale - Number(point.z || 0) * scale,
  };
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
  const rad = num(object.rotation_deg) * Math.PI / 180;
  const rotate = (px, py) => ({
    x: x + px * Math.cos(rad) - py * Math.sin(rad),
    y: y + px * Math.sin(rad) + py * Math.cos(rad),
  });
  const a = rotate(-hw, -hd); const b = rotate(hw, -hd); const c = rotate(hw, hd); const d = rotate(-hw, hd);
  const bottom = [a, b, c, d].map((p) => ({ ...p, z }));
  const top = [a, b, c, d].map((p) => ({ ...p, z: z + height }));
  const color = support ? '#777B7E' : (EQUIPMENT_COLORS[object.subtype] || EQUIPMENT_COLORS.equipement);
  return (
    <>
      <Polygon points={polygonPoints([bottom[1], bottom[2], top[2], top[1]], viewport, camera)} fill={color} opacity={support ? 0.62 : 0.72} stroke={selected ? CYAN : '#A7C1CF'} strokeWidth={selected ? 2.2 : 0.8} />
      <Polygon points={polygonPoints([bottom[2], bottom[3], top[3], top[2]], viewport, camera)} fill={color} opacity={support ? 0.48 : 0.58} stroke={selected ? CYAN : '#A7C1CF'} strokeWidth={selected ? 2.2 : 0.8} />
      <Polygon points={polygonPoints(top, viewport, camera)} fill={color} opacity={support ? 0.82 : 0.95} stroke={selected ? CYAN : '#D7E9F2'} strokeWidth={selected ? 2.2 : 0.9} />
    </>
  );
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
    lines.push(<Line key={`gx-${index++}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={width} />);
    const p3 = project({ x: v, y: -size, z: 0 }, viewport, camera);
    const p4 = project({ x: v, y: size, z: 0 }, viewport, camera);
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
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={{
      minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1, borderColor: danger ? '#93484B' : active ? CYAN : '#345567',
      backgroundColor: active ? '#174B63' : danger ? '#3A2025' : PANEL_2,
      opacity: disabled ? 0.42 : 1, alignItems: 'center', justifyContent: 'center', flex: flex ? 1 : undefined,
    }}><Text style={{ color: danger ? '#FF9A9E' : WHITE, fontWeight: '800', fontSize: 12 }}>{label}</Text></TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'decimal-pad' }) {
  return <View style={{ marginBottom: 10 }}><Text style={{ color: MUTED, fontSize: 11, fontWeight: '700', marginBottom: 5 }}>{label}</Text><TextInput value={String(value ?? '')} onChangeText={onChangeText} keyboardType={keyboardType} style={{ backgroundColor: '#0B1A25', color: WHITE, borderRadius: 9, borderWidth: 1, borderColor: '#355568', paddingHorizontal: 11, minHeight: 42 }} /></View>;
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
  const [camera, setCamera] = useState({ zoom: 52, offsetX: 0, offsetY: 0 });
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [newEquipmentModal, setNewEquipmentModal] = useState(false);
  const [dimensionModal, setDimensionModal] = useState(false);
  const [networkModal, setNetworkModal] = useState(false);
  const [networkDraft, setNetworkDraft] = useState(null);
  const [networkType, setNetworkType] = useState('chauffage_depart');
  const [networkDn, setNetworkDn] = useState(50);
  const [editForm, setEditForm] = useState({});
  const dragStart = useRef(null);
  const latestObjects = useRef(objects);
  latestObjects.current = objects;

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

  const selected = useMemo(() => objects.find((item) => item.id === selectedId) || null, [objects, selectedId]);
  const selectedNetwork = useMemo(() => networks.find((item) => item.id === selectedNetworkId) || null, [networks, selectedNetworkId]);
  const selectedEquipment = useMemo(() => data?.equipments?.find((item) => item.id === selected?.equipment_id) || null, [data, selected]);

  const commitSelected = useCallback(async (object) => {
    if (!object?.id) return;
    await updateLab3dObject(object.id, { x: object.x, y: object.y, z: object.z });
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(selectedId && moveMode),
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(selectedId && moveMode && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)),
    onPanResponderGrant: () => {
      const object = latestObjects.current.find((item) => item.id === selectedId);
      if (object) dragStart.current = { ...object };
    },
    onPanResponderMove: (_, gesture) => {
      const start = dragStart.current;
      if (!start) return;
      const scale = camera.zoom || 52;
      const step = num(data?.scene?.grid_step, 0.25);
      let delta = 0;
      if (axis === 'X') delta = (gesture.dx * 0.866 + gesture.dy * 0.5) / scale;
      else if (axis === 'Y') delta = (-gesture.dx * 0.866 + gesture.dy * 0.5) / scale;
      else delta = -gesture.dy / scale;
      setObjects((current) => current.map((item) => {
        if (item.id !== start.id) return item;
        if (axis === 'X') return { ...item, x: snap(num(start.x) + delta, step) };
        if (axis === 'Y') return { ...item, y: snap(num(start.y) + delta, step) };
        return { ...item, z: Math.max(0, snap(num(start.z) + delta, step)) };
      }));
    },
    onPanResponderRelease: async () => {
      const object = latestObjects.current.find((item) => item.id === selectedId);
      dragStart.current = null;
      try { await commitSelected(object); } catch (err) { Alert.alert('Déplacement', String(err.message || err)); }
    },
    onPanResponderTerminate: () => { dragStart.current = null; },
  }), [axis, camera.zoom, commitSelected, data?.scene?.grid_step, moveMode, selectedId]);

  const selectObject = useCallback(async (object) => {
    setSelectedNetworkId(null);
    if (networkDraft && object.id !== networkDraft.start.id) {
      try {
        const created = await createLab3dNetwork(data.scene.id, {
          typeCode: networkDraft.typeCode,
          diameterMm: networkDraft.diameterMm,
          start: networkDraft.start,
          end: object,
        });
        setNetworks((current) => [...current, created]);
        setNetworkDraft(null);
        setSelectedId(object.id);
      } catch (err) { Alert.alert('Réseau', String(err.message || err)); }
      return;
    }
    setSelectedId(object.id);
  }, [data?.scene?.id, networkDraft]);

  const moveByStep = async (direction) => {
    if (!selected) return;
    const step = num(data?.scene?.grid_step, 0.25) * direction;
    const patch = axis === 'X' ? { x: num(selected.x) + step }
      : axis === 'Y' ? { y: num(selected.y) + step }
        : { z: Math.max(0, num(selected.z) + step) };
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
    await updateLab3dObject(selected.id, patch);
  };

  const rotate = async (direction) => {
    if (!selected) return;
    const rotation_deg = ((num(selected.rotation_deg) + direction * 90) % 360 + 360) % 360;
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, rotation_deg } : item));
    await updateLab3dObject(selected.id, { rotation_deg });
  };

  const openDimensions = () => {
    if (!selected) return;
    setEditForm({
      width: selected.width, depth: selected.depth, height: selected.height, z: selected.z,
      designation: selectedEquipment?.designation || selected.label || '',
      marque: selectedEquipment?.marque || '', modele: selectedEquipment?.modele || '',
      supportHeight: selected.params?.support?.height ?? 0.10,
      supportOverhang: selected.params?.support?.overhang ?? 0.05,
    });
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

  const toggleBase = async () => {
    if (!selected) return;
    await setMasonryBase(selected);
    await reload();
  };

  const deleteSelected = () => {
    if (!selected) return;
    Alert.alert('Retirer de la maquette ?', "L'équipement reste enregistré dans le patrimoine du site.", [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer de la 3D', style: 'destructive', onPress: async () => { await removeLab3dObject(selected.id); setSelectedId(null); await reload(); } },
    ]);
  };

  const placeEquipment = async (equipment) => {
    try {
      const index = objects.length;
      const object = await placeExistingEquipment(data.scene.id, equipment, { x: (index % 4) * 1.5, y: Math.floor(index / 4) * 1.4, z: 0 });
      setEquipmentModal(false);
      await reload();
      setSelectedId(object.id);
    } catch (err) { Alert.alert('Placement', String(err.message || err)); }
  };

  const createEquipment = async (preset) => {
    try {
      const index = objects.length;
      const result = await createEquipmentFromLab3d(data.siteId, data.scene.id, preset.code, { x: (index % 4) * 1.5, y: Math.floor(index / 4) * 1.4, z: 0 });
      setNewEquipmentModal(false);
      await reload();
      setSelectedId(result.object.id);
    } catch (err) { Alert.alert('Nouvel équipement', String(err.message || err)); }
  };

  const startNetwork = () => {
    if (!selected) return;
    setNetworkType('chauffage_depart');
    setNetworkDn(50);
    setNetworkModal(true);
  };

  const confirmNetworkStart = () => {
    setNetworkModal(false);
    setNetworkDraft({ start: selected, typeCode: networkType, diameterMm: networkDn });
    setMoveMode(false);
  };

  const changeNetworkDn = async (dn) => {
    if (!selectedNetwork) return;
    await updateLab3dNetwork(selectedNetwork.id, { diameter_mm: dn });
    setNetworks((current) => current.map((item) => item.id === selectedNetwork.id ? { ...item, diameter_mm: dn } : item));
  };

  const deleteNetwork = () => {
    if (!selectedNetwork) return;
    Alert.alert('Supprimer ce réseau ?', `${networkLabel(selectedNetwork.type_code)} · DN${selectedNetwork.diameter_mm || '-'}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await removeLab3dNetwork(selectedNetwork.id); setSelectedNetworkId(null); await reload(); } },
    ]);
  };

  const markersByObject = useMemo(() => {
    const map = new Map();
    for (const remark of data?.remarks || []) {
      const object = objects.find((item) => item.equipment_id === remark.reference_id);
      if (!object) continue;
      const list = map.get(object.id) || [];
      list.push(remark);
      map.set(object.id, list);
    }
    return map;
  }, [data?.remarks, objects]);

  if (loading) return <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={CYAN} /><Text style={{ color: MUTED, marginTop: 10 }}>Chargement de LAB 3D…</Text></View>;
  if (error) return <View style={{ flex: 1, backgroundColor: BG, padding: 24, justifyContent: 'center' }}><Text style={{ color: RED, fontSize: 18, fontWeight: '900' }}>LAB 3D indisponible</Text><Text style={{ color: WHITE, marginTop: 8 }}>{String(error.message || error)}</Text><TinyButton label="Réessayer" onPress={() => { setLoading(true); reload(); }} /></View>;

  const unplaced = (data?.equipments || []).filter((item) => !Number(item.placed_3d));

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#091824', borderBottomWidth: 1, borderBottomColor: '#163548' }}>
        <View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 15 }}>{data?.nomSite || 'Site'} · LAB 3D</Text><Text style={{ color: MUTED, fontSize: 11 }}>{requestedVisitId ? 'Maquette du site · couche de la visite active' : 'Maquette permanente du site'} · {objects.length} équipement(s) · {networks.length} réseau(x)</Text></View>
        <TinyButton label="−" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom - 8, 28, 100) }))} />
        <TinyButton label="+" onPress={() => setCamera((c) => ({ ...c, zoom: clamp(c.zoom + 8, 28, 100) }))} />
        <TinyButton label="Centrer" onPress={() => setCamera((c) => ({ ...c, offsetX: 0, offsetY: 0, zoom: 52 }))} />
      </View>

      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(event) => setViewport({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height="100%" style={{ backgroundColor: BG }}>
          <SceneGrid viewport={viewport} camera={camera} step={data?.scene?.grid_step} />
          {networks.map((network) => (
            <React.Fragment key={network.id}>
              {(network.points || []).slice(0, -1).map((point, index) => {
                const a = project(point, viewport, camera); const b = project(network.points[index + 1], viewport, camera);
                return <Line key={`${network.id}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={NETWORK_COLORS[network.type_code] || NETWORK_COLORS.autre} strokeWidth={clamp(2 + num(network.diameter_mm, 50) / 35, 2.5, 8)} strokeLinecap="round" opacity={selectedNetworkId === network.id ? 1 : 0.82} onPress={() => { setSelectedNetworkId(network.id); setSelectedId(null); setMoveMode(false); }} />;
              })}
            </React.Fragment>
          ))}
          {objects.map((object) => (
            <React.Fragment key={object.id}>
              {object.params?.support?.type === 'masonry' ? <Cuboid object={object} viewport={viewport} camera={camera} support /> : null}
              <Cuboid object={object} viewport={viewport} camera={camera} selected={selectedId === object.id} />
              {(() => {
                const labelPoint = project({ x: object.x, y: object.y, z: num(object.z) + num(object.height) + 0.18 }, viewport, camera);
                return <SvgText x={labelPoint.x} y={labelPoint.y} fill={selectedId === object.id ? CYAN : '#DCEAF1'} fontSize="11" fontWeight="700" textAnchor="middle">{String(object.label || object.subtype || 'Équipement').slice(0, 24)}</SvgText>;
              })()}
              {(markersByObject.get(object.id) || []).map((remark, index) => {
                const marker = project({ x: num(object.x) + 0.25 + index * 0.12, y: num(object.y) - 0.2, z: num(object.z) + num(object.height) + 0.5 + index * 0.15 }, viewport, camera);
                return <React.Fragment key={remark.id}><Circle cx={marker.x} cy={marker.y} r={8} fill={RED} stroke="#FFF" strokeWidth={1.5} /><SvgText x={marker.x} y={marker.y + 3.5} fill="#FFF" fontSize="8" fontWeight="900" textAnchor="middle">!</SvgText></React.Fragment>;
              })}
            </React.Fragment>
          ))}
        </Svg>

        {objects.map((object) => {
          const center = project({ x: object.x, y: object.y, z: num(object.z) + num(object.height) * 0.5 }, viewport, camera);
          const hit = clamp(Math.max(num(object.width), num(object.depth)) * camera.zoom * 0.8, 42, 100);
          return <Pressable key={`hit-${object.id}`} onPress={() => selectObject(object)} onLongPress={() => { setSelectedId(object.id); setSelectedNetworkId(null); setMoveMode(true); }} delayLongPress={280} style={{ position: 'absolute', left: center.x - hit / 2, top: center.y - hit / 2, width: hit, height: hit, borderRadius: 8 }} />;
        })}

        {networkDraft ? <View style={{ position: 'absolute', left: 12, right: 12, top: 10, backgroundColor: '#16384BEE', borderRadius: 12, borderWidth: 1, borderColor: CYAN, padding: 10, flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>Réseau {networkLabel(networkDraft.typeCode)} · DN{networkDraft.diameterMm}</Text><Text style={{ color: '#C5E9F8', fontSize: 11 }}>Départ : {networkDraft.start.label}. Touchez l'équipement d'arrivée.</Text></View><TinyButton label="Annuler" onPress={() => setNetworkDraft(null)} /></View> : null}

        {moveMode && selected ? <View style={{ position: 'absolute', top: 10, right: 12, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#132C3BDD', borderWidth: 1, borderColor: AXIS[axis] }}><Text style={{ color: WHITE, fontWeight: '900', fontSize: 11 }}>Déplacement {axis} uniquement</Text><Text style={{ color: MUTED, fontSize: 10 }}>Glissez sur la scène · pas {data?.scene?.grid_step || 0.25} m</Text></View> : null}
      </View>

      <View style={{ backgroundColor: PANEL, borderTopWidth: 1, borderTopColor: '#284657', padding: 9 }}>
        {!selected && !selectedNetwork ? (
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <TinyButton flex label={`Équipements du site${unplaced.length ? ` (${unplaced.length})` : ''}`} onPress={() => setEquipmentModal(true)} />
            <TinyButton flex label="+ Nouvel équipement" onPress={() => setNewEquipmentModal(true)} />
          </View>
        ) : selected ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{selected.label}</Text><Text style={{ color: MUTED, fontSize: 10 }}>X {num(selected.x).toFixed(2)} · Y {num(selected.y).toFixed(2)} · Z {num(selected.z).toFixed(2)} m · {num(selected.width).toFixed(2)}×{num(selected.depth).toFixed(2)}×{num(selected.height).toFixed(2)} m</Text></View><TouchableOpacity onPress={() => { setSelectedId(null); setMoveMode(false); }}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TinyButton label={moveMode ? '✓ Déplacer' : 'Déplacer'} active={moveMode} onPress={() => setMoveMode((value) => !value)} />
              {['X','Y','Z'].map((value) => <TinyButton key={value} label={value} active={axis === value} onPress={() => { setAxis(value); setMoveMode(true); }} />)}
              <TinyButton label="− pas" onPress={() => moveByStep(-1)} />
              <TinyButton label="+ pas" onPress={() => moveByStep(1)} />
              <TinyButton label="↶ 90°" onPress={() => rotate(-1)} />
              <TinyButton label="↷ 90°" onPress={() => rotate(1)} />
              <TinyButton label="Dimensions" onPress={openDimensions} />
              <TinyButton label={selected.params?.support?.type === 'masonry' ? 'Retirer socle' : '+ Socle maçonné'} active={selected.params?.support?.type === 'masonry'} onPress={toggleBase} />
              <TinyButton label="+ Réseau" onPress={startNetwork} />
              <TinyButton danger label="Retirer 3D" onPress={deleteSelected} />
            </ScrollView>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}><View style={{ flex: 1 }}><Text style={{ color: WHITE, fontWeight: '900' }}>{networkLabel(selectedNetwork.type_code)}</Text><Text style={{ color: MUTED, fontSize: 10 }}>DN{selectedNetwork.diameter_mm || '-'} · tracé orthogonal entre équipements</Text></View><TouchableOpacity onPress={() => setSelectedNetworkId(null)}><Text style={{ color: MUTED, fontSize: 22 }}>×</Text></TouchableOpacity></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={Number(selectedNetwork.diameter_mm) === dn} onPress={() => changeNetworkDn(dn)} />)}
              <TinyButton danger label="Supprimer réseau" onPress={deleteNetwork} />
            </ScrollView>
          </>
        )}
      </View>

      <Modal visible={equipmentModal} transparent animationType="slide" onRequestClose={() => setEquipmentModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ maxHeight: '78%', backgroundColor: PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Équipements du site</Text><Text style={{ color: MUTED, marginTop: 3, marginBottom: 12 }}>La maquette utilise le patrimoine permanent du site. Un équipement retiré de la 3D reste dans le patrimoine.</Text><ScrollView>{unplaced.length ? unplaced.map((equipment) => <TouchableOpacity key={equipment.id} onPress={() => placeEquipment(equipment)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{equipment.visualProfile?.icon} {equipment.designation || equipment.visualProfile?.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>{[equipment.marque, equipment.modele].filter(Boolean).join(' · ') || 'Modèle générique paramétrique'} · {equipment.visualProfile?.source === 'generic' ? 'fallback 3D générique' : 'profil 3D reconnu'}</Text></TouchableOpacity>) : <Text style={{ color: MUTED, paddingVertical: 20 }}>Tous les équipements actifs du site sont déjà placés.</Text>}</ScrollView><TinyButton label="Fermer" onPress={() => setEquipmentModal(false)} /></View></View>
      </Modal>

      <Modal visible={newEquipmentModal} transparent animationType="slide" onRequestClose={() => setNewEquipmentModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ maxHeight: '82%', backgroundColor: PANEL, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Ajouter depuis la 3D</Text><Text style={{ color: MUTED, marginTop: 3, marginBottom: 12 }}>L'équipement sera immédiatement ajouté au patrimoine permanent du site puis placé dans la maquette.</Text><ScrollView>{LAB3D_EQUIPMENT_PRESETS.map((preset) => <TouchableOpacity key={preset.code} onPress={() => createEquipment(preset)} style={{ padding: 12, backgroundColor: PANEL_2, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#315266' }}><Text style={{ color: WHITE, fontWeight: '900' }}>{preset.icon} {preset.label}</Text><Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Base {preset.width} × {preset.depth} × {preset.height} m · dimensions modifiables</Text></TouchableOpacity>)}</ScrollView><TinyButton label="Fermer" onPress={() => setNewEquipmentModal(false)} /></View></View>
      </Modal>

      <Modal visible={dimensionModal} transparent animationType="fade" onRequestClose={() => setDimensionModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 18 }}><ScrollView style={{ maxHeight: '90%', backgroundColor: PANEL, borderRadius: 18, padding: 16 }} keyboardShouldPersistTaps="handled"><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900', marginBottom: 12 }}>Équipement & dimensions</Text><Field label="Désignation" value={editForm.designation} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, designation: value }))} /><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Marque" value={editForm.marque} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, marque: value }))} /></View><View style={{ flex: 1 }}><Field label="Modèle" value={editForm.modele} keyboardType="default" onChangeText={(value) => setEditForm((f) => ({ ...f, modele: value }))} /></View></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Largeur X (m)" value={editForm.width} onChangeText={(value) => setEditForm((f) => ({ ...f, width: value }))} /></View><View style={{ flex: 1 }}><Field label="Longueur Y (m)" value={editForm.depth} onChangeText={(value) => setEditForm((f) => ({ ...f, depth: value }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur (m)" value={editForm.height} onChangeText={(value) => setEditForm((f) => ({ ...f, height: value }))} /></View></View><Field label="Hauteur par rapport au sol Z (m)" value={editForm.z} onChangeText={(value) => setEditForm((f) => ({ ...f, z: value }))} />{selected?.params?.support?.type === 'masonry' ? <View style={{ marginTop: 5, padding: 12, backgroundColor: '#182C35', borderRadius: 12 }}><Text style={{ color: WHITE, fontWeight: '900', marginBottom: 8 }}>Socle maçonné</Text><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Débord par côté (m)" value={editForm.supportOverhang} onChangeText={(value) => setEditForm((f) => ({ ...f, supportOverhang: value }))} /></View><View style={{ flex: 1 }}><Field label="Hauteur socle (m)" value={editForm.supportHeight} onChangeText={(value) => setEditForm((f) => ({ ...f, supportHeight: value }))} /></View></View><Text style={{ color: MUTED, fontSize: 10 }}>Longueur et largeur du socle sont recalculées automatiquement à partir de l'équipement + le débord.</Text></View> : null}<View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 22 }}><TinyButton flex label="Annuler" onPress={() => setDimensionModal(false)} /><TinyButton flex active label="Enregistrer" onPress={saveDimensions} /></View></ScrollView></View>
      </Modal>

      <Modal visible={networkModal} transparent animationType="fade" onRequestClose={() => setNetworkModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 18 }}><View style={{ backgroundColor: PANEL, borderRadius: 18, padding: 16, maxHeight: '88%' }}><Text style={{ color: WHITE, fontSize: 18, fontWeight: '900' }}>Créer un réseau</Text><Text style={{ color: MUTED, marginTop: 4, marginBottom: 10 }}>Départ : {selected?.label}. Choisis le type et le diamètre, puis touche l'équipement d'arrivée.</Text><Text style={{ color: MUTED, fontWeight: '800', fontSize: 11, marginBottom: 6 }}>TYPE DE RÉSEAU</Text><ScrollView style={{ maxHeight: 250 }}>{LAB3D_NETWORK_TYPES.map((item) => <TouchableOpacity key={item.code} onPress={() => setNetworkType(item.code)} style={{ padding: 10, borderRadius: 9, marginBottom: 5, backgroundColor: networkType === item.code ? '#174B63' : PANEL_2, borderWidth: 1, borderColor: networkType === item.code ? CYAN : '#345567' }}><Text style={{ color: WHITE, fontWeight: '800' }}>{item.label}</Text></TouchableOpacity>)}</ScrollView><Text style={{ color: MUTED, fontWeight: '800', fontSize: 11, marginTop: 10, marginBottom: 6 }}>DIAMÈTRE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{LAB3D_DN.map((dn) => <TinyButton key={dn} label={`DN${dn}`} active={networkDn === dn} onPress={() => setNetworkDn(dn)} />)}</ScrollView><View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TinyButton flex label="Annuler" onPress={() => setNetworkModal(false)} /><TinyButton flex active label="Choisir l'arrivée" onPress={confirmNetworkStart} /></View></View></View>
      </Modal>
    </View>
  );
}
