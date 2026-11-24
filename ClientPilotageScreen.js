import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, BackHandler, FlatList, Modal, PanResponder, Platform, requireNativeComponent, ScrollView, Text, TextInput, TouchableOpacity, UIManager, View, useWindowDimensions } from 'react-native';
import { COLORS, styles, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { buildMatrixCells, getClientTechnicalMatrix, getMatrixCellPhotos, normAvis } from './clientTechnicalMatrix.js';
import { getStatsSitesPatrimoine } from './patrimoineDb.js';
import { listerAppartenancesClient, listerGroupesClient } from './siteOrganizationDb.js';
import { reserveSeverityLabel } from './reserveSeverity.js';
import { exporterPilotageExcel, PILOTAGE_DEFAULT_COLUMNS, PILOTAGE_EXPORT_COLUMNS, PILOTAGE_EXPORT_PRESETS } from './clientTechnicalMatrixExport.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { prewarmSiteLocals } from './navigationPrewarm.js';
import { ButtonGlow } from './ButtonGlow.js';
import { SkeletonList } from './Skeleton.js';
import { buildPilotageCanvasModel } from './pilotageCanvasModel.js';
import { clampPilotageZoom, clampPilotageOffset, getPilotagePanGeometry, visiblePilotageColumns, rescalePilotageOffset, fitPilotageZoom, PILOTAGE_ZOOM_MIN, PILOTAGE_ZOOM_MAX } from './pilotageDensity.js';

const STATE = {
  green: { bg: '#E8F5E9', border: '#2E7D32', text: '#1B5E20', symbol: '✓' },
  orange: { bg: '#FFF3E0', border: '#EF8B2C', text: '#9A4E00', symbol: '!' },
  red: { bg: '#FDECEC', border: '#B42318', text: '#B42318', symbol: '!' },
  unknown: { bg: '#F2F4F7', border: '#667085', text: '#475467', symbol: '?' },
  neutral: { bg: '#F7F7F7', border: '#98A2B3', text: '#667085', symbol: '·' },
  none: { bg: '#FAFAFA', border: '#D0D5DD', text: '#98A2B3', symbol: '—' },
};

const DEFAULT_FILTERS = { trame: 'all', status: 'all', minSeverity: 0, category: 'all', search: '' };
const STATUS_OPTIONS = [
  { id: 'all', label: 'Tous' }, { id: 'N.S', label: 'N.S' }, { id: 'S', label: 'S' },
  { id: 'N.R', label: 'N.R' }, { id: 'S.O', label: 'S.O' }, { id: 'N.V', label: 'N.V' },
  { id: 'attention', label: 'Attention' },
];

function issueKey(issue) { return issue?.remarque_id || `${issue?.visit_id || issue?.id}||${issue?.section_code || ''}||${issue?.cle || ''}`; }
function normalize(value = '') { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

async function mapAvecConcurrence(items, limite, worker) {
  const resultats = new Array(items.length); let curseur = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limite), items.length) }, async () => {
    while (true) { const index = curseur++; if (index >= items.length) return; resultats[index] = await worker(items[index], index); }
  });
  await Promise.all(workers); return resultats;
}

function Cell({ cell, onPress, width = 98, zoom=1, label='' }) {
  const p = STATE[cell.state] || STATE.none;
  const count = cell.state === 'red' || cell.state === 'orange' ? (cell.ns || 0) : cell.state === 'unknown' ? ((cell.nr || 0)+(cell.nv || 0)) : cell.state === 'green' ? (cell.s || 0) : (cell.so || 0);
  const inset=Math.max(1,Math.round(3*zoom));
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label+' : '+cell.s+' satisfaisant(s), '+cell.ns+' non satisfaisant(s)'} disabled={!cell.total} onPress={onPress} style={{width:Math.max(1,width-2*inset),minHeight:Math.max(21,50*zoom),margin:inset,paddingVertical:Math.max(1,4*zoom),borderRadius:Math.max(3,10*zoom),borderWidth:Math.max(.75,1.5*zoom),borderColor:p.border,backgroundColor:p.bg,alignItems:'center',justifyContent:'center'}}>
    <Text numberOfLines={1} allowFontScaling={false} style={{fontSize:Math.max(9,16*zoom),fontFamily:FONTS.black,color:p.text}}>{p.symbol} {count||''}</Text>
    {zoom>=.65?<Text allowFontScaling={false} style={{fontSize:Math.max(6.5,8.5*zoom),color:p.text,marginTop:1,textAlign:'center',paddingHorizontal:1}}>{cell.total?`${cell.s} S · ${cell.ns} N.S`:'Non concerné'}</Text>:null}
  </TouchableOpacity>;
}

function Stat({ value, label, sub }) {
  return <View style={{ flex: 1, minWidth: 130, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: 'rgba(255,255,255,0.82)', padding: 12 }}><Text style={{ fontSize: 24, fontFamily: FONTS.black, color: COLORS.ink }}>{value}</Text><Text style={{ fontSize: 11.5, fontFamily: FONTS.bold, color: COLORS.inkSoft }}>{label}</Text>{sub ? <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 3 }}>{sub}</Text> : null}</View>;
}

