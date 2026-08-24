import React,{memo,useCallback,useEffect,useMemo,useState}from'react';
import{FlatList,Text,TextInput,TouchableOpacity,View}from'react-native';
import{listerMateriel,ajouterMateriel,upsertMaterielChamp,supprimerMateriel,listerBibliothequeEquipements,listerCategoriesEquipement,listerMarquesEquipement}from'./db.js';
import{TypeAheadInput,ChipSelector}from'./GenericFields.js';
import{useDurableAutosave}from'./durableAutosave.js';
import{PhotoButton}from'./PhotoButton.js';
import{BrandMark}from'./BrandLogo.js';
import{styles}from'./styles.js';

const TYPES=['Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Compteur','Désemboueur','Détendeur','Échangeur','Filtre','Manomètre','Pompe','Soupape','Vanne',"Vase d'expansion"];
const MARQUES=['De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Atlantic','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Alfa Laval'];
const norm=v=>String(v||'').trim().toLowerCase();
const eq=(a,b)=>norm(a)===norm(b);
const uniq=a=>[...new Set((a||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

const EquipmentCard=memo(function EquipmentCard({item,visiteId,onChange,types,marques,catalogue}){
 const[categorie,setCategorie]=useState(item.categorie||'');
 const[marque,setMarque]=useState(item.marque||'');
 const[etat,setEtat]=useState(item.etat||'');
 const[designation,setDesignation,blurDesignation,setDesignationNow]=useDurableAutosave(item.designation,v=>upsertMaterielChamp(item.id,'designation',v));
 const[modele,setModele,,setModeleNow]=useDurableAutosave(item.modele,v=>upsertMaterielChamp(item.id,'modele',v));
 const[annee,setAnnee,blurAnnee]=useDurableAutosave(item.annee,v=>upsertMaterielChamp(item.id,'annee',v));
 useEffect(()=>{setCategorie(item.categorie||'');setMarque(item.marque||'');setEtat(item.etat||'')},[item.categorie,item.marque,item.etat]);
 const refsType=useMemo(()=>catalogue.filter(e=>!categorie||eq(e.categorie,categorie)),[catalogue,categorie]);
 const marquesType=useMemo(()=>uniq(refsType.map(e=>e.marque)),[refsType]);
 const modeles=useMemo(()=>uniq(catalogue.filter(e=>(!categorie||eq(e.categorie,categorie))&&(!marque||eq(e.marque,marque))).map(e=>e.modele)),[catalogue,categorie,marque]);
 const choisirType=async v=>{const t=String(v||'').trim();setCategorie(t);await upsertMaterielChamp(item.id,'categorie',t);await setDesignationNow(t||'Équipement');const compat=refsType.some(e=>eq(e.marque,marque));if(marque&&!compat){setMarque('');await upsertMaterielChamp(item.id,'marque','');await setModeleNow('')}};
 const choisirMarque=async v=>{const m=String(v||'').trim();setMarque(m);await upsertMaterielChamp(item.id,'marque',m);if(modele&&!catalogue.some(e=>(!categorie||eq(e.categorie,categorie))&&eq(e.marque,m)&&eq(e.modele,modele)))await setModeleNow('')};
 const choisirModele=async v=>{const m=String(v||'').trim();await setModeleNow(m);const ref=catalogue.find(e=>eq(e.modele,m)&&(!categorie||eq(e.categorie,categorie))&&(!marque||eq(e.marque,marque)));if(ref?.marque&&!eq(ref.marque,marque)){setMarque(ref.marque);await upsertMaterielChamp(item.id,'marque',ref.marque)}};
 const sauverEtat=async v=>{setEtat(v);await upsertMaterielChamp(item.id,'etat',v)};
 return <View style={styles.formCard}>
  <View style={styles.equipmentBrandHeader}><BrandMark marque={marque} compact/><View style={{flex:1}}><Text style={styles.cardTitle}>{designation||categorie||'Nouvel équipement'}</Text><Text style={styles.cardSub}>{[marque,modele].filter(Boolean).join(' · ')||'À compléter'}</Text></View><PhotoButton visiteId={visiteId} entiteKey={item.equipement_id?`equipement||${item.equipement_id}`:`materiel||${item.id}`} label={designation||categorie||'Équipement'}/></View>
  <Text style={styles.fieldLabel}>1. Type d’équipement</Text><TypeAheadInput valeur={categorie} options={types} placeholder="Pompe, Chaudière, Échangeur…" onChange={choisirType}/>
  <View style={{height:10}}/><Text style={styles.fieldLabel}>2. Désignation</Text><TextInput style={styles.input} value={designation} onChangeText={setDesignation} onBlur={blurDesignation} placeholder={categorie?`Ex. ${categorie} double`:'Désignation'}/><Text style={styles.importHint}>Le type est repris automatiquement puis reste modifiable.</Text>
  <View style={{height:10}}/><Text style={styles.fieldLabel}>3. Marque</Text><TypeAheadInput valeur={marque} options={marquesType.length?marquesType:marques} placeholder="Marque" onChange={choisirMarque}/>
  <View style={{height:10}}/><Text style={styles.fieldLabel}>4. Modèle</Text><TypeAheadInput valeur={modele} options={modeles} placeholder={marque?`Modèle ${marque}`:'Choisir la marque'} onChange={choisirModele}/>{categorie&&marque&&modeles.length?<Text style={styles.importHint}>{modeles.length} modèle(s) disponible(s) dans la base.</Text>:null}
  <View style={{height:10,}}/><Text style={styles.fieldLabel}>Année</Text><TextInput style={[styles.input,{width:120}]} value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" placeholder="Année"/>
  <View style={{height:10}}/><Text style={styles.fieldLabel}>5. État constaté</Text><View style={{height:6}}/><ChipSelector valeur={etat} options={['Bon','À surveiller','Dégradé','Hors service']} onChange={sauverEtat}/>
  <TouchableOpacity style={{marginTop:12}} onPress={async()=>{await supprimerMateriel(item.id);await onChange()}}><Text style={styles.removeLink}>Déclarer cet équipement retiré</Text></TouchableOpacity>
 </View>
});

export function GuidedEquipmentPanel({visiteId}){
 const[materiel,setMateriel]=useState([]),[types,setTypes]=useState(TYPES),[marques,setMarques]=useState(MARQUES),[catalogue,setCatalogue]=useState([]);
 const charger=useCallback(async()=>setMateriel(await listerMateriel(visiteId)),[visiteId]);
 useEffect(()=>{charger()},[charger]);
 useEffect(()=>{let actif=true;Promise.all([listerCategoriesEquipement(),listerMarquesEquipement(),listerBibliothequeEquipements()]).then(([c,m,r])=>{if(!actif)return;setTypes(uniq([...TYPES,...c.map(x=>x.nom)]));setMarques(uniq([...MARQUES,...m.map(x=>x.nom)]));setCatalogue(r||[])}).catch(()=>{});return()=>{actif=false}},[]);
 const ajouter=useCallback(async()=>{await ajouterMateriel(visiteId);await charger()},[visiteId,charger]);
 return <FlatList data={materiel} keyExtractor={i=>i.id} renderItem={({item})=><EquipmentCard item={item} visiteId={visiteId} onChange={charger} types={types} marques={marques} catalogue={catalogue}/>} contentContainerStyle={styles.panelContent} ListHeaderComponent={<View><Text style={styles.sectionTitle}>Équipements · {materiel.length}</Text><Text style={styles.importHint}>Type → Désignation → Marque → Modèle → État</Text></View>} ListFooterComponent={<TouchableOpacity style={styles.addBtn} onPress={ajouter}><Text style={styles.addBtnText}>+ Ajouter un équipement</Text></TouchableOpacity>} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled"/>;
}
