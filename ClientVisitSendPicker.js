/** Offline-ready selection of the latest unposted visits per client/site/local.
 * Pure presentation. Only explicitly selected visit IDs reach the sender.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { formatTransferBytes } from './intranetTransferVolume.js';

export function ClientVisitSendPicker({ visible, visits = [], busy = false, progress = null, volume = null, clientName, onCancel, onSend, binding = null, onBind = null, onResolveLocal = null, onBackFromBinding = null }) {
  const [selected,setSelected]=useState(()=>new Set());
  useEffect(()=>{
    if(visible) setSelected(new Set(visits.map(v=>String(v.id))));
  },[visible]);
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
  const unlinkedSelected=visits.filter(v=>selected.has(String(v.id))&&Number(v.needs_binding)===1);
  const readySelected=[...selected].filter(id=>!unlinkedSelected.some(v=>String(v.id)===id));
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
  if(binding) {
    const opts=binding.options;
    const visit=binding.visit;
    const available=(opts?.locals||[]).filter(l=>l.compatible);
    const installationId=String(opts?.visite?.installation_id||'');
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onBackFromBinding||onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet,{maxHeight:'93%',width:'100%'}]}>
          <Text style={styles.modalTitle}>Associer un local Intranet</Text>
          <Text style={{fontSize:12.5,color:COLORS.inkSoft,marginTop:7,marginBottom:8,lineHeight:19}}>
            {visit?.nom_site||'Site'} · {visit?.nom_local||'Local non rattaché'} · {visit?.trame_id||'Trame'}
          </Text>
          <Text style={{fontSize:11.5,color:COLORS.inkSoft,marginBottom:10,lineHeight:17}}>
            Choisis le local physique exact. Aucune correspondance par nom n'est appliquée automatiquement. Les visites et photos anciennes restent rattachées à leur origine.
          </Text>
          {binding.loading ? <Text style={{color:COLORS.orangeDark,paddingVertical:15}}>Vérification des identifiants Intranet…</Text> : null}
          {!binding.loading && !opts?.selectedSiteId ? <Text style={{color:COLORS.orangeDark,paddingVertical:12}}>
            Site Intranet non résolu : réimporte le client avant d'associer ce local.
          </Text> : null}
          <ScrollView style={{flexGrow:0,flexShrink:1}} contentContainerStyle={{paddingBottom:14}}>
            {available.map(local=>{
              const taken=!!(installationId && local.local_installation_id &&
                String(local.local_installation_id)!==installationId);
              return <TouchableOpacity key={String(local.remote_local_id)}
                accessibilityRole="button"
                accessibilityLabel={`Associer au local ${local.designation||local.remote_local_id} numéro ${local.remote_local_id}`}
                disabled={binding.loading||taken}
                onPress={()=>onResolveLocal?.(local)}
                style={{borderWidth:1,borderColor:COLORS.line,borderRadius:14,
                  padding:12,marginBottom:9,opacity:taken?0.5:1,backgroundColor:'#FFFFFF'}}>
                <Text style={{fontFamily:FONTS.bold,color:COLORS.ink,fontSize:13}}>
                  {local.designation||'Local technique'} · ID {local.remote_local_id}
                </Text>
                <Text style={{color:COLORS.inkSoft,fontSize:11.5,marginTop:4}}>
                  {taken?'Déjà lié à une autre installation — indisponible':(local.remote_trame_nom||'Trame compatible')}
                </Text>
              </TouchableOpacity>;
            })}
            {!binding.loading && available.length===0 ? <Text style={{color:COLORS.orangeDark}}>
              Aucun local compatible disponible. Actualise le client Intranet et vérifie la trame.
            </Text> : null}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" disabled={binding.loading} onPress={onBackFromBinding||onCancel}
            style={[styles.btnSecondary,{alignItems:'center',marginTop:5}]}>
            <Text style={styles.btnSecondaryText}>Retour à la sélection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>;
  }
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet,{maxHeight:'93%',width:'100%'}]}>
        <Text style={styles.modalTitle}>Envoyer les dernières visites</Text>
        <Text style={{fontSize:12,color:COLORS.inkSoft,marginTop:4,marginBottom:14,lineHeight:18}}>
          {clientName||'Client'} · {selected.size}/{visits.length} visite(s) sélectionnée(s).
          Seule la dernière visite non envoyée de chaque local et de chaque trame est proposée.
        </Text>
        {unlinkedSelected.length ? <Text style={{fontFamily:FONTS.bodyBold,color:COLORS.orangeDark,fontSize:12,marginBottom:10,lineHeight:18}}>
          {unlinkedSelected.length} visite(s) sélectionnée(s) nécessitent un rattachement Intranet explicite. Les autres peuvent être envoyées sans attendre.
        </Text> : null}
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
                return <View key={String(visit.id)}>
                <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:selectedVisit}}
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
                </TouchableOpacity>
                {Number(visit.needs_binding)===1 ? <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Rattacher le local Intranet de ${visit.nom_local||visit.nom_site}`}
                  disabled={busy}
                  onPress={()=>onBind?.(visit)}
                  style={{alignSelf:'flex-end',marginTop:2,marginBottom:5,borderRadius:14,
                    paddingHorizontal:13,paddingVertical:8,backgroundColor:COLORS.orangeLight,
                    borderWidth:1,borderColor:COLORS.orange}}>
                  <Text style={{fontSize:11.5,fontFamily:FONTS.bodyBold,color:COLORS.orangeDark}}>
                    Choisir le local Intranet
                  </Text>
                </TouchableOpacity> : null}
                </View>;
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
              {volume?.totalBytes > 0 ? volume.pourcentage : (progress.pourcentage||0)}%
            </Text>
          </View>
          <View style={{height:7,backgroundColor:'rgba(22,21,15,0.1)',borderRadius:10,overflow:'hidden',marginTop:10}}>
            <View style={{height:'100%',width:`${Math.max(0,Math.min(100,Number(volume?.totalBytes > 0 ? volume.pourcentage : progress.pourcentage||0)))}%`,backgroundColor:COLORS.orange,borderRadius:10}} />
          </View>
          <Text style={{fontSize:11.5,color:COLORS.inkSoft,marginTop:8}}>
            {progress.rang||0}/{progress.total||visits.length} traitée(s) · {progress.confirmees||0} confirmée(s) · {progress.enAttente||0} en attente · {progress.erreurs||0} erreur(s)
          </Text>
          {volume ? <Text style={{fontSize:11.5,color:COLORS.orangeDark,fontFamily:FONTS.bodyBold,marginTop:5}}>
            {formatTransferBytes(volume.confirmedBytes)} / {formatTransferBytes(volume.totalBytes)} confirmés · visites + photos{volume.incompleteEstimate ? ' (volume connu)' : ''}
          </Text> : null}
        </View> : null}
        <Text style={{color:COLORS.muted,fontSize:10.5,lineHeight:15,marginBottom:9}}>
          Les envois déjà mis en attente hors ligne continuent à être traités par la synchronisation automatique.
        </Text>
        <View style={{flexDirection:'row',gap:10}}>
          <TouchableOpacity accessibilityRole="button" onPress={onCancel} disabled={busy}
            style={[styles.btnSecondary,{flex:1}]}>
            <Text style={styles.btnSecondaryText}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy||readySelected.length===0}
            onPress={()=>onSend?.(readySelected)}
            style={[styles.btnPrimary,{flex:1.35,opacity:busy||!readySelected.length?0.45:1}]}>
            <CvcIcon name="cloud-sync" size={16} color={COLORS.white}/>
            <Text style={styles.btnPrimaryText}>{busy?'Envoi…':`Envoyer ${readySelected.length}`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}
