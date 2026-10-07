import React,{memo,useCallback,useEffect,useMemo,useState}from'react';
import{Alert,FlatList,Modal,ScrollView,Text,TextInput,TouchableOpacity,View}from'react-native';
import{listerMateriel,ajouterMateriel,upsertMaterielChamp,supprimerMateriel,listerBibliothequeEquipements,listerCategoriesEquipement,listerMarquesEquipement}from'./db.js';
import{ensureEquipmentCatalogReady}from'./database/index.js';
import{ChipSelector}from'./GenericFields.js';
import{useDurableAutosave}from'./durableAutosave.js';
import{PhotoButton}from'./PhotoButton.js';
import{BrandMark}from'./BrandLogo.js';
import{COLORS,FONTS,styles}from'./styles.js';
import{useListScrollMemory}from'./useListScrollMemory.js';
import{flushDurableAutosaves}from'./durableAutosave.js';
import{listerHistoriqueEquipement,listerPhotos}from'./db.js';
import{listerEquipementsPointage,confirmerEquipementVisite,dupliquerEquipementVisite,creerEquipementVisite,listerEquipementsAutresLocaux,rattacherEquipementAuLocal}from'./terrainVisitDb.js';
import{etatPointageEquipement}from'./terrainVisitModel.js';
import{LecturePhotoButton}from'./PhotoOcrReview.js';
import{PhotoVariantImage}from'./PhotoVariantImage.js';
import{CvcIcon}from'./MetraCvcIcons.js';
import{ProgressRing}from'./premiumChrome.js';
import{ButtonGlow}from'./ButtonGlow.js';

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