function Chip({ label, active, onPress, danger = false }) {
  return <TouchableOpacity onPress={onPress} style={{ minHeight: 38, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: active ? (danger ? '#B42318' : COLORS.orange) : COLORS.line, backgroundColor: active ? (danger ? '#FDECEC' : '#FFF3E8') : '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10.5, fontFamily: FONTS.bold, color: active ? (danger ? '#B42318' : COLORS.orange) : COLORS.inkSoft }}>{label}</Text></TouchableOpacity>;
}

/**
 * A single vertical virtualized list, shared horizontal offset and continuous
 * pinch zoom. No nested vertical scrollers or per-row scroll synchronization.
 */
function VirtualizedTechnicalMatrix({ sites, categories, navigation, clientId, nomClient, openCell, header:headerContent, footer:footerContent }) {
  const {width,fontScale}=useWindowDimensions();
  const [collapsed,setCollapsed]=useState({});
  const [zoom,setZoom]=useState(1),[viewport,setViewport]=useState(0);
  const [labelMode,setLabelMode]=useState('compact');
  const [gesturing,setGesturing]=useState(false);
  const [range,setRange]=useState({start:0,end:0});
  const animatedX=useRef(new Animated.Value(0)).current;
  const offset=useRef(0),inMatrix=useRef(false),gestureState=useRef(null);
  const params=useRef({});
  params.current={width:Math.max(1,(viewport||width)-28),count:categories.length,fontScale,labelMode};
  const geometry=getPilotagePanGeometry({...params.current,zoom});
  const geometryRef=useRef(geometry);
  geometryRef.current=geometry;
  const {leftWidth,cellWidth,categoryViewport,contentWidth,rowHeight,headerHeight}=geometry;
  const applyOffset=useCallback((value,g=geometryRef.current)=>{
    const x=clampPilotageOffset(value,g);
    offset.current=x;animatedX.setValue(-x);
    const next=visiblePilotageColumns(x,g);
    setRange(old=>old.start===next.start&&old.end===next.end?old:next);
  },[animatedX]);
  useEffect(()=>{applyOffset(offset.current,geometryRef.current);},[viewport,width,fontScale,categories.length,zoom,labelMode,applyOffset]);
  const applyZoom=useCallback((target,anchor=.5)=>{
    const old=geometryRef.current,z=clampPilotageZoom(target);
    if(Math.abs(z-old.zoom)<.012)return;
    const next=getPilotagePanGeometry({...params.current,zoom:z});
    const x=rescalePilotageOffset(offset.current,old,next,anchor);
    geometryRef.current=next;setZoom(z);applyOffset(x,next);
  },[applyOffset]);
  const toggleLabelMode=()=>{
    const old=geometryRef.current,mode=labelMode==='compact'?'expanded':'compact';
    const next=getPilotagePanGeometry({...params.current,labelMode:mode,zoom:old.zoom});
    const x=rescalePilotageOffset(offset.current,old,next,0);
    geometryRef.current=next;
    params.current={...params.current,labelMode:mode};
    setLabelMode(mode);applyOffset(x,next);
  };
  const touchDistance=touches=>touches?.length>=2?Math.hypot(touches[0].pageX-touches[1].pageX,touches[0].pageY-touches[1].pageY):0;
  const pinchAnchor=touches=>{
    const g=geometryRef.current;
    return Math.max(0,Math.min(1,((touches[0].pageX+touches[1].pageX)/2-14-g.leftWidth)/g.categoryViewport));
  };
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponderCapture:e=>inMatrix.current&&e.nativeEvent.touches?.length>=2,
    onMoveShouldSetPanResponderCapture:(e,g)=>inMatrix.current&&(e.nativeEvent.touches?.length>=2||
      (Math.abs(g.dx)>10&&Math.abs(g.dx)>Math.abs(g.dy)*1.5)),
    onPanResponderGrant:e=>{
      const touches=e.nativeEvent.touches||[],distance=touchDistance(touches);
      gestureState.current={mode:distance>0?'pinch':'pan',offset:offset.current,zoom:geometryRef.current.zoom,distance,anchor:distance?pinchAnchor(touches):.5};
      setGesturing(true);
    },
    onPanResponderMove:(e,g)=>{
      const s=gestureState.current;if(!s)return;
      const touches=e.nativeEvent.touches||[],distance=touchDistance(touches);
      if(distance>0){
        if(s.mode!=='pinch'){s.mode='pinch';s.distance=distance;s.zoom=geometryRef.current.zoom;s.anchor=pinchAnchor(touches);}
        if(s.distance>0)applyZoom(s.zoom*distance/s.distance,s.anchor);
      }else if(s.mode==='pan'){applyOffset(s.offset-g.dx);}
    },
    onPanResponderTerminationRequest:()=>false,
    onShouldBlockNativeResponder:()=>true,
    onPanResponderRelease:()=>{gestureState.current=null;inMatrix.current=false;setGesturing(false);},
    onPanResponderTerminate:()=>{gestureState.current=null;inMatrix.current=false;setGesturing(false);},
  }),[applyOffset,applyZoom]);
  const rows=useMemo(()=>{
    if(!categories.length||!sites.length)return [];
    const result=[{key:'__columns__',kind:'columns'}];
    for(const site of sites){
      result.push({key:'s:'+site.id,kind:'site',site});
      if(!collapsed[site.id])for(const local of site.locals||[])result.push({key:'l:'+site.id+':'+local.id,kind:'local',site,local});
    }
    return result;
  },[sites,categories,collapsed]);
  const ouvrirSite=site=>navigation.navigate('SiteLocals',{siteId:site.id,nomSite:site.nom_site,clientId,nomClient});
  const afficherNomComplet=ligne=>{
    const isSite=ligne.kind==='site';
    const name=isSite?ligne.site.nom_site:ligne.local.nom;
    const infos=isSite
      ? [(ligne.site.locals||[]).length+' local(aux)',ligne.site.adresse||'Adresse non renseignée']
      : [ligne.site.nom_site,(ligne.local.records||[]).length+' constat(s)',ligne.site.adresse||'Adresse non renseignée'];
    Alert.alert(name||'Installation technique',infos.filter(Boolean).join('\n'),[
      {text:'Fermer',style:'cancel'},{text:'Ouvrir le site',onPress:()=>ouvrirSite(ligne.site)},
    ]);
  };
  const choisirCellule=(ligne,category)=>{
    const cible=ligne.kind==='site'?ligne.site:ligne.local,cell=cible.cells?.[category.key];
    if(!cell?.total)return;
    openCell(ligne.kind==='local'?{...ligne.site,nom_site:ligne.site.nom_site+' · '+ligne.local.nom}:ligne.site,category,cell);
  };
  const frame={marginHorizontal:14,borderLeftWidth:1,borderRightWidth:1,borderColor:COLORS.line,backgroundColor:'#fff'};
  const matrixTouch=()=>{inMatrix.current=true;};
  const outsideTouch=()=>{inMatrix.current=false;};
  const header=<View onTouchStart={outsideTouch}>{headerContent}</View>;
  const footer=<View onTouchStart={outsideTouch}>{footerContent}</View>;
  const controls=(label,value,action,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={action} style={{minWidth:36,minHeight:35,paddingHorizontal:6,alignItems:'center',justifyContent:'center',borderRadius:8,borderWidth:1,borderColor:COLORS.line,opacity:disabled ? .35 : 1}}>
    <Text allowFontScaling={false} style={{fontSize:12,color:COLORS.orangeDark,fontFamily:FONTS.bold}}>{value}</Text>
  </TouchableOpacity>;
  const panBy=direction=>applyOffset(offset.current+direction*Math.max(cellWidth,categoryViewport*.8));
  const columns=render=><View style={{width:categoryViewport,overflow:'hidden',flexShrink:0}}>
    <Animated.View style={{width:contentWidth,flexDirection:'row',alignItems:'stretch',transform:[{translateX:animatedX}]}}>
      {categories.map((category,i)=><View key={category.key} importantForAccessibility={i>=range.start&&i<range.end?'auto':'no-hide-descendants'} style={{width:cellWidth,flexShrink:0,justifyContent:'center'}}>{render(category)}</View>)}
    </Animated.View>
  </View>;
  return <View style={{flex:1,minHeight:0}} {...responder.panHandlers}>
  <FlatList
    style={{flex:1,minHeight:0}}
    onLayout={e=>{const w=Math.round(e.nativeEvent.layout.width);setViewport(v=>v===w?v:w);}}
    data={rows} keyExtractor={item=>item.key}
    ListHeaderComponent={header} ListFooterComponent={footer}
    ListEmptyComponent={<View style={{marginHorizontal:14,padding:20,backgroundColor:'#fff'}}><Text style={{textAlign:'center',color:COLORS.muted}}>Aucun constat ne correspond aux filtres.</Text></View>}
    stickyHeaderIndices={rows.length?[1]:[]}
    extraData={labelMode+':'+zoom+':'+leftWidth+':'+cellWidth+':'+range.start+':'+range.end}
    contentContainerStyle={{paddingBottom:28}}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator scrollEnabled={!gesturing}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews={false}
    renderItem={({item:ligne})=>{
      if(ligne.kind==='columns')return <View onTouchStart={matrixTouch} style={[frame,{backgroundColor:'#FDFCFA',borderBottomWidth:1}]}>
        <View style={{padding:6,gap:4}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4}}>
            {controls('Réduire le zoom','−',()=>applyZoom(zoom-.15),zoom<=PILOTAGE_ZOOM_MIN+.01)}
            <Text accessibilityLabel={'Zoom '+Math.round(zoom*100)+' pour cent'} style={{fontFamily:FONTS.bold,fontSize:12,color:COLORS.ink}}>{Math.round(zoom*100)} %</Text>
            {controls('Agrandir le zoom','+',()=>applyZoom(zoom+.15),zoom>=PILOTAGE_ZOOM_MAX-.01)}
            {controls('Adapter à l’écran','Adapter',()=>{applyZoom(fitPilotageZoom(params.current.width,categories.length,fontScale,labelMode),0);applyOffset(0);})}
            {controls('Zoom normal','100 %',()=>applyZoom(1))}
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
            {controls('Catégories précédentes','‹',()=>panBy(-1),range.start===0&&offset.current<1)}
            <View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:10,textAlign:'center',color:COLORS.inkSoft}}>Colonnes {range.start+1}–{range.end} / {categories.length}</Text>
              <View style={{height:3,backgroundColor:'#E6E4E0',borderRadius:2,overflow:'hidden',marginTop:2}}>
                <Animated.View style={{height:3,width:Math.max(12,Math.min(100,categoryViewport/Math.max(1,contentWidth)*100))+'%',backgroundColor:COLORS.orange,borderRadius:2}}/>
              </View>
            </View>
            {controls('Catégories suivantes','›',()=>panBy(1),geometry.maxOffset<=offset.current+1)}
          </View>
          <Text style={{fontSize:9,textAlign:'center',color:COLORS.muted}}>Glisser · pincer pour zoomer · toucher l’en-tête Sites / locaux pour élargir</Text>
        </View>
        <View style={{flexDirection:'row',alignItems:'stretch'}}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Sites / locaux · '+(labelMode==='compact'?'Élargir la colonne':'Réduire la colonne')} accessibilityHint="Affiche les noms sur une colonne plus large, sans modifier le zoom des catégories" onPress={toggleLabelMode} style={{width:leftWidth,minHeight:headerHeight,padding:Math.max(2,3*zoom),justifyContent:'center',borderRightWidth:1,borderColor:COLORS.line}}>
            <Text allowFontScaling={false} style={{fontSize:Math.max(7,10*zoom),fontFamily:FONTS.black}}>Sites / locaux</Text>
            <Text allowFontScaling={false} style={{fontSize:Math.max(7,9*zoom),color:COLORS.orangeDark,fontFamily:FONTS.bold}}>{labelMode==='compact'?'↔ +':'↔ −'}</Text>
          </TouchableOpacity>
          {columns(category=><View style={{minHeight:headerHeight,padding:Math.max(1,4*zoom),justifyContent:'center'}}><Text allowFontScaling={false} style={{fontSize:Math.max(6.5,10*zoom),textAlign:'center',fontFamily:FONTS.bold}}>{category.label}</Text></View>)}
        </View>
      </View>;
      const isSite=ligne.kind==='site',cible=isSite?ligne.site:ligne.local;
      return <View onTouchStart={matrixTouch} style={[frame,{flexDirection:'row',minHeight:rowHeight,alignItems:'stretch',borderBottomWidth:1,backgroundColor:isSite?'#FFF4E9':'#fff'}]}>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel={isSite?'Afficher ou masquer les locaux de '+ligne.site.nom_site:'Ouvrir '+ligne.local.nom+' du site '+ligne.site.nom_site}
          accessibilityState={isSite?{expanded:!collapsed[ligne.site.id]}:undefined}
          onPress={()=>isSite?setCollapsed(state=>({...state,[ligne.site.id]:!state[ligne.site.id]})):ouvrirSite(ligne.site)}
          onLongPress={()=>afficherNomComplet(ligne)}
          style={{width:leftWidth,flexShrink:0,paddingHorizontal:Math.max(2,6*zoom),paddingVertical:Math.max(2,5*zoom),justifyContent:'center',borderRightWidth:1,borderColor:COLORS.line}}>
          <Text numberOfLines={labelMode==='compact'?2:3} ellipsizeMode="tail" allowFontScaling={false} style={{fontSize:Math.max(7,(isSite?10.5:10)*zoom),color:isSite?COLORS.primary:COLORS.inkSoft,fontFamily:FONTS.bold}}>{isSite?(collapsed[ligne.site.id]?'▸ ':'▾ ')+ligne.site.nom_site:'↳ '+ligne.local.nom}</Text>
          {zoom>=.65?<Text allowFontScaling={false} numberOfLines={labelMode==='compact'?1:2} style={{color:COLORS.muted,fontSize:Math.max(6.5,8.5*zoom),marginTop:2}}>{isSite?(ligne.site.locals||[]).length+' locaux'+(labelMode==='expanded'?' · '+(ligne.site.adresse||'Adresse non renseignée'):''):(ligne.local.records||[]).length+' constats'}</Text>:null}
        </TouchableOpacity>
        {columns(category=><Cell zoom={zoom} width={cellWidth} label={category.label+' · '+(isSite?ligne.site.nom_site:ligne.local.nom)} cell={cible.cells?.[category.key]||{total:0,state:'none',s:0,ns:0}} onPress={()=>choisirCellule(ligne,category)}/>)}
      </View>;
    }}
  /></View>;
}

