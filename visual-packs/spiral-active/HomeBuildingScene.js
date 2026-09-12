import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, Vibration, View, useWindowDimensions } from 'react-native';

const CANVAS_RATIO = 1024 / 540;
const OPEN_THRESHOLD = 0.62;

const LAYERS = [
  { id: 'haussmann', source: require('./home-scene/01_haussmann_left_far.webp'), side: -1, depth: 1, introStart: 0.02, introEnd: 0.55 },
  { id: 'collectif', source: require('./home-scene/02_collectif_left_mid.webp'), side: -1, depth: 2, introStart: 0.10, introEnd: 0.68 },
  { id: 'municipal', source: require('./home-scene/03_poste_municipal_right_mid.webp'), side: 1, depth: 3, introStart: 0.20, introEnd: 0.82 },
  { id: 'building', source: require('./home-scene/04_building_right_near.webp'), side: 1, depth: 4, introStart: 0.30, introEnd: 1.00 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  const dx = Number(a.pageX || 0) - Number(b.pageX || 0);
  const dy = Number(a.pageY || 0) - Number(b.pageY || 0);
  return Math.sqrt((dx * dx) + (dy * dy));
}

export function useBuildingSceneMotion() {
  const intro = useRef(new Animated.Value(0)).current;
  const opening = useRef(new Animated.Value(0)).current;
  const openingRef = useRef(0);
  const startDistance = useRef(0);
  const startOpening = useRef(0);
  const pinching = useRef(false);
  const hapticSent = useRef(false);
  const [hubOpen, setHubOpen] = useState(false);

  useEffect(() => {
    const introAnimation = Animated.timing(intro, {
      toValue: 1,
      duration: 1050,
      delay: 120,
      easing: Easing.bezier(0.16, 0.84, 0.22, 1),
      useNativeDriver: true,
    });
    introAnimation.start();
    return () => introAnimation.stop();
  }, [intro]);

  const setOpening = (value) => {
    const next = clamp(value, 0, 1);
    openingRef.current = next;
    opening.setValue(next);
    if (!hapticSent.current && next >= OPEN_THRESHOLD) {
      hapticSent.current = true;
      Vibration.vibrate(10);
    } else if (next < OPEN_THRESHOLD - 0.08) {
      hapticSent.current = false;
    }
  };

  const settle = (target) => {
    opening.stopAnimation((value) => {
      openingRef.current = Number(value || 0);
      Animated.spring(opening, {
        toValue: target,
        speed: 18,
        bounciness: 4,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        openingRef.current = target;
        setHubOpen(target === 1);
        hapticSent.current = target === 1;
      });
    });
  };

  const openHub = () => { Vibration.vibrate(10); settle(1); };
  const closeHub = () => settle(0);

  const onTouchStart = (event) => {
    const touches = event?.nativeEvent?.touches || [];
    if (touches.length < 2) return;
    startDistance.current = touchDistance(touches);
    startOpening.current = openingRef.current;
    pinching.current = startDistance.current > 0;
    opening.stopAnimation();
  };

  const onTouchMove = (event) => {
    const touches = event?.nativeEvent?.touches || [];
    if (touches.length < 2) return;
    const distance = touchDistance(touches);
    if (!pinching.current || !startDistance.current) {
      startDistance.current = distance;
      startOpening.current = openingRef.current;
      pinching.current = distance > 0;
      return;
    }
    const ratio = distance / startDistance.current;
    const delta = (ratio - 1) / 0.48;
    setHubOpen(false);
    setOpening(startOpening.current + delta);
  };

  const onTouchEnd = (event) => {
    const touches = event?.nativeEvent?.touches || [];
    if (!pinching.current || touches.length >= 2) return;
    pinching.current = false;
    startDistance.current = 0;
    const target = openingRef.current >= OPEN_THRESHOLD ? 1 : 0;
    if (target === 1 && !hapticSent.current) Vibration.vibrate(10);
    settle(target);
  };

  return { intro, opening, hubOpen, onTouchStart, onTouchMove, onTouchEnd, openHub, closeHub };
}

function HubAction({ title, caption, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.82} style={styles.hubAction} onPress={onPress}>
      <Text style={styles.hubActionTitle}>{title}</Text>
      <Text style={styles.hubActionCaption}>{caption}</Text>
    </TouchableOpacity>
  );
}

