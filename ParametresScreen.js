/** Écran Paramètres — réserves + catalogue matériel + sauvegarde des données. */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { CategorieCritereSelector } from './GenericFields.js';
import { EquipmentCatalogueBrowser } from './EquipmentCatalogueBrowser.js';
import { listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio } from './db.js';
import { exporterSauvegardeBase } from './databaseBackup.js';

const CATEGORIES_EQUIPEMENT=['Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Coffret gaz','Compteur','Désemboueur','Détendeur','Échangeur','Extincteur','Filtre','Manomètre','Pompe','Robinetterie','Soupape','Vanne',"Vase d'expansion"];
const MARQUES_EQUIPEMENT=['De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Atlantic','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Fernox','Alfa Laval'];

function ParametresScreen(){
  const[onglet,setOnglet]=useState('reserves');
  return <View style={{flex:1,backgroundColor:COLORS.bg}}>
    <View style={styles.paramTabs}>
      <TouchableOpacity style={[styles.paramTab,onglet==='reserves'&&styles.paramTabActive]} onPress={()=>setOnglet('reserves')}><Text style={[styles.paramTabText,onglet==='reserves'&&styles.paramTabTextActive]}>Réserves</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.paramTab,onglet==='equipements'&&styles.paramTabActive]} onPress={()=>setOnglet('equipements')}><Text style={[styles.paramTabText,onglet==='equipements'&&styles.paramTabTextActive]}>Équipements</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.paramTab,onglet==='donnees'&&styles.paramTabActive]} onPress={()=>setOnglet('donnees')}><Text style={[styles.paramTabText,onglet==='donnees'&&styles.paramTabTextActive]}>Données</Text></TouchableOpacity>
    </View>
    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?<EquipmentCatalogueBrowser/>:<GestionDonnees/>}
  </View>;
}

function GestionDonnees(){
  const[enCours,setEnCours]=useState(false);
  const sauvegarder=async()=>{
    if(enCours)return;
    setEnCours(true);
    try{
      await exporterSauvegardeBase();
    }catch(e){
      Alert.alert('Sauvegarde impossible',String(e.message||e));
    }finally{
      setEnCours(false);
    }
  };
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.sectionLabel}>Sauvegarde locale</Text>
    <View style={[styles.card,{alignItems:'flex-start'}]}>
      <View style={{flex:1}}>
        <Text style={styles.cardTitle}>Sauvegarder toutes les données</Text>
        <Text style={[styles.cardSub,{marginTop:5}]}>Crée une copie autonome de la base SQLite contenant clients, sites, visites, contrôles, équipements, compteurs et réserves. Le fichier peut ensuite être enregistré dans Drive, OneDrive, un dossier réseau ou envoyé par mail.</Text>
        <Text style={[styles.cardSub,{marginTop:8}]}>Les photos restent stockées séparément dans l'application ; leur archivage complet sera ajouté dans une sauvegarde ZIP dédiée.</Text>
      </View>
      <TouchableOpacity style={[styles.btnPrimary,{marginTop:14,alignSelf:'stretch',alignItems:'center'},enCours&&{opacity:.55}]} disabled={enCours} onPress={sauvegarder}>
        <Text style={styles.btnPrimaryText}>{enCours?'Sauvegarde…':'Exporter la sauvegarde'}</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>;
}

function BibliothequeReserves(){
  const[reserves,setReserves]=useState([]),[modalVisible,setModalVisible]=useState(false),[editId,setEditId]=useState(null),[nom,setNom]=useState(''),[description,setDescription]=useState(''),[prix,setPrix]=useState(''),[poste,setPoste]=useState(''),[delai,setDelai]=useState('');
  const charger=useCallback(()=>{listerBibliothequeReserves().then(setReserves);},[]);useEffect(()=>{charger();},[charger]);
  const ouvrirNouveau=()=>{setEditId(null);setNom('');setDescription('');setPrix('');setPoste('');setDelai('');setModalVisible(true);};
  const ouvrirEdition=r=>{setEditId(r.id);setNom(r.nom);setDescription(r.description||'');setPrix(r.prix?String(r.prix):'');setPoste(r.poste||'');setDelai(r.delai?String(r.delai):'');setModalVisible(true);};
  const enregistrer=async()=>{if(!nom.trim()){Alert.alert('Nom requis','Merci de donner un nom à cette réserve.');return;}const data={nom:nom.trim(),description:description.trim()||null,prix:prix?parseFloat(prix.replace(',','.')):null,poste:poste.trim()||null,delai:delai?parseInt(delai,10):null};try{if(editId)await modifierReserveBiblio(editId,data);else await ajouterReserveBiblio(data);setModalVisible(false);await charger();}catch(e){Alert.alert('Erreur d’enregistrement',String(e.message||e));}};
  const supprimer=r=>Alert.alert('Supprimer',`Supprimer « ${r.nom} » de la bibliothèque ?`,[{text:'Annuler',style:'cancel'},{text:'Supprimer',style:'destructive',onPress:async()=>{await supprimerReserveBiblio(r.id);charger();}}]);
  return <View style={{flex:1}}><FlatList contentContainerStyle={styles.content} data={reserves} keyExtractor={i=>i.id} initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews ListHeaderComponent={<View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>Bibliothèque de réserves</Text><TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity></View>} renderItem={({item})=><TouchableOpacity style={styles.card} activeOpacity={.7} onPress={()=>ouvrirEdition(item)}><View style={{flex:1}}><Text style={styles.cardTitle}>{item.nom}</Text>{item.description?<Text style={styles.cardSub} numberOfLines={2}>{item.description}</Text>:null}</View><TouchableOpacity onPress={()=>supprimer(item)}><Text style={styles.removeLink}>Suppr.</Text></TouchableOpacity></TouchableOpacity>}/><Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.modalTitle}>{editId?'Modifier la réserve':'Nouvelle réserve'}</Text>{!editId?<View style={{marginBottom:14,paddingBottom:14,borderBottomWidth:1,borderBottomColor:COLORS.line}}><CategorieCritereSelector onRempli={r=>{setNom(r.nom);setDescription(r.description);setPoste(r.poste||'');setDelai(r.delai?String(r.delai):'');setPrix(r.prix?String(Math.round(r.prix)):'');}}/></View>:null}<TextInput style={styles.input} placeholder="Nom" value={nom} onChangeText={setNom}/><TextInput style={[styles.input,{marginTop:10,height:70,textAlignVertical:'top'}]} placeholder="Description / prestation" value={description} onChangeText={setDescription} multiline/><TextInput style={[styles.input,{marginTop:10}]} placeholder="Poste" value={poste} onChangeText={setPoste}/><View style={{flexDirection:'row',gap:10,marginTop:10}}><TextInput style={[styles.input,{flex:1}]} placeholder="Prix (€HT)" value={prix} onChangeText={setPrix} keyboardType="numeric"/><TextInput style={[styles.input,{flex:1}]} placeholder="Délai (mois)" value={delai} onChangeText={setDelai} keyboardType="numeric"/></View><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={()=>setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View></ScrollView></View></View></Modal></View>;
}

export { ParametresScreen, CATEGORIES_EQUIPEMENT, MARQUES_EQUIPEMENT };
