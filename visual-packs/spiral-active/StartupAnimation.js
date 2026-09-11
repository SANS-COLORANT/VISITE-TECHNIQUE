import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { appVersionLabel } from '../../appVersion.js';
import { SPIRAL_PATH_LENGTH, SpiralSvg } from './SpiralArt.js';

export const SPIRAL_ACTIVE_STARTUP_DURATION_MS = 2500;
const BG = '#F4F1E8';
const INK = '#14202C';
const ORANGE = '#F26426';

function clampTarget(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function SpiralActiveStartupAnimation() {
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: SPIRAL_ACTIVE_STARTUP_DURATION_MS,
      easing: Easing.bezier(0.2, 0.82, 0.22, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const animated = useMemo(() => {
    const centerDashOffset = progress.interpolate({
      inputRange: [0, 0.07, 0.38, 0.5, 1],
      outputRange: [SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, 0, SPIRAL_PATH_LENGTH * 0.52, SPIRAL_PATH_LENGTH],
      extrapolate: 'clamp',
    });
    const centerOpacity = progress.interpolate({
      inputRange: [0, 0.05, 0.12, 0.44, 0.62, 1],
      outputRange: [0, 1, 1, 1, 0, 0],
      extrapolate: 'clamp',
    });
    const centerScale = progress.interpolate({
      inputRange: [0, 0.1, 0.42, 0.62, 1],
      outputRange: [0.72, 0.82, 1, 0.62, 0.62],
      extrapolate: 'clamp',
    });
    const centerRotate = progress.interpolate({
      inputRange: [0, 0.42, 0.62, 1],
      outputRange: ['-18deg', '0deg', '24deg', '24deg'],
      extrapolate: 'clamp',
    });

    const wordOpacity = progress.interpolate({
      inputRange: [0, 0.24, 0.36, 0.49, 0.6, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
      extrapolate: 'clamp',
    });
    const wordY = progress.interpolate({
      inputRange: [0, 0.3, 0.45, 0.6, 1],
      outputRange: [8, 8, 0, -8, -8],
      extrapolate: 'clamp',
    });

    const pointOpacity = progress.interpolate({
      inputRange: [0, 0.035, 0.08, 0.78, 0.9, 1],
      outputRange: [0, 0, 1, 1, 0.35, 0],
      extrapolate: 'clamp',
    });
    const pointScale = progress.interpolate({
      inputRange: [0, 0.05, 0.11, 0.45, 0.72, 0.82, 1],
      outputRange: [0.2, 0.2, 1, 1, 1.18, 0.72, 0.72],
      extrapolate: 'clamp',
    });

    const bottomDashOffset = progress.interpolate({
      inputRange: [0, 0.58, 0.66, 0.93, 1],
      outputRange: [SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, 0, 0],
      extrapolate: 'clamp',
    });
    const bottomOpacity = progress.interpolate({
      inputRange: [0, 0.58, 0.66, 0.86, 1],
      outputRange: [0, 0, 1, 1, 1],
      extrapolate: 'clamp',
    });
    const bottomScale = progress.interpolate({
      inputRange: [0, 0.62, 0.9, 0.965, 1],
      outputRange: [0.78, 0.78, 1.03, 0.985, 1],
      extrapolate: 'clamp',
    });
    const bottomRotate = progress.interpolate({
      inputRange: [0, 0.63, 0.9, 1],
      outputRange: ['-34deg', '-34deg', '6deg', '0deg'],
      extrapolate: 'clamp',
    });

    return {
      centerDashOffset,
      centerOpacity,
      centerScale,
      centerRotate,
      wordOpacity,
      wordY,
      pointOpacity,
      pointScale,
      bottomDashOffset,
      bottomOpacity,
      bottomScale,
      bottomRotate,
    };
  }, [progress]);

  const travelY = clampTarget((height / 2) - 28, 180, 520);
  const travelX = clampTarget(width * 0.12, 28, 74);
  const pointX = progress.interpolate({
    inputRange: [0, 0.45, 0.53, 0.64, 0.74, 0.82, 1],
    outputRange: [0, 0, -travelX, travelX * 0.72, -travelX * 0.28, 0, 0],
    extrapolate: 'clamp',
  });
  const pointY = progress.interpolate({
    inputRange: [0, 0.45, 0.53, 0.64, 0.74, 0.82, 1],
    outputRange: [0, 0, travelY * 0.16, travelY * 0.48, travelY * 0.8, travelY, travelY],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen} accessibilityLabel={`Chargement de METRA ${appVersionLabel()}`}>
      <View pointerEvents="none" style={styles.angularShardA} />
      <View pointerEvents="none" style={styles.angularShardB} />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.centerSpiral,
          {
            opacity: animated.centerOpacity,
            transform: [{ scale: animated.centerScale }, { rotate: animated.centerRotate }],
          },
        ]}
      >
        <SpiralSvg size={208} strokeWidth={7.2} dashOffset={animated.centerDashOffset} showCenter={false} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.wordmark, { opacity: animated.wordOpacity, transform: [{ translateY: animated.wordY }] }]}>
        <Text style={styles.wordmarkText}>METRA</Text>
        <Text style={styles.versionText}>{appVersionLabel()}</Text>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.travellingPoint,
          {
            opacity: animated.pointOpacity,
            transform: [{ translateX: pointX }, { translateY: pointY }, { scale: animated.pointScale }],
          },
        ]}
      >
        <View style={styles.pointCore} />
        <View style={styles.pointHalo} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.bottomSpiral,
          {
            opacity: animated.bottomOpacity,
            transform: [{ scale: animated.bottomScale }, { rotate: animated.bottomRotate }],
          },
        ]}
      >
        <SpiralSvg size={154} strokeWidth={7.8} dashOffset={animated.bottomDashOffset} showCenter={false} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: BG,
  },
  angularShardA: {
    position: 'absolute',
    top: -70,
    right: -84,
    width: 235,
    height: 300,
    backgroundColor: '#DDF0F3',
    opacity: 0.68,
    transform: [{ rotate: '18deg' }, { skewX: '-12deg' }],
  },
  angularShardB: {
    position: 'absolute',
    bottom: 68,
    left: -130,
    width: 280,
    height: 92,
    backgroundColor: '#E6EDDF',
    opacity: 0.76,
    transform: [{ rotate: '-14deg' }, { skewX: '22deg' }],
  },
  centerSpiral: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -104,
    marginTop: -104,
    width: 208,
    height: 208,
    alignItems: 'center',
    justifyContent: 'center',
  },
  travellingPoint: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -8,
    marginTop: -8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  pointCore: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: ORANGE,
  },
  pointHalo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#F5B51B',
    opacity: 0.5,
  },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '63%',
    alignItems: 'center',
  },
  wordmarkText: {
    color: INK,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4.2,
  },
  versionText: {
    marginTop: 6,
    color: '#68737D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bottomSpiral: {
    position: 'absolute',
    left: '50%',
    marginLeft: -77,
    bottom: -78,
    width: 154,
    height: 154,
  },
});
