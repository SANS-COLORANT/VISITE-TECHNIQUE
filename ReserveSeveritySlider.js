/** Slider tactile discret 0..5 pour la criticité des réserves. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { COLORS } from './styles.js';
import { clampReserveSeverity, reserveSeverityLabel } from './reserveSeverity.js';

const MAX_SEVERITY = 5;

export function ReserveSeveritySlider({ value = 2, defaultValue = null, onChange, compact = false }) {
  const initial = clampReserveSeverity(value);
  const [current, setCurrent] = useState(initial);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(0);
  const currentRef = useRef(initial);
  const startRef = useRef(initial);

  useEffect(() => {
    const v = clampReserveSeverity(value);
    setCurrent(v);
    currentRef.current = v;
  }, [value]);

  const trackInset = compact ? 19 : 23;
  const bubbleWidth = compact ? 40 : 48;
  const bubbleHeight = compact ? 28 : 32;
  const sliderHeight = compact ? 56 : 64;
  const trackTop = compact ? 35 : 40;

  const setFromX = (x) => {
    const w = Math.max(trackInset * 2 + 1, widthRef.current);
    const usable = Math.max(1, w - trackInset * 2);
    const clampedX = Math.max(trackInset, Math.min(w - trackInset, Number(x) || 0));
    const v = clampReserveSeverity(Math.round(((clampedX - trackInset) / usable) * MAX_SEVERITY));
    currentRef.current = v;
    setCurrent(v);
    return v;
  };

  const commitCurrent = () => {
    setDragging(false);
    onChange?.(currentRef.current);
  };

  const panResponder = useMemo(() => PanResponder.create({
    // Le slider prend le geste dès le premier contact. Le PanResponder de
    // navigation de la visite ne peut donc pas transformer ce glissement en
    // changement de page/onglet.
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      startRef.current = currentRef.current;
      setDragging(true);
      setFromX(evt.nativeEvent.locationX);
    },
    onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderRelease: commitCurrent,
    onPanResponderTerminate: commitCurrent,
  }), [onChange, compact]);

  const proposed = defaultValue === null || defaultValue === undefined ? null : clampReserveSeverity(defaultValue);
  const adjusted = proposed !== null && proposed !== current;
  const usableWidth = Math.max(0, width - trackInset * 2);
  const thumbCenter = trackInset + (current / MAX_SEVERITY) * usableWidth;
  const bubbleLeft = Math.max(0, Math.min(Math.max(0, width - bubbleWidth), thumbCenter - bubbleWidth / 2));

  const changeAccessible = (delta) => {
    const next = clampReserveSeverity(currentRef.current + delta);
    currentRef.current = next;
    setCurrent(next);
    onChange?.(next);
  };

  return <View style={{ marginTop: compact ? 6 : 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
      <Text style={{ color: COLORS.ink, fontSize: compact ? 10 : 11, fontWeight: '900' }}>Criticité · {current}/5 — {reserveSeverityLabel(current)}</Text>
      {proposed !== null ? <Text style={{ color: adjusted ? COLORS.orangeDark : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{adjusted ? `ajustée · défaut ${proposed}` : 'valeur proposée'}</Text> : null}
    </View>

    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Criticité de la réserve"
      accessibilityValue={{ min: 0, max: MAX_SEVERITY, now: current, text: reserveSeverityLabel(current) }}
      accessibilityActions={[{ name: 'increment', label: 'Augmenter la criticité' }, { name: 'decrement', label: 'Diminuer la criticité' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') changeAccessible(1);
        if (event.nativeEvent.actionName === 'decrement') changeAccessible(-1);
      }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      }}
      {...panResponder.panHandlers}
      style={{ height: sliderHeight, position: 'relative' }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: trackInset, right: trackInset, top: trackTop, height: 8, borderRadius: 4, backgroundColor: COLORS.line, overflow: 'hidden' }}>
        <View style={{ width: `${(current / MAX_SEVERITY) * 100}%`, height: 8, borderRadius: 4, backgroundColor: COLORS.orange }} />
      </View>

      {width ? [0, 1, 2, 3, 4, 5].map((v) => {
        const x = trackInset + (v / MAX_SEVERITY) * usableWidth;
        return <View key={v} pointerEvents="none" style={{ position: 'absolute', left: x - 3, top: trackTop - 2, width: 6, height: 12, borderRadius: 3, backgroundColor: v <= current ? COLORS.orangeDark : COLORS.inkFaint }} />;
      }) : null}

      {width ? <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: bubbleLeft,
          top: dragging ? 0 : 2,
          width: bubbleWidth,
          height: bubbleHeight,
          borderRadius: bubbleHeight / 2,
          borderWidth: 2,
          borderColor: COLORS.orange,
          backgroundColor: dragging ? COLORS.orange : COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: dragging ? 5 : 2,
          shadowColor: '#000',
          shadowOpacity: dragging ? 0.18 : 0.10,
          shadowRadius: dragging ? 5 : 3,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Text style={{ color: dragging ? COLORS.white : COLORS.orangeDark, fontSize: compact ? 11 : 12, fontWeight: '900' }}>{current}/5</Text>
      </View> : null}
    </View>

    <View pointerEvents="none" style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}>
      <Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>0 · Information</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>Glisser pour ajuster</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 8 }}>5 · Critique</Text>
    </View>
  </View>;
}
