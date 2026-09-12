import React from 'react';
import { Animated, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { HomeBuildingScene, useBuildingSceneMotion } from './HomeBuildingScene.js';

const PALETTE = {
  ink: '#14202C', muted: '#69747E', line: '#DDE2E3', paper: '#F4F1E8', surface: '#FFFDF8',
  orange: '#F26426', green: '#6AAB45', teal: '#2D8B9E', yellow: '#F5B51B', red: '#BE3B31',
};

function Metric({ icon, value, label, tone = 'teal' }) {
  return <View style={styles.metric}><View style={[styles.metricMark, styles[`metric_${tone}`]]}><Text style={styles.metricIcon}>{icon}</Text></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function ClientRow({ item, onOpen, onDelete }) {
  return <TouchableOpacity activeOpacity={0.82} style={styles.clientRow} onPress={onOpen}>
    <View style={styles.clientAccent}/><View style={styles.clientIdentity}><Text style={styles.clientEyebrow}>CLIENT</Text><Text style={styles.clientName}>{item.nom}</Text><Text style={styles.clientCode}>{item.code_exploitant || 'Patrimoine local'}</Text></View>
    <TouchableOpacity accessibilityLabel={`Supprimer ${item.nom}`} onPress={(event)=>{event?.stopPropagation?.();onDelete();}} style={styles.rowDelete}><Text style={styles.rowDeleteText}>×</Text></TouchableOpacity><Text style={styles.rowChevron}>›</Text>
  </TouchableOpacity>;
}

function OngoingVisit({ visit, onOpen, onDelete }) {
  return <TouchableOpacity activeOpacity={0.84} style={styles.visitRow} onPress={onOpen}>
    <View style={styles.visitProgressRail}><View style={[styles.visitProgressFill,{width:`${Math.max(4,Math.min(100,Number(visit.progression_pct||0)))}%`}]}/></View>
    <View style={{flex:1}}><Text style={styles.visitName}>{visit.nom_client}</Text><Text style={styles.visitSite}>{visit.nom_site}</Text></View>
    <View style={styles.visitPct}><Text style={styles.visitPctText}>{visit.progression_pct}%</Text></View>
    <TouchableOpacity accessibilityLabel="Supprimer la visite" onPress={(event)=>{event?.stopPropagation?.();onDelete();}} style={styles.visitDelete}><Text style={styles.visitDeleteText}>×</Text></TouchableOpacity>
  </TouchableOpacity>;
}

export function SpiralActiveHome({
  clients, visitesEnCours, stats, refreshing, onRefresh, quickSearch, setQuickSearch, openDirectory,
  navigation, choisirExcel, confirmerSuppressionVisite, confirmerSuppressionClient, modalVisible,
  setModalVisible, nouveauNom, setNouveauNom, nouveauCode, setNouveauCode, ajouterClient,
  creationClient, importBatch, setImportBatch, confirmerImport, importEnCours,
}) {
  const scene = useBuildingSceneMotion();
  const foregroundOpacity = scene.opening.interpolate({inputRange:[0,0.18,0.72,1],outputRange:[1,1,0.12,0],extrapolate:'clamp'});
  const foregroundScale = scene.opening.interpolate({inputRange:[0,1],outputRange:[1,1.035],extrapolate:'clamp'});
  const foregroundY = scene.opening.interpolate({inputRange:[0,1],outputRange:[0,-18],extrapolate:'clamp'});

  return <View
    style={styles.root}
    onTouchStart={scene.onTouchStart}
    onTouchMove={scene.onTouchMove}
    onTouchEnd={scene.onTouchEnd}
    onTouchCancel={scene.onTouchEnd}
  >
    <HomeBuildingScene motion={scene} navigation={navigation} openDirectory={openDirectory} choisirExcel={choisirExcel}/>

    <Animated.View pointerEvents={scene.hubOpen?'none':'auto'} style={[styles.foreground,{opacity:foregroundOpacity,transform:[{translateY:foregroundY},{scale:foregroundScale}]}]}>
      <FlatList
        data={clients}
        keyExtractor={(item)=>String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PALETTE.orange}/>} 
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.hero}>
            <View style={styles.heroTextPlate}>
              <View style={styles.heroRule}/><Text style={styles.heroKicker}>METRA · TERRAIN TECHNIQUE</Text>
              <Text style={styles.heroTitle}>Observer.{`\n`}Comprendre.{`\n`}Agir.</Text>
              <Text style={styles.heroSubtitle}>Le patrimoine et les visites réunis dans une interface pensée pour le terrain.</Text>
              <View style={styles.heroTagRow}><View style={styles.heroTag}><Text style={styles.heroTagText}>OFFLINE</Text></View><View style={[styles.heroTag,styles.heroTagDark]}><Text style={[styles.heroTagText,styles.heroTagTextDark]}>SPIRALE ACTIVE</Text></View></View>
            </View>
            <View style={styles.zoomHint}><Text style={styles.zoomHintText}>ÉCARTEZ DEUX DOIGTS POUR ENTRER</Text><Text style={styles.zoomHintIcon}>↔</Text></View>
          </View>

          <View style={styles.searchShell}><Text style={styles.searchEyebrow}>RECHERCHE UNIVERSELLE</Text><View style={styles.searchRow}><Text style={styles.searchIcon}>⌕</Text><TextInput value={quickSearch} onChangeText={setQuickSearch} onSubmitEditing={openDirectory} placeholder="Client, site, ville, adresse, équipement…" placeholderTextColor="#929AA1" style={styles.searchInput} autoCorrect={false} autoCapitalize="none" returnKeyType="search"/><TouchableOpacity onPress={openDirectory} style={styles.searchGo}><Text style={styles.searchGoText}>→</Text></TouchableOpacity></View></View>

          <View style={styles.metricsRow}><Metric icon="↗" value={stats.enCours} label="En cours" tone="orange"/><Metric icon="✓" value={stats.terminees} label="Terminées" tone="green"/><Metric icon="◎" value={clients.length} label="Clients" tone="teal"/></View>

          <View style={styles.actionsStrip}><TouchableOpacity style={styles.actionPrimary} onPress={choisirExcel}><Text style={styles.actionPrimaryIcon}>⇧</Text><View><Text style={styles.actionPrimaryTitle}>Importer Excel</Text><Text style={styles.actionPrimarySub}>Créer ou reprendre une visite</Text></View></TouchableOpacity><TouchableOpacity style={styles.actionSecondary} onPress={()=>navigation.navigate('Parametres')}><Text style={styles.actionSecondaryIcon}>⚙</Text><Text style={styles.actionSecondaryText}>Réglages</Text></TouchableOpacity></View>

          {visitesEnCours.length>0?<><View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>À REPRENDRE</Text><Text style={styles.sectionTitle}>Visites en cours</Text></View><Text style={styles.sectionCount}>{visitesEnCours.length}</Text></View>{visitesEnCours.map((visit)=><OngoingVisit key={visit.id} visit={visit} onOpen={()=>navigation.navigate('Visite',{visiteId:visit.id})} onDelete={()=>confirmerSuppressionVisite(visit)}/>)}</>:null}

          <View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>PATRIMOINE</Text><Text style={styles.sectionTitle}>Clients locaux</Text></View><TouchableOpacity onPress={()=>setModalVisible(true)} style={styles.addClient}><Text style={styles.addClientText}>＋ Ajouter</Text></TouchableOpacity></View>
        </>}
        renderItem={({item})=><ClientRow item={item} onOpen={()=>navigation.navigate('ClientSites',{clientId:item.id,nomClient:item.nom})} onDelete={()=>confirmerSuppressionClient(item)}/>} 
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Aucun client local</Text><Text style={styles.emptyText}>Utilisez la recherche METRA ou ajoutez un client pour commencer.</Text></View>}
        ListFooterComponent={<View style={styles.footerSpace}><Text style={styles.footerHint}>Tournez la spirale à gauche pour explorer · à droite pour agir.</Text></View>}
      />
    </Animated.View>

    <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={()=>setModalVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalKicker}>PATRIMOINE</Text><Text style={styles.modalTitle}>Nouveau client</Text><TextInput style={styles.modalInput} placeholder="Nom du client" placeholderTextColor="#929AA1" value={nouveauNom} onChangeText={setNouveauNom}/><TextInput style={styles.modalInput} placeholder="Code exploitant (optionnel)" placeholderTextColor="#929AA1" value={nouveauCode} onChangeText={setNouveauCode}/><View style={styles.modalActions}><TouchableOpacity style={styles.modalCancel} onPress={()=>setModalVisible(false)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.modalConfirm} onPress={ajouterClient}><Text style={styles.modalConfirmText}>{creationClient?'Création…':'Créer'}</Text></TouchableOpacity></View></View></View></Modal>

    <Modal visible={!!importBatch} transparent animationType="fade" onRequestClose={()=>setImportBatch(null)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalKicker}>IMPORT</Text><Text style={styles.modalTitle}>Excel en lot</Text>{importBatch?<ScrollView style={{maxHeight:360}}>{importBatch.analyses.map((analysis,index)=><View key={`${analysis.sourceId||analysis.nomFichier}-${index}`} style={styles.importRow}><Text style={styles.importName}>{analysis.nomFichier}</Text><Text style={styles.importSite}>{analysis.client} · {analysis.site}</Text></View>)}</ScrollView>:null}<View style={styles.modalActions}><TouchableOpacity style={styles.modalCancel} onPress={()=>setImportBatch(null)}><Text style={styles.modalCancelText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.modalConfirm} onPress={confirmerImport}><Text style={styles.modalConfirmText}>{importEnCours?'Import…':`Importer ${importBatch?.analyses?.length||0}`}</Text></TouchableOpacity></View></View></View></Modal>
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:PALETTE.paper,overflow:'hidden'},
  foreground:{flex:1,zIndex:5},
  content:{paddingHorizontal:18,paddingTop:16,paddingBottom:34},
  hero:{minHeight:292,paddingTop:6,paddingBottom:18,justifyContent:'space-between'},
  heroTextPlate:{alignSelf:'flex-start',width:'56%',minWidth:285,maxWidth:430,padding:14,backgroundColor:'rgba(244,241,232,0.82)',borderLeftWidth:1,borderLeftColor:'rgba(20,32,44,0.12)'},
  heroRule:{width:56,height:4,backgroundColor:PALETTE.orange,marginBottom:12},heroKicker:{color:PALETTE.ink,fontSize:10,fontWeight:'900',letterSpacing:1.7},heroTitle:{marginTop:10,color:PALETTE.ink,fontSize:38,lineHeight:39,fontWeight:'900',letterSpacing:-1.2},heroSubtitle:{marginTop:12,color:PALETTE.muted,fontSize:13,lineHeight:19,maxWidth:320},heroTagRow:{flexDirection:'row',gap:8,marginTop:16},heroTag:{minHeight:25,borderWidth:1,borderColor:PALETTE.green,paddingHorizontal:9,justifyContent:'center',backgroundColor:'#EEF5E8',transform:[{skewX:'-8deg'}]},heroTagDark:{borderColor:PALETTE.ink,backgroundColor:PALETTE.ink},heroTagText:{color:'#4D7A32',fontSize:8.5,fontWeight:'900',letterSpacing:1.1,transform:[{skewX:'8deg'}]},heroTagTextDark:{color:'#FFFFFF'},
  zoomHint:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,minHeight:30,paddingHorizontal:11,backgroundColor:'rgba(255,253,248,0.80)',borderWidth:1,borderColor:'rgba(20,32,44,0.12)'},zoomHintText:{color:'#59646D',fontSize:8.2,fontWeight:'900',letterSpacing:1.1},zoomHintIcon:{color:PALETTE.orange,fontSize:15,fontWeight:'900'},
  searchShell:{backgroundColor:'rgba(255,253,248,0.96)',borderWidth:1,borderColor:PALETTE.line,padding:12,marginBottom:12},searchEyebrow:{color:PALETTE.teal,fontSize:8.5,fontWeight:'900',letterSpacing:1.4,marginBottom:7},searchRow:{minHeight:50,borderWidth:1,borderColor:'#E3E6E6',backgroundColor:'#F8F8F4',flexDirection:'row',alignItems:'center'},searchIcon:{marginLeft:13,marginRight:8,color:'#8D969D',fontSize:20},searchInput:{flex:1,minHeight:48,paddingVertical:10,color:PALETTE.ink,fontSize:14},searchGo:{width:48,alignSelf:'stretch',alignItems:'center',justifyContent:'center',backgroundColor:PALETTE.ink},searchGoText:{color:'#FFFFFF',fontSize:19,fontWeight:'900'},
  metricsRow:{flexDirection:'row',gap:8,marginBottom:12},metric:{flex:1,minHeight:104,backgroundColor:'rgba(255,253,248,0.96)',borderWidth:1,borderColor:PALETTE.line,padding:11},metricMark:{width:29,height:29,alignItems:'center',justifyContent:'center',marginBottom:8,transform:[{rotate:'-7deg'}]},metric_orange:{backgroundColor:'#FFE4D6'},metric_green:{backgroundColor:'#E7F1DF'},metric_teal:{backgroundColor:'#DCEFF1'},metric_yellow:{backgroundColor:'#FFF0C7'},metricIcon:{color:PALETTE.ink,fontSize:15,fontWeight:'900',transform:[{rotate:'7deg'}]},metricValue:{color:PALETTE.ink,fontSize:24,lineHeight:25,fontWeight:'900'},metricLabel:{marginTop:3,color:PALETTE.muted,fontSize:10.5,fontWeight:'700'},
  actionsStrip:{flexDirection:'row',gap:8,marginBottom:22},actionPrimary:{flex:1,minHeight:66,paddingHorizontal:13,backgroundColor:PALETTE.ink,flexDirection:'row',alignItems:'center',gap:10},actionPrimaryIcon:{color:PALETTE.orange,fontSize:22,fontWeight:'900'},actionPrimaryTitle:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},actionPrimarySub:{marginTop:2,color:'#C8D0D5',fontSize:9.5},actionSecondary:{width:88,minHeight:66,backgroundColor:'rgba(255,253,248,0.96)',borderWidth:1,borderColor:PALETTE.line,alignItems:'center',justifyContent:'center'},actionSecondaryIcon:{color:PALETTE.orange,fontSize:19},actionSecondaryText:{marginTop:4,color:PALETTE.ink,fontSize:10,fontWeight:'900'},
  sectionHeading:{marginTop:5,marginBottom:9,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},sectionKicker:{color:PALETTE.orange,fontSize:8.5,fontWeight:'900',letterSpacing:1.5},sectionTitle:{marginTop:2,color:PALETTE.ink,fontSize:18,fontWeight:'900'},sectionCount:{color:PALETTE.muted,fontSize:12,fontWeight:'800'},addClient:{minHeight:34,paddingHorizontal:10,alignItems:'center',justifyContent:'center',borderBottomWidth:2,borderBottomColor:PALETTE.orange},addClientText:{color:PALETTE.ink,fontSize:11.5,fontWeight:'900'},
  visitRow:{minHeight:72,marginBottom:8,backgroundColor:'rgba(255,253,248,0.97)',borderWidth:1,borderColor:PALETTE.line,paddingHorizontal:13,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:10,overflow:'hidden'},visitProgressRail:{position:'absolute',left:0,bottom:0,right:0,height:3,backgroundColor:'#E9ECEA'},visitProgressFill:{height:'100%',backgroundColor:PALETTE.orange},visitName:{color:PALETTE.ink,fontSize:13,fontWeight:'900'},visitSite:{marginTop:2,color:PALETTE.muted,fontSize:11},visitPct:{minWidth:44,minHeight:28,paddingHorizontal:8,backgroundColor:'#FFF0E8',alignItems:'center',justifyContent:'center'},visitPctText:{color:'#B74A20',fontSize:10.5,fontWeight:'900'},visitDelete:{width:30,height:30,alignItems:'center',justifyContent:'center'},visitDeleteText:{color:PALETTE.red,fontSize:20},
  clientRow:{minHeight:74,marginBottom:7,backgroundColor:'rgba(255,253,248,0.97)',borderWidth:1,borderColor:PALETTE.line,flexDirection:'row',alignItems:'center',overflow:'hidden'},clientAccent:{alignSelf:'stretch',width:5,backgroundColor:PALETTE.teal,transform:[{skewY:'-12deg'}]},clientIdentity:{flex:1,paddingHorizontal:13,paddingVertical:10},clientEyebrow:{color:'#879099',fontSize:7.8,fontWeight:'900',letterSpacing:1.2},clientName:{marginTop:2,color:PALETTE.ink,fontSize:14,fontWeight:'900'},clientCode:{marginTop:2,color:PALETTE.muted,fontSize:10.5},rowDelete:{width:38,height:42,alignItems:'center',justifyContent:'center'},rowDeleteText:{color:PALETTE.red,fontSize:19},rowChevron:{width:30,color:PALETTE.ink,fontSize:23,fontWeight:'400'},
  empty:{minHeight:130,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:PALETTE.line,backgroundColor:'rgba(255,253,248,0.97)',padding:18},emptyTitle:{color:PALETTE.ink,fontSize:14,fontWeight:'900'},emptyText:{marginTop:5,color:PALETTE.muted,fontSize:11.5,textAlign:'center',lineHeight:17},footerSpace:{minHeight:138,paddingTop:22,alignItems:'center'},footerHint:{color:'#8A9298',fontSize:9.5,textAlign:'center',maxWidth:280,letterSpacing:0.2},
  modalOverlay:{flex:1,backgroundColor:'rgba(20,32,44,0.52)',alignItems:'center',justifyContent:'center',padding:22},modalSheet:{width:'100%',maxWidth:430,backgroundColor:PALETTE.surface,borderWidth:1,borderColor:'#C9CFD1',padding:18},modalKicker:{color:PALETTE.orange,fontSize:8.5,fontWeight:'900',letterSpacing:1.6},modalTitle:{marginTop:3,marginBottom:15,color:PALETTE.ink,fontSize:23,fontWeight:'900'},modalInput:{minHeight:49,marginBottom:9,borderWidth:1,borderColor:PALETTE.line,backgroundColor:'#F7F6F1',paddingHorizontal:12,color:PALETTE.ink,fontSize:14},modalActions:{flexDirection:'row',gap:8,marginTop:12},modalCancel:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:PALETTE.line},modalCancelText:{color:PALETTE.ink,fontSize:12.5,fontWeight:'900'},modalConfirm:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',backgroundColor:PALETTE.orange},modalConfirmText:{color:'#FFFFFF',fontSize:12.5,fontWeight:'900'},importRow:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:PALETTE.line},importName:{color:PALETTE.ink,fontSize:12,fontWeight:'900'},importSite:{marginTop:2,color:PALETTE.muted,fontSize:10.5},
});