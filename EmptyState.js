/**
 * Illustration des écrans vides.
 *
 * EmptyIcon : petite scène au-dessus du texte — l'icône dans son rond orange,
 * deux anneaux qui s'ouvrent à l'apparition, quelques points décoratifs et un
 * léger flottement. Utilisée telle quelle par les écrans existants.
 * EmptyState : la même scène avec titre, explication et bouton d'action
 * facultatif, pour remplacer un simple « Aucun… » en texte brut.
 *
 * Animations sur le thread natif ; le flottement est coupé si le système
 * demande de réduire les animations.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { IconOrb } from './premiumChrome.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';

const SPARKS = Object.freeze([
  { x: -46, y: -22, size: 7, color: COLORS.orange },
  { x: 48, y: -30, size: 5, color: '#FFB37A' },
  { x: 54, y: 18, size: 8, color: COLORS.orangeLight },
  { x: -52, y: 24, size: 5, color: '#FFB37A' },
  { x: 6, y: -50, size: 4, color: COLORS.orange },
]);

function useEmptyMotion() {
  const enter = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop = null;
    let cancelled = false;
    Animated.timing(enter, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const startFloat = (reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.start();
    };
    const check = AccessibilityInfo.isReduceMotionEnabled?.();
    if (check?.then) check.then(startFloat, () => startFloat(false)); else startFloat(false);
    return () => { cancelled = true; loop?.stop(); };
  }, [enter, float]);
  return { enter, float };
}

export function EmptyIcon({ name = 'note' }) {
  const { enter, float } = useEmptyMotion();
  const pop = enter.interpolate({ inputRange: [0, .45, .7, 1], outputRange: [.5, 1.08, .97, 1] });
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const ring = (delay) => {
    const t = enter.interpolate({ inputRange: [0, delay, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
    return {
      opacity: t.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .55, .22] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }) }],
    };
  };
  return (
    <View style={{ marginBottom: 16, alignItems: 'center', justifyContent: 'center', width: 150, height: 112, alignSelf: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 1.5, borderColor: COLORS.orange, borderStyle: 'dashed' }, ring(.25)]} />
      <Animated.View style={[{ position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.orangeLight }, ring(.1)]} />
      {SPARKS.map((sp, i) => <Animated.View key={i} style={{
        position: 'absolute', width: sp.size, height: sp.size, borderRadius: sp.size, backgroundColor: sp.color,
        opacity: enter.interpolate({ inputRange: [0, .4 + i * .08, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
        transform: [
          { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [sp.x * .4, sp.x] }) },
          { translateY: Animated.add(enter.interpolate({ inputRange: [0, 1], outputRange: [sp.y * .4, sp.y] }), float.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 ? 3 : -3] })) },
        ],
      }} />)}
      <Animated.View style={{ opacity: enter.interpolate({ inputRange: [0, .3], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ translateY: bob }, { scale: pop }] }}>
        <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={62} radius={22}>
          <CvcIcon name={name} size={30} color={COLORS.orangeDark} />
        </IconOrb>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', bottom: 2, width: 46, height: 6, borderRadius: 6, backgroundColor: 'rgba(58,26,8,0.1)',
        transform: [{ scaleX: float.interpolate({ inputRange: [0, 1], outputRange: [1, .82] }) }] }} />
    </View>
  );
}

export function EmptyState({ icon = 'note', title, message, actionLabel, onAction, compact = false, style }) {
  return (
    <View accessibilityRole="summary" style={[{ alignItems: 'center', paddingVertical: compact ? 18 : 34, paddingHorizontal: 20 }, style]}>
      <EmptyIcon name={icon} />
      {title ? <Text style={{ fontSize: 15, color: COLORS.ink, fontFamily: FONTS.bold, textAlign: 'center' }}>{title}</Text> : null}
      {message ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium, marginTop: 5, textAlign: 'center', maxWidth: 420 }}>{message}</Text> : null}
      {actionLabel && onAction ? <TouchableOpacity accessibilityRole="button" onPress={onAction}
        style={{ marginTop: 16, minHeight: 44, paddingHorizontal: 20, borderRadius: 14, backgroundColor: COLORS.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <CvcIcon name="plus" size={18} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={{ color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 14, marginLeft: 6 }}>{actionLabel}</Text>
      </TouchableOpacity> : null}
    </View>
  );
}