const EquipmentCard=memo(function EquipmentCard({item,visiteId,onChange,types,marques,catalogue,trameId}){
 const[categorie,setCategorie]=useState(item.categorie||'');
 const[marque,setMarque]=useState(item.marque||'');
 const[etat,setEtat]=useState(item.etat||'');
 const[perimetre,setPerimetre]=useState(item.perimetre||'');
 const reseauChaleur=trameId==='reseau_chaleur_v1';
 const[picker,setPicker]=useState(null);
 const[expanded,setExpanded]=useState(()=>!item.designation||eq(item.designation,'Équipement'));
 const[historique,setHistorique]=useState([]),[photos,setPhotos]=useState([]);
 useEffect(()=>{if(!expanded)return;let alive=true;Promise.all([item.equipement_id?listerHistoriqueEquipement(item.equipement_id):Promise.resolve([]),listerPhotos(visiteId)]).then(([h,p])=>{if(alive){setHistorique(h.filter(x=>x.visite_id!==visiteId));setPhotos(p.filter(x=>x.entite_key===(item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`)))}}).catch(console.warn);return()=>{alive=false}},[expanded,item.id,item.equipement_id,visiteId]);
 const[designation,setDesignation,blurDesignation,setDesignationNow]=useDurableAutosave(item.designation,v=>upsertMaterielChamp(item.id,'designation',v));
 const[modele,setModele,blurModele,setModeleNow]=useDurableAutosave(item.modele,v=>upsertMaterielChamp(item.id,'modele',v));
 const[annee,setAnnee,blurAnnee]=useDurableAutosave(item.annee,v=>upsertMaterielChamp(item.id,'annee',v));
 const[nombre,setNombre,blurNombre]=useDurableAutosave(item.nombre,v=>upsertMaterielChamp(item.id,'nombre',v));
 const[numero,setNumero,blurNumero]=useDurableAutosave(item.numero_materiel,v=>upsertMaterielChamp(item.id,'numero_materiel',v));
 const[reseau,setReseau,blurReseau]=useDurableAutosave(item.reseau_desservi,v=>upsertMaterielChamp(item.id,'reseau_desservi',v));
 const[caracteristiques,setCaracteristiques,blurCaracteristiques]=useDurableAutosave(item.caracteristiques,v=>upsertMaterielChamp(item.id,'caracteristiques',v));
 useEffect(()=>{setCategorie(item.categorie||'');setMarque(item.marque||'');setEtat(item.etat||'');setPerimetre(item.perimetre||'')},[item.categorie,item.marque,item.etat,item.perimetre]);

 const marqueLogo=useMemo(()=>{
  const match=catalogue.find(e=>marque&&eq(e.marque,marque)&&e.logo_uri);
  if(match?.logo_uri)return match.logo_uri;
  return eq(marque,item.marque)?(item.marque_logo_uri||null):null;
 },[catalogue,marque,item.marque,item.marque_logo_uri]);
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
 const sauverPerimetre=async v=>{setPerimetre(v);await upsertMaterielChamp(item.id,'perimetre',v)};
 const fermer=async()=>{try{await flushDurableAutosaves();await onChange();setExpanded(false)}catch(e){Alert.alert('Sauvegarde impossible',String(e?.message||e))}};
 const confirmer=async()=>{try{await flushDurableAutosaves();await confirmerEquipementVisite(visiteId,item.id);await onChange();setExpanded(false)}catch(e){Alert.alert('Pointage impossible',String(e?.message||e));setExpanded(true)}};
 const retirer=()=>Alert.alert('Retiré du site ?',`Confirmer le retrait de « ${designation||categorie||'Équipement'} » du patrimoine de ce local.`,[{text:'Annuler',style:'cancel'},{text:'Retirer',style:'destructive',onPress:async()=>{try{await flushDurableAutosaves();await supprimerMateriel(item.id);await onChange();setExpanded(false)}catch(e){Alert.alert('Retrait impossible',String(e?.message||e))}}}]);

 return <View style={styles.formCard}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${designation||categorie||'Équipement'}, ouvrir les détails`} activeOpacity={0.72} onPress={()=>setExpanded(v=>!v)} style={{flex:1,minWidth:0,paddingVertical:2}}>
    <Text numberOfLines={2} style={[styles.cardTitle,{marginBottom:2}]}>{designation||categorie||'Nouvel équipement'}</Text>
    {reseau?<Text numberOfLines={1} style={{fontSize:11,color:COLORS.muted,fontStyle:'italic',marginBottom:1}}>{reseau}</Text>:null}
    <Text numberOfLines={1} style={{fontSize:11,color:COLORS.muted,fontStyle:'italic'}}>{[marque,modele].filter(Boolean).join(' - ')||'Marque - modèle à compléter'}</Text>
    <Text style={{fontFamily:FONTS.body,fontSize:11,color:item.confirme_le?COLORS.green:COLORS.inkFaint,marginTop:4}}>{item.confirme_le?'Présence confirmée':item.deja_reference?(Number(item.nb_observations)>0?`Repris du local · ${item.nb_observations} observation${Number(item.nb_observations)>1?'s':''}`:'Repris du local · à pointer'):'Nouvel équipement à vérifier'}</Text>
   </TouchableOpacity>
   <PhotoButton visiteId={visiteId} entiteKey={item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`} label={designation||categorie||'Équipement'}/>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.confirme_le?'Présence confirmée':'Marquer présent'} onPress={confirmer} style={{width:48,height:48,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:item.confirme_le?COLORS.green:'rgba(242,100,38,0.09)'}}><CvcIcon name="check" size={22} color={item.confirme_le?'#fff':COLORS.orange}/></TouchableOpacity>
  </View>

  <Modal visible={expanded} transparent animationType="slide" onRequestClose={fermer}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={[styles.modalTitle,{flex:1}]}>{designation||categorie||'Fiche équipement'}</Text><TouchableOpacity accessibilityLabel="Fermer la fiche" onPress={fermer}><CvcIcon name="close" size={24} color={COLORS.ink}/></TouchableOpacity></View>
   <ScrollView keyboardShouldPersistTaps="handled">
   <View style={{flexDirection:'row',gap:8,marginBottom:10}}>{photos.slice(-2).map(p=><PhotoVariantImage key={p.id} uri={p.uri} style={{width:100,height:85,borderRadius:14}}/>)}<View style={{justifyContent:'center'}}><Text style={styles.importHint}>Plaque signalétique</Text><LecturePhotoButton visiteId={visiteId} entiteKey={item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`} label={`${designation||categorie} · plaque`} kind="plate" current={{marque,modele,numero_materiel:numero,annee,caracteristiques}} onApply={async values=>{await flushDurableAutosaves();for(const[key,value]of Object.entries(values))await upsertMaterielChamp(item.id,key,value);await onChange();setExpanded(false)}}/></View></View>
   <Text style={styles.fieldLabel}>État constaté pendant cette visite</Text><ChipSelector valeur={etat} options={['Neuf','Bon','Moyen','Vétuste','Hors service']} onChange={sauverEtat}/>
  <View style={{marginTop:12}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8}}><BrandMark marque={{marque,logo_uri:marqueLogo}} compact/><Text style={[styles.importHint,{flex:1}]}>Détails de l’équipement</Text></View>
  <PickerField label="1. Type d’équipement" valeur={categorie} placeholder="Choisir : VMC, CTA, Ventilateur, Pompe, Chaudière…" onPress={()=>setPicker('type')}/>
  <View style={{marginTop:10}}><Text style={styles.fieldLabel}>2. Désignation</Text><TextInput style={styles.input} value={designation} onChangeText={setDesignation} onBlur={blurDesignation} placeholder={categorie?`Ex. ${categorie} double`:'Désignation'}/><Text style={[styles.importHint,{marginTop:4}]}>Préremplie avec le type, mais entièrement modifiable selon l’équipement réel.</Text></View>
  <PickerField label="3. Marque" valeur={marque} placeholder={categorie?'Choisir une marque':'Choisir d’abord le type'} disabled={!categorie} onPress={()=>setPicker('marque')} sub={categorie&&marquesType.length?`${marquesType.length} marque(s) compatibles dans le catalogue`:null}/>
  <PickerField label="4. Modèle" valeur={modele} placeholder={!categorie?'Choisir d’abord le type':!marque?'Choisir d’abord la marque':'Choisir un modèle'} disabled={!categorie||!marque} onPress={()=>setPicker('modele')} sub={categorie&&marque?(modeles.length?`${modeles.length} modèle(s) ${marque} correspondant à ${categorie}`:`Aucun modèle ${marque} / ${categorie} dans la base — saisie manuelle possible ci-dessous`):null}/>
  {categorie&&marque?<TextInput style={[styles.input,{marginTop:7}]} value={modele} onChangeText={setModele} onBlur={blurModele} placeholder="Ou saisir / corriger la référence exacte du modèle"/>:null}
  <View style={{marginTop:10,flexDirection:'row',gap:8}}><View style={{width:110}}><Text style={styles.fieldLabel}>Nombre</Text><TextInput style={styles.input} value={nombre} onChangeText={setNombre} onBlur={blurNombre} placeholder="Ex. 2"/></View><View style={{width:130}}><Text style={styles.fieldLabel}>Année</Text><TextInput style={styles.input} value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" placeholder="Année"/></View><View style={{flex:1}}><Text style={styles.fieldLabel}>N° matériel</Text><TextInput style={styles.input} value={numero} onChangeText={setNumero} onBlur={blurNumero} placeholder="Ex. CHA-001"/></View></View>
  <View style={{marginTop:8}}><Text style={styles.fieldLabel}>Réseau desservi</Text><TextInput style={styles.input} value={reseau} onChangeText={setReseau} onBlur={blurReseau} placeholder="Ex. Bâtiment A"/></View>
  <View style={{marginTop:8}}><Text style={styles.fieldLabel}>Caractéristiques</Text><TextInput style={styles.input} value={caracteristiques} onChangeText={setCaracteristiques} onBlur={blurCaracteristiques} placeholder="Ex. 500 kW"/></View>
  {reseauChaleur?<View style={{marginTop:10}}>
    <Text style={styles.fieldLabel}>Périmètre de l’équipement · obligatoire</Text>
    <View style={{height:6}}/>
    <ChipSelector valeur={perimetre} options={['Primaire','Secondaire']} onChange={sauverPerimetre}/>
    {!perimetre?<Text style={[styles.importHint,{marginTop:5}]}>Choisis Primaire ou Secondaire. Ce classement est propre à la trame Réseau de chaleur.</Text>:null}
  </View>:null}
  <View style={{height:10}}/><Text style={styles.fieldLabel}>5. État constaté</Text><View style={{height:6}}/><ChipSelector valeur={etat} options={['Neuf','Bon','Moyen','Vétuste','Hors service','À surveiller','Dégradé']} onChange={sauverEtat}/>
  {['À surveiller','Dégradé'].includes(etat)?<Text style={[styles.importHint,{marginTop:5}]}>Pour une visite liée à l’Intranet, choisis avant l’envoi un état accepté par le serveur : Neuf, Bon, Moyen, Vétuste ou Hors service.</Text>:null}

  {historique.length?<View style={{marginTop:12}}><Text style={styles.fieldLabel}>Historique</Text>{historique.slice(0,5).map(h=><View key={h.id} style={{paddingVertical:8,flexDirection:'row',gap:8}}><Text style={{flex:1,fontFamily:FONTS.body,color:COLORS.inkSoft}}>{h.date_visite}{h.commentaire?` · ${h.commentaire}`:''}</Text><Text style={{fontFamily:FONTS.bodyBold,color:COLORS.ink}}>{h.etat||'Non renseigné'}</Text></View>)}</View>:null}
  </View></ScrollView><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={retirer}><Text style={[styles.btnSecondaryText,{color:COLORS.red}]}>Retiré du site</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={confirmer}><ButtonGlow/><Text style={styles.btnPrimaryText}>Présent, valider</Text></TouchableOpacity></View>
  </View></View></Modal>

  <PickerSheet visible={picker==='type'} titre="Type d’équipement" options={types} valeur={categorie} onClose={()=>setPicker(null)} onPick={choisirType}/>
  <PickerSheet visible={picker==='marque'} titre="Marque" options={marquesType.length?marquesType:marques} valeur={marque} onClose={()=>setPicker(null)} onPick={choisirMarque} emptyText="Aucune marque compatible dans le catalogue"/>
  <PickerSheet visible={picker==='modele'} titre={`Modèle${marque?` · ${marque}`:''}`} options={modeles} valeur={modele} onClose={()=>setPicker(null)} onPick={choisirModele} emptyText="Aucun modèle correspondant dans le catalogue. Utilise la saisie manuelle."/>
 </View>;
});

export function GuidedEquipmentPanel({visiteId,trameId='icpe_v1'}){
 const[materiel,setMateriel]=useState([]),[types,setTypes]=useState(TYPES),[marques,setMarques]=useState(MARQUES),[catalogue,setCatalogue]=useState([]);
 const[recherche,setRecherche]=useState('');
 const[filtre,setFiltre]=useState('a-voir'),[ajoutVisible,setAjoutVisible]=useState(false),[creation,setCreation]=useState(false);
 const[autresLocaux,setAutresLocaux]=useState([]);
 useEffect(()=>{if(!ajoutVisible)return;let alive=true;listerEquipementsAutresLocaux(visiteId).then(rows=>{if(alive)setAutresLocaux(rows)}).catch(console.warn);return()=>{alive=false}},[ajoutVisible,visiteId]);
 const comptes=useMemo(()=>({'a-voir':materiel.filter(i=>etatPointageEquipement(i)==='a-voir').length,vus:materiel.filter(i=>etatPointageEquipement(i)==='vus').length,nouveaux:materiel.filter(i=>etatPointageEquipement(i)==='nouveaux').length,tous:materiel.length}),[materiel]);
 const materielFiltres=useMemo(()=>{
  const q=norm(recherche);
  return materiel.filter(item=>(filtre==='tous'||etatPointageEquipement(item)===filtre)&&(!q||norm([item.designation,item.categorie,item.reseau_desservi,item.marque,item.modele,item.numero_materiel,item.caracteristiques].filter(Boolean).join(' ')).includes(q)));
 },[materiel,recherche,filtre]);
 const liste=useMemo(()=>{const groups=new Map();materielFiltres.forEach(i=>{const key=i.categorie||'Équipements';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i)});return [...groups].flatMap(([titre,items])=>[{id:`group:${titre}`,titre,items},...items])},[materielFiltres]);
 const{listRef,onScroll}=useListScrollMemory(`visit-panel:${visiteId}:p-equip`,materielFiltres.length);
 const charger=useCallback(async()=>setMateriel(await listerEquipementsPointage(visiteId)),[visiteId]);
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
 const creer=async(type,sourceId=null)=>{if(creation)return;setCreation(true);try{const id=sourceId?await dupliquerEquipementVisite(visiteId,sourceId):await creerEquipementVisite(visiteId);if(type){await upsertMaterielChamp(id,'categorie',type);await upsertMaterielChamp(id,'designation',type)}setRecherche('');setFiltre('nouveaux');setAjoutVisible(false);await charger()}catch(e){Alert.alert('Ajout impossible',String(e?.message||e))}finally{setCreation(false)}};
 return <View style={{flex:1}}>
  <FlatList
   ref={listRef}
   data={liste}
   onScroll={onScroll}
   scrollEventThrottle={100}
   keyExtractor={i=>i.id}
   renderItem={({item})=>item.items?<View style={{flexDirection:'row',alignItems:'center',marginVertical:12,gap:8}}><CvcIcon name="equipment" size={22} color={COLORS.orange}/><Text style={[styles.fieldLabel,{flex:1}]}>{item.titre} · {item.items.length}</Text><TouchableOpacity onPress={async()=>{try{for(const i of item.items)await confirmerEquipementVisite(visiteId,i.id);await charger()}catch(e){await charger();Alert.alert('Pointage incomplet',String(e?.message||e))}}}><Text style={{fontFamily:FONTS.bodyBold,color:COLORS.orange}}>Tout présent</Text></TouchableOpacity></View>:<EquipmentCard item={item} visiteId={visiteId} onChange={charger} types={types} marques={marques} catalogue={catalogue} trameId={trameId}/>}
   contentContainerStyle={[styles.panelContent,{paddingBottom:200}]}
   ListHeaderComponent={<View>
    <View style={[styles.formCard,{flexDirection:'row',alignItems:'center',gap:12}]}><ProgressRing pct={materiel.length?100*materiel.filter(i=>i.confirme_le).length/materiel.length:0} size={54} strokeWidth={5}/><View style={{flex:1}}><Text style={styles.cardTitle}>{materiel.filter(i=>i.confirme_le).length} sur {materiel.length} pointés</Text><Text style={styles.importHint}>{comptes['a-voir']} équipement(s) repris à confirmer</Text></View></View>
    <TextInput style={[styles.input,{marginBottom:10}]} value={recherche} onChangeText={setRecherche} placeholder="Rechercher un équipement déjà ajouté…" autoCorrect={false}/>
    <View style={{flexDirection:'row',gap:4,marginBottom:8}}>{[['a-voir','À voir'],['vus','Vus'],['nouveaux','Nouv.'],['tous','Tous']].map(([id,label])=><TouchableOpacity key={id} onPress={()=>setFiltre(id)} style={[filtre===id?styles.btnPrimary:styles.btnSecondary,{minHeight:44,paddingHorizontal:7}]}>{filtre===id?<ButtonGlow/>:null}<Text style={filtre===id?styles.btnPrimaryText:styles.btnSecondaryText}>{label} {comptes[id]}</Text></TouchableOpacity>)}</View>
    <Text style={styles.importHint}>{trameId==='reseau_chaleur_v1'?'Touchez un équipement pour ses détails. Chaque équipement doit être classé Primaire ou Secondaire.':'Touchez un équipement pour afficher ou masquer sa fiche complète.'}</Text>
   </View>}
   ListEmptyComponent={<View style={{paddingVertical:24}}><Text style={{textAlign:'center',color:COLORS.muted}}>{recherche?'Aucun équipement ne correspond à la recherche.':'Aucun équipement pour cette visite.'}</Text></View>}
   initialNumToRender={8}
   maxToRenderPerBatch={8}
   windowSize={6}
   removeClippedSubviews={false}
   keyboardShouldPersistTaps="handled"
  />
  <TouchableOpacity
   accessibilityRole="button"
   accessibilityLabel="Ajouter un équipement"
   activeOpacity={0.78}
   onPress={()=>setAjoutVisible(true)}
   style={[styles.btnPrimary,{position:'absolute',right:18,left:18,bottom:18,flexDirection:'row',gap:8}]}
  ><ButtonGlow/><CvcIcon name="plus-plain" size={22} color="#fff"/><Text style={styles.btnPrimaryText}>Ajouter un équipement</Text></TouchableOpacity>
  <Modal visible={ajoutVisible} transparent animationType="slide" onRequestClose={()=>setAjoutVisible(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
   <Text style={styles.modalTitle}>Ajouter un équipement</Text><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.fieldLabel}>Le plus rapide</Text>
   {materiel.slice(0,3).map(i=><TouchableOpacity key={i.id} disabled={creation} style={styles.biblioRow} onPress={()=>creer(null,i.id)}><View style={{flexDirection:'row',gap:10,alignItems:'center'}}><CvcIcon name="copy" size={22} color={COLORS.orange}/><View style={{flex:1}}><Text style={styles.biblioRowTitle}>Dupliquer {i.designation||i.categorie}</Text><Text style={styles.importHint}>Même marque et modèle · série et état à vérifier</Text></View></View></TouchableOpacity>)}
   <TouchableOpacity disabled={creation} style={[styles.btnSecondary,{marginTop:8,flexDirection:'row',gap:10}]} onPress={()=>creer(null)}><CvcIcon name="camera" size={23} color={COLORS.orange}/><View style={{flex:1}}><Text style={styles.btnSecondaryText}>Lire la plaque signalétique</Text><Text style={styles.importHint}>Créer une fiche puis photographier la plaque</Text></View></TouchableOpacity>
   <Text style={[styles.fieldLabel,{marginTop:14}]}>Par type</Text><View style={styles.catalogueChoiceGrid}>{['Chaudière','Circulateur','Échangeur',"Vase d'expansion",'VMC','Ballon ECS'].map(t=><TouchableOpacity key={t} disabled={creation} style={styles.catalogueChoice} onPress={()=>creer(t)}><Text style={styles.catalogueFilterText}>{t}</Text></TouchableOpacity>)}</View>
   <TouchableOpacity disabled={creation} style={[styles.btnSecondary,{marginTop:12}]} onPress={()=>creer(null)}><Text style={styles.btnSecondaryText}>Autre type ou modèle du catalogue…</Text></TouchableOpacity>
   <Text style={[styles.importHint,{marginTop:10}]}>La lecture de plaque est disponible dans la fiche du nouvel équipement.</Text>
   {autresLocaux.length?<View style={{marginTop:12}}><Text style={styles.fieldLabel}>Retrouvé ailleurs sur le site</Text>{autresLocaux.map(e=><TouchableOpacity key={e.id} style={styles.biblioRow} onPress={()=>Alert.alert('Rattacher au local actuel ?',`« ${e.designation||e.type_code} » sera déplacé depuis ${e.nom_local} vers le local de cette visite. Les anciennes visites garderont leur historique.`,[{text:'Annuler',style:'cancel'},{text:'Rattacher',onPress:async()=>{try{await rattacherEquipementAuLocal(visiteId,e.id);setFiltre('a-voir');setAjoutVisible(false);await charger()}catch(err){Alert.alert('Rattachement impossible',String(err?.message||err))}}}])}><Text style={styles.biblioRowTitle}>{e.designation||e.type_code}</Text><Text style={styles.importHint}>{e.nom_local} · {[e.marque,e.modele].filter(Boolean).join(' · ')}</Text></TouchableOpacity>)}</View>:null}
   </ScrollView>
   <TouchableOpacity disabled={creation} style={[styles.btnSecondary,{marginTop:14}]} onPress={()=>setAjoutVisible(false)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
  </View></View></Modal>
 </View>;
}
