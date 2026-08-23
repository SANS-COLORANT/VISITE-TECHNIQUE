import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandMark, getBrandColor } from './BrandLogo.js';
import { COLORS, styles } from './styles.js';
import {
  listerMarquesEquipement, listerCategoriesEquipement,
  listerVariantesEquipement, getFicheVarianteEquipement,
  ajouterMarqueEquipement, ajouterCategorieEquipement, ajouterModeleEquipement,
  ajouterVarianteEquipement, ajouterCaracteristiqueEquipement, ajouterCourbeEquipement, ajouterDocumentEquipement,
} from './db.js';
import { rechercherCatalogueIntelligent, enregistrerOuvertureModele, getFamilyPriorityKeys } from './catalogueAdvancedDb.js';

function Gradient({ marque }) {
  const base = getBrandColor(marque);
  return <LinearGradient
    pointerEvents="none"
    colors={[base, base, `${base}E8`, `${base}A8`, `${base}62`, '#FFFFFF']}
    locations={[0, 0.18, 0.34, 0.56, 0.78, 1]}
    start={{x:0,y:0.5}}
    end={{x:1,y:0.5}}
    style={{position:'absolute',left:0,right:0,top:0,bottom:0,borderRadius:14}}
  />;
}

function Header({ title, subtitle, onBack, action, onAction }) {
  return <View style={{paddingHorizontal:18,paddingTop:14,paddingBottom:10}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}>
    {onBack?<TouchableOpacity onPress={onBack} style={{paddingVertical:8,paddingRight:4}}><Text style={{fontSize:22}}>‹</Text></TouchableOpacity>:null}
    <View style={{flex:1}}><Text style={{fontSize:22,fontWeight:'800',color:COLORS.text}}>{title}</Text>{subtitle?<Text style={{marginTop:2,color:COLORS.muted,fontSize:12}}>{subtitle}</Text>:null}</View>
    {action?<TouchableOpacity onPress={onAction} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:COLORS.primary}}><Text style={{color:'#fff',fontWeight:'700'}}>+ {action}</Text></TouchableOpacity>:null}
  </View></View>;
}

