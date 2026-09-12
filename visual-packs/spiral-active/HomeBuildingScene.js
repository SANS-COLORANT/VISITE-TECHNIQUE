import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PACK_MANIFEST = require('./manifest.json');

const BUILDING_SOURCES = Object.freeze({
  haussmann: require('./home-scene/01_haussmann_left_far.webp'),
  collectif: require('./home-scene/02_collectif_left_mid.webp'),
  'poste-municipal': require('./home-scene/03_poste_municipal_right_mid.webp'),
  building: require('./home-scene/04_building_right_near.webp'),
});

const SCENE_CONFIG = PACK_MANIFEST?.homeScene || {};
const CANVAS = Array.isArray(SCENE_CONFIG.canvas) && SCENE_CONFIG.canvas.length === 2
  ? SCENE_CONFIG.canvas
  : [1024, 540];
const CANVAS_WIDTH = Number(CANVAS[0]) || 1024;
const CANVAS_HEIGHT = Number(CANVAS[1]) || 540;
const CANVAS_RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;
const ENTRY_DURATION_MS = Number(SCENE_CONFIG.entryDurationMs) || 900;
const TRAVEL_FACTOR = Number(SCENE_CONFIG?.motion?.travelFactor) || 0.46;
const VERTICAL_OFFSET = Number(SCENE_CONFIG?.motion?.verticalOffsetPx) || 14;

const LAYERS = (Array.isArray(SCENE_CONFIG.layers) ? SCENE_CONFIG.layers : []).map((layer, index) => ({
  ...layer,
  source: BUILDING_SOURCES[layer.id],
  sideSign: layer.side === 'left' ? -1 : 1,
  depth: Number(layer.depth) || (index + 1),
  introStart: Number.isFinite(Number(layer.introStart)) ? Number(layer.introStart) : Math.min(0.30, index * 0.09),
  introEnd: Number.isFinite(Number(layer.introEnd)) ? Number(layer.introEnd) : Math.min(1, 0.58 + (index * 0.12)),
}));

const SCENE_READY = LAYERS.length === 4 && LAYERS.every((layer) => !!layer.source);

export function HomeBuildingScene() {
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!SCENE_READY) return undefined;
    intro.setValue(0);
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: ENTRY_DURATION_MS,
      delay: 80,
      easing: Easing.bezier(0.16, 0.84, 0.22, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [intro]);

  if (!SCENE_READY) {
    console.error('[PremiumHome] Scène bâtiments invalide : quatre calques indépendants sont requis.');
    return <View pointerEvents="none" style={styles.root} />;
  }

  const sceneWidth = portrait ? width : Math.min(width * 0.92, 1180);
  const sceneHeight = sceneWidth / CANVAS_RATIO;
  const sceneLeft = (width - sceneWidth) / 2;
  const sceneTop = portrait
    ? Math.max(84, Math.min(height * 0.07, 110))
    : 12;
  const travelBase = Math.min(sceneWidth, 1180);

  return (
    <View pointerEvents="none" style={styles.root}>
      <View
        testID="premium-four-building-scene"
        style={[
          styles.sceneViewport,
          {
            top: sceneTop,
            left: sceneLeft,
            width: sceneWidth,
            height: sceneHeight,
          },
        ]}
      >
        <View style={styles.sceneGlow} />

        {LAYERS.map((layer) => {
          const introProgress = intro.interpolate({
            inputRange: [0, layer.introStart, layer.introEnd, 1],
            outputRange: [0, 0, 1, 1],
            extrapolate: 'clamp',
          });
          const translateX = introProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              layer.sideSign * travelBase * (TRAVEL_FACTOR + (layer.depth * 0.035)),
              0,
            ],
            extrapolate: 'clamp',
          });
          const translateY = introProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [VERTICAL_OFFSET + (layer.depth * 2), 0],
            extrapolate: 'clamp',
          });
          const scale = introProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.96 + (layer.depth * 0.003), 1],
            extrapolate: 'clamp',
          });
          const opacity = introProgress.interpolate({
            inputRange: [0, 0.16, 1],
            outputRange: [0, 0.18, 1],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={layer.id}
              testID={`premium-building-${layer.id}`}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  zIndex: layer.depth,
                  opacity,
                  transform: [{ translateX }, { translateY }, { scale }],
                },
              ]}
            >
              <Image
                source={layer.source}
                style={styles.layerImage}
                resizeMode="contain"
                fadeDuration={0}
              />
            </Animated.View>
          );
        })}

        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(244,241,232,0)',
            'rgba(244,241,232,0)',
            'rgba(244,241,232,0.22)',
            '#F4F1E8',
          ]}
          locations={[0, 0.70, 0.88, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(244,241,232,0.90)', 'rgba(244,241,232,0.32)', 'rgba(244,241,232,0)']}
        locations={[0, 0.52, 1]}
        style={styles.topWash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#F4F1E8',
  },
  sceneViewport: {
    position: 'absolute',
    overflow: 'hidden',
  },
  sceneGlow: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    bottom: '5%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,253,248,0.62)',
  },
  layerImage: {
    width: '100%',
    height: '100%',
  },
  topWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 145,
  },
});