// Android Play builds use the hardware-accelerated canvas. Keep the existing
// virtualized list as a deliberate accessibility and compatibility fallback.
const NativeCanvas=Platform.OS==='android'&&UIManager.getViewManagerConfig?.('MetraPilotageCanvas')?requireNativeComponent('MetraPilotageCanvas'):null;
function TactileTechnicalMatrix(props){
  const {sites,categories,navigation,clientId,nomClient,openCell,header,footer}=props;
  const [accessible,setAccessible]=useState(false),[details,setDetails]=useState(false),[collapsed,setCollapsed]=useState({});
  const [command,setCommand]=useState(null);
  const serial=useRef(0);
  useEffect(()=>{
    let mounted=true;
    AccessibilityInfo.isScreenReaderEnabled().then(v=>{if(mounted&&v)setAccessible(true);}).catch(()=>{});
    const sub=AccessibilityInfo.addEventListener('screenReaderChanged',v=>{if(v)setAccessible(true);});
    return()=>{mounted=false;sub.remove();};
  },[]);
  useEffect(()=>{if(!details)return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{setDetails(false);return true;});return()=>sub.remove();},[details]);
  const model=useMemo(()=>buildPilotageCanvasModel(sites,categories,collapsed),[sites,categories,collapsed]);
  const categoryMap=useMemo(()=>new Map(categories.map(c=>[String(c.key),c])),[categories]);
  const openSite=site=>navigation.navigate('SiteLocals',{siteId:site.id,nomSite:site.nom_site,clientId,nomClient});
  const onAction=({nativeEvent:e})=>{
    if(e.kind==='error'){Alert.alert('Pilotage','Le tableau natif ne peut pas afficher ces données. Ouverture de la liste accessible.');setAccessible(true);return;}
    const row=model.lookup.get(e.row);if(!row)return;
    const {site,local}=row;
    if(e.kind==='name'){Alert.alert(local?.nom||site.nom_site,[local?site.nom_site:null,site.adresse,(local?local.records:site.records)?.length+' constat(s)'].filter(Boolean).join('\n'),[{text:'Fermer',style:'cancel'},{text:'Ouvrir le site',onPress:()=>openSite(site)}]);return;}
    if(e.kind==='label'){if(local)openSite(site);else setCollapsed(s=>({...s,[site.id]:!s[site.id]}));return;}
    if(e.kind==='cell'){const category=categoryMap.get(e.column),cell=(local||site).cells?.[e.column];if(category&&cell?.total)openCell(local?{...site,nom_site:site.nom_site+' · '+local.nom}:site,category,cell);}
  };
  if(!NativeCanvas)return <VirtualizedTechnicalMatrix {...props}/>;
  const action=(label,title,onPress)=><TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{paddingHorizontal:9,minHeight:36,justifyContent:'center',borderRadius:8,borderWidth:1,borderColor:COLORS.line,backgroundColor:'#fff'}}><Text style={{fontSize:11,fontFamily:FONTS.bold,color:COLORS.orangeDark}}>{title}</Text></TouchableOpacity>;
  const send=action=>setCommand({seq:++serial.current,action});
  return <View style={{flex:1,minHeight:0}}>
    <View style={{paddingHorizontal:8,paddingTop:5,paddingBottom:5,gap:5}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:5}}>
        <Text numberOfLines={1} style={{flex:1,fontFamily:FONTS.bold,fontSize:12,color:COLORS.ink}}>Cartographie technique</Text>
        {action('Informations, filtres et export','Options',()=>setDetails(true))}
        {action(accessible?'Ouvrir le tableau tactile':'Ouvrir la liste accessible',accessible?'Tableau':'Liste',()=>setAccessible(v=>!v))}
      </View>
      {!accessible?<View style={{flexDirection:'row',alignItems:'center',gap:5}}>
        {action('Réduire le zoom','−',()=>send('out'))}
        {action('Agrandir le zoom','+',()=>send('in'))}
        {action('Adapter à l’écran','Adapter',()=>send('fit'))}
        {action('Zoom normal','100 %',()=>send('reset'))}
        <Text numberOfLines={2} style={{flex:1,color:COLORS.muted,fontSize:9}}>Glisser · pincer · double toucher</Text>
      </View>:null}
    </View>
    {accessible?<VirtualizedTechnicalMatrix {...props}/>:<NativeCanvas style={{flex:1,minHeight:0}} model={model.json} viewportCommand={command} onMatrixAction={onAction}/>}
    {details?<View style={{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:COLORS.bg,zIndex:10,elevation:10}}>
        <TouchableOpacity accessibilityRole="button" onPress={()=>setDetails(false)} style={{alignSelf:'flex-end',margin:12,padding:10}}><Text style={{fontFamily:FONTS.bold,color:COLORS.orangeDark}}>Retour au tableau</Text></TouchableOpacity>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:36}}>{header}{footer}</ScrollView>
      </View>:null}
  </View>;
}

