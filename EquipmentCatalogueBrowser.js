import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BrandMark, getBrandColor, mixWithWhite } from './BrandLogo.js';
import { COLORS, styles } from './styles.js';
import {
  listerMarquesEquipement, listerCategoriesEquipement, rechercherModelesEquipement,
  listerVariantesEquipement, getFicheVarianteEquipement,
  ajouterMarqueEquipement, ajouterCategorieEquipement, ajouterModeleEquipement,
  ajouterVarianteEquipement, ajouterCaracteristiqueEquipement, ajouterCourbeEquipement, ajouterDocumentEquipement,
} from './db.js';

function Gradient({ marque }) {
  const base = getBrandColor(marque);
  return <View pointerEvents="none" style={{ position:'absolute', inset:0, flexDirection:'row', borderRadius:14, overflow:'hidden' }}>
    {Array.from({ length: 46 }, (_, i) => {
      const t=i/45; const e=Math.pow(Math.max(0,(t-.04)/.96),1.04);
      return <View key={i} style={{ flex:1, backgroundColor:mixWithWhite(base,Math.min(.99,e)) }} />;
    })}
  </View>;
}

function Header({ title, subtitle, onBack, action, onAction }) {
  return <View style={{ paddingHorizontal:18, paddingTop:14, paddingBottom:10 }}>
    <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
      {onBack ? <TouchableOpacity onPress={onBack} style={{ paddingVertical:8, paddingRight:4 }}><Text style={{ fontSize:22 }}>‹</Text></TouchableOpacity> : null}
      <View style={{ flex:1 }}><Text style={{ fontSize:22, fontWeight:'800', color:COLORS.text }}>{title}</Text>{subtitle ? <Text style={{ marginTop:2, color:COLORS.muted, fontSize:12 }}>{subtitle}</Text> : null}</View>
      {action ? <TouchableOpacity onPress={onAction} style={{ paddingHorizontal:12, paddingVertical:8, borderRadius:10, backgroundColor:COLORS.primary }}><Text style={{ color:'#fff', fontWeight:'700' }}>+ {action}</Text></TouchableOpacity> : null}
    </View>
  </View>;
}

function BrandCard({ brand, onPress, tablet }) {
  return <TouchableOpacity onPress={onPress} activeOpacity={.82} style={{ flex:tablet?1:undefined, minHeight:92, borderRadius:14, overflow:'hidden', marginBottom:12, borderWidth:1, borderColor:'rgba(0,0,0,.06)' }}>
    <Gradient marque={brand.nom}/>
    <View style={{ minHeight:92, flexDirection:'row', alignItems:'center', paddingHorizontal:16, gap:14 }}>
      <View style={{ width:108, alignItems:'center' }}><BrandMark marque={brand} onColor /></View>
      <View style={{ flex:1 }}><Text style={{ color:'#fff', fontWeight:'900', fontSize:17 }}>{brand.nom}</Text><Text style={{ color:'rgba(255,255,255,.88)', marginTop:3 }}>{brand.nb_modeles} modèle{brand.nb_modeles>1?'s':''}</Text></View>
      <Text style={{ fontSize:24, color:'rgba(50,50,50,.6)' }}>›</Text>
    </View>
  </TouchableOpacity>;
}

function ModelCard({ model, onPress, tablet }) {
  return <TouchableOpacity onPress={onPress} activeOpacity={.8} style={{ flex:tablet?1:undefined, backgroundColor:'#fff', borderRadius:14, padding:15, marginBottom:12, borderWidth:1, borderColor:'#E7E7EB' }}>
    <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
      <BrandMark marque={{ marque:model.marque, logo_uri:model.logo_uri }} compact />
      <View style={{ flex:1 }}><Text style={{ fontSize:16, fontWeight:'800', color:COLORS.text }}>{model.nom}</Text><Text style={{ marginTop:2, color:COLORS.muted, fontSize:12 }}>{model.categorie} · {model.marque}</Text>{model.caracteristiques?<Text numberOfLines={2} style={{ marginTop:5, color:'#555', fontSize:11 }}>{model.caracteristiques}</Text>:null}</View>
      <View style={{ alignItems:'flex-end' }}><Text style={{ fontWeight:'800', color:COLORS.primary }}>{model.nb_variantes||0}</Text><Text style={{ fontSize:10, color:COLORS.muted }}>réf.</Text></View>
    </View>
  </TouchableOpacity>;
}

