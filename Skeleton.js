/**
 * Silhouettes de chargement (DA "Verre chaud") : blocs gris chaud traversés
 * par un reflet lumineux, à la place d'une roue seule.
 * Un seul balayage partagé par tous les blocs à l'écran (une boucle native,
 * démarrée au premier bloc et arrêtée au dernier), au lieu d'une boucle par bloc.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const sweep = new Animated.Value(0);
let users = 0;
let loop = null;
function useSweep() {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      sweep.setValue(0);
      loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
      loop.start();
    }
    return () => {
      users -= 1;
      if (users === 0 && loop) { loop.stop(); loop = null; }
    };
  }, []);
  return sweep;
}

const SHINE = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'];

export function SkeletonBlock({ width = '100%', height = 14, radius = 8, style }) {
  const v = useSweep();
  const [w, setW] = useState(0);
  const band = Math.max(60, Math.min(160, w * 0.45));
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [-band, Math.max(w, 1)] });
  return <View onLayout={(e) => { const next = Math.round(e.nativeEvent.layout.width); if (next !== w) setW(next); }}
    style={[{ width, height, borderRadius: radius, backgroundColor: 'rgba(22,21,15,0.075)', overflow: 'hidden' }, style]}>
    {w > 0 ? <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: band, transform: [{ translateX: x }] }}>
      <LinearGradient colors={SHINE} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View> : null}
  </View>;
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
