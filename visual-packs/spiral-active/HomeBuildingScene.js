import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { initialLoadState, reduceLoadState, validateSceneConfig, timelineFor, layerTransform } from './homeSceneModel.js';

const PACK_MANIFEST = require('./manifest.json');
const BUILDING_SOURCES = Object.freeze({
  haussmann: require('./home-scene/01_haussmann_left_far.webp'),
  collectif: require('./home-scene/02_collectif_left_mid.webp'),
  'poste-municipal': require('./home-scene/03_poste_municipal_right_mid.webp'),
  building: require('./home-scene/04_building_right_near.webp'),
});
const CONFIG = PACK_MANIFEST.homeScene;
const CONFIG_ERRORS = validateSceneConfig(CONFIG, BUILDING_SOURCES);
const LOAD_TIMEOUT_MS = 8000;

// The parent supplies the SAME measured coordinate system used for the controls.
export function HomeBuildingScene({ frame, onStatus }) {
  const [load, dispatch] = useReducer(reduceLoadState, undefined, initialLoadState);
  const [reduceMotion, setReduceMotion] = useState(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const intro = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);
  const started = useRef(false);
  const statusHandler = useRef(onStatus);
  statusHandler.current = onStatus;
  const valid = CONFIG_ERRORS.length === 0;
  const ready = valid && load.phase === 'ready';

  useEffect(() => {
    let active = true;
    let preferenceEventReceived = false;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !preferenceEventReceived) setReduceMotion(Boolean(value));
    }).catch(() => { if (active && !preferenceEventReceived) setReduceMotion(true); });
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceEventReceived = true;
      if (active) setReduceMotion(Boolean(value));
    });
    const stateSub = AppState.addEventListener('change', setAppState);
    return () => { active = false; motionSub.remove(); stateSub.remove(); };
  }, []);

  useEffect(() => {
    if (!valid || load.phase !== 'loading' || (appState && appState !== 'active')) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'timeout' }), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [valid, load.phase, appState]);

  useEffect(() => {
    const status = valid ? load : { phase: 'error', failed: [], reason: 'config', details: CONFIG_ERRORS };
    statusHandler.current?.(status);
    if (status.phase === 'error') console.warn('[PremiumHome] Scene unavailable', status.reason, status.failed, CONFIG_ERRORS);
  }, [load, valid]);

  useEffect(() => {
    if (!ready || reduceMotion === null) return undefined;
    if (reduceMotion || settled.current || (appState && appState !== 'active')) {
      if (reduceMotion || started.current || settled.current) {
        settled.current = true;
        intro.setValue(1);
      }
      return undefined;
    }
    started.current = true;
    const animation = Animated.timing(intro, {
      toValue: 1, duration: CONFIG.entryDurationMs,
      easing: Easing.bezier(0.16, 0.84, 0.22, 1), useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished) settled.current = true; });
    return () => animation.stop();
  }, [ready, reduceMotion, appState, intro]);

  if (!valid || !frame) return null;
  return (
    <View testID="premium-four-building-scene" pointerEvents="none" accessible={false}
      importantForAccessibility="no-hide-descendants" style={[styles.viewport, frame]}>
      {/* Keep images mounted to decode, but never reveal a misleading partial scene. */}
      <View style={[StyleSheet.absoluteFillObject, { opacity: ready ? 1 : 0 }]}>
        {CONFIG.layers.map(layer => {
          const progress = intro.interpolate(timelineFor(layer));
          const from = layerTransform(layer, CONFIG, frame.width, 0);
          const interpolate = (a, b) => progress.interpolate({ inputRange: [0, 1], outputRange: [a, b], extrapolate: 'clamp' });
          return (
            <Animated.View key={layer.id} testID={`premium-building-${layer.id}`}
              style={[StyleSheet.absoluteFillObject, {
                zIndex: layer.depth, opacity: interpolate(0, 1),
                transform: [{ translateX: interpolate(from.translateX, 0) },
                  { translateY: interpolate(from.translateY, 0) }, { scale: interpolate(from.scale, 1) }],
              }]}>
              <Image source={BUILDING_SOURCES[layer.id]} resizeMode="contain" fadeDuration={0}
                style={styles.image} accessible={false}
                onLoad={() => dispatch({ type: 'loaded', id: layer.id })}
                onError={() => dispatch({ type: 'error', id: layer.id })} />
            </Animated.View>
          );
        })}
        <LinearGradient pointerEvents="none"
          colors={['rgba(244,241,232,0)', 'rgba(244,241,232,0.12)', '#F4F1E8']}
          locations={[0, 0.78, 1]} style={[StyleSheet.absoluteFillObject, styles.fade]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { position: 'absolute', overflow: 'hidden', backgroundColor: 'transparent' },
  image: { width: '100%', height: '100%', backgroundColor: 'transparent' },
  fade: { zIndex: 10 },
});
