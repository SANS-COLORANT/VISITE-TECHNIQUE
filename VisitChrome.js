/**
 * Coque de l'écran Visite (DA "Verre chaud"), commune aux trames ICPE, VMC et
 * Pré-allumage :
 * - SectionRail : rail de sections avec l'état de chaque onglet
 *   (vide, entamé, terminé, anomalie) ;
 * - VisitActionBar : barre d'actions à portée de pouce (Note, Photo, Anomalie) ;
 * - AvisCounters : compteurs S · N.S · S.O de l'en-tête.
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';

export const STATE_COLORS = {
  empty: '#D6D1C6',
  partial: COLORS.orange,
  done: '#2E9D5B',
  alert: '#C23B2E',
};

function StateDot({ state, onGradient = false }) {
  if (!state) return null;
  if (onGradient) return <View style={[s.dot, { backgroundColor: COLORS.white, opacity: state === 'empty' ? 0.55 : 1 }]} />;
  if (state === 'partial') {
    return <View style={[s.dot, { backgroundColor: STATE_COLORS.empty, overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', backgroundColor: STATE_COLORS.partial }} />
    </View>;
  }
  return <View style={[s.dot, { backgroundColor: STATE_COLORS[state] }]} />;
}

export function SectionRail({ tabOrder = [], labels = {}, activeTab, onSelect, tabStates = {} }) {
  const scrollRef = useRef(null);
  const positions = useRef({});
  const viewportWidth = useRef(0);

  useEffect(() => {
    const pos = positions.current[activeTab];
    if (!pos || !scrollRef.current) return;
    const target = Math.max(0, pos.x - Math.max(0, (viewportWidth.current - pos.width) / 2));
    scrollRef.current.scrollTo({ x: target, animated: true });
  }, [activeTab]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => { viewportWidth.current = e.nativeEvent.layout.width; }}
      contentContainerStyle={s.rail}
    >
      {tabOrder.map((pid, i) => {
        if (pid === 'SEP') return <View key={`sep-${i}`} style={s.sep} />;
        const on = pid === activeTab;
        const state = tabStates[pid]?.state || null;
        const label = labels[pid] || pid;
        const content = <>
          <StateDot state={state} onGradient={on} />
          <Text numberOfLines={1} style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
        </>;
        return (
          <TouchableOpacity
            key={pid}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            activeOpacity={0.85}
            onPress={() => onSelect?.(pid)}
            onLayout={(e) => { positions.current[pid] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }; }}
          >
            {on ? (
              <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.chip, s.chipOn]}>{content}</LinearGradient>
            ) : (
              <View style={s.chip}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function SideSectionList({ tabOrder = [], labels = {}, activeTab, onSelect, tabStates = {} }) {
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 9 }} showsVerticalScrollIndicator={false}>
      {tabOrder.map((pid, i) => {
        if (pid === 'SEP') return <View key={`side-sep-${i}`} style={{ height: 1, backgroundColor: 'rgba(22,21,15,0.08)', marginVertical: 8 }} />;
        const on = pid === activeTab;
        const st = tabStates[pid];
        return (
          <TouchableOpacity key={pid} onPress={() => onSelect?.(pid)} activeOpacity={0.85} style={[s.side, on && s.sideOn]}>
            <StateDot state={st?.state || null} />
            <Text numberOfLines={2} style={[s.sideText, on && s.sideTextOn]}>{labels[pid] || pid}</Text>
            {st?.total ? <Text style={[s.sideCount, on && { color: COLORS.orangeDark }]}>{st.done}/{st.total}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function AvisCounters({ avis }) {
  if (!avis) return null;
  const items = [
    ['S', avis.S, '#227A4A'],
    ['N.S', avis['N.S'], '#C23B2E'],
    ['S.O', avis['S.O'], COLORS.inkFaint],
  ];
  const autres = Number(avis['N.R'] || 0) + Number(avis['N.V'] || 0);
  return (
    <View style={s.counters}>
      {items.map(([label, value, color]) => (
        <Text key={label} style={[s.counter, { color }]}>{Number(value || 0)} {label}</Text>
      ))}
      {autres ? <Text style={[s.counter, { color: COLORS.inkFaint }]}>{autres} N.R/N.V</Text> : null}
    </View>
  );
}

export function VisitActionBar({ onNote, onPhoto, onAnomalie, photoLabel = 'Photos' }) {
  return (
    <View style={s.barWrap}>
      <View style={s.bar}>
        <TouchableOpacity accessibilityLabel="Note libre" onPress={onNote} activeOpacity={0.8} style={s.act}>
          <CvcIcon name="note" size={20} color={COLORS.inkSoft} />
          <Text style={s.actText}>Note</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel={photoLabel} onPress={onPhoto} activeOpacity={0.85} style={{ flex: 1.25 }}>
          <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.act, s.actMain]}>
            <CvcIcon name="camera" size={20} color={COLORS.white} strokeWidth={2.1} />
            <Text style={[s.actText, { color: COLORS.white }]}>{photoLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Ajouter une anomalie, une remarque ou une réserve" onPress={onAnomalie} activeOpacity={0.8} style={s.act}>
          <CvcIcon name="remark" size={20} color="#C23B2E" />
          <Text style={[s.actText, { color: '#C23B2E' }]}>Anomalie</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  rail: { gap: 7, paddingBottom: 12, paddingRight: 8, alignItems: 'center' },
  sep: { width: 1, height: 20, backgroundColor: 'rgba(22,21,15,0.12)', marginHorizontal: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  chipOn: { borderColor: 'rgba(255,255,255,0.35)', shadowColor: COLORS.orange, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  chipText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft, maxWidth: 190 },
  chipTextOn: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  dot: { width: 8, height: 8, borderRadius: 4 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, marginVertical: 2 },
  sideOn: { backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1.5, borderColor: COLORS.orange },
  sideText: { flex: 1, fontSize: 13, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  sideTextOn: { fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  sideCount: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: COLORS.inkFaint },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  counter: { fontSize: 11.5, fontFamily: FONTS.bodyBold },
  barWrap: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  bar: { flexDirection: 'row', gap: 8, padding: 7, borderRadius: 22, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  act: { flex: 1, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3 },
  actMain: { shadowColor: COLORS.orange, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  actText: { fontSize: 10.5, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },
});
