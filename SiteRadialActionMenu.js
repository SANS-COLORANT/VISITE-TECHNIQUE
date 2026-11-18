/**
 * Site actions in the same warm and neutral METRA design language as client
 * and visit sheets. Accessible touch targets, no dark neon radial overlay.
 */
import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';

const ACTIONS = Object.freeze([
  { key:'rename', label:'Renommer', hint:'Modifier le nom dans METRA', icon:'edit' },
  { key:'duplicate', label:'Dupliquer', hint:'Copier le site et ses visites', icon:'copy' },
  { key:'delete', label:'Supprimer', hint:'Choisir METRA ou METRA + Intranet', icon:'trash', danger:true },
]);

export function SiteRadialActionMenu({ menu, onAction, onClose }) {
  return <Modal visible={!!menu} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <Pressable accessibilityLabel="Fermer les actions du site" onPress={onClose}
        style={{position:'absolute',left:0,right:0,top:0,bottom:0}} />
      <View style={[styles.modalSheet,{maxWidth:430,paddingHorizontal:16,paddingTop:18,paddingBottom:16}]}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
          <View style={{flex:1}}>
            <Text style={{fontFamily:FONTS.black,fontSize:17,color:COLORS.ink}}>Actions du site</Text>
            <Text numberOfLines={2} style={{fontFamily:FONTS.bodyMedium,fontSize:12,color:COLORS.inkSoft,marginTop:3}}>
              {menu?.site?.nom_site || 'Site'}
            </Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer le menu"
            onPress={onClose} style={{minWidth:44,minHeight:44,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.orangeLight}}>
            <CvcIcon name="close" size={20} color={COLORS.orangeDark} />
          </TouchableOpacity>
        </View>
        {ACTIONS.map(action=><TouchableOpacity key={action.key}
          accessibilityRole="button" accessibilityLabel={action.label}
          activeOpacity={0.75} onPress={()=>onAction?.(action.key,menu?.site)}
          style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:63,paddingVertical:9,
            paddingHorizontal:11,marginTop:8,borderRadius:16,borderWidth:1,
            borderColor:action.danger?'rgba(186,44,44,0.18)':'rgba(22,21,15,0.09)',
            backgroundColor:action.danger?COLORS.redBg:'rgba(255,255,255,0.88)'}}>
          <View style={{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center',
            backgroundColor:action.danger?'rgba(186,44,44,0.10)':COLORS.orangeLight}}>
            <CvcIcon name={action.icon} size={19} color={action.danger?COLORS.red:COLORS.orangeDark} />
          </View>
          <View style={{flex:1}}>
            <Text style={{fontFamily:FONTS.bodyBold,fontSize:14,color:action.danger?COLORS.red:COLORS.ink}}>{action.label}</Text>
            <Text style={{fontFamily:FONTS.bodyMedium,fontSize:11.5,color:COLORS.inkSoft,marginTop:2}}>{action.hint}</Text>
          </View>
          <CvcIcon name="chevron-right" size={16} color={COLORS.inkSoft} />
        </TouchableOpacity>)}
      </View>
    </View>
  </Modal>;
}
