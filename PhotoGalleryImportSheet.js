/** Renaming step shared by all technical-visit photo entry points. */
import React, { useEffect, useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './VisitKit.js';
import { COLORS, FONTS } from './styles.js';
import { nettoyerTitrePhotoGalerie, titrePhotoGalerie } from './photoGalleryImport.js';

export function PhotoGalleryImportSheet({ asset, contextLabel='Photo', busy=false, onCancel, onConfirm }) {
  const [titre,setTitre] = useState('');
  useEffect(()=>{
    if(asset?.uri) setTitre(titrePhotoGalerie(asset,contextLabel));
  },[asset?.uri,contextLabel]);
  const valid = Boolean(titre.trim() && !titre.includes('||'));
  return <BottomSheet visible={!!asset} onClose={()=>{if(!busy)onCancel?.();}}
    title="Photo depuis la galerie" subtitle="Nomme et optimise le cliché" maxHeight="82%">
    {asset?.uri ? <Image source={{uri:asset.uri}} resizeMode="contain"
      style={{height:160,width:'100%',backgroundColor:COLORS.orangeLight,borderRadius:14,marginBottom:14}}/> : null}
    <Text style={{fontFamily:FONTS.bodyBold,fontSize:13,color:COLORS.ink,marginBottom:5}}>Nom de la photo</Text>
    <TextInput accessibilityLabel="Nom de la photo importée"
      value={titre} onChangeText={setTitre} editable={!busy} maxLength={120}
      placeholder="Ex. CTA 1 · Filtration – État du filtre"
      style={{minHeight:48,borderWidth:1,borderColor:COLORS.line,borderRadius:12,
        paddingHorizontal:12,fontFamily:FONTS.bodyMedium,fontSize:15,color:COLORS.ink,backgroundColor:COLORS.white}}/>
    <Text style={{fontFamily:FONTS.bodyMedium,fontSize:12,color:COLORS.inkSoft,marginTop:9,lineHeight:17}}>
      La photo sera convertie en JPEG, redimensionnée sans déformation et limitée à environ 1,5 Mo avant enregistrement. Le nom sera conservé dans la visite et les futurs rapports.
    </Text>
    <View style={{flexDirection:'row',gap:9,marginTop:19,marginBottom:8}}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Annuler l'import photo"
        disabled={busy} onPress={onCancel}
        style={{flex:1,minHeight:49,borderRadius:12,borderWidth:1,borderColor:COLORS.line,alignItems:'center',justifyContent:'center'}}>
        <Text style={{fontFamily:FONTS.bodyBold,fontSize:13,color:COLORS.ink}}>Annuler</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Compresser et enregistrer la photo"
        disabled={busy||!valid} onPress={()=>onConfirm?.(nettoyerTitrePhotoGalerie(titre))}
        style={{flex:2,minHeight:49,borderRadius:12,backgroundColor:COLORS.orange,alignItems:'center',justifyContent:'center',opacity:busy||!valid?0.5:1}}>
        <Text style={{fontFamily:FONTS.bodyBold,fontSize:13,color:COLORS.white}}>
          {busy?'Compression…':'Enregistrer la photo'}
        </Text>
      </TouchableOpacity>
    </View>
  </BottomSheet>;
}
