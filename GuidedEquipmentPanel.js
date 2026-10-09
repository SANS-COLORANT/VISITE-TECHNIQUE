/**
 * Onglet Équipements : on signale l'exception, pas de pointage systématique.
 *
 * - tout équipement reste tel quel (état de la dernière visite, repris par
 *   l'envoi Intranet) ; on ne touche que vétuste, HS, retiré, remplacé ;
 * - bandeau « x à surveiller · y nouveaux », filtre Tous / À surveiller /
 *   Nouveaux, groupes par type (ouverts seuls s'ils contiennent un équipement
 *   à surveiller ou nouveau) ;
 * - une ligne : glisser vers la droite = Vétuste / HS, vers la gauche = Retiré
 *   / Remplacé ; toucher = mêmes actions en gros boutons + fiche complète ;
 * - bouton + : plaque, dupliquer, remplacer, catalogue, quantité, types,
 *   création libre d'un équipement introuvable, équipements d'autres locaux ;
 * - la fiche (feuille du bas) garde photos, plaque, état, identification.
 *
 * Les clés stockées (table `materiel`, champs autorisés par
 * `upsertMaterielPersistant`, `confirme_le`) ne changent pas.
 */
import React,{memo,useCallback,useEffect,useMemo,useRef,useState}from'react';
import{Alert,Animated,FlatList,PanResponder,StyleSheet,Text,TextInput,TouchableOpacity,View}from'react-native';
import{getDb,upsertMaterielChamp,supprimerMateriel,listerBibliothequeEquipements,listerCategoriesEquipement,listerHistoriqueEquipement,listerPhotos}from'./db.js';
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
// Pas de pointage systématique : un équipement reste tel quel (état de la
// dernière visite). On signale l'exception : vétuste, HS, retiré, remplacé.
const FILTRES=[['tous','Tous'],['surveiller','À surveiller'],['nouveaux','Nouveaux']];
const ETAT_VETUSTE='Vétuste',ETAT_HS='Hors service';
const LARG_ACTIONS=168;
const surveille=i=>{const e=norm(i?.etat);return e==='vetuste'||e==='hors service'};
const estHS=i=>norm(i?.etat)==='hors service';
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
 * ou « Annuler » après pointage groupé). Inverse exact de
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

/**
 * Une ligne d'équipement. Glisser vers la droite : Vétuste / HS ; vers la
 * gauche : Retiré / Remplacé ; toucher : mêmes actions en gros boutons + fiche.
 */
