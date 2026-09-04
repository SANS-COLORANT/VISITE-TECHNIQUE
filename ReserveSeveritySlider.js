/** Slider tactile discret 0..5 pour la criticité des réserves. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { COLORS } from './styles.js';
import { clampReserveSeverity, reserveSeverityLabel } from './reserveSeverity.js';

export function ReserveSeveritySlider({ value = 2, defaultValue = null, onChange, compact = false }) {
  const initial = clampReserveSeverity(value);
  const [current, setCurrent] = useState(initial);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const currentRef = useRef(initial);
  const startRef = useRef(initial);

  useEffect(() => {
    const v = clampReserveSeverity(value);
    setCurrent(v);
    currentRef.current = v;
  }, [value]);

  const setFromX = (x) => {
    const w = Math.max(1, widthRef.current);
    const v = clampReserveSeverity(Math.round((Math.max(0, Math.min(w, x)) / w) * 5));
    currentRef.current = v;
    setCurrent(v);
    return v;
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      startRef.current = currentRef.current;
      setFromX(evt.nativeEvent.locationX);
    },
    onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
    onPanResponderRelease: () => {
      const next = currentRef.current;
      if (next !== startRef.current) onChange?.(next);
      else onChange?.(next);
    },
    onPanResponderTerminate: () => onChange?.(currentRef.current),
  }), [onChange]);

  const proposed = defaultValue === null || defaultValue === undefined ? null : clampReserveSeverity(defaultValue);
  const adjusted = proposed !== null && proposed !== current;
  const thumbLeft = width ? Math.max(0, Math.min(width - 22, (current / 5) * width - 11)) : 0;

  return <View style={{ marginTop: compact ? 6 : 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 7 }}>
      <Text style={{ color: COLORS.ink, fontSize: compact ? 10 : 11, fontWeight: '900' }}>Criticité · {current}/5 — {reserveSeverityLabel(current)}</Text>
      {proposed !== null ? <Text style={{ color: adjusted ? COLORS.orangeDark : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{adjusted ? `ajustée · défaut ${proposed}` : 'valeur proposée'}</Text> : null}
    </View>
    <View
      onLayout={(e) => { const w = e.nativeEvent.layout.width; widthRef.current = w; setWidth(w); }}
      {...panResponder.panHandlers}
      style={{ height: compact ? 42 : 48, justifyContent: 'center', paddingVertical: 8 }}
    >
      <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.line, overflow: 'hidden' }}>
        <View style={{ width: `${(current / 5) * 100}%`, height: 6, borderRadius: 3, backgroundColor: COLORS.orange }} />
      </View>
      {[0, 1, 2, 3, 4, 5].map((v) => <View key={v} pointerEvents="none" style={{ position: 'absolute', left: `${(v / 5) * 100}%`, marginLeft: -2, top: compact ? 18 : 21, width: 4, height: 10, borderRadius: 2, backgroundColor: v <= current ? COLORS.orangeDark : COLORS.inkFaint }} />)}
      {width ? <View pointerEvents="none" style={{ position: 'absolute', left: thumbLeft, top: compact ? 9 : 11, width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: COLORS.orange, backgroundColor: COLORS.white }} /> : null}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}><Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>0 · Information</Text><Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>5 · Critique</Text></View>
  </View>;
}
