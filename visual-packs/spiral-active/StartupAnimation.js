import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { VelvetArt, velvetAvailable } from './velvetNative.js';
import { SpiralSvg, SPIRAL_PATH_LENGTH } from './SpiralArt.js';
import { HomeBuildingScene } from './HomeBuildingScene.js';
import { markStartupHomeSceneComplete } from './homeSceneSession.js';

export const SPIRAL_ACTIVE_STARTUP_DURATION_MS = 2100;
const BG = '#F4F1E8';

/**
 * New startup signature: one vector spiral only.
 * A centre point pops in, the line draws outwards, then the same spiral descends
 * to the dock while the architecture and foliage form behind it. The legacy
 * full-screen animated WebP is deliberately not mounted here anymore.
 */
export function SpiralActiveStartupAnimation({ onComplete }) {
  const { width, height } = useWindowDimensions();
  const size = width >= 800 ? 220 : 176;
  const hidden = Math.round(size * 0.45);
  const startTop = Math.max(82, Math.round(height * 0.31));
  const targetTop = height - size + hidden;
  const travelY = Math.max(0, targetTop - startTop);
  const initialScale = width >= 800 ? 1.42 : 1.28;

  const completed = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;

  const pop = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const descent = useRef(new Animated.Value(0)).current;
  const handoff = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(null);
  const [dockReady, setDockReady] = useState(false);
  const [sequenceEnded, setSequenceEnded] = useState(false);

  const finish = useCallback(reason => {
    if (completed.current) return;
    completed.current = true;
    markStartupHomeSceneComplete();
    callback.current?.(reason);
  }, []);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(Boolean(value)); })
      .catch(() => { if (active) setReduceMotion(false); });
    const changes = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (active) setReduceMotion(Boolean(value));
    });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') finish('interrupted'); });
    const watchdog = setTimeout(() => finish('startup-timeout'), 7000);
    return () => {
      active = false;
      clearTimeout(watchdog);
      changes.remove();
      app.remove();
      pop.stopAnimation();
      draw.stopAnimation();
      descent.stopAnimation();
      handoff.stopAnimation();
    };
  }, [finish, pop, draw, descent, handoff]);

  useEffect(() => {
    if (reduceMotion === null || completed.current) return undefined;
    if (reduceMotion) {
      pop.setValue(1);
      draw.setValue(1);
      descent.setValue(1);
      handoff.setValue(1);
      finish('reduced-motion');
      return undefined;
    }

    const sequence = Animated.sequence([
      Animated.timing(pop, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(draw, {
        toValue: 1,
        duration: 800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.delay(60),
      Animated.timing(descent, {
        toValue: 1,
        duration: 820,
        easing: Easing.bezier(0.16, 0.84, 0.22, 1),
        useNativeDriver: true,
      }),
    ]);
    sequence.start(({ finished }) => { if (finished) setSequenceEnded(true); });
    return () => sequence.stop();
  }, [reduceMotion, pop, draw, descent, handoff, finish]);

  useEffect(() => {
    if (!sequenceEnded || completed.current) return;
    if (!velvetAvailable) {
      finish('completed');
      return;
    }
    if (!dockReady) return;
    Animated.timing(handoff, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished) finish('completed'); });
  }, [sequenceEnded, dockReady, handoff, finish]);

  const dashOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [SPIRAL_PATH_LENGTH, 0],
    extrapolate: 'clamp',
  });
  const translateY = descent.interpolate({ inputRange: [0, 1], outputRange: [0, travelY] });
  const descentScale = descent.interpolate({ inputRange: [0, 1], outputRange: [initialScale, 1] });
  const popScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] });
  const vectorOpacity = handoff.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View style={styles.screen} accessibilityLabel={'Chargement de l\u2019application'}>
      <HomeBuildingScene entryMode="startup" frame={{ left: 0, top: 0, width, height }} />

      {reduceMotion === false ? (
        <Animated.View pointerEvents="none" testID="premium-vector-startup-spiral"
          style={{
            position: 'absolute',
            left: '50%',
            marginLeft: -(size / 2),
            top: startTop,
            width: size,
            height: size,
            opacity: vectorOpacity,
            transform: [
              { translateY },
              { scale: Animated.multiply(popScale, descentScale) },
            ],
          }}>
          <SpiralSvg size={size} strokeWidth={7} dashOffset={dashOffset} showCenter />
        </Animated.View>
      ) : null}

      {velvetAvailable ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: '50%', marginLeft: -(size / 2),
          bottom: -hidden, width: size, height: size,
          opacity: reduceMotion ? 1 : handoff,
        }}>
          <VelvetArt mode="dock" style={{ width: size, height: size }}
            onMediaReady={() => setDockReady(true)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden', backgroundColor: BG },
});
