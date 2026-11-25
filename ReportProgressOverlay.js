import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS, FONTS } from './styles.js';

// Full-screen progress shown while a PDF or Word report is generated.
// It reads the same `pdfProgress` text and `pdfDetail` ({ phase, done, total,
// doc?, docs? }) that the exporter already emits, maps each phase to a slice of
// one overall percentage, and animates towards it so the bar never jumps or
// freezes. Purely visual: it never changes what is exported.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PDF_STEPS = [
  { key: 'prep', label: 'Préparation', from: 0, to: 4 },
  { key: 'data', label: 'Données de visite', from: 4, to: 12 },
  { key: 'photos', label: 'Photos', from: 12, to: 50 },
  { key: 'print', label: 'Mise en page', from: 50, to: 86 },
  { key: 'merge', label: 'Assemblage', from: 86, to: 94 },
  { key: 'save', label: 'Enregistrement', from: 94, to: 99 },
];
const WORD_STEPS = [
  { key: 'prep', label: 'Préparation', from: 0, to: 6 },
  { key: 'print', label: 'Mise en page Word', from: 6, to: 88 },
  { key: 'save', label: 'Enregistrement', from: 88, to: 99 },
];

function stepKeyOf(phase) {
  const p = String(phase || '').toLowerCase();
  if (p.startsWith('donn')) return 'data';
  if (p.startsWith('photo')) return 'photos';
  if (p.startsWith('impression') || p.startsWith('mise en page')) return 'print';
  if (p.startsWith('pagination') || p.startsWith('assemblage')) return 'merge';
  if (p.startsWith('enregistrement')) return 'save';
  if (p.startsWith('termin')) return 'done';
  return 'prep';
}

function docPosition(detail) {
  const docs = Math.max(1, detail?.docs || 1);
  return { docs, doc: Math.min(docs, Math.max(1, detail?.doc || 1)) };
}

function targetPercent(steps, detail) {
  if (!detail) return 2;
  const key = stepKeyOf(detail.phase);
  let docPct;
  if (key === 'done') docPct = 100;
  else {
    const step = steps.find((s) => s.key === key) || steps[0];
    const ratio = Math.max(0, Math.min(1, (detail.done || 0) / Math.max(1, detail.total || 1)));
    docPct = step.from + (step.to - step.from) * ratio;
  }
  const { doc, docs } = docPosition(detail);
  return ((doc - 1) * 100 + docPct) / docs;
}

