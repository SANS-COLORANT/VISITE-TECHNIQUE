/**
 * Barre de navigation METRA : un seul indicateur orange partagé (la « bulle »).
 * Le mouvement du doigt fait glisser l'indicateur entre Accueil / Clients /
 * Réglages avec un parcours court ; le bouton + et Missions restent séparés.
 */
import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';
import { ROOT_TAB_KEYS } from './rootTabSwipe.js';

function BottomTabBar({ tabs, activeKey, swipeProgress, accent = COLORS.orange, accentDark = COLORS.orangeDark, dense = false }) {
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const idleProgress = useRef(new Animated.Value(0)).current;
  const progress = swipeProgress || idleProgress;
  const compact = width / Math.max(1, tabs.length) < 112;
  const slotWidth = Math.max(1, (measuredWidth - 20) / Math.max(1, tabs.length));
  const activeIndex = tabs.findIndex((tab) => tab.key === activeKey && ROOT_TAB_KEYS.includes(tab.key));
  const currentOrderIndex = ROOT_TAB_KEYS.indexOf(activeKey);
  const prevKey = ROOT_TAB_KEYS[currentOrderIndex - 1];
  const nextKey = ROOT_TAB_KEYS[currentOrderIndex + 1];
  const prevIndex = tabs.findIndex((tab) => tab.key === prevKey);
  const nextIndex = tabs.findIndex((tab) => tab.key === nextKey);
  const centerFor = (idx) => 10 + (idx + 0.5) * slotWidth;
  const bubbleWidth = dense ? 44 : (compact ? 48 : Math.min(118, Math.max(76, slotWidth - 12)));
  const baseCenter = centerFor(activeIndex);
  const bubbleLeft = baseCenter - bubbleWidth / 2;
  const deltaToPrevious = prevIndex >= 0 ? centerFor(prevIndex) - baseCenter : 0;
  const deltaToNext = nextIndex >= 0 ? centerFor(nextIndex) - baseCenter : 0;
  const bubbleTranslate = progress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [deltaToPrevious, 0, deltaToNext],
    extrapolate: 'clamp',
  });

  return <View style={[styles.bar, dense && { paddingTop: 3, paddingBottom: 5, paddingHorizontal: 8 }]} onLayout={(e) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setMeasuredWidth((prev) => prev === next ? prev : next);
  }}>
    {measuredWidth > 0 && activeIndex >= 0 ? <Animated.View
      pointerEvents="none"
      style={[styles.movingBubble, {
        width: bubbleWidth, height: dense ? 30 : (compact ? 32 : 40),
        top: dense ? 8 : (compact ? 10 : 14), left: bubbleLeft,
        transform: [{ translateX: bubbleTranslate }],
        shadowColor: accent,
      }]}
    >
      <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.bubbleGradient} />
    </Animated.View> : null}
    {tabs.map((tab) => {
      const active = tab.key === activeKey;
      if (tab.center) return <View key={tab.key} style={[styles.slot, dense && { minHeight: 46, gap: 2 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={tab.label} onPress={tab.onPress} activeOpacity={0.85} style={[styles.centerShadow, { shadowColor: accent }, dense && { marginTop: -10, borderRadius: 14 }]}>
          <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.centerButton, dense && { width: 44, height: 44, borderRadius: 14 }]}>
            <CvcIcon name={tab.icon} size={dense ? 24 : 30} color={COLORS.white} strokeWidth={2.6} />
          </LinearGradient>
        </TouchableOpacity>
      </View>;
      const root = ROOT_TAB_KEYS.includes(tab.key);
      const color = active && root ? COLORS.white : COLORS.inkSoft;
      return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label}
        onPress={tab.onPress} activeOpacity={0.8} style={[styles.slot, dense && { minHeight: 46, gap: 2 }]}>
        {root && !compact ? <View style={styles.wideContent}>
          <CvcIcon name={tab.icon} size={18} color={color} strokeWidth={2.1} />
          <Text numberOfLines={1} style={[styles.wideLabel, { color: active ? COLORS.white : COLORS.inkSoft }]}>{tab.label}</Text>
        </View> : <>
          {active && !root ? <LinearGradient colors={[accent, accentDark]} style={styles.activeIconPill}><CvcIcon name={tab.icon} size={18} color={COLORS.white} /></LinearGradient>
            : <CvcIcon name={tab.icon} size={root ? 20 : 21} color={color} strokeWidth={active ? 2.2 : 2} />}
          <Text numberOfLines={1} style={[styles.label, active && root && { color: accentDark, fontFamily: FONTS.bodyBold }]}>{tab.label}</Text>
        </>}
      </TouchableOpacity>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    backgroundColor: '#FDFCFA', borderTopWidth: 1, borderTopColor: 'rgba(22,21,15,0.08)',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -6 }, elevation: 10 },
  slot: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3, zIndex: 1 },
  label: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  wideContent: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40 },
  wideLabel: { fontSize: 12, fontFamily: FONTS.bodyBold },
  movingBubble: { position: 'absolute', borderRadius: 20, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 }, elevation: 0, zIndex: 0 },
  bubbleGradient: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  centerShadow: { marginTop: -26, borderRadius: 19, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  centerButton: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  activeIconPill: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
export { BottomTabBar };