export function HomeBuildingScene({ motion, navigation, openDirectory, choisirExcel }) {
  const { width, height } = useWindowDimensions();
  const travelBase = Math.min(width, 1180);
  const sceneHeight = Math.min(height, Math.max(360, width / CANVAS_RATIO));
  const hubOpacity = motion.opening.interpolate({ inputRange: [0, 0.46, 0.82, 1], outputRange: [0, 0, 0.92, 1], extrapolate: 'clamp' });
  const hubScale = motion.opening.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.88, 0.92, 1], extrapolate: 'clamp' });

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[styles.sceneViewport, { height: sceneHeight }]}> 
        <Animated.View style={[styles.hubAura, { opacity: hubOpacity, transform: [{ scale: hubScale }] }]} />
        {LAYERS.map((layer) => {
          const introProgress = motion.intro.interpolate({
            inputRange: [0, layer.introStart, layer.introEnd, 1],
            outputRange: [0, 0, 1, 1],
            extrapolate: 'clamp',
          });
          const introX = introProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [layer.side * travelBase * (0.54 + (layer.depth * 0.045)), 0],
            extrapolate: 'clamp',
          });
          const openingX = motion.opening.interpolate({
            inputRange: [0, 1],
            outputRange: [0, layer.side * travelBase * (0.10 + (layer.depth * 0.045))],
            extrapolate: 'clamp',
          });
          const openingY = motion.opening.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -(layer.depth * 5)],
            extrapolate: 'clamp',
          });
          const scale = motion.opening.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1 + (layer.depth * 0.022)],
            extrapolate: 'clamp',
          });
          const opacity = introProgress.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, 0.15, 1], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={layer.id}
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity,
                  transform: [
                    { translateX: Animated.add(introX, openingX) },
                    { translateY: openingY },
                    { scale },
                  ],
                },
              ]}
            >
              <Image source={layer.source} style={styles.layerImage} resizeMode="cover" fadeDuration={0} />
            </Animated.View>
          );
        })}
        <View style={styles.softWash} />
      </View>

      <Animated.View
        pointerEvents={motion.hubOpen ? 'auto' : 'none'}
        style={[styles.hubPanel, { opacity: hubOpacity, transform: [{ scale: hubScale }] }]}
      >
        <Text style={styles.hubKicker}>HUB METRA</Text>
        <Text style={styles.hubTitle}>Entrer dans le patrimoine</Text>
        <Text style={styles.hubSubtitle}>Les bâtiments s'ouvrent pour révéler les accès principaux.</Text>
        <View style={styles.hubActions}>
          <HubAction title="PATRIMOINE" caption="Clients, sites et équipements" onPress={openDirectory} />
          <HubAction title="IMPORTER" caption="Créer / reprendre une visite" onPress={choisirExcel} />
          <HubAction title="RÉGLAGES" caption="Packs visuels et application" onPress={() => navigation.navigate('Parametres')} />
        </View>
        <TouchableOpacity style={styles.closeHub} onPress={motion.closeHub}><Text style={styles.closeHubText}>Refermer la scène</Text></TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sceneViewport: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden', backgroundColor: '#F4F1E8' },
  layerImage: { width: '100%', height: '100%' },
  softWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(244,241,232,0.18)' },
  hubAura: { position: 'absolute', left: '27%', right: '27%', top: '14%', bottom: '16%', borderRadius: 999, backgroundColor: 'rgba(255,253,248,0.93)' },
  hubPanel: { position: 'absolute', top: '16%', left: '50%', marginLeft: -190, width: 380, maxWidth: '82%', padding: 18, backgroundColor: 'rgba(255,253,248,0.97)', borderWidth: 1, borderColor: '#DDE2E3', zIndex: 14 },
  hubKicker: { color: '#F26426', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  hubTitle: { marginTop: 4, color: '#14202C', fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -0.5 },
  hubSubtitle: { marginTop: 7, color: '#69747E', fontSize: 11.5, lineHeight: 16 },
  hubActions: { marginTop: 14, gap: 7 },
  hubAction: { minHeight: 55, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#DDE2E3', backgroundColor: '#F7F6F1' },
  hubActionTitle: { color: '#14202C', fontSize: 11.5, fontWeight: '900', letterSpacing: 0.8 },
  hubActionCaption: { marginTop: 2, color: '#69747E', fontSize: 9.5 },
  closeHub: { alignSelf: 'center', marginTop: 12, minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: '#F26426' },
  closeHubText: { color: '#14202C', fontSize: 10.5, fontWeight: '900' },
});