// Progress state and motion: target percentage, glide, creep and loops.
function useReportProgress({ visible, format, status, detail }) {
  const steps = format === 'word' ? WORD_STEPS : PDF_STEPS;
  const progress = useRef(new Animated.Value(0)).current; // 0..100, JS driver (SVG + widths)
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const shown = useRef(0);
  const [pct, setPct] = useState(0);
  const target = useMemo(() => targetPercent(steps, detail), [steps, detail]);
  const currentKey = detail ? stepKeyOf(detail.phase) : 'prep';
  const currentIndex = currentKey === 'done' ? steps.length : Math.max(0, steps.findIndex((s) => s.key === currentKey));

  useEffect(() => {
    const id = progress.addListener(({ value }) => { shown.current = value; setPct(Math.floor(value)); });
    return () => progress.removeListener(id);
  }, [progress]);

  useEffect(() => {
    if (!visible) return undefined;
    progress.setValue(0); shown.current = 0; setPct(0);
    const loopSpin = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
    const loopPulse = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loopSpin.start(); loopPulse.start();
    return () => { loopSpin.stop(); loopPulse.stop(); };
  }, [visible, progress, spin, pulse]);

  // Glide to each new target. A new document in a multi-document export may
  // restart lower: it then refills quickly instead of snapping.
  useEffect(() => {
    if (!visible) return;
    Animated.timing(progress, { toValue: target, duration: target < shown.current ? 250 : 550, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [visible, target, progress]);

  // Slow creep inside the current step so long phases never look frozen.
  useEffect(() => {
    if (!visible || currentKey === 'done') return undefined;
    const step = steps.find((s) => s.key === currentKey);
    if (!step) return undefined;
    const { doc, docs } = docPosition(detail);
    const ceiling = ((doc - 1) * 100 + step.to - 0.5) / docs;
    const id = setInterval(() => {
      const now = shown.current;
      if (now < ceiling) Animated.timing(progress, { toValue: Math.min(ceiling, now + (ceiling - now) * 0.04 + 0.05), duration: 700, easing: Easing.linear, useNativeDriver: false }).start();
    }, 700);
    return () => clearInterval(id);
  }, [visible, currentKey, steps, detail, progress]);

  const cancelling = /annulation/i.test(String(status || ''));
  const counter = detail && detail.total > 1 && currentKey !== 'done' ? `${detail.done} / ${detail.total}` : null;
  const docLabel = detail?.docs > 1 ? `Document ${detail.doc} sur ${detail.docs}` : null;
  const title = currentKey === 'done' ? 'Rapport prêt' : cancelling ? 'Annulation…' : (steps[currentIndex]?.label || 'Préparation');
  return { steps, progress, spin, pulse, pct, currentKey, currentIndex, cancelling, counter, docLabel, title };
}

function StepList({ s, dark = false, accent = COLORS.orange }) {
  const muted = dark ? 'rgba(255,255,255,0.38)' : COLORS.inkFaint;
  const doneColor = dark ? 'rgba(255,255,255,0.62)' : COLORS.inkSoft;
  const activeColor = dark ? '#FFFFFF' : COLORS.ink;
  const haloScale = s.pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  return <View style={{ alignSelf: 'stretch', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: dark ? 'rgba(255,255,255,0.1)' : COLORS.line }}>
    {s.steps.map((step, i) => {
      const done = i < s.currentIndex;
      const active = i === s.currentIndex;
      return <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}>
        <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
          {done ? <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: dark ? '#0E1620' : '#FFFFFF', fontSize: 11, fontFamily: FONTS.black, lineHeight: 13 }}>✓</Text>
          </View> : active ? <Animated.View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accent, transform: [{ scale: haloScale }] }} />
            : <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: dark ? 'rgba(255,255,255,0.25)' : '#CFCAC1' }} />}
        </View>
        <Text style={{ marginLeft: 10, flex: 1, fontSize: 13.5, color: done ? doneColor : active ? activeColor : muted, fontFamily: active ? FONTS.bodyBold : FONTS.bodyMedium }}>{step.label}</Text>
        {active && s.counter ? <Text style={{ fontSize: 12, color: accent, fontFamily: FONTS.bodyBold, fontVariant: ['tabular-nums'] }}>{s.counter}</Text> : null}
      </View>;
    })}
  </View>;
}

function CancelButton({ s, onCancel, color = COLORS.orangeDark }) {
  if (!onCancel || s.currentKey === 'done') return <View style={{ height: 12 }} />;
  return <TouchableOpacity accessibilityRole="button" disabled={s.cancelling} onPress={onCancel} style={{ marginTop: 10, minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', opacity: s.cancelling ? 0.5 : 1 }}>
    <Text style={{ color, fontFamily: FONTS.bodyBold, fontSize: 14 }}>{s.cancelling ? 'Annulation après le lot en cours…' : 'Annuler la génération'}</Text>
  </TouchableOpacity>;
}

function Heading({ format, color }) {
  return <Text style={{ color, fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 2.2 }}>GÉNÉRATION DU RAPPORT {format === 'word' ? 'WORD' : 'PDF'}</Text>;
}

function Caption({ s, color }) {
  return <Text style={{ color, fontSize: 12.5, marginTop: 3, minHeight: 17 }}>{[s.docLabel, s.counter].filter(Boolean).join(' · ') || ' '}</Text>;
}

function FormatTag({ format }) {
  return <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: format === 'word' ? '#2B5797' : '#C62828' }}>
    <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: FONTS.black, letterSpacing: 0.5 }}>{format === 'word' ? 'DOC' : 'PDF'}</Text>
  </View>;
}

