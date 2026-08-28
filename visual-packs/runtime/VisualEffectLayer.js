import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seeded(seed) {
  let value = (seed + 1) * 9301 + 49297;
  return () => {
    value = (value * 233280 + 12345) % 2147483647;
    return (value % 100000) / 100000;
  };
}

function symbolsFor(effect) {
  if (Array.isArray(effect?.symbols) && effect.symbols.length) return effect.symbols.map(String);
  if (effect?.symbol) return [String(effect.symbol)];
  if (effect?.type === 'sparkles') return ['✦', '✧'];
  if (effect?.type === 'confetti') return ['◆', '●', '■'];
  if (effect?.type === 'leaves') return ['◆'];
  return ['❄', '❅', '❆'];
}

function defaultColor(type) {
  if (type === 'confetti') return '#D8552A';
  if (type === 'leaves') return '#B56C32';
  if (type === 'sparkles') return '#FFFFFF';
  return '#FFFFFF';
}

function Particle({ index, effect, width, height, symbol }) {
  const progress = useRef(new Animated.Value(0)).current;
  const random = useMemo(() => seeded(index + Number(effect?.seed || 0)), [index, effect?.seed]);
  const settings = useMemo(() => {
    const sizeMin = clamp(Number(effect?.sizeMin || 8), 2, 80);
    const sizeMax = clamp(Number(effect?.sizeMax || 20), sizeMin, 100);
    const opacityMin = clamp(Number(effect?.opacityMin ?? 0.35), 0, 1);
    const opacityMax = clamp(Number(effect?.opacityMax ?? 0.9), opacityMin, 1);
    const durationMin = clamp(Number(effect?.durationMinMs || 2200), 600, 20000);
    const durationMax = clamp(Number(effect?.durationMaxMs || 4200), durationMin, 30000);
    const wind = clamp(Number(effect?.wind || 0), -300, 300);
    const x = random() * Math.max(1, width - sizeMax);
    return {
      x,
      size: sizeMin + random() * (sizeMax - sizeMin),
      opacity: opacityMin + random() * (opacityMax - opacityMin),
      duration: durationMin + random() * (durationMax - durationMin),
      delay: random() * Math.min(1600, durationMin),
      drift: (random() * 2 - 1) * Math.abs(wind || 18) + wind * 0.45,
      rotation: 120 + random() * 360,
    };
  }, [effect, random, width]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(settings.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: settings.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress, settings.delay, settings.duration]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40 - settings.size, height + 50],
  });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, settings.drift] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${settings.rotation}deg`] });
  const fade = progress.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, settings.opacity, settings.opacity, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: settings.x,
          opacity: fade,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    >
      <Text
        style={{
          color: effect?.color || defaultColor(effect?.type),
          fontSize: settings.size,
          lineHeight: settings.size * 1.15,
          textShadowColor: effect?.shadowColor || 'rgba(0,0,0,0.12)',
          textShadowRadius: Number(effect?.shadowRadius || 1),
        }}
      >
        {symbol}
      </Text>
    </Animated.View>
  );
}

export function VisualEffectLayer({ effect }) {
  const { width, height } = useWindowDimensions();
  const type = effect?.type;
  const enabled = effect?.enabled !== false && ['snow', 'sparkles', 'confetti', 'leaves'].includes(type);
  const count = enabled ? clamp(Math.round(Number(effect?.count || 24)), 1, 72) : 0;
  const symbols = useMemo(() => symbolsFor(effect), [effect]);

  if (!enabled || count <= 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, index) => (
        <Particle
          key={`${type}-${index}`}
          index={index}
          effect={effect}
          width={width}
          height={height}
          symbol={symbols[index % symbols.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: 0,
  },
});
