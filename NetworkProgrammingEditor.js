/**
 * Saisie additive de courbe multipoints et d'horaires par réseau.
 * Les anciens champs pente/T°/programme restent disponibles dans la carte.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { COLORS, FONTS } from './styles.js';
import { useDurableAutosave } from './durableAutosave.js';
import { getNetworkProgramming, saveNetworkProgrammingDraft } from './networkProgrammingDb.js';
import {
  WEEK_DAYS, parseNetworkPoints, parseWeeklySchedule,
  validateNetworkPoints, validateWeeklySchedule, pointsFromLegacy,
} from './networkProgramming.js';

function numeric(v) {
  const str=String(v ?? '').trim().replace(',','.');
  return /^[-+]?\d+(?:\.\d+)?$/.test(str) ? Number(str) : null;
}
function CurvePreview({ points }) {
  const valid=points.map(p=>({x:numeric(p.ext),y:numeric(p.dep)}))
    .filter(p=>p.x!==null && p.y!==null).sort((a,b)=>a.x-b.x);
  if(valid.length<2) return null;
  const minX=Math.min(...valid.map(p=>p.x)),maxX=Math.max(...valid.map(p=>p.x));
  const minY=Math.min(...valid.map(p=>p.y)),maxY=Math.max(...valid.map(p=>p.y));
  const px=x=>12+(x-minX)*276/Math.max(1,maxX-minX);
  const py=y=>84-(y-minY)*68/Math.max(1,maxY-minY);
  const coords=valid.map(p=>px(p.x)+','+py(p.y)).join(' ');
  return <View style={{ borderRadius: 10, backgroundColor: '#F8F8F6', padding: 7, marginTop: 8 }}>
    <Text style={{ fontSize: 10.5, color: COLORS.inkSoft }}>T° extérieure (horizontal) → T° départ (verticale)</Text>
    <Svg width="100%" height={96} viewBox="0 0 300 96">
      <Polyline points={coords} stroke={COLORS.orangeDark} fill="none" strokeWidth={2.5} />
      {valid.map((p,i)=><Circle key={i} cx={px(p.x)} cy={py(p.y)} r={3.4} fill={COLORS.orangeDark}/>)}
    </Svg>
  </View>;
}
const buttonStyle={ minHeight: 38, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center',
  borderRadius: 10, borderWidth: 1, borderColor: '#E3DED7' };
const inputStyle={ minHeight: 38, flex: 1, borderWidth: 1, borderColor: '#E3DED7', borderRadius: 9,
  paddingHorizontal: 7, fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.ink };
function Action({ label,onPress }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={buttonStyle}>
    <Text style={{ color: COLORS.orangeDark, fontFamily: FONTS.bodyBold, fontSize: 11.5 }}>{label}</Text>
  </TouchableOpacity>;
}
const blankPeriod=()=>({start:'06:00',end:'22:00',comfort:'20',reduced:'16'});

export function NetworkProgrammingEditor({ reseau, onSaved }) {
  const [loaded,setLoaded]=useState(false);
  const [curveOpen,setCurveOpen]=useState(false);
  const [weekOpen,setWeekOpen]=useState(false);
  const [error,setError]=useState(null);
  const [curveJson,setCurveJson,flushCurve,,adoptCurve]=useDurableAutosave('[]',async value=>{
    await saveNetworkProgrammingDraft(reseau.id,'points',value);
    onSaved?.();
  });
  const [weekJson,setWeekJson,flushWeek,,adoptWeek]=useDurableAutosave('{}',async value=>{
    await saveNetworkProgrammingDraft(reseau.id,'schedule',value);
    onSaved?.();
  });

  useEffect(()=>{
    let active=true;
    setLoaded(false);
    setError(null);
    Promise.resolve(getNetworkProgramming(reseau.id)).then(item=>{
      if(!active)return;
      const legacy=pointsFromLegacy(reseau.t_ext_c,reseau.t_dep_c);
      const points=item.hasPoints ? item.points : legacy;
      adoptCurve(JSON.stringify(points));
      adoptWeek(JSON.stringify(item.schedule));
      setCurveOpen(points.length>0);
      setWeekOpen(Boolean(item.hasSchedule));
      setLoaded(true);
    }).catch(err=>{if(active){setError(String(err?.message||err));setLoaded(true);}});
    return ()=>{active=false;};
  },[reseau.id]);

  const points=useMemo(()=>parseNetworkPoints(curveJson),[curveJson]);
  const week=useMemo(()=>parseWeeklySchedule(weekJson),[weekJson]);
  const updatePoints=(mutate)=>{
    const next=mutate(points.map(p=>({...p})));
    setCurveJson(JSON.stringify(next));
  };
  const updateWeek=(mutate)=>{
    const next=mutate({...week,days:Object.fromEntries(WEEK_DAYS.map(d=>[d,week.days[d].map(p=>({...p}))]))});
    setWeekJson(JSON.stringify(next));
  };
  const checkCurve=()=>{
    try {validateNetworkPoints(points);setError(null);flushCurve().catch(err=>Alert.alert('Courbe non enregistrée',String(err?.message||err))); }
    catch(err){setError(String(err?.message||err));Alert.alert('Courbe à compléter',String(err?.message||err));}
  };
  const checkWeek=()=>{
    try {validateWeeklySchedule(week);setError(null);flushWeek().catch(err=>Alert.alert('Programme non enregistré',String(err?.message||err)));}
    catch(err){setError(String(err?.message||err));Alert.alert('Programme à corriger',String(err?.message||err));}
  };
  if(!loaded)return <ActivityIndicator size="small" color={COLORS.orangeDark}/>;
  return <View style={{ gap: 9, marginTop: 12, borderTopWidth: 1, borderTopColor: '#E8E4DE', paddingTop: 10 }}>
    <Text style={{ fontFamily: FONTS.bold, fontSize: 12, color: COLORS.ink }}>Régulation avancée · par réseau</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Afficher ou masquer la courbe multipoints"
      style={{ paddingVertical: 9 }} onPress={()=>setCurveOpen(v=>!v)}>
      <Text style={{ color: COLORS.orangeDark, fontFamily: FONTS.bold, fontSize: 12 }}>
        {curveOpen?'▾':'▸'} Courbe multipoints ({points.length} point(s)) · pente classique conservée
      </Text>
    </TouchableOpacity>
    {curveOpen?<View style={{gap:8}}>
      <Text style={{fontSize:11.5,color:COLORS.inkSoft}}>
        Un couple extérieur/départ par point ; la courbe historique par pente reste utilisable.
      </Text>
      {points.map((point,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',gap:5}}>
        <Text style={{fontSize:11,color:COLORS.inkSoft,width:20}}>{i+1}.</Text>
        <TextInput accessibilityLabel={'Température extérieure point '+(i+1)} keyboardType="decimal-pad"
          placeholder="Ext. °C" value={point.ext} style={inputStyle}
          onChangeText={value=>updatePoints(rows=>{rows[i].ext=value;return rows;})}/>
        <TextInput accessibilityLabel={'Température départ point '+(i+1)} keyboardType="decimal-pad"
          placeholder="Départ °C" value={point.dep} style={inputStyle}
          onChangeText={value=>updatePoints(rows=>{rows[i].dep=value;return rows;})}/>
        <Action label="×" onPress={()=>updatePoints(rows=>rows.filter((_,j)=>j!==i))}/>
      </View>)}
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
        <Action label="+ Ajouter un point" onPress={()=>updatePoints(rows=>[...rows,{ext:'',dep:''}])}/>
        {points.length>0?<Action label="Vérifier la courbe" onPress={checkCurve}/>:null}
      </View>
      <CurvePreview points={points}/>
    </View>:null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Afficher ou masquer le programme hebdomadaire"
      style={{paddingVertical:9}} onPress={()=>setWeekOpen(v=>!v)}>
      <Text style={{color:COLORS.orangeDark,fontFamily:FONTS.bold,fontSize:12}}>
        {weekOpen?'▾':'▸'} Programme hebdomadaire (structuré, texte libre conservé)
      </Text>
    </TouchableOpacity>
    {weekOpen?<View style={{gap:8}}>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:week.allDays}}
        accessibilityLabel="Mêmes horaires tous les jours"
        onPress={()=>updateWeek(s=>({...s,allDays:!s.allDays}))} style={{minHeight:40,justifyContent:'center'}}>
        <Text style={{fontFamily:FONTS.bodySemi,color:COLORS.ink,fontSize:12}}>
          {week.allDays?'☑':'☐'} Mêmes horaires tous les jours
        </Text>
      </TouchableOpacity>
      {(week.allDays?[WEEK_DAYS[0]]:WEEK_DAYS).map(day=><View key={day} style={{gap:6,borderBottomWidth:1,borderColor:'#EDE9E4',paddingBottom:9}}>
        <Text style={{fontFamily:FONTS.bold,color:COLORS.ink,fontSize:12}}>
          {week.allDays?'Tous les jours':day}
        </Text>
        {week.days[day].map((period,i)=><View key={i} style={{gap:5}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
            <TextInput accessibilityLabel={'Début plage '+day} placeholder="Début HH:MM"
              value={period.start} style={inputStyle}
              onChangeText={value=>updateWeek(s=>{s.days[day][i].start=value;return s;})}/>
            <TextInput accessibilityLabel={'Fin plage '+day} placeholder="Fin HH:MM"
              value={period.end} style={inputStyle}
              onChangeText={value=>updateWeek(s=>{s.days[day][i].end=value;return s;})}/>
            <Action label="×" onPress={()=>updateWeek(s=>{s.days[day].splice(i,1);return s;})}/>
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:5}}>
            <TextInput accessibilityLabel={'Consigne confort '+day} keyboardType="decimal-pad"
              placeholder="Confort °C" value={period.comfort} style={inputStyle}
              onChangeText={value=>updateWeek(s=>{s.days[day][i].comfort=value;return s;})}/>
            <TextInput accessibilityLabel={'Consigne réduite '+day} keyboardType="decimal-pad"
              placeholder="Réduit °C" value={period.reduced} style={inputStyle}
              onChangeText={value=>updateWeek(s=>{s.days[day][i].reduced=value;return s;})}/>
          </View>
        </View>)}
        {week.days[day].length<12?<Action label="+ Ajouter une plage" onPress={()=>updateWeek(s=>{
          s.days[day].push(blankPeriod());return s;})}/>:null}
      </View>)}
      <Action label="Vérifier les horaires" onPress={checkWeek}/>
    </View>:null}
    {error?<Text style={{fontSize:11,color:'#B42318'}}>{error}</Text>:null}
  </View>;
}