// ---------------------------------------------------------------- Anneau ---

function DocumentGlyph({ progress, format }) {
  const lines = [0.92, 0.78, 0.86, 0.6, 0.9, 0.7];
  return <View style={{ width: 58, height: 74, borderRadius: 7, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 }}>
    <View style={{ height: 7, width: '55%', borderRadius: 2, backgroundColor: COLORS.orange, marginBottom: 7 }} />
    {lines.map((w, i) => {
      const width = progress.interpolate({ inputRange: [0, (i / lines.length) * 100, ((i + 1) / lines.length) * 100, 100], outputRange: [0, 0, w * 42, w * 42], extrapolate: 'clamp' });
      return <View key={i} style={{ height: 4, width: 42, borderRadius: 2, backgroundColor: '#EDEAE4', marginBottom: 5, overflow: 'hidden' }}>
        <Animated.View style={{ height: 4, width, borderRadius: 2, backgroundColor: '#9AA3AD' }} />
      </View>;
    })}
    <View style={{ position: 'absolute', right: -8, bottom: -8 }}><FormatTag format={format} /></View>
  </View>;
}

const RING = 168;
const RING_STROKE = 9;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

function RingCard({ s, format, onCancel }) {
  const dashOffset = s.progress.interpolate({ inputRange: [0, 100], outputRange: [RING_C, 0], extrapolate: 'clamp' });
  const rotate = s.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloOpacity = s.pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });
  const haloScale = s.pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  return <View style={[cardBase, { backgroundColor: '#FFFFFF' }]}>
    <Heading format={format} color={COLORS.inkSoft} />
    <View style={{ width: RING, height: RING, marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: RING - 30, height: RING - 30, borderRadius: RING, backgroundColor: COLORS.orange, opacity: haloOpacity, transform: [{ scale: haloScale }] }} />
      <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="metraRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FF9A4D" />
            <Stop offset="1" stopColor={COLORS.orangeDark} />
          </LinearGradient>
        </Defs>
        <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="#F0EDE7" strokeWidth={RING_STROKE} fill="none" />
        <AnimatedCircle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="url(#metraRing)" strokeWidth={RING_STROKE} fill="none" strokeLinecap="round"
          strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={dashOffset} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
      </Svg>
      <Animated.View style={{ position: 'absolute', width: RING, height: RING, transform: [{ rotate }] }}>
        <View style={{ position: 'absolute', top: RING_STROKE / 2 - 3, left: RING / 2 - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF', shadowColor: COLORS.orange, shadowOpacity: 0.9, shadowRadius: 6, elevation: 3 }} />
      </Animated.View>
      <DocumentGlyph progress={s.progress} format={format} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 }}>
      <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] }}>{s.pct}</Text>
      <Text style={{ color: COLORS.inkSoft, fontFamily: FONTS.bold, fontSize: 18, marginBottom: 5, marginLeft: 2 }}>%</Text>
    </View>
    <Text style={{ color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 16, marginTop: 4 }}>{s.title}</Text>
    <Caption s={s} color={COLORS.inkSoft} />
    <StepList s={s} />
    <CancelButton s={s} onCancel={onCancel} />
  </View>;
}

const cardBase = { width: '100%', maxWidth: 380, borderRadius: 24, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 };

export function ReportProgressOverlay({ visible, format = 'pdf', status, detail, onCancel }) {
  const s = useReportProgress({ visible, format, status, detail });
  return <Modal visible={Boolean(visible)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
    <View style={{ flex: 1, backgroundColor: 'rgba(12,17,24,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View accessibilityRole="progressbar" accessibilityLabel={`Génération du rapport ${format === 'word' ? 'Word' : 'PDF'}`}
        accessibilityValue={{ min: 0, max: 100, now: s.pct, text: status || s.title }} style={{ width: '100%', alignItems: 'center' }}>
        <RingCard s={s} format={format} onCancel={onCancel} />
      </View>
    </View>
  </Modal>;
}
