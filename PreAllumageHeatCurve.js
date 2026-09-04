/** Graphe tactile de courbe de chauffe construit à partir des trois points de la trame. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { upsertChamp } from './db.js';
import { COLORS } from './styles.js';

const OUTDOOR_POINTS = [-7, 12, 19];
const Y_MIN = 10;
const Y_MAX = 90;
const H = 220;
const LEFT = 42;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 36;

function numeric(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function findCurveField(fields, outdoor) {
  const target = String(outdoor).replace('-', '\\-');
  const rx = new RegExp(`Courbe de chauffe.*Pour\\s*${target}°?C`, 'i');
  return (fields || []).find((c) => rx.test(`${c.libelle || ''} ${c.field?.cle || ''}`));
}
function findTncField(fields) {
  return (fields || []).find((c) => /Température de non chauffe/i.test(`${c.libelle || ''} ${c.field?.cle || ''}`));
}

export function PreAllumageHeatCurve({ visiteId, sectionCode, fields = [], champsMap = {}, onSaved }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const selectedRef = useRef(0);
  const valuesRef = useRef([null, null, null]);
  const fieldDefs = useMemo(() => OUTDOOR_POINTS.map((x) => findCurveField(fields, x)), [fields]);
  const tncDef = useMemo(() => findTncField(fields), [fields]);
  const sourceValues = useMemo(() => fieldDefs.map((c) => c ? numeric(champsMap[`${sectionCode}||${c.field.cle}`]) : null), [fieldDefs, champsMap, sectionCode]);
  const [values, setValues] = useState(sourceValues);

  useEffect(() => { setValues(sourceValues); valuesRef.current = sourceValues; }, [sourceValues.join('|')]);

  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const plotHeight = H - TOP - BOTTOM;
  const xPx = (outdoor) => LEFT + ((outdoor + 10) / 32) * plotWidth;
  const yPx = (water) => TOP + (1 - ((water - Y_MIN) / (Y_MAX - Y_MIN))) * plotHeight;
  const waterFromY = (y) => {
    const clipped = Math.max(TOP, Math.min(TOP + plotHeight, y));
    return Math.round((Y_MIN + (1 - ((clipped - TOP) / plotHeight)) * (Y_MAX - Y_MIN)) * 2) / 2;
  };
  const nearestPoint = (x) => {
    let idx = 0; let dist = Infinity;
    OUTDOOR_POINTS.forEach((o, i) => { const d = Math.abs(xPx(o) - x); if (d < dist) { dist = d; idx = i; } });
    return idx;
  };
  const updateFromTouch = (x, y) => {
    const idx = selectedRef.current;
    const next = [...valuesRef.current]; next[idx] = waterFromY(y); valuesRef.current = next; setValues(next);
  };
  const persist = async () => {
    const idx = selectedRef.current; const def = fieldDefs[idx]; const value = valuesRef.current[idx];
    if (!def || value === null) return;
    const stored = String(value).replace('.', ',');
    await upsertChamp(visiteId, sectionCode, def.field.cle, stored);
    onSaved?.(`${sectionCode}||${def.field.cle}`, stored);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      selectedRef.current = nearestPoint(evt.nativeEvent.locationX);
      updateFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
    },
    onPanResponderMove: (evt) => updateFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    onPanResponderRelease: () => persist().catch(console.warn),
    onPanResponderTerminate: () => persist().catch(console.warn),
  }), [width, fieldDefs, sectionCode, visiteId]);

  const validPoints = OUTDOOR_POINTS.map((o, i) => values[i] === null ? null : `${xPx(o)},${yPx(values[i])}`).filter(Boolean).join(' ');
  const tnc = tncDef ? numeric(champsMap[`${sectionCode}||${tncDef.field.cle}`]) : null;
  const tncVisible = tnc !== null && tnc >= -10 && tnc <= 22;

  if (!fieldDefs.some(Boolean)) return null;
  return <View style={{ marginVertical: 6, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FBFCFD', borderRadius: 12, padding: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '900' }}>Courbe de chauffe</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9, fontWeight: '700' }}>Glissez un point verticalement</Text></View>
    <View onLayout={(e) => { const w = e.nativeEvent.layout.width; widthRef.current = w; setWidth(w); }} {...responder.panHandlers} style={{ height: H, marginTop: 5 }}>
      {width ? <Svg width={width} height={H} pointerEvents="none">
        <G>
          {[10, 30, 50, 70, 90].map((y) => <G key={y}><Line x1={LEFT} y1={yPx(y)} x2={width - RIGHT} y2={yPx(y)} stroke="#E4E7EC" strokeWidth="1" /><SvgText x={LEFT - 7} y={yPx(y) + 4} textAnchor="end" fontSize="9" fill="#667085">{y}°</SvgText></G>)}
          {OUTDOOR_POINTS.map((x) => <G key={x}><Line x1={xPx(x)} y1={TOP} x2={xPx(x)} y2={TOP + plotHeight} stroke="#EAECF0" strokeWidth="1" /><SvgText x={xPx(x)} y={H - 15} textAnchor="middle" fontSize="9" fill="#667085">{x}°C ext.</SvgText></G>)}
          {tncVisible ? <G><Line x1={xPx(tnc)} y1={TOP} x2={xPx(tnc)} y2={TOP + plotHeight} stroke="#F79009" strokeWidth="1.5" strokeDasharray="5 4" /><SvgText x={xPx(tnc)} y={TOP + 10} textAnchor="middle" fontSize="8" fill="#B54708">TNC {tnc}°</SvgText></G> : null}
          {validPoints ? <Polyline points={validPoints} fill="none" stroke="#F97316" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {OUTDOOR_POINTS.map((x, i) => {
            const v = values[i]; const cy = yPx(v === null ? Y_MIN : v);
            return <G key={`p-${x}`}><Circle cx={xPx(x)} cy={cy} r="9" fill={v === null ? '#FFFFFF' : '#F97316'} stroke="#F97316" strokeWidth="3" /><SvgText x={xPx(x)} y={Math.max(12, cy - 13)} textAnchor="middle" fontSize="10" fontWeight="700" fill="#344054">{v === null ? '—' : `${v}°`}</SvgText></G>;
          })}
        </G>
      </Svg> : null}
    </View>
    <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 2 }}>Les valeurs numériques restent modifiables dans les champs ci-dessous. Le graphe et les champs utilisent exactement les mêmes données.</Text>
  </View>;
}