function VariantCard({ item, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ backgroundColor:'#fff', borderRadius:14, padding:15, marginBottom:10, borderWidth:1, borderColor:'#E5E7EB' }}>
    <View style={{ flexDirection:'row', alignItems:'center' }}><View style={{ flex:1 }}><Text style={{ fontWeight:'800', fontSize:16 }}>{item.nom}</Text>{item.reference?<Text style={{ color:COLORS.muted, marginTop:2 }}>{item.reference}</Text>:null}{item.description?<Text style={{ color:'#555', fontSize:12, marginTop:5 }}>{item.description}</Text>:null}</View><Text style={{ fontSize:22, color:'#777' }}>›</Text></View>
  </TouchableOpacity>;
}

function CurvePreview({ curve }) {
  let points=[]; try { points=JSON.parse(curve.serie||'[]'); } catch {}
  const maxY=Math.max(1,...points.map(p=>Number(p.y)||0));
  return <View style={{ marginTop:8, backgroundColor:'#F7F8FA', borderRadius:12, padding:12 }}>
    <Text style={{ fontWeight:'700' }}>{curve.nom}</Text><Text style={{ fontSize:11, color:COLORS.muted }}>{curve.axe_y} ({curve.unite_y}) / {curve.axe_x} ({curve.unite_x})</Text>
    <View style={{ height:90, flexDirection:'row', alignItems:'flex-end', gap:4, marginTop:10, borderBottomWidth:1, borderBottomColor:'#CCC' }}>
      {points.map((p,i)=><View key={i} style={{ flex:1, alignItems:'center', justifyContent:'flex-end' }}><View style={{ width:'72%', height:`${Math.max(6,(Number(p.y)||0)/maxY*78)}%`, borderRadius:4, backgroundColor:COLORS.primary }}/><Text style={{ fontSize:8, color:'#666', marginTop:2 }}>{p.x}</Text></View>)}
    </View>
  </View>;
}

function SimpleModal({ visible, title, fields, onClose, onSave }) {
  const [values,setValues]=useState({});
  useEffect(()=>{if(visible)setValues({});},[visible]);
  return <Modal visible={visible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.modalTitle}>{title}</Text>{fields.map(f=><TextInput key={f.key} style={[styles.input,{ marginTop:10, minHeight:f.multiline?70:undefined, textAlignVertical:f.multiline?'top':undefined }]} placeholder={f.label} value={values[f.key]||''} onChangeText={v=>setValues(x=>({...x,[f.key]:v}))} multiline={!!f.multiline} keyboardType={f.numeric?'numeric':'default'} />)}<View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={()=>onSave(values)}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View></ScrollView></View></View></Modal>;
}

