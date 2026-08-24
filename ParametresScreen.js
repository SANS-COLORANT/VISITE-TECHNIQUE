/** Écran Paramètres — réserves + catalogue matériel + sécurité des données. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { CategorieCritereSelector } from './GenericFields.js';
import { EquipmentCatalogueBrowser } from './EquipmentCatalogueBrowser.js';
import { listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio } from './db.js';
import { exporterSauvegardeBase, exporterSauvegardeComplete, choisirEtRestaurerSauvegardeComplete } from './databaseBackup.js';
import { ensureEquipmentCatalogReady } from './database/index.js';
import { diagnostiquerStockageLocal } from './storageHealth.js';

const CATEGORIES_EQUIPEMENT=['Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Coffret gaz','Compteur','Désemboueur','Détendeur','Échangeur','Extincteur','Filtre','Manomètre','Pompe','Robinetterie','Soupape','Vanne',"Vase d'expansion"];
const MARQUES_EQUIPEMENT=['De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Atlantic','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Fernox','Alfa Laval'];

function ParametresScreen(){
  const[onglet,setOnglet]=useState('reserves');
  const[cataloguePret,setCataloguePret]=useState(false);
  const[catalogueErreur,setCatalogueErreur]=useState(null);

  useEffect(()=>{
    if(onglet!=='equipements'||cataloguePret)return;
    let actif=true;
    setCatalogueErreur(null);
    ensureEquipmentCatalogReady()
      .then(()=>{if(actif)setCataloguePret(true);})
      .catch((e)=>{if(actif)setCatalogueErreur(String(e.message||e));});
    return()=>{actif=false;};
  },[onglet,cataloguePret]);

  const contenuEquipements=cataloguePret
    ?<EquipmentCatalogueBrowser/>
    :<View style={{flex:1,alignItems:'center',justifyContent:'center',padding:28}}>
      {catalogueErreur?
        <>
          <Text style={{fontSize:16,fontWeight:'800',color:COLORS.text}}>Catalogue indisponible</Text>
          <Text style={{marginTop:8,color:COLORS.muted,textAlign:'center'}}>{catalogueErreur}</Text>
          <TouchableOpacity style={[styles.btnPrimary,{marginTop:16}]} onPress={()=>{setCatalogueErreur(null);setCataloguePret(false);setOnglet('reserves');setTimeout(()=>setOnglet('equipements'),0);}}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity>
        </>
        :<>
          <ActivityIndicator size="large" color={COLORS.orange}/>
          <Text style={{marginTop:12,fontWeight:'800',color:COLORS.text}}>Préparation du catalogue…</Text>
          <Text style={{marginTop:5,color:COLORS.muted,textAlign:'center'}}>Cette étape est surtout visible au premier lancement. Les ouvertures suivantes utilisent la base déjà enrichie.</Text>
        </>}
    </View>;

  return <View style={{flex:1,backgroundColor:COLORS.bg}}>
    <View style={styles.paramTabs}>
      <TouchableOpacity style={[styles.paramTab,onglet==='reserves'&&styles.paramTabActive]} onPress={()=>setOnglet('reserves')}><Text style={[styles.paramTabText,onglet==='reserves'&&styles.paramTabTextActive]}>Réserves</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.paramTab,onglet==='equipements'&&styles.paramTabActive]} onPress={()=>setOnglet('equipements')}><Text style={[styles.paramTabText,onglet==='equipements'&&styles.paramTabTextActive]}>Équipements</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.paramTab,onglet==='donnees'&&styles.paramTabActive]} onPress={()=>setOnglet('donnees')}><Text style={[styles.paramTabText,onglet==='donnees'&&styles.paramTabTextActive]}>Données</Text></TouchableOpacity>
    </View>
    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?contenuEquipements:<GestionDonnees/>}
  </View>;
}

function BoutonDonnees({label,onPress,disabled=false,secondaire=false,danger=false}){
  const base=secondaire?styles.btnSecondary:styles.btnPrimary;
  return <TouchableOpacity
    style={[base,{marginTop:10,alignSelf:'stretch',alignItems:'center'},disabled&&{opacity:.5},danger&&{backgroundColor:'#FFF1F0',borderWidth:1,borderColor:'#F5B7B1'}]}
    disabled={disabled}
    onPress={onPress}
  >
    <Text style={danger?{color:'#A61B1B',fontWeight:'800'}:(secondaire?styles.btnSecondaryText:styles.btnPrimaryText)}>{label}</Text>
  </TouchableOpacity>;
}

function GestionDonnees(){
  const[action,setAction]=useState(null);
  const[diagnostic,setDiagnostic]=useState(null);

  const executer=async(nom,fn)=>{
    if(action)return;
    setAction(nom);
    try{return await fn();}
    finally{setAction(null);}
  };

  const sauvegarderBase=()=>executer('base',async()=>{
    try{await exporterSauvegardeBase();}
    catch(e){Alert.alert('Sauvegarde impossible',String(e.message||e));}
  });

  const sauvegarderComplet=()=>executer('complete',async()=>{
    try{
      const r=await exporterSauvegardeComplete();
      if(r) Alert.alert('Sauvegarde créée',`Archive complète créée avec ${r.manifeste?.counts?.visites||0} visite(s) et ${r.manifeste?.counts?.photos||0} photo(s).`);
    }catch(e){Alert.alert('Sauvegarde complète impossible',String(e.message||e));}
  });

  const lancerRestauration=()=>executer('restore',async()=>{
    try{
      const resultat=await choisirEtRestaurerSauvegardeComplete();
      if(!resultat)return;
      Alert.alert(
        'Restauration terminée',
        `La sauvegarde a été restaurée et contrôlée. L’application va se fermer pour recharger proprement les données au prochain lancement.`,
        [{text:'Fermer l’application',onPress:()=>BackHandler.exitApp()}],
        {cancelable:false}
      );
    }catch(e){
      Alert.alert(
        'Restauration impossible',
        `${String(e.message||e)}\n\nPour garantir une connexion SQLite propre, ferme puis relance l’application avant de poursuivre.`,
        [{text:'Fermer l’application',onPress:()=>BackHandler.exitApp()}],
        {cancelable:false}
      );
    }
  });

  const demanderRestauration=()=>Alert.alert(
    'Restaurer une sauvegarde complète ?',
    'Les données actuellement présentes sur cette tablette seront remplacées par le contenu de l’archive sélectionnée. Une copie de sécurité temporaire est créée automatiquement pendant l’opération.',
    [
      {text:'Annuler',style:'cancel'},
      {text:'Choisir une sauvegarde',style:'destructive',onPress:lancerRestauration},
    ]
  );

  const diagnostiquer=()=>executer('diagnostic',async()=>{
    try{
      const d=await diagnostiquerStockageLocal();
      setDiagnostic(d);
    }catch(e){Alert.alert('Diagnostic impossible',String(e.message||e));}
  });

  const occupe=!!action;
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.sectionLabel}>Sauvegardes</Text>
    <View style={[styles.card,{alignItems:'flex-start'}]}>
      <View style={{flex:1}}>
        <Text style={styles.cardTitle}>Sauvegarde complète</Text>
        <Text style={[styles.cardSub,{marginTop:5}]}>Archive ZIP recommandée pour le terrain : base SQLite, toutes les visites et photos gérées par l’application, plus un manifeste de version.</Text>
        <Text style={[styles.cardSub,{marginTop:6}]}>L’archive peut être enregistrée dans Drive, OneDrive, un dossier réseau ou envoyée par mail.</Text>
      </View>
      <BoutonDonnees label={action==='complete'?'Création de l’archive…':'Exporter base + photos'} disabled={occupe} onPress={sauvegarderComplet}/>
      <BoutonDonnees label={action==='base'?'Export…':'Exporter la base seule (.db)'} disabled={occupe} secondaire onPress={sauvegarderBase}/>
    </View>

    <Text style={[styles.sectionLabel,{marginTop:18}]}>Restauration</Text>
    <View style={[styles.card,{alignItems:'flex-start'}]}>
      <View style={{flex:1}}>
        <Text style={styles.cardTitle}>Restaurer une tablette</Text>
        <Text style={[styles.cardSub,{marginTop:5}]}>Restaure une archive complète créée par l’application. La version est vérifiée avant remplacement, les chemins des photos sont automatiquement adaptés à la nouvelle tablette et l’intégrité SQLite est contrôlée après restauration.</Text>
      </View>
      <BoutonDonnees label={action==='restore'?'Restauration…':'Restaurer une sauvegarde ZIP'} disabled={occupe} danger onPress={demanderRestauration}/>
    </View>

    <Text style={[styles.sectionLabel,{marginTop:18}]}>Santé des données</Text>
    <View style={[styles.card,{alignItems:'flex-start'}]}>
      <View style={{flex:1}}>
        <Text style={styles.cardTitle}>Diagnostic local</Text>
        <Text style={[styles.cardSub,{marginTop:5}]}>Vérifie l’intégrité SQLite, les relations de base, la version du schéma et la présence physique des photos.</Text>
        {diagnostic&&<View style={{marginTop:12,padding:12,borderRadius:10,backgroundColor:diagnostic.ok?'#EDF8F0':'#FFF4E5',alignSelf:'stretch'}}>
          <Text style={{fontWeight:'900',color:diagnostic.ok?'#246B38':'#8A5400'}}>{diagnostic.ok?'✓ Données saines':'⚠ Vérification nécessaire'}</Text>
          <Text style={[styles.cardSub,{marginTop:6}]}>SQLite : {diagnostic.integrityOk?'OK':'Erreur'} · Relations : {diagnostic.foreignKeysOk?'OK':'Erreur'} · Schéma : v{diagnostic.versionSchema}/{diagnostic.versionAttendue}</Text>
          <Text style={[styles.cardSub,{marginTop:3}]}>{diagnostic.clients} clients · {diagnostic.sites} sites · {diagnostic.visites} visites · {diagnostic.remarques} réserves</Text>
          <Text style={[styles.cardSub,{marginTop:3}]}>Photos : {diagnostic.photosTotal} référencées · {diagnostic.photosManquantes} manquante(s)</Text>
        </View>}
      </View>
      <BoutonDonnees label={action==='diagnostic'?'Diagnostic…':'Lancer le diagnostic'} disabled={occupe} secondaire onPress={diagnostiquer}/>
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
