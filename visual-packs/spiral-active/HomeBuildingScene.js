import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Image, StyleSheet, View } from 'react-native';
import {
  initialLoadState, reduceLoadState, validateSceneConfig, timelineFor,
  layerTransform, foliageTransform,
} from './homeSceneModel.js';
import { consumeHomeSceneEntryMode } from './homeSceneSession.js';

const PACK_MANIFEST = require('./manifest.json');
const SCENE_SOURCES = Object.freeze({
  background: require('./home-scene/00_background.webp'),
  haussmann: require('./home-scene/01_haussmann_left_far.webp'),
  collectif: require('./home-scene/02_collectif_left_mid.webp'),
  'poste-municipal': require('./home-scene/03_poste_municipal_right_mid.webp'),
  building: require('./home-scene/04_building_right_near.webp'),
  'foliage-back': require('./home-scene/10_foliage_back.webp'),
  'foliage-mid': require('./home-scene/11_foliage_mid.webp'),
  'foliage-front': require('./home-scene/12_foliage_front.webp'),
});
const CONFIG = PACK_MANIFEST.homeScene;
const CONFIG_ERRORS = validateSceneConfig(CONFIG, SCENE_SOURCES);
const LOAD_TIMEOUT_MS = 8000;

function interpolated(progress, from, to) {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [from, to], extrapolate: 'clamp' });
}

/**
 * The strong dark outline is baked into each building/foliage WebP from the
 * original RGBA alpha mask. Runtime only moves/fades the exact prepared asset;
 * no tint, recolor or duplicate silhouette is applied to the architecture.
 */
function SceneAsset({ source, onLoad, onError }) {
  return (
    <Image source={source} resizeMode="cover" fadeDuration={0}
      style={styles.image} accessible={false} onLoad={onLoad} onError={onError} />
  );
}

export function HomeBuildingScene({ frame, onStatus, entryMode = 'auto' }) {
  const [load, dispatch] = useReducer(reduceLoadState, undefined, initialLoadState);
  const [reduceMotion, setReduceMotion] = useState(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const mode = useRef(entryMode === 'auto' ? consumeHomeSceneEntryMode() : entryMode).current;
  const intro = useRef(new Animated.Value(mode === 'settled' ? 1 : 0)).current;
  const mountedAt = useRef(Date.now());
  const settled = useRef(mode === 'settled');
  const started = useRef(false);
  const statusHandler = useRef(onStatus);
  statusHandler.current = onStatus;
  const valid = CONFIG_ERRORS.length === 0;
  const ready = valid && load.phase === 'ready';
  const paintImmediately = mode === 'settled';

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
    if (reduceMotion || mode === 'settled') {
      settled.current = true;
      intro.setValue(1);
      return undefined;
    }
    if (appState && appState !== 'active') return undefined;
    if (started.current || settled.current) return undefined;
    started.current = true;
    const duration = mode === 'startup' ? CONFIG.entryDurationMs : CONFIG.returnDurationMs;
    const elapsed = Date.now() - mountedAt.current;
    const delay = mode === 'startup' ? Math.max(0, CONFIG.startupDelayMs - elapsed) : 0;
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(intro, {
        toValue: 1,
        duration,
        easing: Easing.bezier(0.16, 0.84, 0.22, 1),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => { if (finished) settled.current = true; });
    return () => animation.stop();
  }, [ready, reduceMotion, appState, intro, mode]);

  if (!valid || !frame) return null;
  const bgProgress = intro.interpolate(timelineFor(CONFIG.background));
  return (
    <View testID="premium-layered-home-scene" pointerEvents="none" accessible={false}
      importantForAccessibility="no-hide-descendants" style={[styles.viewport, frame]}>
      <View style={[StyleSheet.absoluteFillObject, { opacity: paintImmediately || ready ? 1 : 0 }]}>
        <Animated.Image testID="premium-home-background" source={SCENE_SOURCES.background}
          resizeMode="cover" fadeDuration={0} accessible={false}
          style={[styles.image, { zIndex: CONFIG.background.depth, opacity: interpolated(bgProgress, 0, 1) }]}
          onLoad={() => dispatch({ type: 'loaded', id: 'background' })}
          onError={() => dispatch({ type: 'error', id: 'background' })} />

        {CONFIG.layers.map(layer => {
          const progress = intro.interpolate(timelineFor(layer));
          const from = layerTransform(layer, CONFIG, frame.width, 0);
          return (
            <Animated.View key={layer.id} testID={`premium-building-${layer.id}`}
              style={[StyleSheet.absoluteFillObject, {
                zIndex: layer.depth,
                opacity: interpolated(progress, 0, 1),
                transform: [
                  { translateX: interpolated(progress, from.translateX, 0) },
                  { translateY: interpolated(progress, from.translateY, 0) },
                  { scale: interpolated(progress, from.scale, 1) },
                ],
              }]}>
              <SceneAsset source={SCENE_SOURCES[layer.id]}
                onLoad={() => dispatch({ type: 'loaded', id: layer.id })}
                onError={() => dispatch({ type: 'error', id: layer.id })} />
            </Animated.View>
          );
        })}

        {CONFIG.foliage.map(layer => {
          const progress = intro.interpolate(timelineFor(layer));
          const from = foliageTransform(layer, CONFIG, 0);
          return (
            <Animated.View key={layer.id} testID={`premium-foliage-${layer.id}`}
              style={[StyleSheet.absoluteFillObject, {
                zIndex: layer.depth,
                opacity: interpolated(progress, 0, 1),
                transform: [
                  { translateY: interpolated(progress, from.translateY, 0) },
                  { scale: interpolated(progress, from.scale, 1) },
                ],
              }]}>
              <SceneAsset source={SCENE_SOURCES[layer.id]}
                onLoad={() => dispatch({ type: 'loaded', id: layer.id })}
                onError={() => dispatch({ type: 'error', id: layer.id })} />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { position: 'absolute', overflow: 'hidden', backgroundColor: 'transparent' },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', backgroundColor: 'transparent' },
});