export function EquipmentCatalogueBrowser() {
  const { width }=useWindowDimensions(); const tablet=width>=700; const cols=tablet?2:1;
  const [tab,setTab]=useState('marques'); const [brands,setBrands]=useState([]); const [cats,setCats]=useState([]); const [models,setModels]=useState([]); const [search,setSearch]=useState('');
  const [brand,setBrand]=useState(null); const [model,setModel]=useState(null); const [variants,setVariants]=useState([]); const [variant,setVariant]=useState(null); const [sheet,setSheet]=useState(null); const [modal,setModal]=useState(null);
  const refresh=useCallback(async()=>{const [b,c,m]=await Promise.all([listerMarquesEquipement(),listerCategoriesEquipement(),rechercherModelesEquipement({recherche:search})]);setBrands(b);setCats(c);setModels(m);},[search]);
  useEffect(()=>{refresh();},[refresh]);

  const baseData=tab==='marques'?brands:tab==='categories'?cats:models;
  const filtered=useMemo(()=>baseData.filter(x=>!search.trim()||`${x.nom||''} ${x.marque||''} ${x.categorie||''}`.toLowerCase().includes(search.toLowerCase())),[baseData,search]);

  const openBrand=async b=>{setBrand(b);setModel(null);setVariant(null);setSheet(null);setModels(await rechercherModelesEquipement({marqueId:b.id}));};
  const openModel=async m=>{setModel(m);setVariant(null);setSheet(null);setVariants(await listerVariantesEquipement(m.id));};
  const openVariant=async v=>{setVariant(v);setSheet(await getFicheVarianteEquipement(v.id));};
  const back=()=>{if(sheet){setSheet(null);setVariant(null);}else if(model){setModel(null);setVariants([]);}else if(brand){setBrand(null);refresh();}};
  const saveModal=async v=>{try{
    if(modal==='brand'){if(!v.nom?.trim())return;await ajouterMarqueEquipement({nom:v.nom.trim(),logoUri:v.logo||null});}
    if(modal==='category'){if(!v.nom?.trim())return;await ajouterCategorieEquipement({nom:v.nom.trim(),icone:v.icone||'⚙️'});}
    if(modal==='model'){if(!v.nom?.trim()||!brand)return;const cat=cats.find(c=>c.nom.toLowerCase()===String(v.categorie||'').trim().toLowerCase())||cats[0];if(!cat){Alert.alert('Catégorie requise');return;}await ajouterModeleEquipement({categorieId:cat.id,marqueId:brand.id,nom:v.nom.trim(),reference:v.reference,caracteristiques:v.description,motsCles:`${brand.nom} ${v.nom}`});}
    if(modal==='variant'){if(!v.nom?.trim()||!model)return;await ajouterVarianteEquipement({modeleId:model.id,nom:v.nom.trim(),reference:v.reference,description:v.description});}
    if(modal==='spec'){if(!v.cle?.trim()||!sheet)return;await ajouterCaracteristiqueEquipement({varianteId:sheet.id,cle:v.cle.trim(),valeur:v.valeur,unite:v.unite});}
    if(modal==='curve'){if(!v.nom?.trim()||!sheet)return;let serie='[]';try{serie=JSON.stringify(String(v.points||'').split(';').filter(Boolean).map(x=>{const[a,b]=x.split(',');return{x:Number(a),y:Number(b)}}));}catch{}await ajouterCourbeEquipement({varianteId:sheet.id,nom:v.nom,axeX:v.axeX||'Débit',uniteX:v.uniteX||'m³/h',axeY:v.axeY||'HMT',uniteY:v.uniteY||'mCE',serie});}
    if(modal==='doc'){if(!v.nom?.trim()||!v.uri?.trim()||!sheet)return;await ajouterDocumentEquipement({varianteId:sheet.id,type:v.type||'Document',nom:v.nom,uri:v.uri});}
    setModal(null); await refresh(); if(brand)await openBrand(brand); if(model){setModel(model);setVariants(await listerVariantesEquipement(model.id));} if(sheet)setSheet(await getFicheVarianteEquipement(sheet.id));
  }catch(e){Alert.alert('Erreur',String(e.message||e));}};

  const title=sheet?sheet.nom:model?model.nom:brand?brand.nom:'Catalogue matériel';
  const subtitle=sheet?`${sheet.marque} · ${sheet.modele} · ${sheet.categorie}`:model?`${model.marque} · ${model.categorie}`:brand?'Modèles et gammes de la marque':'Base technique constructeur';
  const action=sheet?'Caractéristique':model?'Variante':brand?'Modèle':tab==='marques'?'Marque':tab==='categories'?'Catégorie':null;
  const actionPress=()=>setModal(sheet?'spec':model?'variant':brand?'model':tab==='marques'?'brand':tab==='categories'?'category':null);

  if(sheet) return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Caractéristique" onAction={actionPress}/><ScrollView contentContainerStyle={{padding:18,paddingTop:4}}>{sheet.description?<Text style={{fontSize:13,color:'#555',marginBottom:12}}>{sheet.description}</Text>:null}<Text style={{fontWeight:'800',fontSize:15,marginBottom:8}}>Caractéristiques</Text>{sheet.caracteristiques?.length?sheet.caracteristiques.map(s=><View key={s.id} style={{flexDirection:'row',paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#EEE'}}><Text style={{flex:1,color:'#555'}}>{s.cle}</Text><Text style={{fontWeight:'700'}}>{s.valeur} {s.unite||''}</Text></View>):<Text style={{color:COLORS.muted}}>Aucune caractéristique.</Text>}<View style={{flexDirection:'row',alignItems:'center',marginTop:22}}><Text style={{fontWeight:'800',fontSize:15,flex:1}}>Courbes</Text><TouchableOpacity onPress={()=>setModal('curve')}><Text style={{color:COLORS.primary,fontWeight:'700'}}>+ Ajouter</Text></TouchableOpacity></View>{sheet.courbes?.map(c=><CurvePreview key={c.id} curve={c}/>)}<View style={{flexDirection:'row',alignItems:'center',marginTop:22}}><Text style={{fontWeight:'800',fontSize:15,flex:1}}>Documents</Text><TouchableOpacity onPress={()=>setModal('doc')}><Text style={{color:COLORS.primary,fontWeight:'700'}}>+ Ajouter</Text></TouchableOpacity></View>{sheet.documents?.length?sheet.documents.map(d=><View key={d.id} style={{padding:12,backgroundColor:'#fff',borderRadius:10,marginTop:8,borderWidth:1,borderColor:'#EEE'}}><Text style={{fontWeight:'700'}}>📄 {d.nom}</Text><Text style={{fontSize:11,color:COLORS.muted}}>{d.type}</Text></View>):<Text style={{color:COLORS.muted,marginTop:8}}>Aucun document.</Text>}</ScrollView><SimpleModal visible={!!modal} title={modal==='spec'?'Nouvelle caractéristique':modal==='curve'?'Nouvelle courbe':'Nouveau document'} fields={modal==='spec'?[{key:'cle',label:'Caractéristique'},{key:'valeur',label:'Valeur'},{key:'unite',label:'Unité'}]:modal==='curve'?[{key:'nom',label:'Nom de la courbe'},{key:'axeX',label:'Axe X (ex: Débit)'},{key:'uniteX',label:'Unité X'},{key:'axeY',label:'Axe Y (ex: HMT)'},{key:'uniteY',label:'Unité Y'},{key:'points',label:'Points : x,y;x,y;…',multiline:true}]:[{key:'type',label:'Type (Notice, Fiche technique...)'},{key:'nom',label:'Nom'},{key:'uri',label:'URL'}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  if(model) return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Variante" onAction={actionPress}/><FlatList contentContainerStyle={{padding:18,paddingTop:4}} data={variants} keyExtractor={x=>x.id} renderItem={({item})=><VariantCard item={item} onPress={()=>openVariant(item)}/>} ListEmptyComponent={<View style={{padding:28,alignItems:'center'}}><Text style={{fontWeight:'700'}}>Aucune variante</Text><Text style={{color:COLORS.muted,marginTop:5,textAlign:'center'}}>Ajoute les puissances, tailles ou références de ce modèle.</Text></View>}/><SimpleModal visible={modal==='variant'} title="Nouvelle variante / référence" fields={[{key:'nom',label:'Nom (ex : Varfree EVO 250)'},{key:'reference',label:'Référence constructeur'},{key:'description',label:'Description',multiline:true}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  if(brand) return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Modèle" onAction={actionPress}/><FlatList key={`brand-${cols}`} numColumns={cols} columnWrapperStyle={cols>1?{gap:12}:undefined} contentContainerStyle={{padding:18,paddingTop:4}} data={models} keyExtractor={x=>x.id} renderItem={({item})=><ModelCard model={item} tablet={tablet} onPress={()=>openModel(item)}/>} ListEmptyComponent={<Text style={{padding:24,color:COLORS.muted}}>Aucun modèle pour cette marque.</Text>}/><SimpleModal visible={modal==='model'} title={`Ajouter un modèle · ${brand.nom}`} fields={[{key:'nom',label:'Nom du modèle / gamme'},{key:'categorie',label:`Catégorie (ex : ${cats[0]?.nom||'Pompe'})`},{key:'reference',label:'Référence facultative'},{key:'description',label:'Description',multiline:true}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  return <View style={{flex:1}}><Header title="Catalogue matériel" subtitle={`${brands.length} marques · ${models.length} modèles · ${cats.length} catégories`} action={action} onAction={actionPress}/><View style={styles.catalogueSearchBox}><TextInput style={styles.catalogueSearchInput} placeholder="Rechercher une marque, un modèle…" value={search} onChangeText={setSearch}/></View><View style={styles.catalogueTabs}>{[['marques','Marques'],['modeles','Modèles'],['categories','Catégories']].map(([id,l])=><TouchableOpacity key={id} style={[styles.catalogueTab,tab===id&&styles.catalogueTabActive]} onPress={()=>setTab(id)}><Text style={[styles.catalogueTabText,tab===id&&styles.catalogueTabTextActive]}>{l}</Text></TouchableOpacity>)}</View><FlatList key={`${tab}-${cols}`} numColumns={tab==='categories'?1:cols} columnWrapperStyle={tab!=='categories'&&cols>1?{gap:12}:undefined} contentContainerStyle={{padding:18}} data={filtered} keyExtractor={x=>x.id} renderItem={({item})=>tab==='marques'?<BrandCard brand={item} tablet={tablet} onPress={()=>openBrand(item)}/>:tab==='modeles'?<ModelCard model={item} tablet={tablet} onPress={()=>openModel(item)}/>:<TouchableOpacity style={styles.catalogueCard} onPress={()=>{setTab('modeles');setModels(models.filter(m=>m.categorie_id===item.id));}}><Text style={styles.equipmentIcon}>{item.icone||'⚙️'}</Text><View style={{flex:1}}><Text style={styles.cardTitle}>{item.nom}</Text><Text style={styles.cardSub}>{item.nb_modeles} modèles</Text></View><Text>›</Text></TouchableOpacity>}/><SimpleModal visible={modal==='brand'||modal==='category'} title={modal==='brand'?'Nouvelle marque':'Nouvelle catégorie'} fields={modal==='brand'?[{key:'nom',label:'Nom de la marque'},{key:'logo',label:'URL du logo (facultatif)'}]:[{key:'nom',label:'Nom de la catégorie'},{key:'icone',label:'Icône'}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;
}
