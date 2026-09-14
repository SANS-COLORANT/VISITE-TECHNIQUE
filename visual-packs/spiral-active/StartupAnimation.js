import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import { VelvetArt, velvetAvailable } from './velvetNative.js';
import { HomeBuildingScene } from './HomeBuildingScene.js';
import { markStartupHomeSceneComplete } from './homeSceneSession.js';

export const SPIRAL_ACTIVE_STARTUP_DURATION_MS = 4900;
const BG = '#F4F1E8';

/**
 * Startup signature:
 * spiral pop/draw -> spiral descent -> architecture + foliage form behind it -> dock handoff.
 * The home scene is already settled when the real Home screen mounts, avoiding a visual reload.
 */
export function SpiralActiveStartupAnimation({ onComplete }) {
  const { width, height } = useWindowDimensions();
  const size = width >= 800 ? 220 : 176;
  const hidden = Math.round(size * 0.45);
  const completed = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const handoff = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(null);
  const [dockReady, setDockReady] = useState(false);
  const [introEnded, setIntroEnded] = useState(false);
  const finish = useCallback(reason => {
    if (completed.current) return;
    completed.current = true;
    markStartupHomeSceneComplete();
    callback.current?.(reason);
  }, []);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); })
      .catch(() => { if (active) setReduceMotion(false); });
    const changes = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (value) finish('reduced-motion');
    });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') finish('interrupted'); });
    const watchdog = setTimeout(() => finish('media-timeout'), 13000);
    if (!velvetAvailable) finish('native-player-unavailable');
    return () => { active = false; clearTimeout(watchdog); changes.remove(); app.remove(); handoff.stopAnimation(); };
  }, [finish, handoff]);

  useEffect(() => {
    if (reduceMotion && dockReady) { finish('reduced-motion'); return; }
    if (!introEnded || !dockReady || completed.current) return;
    Animated.timing(handoff, { toValue: 1, duration: 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished) finish('completed'); });
  }, [reduceMotion, dockReady, introEnded, handoff, finish]);

  return (
    <View style={styles.screen} accessibilityLabel={'Chargement de l\u2019application'}>
      <HomeBuildingScene entryMode="startup" frame={{ left: 0, top: 0, width, height }} />

      {reduceMotion === false ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject,
          { opacity: handoff.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
          <VelvetArt mode="intro" targetDiameter={size} style={StyleSheet.absoluteFillObject}
            onMediaFinished={({ nativeEvent }) => {
              if (nativeEvent.reason === 'completed') setIntroEnded(true);
              else finish(nativeEvent.reason);
            }} />
        </Animated.View>
      ) : null}

      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '50%', marginLeft: -size / 2,
        bottom: -hidden, width: size, height: size, opacity: reduceMotion ? 1 : handoff }}>
        <VelvetArt mode="dock" style={{ width: size, height: size }}
          onMediaReady={() => setDockReady(true)} onMediaFinished={() => finish('dock-error')} />
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({ screen: { flex: 1, overflow: 'hidden', backgroundColor: BG } });
