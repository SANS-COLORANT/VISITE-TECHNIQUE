import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const STEPS = [
  { at: 0, phase: 'boot' },
  { at: 1500, phase: 'interrupt' },
  { at: 2450, phase: 'module' },
  { at: 3300, phase: 'r1' },
  { at: 3850, phase: 'rDot1' },
  { at: 4300, phase: 'erw1' },
  { at: 4750, phase: 'erwann' },
  { at: 5650, phase: 'diag' },
  { at: 7600, phase: 'final' },
  { at: 8850, phase: 'out' },
];

export function R1EasterEgg({ visible, onFinish }) {
  const [phase, setPhase] = useState('boot');
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const timers = useRef([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!visible) {
      clearTimers();
      return;
    }

    setPhase('boot');
    opacity.setValue(0);
    scale.setValue(0.96);
    progress.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 150, useNativeDriver: true }),
    ]).start();

    Animated.timing(progress, {
      toValue: 0.8,
      duration: 1350,
      useNativeDriver: false,
    }).start();

    STEPS.slice(1).forEach((step) => {
      const id = setTimeout(() => {
        setPhase(step.phase);
        if (step.phase === 'out') {
          Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => {
            onFinish?.();
          });
        }
      }, step.at);
      timers.current.push(id);
    });

    return clearTimers;
  }, [visible, onFinish, opacity, scale, progress]);

  const word = useMemo(() => {
    if (phase === 'rDot1') return 'R•1';
    if (phase === 'erw1') return 'ERW1';
    if (phase === 'erwann') return 'ERWANN';
    return 'R1';
  }, [phase]);

  if (!visible) return null;

  const showBoot = phase === 'boot';
  const showInterrupt = phase === 'interrupt';
  const showModule = phase === 'module';
  const showWord = ['r1', 'rDot1', 'erw1', 'erwann'].includes(phase);
  const showDiag = phase === 'diag';
  const showFinal = phase === 'final' || phase === 'out';

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <Pressable style={styles.backdrop} onPress={() => {}}>
        <Animated.View style={[styles.stage, { opacity, transform: [{ scale }] }]}> 
          {showBoot && (
            <View style={styles.centered}>
              <Text style={styles.symbol}>◢◣</Text>
              <Text style={styles.kicker}>MAINTENANCE MODE</Text>
              <Text style={styles.muted}>Initializing diagnostic protocol…</Text>
              <View style={styles.barTrack}>
                <Animated.View style={[styles.barFill, { width: progressWidth }]} />
              </View>
            </View>
          )}

          {showInterrupt && (
            <View style={styles.centered}>
              <Text style={styles.status}>Standard protocol interrupted.</Text>
              <Text style={styles.status}>Unknown module detected.</Text>
            </View>
          )}

          {showModule && (
            <View style={styles.centered}>
              <Text style={styles.module}>MODULE : <Text style={styles.moduleStrong}>R1</Text></Text>
            </View>
          )}

          {showWord && (
            <View style={styles.centered}>
              <Text style={[styles.hero, phase === 'erwann' && styles.heroErwann]}>{word}</Text>
            </View>
          )}

          {showDiag && (
            <View style={styles.centered}>
              <Text style={styles.diagTitle}>ERWANN MODULE</Text>
              <Text style={styles.diagLine}>Status ............. <Text style={styles.ok}>ONLINE</Text></Text>
              <Text style={styles.diagLine}>Technical expertise .... 100%</Text>
              <Text style={styles.diagLine}>Coffee level ........ <Text style={styles.warn}>CRITICAL</Text></Text>
              <Text style={styles.diagLine}>Bad faith ............ 100%</Text>
            </View>
          )}

          {showFinal && (
            <View style={styles.centered}>
              <Text style={styles.finalR1}>R1</Text>
              <Text style={styles.tagline}>If you know, you know.</Text>
              <Text style={styles.classified}>R1 PROTOCOL · CLASSIFIED</Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#070707', alignItems: 'center', justifyContent: 'center' },
  stage: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  symbol: { color: '#E7E7E7', fontSize: 38, letterSpacing: 2, marginBottom: 18 },
  kicker: { color: '#A5A5A5', fontSize: 11, letterSpacing: 4, fontWeight: '600' },
  muted: { color: '#666', fontSize: 11, letterSpacing: 1, marginTop: 10 },
  barTrack: { width: 160, height: 2, backgroundColor: '#1C1C1C', marginTop: 18, overflow: 'hidden' },
  barFill: { height: 2, backgroundColor: '#E7E7E7' },
  status: { color: '#9A9A9A', fontSize: 13, letterSpacing: 0.8, lineHeight: 28 },
  module: { color: '#9A9A9A', fontSize: 15, letterSpacing: 3 },
  moduleStrong: { color: '#FFFFFF', fontWeight: '700' },
  hero: { color: '#FFFFFF', fontSize: 64, fontWeight: '700', letterSpacing: 5 },
  heroErwann: { fontSize: 44, letterSpacing: 4 },
  diagTitle: { color: '#F0F0F0', fontSize: 16, letterSpacing: 5, marginBottom: 22, fontWeight: '600' },
  diagLine: { color: '#B2B2B2', fontSize: 13, lineHeight: 27, letterSpacing: 0.5 },
  ok: { color: '#7FD68A', fontWeight: '700' },
  warn: { color: '#E0764F', fontWeight: '700' },
  finalR1: { color: '#FFFFFF', fontSize: 56, fontWeight: '700', letterSpacing: 4 },
  tagline: { color: '#7B7B7B', fontSize: 12, marginTop: 12 },
  classified: { color: '#4A4A4A', fontSize: 9, letterSpacing: 2.2, marginTop: 7 },
});
