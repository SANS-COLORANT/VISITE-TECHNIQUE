/**
 * Silhouettes de chargement (DA "Verre chaud") : blocs gris chaud qui
 * respirent, à la place d'une roue seule. Animation sur le thread natif.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function usePulse() {
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.55, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function SkeletonBlock({ width = '100%', height = 14, radius = 8, style }) {
  const opacity = usePulse();
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: 'rgba(22,21,15,0.08)', opacity }, style]} />;
}

function CardSkeleton({ lines = 2 }) {
  return (
    <View style={s.card}>
      <SkeletonBlock width={40} height={40} radius={13} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBlock width="62%" height={14} />
        {lines > 1 ? <SkeletonBlock width="40%" height={11} /> : null}
      </View>
    </View>
  );
}

/** Écran de liste générique : titre + n cartes. */
export function SkeletonList({ count = 5, withTitle = true }) {
  return (
    <View accessibilityLabel="Chargement" style={s.wrap}>
      {withTitle ? <SkeletonBlock width="45%" height={20} radius={10} style={{ marginBottom: 16 }} /> : null}
      {Array.from({ length: count }, (_, i) => <CardSkeleton key={i} />)}
    </View>
  );
}

/** Écran Visite : en-tête, jauge, rail d'onglets, cartes de saisie. */
export function SkeletonVisit() {
  return (
    <View accessibilityLabel="Ouverture de la visite" style={[s.wrap, { paddingTop: 54 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <SkeletonBlock width={40} height={40} radius={13} />
        <View style={{ flex: 1, gap: 7 }}><SkeletonBlock width="55%" height={17} /><SkeletonBlock width="35%" height={11} /></View>
      </View>
      <View style={[s.card, { marginBottom: 12 }]}>
        <SkeletonBlock width={48} height={48} radius={24} />
        <View style={{ flex: 1, gap: 8 }}><SkeletonBlock width="70%" height={14} /><SkeletonBlock width="50%" height={11} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[110, 96, 104].map((w, i) => <SkeletonBlock key={i} width={w} height={36} radius={18} />)}
      </View>
      {[0, 1, 2].map((i) => <View key={i} style={[s.card, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
        <SkeletonBlock width="48%" height={13} />
        <SkeletonBlock height={44} radius={14} />
      </View>)}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#FDFCFA', borderWidth: 1, borderColor: 'rgba(22,21,15,0.06)', marginBottom: 10 },
});
