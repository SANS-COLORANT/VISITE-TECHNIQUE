/**
 * Coque de l'écran Visite (DA "Verre chaud"), commune aux trames ICPE, VMC et
 * Pré-allumage :
 * - SectionRail : rail de sections avec l'état de chaque onglet
 *   (vide, entamé, terminé, anomalie), pictogramme d'onglet et bouton de
 *   recherche en tête (refonte 661, §5.0) ;
 * - SideSectionList : la même liste en colonne (tablette ≥ 900 dp) ;
 * - VisitActionBar : barre d'actions fine à portée de pouce (Note, Mode Photo,
 *   Anomalie) ;
 * - AvisCounters : compteurs S · N.S · S.O.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Picto, pictoOnglet, ACTION_PICTOS } from './MetraPictos.js';
import { COLORS, FONTS } from './styles.js';
import { WAVE_EDGE, WAVE_ROWS, entreesPager, profilBande, profilIcone } from './swipeNavigation.js';

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

function SearchButton({ onPress, size = 38 }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Rechercher dans la visite"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      activeOpacity={0.8}
      onPress={onPress}
      style={[s.searchBtn, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Picto name={ACTION_PICTOS.rechercher} size={Math.round(size * 0.5)} />
    </TouchableOpacity>
  );
}

const MARGE_X = 13; // bordure 1 + padding 12
const COULEUR_HAUT = [242, 100, 38];
const COULEUR_BAS = [217, 83, 26];
const mix = (t) => `rgb(${COULEUR_HAUT.map((c, i) => Math.round(c + (COULEUR_BAS[i] - c) * t)).join(',')})`;

/**
 * Bulle liquide : bandes horizontales décalées selon la position du pager.
 * Toutes les valeurs sont interpolées sur le thread natif (même valeur que les
 * pages) : le remplissage suit le doigt sans aucun calcul JavaScript.
 */