function recordMatches(record, site, filters) {
  const avis = normAvis(record.avis);
  if (filters.trame !== 'all' && record.trame_id !== filters.trame) return false;
  if (filters.category !== 'all' && record.category_key !== filters.category) return false;
  if (filters.status === 'attention' && !['N.S', 'N.R', 'N.V'].includes(avis)) return false;
  if (filters.status !== 'all' && filters.status !== 'attention' && avis !== filters.status) return false;
  if (Number(filters.minSeverity || 0) > 0 && !(avis === 'N.S' && Number(record.criticite || 0) >= Number(filters.minSeverity))) return false;
  const q = normalize(filters.search).trim();
  if (q) {
    const haystack = normalize([site.nom_site, site.adresse, record.local_name, record.trame_label, record.category_label, record.section_code, record.cle, record.reference_libelle, record.commentaire, record.prestation, record.poste].filter(Boolean).join(' '));
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function ClientPilotageScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState(null);
  const [stats, setStats] = useState(null); // null means not yet calculated, never reliable zeroes
  const [statsError, setStatsError] = useState(null);
  const [groupes, setGroupes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupeActif, setGroupeActif] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportColumns, setExportColumns] = useState([...PILOTAGE_DEFAULT_COLUMNS]);
  const [exportPreset, setExportPreset] = useState('reserves');
  const [selected, setSelected] = useState(null);
  const [photos, setPhotos] = useState({});
  const [photoZoom, setPhotoZoom] = useState(null);
  // LOT05/F12: late photos of a closed/previous cell must never change this one.
  const cellPhotoGenerationRef = useRef(0);
  const pilotageLoadGenerationRef = useRef(0);

  const charger = useCallback(async () => {
    const generation = ++pilotageLoadGenerationRef.current;
    setLoading(true);
    setStats(null);
    setStatsError(null);
    try {
      const [m, gs, ms] = await Promise.all([
        getClientTechnicalMatrix(clientId),
        listerGroupesClient(clientId),
        listerAppartenancesClient(clientId),
      ]);
      if (generation !== pilotageLoadGenerationRef.current) return;
      // The matrix is usable even when patrimony statistics cannot be refreshed.
      setMatrix(m);
      setGroupes(gs || []);
      setMemberships(ms || []);
      setLoading(false);
      try {
        // Preserve the synchronisation done inside this business service.
        const nextStats = await getStatsSitesPatrimoine(clientId);
        if (generation === pilotageLoadGenerationRef.current) {
          setStats(nextStats);
          setStatsError(null);
        }
      } catch (e) {
        if (generation === pilotageLoadGenerationRef.current) setStatsError(String(e?.message || e));
      }
    } catch (e) {
      if (generation !== pilotageLoadGenerationRef.current) return;
      Alert.alert('Pilotage', String(e?.message || e));
    } finally {
      if (generation === pilotageLoadGenerationRef.current) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    charger();
    return () => {
      pilotageLoadGenerationRef.current += 1;
      cellPhotoGenerationRef.current += 1;
    };
  }, [charger]);

  const siteIdsGroupe = useMemo(() => {
    if (!groupeActif) return null;
    return new Set(memberships.filter((m) => m.groupe_id === groupeActif).map((m) => m.site_id));
  }, [groupeActif, memberships]);

  const scopedSites = useMemo(() => (matrix?.sites || []).filter((site) => !siteIdsGroupe || siteIdsGroupe.has(site.id)), [matrix, siteIdsGroupe]);

  const filteredRecordsBySite = useMemo(() => {
    const map = new Map();
    for (const site of scopedSites) map.set(site.id, (site.records || []).filter((record) => recordMatches(record, site, filters)));
    return map;
  }, [scopedSites, filters]);

  const visibleCategories = useMemo(() => {
    if (!matrix) return [];
    if (filters.category !== 'all') return matrix.categories.filter((c) => c.key === filters.category);
    const used = new Set();
    for (const records of filteredRecordsBySite.values()) for (const record of records) used.add(record.category_key);
    return matrix.categories.filter((c) => used.has(c.key));
  }, [matrix, filters.category, filteredRecordsBySite]);

  const sites = useMemo(() => scopedSites.map((site) => {
    const records = filteredRecordsBySite.get(site.id) || [];
    const locals = (site.locals || []).map((local) => {
      const localRecords = records.filter((record) => record.local_id === local.id);
      return { ...local, records: localRecords, cells: buildMatrixCells(localRecords, visibleCategories) };
    }).filter((local) => local.records.length > 0 || (!filters.search.trim() && filters.status === 'all' && filters.category === 'all' && filters.trame === 'all' && filters.minSeverity === 0));
    return { ...site, records, locals, cells: buildMatrixCells(records, visibleCategories) };
  }).filter((site) => site.records.length > 0 || Object.values(filters).every((v) => v === 'all' || v === 0 || v === '')), [scopedSites, filteredRecordsBySite, visibleCategories, filters]);

  const filteredRecords = useMemo(() => sites.flatMap((site) => site.records || []), [sites]);

  const siteNames = useMemo(() => new Map((matrix?.sites || []).map((s) => [s.id, s.nom_site])), [matrix]);
  const siteAddresses = useMemo(() => new Map((matrix?.sites || []).map((s) => [s.id, s.adresse || ''])), [matrix]);
  const siteGroups = useMemo(() => {
    const map = new Map();
    for (const membership of memberships) {
      if (!map.has(membership.site_id)) map.set(membership.site_id, []);
      map.get(membership.site_id).push(membership.groupe_nom);
    }
    return map;
  }, [memberships]);

  const resume = useMemo(() => {
    if (!(stats instanceof Map)) return null;
    let reservesOuvertes = 0, reservesLevees = 0, actifs = 0, aSurveiller = 0;
    for (const site of scopedSites) {
      const s = stats.get(site.id) || {};
      reservesOuvertes += Number(s.reserves?.ouvertes || 0);
      reservesLevees += Number(s.reserves?.levees || 0);
      actifs += Number(s.equipements?.actifs || 0);
      aSurveiller += Number(s.equipements?.aSurveiller || 0);
    }
    return { sites: scopedSites.length, reservesOuvertes, reservesLevees, actifs, aSurveiller };
  }, [scopedSites, stats]);

  const technicalSummary = useMemo(() => {
    const result = { total: filteredRecords.length, ns: 0, critical: 0, nr: 0 };
    for (const r of filteredRecords) {
      const avis = normAvis(r.avis);
      if (avis === 'N.S') { result.ns += 1; if (Number(r.criticite || 0) >= 4) result.critical += 1; }
      if (avis === 'N.R' || avis === 'N.V') result.nr += 1;
    }
    return result;
  }, [filteredRecords]);

  const closeCell = () => {
    cellPhotoGenerationRef.current += 1;
    setSelected(null);
    setPhotos({});
  };
  const openCell = async (site, category, cell) => {
    const generation = ++cellPhotoGenerationRef.current;
    setSelected({ site, category, cell });
    setPhotos({});
    try {
      const entries = await mapAvecConcurrence(cell.issues || [], 4, async (issue) => [issueKey(issue), await getMatrixCellPhotos(issue)]);
      if (generation === cellPhotoGenerationRef.current) setPhotos(Object.fromEntries(entries));
    } catch (e) {
      if (generation === cellPhotoGenerationRef.current) {
        setPhotos({});
        Alert.alert('Photos indisponibles', String(e?.message || e));
      }
    }
  };

  const activeFilterCount = useMemo(() => [filters.trame !== 'all', filters.status !== 'all', filters.minSeverity > 0, filters.category !== 'all', !!filters.search.trim()].filter(Boolean).length, [filters]);
  const groupLabel = groupes.find((g) => g.id === groupeActif)?.nom || 'Tous les sites';
  const viewLabel = `${groupLabel} · ${filters.trame === 'all' ? 'Tous métiers' : matrix?.trames?.find((t) => t.id === filters.trame)?.label || filters.trame} · ${filters.status === 'all' ? 'Tous statuts' : filters.status}${filters.minSeverity ? ` · criticité ≥ ${filters.minSeverity}` : ''}${filters.category !== 'all' ? ` · ${matrix?.categories?.find((c) => c.key === filters.category)?.label || filters.category}` : ''}`;

  const faireExport = async ({ columns = PILOTAGE_DEFAULT_COLUMNS, presetStatuses = [], label = viewLabel } = {}) => {
    if (!filteredRecords.length) return Alert.alert('Extraction', 'Aucune ligne dans la vue actuelle.');
    try {
      setExportBusy(true);
      const result = await exporterPilotageExcel({ clientNom: nomClient, records: filteredRecords, siteNames, siteAddresses, siteGroups, columns, presetStatuses, viewLabel: label, partager: true });
      setExportVisible(false);
      if (!result.partageLance) Alert.alert('Extraction créée', `${result.lignes} ligne(s) · ${result.nomFichier}`);
    } catch (e) { Alert.alert('Extraction impossible', String(e?.message || e)); }
    finally { setExportBusy(false); }
  };

  const choisirPreset = (key) => {
    setExportPreset(key);
    if (key === 'view') setExportColumns([...PILOTAGE_DEFAULT_COLUMNS]);
    else setExportColumns([...(PILOTAGE_EXPORT_PRESETS[key]?.columns || PILOTAGE_DEFAULT_COLUMNS)]);
  };

  const toggleColumn = (key) => setExportColumns((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);

  if (loading || !matrix) return <View style={{ flex: 1 }}><Text style={{ color: COLORS.muted, fontFamily: FONTS.bodyMedium, marginTop: 10, marginHorizontal: 16 }}>Calcul du pilotage client…</Text><SkeletonList count={5} withTitle={false} /></View>;

  const pilotageAction = { flex: 0, width: '48.8%', flexDirection: 'row', gap: 7, paddingHorizontal: 10 };
  return <>
    <TactileTechnicalMatrix sites={sites} categories={visibleCategories} navigation={navigation} clientId={clientId} nomClient={nomClient} openCell={openCell}
      header={<>
    <View style={{ padding: 14 }}>
      <Text style={{ color: COLORS.inkSoft, fontSize: 12.5, fontFamily: FONTS.bodyMedium }}>{nomClient || 'Client'} · calcul local et disponible hors connexion</Text>
      {groupes.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 7 }}>
        <Chip label="Tous les sites" active={!groupeActif} onPress={() => setGroupeActif(null)}/>
        {groupes.map((g) => <Chip key={g.id} label={`${g.nom} · ${g.nb_sites || 0}`} active={groupeActif === g.id} onPress={() => setGroupeActif(g.id)}/>)}
      </ScrollView> : null}

      {/* Actions en grille 2 × 2 : libellés entiers, icônes dessinées. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, pilotageAction]} onPress={() => setFilterVisible(true)}><CvcIcon name="settings" size={17} color={COLORS.orangeDark} /><Text numberOfLines={1} style={styles.btnSecondaryText}>Filtres{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, pilotageAction, filters.status === 'attention' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => setFilters((f) => ({ ...f, status: f.status === 'attention' ? 'all' : 'attention' }))}><CvcIcon name="warning" size={17} color={COLORS.orangeDark} /><Text numberOfLines={1} style={styles.btnSecondaryText}>Attention</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, pilotageAction]} disabled={exportBusy || !filteredRecords.length} onPress={() => faireExport({})}><ButtonGlow /><CvcIcon name="export" size={17} color={COLORS.white} /><Text numberOfLines={1} style={styles.btnPrimaryText}>Exporter la vue</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, pilotageAction]} disabled={exportBusy || !filteredRecords.length} onPress={() => setExportVisible(true)}><CvcIcon name="document" size={17} color={COLORS.orangeDark} /><Text numberOfLines={1} style={styles.btnSecondaryText}>Extraction Excel</Text></TouchableOpacity>
      </View>
      <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 8 }}>{viewLabel} · {filteredRecords.length} ligne(s)</Text>
    </View>

    <View style={{marginHorizontal:14,padding:12,borderTopLeftRadius:16,borderTopRightRadius:16,backgroundColor:'#fff',borderWidth:1,borderColor:COLORS.line}}>
      <Text style={styles.sectionLabel}>Cartographie technique</Text>
      <Text style={{color:COLORS.muted,fontSize:10.5,marginTop:4}}>Rouge : criticité 4–5 · orange : N.S · gris : information incomplète. Glisse le tableau de gauche à droite et de haut en bas. Pince à deux doigts pour régler le zoom, ou utilise − / +. Les sites et locaux restent visibles.</Text>
    </View>
      </>}
      footer={<>
    <View style={{ padding: 14 }}>
      <Text style={styles.sectionLabel}>Synthèse de la vue</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
        <Stat value={technicalSummary.total} label="Points affichés" sub={`${technicalSummary.ns} N.S`} />
        <Stat value={technicalSummary.critical} label="Prioritaires / critiques" sub="criticité 4–5" />
        <Stat value={technicalSummary.nr} label="À compléter" sub="N.R + N.V" />
      </View>
      <Text style={[styles.sectionLabel, { marginTop: 18, marginBottom: 8 }]}>Patrimoine du périmètre</Text>
      {statsError ? <TouchableOpacity accessibilityRole="button" onPress={charger} style={{ paddingVertical: 8 }}>
        <Text style={{ color: COLORS.red, fontSize: 11 }}>Statistiques indisponibles · Toucher pour réessayer</Text>
      </TouchableOpacity> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Stat value={resume?.sites ?? '—'} label="Sites"/><Stat value={resume?.reservesOuvertes ?? '—'} label="Réserves ouvertes" sub={resume ? `${resume.reservesLevees} levée(s)` : 'Statistiques indisponibles'}/><Stat value={resume?.actifs ?? '—'} label="Équipements actifs" sub={resume ? `${resume.aSurveiller} à surveiller` : 'Statistiques indisponibles'}/></View>
    </View>

      </>}
    />

    <Modal visible={filterVisible} transparent animationType="fade" onRequestClose={() => setFilterVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '94%', maxWidth: 720, maxHeight: '90%' }]}><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[styles.modalTitle, { flex: 1 }]}>Filtres cartographie</Text><TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)}><Text style={{ color: COLORS.primary, fontFamily: FONTS.bold }}>Réinitialiser</Text></TouchableOpacity></View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Recherche</Text><TextInput style={styles.input} value={filters.search} placeholder="Site, local, réserve, équipement, commentaire…" onChangeText={(v) => setFilters((f) => ({ ...f, search: v }))}/>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Métier</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Tous" active={filters.trame === 'all'} onPress={() => setFilters((f) => ({ ...f, trame: 'all' }))}/>{(matrix.trames || []).map((t) => <Chip key={t.id} label={t.label} active={filters.trame === t.id} onPress={() => setFilters((f) => ({ ...f, trame: t.id }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Avis</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{STATUS_OPTIONS.map((o) => <Chip key={o.id} label={o.label} active={filters.status === o.id} onPress={() => setFilters((f) => ({ ...f, status: o.id }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Criticité minimale</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{[0, 1, 2, 3, 4, 5].map((v) => <Chip key={v} label={v === 0 ? 'Toutes' : `≥ ${v}`} active={Number(filters.minSeverity) === v} danger={v >= 4} onPress={() => setFilters((f) => ({ ...f, minSeverity: v }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Catégorie</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Toutes" active={filters.category === 'all'} onPress={() => setFilters((f) => ({ ...f, category: 'all' }))}/>{matrix.categories.map((c) => <Chip key={c.key} label={c.label} active={filters.category === c.key} onPress={() => setFilters((f) => ({ ...f, category: c.key }))}/>)}</View>
      <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={() => setFilterVisible(false)}><ButtonGlow /><Text style={styles.btnPrimaryText}>Afficher la vue</Text></TouchableOpacity></ScrollView></View></View></Modal>

    <Modal visible={exportVisible} transparent animationType="fade" onRequestClose={() => setExportVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '95%', maxWidth: 760, maxHeight: '92%' }]}><ScrollView><Text style={styles.modalTitle}>Extraction Excel</Text><Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>L’extraction part de la vue filtrée actuelle. Feuille 1 = Synthèse · feuille 2 = Détail.</Text>
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Préréglage</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Vue courante" active={exportPreset === 'view'} onPress={() => choisirPreset('view')}/>{Object.entries(PILOTAGE_EXPORT_PRESETS).map(([key, preset]) => <Chip key={key} label={preset.label} active={exportPreset === key} onPress={() => choisirPreset(key)}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Colonnes</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{PILOTAGE_EXPORT_COLUMNS.map((column) => <Chip key={column.key} label={column.label} active={exportColumns.includes(column.key)} onPress={() => toggleColumn(column.key)}/>)}</View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} disabled={exportBusy} onPress={() => setExportVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={exportBusy || !exportColumns.length} onPress={() => faireExport({ columns: exportColumns, presetStatuses: exportPreset === 'view' ? [] : (PILOTAGE_EXPORT_PRESETS[exportPreset]?.statuses || []), label: `${viewLabel} · ${exportPreset === 'view' ? 'Vue courante' : PILOTAGE_EXPORT_PRESETS[exportPreset]?.label || 'Extraction'}` })}><ButtonGlow /><Text style={styles.btnPrimaryText}>{exportBusy ? 'Création…' : 'Créer et partager'}</Text></TouchableOpacity></View></ScrollView></View></View></Modal>

    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeCell}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 720, width: '94%', maxHeight: '88%' }]}>{selected ? <ScrollView><Text style={styles.modalTitle}>{selected.site.nom_site} · {selected.category.label}</Text><Text style={{ color: COLORS.muted, marginTop: 3 }}>{selected.cell.s} S · {selected.cell.ns} N.S · {selected.cell.nr} N.R · {selected.cell.so} S.O · {selected.cell.nv} N.V</Text>{selected.cell.issues.length ? selected.cell.issues.map((issue, idx) => { const pics = photos[issueKey(issue)] || []; return <View key={`${issueKey(issue)}-${idx}`} style={{ marginTop: 12, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 12, padding: 11 }}><Text style={{ fontFamily: FONTS.black, color: Number(issue.criticite || 0) >= 4 ? COLORS.red : COLORS.orange }}>{issue.reference_libelle || issue.cle} · {reserveSeverityLabel(issue.criticite)}</Text><Text style={{ marginTop: 5, color: COLORS.ink }}>{issue.prestation || issue.commentaire || 'Anomalie à préciser'}</Text>{pics.length ? <ScrollView horizontal style={{ marginTop: 8 }}>{pics.map((p) => <TouchableOpacity key={p.id} onPress={() => setPhotoZoom({ ...p, issue })}><PhotoVariantImage uri={p.uri} variant="thumb" style={{ width: 105, height: 78, borderRadius: 8, marginRight: 7, backgroundColor: '#eee' }} resizeMode="cover"/></TouchableOpacity>)}</ScrollView> : <Text style={{ marginTop: 7, fontSize: 10, color: COLORS.muted }}>Aucune photo liée à ce problème.</Text>}</View>; }) : <Text style={{ marginTop: 12, color: COLORS.muted }}>Aucune réserve N.S dans cette cellule.</Text>}<View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => { const s = selected.site; closeCell(); navigation.navigate('SiteLocals', { siteId: s.id, nomSite: s.nom_site, clientId, nomClient }); }}><ButtonGlow /><Text style={styles.btnPrimaryText}>Ouvrir le site</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={closeCell}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity></View></ScrollView> : null}</View></View></Modal>
    <Modal visible={!!photoZoom} transparent animationType="fade" onRequestClose={() => setPhotoZoom(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '96%', maxWidth: 900 }]}>{photoZoom ? <><PhotoVariantImage uri={photoZoom.uri} variant="preview" resizeMode="contain" style={{ width: '100%', height: 430, backgroundColor: '#111', borderRadius: 10 }}/><Text style={{ marginTop: 9, fontFamily: FONTS.bold }}>{photoZoom.label || photoZoom.issue?.reference_libelle || photoZoom.issue?.cle}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 12 }]} onPress={() => setPhotoZoom(null)}><ButtonGlow /><Text style={styles.btnPrimaryText}>Revenir au pilotage</Text></TouchableOpacity></> : null}</View></View></Modal>
  </>;
}
