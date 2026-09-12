import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { SpiralSvg } from './SpiralArt.js';

const MAX_ANGLE = 42;
const TRIGGER_ANGLE = 18;
const DOCK_SIZE = 176;
const TOUCH_WIDTH = 206;
const TOUCH_HEIGHT = 100;
const PANEL_WIDTH = 348;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function ActionButton({ action, onDone }) {
  if (!action) return null;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={action.label} activeOpacity={0.82} style={styles.actionButton} onPress={()=>{onDone();requestAnimationFrame(()=>action.onPress?.());}}>
    <View style={[styles.actionIconWrap,action.tone==='action'?styles.actionIconWrapHot:null]}><Text style={styles.actionIcon}>{action.icon||'•'}</Text></View>
    <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>{action.caption?<Text style={styles.actionCaption} numberOfLines={1}>{action.caption}</Text>:null}
  </TouchableOpacity>;
}

export function SpiralActiveDock({ exploreActions = [], actionActions = [], quickActions = [], disabled = false }) {
  const rotation=useRef(new Animated.Value(0)).current;
  const panelProgress=useRef(new Animated.Value(0)).current;
  const [mode,setMode]=useState('closed');
  const gestureStartMode=useRef('closed');

  useEffect(()=>{Animated.timing(panelProgress,{toValue:mode==='closed'?0:1,duration:mode==='closed'?130:190,useNativeDriver:true}).start();},[mode,panelProgress]);
  const settleRotation=(target)=>Animated.spring(rotation,{toValue:target,speed:18,bounciness:7,useNativeDriver:true}).start();
  const close=()=>{setMode('closed');settleRotation(0);};
  const selectMode=(nextMode)=>{Vibration.vibrate(12);setMode(nextMode);settleRotation(nextMode==='explore'?-22:nextMode==='actions'?22:0);};

  const panResponder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>!disabled,
    onMoveShouldSetPanResponder:(_,gesture)=>!disabled&&(Math.abs(gesture.dx)>4||Math.abs(gesture.dy)>4),
    onPanResponderGrant:()=>{gestureStartMode.current=mode;rotation.stopAnimation();},
    onPanResponderMove:(_,gesture)=>rotation.setValue(clamp(gesture.dx*0.31,-MAX_ANGLE,MAX_ANGLE)),
    onPanResponderRelease:(_,gesture)=>{
      const angle=clamp(gesture.dx*0.31,-MAX_ANGLE,MAX_ANGLE);
      const isTap=Math.abs(gesture.dx)<8&&Math.abs(gesture.dy)<8;
      if(isTap){if(gestureStartMode.current==='quick')close();else selectMode('quick');return;}
      if(angle<=-TRIGGER_ANGLE)selectMode('explore');else if(angle>=TRIGGER_ANGLE)selectMode('actions');else close();
    },
    onPanResponderTerminate:close,
  }),[disabled,mode]);

  const rotate=rotation.interpolate({inputRange:[-MAX_ANGLE,MAX_ANGLE],outputRange:[`-${MAX_ANGLE}deg`,`${MAX_ANGLE}deg`],extrapolate:'clamp'});
  const panelTranslate=panelProgress.interpolate({inputRange:[0,1],outputRange:[16,0]});
  const visibleActions=mode==='explore'?exploreActions:mode==='actions'?actionActions:quickActions.length?quickActions:[...exploreActions.slice(0,2),...actionActions.slice(0,2)];

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {mode!=='closed'?<TouchableOpacity accessibilityLabel="Fermer le menu de la spirale" activeOpacity={1} style={styles.dismissLayer} onPress={close}/>:null}
    <Animated.View pointerEvents={mode==='closed'?'none':'auto'} style={[styles.panel,{opacity:panelProgress,transform:[{translateY:panelTranslate}]}]}>
      <View style={styles.panelHeader}><View><Text style={styles.panelEyebrow}>SPIRALE ACTIVE</Text><Text style={styles.panelTitle}>{mode==='explore'?'Explorer':mode==='actions'?'Agir':'Accès rapide'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={close} style={styles.closeButton}><Text style={styles.closeButtonText}>×</Text></TouchableOpacity></View>
      <View style={styles.actionsRow}>{visibleActions.slice(0,4).map((action,index)=><ActionButton key={`${action?.label||'action'}-${index}`} action={action} onDone={close}/>)}</View>
    </Animated.View>
    <View pointerEvents="none" style={styles.directionHints}><Text style={[styles.directionText,styles.directionLeft]}>‹ EXPLORER</Text><Text style={[styles.directionText,styles.directionRight]}>AGIR ›</Text></View>
    <View style={styles.touchZone} {...panResponder.panHandlers}>
      <View pointerEvents="none" style={styles.dockHalo}/>
      <Animated.View pointerEvents="none" style={[styles.spiralWrap,{transform:[{rotate}]}]}><SpiralSvg size={DOCK_SIZE} strokeWidth={9.2} showCenter={false}/></Animated.View>
    </View>
  </View>;
}

const styles=StyleSheet.create({
  dismissLayer:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(20,32,44,0.06)',zIndex:305},
  panel:{position:'absolute',left:'50%',bottom:108,marginLeft:-(PANEL_WIDTH/2),width:PANEL_WIDTH,maxWidth:'90%',minHeight:148,padding:14,borderRadius:18,borderWidth:1,borderColor:'#D9DEE1',backgroundColor:'#FFFDF8',shadowColor:'#14202C',shadowOpacity:0.16,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:14,zIndex:330},
  panelHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},panelEyebrow:{color:'#F26426',fontSize:9,lineHeight:12,fontWeight:'900',letterSpacing:1.6},panelTitle:{marginTop:1,color:'#14202C',fontSize:17,lineHeight:21,fontWeight:'900'},closeButton:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:'#E0E4E6',alignItems:'center',justifyContent:'center',backgroundColor:'#F3F4F0'},closeButtonText:{color:'#14202C',fontSize:21,lineHeight:23,fontWeight:'500'},
  actionsRow:{flexDirection:'row',gap:8},actionButton:{flex:1,minWidth:0,minHeight:82,paddingHorizontal:4,paddingVertical:8,borderRadius:12,borderWidth:1,borderColor:'#E2E5E3',backgroundColor:'#F7F6F1',alignItems:'center',justifyContent:'center'},actionIconWrap:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#DCEFED',marginBottom:5},actionIconWrapHot:{backgroundColor:'#FFF0E7'},actionIcon:{color:'#14202C',fontSize:17,fontWeight:'900'},actionLabel:{color:'#14202C',fontSize:10.5,lineHeight:13,fontWeight:'900',textAlign:'center'},actionCaption:{marginTop:2,color:'#76808A',fontSize:8.5,lineHeight:11,textAlign:'center'},
  directionHints:{position:'absolute',left:0,right:0,bottom:59,height:28,zIndex:312},directionText:{position:'absolute',color:'#7B848A',fontSize:8.5,fontWeight:'900',letterSpacing:0.9},directionLeft:{right:'59%'},directionRight:{left:'59%'},
  touchZone:{position:'absolute',left:'50%',marginLeft:-(TOUCH_WIDTH/2),bottom:0,width:TOUCH_WIDTH,height:TOUCH_HEIGHT,overflow:'hidden',alignItems:'center',zIndex:350},dockHalo:{position:'absolute',top:27,width:194,height:112,borderRadius:97,backgroundColor:'rgba(255,253,248,0.94)',borderWidth:1,borderColor:'rgba(242,100,38,0.16)'},spiralWrap:{position:'absolute',top:8,width:DOCK_SIZE,height:DOCK_SIZE},
});