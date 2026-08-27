import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { appVersionLabel } from './appVersion.js';
import { DoomMaskVector } from './DoomMaskVector.js';

export const DOOM_ANIMATION_MS = 2600;

const ORANGE = '#D8552A';
const GREEN = '#106836';
const CREAM = '#FBF0E1';

const ASSETS = {
  wingLeft: require('./assets/metra/wing-left-trim.png'),
  wingRight: require('./assets/metra/wing-right-trim.png'),
  head: require('./assets/metra/head-trim.png'),
  body: require('./assets/metra/body-trim.png'),
};

function TintedLayer({ source, baseStyle, animatedStyle, tintColor, opacityStyle }) {
  return (
    <Animated.Image
      source={source}
      resizeMode="contain"
      style={[styles.layer, baseStyle, animatedStyle, { tintColor }, opacityStyle]}
    />
  );
}

export function DoomLoadingScreen() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DOOM_ANIMATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const a = useMemo(() => {
    const wingOpacity = progress.interpolate({ inputRange: [0, 1100 / 2600, 1], outputRange: [0.6, 1, 1] });
    const leftX = progress.interpolate({ inputRange: [0, 1100 / 2600, 1], outputRange: [-52, 0, 0] });
    const rightX = progress.interpolate({ inputRange: [0, 1100 / 2600, 1], outputRange: [52, 0, 0] });
    const wingY = progress.interpolate({ inputRange: [0, 1100 / 2600, 1], outputRange: [-26, 0, 0] });
    const centerScale = progress.interpolate({ inputRange: [0, 100 / 2600, 1100 / 2600, 1], outputRange: [0.5, 0.5, 1, 1] });
    const wordOpacity = progress.interpolate({ inputRange: [0, 1200 / 2600, 1], outputRange: [0, 1, 1] });
    const wordY = progress.interpolate({ inputRange: [0, 1200 / 2600, 1], outputRange: [12, 0, 0] });
    const orangeOpacity = progress.interpolate({ inputRange: [0, 1800 / 2600, 1], outputRange: [1, 1, 0] });
    const greenOpacity = progress.interpolate({ inputRange: [0, 1800 / 2600, 1], outputRange: [0, 0, 1] });
    const doomOpacity = progress.interpolate({ inputRange: [0, 1800 / 2600, 2300 / 2600, 1], outputRange: [0, 0, 1, 1] });

    return {
      wingLeft: { opacity: wingOpacity, transform: [{ translateX: leftX }, { translateY: wingY }] },
      wingRight: { opacity: wingOpacity, transform: [{ translateX: rightX }, { translateY: wingY }] },
      center: { transform: [{ scale: centerScale }] },
      word: { opacity: wordOpacity, transform: [{ translateY: wordY }] },
      orangeOpacity: { opacity: orangeOpacity },
      greenOpacity: { opacity: greenOpacity },
      doom: { opacity: doomOpacity },
    };
  }, [progress]);

  return (
    <View style={styles.screen} accessibilityLabel={`Chargement de METRA ${appVersionLabel()} - theme anime`}>
      <View style={styles.canvas}>
        <TintedLayer source={ASSETS.wingLeft} baseStyle={styles.wingLeft} animatedStyle={a.wingLeft} tintColor={ORANGE} opacityStyle={a.orangeOpacity} />
        <TintedLayer source={ASSETS.wingRight} baseStyle={styles.wingRight} animatedStyle={a.wingRight} tintColor={ORANGE} opacityStyle={a.orangeOpacity} />
        <TintedLayer source={ASSETS.head} baseStyle={styles.head} animatedStyle={a.center} tintColor={ORANGE} opacityStyle={a.orangeOpacity} />
        <TintedLayer source={ASSETS.body} baseStyle={styles.body} animatedStyle={a.center} tintColor={ORANGE} opacityStyle={a.orangeOpacity} />

        <TintedLayer source={ASSETS.wingLeft} baseStyle={styles.wingLeft} animatedStyle={a.wingLeft} tintColor={GREEN} opacityStyle={a.greenOpacity} />
        <TintedLayer source={ASSETS.wingRight} baseStyle={styles.wingRight} animatedStyle={a.wingRight} tintColor={GREEN} opacityStyle={a.greenOpacity} />
        <TintedLayer source={ASSETS.head} baseStyle={styles.head} animatedStyle={a.center} tintColor={GREEN} opacityStyle={a.greenOpacity} />
        <TintedLayer source={ASSETS.body} baseStyle={styles.body} animatedStyle={a.center} tintColor={GREEN} opacityStyle={a.greenOpacity} />

        <Animated.View pointerEvents="none" style={[styles.layer, styles.doomFigure, a.doom]}>
          <DoomMaskVector />
        </Animated.View>

        <Animated.View style={[styles.wordmarkWrap, a.word]}>
          <Animated.Text style={[styles.wordmark, { color: ORANGE }, a.orangeOpacity]}>METRA</Animated.Text>
          <Animated.Text style={[styles.wordmark, styles.wordmarkOverlay, { color: GREEN }, a.greenOpacity]}>METRA</Animated.Text>
          <Text style={styles.version}>{appVersionLabel()}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  canvas: { width: 310, height: 280 },
  layer: { position: 'absolute' },
  wingLeft: { left: 54, top: 58, width: 96, height: 128 },
  wingRight: { left: 160, top: 58, width: 96, height: 128 },
  head: { left: 140, top: 126, width: 30, height: 30 },
  body: { left: 135, top: 153, width: 40, height: 34 },
  doomFigure: { left: 111, top: 112, width: 88, height: 85 },
  wordmarkWrap: { position: 'absolute', left: 0, right: 0, top: 218, alignItems: 'center' },
  wordmark: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: '700', letterSpacing: 3.2 },
  wordmarkOverlay: { position: 'absolute', top: 0 },
  version: { marginTop: 8, color: '#7A665C', fontFamily: 'sans-serif', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
});
