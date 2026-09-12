import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, Vibration, View, useWindowDimensions } from 'react-native';
import { VelvetArt } from './velvetNative.js';

const MAX_ANGLE = 38;
const TRIGGER_ANGLE = 16;
const TABLET_SIZE = 220;
const PHONE_SIZE = 176;
const HIDDEN_RATIO = 0.45;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ActionButton({ action, onDone }) {
  if (!action) return null;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={action.label}
      activeOpacity={0.86}
      style={styles.actionButton}
      onPress={() => {
        onDone();
        requestAnimationFrame(() => action.onPress?.());
      }}
    >
      <View style={[styles.actionIconWrap, action.tone === 'action' ? styles.actionIconWrapHot : null]}>
        <Text style={styles.actionIcon}>{action.icon || '•'}</Text>
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
      {action.caption ? <Text style={styles.actionCaption} numberOfLines={1}>{action.caption}</Text> : null}
    </TouchableOpacity>
  );
}

export function SpiralActiveDock({ exploreActions = [], actionActions = [], quickActions = [], disabled = false }) {
  const { width } = useWindowDimensions();
  const tablet = width >= 800;
  const size = tablet ? TABLET_SIZE : PHONE_SIZE;
  const hidden = Math.round(size * HIDDEN_RATIO);
  const visible = size - hidden;
  const touchWidth = size + (tablet ? 56 : 42);
  const touchHeight = visible + 20;
  const panelWidth = Math.min(width - 34, tablet ? 392 : 340);

  const rotation = useRef(new Animated.Value(0)).current;
  const panelProgress = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState('closed');
  const gestureStartMode = useRef('closed');

  useEffect(() => {
    Animated.timing(panelProgress, {
      toValue: mode === 'closed' ? 0 : 1,
      duration: mode === 'closed' ? 120 : 180,
      useNativeDriver: true,
    }).start();
  }, [mode, panelProgress]);

  const settleRotation = (target) => Animated.spring(rotation, {
    toValue: target,
    speed: 20,
    bounciness: 3,
    useNativeDriver: true,
  }).start();

  const close = () => {
    setMode('closed');
    settleRotation(0);
  };

  const selectMode = (nextMode) => {
    Vibration.vibrate(8);
    setMode(nextMode);
    settleRotation(nextMode === 'explore' ? -19 : nextMode === 'actions' ? 19 : 0);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: (_, gesture) => !disabled && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4),
    onPanResponderGrant: () => {
      gestureStartMode.current = mode;
      rotation.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => rotation.setValue(clamp(gesture.dx * 0.28, -MAX_ANGLE, MAX_ANGLE)),
    onPanResponderRelease: (_, gesture) => {
      const angle = clamp(gesture.dx * 0.28, -MAX_ANGLE, MAX_ANGLE);
      const isTap = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
      if (isTap) {
        if (gestureStartMode.current === 'quick') close();
        else selectMode('quick');
        return;
      }
      if (angle <= -TRIGGER_ANGLE) selectMode('explore');
      else if (angle >= TRIGGER_ANGLE) selectMode('actions');
      else close();
    },
    onPanResponderTerminate: close,
  }), [disabled, mode]);

  const rotate = rotation.interpolate({
    inputRange: [-MAX_ANGLE, MAX_ANGLE],
    outputRange: [`-${MAX_ANGLE}deg`, `${MAX_ANGLE}deg`],
    extrapolate: 'clamp',
  });
  const panelTranslate = panelProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const visibleActions = mode === 'explore'
    ? exploreActions
    : mode === 'actions'
      ? actionActions
      : quickActions.length
        ? quickActions
        : [...exploreActions.slice(0, 2), ...actionActions.slice(0, 2)];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {mode !== 'closed' ? (
        <TouchableOpacity
          accessibilityLabel="Fermer les raccourcis"
          activeOpacity={1}
          style={styles.dismissLayer}
          onPress={close}
        />
      ) : null}

      <Animated.View
        pointerEvents={mode === 'closed' ? 'none' : 'auto'}
        style={[
          styles.panel,
          {
            width: panelWidth,
            marginLeft: -(panelWidth / 2),
            bottom: visible + 18,
            opacity: panelProgress,
            transform: [{ translateY: panelTranslate }],
          },
        ]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>{mode === 'explore' ? 'Explorer' : mode === 'actions' ? 'Actions' : 'Accès rapide'}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsRow}>
          {visibleActions.filter(Boolean).slice(0, 4).map((action, index) => (
            <ActionButton key={`${action?.label || 'action'}-${index}`} action={action} onDone={close} />
          ))}
        </View>
      </Animated.View>

      <View
        testID="premium-spiral-dock"
        accessibilityLabel="Raccourcis"
        style={[styles.touchZone, { width: touchWidth, height: touchHeight, marginLeft: -(touchWidth / 2) }]}
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" style={[styles.dockHalo, { width: size + 16, height: visible + 40 }]} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.spiralWrap,
            {
              width: size,
              height: size,
              bottom: -hidden,
              transform: [{ rotate }],
            },
          ]}
        >
          <VelvetArt mode="dock" style={{ width: size, height: size }} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismissLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,12,16,0.08)',
    zIndex: 305,
  },
  panel: {
    position: 'absolute',
    left: '50%',
    minHeight: 142,
    padding: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(14,18,22,0.94)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    zIndex: 330,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 80,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(111,180,169,0.18)',
    marginBottom: 5,
  },
  actionIconWrapHot: {
    backgroundColor: 'rgba(242,100,38,0.20)',
  },
  actionIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionCaption: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 8.4,
    lineHeight: 11,
    textAlign: 'center',
  },
  touchZone: {
    position: 'absolute',
    left: '50%',
    bottom: 0,
    overflow: 'hidden',
    alignItems: 'center',
    zIndex: 350,
  },
  dockHalo: {
    position: 'absolute',
    top: 13,
    borderRadius: 999,
    backgroundColor: 'rgba(255,253,248,0.22)',
  },
  spiralWrap: {
    position: 'absolute',
  },
});
