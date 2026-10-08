/**
 * Onglet Équipements (refonte du build 661, docs/refonte-visite-661/README.md §5.6).
 *
 * - en-tête condensé sur une ligne : jauge « x / y vus », recherche en icône,
 *   « Ajouter » ; puis le filtre À voir / Vus / Nouv. / Tous ;
 * - groupes par type (`categorie`) en cartes à bannière, FERMÉS au départ,
 *   « Tout présent » avec « Annuler » ;
 * - une ligne par équipement : rond de présence (un toucher = présent, un
 *   second = annule), nom, « marque modèle · réseau », pastille d'état ;
 * - la fiche s'ouvre en feuille du bas : photos et « Lire la plaque » en
 *   premier, présence, UN SEUL état constaté (valeurs Intranet), recherche
 *   unique marque + modèle dans le catalogue (remplit aussi le type).
 *
 * Les clés stockées (table `materiel`, champs autorisés par
 * `upsertMaterielPersistant`, `confirme_le`) ne changent pas.
 */
import React,{memo,useCallback,useEffect,useMemo,useState}from'react';
import{Alert,FlatList,StyleSheet,Text,TextInput,TouchableOpacity,View}from'react-native';
import{upsertMaterielChamp,supprimerMateriel,listerBibliothequeEquipements,listerCategoriesEquipement,listerHistoriqueEquipement,listerPhotos}from'./db.js';
import{ensureEquipmentCatalogReady}from'./database/index.js';
import{useDurableAutosave,flushDurableAutosaves}from'./durableAutosave.js';
import{PhotoButton}from'./PhotoButton.js';
import{BrandMark}from'./BrandLogo.js';
import{COLORS,FONTS,styles}from'./styles.js';
import{useListScrollMemory}from'./useListScrollMemory.js';
import{listerEquipementsPointage,confirmerEquipementVisite,annulerPresenceEquipements,dupliquerEquipementVisite,creerEquipementVisite,listerEquipementsAutresLocaux,rattacherEquipementAuLocal}from'./terrainVisitDb.js';
import{etatPointageEquipement}from'./terrainVisitModel.js';
import{LecturePhotoButton}from'./PhotoOcrReview.js';
import{PhotoVariantImage}from'./PhotoVariantImage.js';
import{CvcIcon}from'./MetraCvcIcons.js';
import{ProgressRing}from'./premiumChrome.js';
import{ButtonGlow}from'./ButtonGlow.js';
import{Picto,pictoEquipement,pictoEtatEquipement}from'./MetraPictos.js';
import{BottomSheet,ChoiceField,FilterSeg,KIT,SectionCard,SmallButton,confirmer as demanderConfirmation,useSectionsOuvertes}from'./VisitKit.js';
import{showToast}from'./PremiumDialogs.js';
import{hapticSuccess,hapticTick}from'./fieldFeedback.js';

