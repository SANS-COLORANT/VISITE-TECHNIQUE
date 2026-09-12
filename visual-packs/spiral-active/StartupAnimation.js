import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SPIRAL_PATH_LENGTH, SpiralSvg } from './SpiralArt.js';

export const SPIRAL_ACTIVE_STARTUP_DURATION_MS = 2500;
const BG = '#F4F1E8';
const ORANGE = '#F26426';
const TABLET_SIZE = 220;
const PHONE_SIZE = 176;
const HIDDEN_RATIO = 0.45;

function clampTarget(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function SpiralActiveStartupAnimation() {
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  const tablet = width >= 800;
  const finalSize = tablet ? TABLET_SIZE : PHONE_SIZE;
  const finalHidden = Math.round(finalSize * HIDDEN_RATIO);

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
      inputRange: [0, 0.06, 0.4, 0.54, 1],
      outputRange: [SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, 0, SPIRAL_PATH_LENGTH * 0.54, SPIRAL_PATH_LENGTH],
      extrapolate: 'clamp',
    });
    const centerOpacity = progress.interpolate({
      inputRange: [0, 0.04, 0.12, 0.48, 0.66, 1],
      outputRange: [0, 1, 1, 1, 0, 0],
      extrapolate: 'clamp',
    });
    const centerScale = progress.interpolate({
      inputRange: [0, 0.1, 0.4, 0.48, 0.6, 1],
      outputRange: [0.72, 0.82, 1, 1.045, 0.64, 0.64],
      extrapolate: 'clamp',
    });

    const pointOpacity = progress.interpolate({
      inputRange: [0, 0.05, 0.1, 0.79, 0.92, 1],
      outputRange: [0, 0, 1, 1, 0.25, 0],
      extrapolate: 'clamp',
    });
    const pointScale = progress.interpolate({
      inputRange: [0, 0.08, 0.14, 0.5, 0.76, 0.86, 1],
      outputRange: [0.2, 0.2, 1, 1, 1.12, 0.78, 0.78],
      extrapolate: 'clamp',
    });

    const bottomDashOffset = progress.interpolate({
      inputRange: [0, 0.6, 0.69, 0.92, 1],
      outputRange: [SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, SPIRAL_PATH_LENGTH, 0, 0],
      extrapolate: 'clamp',
    });
    const bottomOpacity = progress.interpolate({
      inputRange: [0, 0.6, 0.69, 0.86, 1],
      outputRange: [0, 0, 1, 1, 1],
      extrapolate: 'clamp',
    });
    const bottomScale = progress.interpolate({
      inputRange: [0, 0.67, 0.9, 0.95, 1],
      outputRange: [0.8, 0.8, 1, 1.045, 1],
      extrapolate: 'clamp',
    });

    return {
      centerDashOffset,
      centerOpacity,
      centerScale,
      pointOpacity,
      pointScale,
      bottomDashOffset,
      bottomOpacity,
      bottomScale,
    };
  }, [progress]);

  const finalCenterY = height + (finalSize / 2) - finalHidden;
  const travelY = clampTarget(finalCenterY - (height / 2), 170, 560);
  const travelX = clampTarget(width * 0.075, 22, 66);
  const pointX = progress.interpolate({
    inputRange: [0, 0.46, 0.56, 0.66, 0.77, 0.86, 1],
    outputRange: [0, 0, -travelX, travelX * 0.58, -travelX * 0.2, 0, 0],
    extrapolate: 'clamp',
  });
  const pointY = progress.interpolate({
    inputRange: [0, 0.46, 0.56, 0.66, 0.77, 0.86, 1],
    outputRange: [0, 0, travelY * 0.15, travelY * 0.48, travelY * 0.82, travelY, travelY],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen} accessibilityLabel="Chargement de l'application">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.centerSpiral,
          {
            opacity: animated.centerOpacity,
            transform: [{ scale: animated.centerScale }],
          },
        ]}
      >
        <SpiralSvg size={220} strokeWidth={8} dashOffset={animated.centerDashOffset} showCenter={false} />
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
            width: finalSize,
            height: finalSize,
            marginLeft: -(finalSize / 2),
            bottom: -finalHidden,
            opacity: animated.bottomOpacity,
            transform: [{ scale: animated.bottomScale }],
          },
        ]}
      >
        <SpiralSvg size={finalSize} strokeWidth={tablet ? 10.8 : 9.2} dashOffset={animated.bottomDashOffset} showCenter={false} />
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
  centerSpiral: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -110,
    marginTop: -110,
    width: 220,
    height: 220,
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
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#F5B51B',
    opacity: 0.42,
  },
  bottomSpiral: {
    position: 'absolute',
    left: '50%',
  },
});
