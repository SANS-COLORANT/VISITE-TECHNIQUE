/**
 * Barre de navigation METRA : un seul indicateur partagé (la « bulle »).
 * Le mouvement du doigt fait glisser l'indicateur entre Accueil / Clients /
 * Réglages avec un parcours court ; le bouton + et Missions restent séparés.
 *
 * Effet « boule d'eau », une seule forme, tout en transform/opacity piloté par
 * le driver natif (aucun état React par image, rien ne tourne au repos) :
 * - au repos, la goutte est posée à plat sous l'onglet (forme ovale) ;
 * - dès qu'elle glisse, elle se ramasse en boule, se soulève (ombre plus
 *   petite) et roule jusqu'à l'onglet suivant ;
 * - à l'arrivée, elle s'étale de nouveau, tremble comme de l'eau (ressort peu
 *   amorti) et une onde part autour d'elle ;
 * - si un rebond dépasse un bord, la boule s'écrase contre lui ;
 * - en permanence, la goutte ondule comme du liquide : trois oscillations
 *   lentes de périodes différentes (aplatissement, second aplatissement, balancement)
 *   ne se répètent jamais à l'identique, et l'ondulation s'amplifie pendant le
 *   trajet. Ces boucles tournent sur le thread natif (pas de JS par image) et
 *   sont coupées si l'utilisateur a demandé de réduire les animations.
 * Rendu « sphère d'eau magique » (comme dans les animés) : la silhouette est
 * l'union de trois formes aux coins inégaux qui tournent à des vitesses
 * différentes, ce qui fait onduler le contour en continu ; un courant tourne à
 * l'intérieur, des bulles remontent, des reflets durs sont posés par-dessus
 * l'icône, et l'icône dessous est grossie comme par une loupe.
 * Sur un appui, la boule rebondit jusqu'à l'onglet au lieu de se téléporter ;
 * toucher l'onglet actif la fait trembler ; le + tourne d'un quart de tour.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { CvcIcon } from './MetraCvcIcons.js';
import { hapticTick } from './fieldFeedback.js';
import { COLORS, FONTS } from './styles.js';
import { ROOT_TAB_KEYS } from './rootTabSwipe.js';

// Water sphere colours: the app's own orange pair (the accent props, which
// default to COLORS.orange / COLORS.orangeDark); text seen through it is white.
const WATER_INK = '#FFFFFF';
// Blob layers: asymmetric corners (fractions of the size), spin period (ms,
// negative = counter-clockwise) and a small offset. Their union is the outline.
const BLOBS = Object.freeze([
  { tl: .5, tr: .36, br: .48, bl: .4, ms: 4300, dx: .02, dy: -.02 },
  { tl: .38, tr: .5, br: .4, bl: .47, ms: -5900, dx: -.025, dy: .015 },
  { tl: .46, tr: .42, br: .34, bl: .5, ms: 7100, dx: .01, dy: .025 },
]);
// Small air bubbles rising inside: x position (fraction of width), size, period.
const AIR = Object.freeze([
  { x: -.2, size: 3.5, ms: 1900 }, { x: .24, size: 3, ms: 2700 },
]);
const SWIRL_MS = 2600;
// Delay before a tapped ball "lands" (the spring has mostly arrived by then).
const TAP_LANDING_MS = 260;
// Liquid wobble: one full sine period per loop. Periods are deliberately
// unrelated so the combined shape never visibly repeats.
const WOBBLE_MS = Object.freeze([1900, 2700, 3500, 900]); // last one: quick little jiggle
const SINE_IN = [0, .125, .25, .375, .5, .625, .75, .875, 1];
const SINE_OUT = [0, .707, 1, .707, 0, -.707, -1, -.707, 0];
const sine = (value, amp) => value.interpolate({ inputRange: SINE_IN, outputRange: SINE_OUT.map((v) => v * amp) });

function BottomTabBar({ tabs, activeKey, swipeProgress, accent = COLORS.orange, accentDark = COLORS.orangeDark, dense = false }) {
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [contentWidths, setContentWidths] = useState({});
  const measureContent=(key,w)=>{
    const next=Math.ceil(w);
    setContentWidths(prev=>prev[key]===next?prev:{...prev,[key]:next});
  };
  const orderIndex=Math.max(0,ROOT_TAB_KEYS.indexOf(activeKey));
  const idleProgress=useRef(new Animated.Value(orderIndex)).current;
  const rawProgress=swipeProgress||idleProgress;
  // Tap travel: the route change sets the shared progress straight to the new
  // tab; this offset starts at (old - new) and springs back to 0 so the ball
  // rolls across instead of jumping. Swipes never set tapFrom.
  const tapOffset=useRef(new Animated.Value(0)).current;
  const tapFrom=useRef(null);
  const splash=useRef(new Animated.Value(0)).current; // landing wobble, oscillates around 0
  const ripple=useRef(new Animated.Value(1)).current; // landing wave, 0 -> 1
  const plusTurn=useRef(new Animated.Value(0)).current;
  const prevKey=useRef(activeKey);
  const wobble=useRef(WOBBLE_MS.map(()=>new Animated.Value(0))).current;
  const spins=useRef(BLOBS.map(()=>new Animated.Value(0))).current;
  const air=useRef(AIR.map(()=>new Animated.Value(0))).current;
  const swirl=useRef(new Animated.Value(0)).current;
  // Started once the ball is on screen, so the loops drive views that exist.
  const ballVisible=measuredWidth>0&&ROOT_TAB_KEYS.includes(activeKey)&&tabs.some(tab=>tab.key===activeKey);
  const [appActive,setAppActive]=useState(AppState.currentState!=='background');
  useEffect(()=>{
    const sub=AppState.addEventListener?.('change',state=>setAppActive(state==='active'));
    return ()=>sub?.remove?.();
  },[]);
  useEffect(()=>{
    if(!ballVisible||!appActive)return undefined;
    let loops=[];
    let cancelled=false;
    const start=(reduce)=>{
      if(cancelled||reduce)return;
      const loop=(v,ms)=>Animated.loop(Animated.timing(v,{toValue:1,duration:Math.abs(ms),easing:Easing.linear,useNativeDriver:true}));
      loops=[
        ...wobble.map((v,i)=>loop(v,WOBBLE_MS[i])),
        ...spins.map((v,i)=>loop(v,BLOBS[i].ms)),
        ...air.map((v,i)=>loop(v,AIR[i].ms)),
        loop(swirl,SWIRL_MS),
      ];
      loops.forEach(l=>l.start());
    };
    AccessibilityInfo.isReduceMotionEnabled?.().then(start,()=>start(false)) ?? start(false);
    return ()=>{cancelled=true;loops.forEach(l=>l.stop());};
  },[wobble,spins,air,swirl,ballVisible,appActive]);
  const progress=useRef(Animated.add(rawProgress,tapOffset)).current;
  const land=(delay=0)=>{
    splash.stopAnimation(); ripple.stopAnimation();
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(splash,{toValue:1,duration:70,useNativeDriver:true}),
          Animated.spring(splash,{toValue:0,friction:2.6,tension:140,useNativeDriver:true}),
        ]),
        Animated.sequence([
          Animated.timing(ripple,{toValue:0,duration:0,useNativeDriver:true}),
          Animated.timing(ripple,{toValue:1,duration:560,useNativeDriver:true}),
        ]),
      ]),
    ]).start();
  };
  useLayoutEffect(()=>{
    const from=tapFrom.current;
    tapFrom.current=null;
    const changed=prevKey.current!==activeKey;
    prevKey.current=activeKey;
    if(!changed||!ROOT_TAB_KEYS.includes(activeKey))return;
    if(from!==null&&from!==orderIndex){
      tapOffset.stopAnimation();
      tapOffset.setValue(from-orderIndex);
      Animated.spring(tapOffset,{toValue:0,friction:7,tension:50,useNativeDriver:true}).start();
      land(TAP_LANDING_MS);
    }else land(0); // a swipe has already arrived when the route changes
  },[orderIndex,activeKey,tapOffset]);
  const turnPlus=()=>{
    plusTurn.stopAnimation();
    plusTurn.setValue(0);
    Animated.spring(plusTurn,{toValue:1,friction:5,tension:90,useNativeDriver:true}).start();
  };
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
  // The water sphere wraps the whole tab: icon and word side by side on wide
  // bars, icon above word on compact bars. Each tab's content is measured, and
  // the sphere width morphs from one tab's word to the next.
  const orbH=compact?bubbleHeight+gap+labelHeight+8:bubbleHeight;
  const orbTop=compact?pillTop-4:pillTop;
  const orbPad=compact?16:24;
  const fitWidth=key=>{
    const w=contentWidths[key];
    const raw=w?w+orbPad:bubbleWidth;
    return Math.max(orbH*.95,Math.min(raw,slotWidth-2));
  };
  const tabWidths=ROOT_TAB_KEYS.map(fitWidth);
  const orbW=Math.max(...tabWidths);
  // Every animated node is built once per geometry instead of on each render,
  // so re-renders (navigation, measurements) reuse the same native graph.
  const geometryKey=[orbW,orbH,orbTop,slotWidth,horizontalPadding,tabs.map(t=>t.key).join(','),tabWidths.join(',')].join('|');
  const fx=useMemo(()=>{
    // Absolute page index, not a relative delta whose base changes on navigation.
    const bubbleTranslate=progress.interpolate({inputRange:[0,1,2],outputRange:ROOT_TAB_KEYS.map(key=>centerFor(tabs.findIndex(tab=>tab.key===key))-orbW/2),extrapolate:'clamp'});
    // 0 when resting on a tab, 1 halfway between two tabs.
    const travel=progress.interpolate({inputRange:[0,.5,1,1.5,2],outputRange:[0,1,0,1,0],extrapolate:'clamp'});
    // Flat drop at rest -> round ball while rolling (width shrinks to about the
    // height, slightly longer than tall) -> squashed against an edge on overshoot.
    const ball=Math.min(1,(Math.min(orbH,44)*1.12)/orbW);
    const fit=tabWidths.map(w=>w/orbW);
    const shapeIn=[-.35,0,.14,.5,.86,1,1.14,1.5,1.86,2,2.35];
    const stretchX=progress.interpolate({inputRange:shapeIn,outputRange:[.8*fit[0],fit[0],ball*1.12,ball*1.05,ball*1.12,fit[1],ball*1.12,ball*1.05,ball*1.12,fit[2],.8*fit[2]],extrapolate:'clamp'});
    const stretchY=progress.interpolate({inputRange:shapeIn,outputRange:[1.18,1,1.1,1.04,1.1,1,1.1,1.04,1.1,1,1.18],extrapolate:'clamp'});
    const lift=travel.interpolate({inputRange:[0,.25,1],outputRange:[0,-3,-4]});
    const splashX=splash.interpolate({inputRange:[-1,0,1],outputRange:[.9,1,1.14]});
    const splashY=splash.interpolate({inputRange:[-1,0,1],outputRange:[1.1,1,.86]});
    const rippleOpacity=ripple.interpolate({inputRange:[0,.12,1],outputRange:[0,.45,0]});
    const rippleScaleX=ripple.interpolate({inputRange:[0,1],outputRange:[1,1.35]});
    const rippleScaleY=ripple.interpolate({inputRange:[0,1],outputRange:[1,1.7]});
    const glowOpacity=travel.interpolate({inputRange:[0,1],outputRange:[.08,.16]});
    const shadowScale=travel.interpolate({inputRange:[0,.25,1],outputRange:[1,ball*.9,ball*.75]});
    const shadowOpacity=travel.interpolate({inputRange:[0,1],outputRange:[.16,.08]});
    const plusRotate=plusTurn.interpolate({inputRange:[0,1],outputRange:['0deg','90deg']});
    const plusScale=plusTurn.interpolate({inputRange:[0,.4,1],outputRange:[1,.88,1]});
    const outerStyle={ position: 'absolute', width: orbW, height: orbH, top: orbTop, left: 0, transform: [{ translateX: bubbleTranslate }] };
    // Wobble gets livelier while the ball is rolling.
    const wobbleAmp=travel.interpolate({inputRange:[0,1],outputRange:[1,1.9]});
    const wobbleX=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[0],.06)));
    const wobbleY=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[0],-.06)));
    // Second, slower squash on its own period (skew is avoided: not every
    // native animated build supports it).
    const wobbleX2=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[1],-.045)));
    const wobbleY2=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[1],.05)));
    const wobbleTilt=sine(wobble[2],1).interpolate({inputRange:[-1,1],outputRange:['-3.5deg','3.5deg']});
    const wobbleBob=sine(wobble[2],1.6);
    const glossDrift=sine(wobble[1],2.5);
    // Constant little jiggle on top of the slow waves, so it is never still.
    const jiggleX=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[3],.028)));
    const jiggleY=Animated.add(1,Animated.multiply(wobbleAmp,sine(wobble[3],-.032)));
    const jiggleShift=sine(wobble[3],.8);
    const bodyTransform=[{ translateY: lift }, { translateY: wobbleBob }, { rotate: wobbleTilt }, { scaleX: stretchX }, { scaleY: stretchY }, { scaleX: splashX }, { scaleY: splashY }, { scaleX: wobbleX }, { scaleY: wobbleY }, { scaleX: wobbleX2 }, { scaleY: wobbleY2 }, { translateX: jiggleShift }, { scaleX: jiggleX }, { scaleY: jiggleY }];
    const R=orbH/2;
    // Blob squares are S x S, stretched to the drop width when resting.
    const S=orbH*1.08;
    const blobStretch=orbW/S;
    const blobBox={ position: 'absolute', left: orbW / 2 - S / 2, top: orbH / 2 - S / 2, width: S, height: S, transform: [{ scaleX: blobStretch }] };
    const blobRot=BLOBS.map((b,i)=>spins[i].interpolate({ inputRange: [0, 1], outputRange: b.ms > 0 ? ['0deg', '360deg'] : ['360deg', '0deg'] }));
    const swirlRotate=swirl.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    const airOpacity=air.map(v=>v.interpolate({ inputRange: [0, .2, .8, 1], outputRange: [0, .9, .9, 0] }));
    const airY=air.map(v=>v.interpolate({ inputRange: [0, 1], outputRange: [orbH * .32, -orbH * .34] }));
    const glossBack=Animated.multiply(glossDrift,-0.6);
    // Per root tab: word fades/magnifies under the sphere, icon tilts on arrival.
    const tabFx=ROOT_TAB_KEYS.map((_k,index)=>{
      const whiteOpacity=progress.interpolate({inputRange:[index-1,index-.25,index,index+.25,index+1],outputRange:[0,0,1,0,0],extrapolate:'clamp'});
      return {
        whiteOpacity,
        greyOpacity:whiteOpacity.interpolate({inputRange:[0,1],outputRange:[1,0]}),
        lensScale:whiteOpacity.interpolate({inputRange:[0,1],outputRange:[1,1.1]}),
        iconScale:progress.interpolate({inputRange:[index-1,index-.3,index,index+.3,index+1],outputRange:[1,1,1.12,1,1],extrapolate:'clamp'}),
        iconRotate:progress.interpolate({inputRange:[index-1,index-.35,index,index+.35,index+1],outputRange:['0deg','-14deg','0deg','14deg','0deg'],extrapolate:'clamp'}),
      };
    });
    return { outerStyle, bodyTransform, stretchX, shadowOpacity, shadowScale, glowOpacity, rippleOpacity, rippleScaleX, rippleScaleY, plusRotate, plusScale, glossDrift, glossBack, R, S, blobBox, blobRot, swirlRotate, airOpacity, airY, tabFx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[geometryKey,progress]);
  const { outerStyle, bodyTransform, stretchX, shadowOpacity, shadowScale, glowOpacity, rippleOpacity, rippleScaleX, rippleScaleY, plusRotate, plusScale, glossDrift, glossBack, R, S, blobBox, blobRot, swirlRotate, airOpacity, airY, tabFx } = fx;
  const blobLayer=(b,i,style)=><Animated.View key={i} style={[{ position: 'absolute', left: b.dx * S, top: b.dy * S, width: S, height: S,
    borderTopLeftRadius: b.tl * S, borderTopRightRadius: b.tr * S, borderBottomRightRadius: b.br * S, borderBottomLeftRadius: b.bl * S,
    transform: [{ rotate: blobRot[i] }] }, style]} />;
  return <View style={[styles.bar, dense && { paddingTop: 3, paddingBottom: 5, paddingHorizontal: 8 }]} onLayout={(e) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setMeasuredWidth((prev) => prev === next ? prev : next);
  }}>
    {measuredWidth > 0 && activeIndex >= 0 ? <Animated.View
      pointerEvents="none"
      style={[outerStyle, { zIndex: 0 }]}
    >
      <Animated.View style={{ position: 'absolute', left: '10%', right: '10%', bottom: -6, height: 8, borderRadius: 8, backgroundColor: '#3A1A08', opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }} />
      <Animated.View style={{ position: 'absolute', left: -7, right: -7, top: -6, bottom: -6, borderRadius: R + 7, backgroundColor: accent, opacity: glowOpacity, transform: [{ scaleX: stretchX }] }} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: R, borderWidth: 1.5, borderColor: accent, opacity: rippleOpacity, transform: [{ scaleX: rippleScaleX }, { scaleY: rippleScaleY }] }} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, transform: bodyTransform }}>
        {/* Opaque blobs: their union reads as one body of water without an
            off-screen compositing pass on every frame. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <View style={blobBox}>
            {BLOBS.map((b, i) => blobLayer(b, i, { backgroundColor: i === 1 ? accentDark : accent }))}
          </View>
        </View>
      </Animated.View>
    </Animated.View> : null}
    {tabs.map((tab) => {
      const active = tab.key === activeKey;
      if (tab.center) return <View key={tab.key} style={[styles.slot,{height:slotHeight,gap}]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={tab.label} onPress={()=>{turnPlus();hapticTick();tab.onPress?.();}} activeOpacity={0.85} style={[styles.centerShadow, { shadowColor: accent }, dense && { marginTop: -10, borderRadius: 14 }]}>
          <LinearGradient colors={[accent, accentDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.centerButton, dense && { width: 44, height: 44, borderRadius: 14 }]}>
            <Animated.View style={{ transform: [{ rotate: plusRotate }, { scale: plusScale }] }}>
              <CvcIcon name={tab.icon} size={dense ? 24 : 30} color={COLORS.white} strokeWidth={2.6} />
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>
      </View>;
      const root=ROOT_TAB_KEYS.includes(tab.key);
      const index=ROOT_TAB_KEYS.indexOf(tab.key);
      const { whiteOpacity=null, greyOpacity=null, lensScale=null, iconScale=null, iconRotate=null }=root?tabFx[index]:{};
      return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{selected:active}} accessibilityLabel={tab.label}
        onPress={()=>{if(root&&active){land(0);hapticTick();}else{if(root)tapFrom.current=orderIndex;hapticTick();}tab.onPress?.();}} activeOpacity={0.8} style={[styles.slot,{height:slotHeight,gap}]}>
        {root?<><Animated.View style={{height:bubbleHeight,width:bubbleWidth,alignItems:'center',justifyContent:'center',transform:[
          {scale:iconScale},
          {rotate:iconRotate},
        ]}}>
          <Animated.View onLayout={compact?undefined:(e)=>measureContent(tab.key,e.nativeEvent.layout.width)} style={{flexDirection:'row',alignItems:'center',gap:5,opacity:greyOpacity}}>
            <CvcIcon name={tab.icon} size={compact?20:18} color={COLORS.inkSoft} strokeWidth={2.1}/>
            {!compact?<Text numberOfLines={1} style={styles.wideLabel}>{tab.label}</Text>:null}
          </Animated.View>
          {/* Seen through the drop: darker and magnified, like a lens. */}
          <Animated.View pointerEvents="none" style={{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',opacity:whiteOpacity,transform:[{scale:lensScale}]}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
              <CvcIcon name={tab.icon} size={compact?20:18} color={WATER_INK} strokeWidth={2.3}/>
              {!compact?<Text numberOfLines={1} style={[styles.wideLabel,{color:WATER_INK}]}>{tab.label}</Text>:null}
            </View>
          </Animated.View>
        </Animated.View>{compact?<View onLayout={(e)=>measureContent(tab.key,Math.max(e.nativeEvent.layout.width,22))}>
          <Animated.Text numberOfLines={1} style={[styles.label,{height:labelHeight,opacity:greyOpacity}]}>{tab.label}</Animated.Text>
          {/* Same word seen through the water: white, fades in as the sphere arrives. */}
          <Animated.Text numberOfLines={1} style={[styles.label,{position:'absolute',left:0,right:0,textAlign:'center',height:labelHeight,color:WATER_INK,fontFamily:FONTS.bodyBold,opacity:whiteOpacity}]}>{tab.label}</Animated.Text>
        </View>:null}</>:<>
          {active?<LinearGradient colors={[accent,accentDark]} style={styles.activeIconPill}><CvcIcon name={tab.icon} size={18} color={COLORS.white}/></LinearGradient>:<CvcIcon name={tab.icon} size={21} color={COLORS.inkSoft}/>}
          <Text numberOfLines={1} style={styles.label}>{tab.label}</Text>
        </>}
      </TouchableOpacity>;
    })}
    {measuredWidth > 0 && activeIndex >= 0 ? <Animated.View pointerEvents="none" style={[outerStyle, { zIndex: 2 }]}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, transform: bodyTransform }}>
        <View style={blobBox}>
          {BLOBS.map((b, i) => blobLayer(b, i, { borderWidth: 1.2, borderColor: i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)' }))}
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: S, height: S, opacity: 0.6, transform: [{ rotate: swirlRotate }] }}>
            <Svg width={S} height={S}>
              <Path d={`M ${S * .22} ${S * .58} Q ${S * .5} ${S * .9} ${S * .8} ${S * .52}`} stroke="#FFFFFF" strokeWidth={1.4} fill="none" strokeLinecap="round" />
              <Path d={`M ${S * .36} ${S * .3} Q ${S * .56} ${S * .2} ${S * .7} ${S * .34}`} stroke="#FFF1E6" strokeWidth={1} fill="none" strokeLinecap="round" />
            </Svg>
          </Animated.View>
        </View>
        {AIR.map((a, i) => <Animated.View key={'air' + i} style={{
          position: 'absolute', left: orbW / 2 + a.x * orbW - a.size / 2, top: orbH / 2 - a.size / 2,
          width: a.size, height: a.size, borderRadius: a.size, borderWidth: 0.8, borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.35)',
          opacity: airOpacity[i],
          transform: [{ translateY: airY[i] }],
        }} />)}
        <Animated.View style={[styles.bubbleGloss, { borderRadius: R, transform: [{ translateX: glossDrift }] }]} />
        <Animated.View style={[styles.dropSpecular, { transform: [{ translateX: glossBack }] }]} />
        <View style={styles.dropCaustic} />
      </Animated.View>
    </Animated.View> : null}
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
  bubbleClip: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  bubbleGradient: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  bubbleGloss: { position: 'absolute', left: '16%', width: '36%', top: 3, height: '22%', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.75)' },
  glassRim: { position: 'absolute', left: 1, right: 1, top: 1, bottom: 1, borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.85)' },
  dropShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  dropSpecular: { position: 'absolute', right: '14%', top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  dropCaustic: { position: 'absolute', left: '28%', right: '28%', bottom: 2.5, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  centerShadow: { marginTop: -26, borderRadius: 19, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
  centerButton: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  activeIconPill: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
export { BottomTabBar };
