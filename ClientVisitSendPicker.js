/** Offline-ready selection of the latest unposted visits per client/site/local.
 * Pure presentation. Only explicitly selected visit IDs reach the sender.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';

export function ClientVisitSendPicker({ visible, visits = [], busy = false, progress = null, clientName, onCancel, onSend }) {
  const [selected,setSelected]=useState(()=>new Set());
  useEffect(()=>{
    if(visible) setSelected(new Set(visits.map(v=>String(v.id))));
  },[visible,visits]);
  const groups=useMemo(()=>{
    const bySite=new Map();
    for(const visit of visits){
      const key=String(visit.site_id||'');
      if(!bySite.has(key))bySite.set(key,{
        id:key,name:visit.nom_site||'Site sans nom',visits:[]});
      bySite.get(key).visits.push(visit);
    }
    return [...bySite.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  },[visits]);
  const allSelected=visits.length>0&&selected.size===visits.length;
  const toggle=(ids)=>{
    setSelected(previous=>{
      const next=new Set(previous), keys=ids.map(String);
      const all=keys.every(id=>next.has(id));
      for(const id of keys)all?next.delete(id):next.add(id);
      return next;
    });
  };
  const chip=(checked,partial=false)=><View style={{
    width:23,height:23,borderRadius:7,borderWidth:1.5,
    alignItems:'center',justifyContent:'center',flexShrink:0,
    borderColor:checked?COLORS.orange:COLORS.line,
    backgroundColor:checked?COLORS.orange:'#FFFFFF'}}>
    <Text style={{color:checked?COLORS.white:COLORS.inkSoft,fontSize:13,fontFamily:FONTS.black}}>
      {checked?'✓':partial?'–':''}
    </Text>
  </View>;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet,{maxHeight:'93%',width:'100%'}]}>
        <Text style={styles.modalTitle}>Envoyer les dernières visites</Text>
        <Text style={{fontSize:12,color:COLORS.inkSoft,marginTop:4,marginBottom:14,lineHeight:18}}>
          {clientName||'Client'} · {selected.size}/{visits.length} visite(s) sélectionnée(s).
          Seule la dernière visite non envoyée de chaque local et de chaque trame est proposée.
        </Text>
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel={allSelected?'Tout désélectionner':'Tout sélectionner'}
          disabled={busy || !visits.length}
          onPress={()=>setSelected(allSelected?new Set():new Set(visits.map(v=>String(v.id))))}
          style={{alignSelf:'flex-start',borderWidth:1,borderColor:COLORS.orange,
            backgroundColor:COLORS.orangeLight,borderRadius:16,paddingVertical:10,paddingHorizontal:14,marginBottom:12}}>
          <Text style={{color:COLORS.orangeDark,fontFamily:FONTS.bodyBold,fontSize:12.5}}>
            {allSelected?'Tout désélectionner':'Tout sélectionner'}
          </Text>
        </TouchableOpacity>
        <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0,flexShrink:1}}
          contentContainerStyle={{paddingBottom:12}}>
          {groups.map(site=>{
            const ids=site.visits.map(v=>String(v.id));
            const chosen=ids.filter(id=>selected.has(id)).length;
            return <View key={site.id} style={{borderWidth:1,borderColor:'rgba(22,21,15,0.1)',
              borderRadius:17,backgroundColor:'#FDFCFA',padding:11,marginBottom:10}}>
              <TouchableOpacity accessibilityRole="checkbox"
                accessibilityState={{checked:chosen===ids.length}}
                accessibilityLabel={`Site ${site.name}, ${chosen} sur ${ids.length} visites`}
                disabled={busy} onPress={()=>toggle(ids)}
                style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:41}}>
                {chip(chosen===ids.length,chosen>0)}
                <Text numberOfLines={2} style={{flex:1,minWidth:0,fontSize:14,
                  color:COLORS.ink,fontFamily:FONTS.bold}}>{site.name}</Text>
                <Text style={{fontSize:11,color:COLORS.inkSoft}}>{chosen}/{ids.length}</Text>
              </TouchableOpacity>
              {site.visits.map(visit=>{
                const selectedVisit=selected.has(String(visit.id));
                return <TouchableOpacity key={String(visit.id)}
                  accessibilityRole="checkbox" accessibilityState={{checked:selectedVisit}}
                  accessibilityLabel={`Local ${visit.nom_local||'sans nom'} — ${visit.trame_nom||visit.trame_id||'trame'}`}
                  disabled={busy} onPress={()=>toggle([visit.id])}
                  style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,
                    paddingHorizontal:8,borderTopWidth:1,borderTopColor:'rgba(22,21,15,0.07)'}}>
                  {chip(selectedVisit)}
                  <View style={{flex:1,minWidth:0}}>
                    <Text numberOfLines={2} style={{fontFamily:FONTS.bodyBold,color:COLORS.ink,fontSize:13}}>
                      {visit.nom_local||'Local technique'}
                    </Text>
                    <Text numberOfLines={2} style={{fontSize:11,color:COLORS.inkSoft,marginTop:3}}>
                      {visit.trame_nom||visit.trame_id||'Trame'} · {visit.date_visite||'Date inconnue'}
                    </Text>
                  </View>
                </TouchableOpacity>;
              })}
            </View>;
          })}
        </ScrollView>
        {busy && progress ? <View accessibilityLiveRegion="polite" style={{borderWidth:1,borderColor:'rgba(22,21,15,0.09)',backgroundColor:COLORS.orangeLight,borderRadius:15,padding:12,marginBottom:12}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <Text style={{color:COLORS.ink,fontFamily:FONTS.bold,fontSize:13,flex:1}} numberOfLines={1}>
              {progress.phase||'Envoi en cours'} · {progress.nom||clientName||'Client'}
            </Text>
            <Text style={{color:COLORS.orangeDark,fontFamily:FONTS.black,fontSize:13}}>
              {progress.pourcentage||0}%
            </Text>
          </View>
          <View style={{height:7,backgroundColor:'rgba(22,21,15,0.1)',borderRadius:10,overflow:'hidden',marginTop:10}}>
            <View style={{height:'100%',width:`${Math.max(0,Math.min(100,Number(progress.pourcentage||0)))}%`,backgroundColor:COLORS.orange,borderRadius:10}} />
          </View>
          <Text style={{fontSize:11.5,color:COLORS.inkSoft,marginTop:8}}>
            {progress.rang||0}/{progress.total||visits.length} traitée(s) · {progress.confirmees||0} confirmée(s) · {progress.enAttente||0} en attente · {progress.erreurs||0} erreur(s)
          </Text>
        </View> : null}
        <Text style={{color:COLORS.muted,fontSize:10.5,lineHeight:15,marginBottom:9}}>
          Les envois déjà mis en attente hors ligne continuent à être traités par la synchronisation automatique.
        </Text>
        <View style={{flexDirection:'row',gap:10}}>
          <TouchableOpacity accessibilityRole="button" onPress={onCancel} disabled={busy}
            style={[styles.btnSecondary,{flex:1}]}>
            <Text style={styles.btnSecondaryText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy||selected.size===0}
            onPress={()=>onSend?.([...selected])}
            style={[styles.btnPrimary,{flex:1.35,opacity:busy||!selected.size?0.45:1}]}>
            <CvcIcon name="cloud-sync" size={16} color={COLORS.white}/>
            <Text style={styles.btnPrimaryText}>{busy?'Envoi…':`Envoyer ${selected.size}`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}
