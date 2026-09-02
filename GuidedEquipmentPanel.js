import React,{memo,useCallback,useEffect,useMemo,useState}from'react';
import{FlatList,Modal,Text,TextInput,TouchableOpacity,View}from'react-native';
import{listerMateriel,ajouterMateriel,upsertMaterielChamp,supprimerMateriel,listerBibliothequeEquipements,listerCategoriesEquipement,listerMarquesEquipement}from'./db.js';
import{ensureEquipmentCatalogReady}from'./database/index.js';
import{ChipSelector}from'./GenericFields.js';
import{useDurableAutosave}from'./durableAutosave.js';
import{PhotoButton}from'./PhotoButton.js';
import{BrandMark}from'./BrandLogo.js';
import{COLORS,styles}from'./styles.js';

const TYPES=['VMC','CTA','Ventilateur','Tourelle','Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Compteur','Désemboueur','Détendeur','Échangeur','Filtre','Manomètre','Pompe','Soupape','Vanne',"Vase d'expansion"];
const MARQUES=['Aldes','Atlantic','S&P Unelvent','VIM','France Air','Systemair','Swegon','FläktGroup','CIAT','Daikin','WOLF','TROX','Helios','Vortice','Komfovent','Salda','Zehnder','Nilan','Rosenberg','Nicotra Gebhardt','De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Alfa Laval'];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const eq=(a,b)=>norm(a)===norm(b);
const uniq=a=>[...new Set((a||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
const nomModele=e=>String(e?.nom||e?.modele||'').trim();

function typeCompatible(typeChoisi,typeCatalogue){
 const a=norm(typeChoisi),b=norm(typeCatalogue);
 if(!a)return true;
 if(a===b)return true;
 if(a==='pompe'&&(b==='circulateur'||b.includes('pompe')))return true;
 if(a==='circulateur'&&(b==='pompe'||b.includes('circulateur')))return true;
 if(a==='chaudiere'&&b.includes('chaudiere'))return true;
 if(a==='echangeur'&&b.includes('echangeur'))return true;
 if(a==='ballon ecs'&&(b.includes('ballon')||b.includes('ecs')))return true;
 if(a==='vmc'&&(b==='vmc'||b.includes('ventilation')))return true;
 if(a==='cta'&&(b==='cta'||b.includes('traitement air')))return true;
 if(a==='ventilateur'&&(b.includes('ventilateur')||b.includes('extracteur')))return true;
 if(a==='tourelle'&&b.includes('tourelle'))return true;
 return false;
}

function PickerSheet({visible,titre,options,valeur,onClose,onPick,emptyText='Aucune proposition'}){
 const[recherche,setRecherche]=useState('');
 useEffect(()=>{if(visible)setRecherche('')},[visible]);
 const data=useMemo(()=>{
  const q=norm(recherche);
  return q?options.filter(v=>norm(v).includes(q)):options;
 },[options,recherche]);
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.30)',justifyContent:'flex-end'}}>
   <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={onClose}/>
   <View style={{backgroundColor:'#fff',borderTopLeftRadius:22,borderTopRightRadius:22,paddingTop:10,paddingHorizontal:16,paddingBottom:18,maxHeight:'72%'}}>
    <View style={{width:46,height:5,borderRadius:3,backgroundColor:'#D0D5DD',alignSelf:'center',marginBottom:12}}/>
    <View style={{flexDirection:'row',alignItems:'center',marginBottom:10}}>
     <Text style={[styles.modalTitle,{flex:1,marginBottom:0}]}>{titre}</Text>
     <TouchableOpacity onPress={onClose} style={{padding:8}}><Text style={{fontSize:20,color:COLORS.muted}}>✕</Text></TouchableOpacity>
    </View>
    <TextInput style={styles.input} value={recherche} onChangeText={setRecherche} placeholder={`Rechercher ${titre.toLowerCase()}…`} autoCorrect={false}/>
    <FlatList data={data} keyExtractor={v=>v} keyboardShouldPersistTaps="handled" initialNumToRender={12} maxToRenderPerBatch={12} windowSize={6}
     style={{marginTop:8}}
     renderItem={({item})=><TouchableOpacity onPress={()=>{onPick(item);onClose()}} style={{minHeight:52,paddingHorizontal:12,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#ECEFF2',flexDirection:'row',alignItems:'center'}}>
      <Text style={{flex:1,fontSize:15,fontWeight:eq(item,valeur)?'800':'600',color:eq(item,valeur)?COLORS.primary:COLORS.text}}>{item}</Text>
      {eq(item,valeur)?<Text style={{color:COLORS.primary,fontWeight:'900'}}>✓</Text>:null}
     </TouchableOpacity>}
     ListEmptyComponent={<View style={{paddingVertical:24}}><Text style={{textAlign:'center',color:COLORS.muted}}>{emptyText}</Text></View>}/>
   </View>
  </View>
 </Modal>;
}

function PickerField({label,valeur,placeholder,onPress,disabled=false,sub}){
 return <View style={{marginTop:10}}>
  <Text style={styles.fieldLabel}>{label}</Text>
  <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.72} style={[styles.input,{minHeight:48,flexDirection:'row',alignItems:'center',opacity:disabled?0.55:1}]}>
   <Text style={{flex:1,fontSize:15,color:valeur?COLORS.text:COLORS.muted}} numberOfLines={1}>{valeur||placeholder}</Text>
   <Text style={{fontSize:18,color:COLORS.primary,fontWeight:'800'}}>⌄</Text>
  </TouchableOpacity>
  {sub?<Text style={[styles.importHint,{marginTop:4}]}>{sub}</Text>:null}
 </View>;
}

const EquipmentCard=memo(function EquipmentCard({item,visiteId,onChange,types,marques,catalogue}){
 const[categorie,setCategorie]=useState(item.categorie||'');
 const[marque,setMarque]=useState(item.marque||'');
 const[etat,setEtat]=useState(item.etat||'');
 const[picker,setPicker]=useState(null);
 const[designation,setDesignation,blurDesignation,setDesignationNow]=useDurableAutosave(item.designation,v=>upsertMaterielChamp(item.id,'designation',v));
 const[modele,setModele,blurModele,setModeleNow]=useDurableAutosave(item.modele,v=>upsertMaterielChamp(item.id,'modele',v));
 const[annee,setAnnee,blurAnnee]=useDurableAutosave(item.annee,v=>upsertMaterielChamp(item.id,'annee',v));
 useEffect(()=>{setCategorie(item.categorie||'');setMarque(item.marque||'');setEtat(item.etat||'')},[item.categorie,item.marque,item.etat]);

 const refsType=useMemo(()=>catalogue.filter(e=>typeCompatible(categorie,e.categorie)),[catalogue,categorie]);
 const marquesType=useMemo(()=>uniq(refsType.map(e=>e.marque)),[refsType]);
 const refsMarque=useMemo(()=>refsType.filter(e=>!marque||eq(e.marque,marque)),[refsType,marque]);
 const modeles=useMemo(()=>uniq(refsMarque.map(nomModele)),[refsMarque]);

 const choisirType=async v=>{
  const ancien=categorie;
  const t=String(v||'').trim();
  setCategorie(t);
  await upsertMaterielChamp(item.id,'categorie',t);
  if(!designation||eq(designation,'Équipement')||eq(designation,ancien))await setDesignationNow(t||'Équipement');
  const refsNouveau=catalogue.filter(e=>typeCompatible(t,e.categorie));
  if(marque&&!refsNouveau.some(e=>eq(e.marque,marque))){setMarque('');await upsertMaterielChamp(item.id,'marque','');await setModeleNow('')}
  else if(modele&&!refsNouveau.some(e=>eq(e.marque,marque)&&eq(nomModele(e),modele)))await setModeleNow('');
 };
 const choisirMarque=async v=>{
  const m=String(v||'').trim();
  setMarque(m);
  await upsertMaterielChamp(item.id,'marque',m);
  if(modele&&!refsType.some(e=>eq(e.marque,m)&&eq(nomModele(e),modele)))await setModeleNow('');
 };
 const choisirModele=async v=>{await setModeleNow(String(v||'').trim())};
 const sauverEtat=async v=>{setEtat(v);await upsertMaterielChamp(item.id,'etat',v)};

 return <View style={styles.formCard}>
  <View style={styles.equipmentBrandHeader}>
   <BrandMark marque={marque} compact/>
   <View style={{flex:1}}><Text style={styles.cardTitle}>{designation||categorie||'Nouvel équipement'}</Text><Text style={styles.cardSub}>{[marque,modele].filter(Boolean).join(' · ')||'À compléter'}</Text></View>
   <PhotoButton visiteId={visiteId} entiteKey={item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`} label={designation||categorie||'Équipement'}/>
  </View>

  <PickerField label="1. Type d’équipement" valeur={categorie} placeholder="Choisir : VMC, CTA, Ventilateur, Pompe, Chaudière…" onPress={()=>setPicker('type')}/>
  <View style={{marginTop:10}}><Text style={styles.fieldLabel}>2. Désignation</Text><TextInput style={styles.input} value={designation} onChangeText={setDesignation} onBlur={blurDesignation} placeholder={categorie?`Ex. ${categorie} double`:'Désignation'}/><Text style={[styles.importHint,{marginTop:4}]}>Préremplie avec le type, mais entièrement modifiable selon l’équipement réel.</Text></View>
  <PickerField label="3. Marque" valeur={marque} placeholder={categorie?'Choisir une marque':'Choisir d’abord le type'} disabled={!categorie} onPress={()=>setPicker('marque')} sub={categorie&&marquesType.length?`${marquesType.length} marque(s) compatibles dans le catalogue`:null}/>
  <PickerField label="4. Modèle" valeur={modele} placeholder={!categorie?'Choisir d’abord le type':!marque?'Choisir d’abord la marque':'Choisir un modèle'} disabled={!categorie||!marque} onPress={()=>setPicker('modele')} sub={categorie&&marque?(modeles.length?`${modeles.length} modèle(s) ${marque} correspondant à ${categorie}`:`Aucun modèle ${marque} / ${categorie} dans la base — saisie manuelle possible ci-dessous`):null}/>
  {categorie&&marque?<TextInput style={[styles.input,{marginTop:7}]} value={modele} onChangeText={setModele} onBlur={blurModele} placeholder="Ou saisir / corriger la référence exacte du modèle"/>:null}
  <View style={{marginTop:10}}><Text style={styles.fieldLabel}>Année</Text><TextInput style={[styles.input,{width:130}]} value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" placeholder="Année"/></View>
  <View style={{height:10}}/><Text style={styles.fieldLabel}>5. État constaté</Text><View style={{height:6}}/><ChipSelector valeur={etat} options={['Bon','À surveiller','Dégradé','Hors service']} onChange={sauverEtat}/>

  {item.equipement_id?<View style={[styles.persistentEquipmentBadge,{marginTop:10}]}><Text style={styles.persistentEquipmentBadgeText}>↻ Équipement permanent · {item.nb_observations||0} observation(s)</Text></View>:null}
  <TouchableOpacity style={{marginTop:12}} onPress={async()=>{await supprimerMateriel(item.id);await onChange()}}><Text style={styles.removeLink}>Déclarer cet équipement retiré</Text></TouchableOpacity>

  <PickerSheet visible={picker==='type'} titre="Type d’équipement" options={types} valeur={categorie} onClose={()=>setPicker(null)} onPick={choisirType}/>
  <PickerSheet visible={picker==='marque'} titre="Marque" options={marquesType.length?marquesType:marques} valeur={marque} onClose={()=>setPicker(null)} onPick={choisirMarque} emptyText="Aucune marque compatible dans le catalogue"/>
  <PickerSheet visible={picker==='modele'} titre={`Modèle${marque?` · ${marque}`:''}`} options={modeles} valeur={modele} onClose={()=>setPicker(null)} onPick={choisirModele} emptyText="Aucun modèle correspondant dans le catalogue. Utilise la saisie manuelle."/>
 </View>;
});

export function GuidedEquipmentPanel({visiteId}){
 const[materiel,setMateriel]=useState([]),[types,setTypes]=useState(TYPES),[marques,setMarques]=useState(MARQUES),[catalogue,setCatalogue]=useState([]);
 const charger=useCallback(async()=>setMateriel(await listerMateriel(visiteId)),[visiteId]);
 useEffect(()=>{charger()},[charger]);
 useEffect(()=>{let actif=true;(async()=>{
  try{
   // Le gros catalogue VMC/CTA est enrichi à la demande pour rester offline-first
   // sans ralentir l'ouverture de toute l'application.
   await ensureEquipmentCatalogReady();
   const[c,m,r]=await Promise.all([listerCategoriesEquipement(),listerMarquesEquipement(),listerBibliothequeEquipements()]);
   if(!actif)return;
   setTypes(uniq([...TYPES,...c.map(x=>x.nom)]));
   setMarques(uniq([...MARQUES,...m.map(x=>x.nom)]));
   setCatalogue(r||[]);
  }catch(e){console.warn('Catalogue équipements non chargé',e)}
 })();return()=>{actif=false}},[]);
 const ajouter=useCallback(async()=>{await ajouterMateriel(visiteId);await charger()},[visiteId,charger]);
 return <FlatList data={materiel} keyExtractor={i=>i.id} renderItem={({item})=><EquipmentCard item={item} visiteId={visiteId} onChange={charger} types={types} marques={marques} catalogue={catalogue}/>} contentContainerStyle={styles.panelContent} ListHeaderComponent={<View><Text style={styles.sectionTitle}>Équipements · {materiel.length}</Text><Text style={styles.importHint}>VMC, CTA, ventilateurs et tourelles sont inclus. Touchez Type, Marque ou Modèle : un volet tactile s’ouvre et filtre automatiquement le catalogue.</Text></View>} ListFooterComponent={<TouchableOpacity style={styles.addBtn} onPress={ajouter}><Text style={styles.addBtnText}>+ Ajouter un équipement</Text></TouchableOpacity>} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled"/>;
}
