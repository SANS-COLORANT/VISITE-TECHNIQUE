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
  const orderIndex=Math.max(0,ROOT_TAB_KEYS.indexOf(activeKey));
  const idleProgress=useRef(new Animated.Value(orderIndex)).current;
  const progress=swipeProgress||idleProgress;
  const compact=width/Math.max(1,tabs.length)<112 || dense;
  const horizontalPadding=dense?8:10;
  const slotWidth=Math.max(1,(measuredWidth-horizontalPadding*2)/Math.max(1,tabs.length));
  const activeIndex=tabs.findIndex(tab=>tab.key===activeKey&&ROOT_TAB_KEYS.includes(tab.key));
  const centerFor=idx=>horizontalPadding+(idx+.5)*slotWidth;
  const bubbleWidth=Math.min(Math.max(1,slotWidth-6),dense?44:compact?48:118);
  const bubbleHeight=dense?28:compact?32:40;
  const slotHeight=dense?48:56;
  const labelHeight=compact?14:0;
  const gap=compact?3:0;
  const pillTop=(dense?3:8)+(slotHeight-bubbleHeight-labelHeight-gap)/2;
  // Absolute page index, not a relative delta whose base changes on navigation.
  const bubbleTranslate=progress.interpolate({inputRange:[0,1,2],outputRange:ROOT_TAB_KEYS.map(key=>centerFor(tabs.findIndex(tab=>tab.key===key))-bubbleWidth/2),extrapolate:'clamp'});
  return <View style={[styles.bar, dense && { paddingTop: 3, paddingBottom: 5, paddingHorizontal: 8 }]} onLayout={(e) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setMeasuredWidth((prev) => prev === next ? prev : next);
  }}>
    {measuredWidth > 0 && activeIndex >= 0 ? <Animated.View
      pointerEvents="none"
      style={[styles.movingBubble, {
        width: bubbleWidth, height: bubbleHeight,
        top: pillTop, left: 0,
        transform: [{ translateX: bubbleTranslate }],
        shadowColor: accent,
      }]}
    >
      <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.bubbleGradient} />
    </Animated.View> : null}
    {tabs.map((tab) => {
      const active = tab.key === activeKey;
      if (tab.center) return <View key={tab.key} style={[styles.slot,{height:slotHeight,gap}]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={tab.label} onPress={tab.onPress} activeOpacity={0.85} style={[styles.centerShadow, { shadowColor: accent }, dense && { marginTop: -10, borderRadius: 14 }]}>
          <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.centerButton, dense && { width: 44, height: 44, borderRadius: 14 }]}>
            <CvcIcon name={tab.icon} size={dense ? 24 : 30} color={COLORS.white} strokeWidth={2.6} />
          </LinearGradient>
        </TouchableOpacity>
      </View>;
      const root=ROOT_TAB_KEYS.includes(tab.key);
      const index=ROOT_TAB_KEYS.indexOf(tab.key);
      const whiteOpacity=root?progress.interpolate({inputRange:[index-1,index-.25,index,index+.25,index+1],outputRange:[0,0,1,0,0],extrapolate:'clamp'}):null;
      return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{selected:active}} accessibilityLabel={tab.label}
        onPress={tab.onPress} activeOpacity={0.8} style={[styles.slot,{height:slotHeight,gap}]}>
        {root?<><View style={{height:bubbleHeight,width:bubbleWidth,alignItems:'center',justifyContent:'center'}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
            <CvcIcon name={tab.icon} size={compact?20:18} color={COLORS.inkSoft} strokeWidth={2.1}/>
            {!compact?<Text numberOfLines={1} style={styles.wideLabel}>{tab.label}</Text>:null}
          </View>
          <Animated.View pointerEvents="none" style={{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',opacity:whiteOpacity}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
              <CvcIcon name={tab.icon} size={compact?20:18} color={COLORS.white} strokeWidth={2.1}/>
              {!compact?<Text numberOfLines={1} style={[styles.wideLabel,{color:COLORS.white}]}>{tab.label}</Text>:null}
            </View>
          </Animated.View>
        </View>{compact?<Text numberOfLines={1} style={[styles.label,{height:labelHeight},active&&{color:accentDark,fontFamily:FONTS.bodyBold}]}>{tab.label}</Text>:null}</>:<>
          {active?<LinearGradient colors={[accent,accentDark]} style={styles.activeIconPill}><CvcIcon name={tab.icon} size={18} color={COLORS.white}/></LinearGradient>:<CvcIcon name={tab.icon} size={21} color={COLORS.inkSoft}/>}
          <Text numberOfLines={1} style={styles.label}>{tab.label}</Text>
        </>}
      </TouchableOpacity>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    backgroundColor: '#FDFCFA', borderTopWidth: 1, borderTopColor: 'rgba(22,21,15,0.08)',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -6 }, elevation: 10 },
  slot: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, zIndex: 1 },
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