const TYPES=['VMC','CTA','Ventilateur','Tourelle','Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Compteur','Désemboueur','Détendeur','Échangeur','Filtre','Manomètre','Pompe','Soupape','Vanne',"Vase d'expansion"];
// États acceptés par l'Intranet (README §12.3). Une valeur ancienne hors liste
// reste affichée par ChoiceField et peut être retirée ou remplacée.
const ETATS=['Neuf','Bon','Moyen','Vétuste','Hors service'];
const TYPES_RAPIDES=['Chaudière','Circulateur','Échangeur',"Vase d'expansion",'VMC','Ballon ECS'];
const FILTRES=[['a-voir','À voir'],['vus','Vus'],['nouveaux','Nouv.'],['tous','Tous']];
const RC='reseau_chaleur_v1';
const HIT={top:10,bottom:10,left:10,right:10};
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const eq=(a,b)=>norm(a)===norm(b);
const uniq=a=>[...new Set((a||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
const nomModele=e=>String(e?.nom||e?.modele||'').trim();
const entiteKey=item=>item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`;
const nomEquipement=item=>String(item?.designation||'').trim()||String(item?.categorie||'').trim()||'Nouvel équipement';
const estPresent=item=>!!item.confirme_le;
const pluriel=(n,mot)=>`${n} ${mot}${n>1?'s':''}`;

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

/**
 * Annule le pointage « présent » de cette visite (second toucher sur le rond,
 * ou « Annuler » après « Tout présent »). Inverse exact de
 * `confirmerEquipementVisite` : seule la colonne `confirme_le` de la ligne de
 * visite est remise à NULL, l'état constaté et l'historique ne bougent pas.
 */
function tonEtat(etat){
 const t=norm(etat);
 if(t==='neuf'||t==='bon')return{bg:KIT.greenBg,fg:KIT.green};
 if(t==='moyen')return{bg:KIT.amberBg,fg:KIT.amber};
 if(t==='vetuste'||t==='hors service')return{bg:KIT.redBg,fg:KIT.red};
 return{bg:'rgba(22,21,15,0.06)',fg:COLORS.inkSoft};
}

function EtatPill({etat,nouveau}){
 if(nouveau)return <View style={[s.pill,{backgroundColor:COLORS.orangeLight}]}><Picto name={pictoEtatEquipement('nouveau')} size={12} mono={COLORS.orangeDark}/><Text style={[s.pillText,{color:COLORS.orangeDark}]}>Nouveau</Text></View>;
 if(!etat)return null;
 const t=tonEtat(etat);
 return <View style={[s.pill,{backgroundColor:t.bg}]}><Picto name={pictoEtatEquipement(etat)} size={12} mono={t.fg}/><Text numberOfLines={1} style={[s.pillText,{color:t.fg}]}>{etat}</Text></View>;
}

/** Choix dans une liste avec recherche (type d'équipement). */
function PickerSheet({visible,titre,options,valeur,onClose,onPick,emptyText='Aucune proposition'}){
 const[recherche,setRecherche]=useState('');
 useEffect(()=>{if(visible)setRecherche('')},[visible]);
 const data=useMemo(()=>{
  const q=norm(recherche);
  return (q?options.filter(v=>norm(v).includes(q)):options).slice(0,120);
 },[options,recherche]);
 return <BottomSheet visible={visible} onClose={onClose} title={titre} maxHeight="78%">
  <TextInput style={styles.input} value={recherche} onChangeText={setRecherche} placeholder={`Rechercher ${titre.toLowerCase()}…`} placeholderTextColor={COLORS.inkFaint} autoCorrect={false}/>
  {data.length?data.map(item=>{const on=eq(item,valeur);return <TouchableOpacity key={item} onPress={()=>{onPick(item);onClose()}} accessibilityRole="button" accessibilityState={{selected:on}} style={s.pickRow}>
   <Picto name={pictoEquipement(item)} size={20}/>
   <Text style={[s.pickText,on&&{color:COLORS.orangeDark,fontFamily:FONTS.bodyBold}]}>{item}</Text>
   {on?<CvcIcon name="check" size={18} color={COLORS.orangeDark} strokeWidth={2.4}/>:null}
  </TouchableOpacity>}):<Text style={s.empty}>{emptyText}</Text>}
 </BottomSheet>;
}

/** Une ligne d'équipement (≈ 54 px). */
const EquipmentRow=memo(function EquipmentRow({item,first,reseauChaleur,onTogglePresence,onOpen}){
 const nouveau=etatPointageEquipement(item)==='nouveaux';
 const present=estPresent(item);
 const plein=present||nouveau;
 const sous=[[item.marque,item.modele].filter(Boolean).join(' ')||'Marque · modèle à compléter',item.reseau_desservi].filter(Boolean).join(' · ');
 const nom=nomEquipement(item);
 return <View style={[s.row,!first&&s.rowSep]}>
  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:plein}} accessibilityLabel={nouveau?`${nom}, ajouté pendant cette visite`:present?`${nom}, présent. Toucher pour annuler`:`${nom}, marquer présent`} onPress={()=>onTogglePresence(item)} hitSlop={HIT} style={[s.circle,plein&&{backgroundColor:nouveau&&!present?COLORS.orange:KIT.green,borderColor:'transparent'}]}>
   {plein?<CvcIcon name="check" size={16} color={COLORS.white} strokeWidth={2.8}/>:null}
  </TouchableOpacity>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom}, ouvrir la fiche`} activeOpacity={0.7} onPress={()=>onOpen(item.id)} style={s.rowMain}>
   <View style={{flex:1,minWidth:0}}>
    <Text numberOfLines={1} style={s.rowTitle}>{nom}</Text>
    <Text numberOfLines={1} style={s.rowSub}>{sous}{reseauChaleur?<Text style={item.perimetre?null:{color:KIT.amber}}>{` · ${item.perimetre||'Primaire / Secondaire à choisir'}`}</Text>:null}</Text>
   </View>
   <EtatPill etat={item.etat} nouveau={nouveau}/>
   <CvcIcon name="chevron-right" size={17} color={COLORS.inkFaint} strokeWidth={2.2}/>
  </TouchableOpacity>
 </View>;
});

