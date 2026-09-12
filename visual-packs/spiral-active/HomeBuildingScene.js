import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const HERO = require('./home-scene/home-composite.webp');
const HERO_RATIO = 281 / 450;

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

  const heroWidth = portrait ? width * 1.08 : width * 0.98;
  const heroHeight = heroWidth * HERO_RATIO;
  const heroLeft = (width - heroWidth) / 2;
  const heroTop = portrait ? Math.max(92, height * 0.065) : 18;

  const opacity = intro.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, 0.2, 1],
    extrapolate: 'clamp',
  });
  const translateY = intro.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
    extrapolate: 'clamp',
  });
  const scale = intro.interpolate({
    inputRange: [0, 1],
    outputRange: [0.992, 1],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="none" style={styles.root}>
      <Image
        source={HERO}
        style={styles.ambientImage}
        resizeMode="cover"
        blurRadius={22}
        fadeDuration={0}
      />
      <View style={styles.ambientWash} />

      <Animated.View
        style={[
          styles.heroFrame,
          {
            top: heroTop,
            left: heroLeft,
            width: heroWidth,
            height: heroHeight,
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <Image source={HERO} style={styles.heroImage} resizeMode="cover" fadeDuration={0} />
        <LinearGradient
          colors={['rgba(7,14,19,0.00)', 'rgba(7,14,19,0.05)', 'rgba(7,14,19,0.18)']}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <LinearGradient
        colors={[
          'rgba(244,241,232,0.08)',
          'rgba(244,241,232,0.00)',
          'rgba(244,241,232,0.05)',
          'rgba(244,241,232,0.52)',
          '#F4F1E8',
        ]}
        locations={[0, 0.20, 0.43, 0.66, 0.86]}
        style={styles.fullFade}
      />
      <LinearGradient
        colors={['rgba(244,241,232,0.66)', 'rgba(244,241,232,0.14)', 'rgba(244,241,232,0)']}
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
  ambientImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.18,
    transform: [{ scale: 1.18 }],
  },
  ambientWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244,241,232,0.32)',
  },
  heroFrame: {
    position: 'absolute',
    overflow: 'hidden',
  },
  heroImage: {
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
    height: 155,
  },
});
