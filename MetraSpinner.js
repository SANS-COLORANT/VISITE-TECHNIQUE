/**
 * Indicateur de chargement METRA, à la place de la roue Android.
 * Trois gouttes orange qui ondulent l'une après l'autre (vague), avec un léger
 * rebond. Même API que ActivityIndicator (size, color, animating, style) pour
 * pouvoir le substituer partout sans toucher aux écrans.
 * Une seule boucle par indicateur, sur le thread natif.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

const ORANGE = '#F26426';
const ORANGE_LIGHT = '#FFB37A';

export function MetraSpinner({ size = 'small', color, animating = true, hidesWhenStopped = true, style, accessibilityLabel = 'Chargement', testID }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animating) return undefined;
    let loop = null;
    let cancelled = false;
    const start = (reduce) => {
      if (cancelled) return;
      t.setValue(0);
      loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: reduce ? 1800 : 1050, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    };
    const check = AccessibilityInfo.isReduceMotionEnabled?.();
    if (check?.then) check.then(start, () => start(false)); else start(false);
    return () => { cancelled = true; loop?.stop(); };
  }, [animating, t]);

  if (!animating && hidesWhenStopped) return null;
  const dot = typeof size === 'number' ? Math.max(4, Math.round(size / 3.2)) : size === 'large' ? 11 : 7;
  const gap = Math.round(dot * 0.55);
  const main = color || ORANGE;
  const light = !color || color === ORANGE ? ORANGE_LIGHT : main;
  const jump = dot * 0.9;

  return <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} testID={testID}
    style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: dot + jump + 4, paddingHorizontal: 2 }, style]}>
    {[0, 1, 2].map((i) => {
      // Each drop rises during its own third of the cycle, then rests.
      const a = i / 3;
      const input = [0, a, a + 1 / 6, a + 1 / 3, 1].map((v) => Math.min(1, v));
      const fixed = input.map((v, k) => (k > 0 && v <= input[k - 1] ? input[k - 1] + 0.0001 : v));
      const y = t.interpolate({ inputRange: fixed, outputRange: [0, 0, -jump, 0, 0], extrapolate: 'clamp' });
      const sx = t.interpolate({ inputRange: fixed, outputRange: [1, 1, 0.86, 1.18, 1], extrapolate: 'clamp' });
      const sy = t.interpolate({ inputRange: fixed, outputRange: [1, 1, 1.14, 0.82, 1], extrapolate: 'clamp' });
      const o = t.interpolate({ inputRange: fixed, outputRange: [0.55, 0.55, 1, 0.8, 0.55], extrapolate: 'clamp' });
      return <Animated.View key={i} style={{
        width: dot, height: dot, borderRadius: dot, marginHorizontal: gap / 2,
        backgroundColor: i === 1 ? light : main, opacity: o,
        transform: [{ translateY: y }, { scaleX: sx }, { scaleY: sy }],
      }} />;
    })}
  </View>;
}

export default MetraSpinner;
