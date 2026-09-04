/** Courbe de chauffe tactile : points historiques conservés, abscisses et ordonnées modifiables. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import {
  ajouterPointCourbePreAllumage,
  listerPointsCourbePreAllumage,
  mettreAJourPointCourbePreAllumage,
  supprimerPointCourbePreAllumage,
} from './preAllumageHeatCurveDb.js';
import { COLORS } from './styles.js';

const X_MIN = -25;
const X_MAX = 30;
const Y_MIN = 10;
const Y_MAX = 90;
const H = 260;
const LEFT = 44;
const RIGHT = 18;
const TOP = 24;
const BOTTOM = 58;
const X_TICKS = [-20, -10, 0, 10, 20, 30];
const Y_TICKS = [10, 30, 50, 70, 90];

function numeric(v) {
  const texte = String(v ?? '').trim();
  if (!texte) return null;
  const n = Number(texte.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function formatNombre(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 10) / 10).replace('.', ',');
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function arrondiDemi(v) { return Math.round(v * 2) / 2; }
function findTncField(fields) {
  return (fields || []).find((c) => /Température de non chauffe/i.test(`${c.libelle || ''} ${c.field?.cle || ''}`));
}

function PointEditor({ point, onSave, onDelete }) {
  const [outdoor, setOutdoor] = useState(formatNombre(point.outdoor));
  const [water, setWater] = useState(point.water === null ? '' : formatNombre(point.water));
  useEffect(() => { setOutdoor(formatNombre(point.outdoor)); }, [point.outdoor]);
  useEffect(() => { setWater(point.water === null ? '' : formatNombre(point.water)); }, [point.water]);

  const save = () => {
    const x = numeric(outdoor); const y = numeric(water);
    if (x === null) { setOutdoor(formatNombre(point.outdoor)); return; }
    onSave({ outdoor: clamp(x, X_MIN, X_MAX), water: y === null ? point.water : clamp(y, Y_MIN, Y_MAX) });
  };

  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#EAECF0' }}>
    <View style={{ width: 78 }}>
      <Text style={{ color: COLORS.inkSoft, fontSize: 8, fontWeight: '800', marginBottom: 2 }}>T° EXT.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, backgroundColor: '#FFFFFF' }}>
        <TextInput value={outdoor} onChangeText={setOutdoor} onBlur={save} onSubmitEditing={save} keyboardType="decimal-pad" inputMode="decimal" style={{ flex: 1, minHeight: 34, paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: '800', color: COLORS.ink }} />
        <Text style={{ paddingRight: 6, color: COLORS.inkSoft, fontSize: 9 }}>°C</Text>
      </View>
    </View>
    <Text style={{ color: COLORS.inkSoft, fontWeight: '900', marginTop: 12 }}>→</Text>
    <View style={{ width: 78 }}>
      <Text style={{ color: COLORS.inkSoft, fontSize: 8, fontWeight: '800', marginBottom: 2 }}>T° EAU</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, backgroundColor: '#FFFFFF' }}>
        <TextInput value={water} onChangeText={setWater} onBlur={save} onSubmitEditing={save} keyboardType="decimal-pad" inputMode="decimal" style={{ flex: 1, minHeight: 34, paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: '800', color: COLORS.ink }} />
        <Text style={{ paddingRight: 6, color: COLORS.inkSoft, fontSize: 9 }}>°C</Text>
      </View>
    </View>
    <View style={{ flex: 1, paddingTop: 12 }}><Text style={{ color: point.base ? COLORS.inkSoft : COLORS.orangeDark, fontSize: 9, fontWeight: '800' }}>{point.base ? 'Point historique' : 'Point ajouté'}</Text></View>
    {!point.base ? <TouchableOpacity onPress={onDelete} style={{ width: 34, height: 34, marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#F4C7C7', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF6F6' }}><Text style={{ color: COLORS.red, fontWeight: '900' }}>✕</Text></TouchableOpacity> : null}
  </View>;
}

export function PreAllumageHeatCurve({ visiteId, sectionCode, fields = [], champsMap = {}, onSaved, onStructureChanged }) {
  const [width, setWidth] = useState(0);
  const [points, setPoints] = useState([]);
  const pointsRef = useRef([]);
  const selectedIdRef = useRef(null);
  const dragOriginRef = useRef(null);
  const tncDef = useMemo(() => findTncField(fields), [fields]);

  const recharger = async () => {
    const rows = await listerPointsCourbePreAllumage(visiteId, sectionCode);
    pointsRef.current = rows;
    setPoints(rows);
    return rows;
  };

  useEffect(() => { recharger().catch((e) => console.warn('Courbe de chauffe', e)); }, [visiteId, sectionCode, fields.length]);
  useEffect(() => {
    setPoints((current) => {
      const next = current.map((p) => {
        const v = numeric(champsMap[`${sectionCode}||${p.cle}`]);
        return v === null || v === p.water ? p : { ...p, water: v };
      });
      pointsRef.current = next;
      return next;
    });
  }, [champsMap, sectionCode]);

  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const plotHeight = H - TOP - BOTTOM;
  const xPx = (outdoor) => LEFT + ((outdoor - X_MIN) / (X_MAX - X_MIN)) * plotWidth;
  const yPx = (water) => TOP + (1 - ((water - Y_MIN) / (Y_MAX - Y_MIN))) * plotHeight;
  const outdoorFromX = (x) => arrondiDemi(X_MIN + ((clamp(x, LEFT, LEFT + plotWidth) - LEFT) / plotWidth) * (X_MAX - X_MIN));
  const waterFromY = (y) => arrondiDemi(Y_MIN + (1 - ((clamp(y, TOP, TOP + plotHeight) - TOP) / plotHeight)) * (Y_MAX - Y_MIN));

  const nearestPoint = (x, y) => {
    let id = null; let dist = Infinity;
    for (const p of pointsRef.current) {
      const cy = yPx(p.water === null ? Y_MIN : p.water);
      const d = Math.hypot(xPx(p.outdoor) - x, cy - y);
      if (d < dist) { dist = d; id = p.id; }
    }
    return dist <= 34 ? id : null;
  };

  const updateFromTouch = (x, y) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const next = pointsRef.current.map((p) => p.id === id ? { ...p, outdoor: outdoorFromX(x), water: waterFromY(y) } : p).sort((a, b) => a.outdoor - b.outdoor);
    pointsRef.current = next;
    setPoints(next);
  };

  const persistSelected = async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const point = pointsRef.current.find((p) => p.id === id);
    if (!point) return;
    const origine = dragOriginRef.current;
    const saved = await mettreAJourPointCourbePreAllumage(visiteId, sectionCode, id, { outdoor: point.outdoor, water: point.water });
    const stored = saved.water === null ? '' : formatNombre(saved.water);
    if (stored) onSaved?.(`${sectionCode}||${saved.cle}`, stored);
    const xChanged = origine && Math.abs(Number(origine.outdoor) - Number(saved.outdoor)) > 0.001;
    selectedIdRef.current = null;
    dragOriginRef.current = null;
    await recharger();
    if (xChanged) onStructureChanged?.();
  };

  const responder = useMemo(() => PanResponder.create({
    // Le graphe capture explicitement le geste avant le PanResponder de navigation
    // de la visite. Un drag horizontal d'un point ne peut donc plus changer d'onglet.
    onStartShouldSetPanResponderCapture: (evt) => Boolean(nearestPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY)),
    onMoveShouldSetPanResponderCapture: () => Boolean(selectedIdRef.current),
    onStartShouldSetPanResponder: (evt) => Boolean(nearestPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY)),
    onMoveShouldSetPanResponder: (evt) => Boolean(selectedIdRef.current || nearestPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY)),
    onPanResponderGrant: (evt) => {
      const id = nearestPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      selectedIdRef.current = id;
      dragOriginRef.current = pointsRef.current.find((p) => p.id === id) || null;
      if (id) updateFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt) => updateFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: () => persistSelected().catch((e) => Alert.alert('Courbe de chauffe', e.message)),
    onPanResponderTerminate: () => persistSelected().catch((e) => Alert.alert('Courbe de chauffe', e.message)),
  }), [width, points.length, visiteId, sectionCode]);

  const sauvegarderPoint = async (point, patch) => {
    try {
      const saved = await mettreAJourPointCourbePreAllumage(visiteId, sectionCode, point.id, patch);
      if (saved.water !== null) onSaved?.(`${sectionCode}||${saved.cle}`, formatNombre(saved.water));
      await recharger();
      if (Number(saved.outdoor) !== Number(point.outdoor)) onStructureChanged?.();
    } catch (e) { Alert.alert('Courbe de chauffe', e.message); }
  };
  const ajouter = async () => {
    try {
      const p = await ajouterPointCourbePreAllumage(visiteId, sectionCode);
      onSaved?.(`${sectionCode}||${p.cle}`, formatNombre(p.water));
      await recharger();
      onStructureChanged?.();
    } catch (e) { Alert.alert('Courbe de chauffe', e.message); }
  };
  const supprimer = (point) => Alert.alert('Supprimer ce point ?', `${formatNombre(point.outdoor)} °C extérieur`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: async () => {
      try { await supprimerPointCourbePreAllumage(visiteId, sectionCode, point.id); await recharger(); onStructureChanged?.(); }
      catch (e) { Alert.alert('Courbe de chauffe', e.message); }
    } },
  ]);

  const validPoints = points.filter((p) => p.water !== null).map((p) => `${xPx(p.outdoor)},${yPx(p.water)}`).join(' ');
  const tnc = tncDef ? numeric(champsMap[`${sectionCode}||${tncDef.field.cle}`]) : null;
  const tncVisible = tnc !== null && tnc >= X_MIN && tnc <= X_MAX;

  if (!points.length) return null;
  return <View style={{ marginVertical: 6, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FBFCFD', borderRadius: 12, padding: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900' }}>Courbe de chauffe</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 2 }}>Glissez un point horizontalement (T° extérieure) et verticalement (T° eau).</Text></View>
      <TouchableOpacity onPress={ajouter} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: COLORS.orange }}><Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 10 }}>+ Point</Text></TouchableOpacity>
    </View>
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers} style={{ height: H, marginTop: 5 }}>
      {width ? <Svg width={width} height={H} pointerEvents="none">
        <G>
          {Y_TICKS.map((y) => <G key={`y-${y}`}><Line x1={LEFT} y1={yPx(y)} x2={width - RIGHT} y2={yPx(y)} stroke="#E4E7EC" strokeWidth="1" /><SvgText x={LEFT - 7} y={yPx(y) + 4} textAnchor="end" fontSize="9" fill="#667085">{y}°</SvgText></G>)}
          {X_TICKS.map((x) => <G key={`x-${x}`}><Line x1={xPx(x)} y1={TOP} x2={xPx(x)} y2={TOP + plotHeight} stroke="#EAECF0" strokeWidth="1" /><SvgText x={xPx(x)} y={TOP + plotHeight + 19} textAnchor="middle" fontSize="9" fill="#667085">{x}</SvgText></G>)}
          <SvgText x={(LEFT + width - RIGHT) / 2} y={H - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#667085">Température extérieure (°C)</SvgText>
          <SvgText x={10} y={TOP + 5} textAnchor="start" fontSize="8" fontWeight="700" fill="#667085">Eau °C</SvgText>
          {tncVisible ? <G><Line x1={xPx(tnc)} y1={TOP} x2={xPx(tnc)} y2={TOP + plotHeight} stroke="#F79009" strokeWidth="1.5" strokeDasharray="5 4" /><SvgText x={xPx(tnc)} y={TOP + 10} textAnchor="middle" fontSize="8" fill="#B54708">TNC {formatNombre(tnc)}°</SvgText></G> : null}
          {validPoints ? <Polyline points={validPoints} fill="none" stroke="#F97316" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.map((p) => {
            const cy = yPx(p.water === null ? Y_MIN : p.water);
            return <G key={p.id}>
              <Circle cx={xPx(p.outdoor)} cy={cy} r="10" fill={p.water === null ? '#FFFFFF' : '#F97316'} stroke="#F97316" strokeWidth="3" />
              <SvgText x={xPx(p.outdoor)} y={Math.max(12, cy - 15)} textAnchor="middle" fontSize="9" fontWeight="700" fill="#344054">{formatNombre(p.outdoor)}° ext.</SvgText>
              <SvgText x={xPx(p.outdoor)} y={Math.min(TOP + plotHeight - 4, cy + 4)} textAnchor="middle" fontSize="8" fontWeight="800" fill={p.water === null ? '#667085' : '#FFFFFF'}>{p.water === null ? '—' : formatNombre(p.water)}</SvgText>
            </G>;
          })}
        </G>
      </Svg> : null}
    </View>
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 10, fontWeight: '900' }}>Points de la courbe</Text><Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>{points.length} point{points.length > 1 ? 's' : ''}</Text></View>
      {points.map((p) => <PointEditor key={p.id} point={p} onSave={(patch) => sauvegarderPoint(p, patch)} onDelete={() => supprimer(p)} />)}
    </View>
    <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 5 }}>Les trois points historiques restent présents. Toute modification ou ajout est repris dans les champs, l’Excel et les rapports.</Text>
  </View>;
}
