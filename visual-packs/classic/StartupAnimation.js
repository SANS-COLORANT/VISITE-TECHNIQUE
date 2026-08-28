import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { appVersionLabel } from '../../appVersion.js';

export const CLASSIC_STARTUP_DURATION_MS = 2300;
const ORANGE = '#D8552A';
const CREAM = '#FBF0E1';

const ASSETS = {
  wingLeft: require('../shared/assets/wing-left-trim.png'),
  wingRight: require('../shared/assets/wing-right-trim.png'),
  head: require('../shared/assets/head-trim.png'),
  body: require('../shared/assets/body-trim.png'),
};

function layerStyle(base, animated) {
  return [styles.layer, base, animated];
}

export function ClassicStartupAnimation() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: CLASSIC_STARTUP_DURATION_MS,
      easing: Easing.bezier(0.2, 0.9, 0.25, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const animationStyles = useMemo(() => {
    const wingOpacity = progress.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, 1, 1] });
    const wingX = progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [65, 0, 0] });
    const wingY = progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [-35, 0, 0] });
    const wingRotation = progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: ['8deg', '0deg', '0deg'] });
    const wingRotationLeft = progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: ['-8deg', '0deg', '0deg'] });
    const headOpacity = progress.interpolate({ inputRange: [0, 0.237, 0.487, 1], outputRange: [0, 0, 1, 1] });
    const headScale = progress.interpolate({ inputRange: [0, 0.237, 0.487, 0.637, 1], outputRange: [0.3, 0.3, 1.15, 1, 1] });
    const bodyOpacity = progress.interpolate({ inputRange: [0, 0.295, 0.545, 1], outputRange: [0, 0, 1, 1] });
    const bodyScale = progress.interpolate({ inputRange: [0, 0.295, 0.545, 0.695, 1], outputRange: [0.3, 0.3, 1.15, 1, 1] });
    const wordOpacity = progress.interpolate({ inputRange: [0, 0.531, 0.691, 1], outputRange: [0, 0, 1, 1] });
    const wordY = progress.interpolate({ inputRange: [0, 0.531, 0.691, 1], outputRange: [4, 4, 0, 0] });

    return {
      wingLeft: { opacity: wingOpacity, transform: [{ translateX: Animated.multiply(wingX, -1) }, { translateY: wingY }, { rotate: wingRotationLeft }] },
      wingRight: { opacity: wingOpacity, transform: [{ translateX: wingX }, { translateY: wingY }, { rotate: wingRotation }] },
      head: { opacity: headOpacity, transform: [{ scale: headScale }] },
      body: { opacity: bodyOpacity, transform: [{ scale: bodyScale }] },
      word: { opacity: wordOpacity, transform: [{ translateY: wordY }] },
    };
  }, [progress]);

  return (
    <View style={styles.screen} accessibilityLabel={`Chargement de METRA ${appVersionLabel()}`}>
      <View style={styles.canvas}>
        <Animated.Image source={ASSETS.wingLeft} resizeMode="contain" style={layerStyle(styles.wingLeft, animationStyles.wingLeft)} />
        <Animated.Image source={ASSETS.wingRight} resizeMode="contain" style={layerStyle(styles.wingRight, animationStyles.wingRight)} />
        <Animated.Image source={ASSETS.head} resizeMode="contain" style={layerStyle(styles.head, animationStyles.head)} />
        <Animated.Image source={ASSETS.body} resizeMode="contain" style={layerStyle(styles.body, animationStyles.body)} />
        <Animated.View style={[styles.wordmarkWrap, animationStyles.word]}>
          <Text style={styles.wordmark}>METRA</Text>
          <Text style={styles.version}>{appVersionLabel()}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  canvas: { width: 310, height: 270 },
  layer: { position: 'absolute' },
  wingLeft: { left: 67, top: 82, width: 86, height: 115 },
  wingRight: { left: 157, top: 82, width: 86, height: 115 },
  head: { left: 143, top: 146, width: 29, height: 29 },
  body: { left: 138, top: 173, width: 40, height: 34 },
  wordmarkWrap: { position: 'absolute', left: 0, right: 0, top: 216, alignItems: 'center' },
  wordmark: { color: ORANGE, fontFamily: 'sans-serif', fontSize: 18, fontWeight: '700', letterSpacing: 2.5 },
  version: { marginTop: 7, color: '#7A665C', fontFamily: 'sans-serif', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
});
