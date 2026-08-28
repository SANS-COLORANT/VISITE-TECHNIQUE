import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { VisualPackAsset } from './VisualPackAsset.js';
import { resolveVisualPackAssetUri } from './visualPackManager.js';

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function easingFor(name) {
  if (name === 'linear') return Easing.linear;
  if (name === 'ease-in') return Easing.in(Easing.cubic);
  if (name === 'ease-out') return Easing.out(Easing.cubic);
  if (name === 'ease-in-out') return Easing.inOut(Easing.cubic);
  if (name === 'back') return Easing.out(Easing.back(1.4));
  return Easing.out(Easing.cubic);
}

export function VisualPackAnimatedLayer({ pack, layer }) {
  const progress = useRef(new Animated.Value(0)).current;
  const uri = resolveVisualPackAssetUri(pack, layer?.asset);
  const startMs = Math.max(0, numberOr(layer?.startMs, 0));
  const durationMs = Math.max(1, numberOr(layer?.durationMs, 700));

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(startMs),
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: easingFor(layer?.easing),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [durationMs, layer?.easing, progress, startMs]);

  const animatedStyle = useMemo(() => {
    const from = layer?.from || {};
    const to = layer?.to || {};
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [numberOr(from.opacity, 0), numberOr(to.opacity, 1)],
    });
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [numberOr(from.translateX, 0), numberOr(to.translateX, 0)],
    });
    const translateY = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [numberOr(from.translateY, 0), numberOr(to.translateY, 0)],
    });
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [numberOr(from.scale, 1), numberOr(to.scale, 1)],
    });
    const rotate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [`${numberOr(from.rotate, 0)}deg`, `${numberOr(to.rotate, 0)}deg`],
    });
    return { opacity, transform: [{ translateX }, { translateY }, { scale }, { rotate }] };
  }, [layer?.from, layer?.to, progress]);

  if (!uri) return null;

  const width = numberOr(layer?.width, 220);
  const height = numberOr(layer?.height, 160);
  const left = layer?.left ?? '50%';
  const top = layer?.top ?? '50%';
  const centered = layer?.centered !== false;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.layer,
        {
          left,
          top,
          width,
          height,
          marginLeft: centered ? -width / 2 : 0,
          marginTop: centered ? -height / 2 : 0,
        },
        animatedStyle,
      ]}
    >
      <VisualPackAsset uri={uri} style={styles.asset} resizeMode={layer?.resizeMode || 'contain'} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  asset: { width: '100%', height: '100%' },
});