function WaveChip({ label, picto, state, pageIndex, size, pagerX, pagerWidth }) {
  const { w: W, h: H } = size;
  const rows = WAVE_ROWS;
  const hRow = H / rows;
  const aDot = Boolean(state);
  const xPicto = MARGE_X + (aDot ? 15 : 0);
  const entrees = useMemo(() => entreesPager(pageIndex, pagerWidth), [pageIndex, pagerWidth]);
  const bandes = useMemo(() => Array.from({ length: rows }, (_, k) => {
    const sortie = profilBande(k, W, rows);
    return {
      blob: pagerX.interpolate({ inputRange: entrees, outputRange: sortie, extrapolate: 'clamp' }),
      texte: pagerX.interpolate({ inputRange: entrees, outputRange: sortie.map((v) => -v), extrapolate: 'clamp' }),
      couleur: mix((k + 0.5) / rows),
    };
  }), [pagerX, entrees, W, rows]);
  const iconeBlanche = useMemo(() => {
    if (!aDot && !picto) return null;
    // Le point et le pictogramme basculent en blanc quand l'orange recouvre leur centre.
    const finIcones = picto ? xPicto + 17 : MARGE_X + 9;
    return pagerX.interpolate({ inputRange: entrees, outputRange: profilIcone((MARGE_X + finIcones) / 2, W), extrapolate: 'clamp' });
  }, [pagerX, entrees, W, aDot, picto, xPicto]);
  const contenuBlanc = (decalage) => (
    <View style={[s.chip, s.chipBlanc, { position: 'absolute', left: 0, top: decalage, width: W, height: H }]}>
      {aDot ? <View style={{ width: 9, height: 9 }} /> : null}
      {picto ? <View style={{ width: 17, height: 17 }} /> : null}
      <Text numberOfLines={1} style={[s.chipText, s.chipTextBlanc]}>{label}</Text>
    </View>
  );
  return (
    <View>
      <View style={s.chip}>
        <StateDot state={state} />
        {picto ? <Picto name={picto} size={17} /> : null}
        <Text numberOfLines={1} style={s.chipText}>{label}</Text>
      </View>
      {/* Liquide : une bande = un décalage ; le texte blanc reste fixe sous le liquide. */}
      <View pointerEvents="none" style={[s.vague, s.chipMasque, { width: W, height: H }]}>
        {bandes.map((b, k) => (
          <View key={k} style={{ position: 'absolute', left: 0, top: k * hRow, width: W, height: hRow + 0.6, overflow: 'hidden' }}>
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: W + 2 * WAVE_EDGE, height: hRow + 0.6, backgroundColor: b.couleur, overflow: 'hidden', transform: [{ translateX: b.blob }] }}>
              <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: W, height: hRow + 0.6, overflow: 'hidden', transform: [{ translateX: b.texte }] }}>
                {contenuBlanc(-k * hRow)}
              </Animated.View>
            </Animated.View>
          </View>
        ))}
      </View>
      {iconeBlanche ? (
        <Animated.View pointerEvents="none" style={[s.vague, { width: W, height: H, opacity: iconeBlanche }]}>
          <View style={[s.chip, s.chipBlanc, { width: W, height: H }]}>
            <StateDot state={state} onGradient />
            {picto ? <Picto name={picto} size={17} mono={COLORS.white} /> : null}
            <Text numberOfLines={1} style={[s.chipText, { opacity: 0 }]}>{label}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SectionRail({ tabOrder = [], labels = {}, activeTab, onSelect, tabStates = {}, trameId, onSearch, pagerX = null, pagerWidth = 0, pageOrder = null }) {
  const scrollRef = useRef(null);
  const [largeurs, setLargeurs] = useState({});
  const indexActif = pageOrder ? pageOrder.indexOf(activeTab) : -1;
  const positions = useRef({});
  const viewportWidth = useRef(0);

  useEffect(() => {
    const pos = positions.current[activeTab];
    if (!pos || !scrollRef.current) return;
    const target = Math.max(0, pos.x - Math.max(0, (viewportWidth.current - pos.width) / 2));
    scrollRef.current.scrollTo({ x: target, animated: true });
  }, [activeTab]);

  return (
    <View style={s.railRow}>
    {onSearch ? <SearchButton onPress={onSearch} /> : null}
    <ScrollView
      ref={scrollRef}
      horizontal
      style={{ flex: 1 }}
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
        const picto = pictoOnglet(pid, trameId);
        const content = <>
          <StateDot state={state} onGradient={on} />
          {picto ? <Picto name={picto} size={17} mono={on ? COLORS.white : undefined} /> : null}
          <Text numberOfLines={1} style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
        </>;
        const pageIndex = pageOrder ? pageOrder.indexOf(pid) : -1;
        const taille = largeurs[pid];
        // Seules la bulle active et ses voisines portent le liquide (un geste ne change que d'un onglet).
        const synchro = Boolean(pagerX && pagerWidth > 0 && pageIndex >= 0 && taille?.w > 0 && Math.abs(pageIndex - indexActif) <= 1);
        return (
          <TouchableOpacity
            key={pid}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            activeOpacity={0.85}
            onPress={() => onSelect?.(pid)}
            onLayout={(e) => {
              const { x, width, height } = e.nativeEvent.layout;
              positions.current[pid] = { x, width };
              if (pagerX) setLargeurs((old) => (Math.abs((old[pid]?.w || 0) - width) < 0.5 && Math.abs((old[pid]?.h || 0) - height) < 0.5 ? old : { ...old, [pid]: { w: width, h: height } }));
            }}
          >
            {synchro ? (
              <WaveChip label={label} picto={picto} state={state} pageIndex={pageIndex} size={taille} pagerX={pagerX} pagerWidth={pagerWidth} />
            ) : on ? (
              <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.chip, s.chipOn]}>{content}</LinearGradient>
            ) : (
              <View style={s.chip}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    </View>
  );
}

export function SideSectionList({ tabOrder = [], labels = {}, activeTab, onSelect, tabStates = {}, trameId, onSearch }) {
  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 9 }} showsVerticalScrollIndicator={false}>
      {onSearch ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Rechercher dans la visite" onPress={onSearch} activeOpacity={0.85} style={[s.side, s.sideSearch]}>
          <Picto name={ACTION_PICTOS.rechercher} size={20} />
          <Text numberOfLines={1} style={s.sideText}>Rechercher</Text>
        </TouchableOpacity>
      ) : null}
      {tabOrder.map((pid, i) => {
        if (pid === 'SEP') return <View key={`side-sep-${i}`} style={{ height: 1, backgroundColor: 'rgba(22,21,15,0.08)', marginVertical: 8 }} />;
        const on = pid === activeTab;
        const st = tabStates[pid];
        const picto = pictoOnglet(pid, trameId);
        const label = labels[pid] || pid;
        return (
          <TouchableOpacity key={pid} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => onSelect?.(pid)} activeOpacity={0.85} style={[s.side, on && s.sideOn]}>
            <StateDot state={st?.state || null} />
            {picto ? <Picto name={picto} size={20} /> : null}
            <Text numberOfLines={2} style={[s.sideText, on && s.sideTextOn]}>{label}</Text>
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
          <Picto name={ACTION_PICTOS.note} size={19} />
          <Text numberOfLines={1} style={s.actText}>Note</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel={photoLabel} onPress={onPhoto} activeOpacity={0.85} style={{ flex: 1.25 }}>
          <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[s.act, s.actMain]}>
            <Picto name={ACTION_PICTOS.modePhoto} size={19} mono={COLORS.white} strokeWidth={1.9} />
            <Text numberOfLines={1} style={[s.actText, { color: COLORS.white }]}>{photoLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Ajouter une anomalie, une remarque ou une réserve" onPress={onAnomalie} activeOpacity={0.8} style={s.act}>
          <Picto name={ACTION_PICTOS.anomalie} size={19} mono="#C23B2E" />
          <Text numberOfLines={1} style={[s.actText, { color: "#C23B2E" }]}>Anomalie</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 10 },
  searchBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  rail: { gap: 7, paddingRight: 8, alignItems: 'center' },
  sep: { width: 1, height: 20, backgroundColor: 'rgba(22,21,15,0.12)', marginHorizontal: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  chipOn: { borderColor: 'rgba(255,255,255,0.35)', shadowColor: COLORS.orange, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  chipText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft, maxWidth: 190 },
  chipTextOn: { color: COLORS.white, fontFamily: FONTS.bodyBold },
  chipMasque: { borderRadius: 18, overflow: 'hidden' },
  chipBlanc: { backgroundColor: 'transparent', borderColor: 'transparent' },
  chipTextBlanc: { color: COLORS.white },
  vague: { position: 'absolute', left: 0, top: 0 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, marginVertical: 2 },
  sideSearch: { borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: '#FDFCFA', marginBottom: 6 },
  sideOn: { backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1.5, borderColor: COLORS.orange },
  sideText: { flex: 1, fontSize: 13, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  sideTextOn: { fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  sideCount: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: COLORS.inkFaint },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  counter: { fontSize: 11.5, fontFamily: FONTS.bodyBold },
  barWrap: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  bar: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 18, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  act: { flex: 1, flexDirection: 'row', minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6 },
  actMain: { shadowColor: COLORS.orange, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  actText: { fontSize: 12.5, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },
});