/** Fiche équipement en feuille du bas. */
function EquipmentSheet({item,visiteId,onChange,onClose,onTogglePresence,types,catalogue,catalogueIndex,trameId}){
 const reseauChaleur=trameId===RC;
 const nouveau=etatPointageEquipement(item)==='nouveaux';
 const present=estPresent(item);
 const[categorie,setCategorie]=useState(item.categorie||'');
 const[etat,setEtat]=useState(item.etat||'');
 const[perimetre,setPerimetre]=useState(item.perimetre||'');
 const[pickerType,setPickerType]=useState(false);
 const[rechercheCat,setRechercheCat]=useState('');
 const[saisieManuelle,setSaisieManuelle]=useState(false);
 const[details,setDetails]=useState(false);
 const[histoOuvert,setHistoOuvert]=useState(false);
 const[historique,setHistorique]=useState([]),[photos,setPhotos]=useState([]);
 const cle=entiteKey(item);
 const chargerPhotos=useCallback(()=>listerPhotos(visiteId).then(p=>setPhotos(p.filter(x=>x.entite_key===cle))).catch(console.warn),[visiteId,cle]);
 useEffect(()=>{let alive=true;(item.equipement_id?listerHistoriqueEquipement(item.equipement_id):Promise.resolve([])).then(h=>{if(alive)setHistorique((h||[]).filter(x=>x.visite_id!==visiteId))}).catch(console.warn);chargerPhotos();return()=>{alive=false}},[item.equipement_id,visiteId,chargerPhotos]);
 const[designation,setDesignation,blurDesignation,setDesignationNow]=useDurableAutosave(item.designation,v=>upsertMaterielChamp(item.id,'designation',v));
 const[marque,setMarque,blurMarque,setMarqueNow]=useDurableAutosave(item.marque,v=>upsertMaterielChamp(item.id,'marque',v));
 const[modele,setModele,blurModele,setModeleNow]=useDurableAutosave(item.modele,v=>upsertMaterielChamp(item.id,'modele',v));
 const[annee,setAnnee,blurAnnee]=useDurableAutosave(item.annee,v=>upsertMaterielChamp(item.id,'annee',v));
 const[nombre,setNombre,blurNombre]=useDurableAutosave(item.nombre,v=>upsertMaterielChamp(item.id,'nombre',v));
 const[numero,setNumero,blurNumero]=useDurableAutosave(item.numero_materiel,v=>upsertMaterielChamp(item.id,'numero_materiel',v));
 const[reseau,setReseau,blurReseau]=useDurableAutosave(item.reseau_desservi,v=>upsertMaterielChamp(item.id,'reseau_desservi',v));
 const[caracteristiques,setCaracteristiques,blurCaracteristiques]=useDurableAutosave(item.caracteristiques,v=>upsertMaterielChamp(item.id,'caracteristiques',v));
 useEffect(()=>{setCategorie(item.categorie||'');setEtat(item.etat||'');setPerimetre(item.perimetre||'')},[item.categorie,item.etat,item.perimetre]);

 const marqueLogo=useMemo(()=>{
  const match=catalogue.find(e=>marque&&eq(e.marque,marque)&&e.logo_uri);
  if(match?.logo_uri)return match.logo_uri;
  return eq(marque,item.marque)?(item.marque_logo_uri||null):null;
 },[catalogue,marque,item.marque,item.marque_logo_uri]);

 // Recherche unique marque + modèle (+ type, référence) dans le catalogue local.
 const suggestions=useMemo(()=>{
  const q=norm(rechercheCat);
  if(q.length<2)return[];
  const mots=q.split(/\s+/).filter(Boolean);
  const vus=new Set(),out=[];
  for(const{e,h}of catalogueIndex){
   if(!mots.every(m=>h.includes(m)))continue;
   const k=`${norm(e.categorie)}|${norm(e.marque)}|${norm(nomModele(e))}`;
   if(vus.has(k))continue;vus.add(k);out.push(e);
   if(out.length>=8)break;
  }
  return out;
 },[catalogueIndex,rechercheCat]);

 const changerType=async(t,ancien)=>{
  setCategorie(t);
  await upsertMaterielChamp(item.id,'categorie',t);
  if(!designation||eq(designation,'Équipement')||eq(designation,ancien))await setDesignationNow(t||'Équipement');
 };
 const choisirType=async v=>{
  const ancien=categorie;
  const t=String(v||'').trim();
  await changerType(t,ancien);
  const refsNouveau=catalogue.filter(e=>typeCompatible(t,e.categorie));
  if(marque&&refsNouveau.length&&!refsNouveau.some(e=>eq(e.marque,marque))){await setMarqueNow('');await setModeleNow('')}
  else if(modele&&refsNouveau.length&&!refsNouveau.some(e=>eq(e.marque,marque)&&eq(nomModele(e),modele)))await setModeleNow('');
  await onChange();
 };
 const choisirReference=async e=>{
  try{
   hapticTick();
   const t=String(e.categorie||'').trim();
   if(t&&(!categorie||!typeCompatible(categorie,t)))await changerType(t,categorie);
   await setMarqueNow(String(e.marque||'').trim());
   await setModeleNow(nomModele(e));
   setRechercheCat('');setSaisieManuelle(false);
   await onChange();
  }catch(err){Alert.alert('Sauvegarde impossible',String(err?.message||err))}
 };
 const sauverEtat=async v=>{setEtat(v);await upsertMaterielChamp(item.id,'etat',v);await onChange()};
 const sauverPerimetre=async v=>{setPerimetre(v);await upsertMaterielChamp(item.id,'perimetre',v);await onChange()};
 const retirer=()=>demanderConfirmation({title:'Retiré du site ?',message:`Confirmer le retrait de « ${designation||categorie||'Équipement'} » du patrimoine de ce local. Les visites précédentes gardent leur historique.`,label:'Retirer',onConfirm:async()=>{try{await flushDurableAutosaves();await supprimerMateriel(item.id);onClose({retire:true});await onChange()}catch(e){Alert.alert('Retrait impossible',String(e?.message||e))}}});
 const etatHorsListe=etat&&!ETATS.some(x=>eq(x,etat));
 const dernier=historique[0];

 return <BottomSheet visible onClose={()=>onClose()} title={designation||categorie||'Nouvel équipement'} picto={pictoEquipement(categorie)} subtitle={nouveau?'Ajouté pendant cette visite':item.deja_reference?(Number(item.nb_observations)>0?`Repris du local · ${pluriel(Number(item.nb_observations),'observation')}`:'Repris du local'):null}
  footer={<View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={retirer}><Text style={[styles.btnSecondaryText,{color:KIT.red}]}>Retiré du site</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={()=>onClose()}><ButtonGlow/><Text style={styles.btnPrimaryText}>Terminé</Text></TouchableOpacity></View>}>
  {/* 1. Photos et lecture de plaque */}
  <View style={s.photoRow}>
   {photos.slice(-2).map(p=><PhotoVariantImage key={p.id} uri={p.uri} style={s.thumb}/>)}
   <PhotoButton visiteId={visiteId} entiteKey={cle} label={designation||categorie||'Équipement'} onPhotoSaved={chargerPhotos}/>
   <View style={{flex:1,minWidth:0}}>
    <LecturePhotoButton visiteId={visiteId} entiteKey={cle} label={`${designation||categorie||'Équipement'} · plaque`} kind="plate" current={{marque,modele,numero_materiel:numero,annee,caracteristiques}} onApply={async values=>{await flushDurableAutosaves();for(const[key,value]of Object.entries(values))await upsertMaterielChamp(item.id,key,value);await onChange();chargerPhotos()}}/>
   </View>
  </View>

  {/* 2. Présence (et périmètre exigé en Réseau de chaleur) */}
  {nouveau&&!present?<View style={[s.presence,s.presenceNew]}><CvcIcon name="check" size={16} color={COLORS.orangeDark} strokeWidth={2.6}/><Text style={[s.presenceText,{color:COLORS.orangeDark}]}>Ajouté pendant cette visite</Text></View>
   :<TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:present}} onPress={()=>onTogglePresence(item,{depuisFiche:true})} style={[s.presence,present&&s.presenceOn]}>
    <CvcIcon name="check" size={16} color={present?COLORS.white:COLORS.inkSoft} strokeWidth={2.6}/>
    <Text style={[s.presenceText,present&&{color:COLORS.white}]}>{present?'Présent · toucher pour annuler':'Marquer présent'}</Text>
   </TouchableOpacity>}
  {reseauChaleur?<ChoiceField label="Périmètre · obligatoire" value={perimetre} options={['Primaire','Secondaire']} segments onChange={sauverPerimetre} picto={perimetre==='Secondaire'?'res/secondaire':'res/primaire'}/>:null}
  {reseauChaleur&&!perimetre?<Text style={[styles.importHint,{color:KIT.amber}]}>Choisis Primaire ou Secondaire avant de confirmer la présence. Ce classement est propre à la trame Réseau de chaleur.</Text>:null}

  {/* 3. Un seul état constaté */}
  <ChoiceField label="État constaté" value={etat} options={ETATS} onChange={sauverEtat} allowOther={false} segments={false} hint="Choisir"/>
  {etatHorsListe?<Text style={[styles.importHint,{color:KIT.amber}]}>« {etat} » n’est pas accepté par l’Intranet : choisis Neuf, Bon, Moyen, Vétuste ou Hors service avant l’envoi.</Text>:null}

  {/* 4. Identification : recherche unique dans le catalogue */}
  <Text style={[styles.fieldLabel,{marginTop:12}]}>Identification</Text>
  <View style={s.searchBox}>
   <CvcIcon name="search" size={17} color={COLORS.inkFaint} strokeWidth={2.2}/>
   <TextInput style={s.searchInput} value={rechercheCat} onChangeText={setRechercheCat} placeholder="Rechercher marque ou modèle…" placeholderTextColor={COLORS.inkFaint} autoCorrect={false} accessibilityLabel="Rechercher dans le catalogue"/>
   {rechercheCat?<TouchableOpacity accessibilityLabel="Effacer la recherche" onPress={()=>setRechercheCat('')} hitSlop={HIT}><CvcIcon name="close" size={16} color={COLORS.inkSoft} strokeWidth={2.2}/></TouchableOpacity>:null}
  </View>
  {rechercheCat.trim().length>=2?<View style={s.suggestions}>
   {suggestions.length?suggestions.map(e=><TouchableOpacity key={e.id||`${e.marque}|${nomModele(e)}|${e.categorie}`} onPress={()=>choisirReference(e)} style={s.suggestion} accessibilityRole="button">
    <Picto name={pictoEquipement(e.categorie)} size={18}/>
    <Text numberOfLines={1} style={s.suggestionText}>{e.marque} {nomModele(e)}<Text style={s.suggestionType}>{` · ${e.categorie||''}`}</Text></Text>
   </TouchableOpacity>):<Text style={s.empty}>Aucune référence dans le catalogue. Saisis la marque et le modèle à la main.</Text>}
  </View>:null}
  <View style={s.identite}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Type : ${categorie||'à choisir'}, changer`} onPress={()=>setPickerType(true)} style={s.identiteType}>
    <Picto name={pictoEquipement(categorie)} size={22}/>
    <View style={{minWidth:0,flexShrink:1}}><Text style={s.identiteLabel}>Type</Text><Text numberOfLines={2} style={s.identiteValue}>{categorie||'À choisir'}</Text></View>
   </TouchableOpacity>
   <View style={s.identiteCol}><Text style={s.identiteLabel}>Marque</Text><View style={{flexDirection:'row',alignItems:'center',gap:6}}>{marque?<BrandMark marque={{marque,logo_uri:marqueLogo}} compact/>:null}<Text numberOfLines={2} style={[s.identiteValue,{flexShrink:1}]}>{marque||'—'}</Text></View></View>
   <View style={s.identiteCol}><Text style={s.identiteLabel}>Modèle</Text><Text numberOfLines={2} style={s.identiteValue}>{modele||'—'}</Text></View>
  </View>
  <View style={{flexDirection:'row',justifyContent:'flex-end',marginTop:6}}>
   <SmallButton label={saisieManuelle?'Masquer la saisie':'Saisir à la main'} icon="edit" onPress={()=>setSaisieManuelle(v=>!v)}/>
  </View>
  {saisieManuelle?<View style={{flexDirection:'row',gap:8,marginTop:6}}>
   <View style={{flex:1}}><Text style={styles.fieldLabel}>Marque</Text><TextInput style={styles.input} value={marque} onChangeText={setMarque} onBlur={blurMarque} placeholder="Ex. Viessmann" placeholderTextColor={COLORS.inkFaint}/></View>
   <View style={{flex:1}}><Text style={styles.fieldLabel}>Modèle</Text><TextInput style={styles.input} value={modele} onChangeText={setModele} onBlur={blurModele} placeholder="Référence exacte" placeholderTextColor={COLORS.inkFaint}/></View>
  </View>:null}

  {/* 5. Désignation, nombre, réseau */}
  <View style={{marginTop:10}}><Text style={styles.fieldLabel}>Désignation</Text><TextInput style={styles.input} value={designation} onChangeText={setDesignation} onBlur={blurDesignation} placeholder={categorie?`Ex. ${categorie} 1`:'Désignation'} placeholderTextColor={COLORS.inkFaint}/></View>
  <View style={{marginTop:8,flexDirection:'row',gap:8}}>
   <View style={{width:92}}><Text style={styles.fieldLabel}>Nombre</Text><TextInput style={styles.input} value={nombre} onChangeText={setNombre} onBlur={blurNombre} placeholder="Ex. 2" placeholderTextColor={COLORS.inkFaint}/></View>
   <View style={{flex:1}}><Text style={styles.fieldLabel}>Réseau desservi</Text><TextInput style={styles.input} value={reseau} onChangeText={setReseau} onBlur={blurReseau} placeholder="Ex. Bâtiment A" placeholderTextColor={COLORS.inkFaint}/></View>
  </View>

  {/* Détails complémentaires (remplis aussi par la lecture de plaque) */}
  <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:details}} onPress={()=>setDetails(v=>!v)} style={s.fold}>
   <Text style={s.foldText}>Année, n° de série, caractéristiques{!details&&[annee,numero,caracteristiques].filter(Boolean).length?` · ${[annee,numero,caracteristiques].filter(Boolean).join(' · ')}`:''}</Text>
   <CvcIcon name={details?'chevron-up':'chevron-down'} size={17} color={COLORS.inkSoft} strokeWidth={2.2}/>
  </TouchableOpacity>
  {details?<View>
   <View style={{flexDirection:'row',gap:8}}>
    <View style={{width:110}}><Text style={styles.fieldLabel}>Année</Text><TextInput style={styles.input} value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" placeholder="Année" placeholderTextColor={COLORS.inkFaint}/></View>
    <View style={{flex:1}}><Text style={styles.fieldLabel}>N° matériel</Text><TextInput style={styles.input} value={numero} onChangeText={setNumero} onBlur={blurNumero} placeholder="Ex. CHA-001" placeholderTextColor={COLORS.inkFaint}/></View>
   </View>
   <View style={{marginTop:8}}><Text style={styles.fieldLabel}>Caractéristiques</Text><TextInput style={styles.input} value={caracteristiques} onChangeText={setCaracteristiques} onBlur={blurCaracteristiques} placeholder="Ex. 500 kW" placeholderTextColor={COLORS.inkFaint}/></View>
  </View>:null}

  {/* Historique replié */}
  {historique.length?<>
   <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:histoOuvert}} onPress={()=>setHistoOuvert(v=>!v)} style={s.fold}>
    <Text style={s.foldText}>Historique · vu le {dernier?.date_visite||'—'}{dernier?.etat?` · état ${dernier.etat}`:''}</Text>
    <CvcIcon name={histoOuvert?'chevron-up':'chevron-down'} size={17} color={COLORS.inkSoft} strokeWidth={2.2}/>
   </TouchableOpacity>
   {histoOuvert?historique.slice(0,5).map(h=><View key={h.id} style={s.histoRow}><Text style={s.histoText}>{h.date_visite}{h.commentaire?` · ${h.commentaire}`:''}</Text><Text style={s.histoEtat}>{h.etat||'Non renseigné'}</Text></View>):null}
  </>:null}

  <PickerSheet visible={pickerType} titre="Type d’équipement" options={types} valeur={categorie} onClose={()=>setPickerType(false)} onPick={choisirType}/>
 </BottomSheet>;
}

export function GuidedEquipmentPanel({visiteId,trameId='icpe_v1'}){
 const reseauChaleur=trameId===RC;
 const[materiel,setMateriel]=useState([]),[types,setTypes]=useState(TYPES),[catalogue,setCatalogue]=useState([]);
 const[recherche,setRecherche]=useState(''),[rechercheOuverte,setRechercheOuverte]=useState(false);
 const[filtre,setFiltre]=useState('a-voir'),[ajoutVisible,setAjoutVisible]=useState(false),[creation,setCreation]=useState(false);
 const[ficheId,setFicheId]=useState(null);
 const[autresLocaux,setAutresLocaux]=useState([]);
 const sections=useSectionsOuvertes(`visit-equip:${visiteId}`);
 useEffect(()=>{if(!ajoutVisible)return;let alive=true;listerEquipementsAutresLocaux(visiteId).then(rows=>{if(alive)setAutresLocaux(rows)}).catch(console.warn);return()=>{alive=false}},[ajoutVisible,visiteId]);
 const comptes=useMemo(()=>({'a-voir':materiel.filter(i=>etatPointageEquipement(i)==='a-voir').length,vus:materiel.filter(i=>etatPointageEquipement(i)==='vus').length,nouveaux:materiel.filter(i=>etatPointageEquipement(i)==='nouveaux').length,tous:materiel.length}),[materiel]);
 const q=norm(recherche);
 const groupes=useMemo(()=>{
  const map=new Map();
  for(const i of materiel){const key=String(i.categorie||'').trim()||'Équipements';if(!map.has(key))map.set(key,{titre:key,tous:[],visibles:[]});map.get(key).tous.push(i)}
  for(const g of map.values())g.visibles=g.tous.filter(item=>(filtre==='tous'||etatPointageEquipement(item)===filtre)&&(!q||norm([item.designation,item.categorie,item.reseau_desservi,item.marque,item.modele,item.numero_materiel,item.caracteristiques].filter(Boolean).join(' ')).includes(q)));
  return [...map.values()].filter(g=>g.visibles.length).map(g=>({...g,id:`type:${g.titre}`}));
 },[materiel,filtre,q]);
 const nbVisibles=useMemo(()=>groupes.reduce((n,g)=>n+g.visibles.length,0),[groupes]);
 const catalogueIndex=useMemo(()=>catalogue.map(e=>({e,h:norm(`${e.marque||''} ${nomModele(e)} ${e.reference||''} ${e.categorie||''}`)})),[catalogue]);
 const{listRef,onScroll}=useListScrollMemory(`visit-panel:${visiteId}:p-equip`,nbVisibles);
 const charger=useCallback(async()=>setMateriel(await listerEquipementsPointage(visiteId)),[visiteId]);
 useEffect(()=>{charger()},[charger]);
 useEffect(()=>{let actif=true;(async()=>{
  try{
   // Le gros catalogue VMC/CTA est enrichi à la demande pour rester offline-first
   // sans ralentir l'ouverture de toute l'application.
   await ensureEquipmentCatalogReady();
   const[c,r]=await Promise.all([listerCategoriesEquipement(),listerBibliothequeEquipements()]);
   if(!actif)return;
   setTypes(uniq([...TYPES,...c.map(x=>x.nom)]));
   setCatalogue(r||[]);
  }catch(e){console.warn('Catalogue équipements non chargé',e)}
 })();return()=>{actif=false}},[]);

 const ouvrirFiche=useCallback(id=>setFicheId(id),[]);
 const fermerFiche=useCallback(async({retire}={})=>{
  const item=materiel.find(i=>i.id===ficheId);
  setFicheId(null);
  try{await flushDurableAutosaves();if(!retire)await charger()}catch(e){Alert.alert('Sauvegarde impossible',String(e?.message||e))}
  if(item&&!retire)sections.open([`type:${String(item.categorie||'').trim()||'Équipements'}`]);
 },[materiel,ficheId,charger,sections]);

 /** Rond de présence : un toucher = présent, un second = annule. */
 const basculerPresence=useCallback(async(item,{depuisFiche=false}={})=>{
  if(etatPointageEquipement(item)==='nouveaux'&&!item.confirme_le){setFicheId(item.id);return}
  hapticTick();
  if(item.confirme_le){
   setMateriel(list=>list.map(i=>i.id===item.id?{...i,confirme_le:null}:i));
   try{await annulerPresenceEquipements(visiteId,[item.id])}catch(e){Alert.alert('Pointage impossible',String(e?.message||e))}
   await charger();return;
  }
  if(reseauChaleur&&!item.perimetre&&!depuisFiche){
   // Règle Réseau de chaleur (confirmerEquipementVisite) : périmètre exigé.
   showToast('Choisis Primaire ou Secondaire dans la fiche avant de confirmer.',{tone:'error',duration:4000});
   setFicheId(item.id);return;
  }
  setMateriel(list=>list.map(i=>i.id===item.id?{...i,confirme_le:new Date().toISOString()}:i));
  try{
   await flushDurableAutosaves();
   await confirmerEquipementVisite(visiteId,item.id);
   if(filtre==='a-voir'&&!depuisFiche)showToast(`${nomEquipement(item)} : présent`,{tone:'success',duration:4000,action:{label:'Annuler',onPress:async()=>{try{await annulerPresenceEquipements(visiteId,[item.id])}finally{await charger()}}}});
  }catch(e){
   // Hors de la fiche, on l'ouvre pour classer Primaire / Secondaire ; dans
   // la fiche (fenêtre modale), un toast serait masqué : alerte native.
   if(depuisFiche)Alert.alert('Pointage impossible',String(e?.message||e));
   else{showToast(String(e?.message||e),{tone:'error',duration:4000});setFicheId(item.id)}
  }
  await charger();
 },[visiteId,charger,filtre,reseauChaleur]);

 /** « Tout présent » d'un type ; en Réseau de chaleur, seuls ceux qui ont un périmètre. */
 const toutPresent=useCallback(async groupe=>{
  const aVoir=groupe.tous.filter(i=>etatPointageEquipement(i)==='a-voir');
  const sansPerimetre=reseauChaleur?aVoir.filter(i=>!i.perimetre):[];
  const cibles=aVoir.filter(i=>!sansPerimetre.includes(i));
  const confirmes=[],refus=[];
  try{await flushDurableAutosaves()}catch(e){}
  for(const i of cibles){try{await confirmerEquipementVisite(visiteId,i.id);confirmes.push(i.id)}catch(e){refus.push(i)}}
  await charger();
  const bloques=sansPerimetre.length+refus.length;
  if(!confirmes.length){
   showToast(bloques?`Choisis Primaire ou Secondaire dans la fiche de ${pluriel(bloques,'équipement')} avant de confirmer.`:'Rien à confirmer dans ce groupe.',{tone:bloques?'error':'neutral',duration:5000});
   return;
  }
  hapticSuccess();
  const msg=`${pluriel(confirmes.length,'équipement')} marqué${confirmes.length>1?'s':''} présent${confirmes.length>1?'s':''}`+(bloques?` · ${bloques} sans Primaire / Secondaire, à classer dans la fiche`:'');
  showToast(msg,{tone:bloques?'neutral':'success',duration:6000,action:{label:'Annuler',onPress:async()=>{try{await annulerPresenceEquipements(visiteId,confirmes)}catch(e){Alert.alert('Annulation impossible',String(e?.message||e))}finally{await charger()}}}});
 },[visiteId,charger,reseauChaleur]);

 const creer=async(type,sourceId=null)=>{if(creation)return;setCreation(true);try{const id=sourceId?await dupliquerEquipementVisite(visiteId,sourceId):await creerEquipementVisite(visiteId);if(type){await upsertMaterielChamp(id,'categorie',type);await upsertMaterielChamp(id,'designation',type)}setRecherche('');setRechercheOuverte(false);setFiltre('nouveaux');setAjoutVisible(false);await charger();if(id)setTimeout(()=>setFicheId(id),260)}catch(e){Alert.alert('Ajout impossible',String(e?.message||e))}finally{setCreation(false)}};

 const vus=comptes.tous-comptes['a-voir'];
 const extraData=`${groupes.map(g=>sections.isOpen(g.id)?1:0).join('')}|${q}|${filtre}`;
 const fiche=ficheId?materiel.find(i=>i.id===ficheId):null;
 const enTete=<View>
  <View style={s.head}>
   <ProgressRing pct={comptes.tous?100*vus/comptes.tous:0} size={30} strokeWidth={4}/>
   <Text style={s.headText} numberOfLines={1}>{vus} / {comptes.tous} vus</Text>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={rechercheOuverte?'Fermer la recherche':'Rechercher un équipement'} onPress={()=>{if(rechercheOuverte){setRecherche('');setRechercheOuverte(false)}else setRechercheOuverte(true)}} hitSlop={HIT} style={[s.iconBtn,(rechercheOuverte||recherche)&&{borderColor:COLORS.orange+'66',backgroundColor:COLORS.orangeLight}]}>
    <CvcIcon name="search" size={17} color={rechercheOuverte||recherche?COLORS.orangeDark:COLORS.inkSoft} strokeWidth={2.2}/>
   </TouchableOpacity>
   <SmallButton label="Ajouter" icon="plus" onPress={()=>setAjoutVisible(true)}/>
  </View>
  {rechercheOuverte||recherche?<View style={[s.searchBox,{marginBottom:10}]}>
   <CvcIcon name="search" size={17} color={COLORS.inkFaint} strokeWidth={2.2}/>
   <TextInput style={s.searchInput} value={recherche} onChangeText={setRecherche} placeholder="Rechercher un équipement déjà ajouté…" placeholderTextColor={COLORS.inkFaint} autoCorrect={false} autoFocus={!recherche}/>
   {recherche?<TouchableOpacity accessibilityLabel="Effacer la recherche" onPress={()=>setRecherche('')} hitSlop={HIT}><CvcIcon name="close" size={16} color={COLORS.inkSoft} strokeWidth={2.2}/></TouchableOpacity>:null}
  </View>:null}
  <FilterSeg options={FILTRES.map(([key,label])=>({key,label,count:comptes[key]}))} value={filtre} onChange={setFiltre}/>
 </View>;

 return <View style={{flex:1}}>
  <FlatList
   ref={listRef}
   data={groupes}
   extraData={extraData}
   onScroll={onScroll}
   scrollEventThrottle={100}
   keyExtractor={g=>g.id}
   renderItem={({item:g})=>{
    const aVoir=g.tous.filter(i=>etatPointageEquipement(i)==='a-voir').length;
    return <SectionCard
     open={sections.isOpen(g.id)||!!q}
     onToggle={()=>sections.toggle(g.id)}
     picto={pictoEquipement(g.titre)}
     title={g.titre}
     subtitle={`${pluriel(g.tous.length,'équipement')} · ${aVoir?`${aVoir} à voir`:'tous vus'}`}
     actionLabel={aVoir>1?'Tout présent':null}
     onAction={()=>toutPresent(g)}
    >
     {g.visibles.map((item,index)=><EquipmentRow key={item.id} item={item} first={index===0} reseauChaleur={reseauChaleur} onTogglePresence={basculerPresence} onOpen={ouvrirFiche}/>)}
    </SectionCard>;
   }}
   contentContainerStyle={styles.panelContent}
   ListHeaderComponent={enTete}
   ListEmptyComponent={<View style={s.emptyBox}><CvcIcon name={recherche||filtre!=='a-voir'?'search':'check'} size={22} color={COLORS.inkFaint} strokeWidth={2}/><Text style={s.empty}>{recherche?'Aucun équipement ne correspond à la recherche.':!materiel.length?'Aucun équipement pour cette visite.':filtre==='a-voir'?'Rien à voir ici : tous les équipements repris sont pointés.':'Aucun équipement dans ce filtre.'}</Text></View>}
   initialNumToRender={8}
   maxToRenderPerBatch={8}
   windowSize={6}
   removeClippedSubviews={false}
   keyboardShouldPersistTaps="handled"
  />

  {fiche?<EquipmentSheet key={fiche.id} item={fiche} visiteId={visiteId} onChange={charger} onClose={fermerFiche} onTogglePresence={basculerPresence} types={types} catalogue={catalogue} catalogueIndex={catalogueIndex} trameId={trameId}/>:null}

  <BottomSheet visible={ajoutVisible} onClose={()=>setAjoutVisible(false)} title="Ajouter un équipement" picto="onglets/equipements">
   {materiel.length?<Text style={styles.fieldLabel}>Le plus rapide</Text>:null}
   {materiel.slice(0,3).map(i=><TouchableOpacity key={i.id} disabled={creation} style={s.addRow} onPress={()=>creer(null,i.id)}>
    <Picto name={pictoEquipement(i.categorie)} size={24}/>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.addTitle}>Dupliquer {nomEquipement(i)}</Text><Text style={styles.importHint}>Même marque et modèle · série et état à vérifier</Text></View>
    <CvcIcon name="copy" size={20} color={COLORS.orangeDark} strokeWidth={2}/>
   </TouchableOpacity>)}
   <TouchableOpacity disabled={creation} style={[s.addRow,{borderColor:COLORS.orange+'66'}]} onPress={()=>creer(null)}>
    <Picto name="ph/plaque-signaletique" size={24}/>
    <View style={{flex:1,minWidth:0}}><Text style={s.addTitle}>Lire la plaque signalétique</Text><Text style={styles.importHint}>Crée la fiche, puis « Lire la plaque » en haut de la fiche</Text></View>
    <CvcIcon name="camera" size={20} color={COLORS.orangeDark} strokeWidth={2}/>
   </TouchableOpacity>
   <Text style={[styles.fieldLabel,{marginTop:12}]}>Par type</Text>
   <View style={s.typeGrid}>{TYPES_RAPIDES.map(t=><TouchableOpacity key={t} disabled={creation} style={s.typeChip} onPress={()=>creer(t)}><Picto name={pictoEquipement(t)} size={18}/><Text style={s.typeChipText}>{t}</Text></TouchableOpacity>)}</View>
   <TouchableOpacity disabled={creation} style={[s.addRow,{marginTop:10}]} onPress={()=>creer(null)}>
    <CvcIcon name="search" size={20} color={COLORS.orangeDark} strokeWidth={2}/>
    <View style={{flex:1,minWidth:0}}><Text style={s.addTitle}>Autre type ou modèle du catalogue…</Text><Text style={styles.importHint}>Recherche marque + modèle dans la fiche</Text></View>
    <CvcIcon name="chevron-right" size={18} color={COLORS.inkFaint} strokeWidth={2.2}/>
   </TouchableOpacity>
   {autresLocaux.length?<View style={{marginTop:12}}><Text style={styles.fieldLabel}>Retrouvé ailleurs sur le site</Text>{autresLocaux.map(e=><TouchableOpacity key={e.id} style={s.addRow} onPress={()=>Alert.alert('Rattacher au local actuel ?',`« ${e.designation||e.type_code} » sera déplacé depuis ${e.nom_local} vers le local de cette visite. Les anciennes visites garderont leur historique.`,[{text:'Annuler',style:'cancel'},{text:'Rattacher',onPress:async()=>{try{await rattacherEquipementAuLocal(visiteId,e.id);setFiltre('a-voir');setAjoutVisible(false);await charger()}catch(err){Alert.alert('Rattachement impossible',String(err?.message||err))}}}])}>
    <Picto name={pictoEquipement(e.type_code||e.designation)} size={24}/>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.addTitle}>{e.designation||e.type_code}</Text><Text numberOfLines={1} style={styles.importHint}>{[e.nom_local,[e.marque,e.modele].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</Text></View>
    <CvcIcon name="chevron-right" size={18} color={COLORS.inkFaint} strokeWidth={2.2}/>
   </TouchableOpacity>)}</View>:null}
  </BottomSheet>
 </View>;
}

const s=StyleSheet.create({
 head:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10},
 headText:{flex:1,fontSize:13,fontFamily:FONTS.semi,color:COLORS.ink},
 iconBtn:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:KIT.border,backgroundColor:KIT.card,alignItems:'center',justifyContent:'center'},
 searchBox:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,borderRadius:14,borderWidth:1,borderColor:KIT.border,backgroundColor:KIT.card,paddingHorizontal:12},
 searchInput:{flex:1,fontSize:14,fontFamily:FONTS.bodyMedium,color:COLORS.ink,paddingVertical:8},

 row:{flexDirection:'row',alignItems:'center',gap:10,minHeight:54},
 rowSep:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:COLORS.line},
 circle:{width:30,height:30,borderRadius:15,borderWidth:2,borderColor:'rgba(22,21,15,0.18)',backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
 rowMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8},
 rowTitle:{fontSize:13.5,fontFamily:FONTS.bodyBold,color:COLORS.ink},
 rowSub:{fontSize:11.5,fontFamily:FONTS.bodyMedium,color:COLORS.inkSoft,marginTop:2},
 pill:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:10,paddingHorizontal:8,paddingVertical:3,maxWidth:120},
 pillText:{fontSize:11,fontFamily:FONTS.bodyBold},

 photoRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:10},
 thumb:{width:58,height:48,borderRadius:12},
 presence:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,minHeight:44,borderRadius:14,borderWidth:1,borderColor:'rgba(22,21,15,0.12)',backgroundColor:'#FFFFFF',marginBottom:6},
 presenceOn:{backgroundColor:KIT.green,borderColor:KIT.green},
 presenceNew:{backgroundColor:COLORS.orangeLight,borderColor:'transparent'},
 presenceText:{fontSize:13.5,fontFamily:FONTS.bodyBold,color:COLORS.inkSoft},

 suggestions:{borderWidth:1,borderColor:KIT.border,borderRadius:14,backgroundColor:'#FFFFFF',marginTop:6,overflow:'hidden'},
 suggestion:{flexDirection:'row',alignItems:'center',gap:10,minHeight:44,paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:COLORS.line},
 suggestionText:{flex:1,fontSize:13.5,fontFamily:FONTS.bodySemi,color:COLORS.ink},
 suggestionType:{fontFamily:FONTS.bodyMedium,color:COLORS.inkSoft},
 identite:{flexDirection:'row',alignItems:'flex-start',gap:10,borderWidth:1,borderColor:KIT.border,borderRadius:14,backgroundColor:'#FFFFFF',padding:10,marginTop:8},
 identiteType:{flexDirection:'row',alignItems:'center',gap:8,flex:1.1,minWidth:0},
 identiteCol:{flex:1,minWidth:0},
 identiteLabel:{fontSize:10.5,fontFamily:FONTS.bodySemi,color:COLORS.inkSoft},
 identiteValue:{fontSize:13,fontFamily:FONTS.bodyBold,color:COLORS.ink,marginTop:1},

 fold:{flexDirection:'row',alignItems:'center',gap:8,minHeight:42,marginTop:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:COLORS.line},
 foldText:{flex:1,fontSize:12.5,fontFamily:FONTS.bodySemi,color:COLORS.inkSoft},
 histoRow:{flexDirection:'row',gap:8,paddingVertical:7},
 histoText:{flex:1,fontFamily:FONTS.bodyMedium,fontSize:12.5,color:COLORS.inkSoft},
 histoEtat:{fontFamily:FONTS.bodyBold,fontSize:12.5,color:COLORS.ink},

 pickRow:{flexDirection:'row',alignItems:'center',gap:10,minHeight:50,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:COLORS.line},
 pickText:{flex:1,fontSize:14.5,fontFamily:FONTS.bodySemi,color:COLORS.ink},

 addRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,borderRadius:14,borderWidth:1,borderColor:KIT.border,backgroundColor:'#FFFFFF',paddingHorizontal:12,paddingVertical:8,marginTop:6},
 addTitle:{fontSize:13.5,fontFamily:FONTS.bodyBold,color:COLORS.ink},
 typeGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
 typeChip:{flexDirection:'row',alignItems:'center',gap:6,minHeight:40,paddingHorizontal:12,borderRadius:20,borderWidth:1,borderColor:'rgba(22,21,15,0.12)',backgroundColor:'#FFFFFF'},
 typeChipText:{fontSize:12.5,fontFamily:FONTS.bodySemi,color:COLORS.ink},

 emptyBox:{alignItems:'center',gap:6,paddingVertical:24},
 empty:{textAlign:'center',fontSize:12.5,fontFamily:FONTS.bodyMedium,color:COLORS.inkFaint,paddingVertical:10},
});
