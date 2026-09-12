import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const LAYERS = [
  { id: 'haussmann', source: require('./home-scene/01_haussmann_left_far.webp'), fromX: -24, fromY: 10, delay: 0 },
  { id: 'collectif', source: require('./home-scene/02_collectif_left_mid.webp'), fromX: -16, fromY: 8, delay: 50 },
  { id: 'municipal', source: require('./home-scene/03_poste_municipal_right_mid.webp'), fromX: 16, fromY: 8, delay: 100 },
  { id: 'building', source: require('./home-scene/04_building_right_near.webp'), fromX: 24, fromY: 12, delay: 150 },
];

export function HomeBuildingScene() {
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(intro, {
      toValue: 1,
      duration: 760,
      delay: 60,
      easing: Easing.bezier(0.16, 0.84, 0.22, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [intro]);

  const sceneWidth = portrait ? width * 1.38 : width * 1.06;
  const sceneHeight = portrait ? Math.min(height * 0.63, 820) : Math.min(height * 0.82, 650);
  const sceneLeft = (width - sceneWidth) / 2;
  const sceneTop = portrait ? Math.max(55, height * 0.045) : 18;

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.ambient}>
        {LAYERS.map((layer) => (
          <Image
            key={`ambient-${layer.id}`}
            source={layer.source}
            style={styles.ambientImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ))}
        <View style={styles.ambientShade} />
      </View>

      <View style={[styles.sceneViewport, { top: sceneTop, left: sceneLeft, width: sceneWidth, height: sceneHeight }]}> 
        {LAYERS.map((layer, index) => {
          const start = Math.min(0.32, layer.delay / 760);
          const opacity = intro.interpolate({
            inputRange: [0, start, Math.min(1, start + 0.42), 1],
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
            outputRange: [layer.fromY + (index * 2), 0],
            extrapolate: 'clamp',
          });
          const scale = intro.interpolate({
            inputRange: [0, 1],
            outputRange: [0.985, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={layer.id}
              style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateX }, { translateY }, { scale }] }]}
            >
              <Image source={layer.source} style={styles.layerImage} resizeMode="contain" fadeDuration={0} />
            </Animated.View>
          );
        })}
      </View>

      <LinearGradient
        colors={[
          'rgba(13,19,25,0.03)',
          'rgba(13,19,25,0.11)',
          'rgba(244,241,232,0.18)',
          'rgba(244,241,232,0.86)',
          '#F4F1E8',
        ]}
        locations={[0, 0.30, 0.54, 0.76, 1]}
        style={styles.fullFade}
      />
      <LinearGradient
        colors={['rgba(244,241,232,0.42)', 'rgba(244,241,232,0)']}
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
  ambient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34,
  },
  ambientImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  ambientShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,241,232,0.18)',
  },
  sceneViewport: {
    position: 'absolute',
    overflow: 'hidden',
  },
  layerImage: {
    width: '100%',
    height: '100%',
  },
  fullFade: {
    ...StyleSheet.absoluteFillObject,
  },
  topWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 135,
  },
});
