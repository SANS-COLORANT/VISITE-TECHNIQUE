import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const CANVAS_RATIO = 1024 / 540;
const LAYERS = [
  { id: 'haussmann', source: require('./home-scene/01_haussmann_left_far.webp'), fromX: -18, delay: 0 },
  { id: 'collectif', source: require('./home-scene/02_collectif_left_mid.webp'), fromX: -12, delay: 55 },
  { id: 'municipal', source: require('./home-scene/03_poste_municipal_right_mid.webp'), fromX: 12, delay: 110 },
  { id: 'building', source: require('./home-scene/04_building_right_near.webp'), fromX: 18, delay: 165 },
];

export function HomeBuildingScene() {
  const { width, height } = useWindowDimensions();
  const intro = useRef(new Animated.Value(0)).current;
  const sceneHeight = Math.min(Math.max(390, width / CANVAS_RATIO), Math.max(430, height * 0.76));
  const sceneTop = Math.max(0, Math.min(34, height * 0.045));

  useEffect(() => {
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: 620,
      delay: 90,
      easing: Easing.bezier(0.16, 0.84, 0.22, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [intro]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.sceneViewport, { top: sceneTop, height: sceneHeight }]}> 
        {LAYERS.map((layer, index) => {
          const start = Math.min(0.35, (layer.delay / 620));
          const opacity = intro.interpolate({
            inputRange: [0, start, Math.min(1, start + 0.48), 1],
            outputRange: [0, 0, 1, 1],
            extrapolate: 'clamp',
          });
          const translateX = intro.interpolate({
            inputRange: [0, 1],
            outputRange: [layer.fromX, 0],
            extrapolate: 'clamp',
          });
          const translateY = intro.interpolate({
            inputRange: [0, 1],
            outputRange: [8 + (index * 2), 0],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={layer.id}
              style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateX }, { translateY }] }]}
            >
              <Image source={layer.source} style={styles.layerImage} resizeMode="cover" fadeDuration={0} />
            </Animated.View>
          );
        })}
        <View style={styles.softWash} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(244,241,232,0)', 'rgba(244,241,232,0.12)', 'rgba(244,241,232,0.94)']}
          locations={[0, 0.7, 1]}
          style={styles.bottomFade}
        />
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(244,241,232,0.58)', 'rgba(244,241,232,0)']}
        style={styles.topWash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sceneViewport: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#F4F1E8',
  },
  layerImage: {
    width: '100%',
    height: '100%',
  },
  softWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,241,232,0.08)',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '35%',
  },
  topWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 90,
  },
});