function ProductImage({ uri, brand, logoUri, size=72, hero=false }) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[uri]);
  const box=hero?{width:'100%',height:220}:{width:size,height:size};
  if(uri&&!failed) return <View style={[box,{borderRadius:14,backgroundColor:'#fff',overflow:'hidden',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#ECEEF1'}]}>
    <Image source={{uri}} resizeMode="contain" onError={()=>setFailed(true)} style={hero?{width:'92%',height:'92%'}:{width:'88%',height:'88%'}}/>
  </View>;
  return <View style={[box,{borderRadius:14,backgroundColor:'#F7F8FA',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#ECEEF1'}]}>
    <BrandMark marque={{marque:brand,logo_uri:logoUri}} compact={!hero}/>
  </View>;
}

function QualityBadge({ quality, verifiedAt }) {
  if(!quality)return null;
  const verified=String(quality).startsWith('verified');
  const range=quality==='verified_range';
  return <View style={{alignSelf:'flex-start',marginTop:5,paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:verified?'#EAF7EF':'#F2F3F5'}}>
    <Text style={{fontSize:9,fontWeight:'700',color:verified?'#287A45':'#6B7280'}}>{verified?(range?'✓ Gamme constructeur vérifiée':'✓ Données constructeur vérifiées'):'Catalogue'}{verifiedAt?` · ${verifiedAt}`:''}</Text>
  </View>;
}

function InfoPill({ icon, value, label }) {
  return <View style={{minWidth:92,flex:1,padding:10,borderRadius:12,backgroundColor:'#F7F8FA',borderWidth:1,borderColor:'#ECEEF1'}}>
    <Text style={{fontSize:16}}>{icon}</Text><Text style={{fontWeight:'900',fontSize:16,color:COLORS.text,marginTop:3}}>{value}</Text><Text style={{fontSize:10,color:COLORS.muted,marginTop:1}}>{label}</Text>
  </View>;
}

function familyPriority(categorie='') { return getFamilyPriorityKeys(categorie)||[]; }
function orderSpecs(specs=[], categorie='') {
  const priority=familyPriority(categorie);
  if(!priority.length)return [...specs].sort((a,b)=>(a.ordre||0)-(b.ordre||0));
  return [...specs].sort((a,b)=>{
    const ak=String(a.cle||'').toLowerCase(),bk=String(b.cle||'').toLowerCase();
    const ai=priority.findIndex(k=>ak.includes(String(k).toLowerCase()));
    const bi=priority.findIndex(k=>bk.includes(String(k).toLowerCase()));
    return (ai<0?999:ai)-(bi<0?999:bi)||(a.ordre||0)-(b.ordre||0);
  });
}

function SpecHighlights({ specs=[], categorie='', max=6 }) {
  const selected=orderSpecs(specs,categorie).slice(0,max);
  if(!selected.length)return null;
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10}}>{selected.map(s=><View key={s.id||`${s.cle}-${s.valeur}`} style={{minWidth:'31%',flexGrow:1,paddingHorizontal:10,paddingVertical:9,borderRadius:10,backgroundColor:'#F7F8FA',borderWidth:1,borderColor:'#ECEEF1'}}><Text numberOfLines={1} style={{fontSize:9,color:COLORS.muted}}>{s.cle}</Text><Text numberOfLines={2} style={{fontSize:13,fontWeight:'800',color:COLORS.text,marginTop:2}}>{s.valeur}{s.unite?` ${s.unite}`:''}</Text></View>)}</View>;
}

function DocumentCard({ doc }) {
  const meta=[doc.type,doc.langue,doc.version,doc.date_document].filter(Boolean).join(' · ');
  const canOpen=!!doc.uri;
  return <TouchableOpacity disabled={!canOpen} onPress={()=>canOpen&&Linking.openURL(doc.uri).catch(()=>{})} style={{padding:12,backgroundColor:'#fff',borderRadius:10,marginTop:8,borderWidth:1,borderColor:'#EEE',flexDirection:'row',alignItems:'center',gap:10}}>
    <Text style={{fontSize:20}}>📄</Text><View style={{flex:1}}><Text style={{fontWeight:'700'}}>{doc.nom}</Text>{meta?<Text style={{fontSize:11,color:COLORS.muted,marginTop:2}}>{meta}</Text>:null}</View>{canOpen?<Text style={{color:COLORS.primary,fontSize:18}}>↗</Text>:null}
  </TouchableOpacity>;
}

function BrandCard({ brand, onPress, tablet }) {
  return <TouchableOpacity onPress={onPress} activeOpacity={.82} style={{flex:tablet?1:undefined,minHeight:92,borderRadius:14,overflow:'hidden',marginBottom:12,borderWidth:1,borderColor:'rgba(0,0,0,.06)',backgroundColor:'#fff'}}>
    <Gradient marque={brand.nom}/>
    <View style={{minHeight:92,flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:14}}>
      <View style={{width:108,alignItems:'center'}}><BrandMark marque={brand} onColor/></View>
      <View style={{flex:1}}><Text style={{color:'#fff',fontWeight:'900',fontSize:17}}>{brand.nom}</Text><Text style={{color:'rgba(255,255,255,.88)',marginTop:3}}>{brand.nb_modeles} modèle{brand.nb_modeles>1?'s':''}</Text></View>
      <Text style={{fontSize:24,color:'rgba(50,50,50,.6)'}}>›</Text>
    </View>
  </TouchableOpacity>;
}

function ModelCard({ model, onPress, tablet }) {
  return <TouchableOpacity onPress={onPress} activeOpacity={.8} style={{flex:tablet?1:undefined,backgroundColor:'#fff',borderRadius:14,padding:12,marginBottom:12,borderWidth:1,borderColor:'#E7E7EB'}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
      <ProductImage uri={model.image_uri} brand={model.marque} logoUri={model.logo_uri} size={78}/>
      <View style={{flex:1}}><Text style={{fontSize:16,fontWeight:'800',color:COLORS.text}}>{model.nom}</Text><Text style={{marginTop:2,color:COLORS.muted,fontSize:12}}>{model.categorie} · {model.marque}</Text>{model.caracteristiques?<Text numberOfLines={2} style={{marginTop:5,color:'#555',fontSize:11}}>{model.caracteristiques}</Text>:null}<QualityBadge quality={model.data_quality} verifiedAt={model.verified_at}/></View>
      <View style={{alignItems:'flex-end'}}><Text style={{fontWeight:'800',color:COLORS.primary}}>{model.nb_variantes||0}</Text><Text style={{fontSize:10,color:COLORS.muted}}>réf.</Text></View>
    </View>
  </TouchableOpacity>;
}

function VariantCard({ item, model, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{backgroundColor:'#fff',borderRadius:14,padding:12,marginBottom:10,borderWidth:1,borderColor:'#E5E7EB'}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
      <ProductImage uri={item.image_uri||model?.image_uri} brand={model?.marque} logoUri={model?.logo_uri} size={66}/>
      <View style={{flex:1}}><Text style={{fontWeight:'800',fontSize:16}}>{item.nom}</Text>{item.reference?<Text style={{color:COLORS.muted,marginTop:2}}>Réf. {item.reference}</Text>:null}{item.description?<Text numberOfLines={2} style={{color:'#555',fontSize:12,marginTop:5}}>{item.description}</Text>:null}<QualityBadge quality={item.data_quality} verifiedAt={item.verified_at}/></View>
      <Text style={{fontSize:22,color:'#777'}}>›</Text>
    </View>
  </TouchableOpacity>;
}

function ModelOverview({ model, preview, variants }) {
  const specs=preview?.caracteristiques||[];
  return <View style={{marginBottom:18}}>
    <ProductImage hero uri={model.image_uri||preview?.image_uri} brand={model.marque} logoUri={model.logo_uri}/>
    <View style={{marginTop:12,flexDirection:'row',alignItems:'flex-start',gap:12}}><View style={{flex:1}}><Text style={{fontSize:21,fontWeight:'900',color:COLORS.text}}>{model.nom}</Text><Text style={{fontSize:12,color:COLORS.muted,marginTop:2}}>{model.marque} · {model.categorie}{model.reference?` · ${model.reference}`:''}</Text><QualityBadge quality={model.data_quality||preview?.data_quality} verifiedAt={model.verified_at||preview?.verified_at}/></View><BrandMark marque={{marque:model.marque,logo_uri:model.logo_uri}} compact/></View>
    {model.caracteristiques?<Text style={{fontSize:13,color:'#555',lineHeight:19,marginTop:12}}>{model.caracteristiques}</Text>:preview?.description?<Text style={{fontSize:13,color:'#555',lineHeight:19,marginTop:12}}>{preview.description}</Text>:null}
    <View style={{flexDirection:'row',gap:8,marginTop:14}}><InfoPill icon="🏷️" value={variants.length} label="références"/><InfoPill icon="📄" value={preview?.documents?.length||0} label="documents"/><InfoPill icon="📈" value={preview?.courbes?.length||0} label="courbes"/></View>
    {specs.length?<><Text style={{fontWeight:'800',fontSize:14,marginTop:18}}>Caractéristiques clés</Text><SpecHighlights specs={specs} categorie={model.categorie} max={6}/><Text style={{fontSize:10,color:COLORS.muted,marginTop:7}}>Aperçu basé sur {preview?.nom||'une référence de la gamme'}.</Text></>:null}
    <View style={{height:1,backgroundColor:'#E8E9EC',marginTop:20}}/><Text style={{fontWeight:'900',fontSize:17,marginTop:18,marginBottom:10}}>Variantes / références</Text>
  </View>;
}

function CurvePreview({ curve }) {
  let points=[];try{points=JSON.parse(curve.serie||'[]');}catch{}
  const maxY=Math.max(1,...points.map(p=>Number(p.y)||0));
  return <View style={{marginTop:8,backgroundColor:'#F7F8FA',borderRadius:12,padding:12}}>
    <Text style={{fontWeight:'700'}}>{curve.nom}</Text><Text style={{fontSize:11,color:COLORS.muted}}>{curve.axe_y} ({curve.unite_y}) / {curve.axe_x} ({curve.unite_x})</Text>
    {points.length?<View style={{height:90,flexDirection:'row',alignItems:'flex-end',gap:4,marginTop:10,borderBottomWidth:1,borderBottomColor:'#CCC'}}>{points.map((p,i)=><View key={i} style={{flex:1,alignItems:'center',justifyContent:'flex-end'}}><View style={{width:'72%',height:`${Math.max(6,(Number(p.y)||0)/maxY*78)}%`,borderRadius:4,backgroundColor:COLORS.primary}}/><Text style={{fontSize:8,color:'#666',marginTop:2}}>{p.x}</Text></View>)}</View>:<Text style={{fontSize:11,color:COLORS.muted,marginTop:8}}>Courbe documentée sans points numériques importés.</Text>}
  </View>;
}

function SimpleModal({ visible,title,fields,onClose,onSave }) {
  const [values,setValues]=useState({});
  useEffect(()=>{if(visible)setValues({});},[visible]);
  return <Modal visible={visible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.modalTitle}>{title}</Text>{fields.map(f=><TextInput key={f.key} style={[styles.input,{marginTop:10,minHeight:f.multiline?70:undefined,textAlignVertical:f.multiline?'top':undefined}]} placeholder={f.label} value={values[f.key]||''} onChangeText={v=>setValues(x=>({...x,[f.key]:v}))} multiline={!!f.multiline}/>)}<View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={()=>onSave(values)}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View></ScrollView></View></View></Modal>;
}

export function EquipmentCatalogueBrowser(){
  const {width}=useWindowDimensions();const tablet=width>=700;const cols=tablet?2:1;
  const [tab,setTab]=useState('marques');const [brands,setBrands]=useState([]);const [cats,setCats]=useState([]);const [models,setModels]=useState([]);const [search,setSearch]=useState('');
  const [brand,setBrand]=useState(null);const [model,setModel]=useState(null);const [variants,setVariants]=useState([]);const [variant,setVariant]=useState(null);const [sheet,setSheet]=useState(null);const [modelPreview,setModelPreview]=useState(null);const [modal,setModal]=useState(null);

  const refresh=useCallback(async()=>{const[b,c,m]=await Promise.all([listerMarquesEquipement(),listerCategoriesEquipement(),rechercherCatalogueIntelligent({recherche:search})]);setBrands(b);setCats(c);setModels(m);},[search]);
  useEffect(()=>{refresh();},[refresh]);

  const baseData=tab==='marques'?brands:tab==='categories'?cats:models;
  const filtered=useMemo(()=>baseData.filter(x=>!search.trim()||`${x.nom||''} ${x.marque||''} ${x.categorie||''}`.toLowerCase().includes(search.toLowerCase())||tab==='modeles'),[baseData,search,tab]);
  const orderedSpecs=useMemo(()=>orderSpecs(sheet?.caracteristiques||[],sheet?.categorie||''),[sheet?.caracteristiques,sheet?.categorie]);

  const openBrand=async b=>{setBrand(b);setModel(null);setVariant(null);setSheet(null);setModelPreview(null);setModels(await rechercherCatalogueIntelligent({marqueId:b.id}));};
  const openModel=async m=>{await enregistrerOuvertureModele(m.id);setModel(m);setVariant(null);setSheet(null);setModelPreview(null);const vv=await listerVariantesEquipement(m.id);setVariants(vv);if(vv.length){try{const p=await getFicheVarianteEquipement(vv[0].id);setModelPreview(p);}catch{setModelPreview(null);}}};
  const openVariant=async v=>{setVariant(v);const data=await getFicheVarianteEquipement(v.id);setSheet(data?{...data,modele_image_uri:model?.image_uri,modele_logo_uri:model?.logo_uri}:null);};
  const back=()=>{if(sheet){setSheet(null);setVariant(null);}else if(model){setModel(null);setVariants([]);setModelPreview(null);}else if(brand){setBrand(null);refresh();}};

  const saveModal=async v=>{try{
    if(modal==='brand'){if(!v.nom?.trim())return;await ajouterMarqueEquipement({nom:v.nom.trim(),logoUri:v.logo||null});}
    if(modal==='category'){if(!v.nom?.trim())return;await ajouterCategorieEquipement({nom:v.nom.trim(),icone:v.icone||'⚙️'});}
    if(modal==='model'){if(!v.nom?.trim()||!brand)return;const cat=cats.find(c=>c.nom.toLowerCase()===String(v.categorie||'').trim().toLowerCase())||cats[0];if(!cat)return;await ajouterModeleEquipement({categorieId:cat.id,marqueId:brand.id,nom:v.nom.trim(),reference:v.reference,caracteristiques:v.description,motsCles:`${brand.nom} ${v.nom}`});}
    if(modal==='variant'){if(!v.nom?.trim()||!model)return;await ajouterVarianteEquipement({modeleId:model.id,nom:v.nom.trim(),reference:v.reference,description:v.description});}
    if(modal==='spec'){if(!v.cle?.trim()||!sheet)return;await ajouterCaracteristiqueEquipement({varianteId:sheet.id,cle:v.cle.trim(),valeur:v.valeur,unite:v.unite});}
    if(modal==='curve'){if(!v.nom?.trim()||!sheet)return;let serie='[]';try{serie=JSON.stringify(String(v.points||'').split(';').filter(Boolean).map(x=>{const[a,b]=x.split(',');return{x:Number(a),y:Number(b)}}));}catch{}await ajouterCourbeEquipement({varianteId:sheet.id,nom:v.nom,axeX:v.axeX||'Débit',uniteX:v.uniteX||'m³/h',axeY:v.axeY||'HMT',uniteY:v.uniteY||'mCE',serie});}
    if(modal==='doc'){if(!v.nom?.trim()||!v.uri?.trim()||!sheet)return;await ajouterDocumentEquipement({varianteId:sheet.id,type:v.type||'Document',nom:v.nom,uri:v.uri});}
    setModal(null);await refresh();if(brand)setModels(await rechercherCatalogueIntelligent({marqueId:brand.id}));if(model){const vv=await listerVariantesEquipement(model.id);setVariants(vv);if(vv.length){const p=await getFicheVarianteEquipement(vv[0].id);setModelPreview(p);}}if(sheet){const d=await getFicheVarianteEquipement(sheet.id);setSheet(d?{...d,modele_image_uri:model?.image_uri,modele_logo_uri:model?.logo_uri}:null);}
  }catch(e){Alert.alert('Erreur',String(e.message||e));}};

  const title=sheet?sheet.nom:model?model.nom:brand?brand.nom:'Catalogue matériel';
  const subtitle=sheet?`${sheet.marque} · ${sheet.modele} · ${sheet.categorie}`:model?`${model.marque} · ${model.categorie}`:brand?'Modèles et gammes de la marque':'Base technique constructeur';
  const action=sheet?'Caractéristique':model?'Variante':brand?'Modèle':tab==='marques'?'Marque':tab==='categories'?'Catégorie':null;
  const actionPress=()=>setModal(sheet?'spec':model?'variant':brand?'model':tab==='marques'?'brand':tab==='categories'?'category':null);

  if(sheet)return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Caractéristique" onAction={actionPress}/><ScrollView contentContainerStyle={{padding:18,paddingTop:4,paddingBottom:34}}>
    <ProductImage hero uri={sheet.image_uri||sheet.modele_image_uri} brand={sheet.marque} logoUri={sheet.modele_logo_uri||sheet.logo_uri}/>
    <View style={{marginTop:12,flexDirection:'row',alignItems:'flex-start',gap:12}}><View style={{flex:1}}><Text style={{fontSize:20,fontWeight:'900',color:COLORS.text}}>{sheet.nom}</Text>{sheet.reference?<Text style={{fontSize:12,color:COLORS.muted,marginTop:2}}>Référence constructeur · {sheet.reference}</Text>:null}<QualityBadge quality={sheet.data_quality} verifiedAt={sheet.verified_at}/></View><BrandMark marque={{marque:sheet.marque,logo_uri:sheet.modele_logo_uri||sheet.logo_uri}} compact/></View>
    {sheet.description?<Text style={{fontSize:13,color:'#555',lineHeight:19,marginTop:12}}>{sheet.description}</Text>:null}
    {orderedSpecs.length?<><Text style={{fontWeight:'800',fontSize:15,marginTop:20}}>Caractéristiques essentielles</Text><SpecHighlights specs={orderedSpecs} categorie={sheet.categorie} max={6}/></>:null}
    <View style={{flexDirection:'row',gap:8,marginTop:16}}><InfoPill icon="⚙️" value={orderedSpecs.length} label="caractéristiques"/><InfoPill icon="📄" value={sheet.documents?.length||0} label="documents"/><InfoPill icon="📈" value={sheet.courbes?.length||0} label="courbes"/></View>
    <Text style={{fontWeight:'900',fontSize:16,marginBottom:8,marginTop:24}}>Toutes les caractéristiques</Text>{orderedSpecs.length?orderedSpecs.map(s=><View key={s.id} style={{flexDirection:'row',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#EEE',gap:10}}><Text style={{flex:1,color:'#555'}}>{s.cle}</Text><Text style={{fontWeight:'700',textAlign:'right',maxWidth:'48%'}}>{s.valeur} {s.unite||''}</Text></View>):<Text style={{color:COLORS.muted}}>Aucune caractéristique.</Text>}
    <View style={{flexDirection:'row',alignItems:'center',marginTop:24}}><Text style={{fontWeight:'900',fontSize:16,flex:1}}>Courbes</Text><TouchableOpacity onPress={()=>setModal('curve')}><Text style={{color:COLORS.primary,fontWeight:'700'}}>+ Ajouter</Text></TouchableOpacity></View>{sheet.courbes?.length?sheet.courbes.map(c=><CurvePreview key={c.id} curve={c}/>):<Text style={{color:COLORS.muted,marginTop:8}}>Aucune courbe documentée.</Text>}
    <View style={{flexDirection:'row',alignItems:'center',marginTop:24}}><Text style={{fontWeight:'900',fontSize:16,flex:1}}>Documents constructeur</Text><TouchableOpacity onPress={()=>setModal('doc')}><Text style={{color:COLORS.primary,fontWeight:'700'}}>+ Ajouter</Text></TouchableOpacity></View>{sheet.documents?.length?sheet.documents.map(d=><DocumentCard key={d.id} doc={d}/>):<Text style={{color:COLORS.muted,marginTop:8}}>Aucun document.</Text>}
  </ScrollView><SimpleModal visible={!!modal} title={modal==='spec'?'Nouvelle caractéristique':modal==='curve'?'Nouvelle courbe':'Nouveau document'} fields={modal==='spec'?[{key:'cle',label:'Caractéristique'},{key:'valeur',label:'Valeur'},{key:'unite',label:'Unité'}]:modal==='curve'?[{key:'nom',label:'Nom de la courbe'},{key:'axeX',label:'Axe X'},{key:'uniteX',label:'Unité X'},{key:'axeY',label:'Axe Y'},{key:'uniteY',label:'Unité Y'},{key:'points',label:'Points : x,y;x,y;…',multiline:true}]:[{key:'type',label:'Type'},{key:'nom',label:'Nom'},{key:'uri',label:'URL'}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  if(model)return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Variante" onAction={actionPress}/><FlatList contentContainerStyle={{padding:18,paddingTop:4,paddingBottom:32}} data={variants} keyExtractor={x=>x.id} ListHeaderComponent={<ModelOverview model={model} preview={modelPreview} variants={variants}/>} renderItem={({item})=><VariantCard item={item} model={model} onPress={()=>openVariant(item)}/>} ListEmptyComponent={<View style={{paddingVertical:18,alignItems:'center'}}><Text style={{fontWeight:'700'}}>Aucune variante</Text><Text style={{color:COLORS.muted,marginTop:5,textAlign:'center'}}>Ajoute les puissances, tailles ou références de ce modèle.</Text></View>}/><SimpleModal visible={modal==='variant'} title="Nouvelle variante / référence" fields={[{key:'nom',label:'Nom'},{key:'reference',label:'Référence constructeur'},{key:'description',label:'Description',multiline:true}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  if(brand)return <View style={{flex:1}}><Header title={title} subtitle={subtitle} onBack={back} action="Modèle" onAction={actionPress}/><FlatList key={`brand-${cols}`} numColumns={cols} columnWrapperStyle={cols>1?{gap:12}:undefined} contentContainerStyle={{padding:18,paddingTop:4}} data={models} keyExtractor={x=>x.id} renderItem={({item})=><ModelCard model={item} tablet={tablet} onPress={()=>openModel(item)}/>} ListEmptyComponent={<Text style={{padding:24,color:COLORS.muted}}>Aucun modèle pour cette marque.</Text>}/><SimpleModal visible={modal==='model'} title={`Ajouter un modèle · ${brand.nom}`} fields={[{key:'nom',label:'Nom du modèle / gamme'},{key:'categorie',label:'Catégorie'},{key:'reference',label:'Référence facultative'},{key:'description',label:'Description',multiline:true}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;

  return <View style={{flex:1}}><Header title="Catalogue matériel" subtitle={`${brands.length} marques · ${models.length} modèles · ${cats.length} catégories`} action={action} onAction={actionPress}/><View style={styles.catalogueSearchBox}><TextInput style={styles.catalogueSearchInput} placeholder="Rechercher une marque, un modèle, une référence…" value={search} onChangeText={setSearch}/></View><View style={styles.catalogueTabs}>{[['marques','Marques'],['modeles','Modèles'],['categories','Catégories']].map(([id,l])=><TouchableOpacity key={id} style={[styles.catalogueTab,tab===id&&styles.catalogueTabActive]} onPress={()=>setTab(id)}><Text style={[styles.catalogueTabText,tab===id&&styles.catalogueTabTextActive]}>{l}</Text></TouchableOpacity>)}</View><FlatList key={`${tab}-${cols}`} numColumns={tab==='categories'?1:cols} columnWrapperStyle={tab!=='categories'&&cols>1?{gap:12}:undefined} contentContainerStyle={{padding:18}} data={filtered} keyExtractor={x=>x.id} renderItem={({item})=>tab==='marques'?<BrandCard brand={item} tablet={tablet} onPress={()=>openBrand(item)}/>:tab==='modeles'?<ModelCard model={item} tablet={tablet} onPress={()=>openModel(item)}/>:<TouchableOpacity style={styles.catalogueCard} onPress={()=>{setTab('modeles');setModels(models.filter(m=>m.categorie_id===item.id));}}><Text style={styles.equipmentIcon}>{item.icone||'⚙️'}</Text><View style={{flex:1}}><Text style={styles.cardTitle}>{item.nom}</Text><Text style={styles.cardSub}>{item.nb_modeles} modèles</Text></View><Text>›</Text></TouchableOpacity>}/><SimpleModal visible={modal==='brand'||modal==='category'} title={modal==='brand'?'Nouvelle marque':'Nouvelle catégorie'} fields={modal==='brand'?[{key:'nom',label:'Nom de la marque'},{key:'logo',label:'URL du logo (facultatif)'}]:[{key:'nom',label:'Nom de la catégorie'},{key:'icone',label:'Icône'}]} onClose={()=>setModal(null)} onSave={saveModal}/></View>;
}