const EquipmentRow=memo(function EquipmentRow({item,first,reseauChaleur,plateauOuvert,ferme,onPlateau,onSwipe,onAction,onOpen}){
 const nouveau=etatPointageEquipement(item)==='nouveaux';
 const sous=[[item.marque,item.modele].filter(Boolean).join(' ')||'Marque · modèle à compléter',item.reseau_desservi].filter(Boolean).join(' · ');
 const nom=nomEquipement(item);
 const x=useRef(new Animated.Value(0)).current;
 const cote=useRef(0),base=useRef(0);
 const aller=useCallback(to=>{cote.current=Math.sign(to);Animated.spring(x,{toValue:to,stiffness:520,damping:42,mass:1,overshootClamping:true,useNativeDriver:true}).start()},[x]);
 useEffect(()=>{if(ferme&&cote.current)aller(0)},[ferme,aller]);
 const pan=useMemo(()=>{
  const fin=(_,g)=>{const v=base.current+g.dx;aller(v>46?LARG_ACTIONS:v<-46?-LARG_ACTIONS:0)};
  return PanResponder.create({
   onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>10&&Math.abs(g.dx)>Math.abs(g.dy)*1.3,
   onPanResponderGrant:()=>{x.stopAnimation(v=>{base.current=v});onSwipe(item.id)},
   onPanResponderMove:(_,g)=>x.setValue(Math.max(-LARG_ACTIONS,Math.min(LARG_ACTIONS,base.current+g.dx))),
   onPanResponderRelease:fin,onPanResponderTerminate:fin,
   onPanResponderTerminationRequest:()=>false,
  });
 },[x,aller,onSwipe,item.id]);
 const agir=a=>{aller(0);onAction(item,a)};
 return <View style={[s.rowWrap,!first&&s.rowSep]}>
  <View style={s.underL} pointerEvents="box-none">
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom} : vétuste`} onPress={()=>agir('vet')} style={[s.underBtn,{backgroundColor:'#D9731A'}]}><Text style={s.underText}>Vétuste</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom} : hors service`} onPress={()=>agir('hs')} style={[s.underBtn,{backgroundColor:KIT.red}]}><Text style={s.underText}>HS</Text></TouchableOpacity>
  </View>
  <View style={s.underR} pointerEvents="box-none">
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom} : retiré du site`} onPress={()=>agir('ret')} style={[s.underBtn,{backgroundColor:'#6B665A'}]}><Text style={s.underText}>Retiré</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom} : remplacé`} onPress={()=>agir('rep')} style={[s.underBtn,{backgroundColor:COLORS.orange}]}><Text style={s.underText}>Remplacé</Text></TouchableOpacity>
  </View>
  <Animated.View style={[s.rowFront,{transform:[{translateX:x}]}]} {...pan.panHandlers}>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${nom}, actions`} activeOpacity={0.7} onPress={()=>onPlateau(item.id)} style={s.rowMain}>
    <View style={{flex:1,minWidth:0}}>
     <Text numberOfLines={1} style={s.rowTitle}>{nom}</Text>
     <Text numberOfLines={1} style={s.rowSub}>{sous}{reseauChaleur?<Text style={item.perimetre?null:{color:KIT.amber}}>{` · ${item.perimetre||'Primaire / Secondaire à choisir'}`}</Text>:null}</Text>
    </View>
    {estHS(item)?<View style={[s.pill,{backgroundColor:KIT.redBg}]}><Text style={[s.pillText,{color:KIT.red}]}>HS</Text></View>:surveille(item)?<View style={[s.pill,{backgroundColor:KIT.amberBg}]}><Text style={[s.pillText,{color:KIT.amber}]}>Vétuste</Text></View>:<EtatPill etat={null} nouveau={nouveau}/>}
    <CvcIcon name={plateauOuvert?'chevron-up':'chevron-down'} size={17} color={COLORS.inkFaint} strokeWidth={2.2}/>
   </TouchableOpacity>
   {plateauOuvert?<View style={s.plateau}>
    <View style={s.plateauRow}>
     <TouchableOpacity accessibilityRole="button" onPress={()=>agir('vet')} style={[s.plateauBtn,{backgroundColor:KIT.amberBg}]}><Text style={[s.plateauText,{color:KIT.amber}]}>Vétuste</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" onPress={()=>agir('hs')} style={[s.plateauBtn,{backgroundColor:KIT.redBg}]}><Text style={[s.plateauText,{color:KIT.red}]}>HS</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" onPress={()=>agir('rep')} style={[s.plateauBtn,{backgroundColor:COLORS.orangeLight}]}><Text style={[s.plateauText,{color:COLORS.orangeDark}]}>Remplacé</Text></TouchableOpacity>
     <TouchableOpacity accessibilityRole="button" onPress={()=>agir('ret')} style={[s.plateauBtn,{backgroundColor:'rgba(22,21,15,0.07)'}]}><Text style={s.plateauText}>Retiré</Text></TouchableOpacity>
    </View>
    {surveille(item)?<TouchableOpacity accessibilityRole="button" onPress={()=>agir('bon')} style={s.plateauLien}><Text style={s.plateauLienText}>Remettre en Bon</Text></TouchableOpacity>:null}
    <TouchableOpacity accessibilityRole="button" onPress={()=>onOpen(item.id)} style={s.plateauLien}><Text style={s.plateauLienText}>Ouvrir la fiche complète ›</Text></TouchableOpacity>
   </View>:null}
  </Animated.View>
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
 const[filtre,setFiltre]=useState('tous'),[ajoutVisible,setAjoutVisible]=useState(false),[creation,setCreation]=useState(false);
 const[plateauId,setPlateauId]=useState(null),[swipeId,setSwipeId]=useState(null);
 const[ajout,setAjout]=useState({vue:'menu',qte:1,q:'',nom:'',type:''});
 const autoOuvert=useRef(false);
 const[ficheId,setFicheId]=useState(null);
 const[autresLocaux,setAutresLocaux]=useState([]);
 const sections=useSectionsOuvertes(`visit-equip:${visiteId}`);
 useEffect(()=>{if(!ajoutVisible)return;let alive=true;listerEquipementsAutresLocaux(visiteId).then(rows=>{if(alive)setAutresLocaux(rows)}).catch(console.warn);return()=>{alive=false}},[ajoutVisible,visiteId]);
 const comptes=useMemo(()=>({tous:materiel.length,surveiller:materiel.filter(surveille).length,nouveaux:materiel.filter(i=>etatPointageEquipement(i)==='nouveaux').length}),[materiel]);
 const q=norm(recherche);
 const groupes=useMemo(()=>{
  const map=new Map();
  for(const i of materiel){const key=String(i.categorie||'').trim()||'Équipements';if(!map.has(key))map.set(key,{titre:key,tous:[],visibles:[]});map.get(key).tous.push(i)}
  for(const g of map.values())g.visibles=g.tous.filter(item=>(filtre==='tous'||(filtre==='surveiller'?surveille(item):etatPointageEquipement(item)==='nouveaux'))&&(!q||norm([item.designation,item.categorie,item.reseau_desservi,item.marque,item.modele,item.numero_materiel,item.caracteristiques].filter(Boolean).join(' ')).includes(q)));
  return [...map.values()].filter(g=>g.visibles.length).map(g=>({...g,id:`type:${g.titre}`}));
 },[materiel,filtre,q]);
 const nbVisibles=useMemo(()=>groupes.reduce((n,g)=>n+g.visibles.length,0),[groupes]);
 const catalogueIndex=useMemo(()=>catalogue.map(e=>({e,h:norm(`${e.marque||''} ${nomModele(e)} ${e.reference||''} ${e.categorie||''}`)})),[catalogue]);
 const{listRef,onScroll}=useListScrollMemory(`visit-panel:${visiteId}:p-equip`,nbVisibles);
 const charger=useCallback(async()=>setMateriel(await listerEquipementsPointage(visiteId)),[visiteId]);
 useEffect(()=>{charger()},[charger]);
 // Les groupes qui contiennent un équipement à surveiller ou nouveau s'ouvrent seuls.
 useEffect(()=>{
  if(autoOuvert.current||!materiel.length)return;
  autoOuvert.current=true;
  sections.open(materiel.filter(i=>surveille(i)||etatPointageEquipement(i)==='nouveaux').map(i=>`type:${String(i.categorie||'').trim()||'Équipements'}`));
 },[materiel,sections]);
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
   if(!depuisFiche)showToast(`${nomEquipement(item)} : présent`,{tone:'success',duration:4000,action:{label:'Annuler',onPress:async()=>{try{await annulerPresenceEquipements(visiteId,[item.id])}finally{await charger()}}}});
  }catch(e){
   // Hors de la fiche, on l'ouvre pour classer Primaire / Secondaire ; dans
   // la fiche (fenêtre modale), un toast serait masqué : alerte native.
   if(depuisFiche)Alert.alert('Pointage impossible',String(e?.message||e));
   else{showToast(String(e?.message||e),{tone:'error',duration:4000});setFicheId(item.id)}
  }
  await charger();
 },[visiteId,charger,reseauChaleur]);


 const typesFrequents=useMemo(()=>{
  const n=new Map();for(const i of materiel){const t=String(i.categorie||'').trim();if(t)n.set(t,(n.get(t)||0)+1)}
  const tries=[...n.entries()].sort((a,b)=>b[1]-a[1]).map(([t])=>t);
  return uniq([...tries.slice(0,4),...(tries.length<4?TYPES_RAPIDES.slice(0,4-tries.length):[])]);
 },[materiel]);

 /** État vétuste / HS en un geste, avec « Annuler » (retour à l'état précédent). */
 const appliquerEtat=useCallback(async(item,etat,libelle)=>{
  const avant=item.etat||null;
  hapticTick();
  setMateriel(l=>l.map(i=>i.id===item.id?{...i,etat}:i));
  try{
   await flushDurableAutosaves();
   await upsertMaterielChamp(item.id,'etat',etat);
   showToast(`${nomEquipement(item)} : ${libelle}`,{tone:'success',duration:5000,action:{label:'Annuler',onPress:async()=>{
    try{if(avant)await upsertMaterielChamp(item.id,'etat',avant);else await(await getDb()).runAsync('UPDATE materiel SET etat=NULL WHERE id=?',[item.id])}
    catch(e){Alert.alert('Annulation impossible',String(e?.message||e))}finally{await charger()}}}});
  }catch(e){Alert.alert('Enregistrement impossible',String(e?.message||e))}
  await charger();
 },[charger]);

 const retirerEquipement=useCallback(item=>demanderConfirmation({title:'Retiré du site ?',message:`Confirmer le retrait de « ${nomEquipement(item)} » du patrimoine de ce local. Les visites précédentes gardent leur historique.`,label:'Retirer',onConfirm:async()=>{
  try{await flushDurableAutosaves();await supprimerMateriel(item.id);hapticSuccess();showToast(`${nomEquipement(item)} : retiré du site`,{tone:'success',duration:4000})}
  catch(e){Alert.alert('Retrait impossible',String(e?.message||e))}
  await charger();
 }}),[charger]);

 /** Remplacé : le nouvel équipement reprend type, réseau et périmètre ; l'ancien est retiré. */
 const remplacerEquipement=useCallback(item=>demanderConfirmation({title:'Remplacer cet équipement ?',message:`« ${nomEquipement(item)} » sera retiré du site et un nouvel équipement du même type et du même réseau sera créé. Il restera à lire sa plaque.`,label:'Remplacer',onConfirm:async()=>{
  try{
   await flushDurableAutosaves();
   const id=await creerEquipementVisite(visiteId);
   for(const[cle,val]of[['categorie',item.categorie],['designation',item.designation||item.categorie],['reseau_desservi',item.reseau_desservi],['perimetre',item.perimetre],['nombre',item.nombre]])if(val)await upsertMaterielChamp(id,cle,val);
   await supprimerMateriel(item.id);
   hapticSuccess();setFiltre('tous');
   await charger();
   showToast(`${nomEquipement(item)} remplacé : nouvel équipement créé`,{tone:'success',duration:4000});
   setTimeout(()=>setFicheId(id),260);
  }catch(e){Alert.alert('Remplacement impossible',String(e?.message||e));await charger()}
 }}),[visiteId,charger]);

 const agirSurLigne=useCallback((item,a)=>{
  setSwipeId(null);setPlateauId(null);
  if(a==='vet')appliquerEtat(item,ETAT_VETUSTE,'vétuste');
  else if(a==='hs')appliquerEtat(item,ETAT_HS,'hors service');
  else if(a==='bon')appliquerEtat(item,'Bon','remis en bon état');
  else if(a==='ret')retirerEquipement(item);
  else if(a==='rep')remplacerEquipement(item);
 },[appliquerEtat,retirerEquipement,remplacerEquipement]);

 /** Création (1 à 9 équipements) : plaque, type, nom libre, copie d'un existant. */
 const creerEquipements=async({type=null,nom=null,sourceId=null,qte=1}={})=>{
  if(creation)return;setCreation(true);
  try{
   const ids=[];
   for(let k=0;k<qte;k++){
    const id=sourceId?await dupliquerEquipementVisite(visiteId,sourceId):await creerEquipementVisite(visiteId);
    const t=String(type||'').trim(),n=String(nom||'').trim();
    if(t)await upsertMaterielChamp(id,'categorie',t);
    if(n||t&&!sourceId)await upsertMaterielChamp(id,'designation',qte>1?`${n||t} ${k+1}`:(n||t));
    ids.push(id);
   }
   setRecherche('');setRechercheOuverte(false);setFiltre('nouveaux');setAjoutVisible(false);
   await charger();
   if(ids.length===1)setTimeout(()=>setFicheId(ids[0]),260);else showToast(`${ids.length} équipements créés`,{tone:'success',duration:3500});
  }catch(e){Alert.alert('Ajout impossible',String(e?.message||e))}finally{setCreation(false)}
 };
 const ouvrirAjout=()=>{setAjout({vue:'menu',qte:1,q:'',nom:'',type:''});setAjoutVisible(true)};
 const basculerPlateau=useCallback(id=>{setSwipeId(null);setPlateauId(p=>p===id?null:id)},[]);


 const extraData=`${groupes.map(g=>sections.isOpen(g.id)?1:0).join('')}|${q}|${filtre}|${plateauId}|${swipeId}|${materiel.map(i=>i.etat||'').join(',')}`;
 const fiche=ficheId?materiel.find(i=>i.id===ficheId):null;
 const enTete=<View>
  <View style={s.head}>
   <View style={s.chips}>
    <View style={[s.chip,comptes.surveiller?{backgroundColor:KIT.amberBg}:s.chipZero]}><Text style={[s.chipText,comptes.surveiller?{color:KIT.amber}:null]}>{comptes.surveiller} à surveiller</Text></View>
    <View style={[s.chip,comptes.nouveaux?{backgroundColor:COLORS.orangeLight}:s.chipZero]}><Text style={[s.chipText,comptes.nouveaux?{color:COLORS.orangeDark}:null]}>{comptes.nouveaux} {comptes.nouveaux>1?'nouveaux':'nouveau'}</Text></View>
   </View>
   <TouchableOpacity accessibilityRole="button" accessibilityLabel={rechercheOuverte?'Fermer la recherche':'Rechercher un équipement'} onPress={()=>{if(rechercheOuverte){setRecherche('');setRechercheOuverte(false)}else setRechercheOuverte(true)}} hitSlop={HIT} style={[s.iconBtn,(rechercheOuverte||recherche)&&{borderColor:COLORS.orange}]}>
    <CvcIcon name="search" size={17} color={rechercheOuverte||recherche?COLORS.orangeDark:COLORS.inkSoft} strokeWidth={2.2}/>
   </TouchableOpacity>
  </View>
  {rechercheOuverte||recherche?<View style={[s.searchBox,{marginBottom:10}]}>
   <CvcIcon name="search" size={17} color={COLORS.inkFaint} strokeWidth={2.2}/>
   <TextInput style={s.searchInput} value={recherche} onChangeText={setRecherche} placeholder="Rechercher marque, modèle, n° de série…" placeholderTextColor={COLORS.inkFaint} autoCorrect={false} autoFocus={!recherche}/>
   {recherche?<TouchableOpacity accessibilityLabel="Effacer la recherche" onPress={()=>setRecherche('')} hitSlop={HIT}><CvcIcon name="close" size={16} color={COLORS.inkSoft} strokeWidth={2.2}/></TouchableOpacity>:null}
  </View>:null}
  <FilterSeg options={FILTRES.map(([key,label])=>({key,label,count:comptes[key]}))} value={filtre} onChange={setFiltre}/>
 </View>;

 const typesAffiches=useMemo(()=>{
  const qq=norm(ajout.q);
  const base=qq?types.filter(t=>norm(t).includes(qq)):uniq([...typesFrequents,...TYPES,...types]);
  return base.slice(0,qq?40:18);
 },[types,typesFrequents,ajout.q]);
 const typeExact=useMemo(()=>types.some(t=>eq(t,ajout.q)),[types,ajout.q]);
 const aVue=vue=>setAjout(a=>({...a,vue}));
 const Tuile=({titre,onPress,icone})=><TouchableOpacity accessibilityRole="button" disabled={creation} style={s.tuile} onPress={onPress}><CvcIcon name={icone} size={20} color={COLORS.orangeDark} strokeWidth={2}/><Text style={s.tuileText}>{titre}</Text></TouchableOpacity>;

 return <View style={{flex:1}}>
  <FlatList
   ref={listRef}
   data={groupes}
   extraData={extraData}
   onScroll={onScroll}
   scrollEventThrottle={100}
   keyExtractor={g=>g.id}
   renderItem={({item:g})=>{
    const nbHS=g.tous.filter(estHS).length,nbVet=g.tous.filter(i=>surveille(i)&&!estHS(i)).length,nbNew=g.tous.filter(i=>etatPointageEquipement(i)==='nouveaux').length;
    const detail=[nbHS?`${nbHS} HS`:null,nbVet?`${nbVet} vétuste${nbVet>1?'s':''}`:null,nbNew?`${nbNew} nouveau${nbNew>1?'x':''}`:null].filter(Boolean).join(' · ');
    return <SectionCard
     open={sections.isOpen(g.id)||!!q}
     onToggle={()=>sections.toggle(g.id)}
     picto={pictoEquipement(g.titre)}
     title={g.titre}
     subtitle={`${pluriel(g.tous.length,'équipement')}${detail?` · ${detail}`:''}`}
    >
     {g.visibles.map((item,index)=><EquipmentRow key={item.id} item={item} first={index===0} reseauChaleur={reseauChaleur} plateauOuvert={plateauId===item.id} ferme={swipeId!==item.id} onPlateau={basculerPlateau} onSwipe={setSwipeId} onAction={agirSurLigne} onOpen={id=>{setPlateauId(null);ouvrirFiche(id)}}/>)}
    </SectionCard>;
   }}
   contentContainerStyle={[styles.panelContent,{paddingBottom:96}]}
   ListHeaderComponent={enTete}
   ListFooterComponent={materiel.length?<Text style={s.note}>Tout équipement non touché reste tel quel, avec l’état de la dernière visite.</Text>:null}
   ListEmptyComponent={<View style={s.emptyBox}><CvcIcon name={recherche||filtre!=='tous'?'search':'check'} size={22} color={COLORS.inkFaint} strokeWidth={2}/><Text style={s.empty}>{recherche?'Aucun équipement ne correspond à la recherche.':!materiel.length?'Aucun équipement pour cette visite. Le bouton + permet d’en créer.':filtre==='surveiller'?'Rien à surveiller : aucun équipement vétuste ou HS.':'Aucun équipement nouveau pour cette visite.'}</Text></View>}
   initialNumToRender={8}
   maxToRenderPerBatch={8}
   windowSize={6}
   removeClippedSubviews={false}
   keyboardShouldPersistTaps="handled"
  />

  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ajouter un équipement" activeOpacity={0.85} onPress={ouvrirAjout} style={s.fab}><CvcIcon name="plus-plain" size={26} color={COLORS.white} strokeWidth={2.6}/></TouchableOpacity>

  {fiche?<EquipmentSheet key={fiche.id} item={fiche} visiteId={visiteId} onChange={charger} onClose={fermerFiche} onTogglePresence={basculerPresence} types={types} catalogue={catalogue} catalogueIndex={catalogueIndex} trameId={trameId}/>:null}

  <BottomSheet visible={ajoutVisible} onClose={()=>setAjoutVisible(false)} title={ajout.vue==='menu'?'Nouvel équipement':ajout.vue==='libre'?'Créer un équipement':ajout.vue==='dup'?'Quel équipement dupliquer ?':ajout.vue==='rep'?'Quel équipement remplacer ?':'Retrouvé ailleurs sur le site'} picto="onglets/equipements" maxHeight="90%">
   {ajout.vue==='menu'?<>
    <TouchableOpacity accessibilityRole="button" disabled={creation} activeOpacity={0.85} onPress={()=>creerEquipements({qte:ajout.qte})} style={s.plaque}>
     <Picto name="ph/plaque-signaletique" size={28} mono={COLORS.white}/>
     <View style={{flex:1,minWidth:0}}><Text style={s.plaqueTitre}>Photographier la plaque</Text><Text style={s.plaqueSub}>Crée la fiche, puis « Lire la plaque » remplit marque, modèle et année</Text></View>
    </TouchableOpacity>
    <View style={s.tuiles}>
     <Tuile titre="Dupliquer" icone="copy" onPress={()=>aVue('dup')}/>
     <Tuile titre="Remplacer" icone="refresh" onPress={()=>aVue('rep')}/>
     <Tuile titre="Catalogue" icone="search" onPress={()=>creerEquipements({qte:ajout.qte})}/>
    </View>
    <View style={s.qte}>
     <View style={{flex:1,minWidth:0}}><Text style={s.addTitle}>Nombre à créer</Text><Text style={styles.importHint}>2 circulateurs identiques ? Crée-les d’un coup</Text></View>
     <TouchableOpacity accessibilityLabel="Moins" onPress={()=>setAjout(a=>({...a,qte:Math.max(1,a.qte-1)}))} style={s.qteBtn}><Text style={s.qteBtnText}>−</Text></TouchableOpacity>
     <Text style={s.qteVal}>{ajout.qte}</Text>
     <TouchableOpacity accessibilityLabel="Plus" onPress={()=>setAjout(a=>({...a,qte:Math.min(9,a.qte+1)}))} style={s.qteBtn}><Text style={s.qteBtnText}>+</Text></TouchableOpacity>
    </View>
    <Text style={[styles.fieldLabel,{marginTop:12}]}>Par type</Text>
    <TextInput style={styles.input} value={ajout.q} onChangeText={v=>setAjout(a=>({...a,q:v}))} placeholder="Rechercher un type ou un nom…" placeholderTextColor={COLORS.inkFaint} autoCorrect={false}/>
    <View style={[s.typeGrid,{marginTop:8}]}>
     {typesAffiches.map(t=><TouchableOpacity key={t} disabled={creation} style={[s.typeChip,typesFrequents.includes(t)&&!ajout.q&&{backgroundColor:COLORS.orangeLight,borderColor:'transparent'}]} onPress={()=>creerEquipements({type:t,qte:ajout.qte})}><Picto name={pictoEquipement(t)} size={18}/><Text style={s.typeChipText}>{t}</Text></TouchableOpacity>)}
    </View>
    {ajout.q.trim()&&!typeExact?<TouchableOpacity accessibilityRole="button" disabled={creation} style={[s.addRow,{borderColor:COLORS.orange+'66'}]} onPress={()=>creerEquipements({type:ajout.q.trim(),nom:ajout.q.trim(),qte:ajout.qte})}>
     <CvcIcon name="plus-plain" size={20} color={COLORS.orangeDark} strokeWidth={2.4}/>
     <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.addTitle}>Créer « {ajout.q.trim()} »</Text><Text style={styles.importHint}>Introuvable ? Il est créé tel quel, à compléter dans la fiche</Text></View>
    </TouchableOpacity>:null}
    <TouchableOpacity accessibilityRole="button" style={[s.addRow,{marginTop:10}]} onPress={()=>setAjout(a=>({...a,vue:'libre',nom:a.q.trim(),type:''}))}>
     <CvcIcon name="edit" size={20} color={COLORS.orangeDark} strokeWidth={2}/>
     <View style={{flex:1,minWidth:0}}><Text style={s.addTitle}>Autre équipement : lui donner un nom…</Text><Text style={styles.importHint}>Nom et type au choix, pour un équipement absent des listes</Text></View>
     <CvcIcon name="chevron-right" size={18} color={COLORS.inkFaint} strokeWidth={2.2}/>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={s.addRow} onPress={()=>aVue('ailleurs')}>
     <CvcIcon name="local" size={20} color={COLORS.orangeDark} strokeWidth={2}/>
     <View style={{flex:1,minWidth:0}}><Text style={s.addTitle}>Retrouvé ailleurs sur le site</Text><Text style={styles.importHint}>{autresLocaux.length?`${pluriel(autresLocaux.length,'équipement')} d’autres locaux à rattacher`:'Équipements déjà connus dans les autres locaux'}</Text></View>
     <CvcIcon name="chevron-right" size={18} color={COLORS.inkFaint} strokeWidth={2.2}/>
    </TouchableOpacity>
   </>:null}

   {ajout.vue==='libre'?<>
    <TouchableOpacity onPress={()=>aVue('menu')} style={s.retour}><Text style={s.plateauLienText}>‹ Retour</Text></TouchableOpacity>
    <Text style={styles.fieldLabel}>Nom de l’équipement</Text>
    <TextInput style={styles.input} value={ajout.nom} onChangeText={v=>setAjout(a=>({...a,nom:v}))} placeholder="Ex. Pompe de relevage nord" placeholderTextColor={COLORS.inkFaint} autoFocus/>
    <Text style={[styles.fieldLabel,{marginTop:10}]}>Type (facultatif)</Text>
    <TextInput style={styles.input} value={ajout.type} onChangeText={v=>setAjout(a=>({...a,type:v}))} placeholder="Ex. Pompe, Vanne… ou un type libre" placeholderTextColor={COLORS.inkFaint} autoCorrect={false}/>
    <View style={[s.typeGrid,{marginTop:8}]}>{uniq(types).filter(t=>ajout.type&&norm(t).includes(norm(ajout.type))&&!eq(t,ajout.type)).slice(0,6).map(t=><TouchableOpacity key={t} style={s.typeChip} onPress={()=>setAjout(a=>({...a,type:t}))}><Text style={s.typeChipText}>{t}</Text></TouchableOpacity>)}</View>
    <Text style={styles.importHint}>Marque, modèle, réseau et état se complètent ensuite dans la fiche ou par la plaque.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={creation||!ajout.nom.trim()} style={[styles.btnPrimary,{marginTop:14},!ajout.nom.trim()&&{opacity:0.45}]} onPress={()=>creerEquipements({type:ajout.type.trim()||ajout.nom.trim(),nom:ajout.nom.trim(),qte:ajout.qte})}><ButtonGlow/><Text style={styles.btnPrimaryText}>Créer l’équipement</Text></TouchableOpacity>
   </>:null}

   {ajout.vue==='dup'||ajout.vue==='rep'?<>
    <TouchableOpacity onPress={()=>aVue('menu')} style={s.retour}><Text style={s.plateauLienText}>‹ Retour</Text></TouchableOpacity>
    <Text style={styles.importHint}>{ajout.vue==='rep'?'L’ancien équipement est retiré du site ; le nouveau reprend son type et son réseau.':'Même marque et modèle · série et état à vérifier.'}</Text>
    {materiel.map(i=><TouchableOpacity key={i.id} disabled={creation} style={s.addRow} onPress={()=>{if(ajout.vue==='dup')creerEquipements({sourceId:i.id,qte:ajout.qte});else{setAjoutVisible(false);setTimeout(()=>remplacerEquipement(i),280)}}}>
     <Picto name={pictoEquipement(i.categorie)} size={24}/>
     <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.addTitle}>{nomEquipement(i)}</Text><Text numberOfLines={1} style={styles.importHint}>{[[i.marque,i.modele].filter(Boolean).join(' '),i.reseau_desservi].filter(Boolean).join(' · ')||i.categorie}</Text></View>
    </TouchableOpacity>)}
   </>:null}

   {ajout.vue==='ailleurs'?<>
    <TouchableOpacity onPress={()=>aVue('menu')} style={s.retour}><Text style={s.plateauLienText}>‹ Retour</Text></TouchableOpacity>
    {autresLocaux.length?autresLocaux.map(e=><TouchableOpacity key={e.id} style={s.addRow} onPress={()=>Alert.alert('Rattacher au local actuel ?',`« ${e.designation||e.type_code} » sera déplacé depuis ${e.nom_local} vers le local de cette visite. Les anciennes visites garderont leur historique.`,[{text:'Annuler',style:'cancel'},{text:'Rattacher',onPress:async()=>{try{await rattacherEquipementAuLocal(visiteId,e.id);setFiltre('tous');setAjoutVisible(false);await charger()}catch(err){Alert.alert('Rattachement impossible',String(err?.message||err))}}}])}>
     <Picto name={pictoEquipement(e.type_code||e.designation)} size={24}/>
     <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.addTitle}>{e.designation||e.type_code}</Text><Text numberOfLines={1} style={styles.importHint}>{[e.nom_local,[e.marque,e.modele].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</Text></View>
     <CvcIcon name="chevron-right" size={18} color={COLORS.inkFaint} strokeWidth={2.2}/>
    </TouchableOpacity>):<Text style={s.empty}>Aucun équipement à rattacher depuis les autres locaux de ce site.</Text>}
   </>:null}
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
 rowWrap:{position:'relative',overflow:'hidden'},
 rowFront:{backgroundColor:KIT.card},
 underL:{position:'absolute',left:0,top:0,bottom:0,width:LARG_ACTIONS,flexDirection:'row'},
 underR:{position:'absolute',right:0,top:0,bottom:0,width:LARG_ACTIONS,flexDirection:'row'},
 underBtn:{flex:1,alignItems:'center',justifyContent:'center'},
 underText:{color:'#FFFFFF',fontSize:13,fontFamily:FONTS.bodyBold},
 plateau:{paddingBottom:10,gap:8},
 plateauRow:{flexDirection:'row',gap:8},
 plateauBtn:{flex:1,minHeight:50,borderRadius:14,alignItems:'center',justifyContent:'center'},
 plateauText:{fontSize:12.5,fontFamily:FONTS.bodyBold,color:COLORS.ink},
 plateauLien:{minHeight:40,alignItems:'center',justifyContent:'center'},
 plateauLienText:{fontSize:12.5,fontFamily:FONTS.bodyBold,color:COLORS.orangeDark},
 retour:{minHeight:40,justifyContent:'center',alignSelf:'flex-start'},
 chips:{flex:1,flexDirection:'row',gap:8,flexWrap:'wrap'},
 chip:{minHeight:30,paddingHorizontal:12,borderRadius:15,justifyContent:'center'},
 chipZero:{backgroundColor:'rgba(22,21,15,0.05)'},
 chipText:{fontSize:12,fontFamily:FONTS.bodyBold,color:COLORS.inkSoft},
 note:{textAlign:'center',fontSize:12,fontFamily:FONTS.bodyMedium,color:COLORS.inkFaint,paddingVertical:14},
 fab:{position:'absolute',right:16,bottom:16,width:58,height:58,borderRadius:20,backgroundColor:COLORS.orange,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.4)',shadowColor:COLORS.orange,shadowOpacity:0.45,shadowRadius:14,shadowOffset:{width:0,height:8},elevation:9},
 plaque:{flexDirection:'row',alignItems:'center',gap:12,minHeight:68,borderRadius:18,paddingHorizontal:16,paddingVertical:10,backgroundColor:COLORS.orange},
 plaqueTitre:{fontSize:15,fontFamily:FONTS.bodyBold,color:'#FFFFFF'},
 plaqueSub:{fontSize:11.5,fontFamily:FONTS.bodyMedium,color:'rgba(255,255,255,0.9)',marginTop:2},
 tuiles:{flexDirection:'row',gap:8,marginTop:8},
 tuile:{flex:1,minHeight:74,borderRadius:16,borderWidth:1,borderColor:KIT.border,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',gap:6,padding:8},
 tuileText:{fontSize:12.5,fontFamily:FONTS.bodyBold,color:COLORS.ink},
 qte:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8,borderRadius:16,borderWidth:1,borderColor:KIT.border,backgroundColor:'#FFFFFF',paddingLeft:14,paddingRight:8,paddingVertical:8},
 qteBtn:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:KIT.border,backgroundColor:KIT.card,alignItems:'center',justifyContent:'center'},
 qteBtnText:{fontSize:20,fontFamily:FONTS.bodyBold,color:COLORS.ink},
 qteVal:{minWidth:26,textAlign:'center',fontSize:17,fontFamily:FONTS.bodyBold,color:COLORS.ink},
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
