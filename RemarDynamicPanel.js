/**
 * Panneaux REMAR multi-equipements. Affichage uniquement des objets reels,
 * avec choix type courant / nom libre. La definition Excel v1 reste figee.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { obtenirTrame } from './trameRegistry.js';
import { BottomSheet } from './VisitKit.js';
import { PhotoButton } from './PhotoButton.js';
import { OptimizedRelevesPanel } from './OptimizedRelevesPanel.js';
import { OptimizedRegulationPanel } from './OptimizedRegulationPanel.js';
import { upsertRemarquePrescription, supprimerRemarqueControle } from './remarkDb.js';
import { useDurableAutosave, flushDurableAutosaves } from './durableAutosave.js';
import { getDb } from './db.js';
import {
  COMPTEURS_REMAR_USUELS, TEMPERATURES_REMAR_USUELLES, MESURES_CTA_REMAR_USUELLES,
  CLASSES_FILTRES_REMAR, AVIS_REMAR, ETATS_MESURE_REMAR, NOMS_ETAPES_CTA,
  classificationFiltre, uniteMesureCTA, valeursRapidesRemar, commentaireRemarPropose,
} from './remarFieldGuidance.js';
import {
  REMAR_FAMILLES, listerRemarEquipements, creerRemarEquipement, renommerRemarEquipement,
  retirerRemarEquipement, listerRemarItems, creerRemarItem, renommerRemarItem,
  retirerRemarItem, listerRemarValeurs, enregistrerRemarValeur,
  choisirRemarEquipementReference, getRemarEquipementReference, lireCtaParcours, choisirCtaParcours,
} from './remarDynamicDb.js';

const FAMILLE_PAR_ONGLET = Object.freeze({
  'p-remar-cta': 'cta',
  'p-remar-filtres': 'cta',
  'p-remar-cta-mesures': 'cta',
  'p-remar-cta-energie': 'cta',
  'p-remar-vmc': 'vmc',
  'p-remar-froid': 'froid',
});
const ENFANT_PAR_ONGLET = Object.freeze({
  'p-remar-filtres': 'filtre_cta',
  'p-remar-cta-mesures': 'mesure_cta',
  'p-remar-froid': 'reseau_froid',
  'p-remar-releves': 'temperature_chaufferie',
});
const PRESETS = Object.freeze({
  cta: ['CTA soufflage', 'CTA extraction', 'CTA double flux', 'CTA ventilation'],
  vmc: ['Caisson extraction', 'Caisson VMC', 'Tourelle extraction'],
  froid: ['Groupe froid', 'PAC reversible', 'Groupe eau glacee', 'Dry cooler'],
  filtre_cta: ['Filtre G4', 'Filtre M5', 'Filtre F7', 'Filtre F9', 'Filtre HEPA', 'Filtre ePM1'],
  mesure_cta: ['Air neuf', 'Apres recuperation', 'Soufflage', 'Extraction / Reprise',
    'Vitesse soufflage', 'Vitesse extraction', 'Consigne soufflage', 'Consigne extraction', 'Pression'],
  reseau_froid: ['Reseau froid 1', 'Reseau froid 2', 'Circuit eau glacee', 'Circuit secondaire'],
  temperature_chaufferie: ['Chauffage aller', 'Chauffage retour', 'ECS depart',
    'ECS bouclage', 'ECS stockage', 'Temperature exterieure', 'Autre temperature'],
});
const OPINIONS = ['S','N.S','N.R','S.O','N.V'];
const clean = v => String(v ?? '').trim();
const keyFor = (panel, section, cle) => [panel,section,cle].join('||');
const sectionCode = section => String(section).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_');
const mesureUnit = name => /pression/i.test(name) ? 'Pa' : /vitesse/i.test(name) ? '%' : '°C';

function AddSheet({ visible, title, choices, onCancel, onCreate, disabled = false }) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [free, setFree] = useState(false);
  useEffect(() => { if (visible) { setSelected(''); setCustom(''); setFree(false); } }, [visible]);
  const name = free ? clean(custom) : selected;
  return <BottomSheet visible={visible} onClose={onCancel} title={title} maxHeight="75%">
    <Text style={ui.note}>Choisir un type courant ou donner un nom libre.</Text>
    {(choices || []).map(choice =>
      <TouchableOpacity key={choice} accessibilityRole="button"
        onPress={() => { setSelected(choice); setFree(false); }}
        style={[ui.choice, !free && selected===choice && ui.selected]}>
        <Text style={ui.choiceText}>{!free && selected===choice ? '● ' : '○ '}{choice}</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity style={[ui.choice, free && ui.selected]} onPress={() => setFree(true)}>
      <Text style={ui.choiceText}>{free ? '● ' : '○ '}Nom libre</Text>
    </TouchableOpacity>
    {free ? <TextInput value={custom} onChangeText={setCustom} autoFocus
      style={ui.input} placeholder="Nom de l'élément" maxLength={120} /> : null}
    <TouchableOpacity accessibilityRole="button" disabled={!name || disabled}
      style={[ui.action, (!name || disabled) && ui.disabled]}
      onPress={() => onCreate(name)}>
      <Text style={ui.actionText}>{disabled ? 'Enregistrement…' : 'Créer la fiche'}</Text>
    </TouchableOpacity>
  </BottomSheet>;
}

async function aPhotosReserveControle(visiteId,controleKey) {
  const db=await getDb();
  const reserves=await db.getAllAsync('SELECT id FROM remarques WHERE visite_id=? AND controle_key=?',
    [visiteId,controleKey]);
  if(!reserves.length)return false;
  for(const reserve of reserves) {
    const found=await db.getFirstAsync(
      'SELECT id FROM photos WHERE visite_id=? AND entite_key=? LIMIT 1',
      [visiteId,`remarque||${reserve.id}`]);
    if(found)return true;
  }
  return false;
}

function FieldRow({ item: field, ownerType, ownerId, panelId, section, visiteId, saved, onSaved, equipmentLabel='' }) {
  const storageKey = keyFor(panelId,section,field.cle);
  const source = saved?.[storageKey] || null;
  const [avis,setAvis] = useState(source?.avis||null);
  const [busy,setBusy] = useState(false);
  const [saveError,setSaveError] = useState(null);
  const identity = {ownerType,ownerId,panelId,sectionCode:section,cle:field.cle};
  const controlKey = ['remar',ownerType,ownerId,panelId,sectionCode(section),field.cle].join('||');

  // Le hook terrain maintient un brouillon immediat, enregistre dans une file
  // SQLite serialisee et force le flush au blur, au demontage, sur retour et
  // quand Android passe en arriere-plan. Une erreur reste visible.
  const [value,setValue,flushValue,setValueImmediate,adoptValue] = useDurableAutosave(
    source?.valeur??'', async next => {
      await enregistrerRemarValeur(visiteId,{...identity,valeur:next,avis:null});
      setAvis(null);setSaveError(null);onSaved?.();
    });
  const [comment,setComment,flushComment,setCommentImmediate,adoptComment] = useDurableAutosave(
    source?.commentaire??'', async next => {
      await enregistrerRemarValeur(visiteId,{...identity,commentaire:next});
      if (field.type==='controle' && avis==='N.S') {
        await upsertRemarquePrescription(visiteId,controlKey,
          {poste:field.poste||section,prestation:next||`${field.cle} : anomalie à préciser`},
          'REMAR : contrôle individualisé');
      }
      setSaveError(null);onSaved?.();
    });

  useEffect(()=>{setAvis(source?.avis||null);},[source?.avis]);
  const controls=field.type==='controle';
  const statuses=controls?AVIS_REMAR:ETATS_MESURE_REMAR;
  const suggestions=valeursRapidesRemar(field);
  const choose=async next=>{
    if(busy)return;
    setBusy(true);
    try{
      await Promise.all([flushValue(),flushComment()]);
      const note=commentaireRemarPropose(field,next,equipmentLabel);
      const patch={...identity,avis:next,commentaire:note};
      if(!controls)patch.valeur=null;
      await enregistrerRemarValeur(visiteId,patch);
      // Les photos rattachees a une reserve N.S ne sont jamais supprimees
      // silencieusement lorsqu'on change un avis.
      if(controls&&next==='N.S'){
        await upsertRemarquePrescription(visiteId,controlKey,
          {poste:field.poste||section,prestation:note||`${field.cle} : anomalie à préciser`},
          'REMAR : contrôle individualisé');
      } else if (controls) {
        const hasPhotos = await aPhotosReserveControle(visiteId,controlKey);
        if (!hasPhotos) await supprimerRemarqueControle(visiteId,controlKey);
        else Alert.alert('Réserve avec photos conservée',
          'Des photographies sont liées à cette réserve. Elle reste accessible dans Réserves pour être traitée explicitement, sans suppression de photo.');
      }
      setAvis(next);
      adoptComment(note);
      if(!controls)adoptValue('');
      setSaveError(null);onSaved?.();
    }catch(e){
      setSaveError(String(e?.message||e));
      Alert.alert('Sauvegarde non terminée',String(e?.message||e));
    }finally{setBusy(false);}
  };
  const saisir=next=>{
    setAvis(null);
    setValue(next);
  };
  const flush=fn=>()=>fn().catch(e=>setSaveError(String(e?.message||e)));
  return <View style={ui.field}>
    <Text style={ui.fieldName}>{field.cle}</Text>
    {controls ? null : <>
      <TextInput value={value} onChangeText={saisir} onBlur={flush(flushValue)}
        onEndEditing={flush(flushValue)}
        placeholder={field.numeric?'Valeur mesurée (aucune valeur par défaut)':'Saisir ou choisir une proposition'}
        style={ui.input} keyboardType={field.numeric?'decimal-pad':'default'} />
      {suggestions.length ? <View style={ui.quickChoices}>
        {suggestions.map(choice=><TouchableOpacity key={choice} accessibilityRole="button"
          style={[ui.choiceChip,value===choice&&ui.choiceChipSelected]}
          onPress={()=>{setAvis(null);setValueImmediate(choice).catch(e=>setSaveError(String(e?.message||e)));}}>
          <Text style={ui.choiceChipText}>{choice}</Text>
        </TouchableOpacity>)}
      </View> : null}
    </>}
    <View style={ui.opinions}>
      {statuses.map(opt=><TouchableOpacity key={opt.code} accessibilityRole="button"
        accessibilityLabel={opt.label} accessibilityState={{selected:avis===opt.code}}
        disabled={busy} style={[ui.opinion,avis===opt.code&&ui.opinionSelected]}
        onPress={()=>choose(opt.code)}>
        <Text style={[ui.opinionText,avis===opt.code&&ui.opinionTextSelected]}>
          {controls?opt.code:opt.label}
        </Text>
      </TouchableOpacity>)}
      {!controls&&avis ? <TouchableOpacity onPress={async()=>{
          try{await enregistrerRemarValeur(visiteId,{...identity,avis:null});
            setAvis(null);onSaved?.();}catch(e){setSaveError(String(e?.message||e));}
        }} style={ui.opinion}><Text style={ui.opinionText}>Relever</Text></TouchableOpacity> : null}
    </View>
    {(controls||avis) ? <TextInput value={comment} onChangeText={setComment}
      onBlur={flush(flushComment)} onEndEditing={flush(flushComment)}
      placeholder="Commentaire libre, toujours modifiable" multiline style={[ui.input,{minHeight:52}]} /> : null}
    {source?.inherited ? <Text style={ui.historical}>Dernière visite : {source?.date_source||'date inconnue'} · référence modifiable, non vérifiée aujourd’hui</Text> : null}
    {saveError ? <Text style={ui.saveError}>Sauvegarde à reprendre : {saveError}</Text> : null}
    <PhotoButton visiteId={visiteId} entiteKey={controlKey} label={field.cle} />
  </View>;
}

function ChildRow({ visiteId, parent, item, typeCode, fields, data, onRefresh, onSaved }) {
  const [editName,setEditName] = useState(false), [name,setName]=useState(item.nom);
  const remove = () => Alert.alert('Retirer cet élément ?', 'L’historique des visites précédentes sera conservé.',[
    {text:'Annuler',style:'cancel'}, {text:'Retirer',style:'destructive',
      onPress:()=>retirerRemarItem(visiteId,item.id).then(onRefresh).catch(e=>Alert.alert('Retrait impossible',String(e?.message||e)))}
  ]);
  const namedFields = fields || (typeCode==='filtre_cta'
    ? [{cle:'Type de filtre',type:'champ'},{cle:'Etat du filtre',type:'controle',
       presets:{S:[{commentaire:'Filtre satisfaisant'}],'N.S':[{commentaire:'Filtre dégradé, action à préciser'}]}}]
    : [{cle:'Valeur',type:'champ',numeric:true}]);
  const saveName=async()=>{
    setEditName(false);
    if (!clean(name)||clean(name)===item.nom)return;
    try{await renommerRemarItem(visiteId,item.id,name);onRefresh?.();}
    catch(e){Alert.alert('Renommage impossible',String(e?.message||e));setName(item.nom);}
  };
  return <View style={ui.child}>
    <View style={ui.hRow}>
      {editName ? <TextInput value={name} onChangeText={setName} onEndEditing={saveName}
         autoFocus style={[ui.input,{flex:1}]} /> : <TouchableOpacity onPress={()=>setEditName(true)} style={{flex:1}}>
          <Text style={ui.childTitle}>{item.nom} ✎</Text>
        </TouchableOpacity>}
      <TouchableOpacity onPress={remove} accessibilityRole="button" accessibilityLabel="Retirer cet élément">
        <Text style={ui.remove}>Retirer</Text>
      </TouchableOpacity>
    </View>
    {namedFields.map(f=><FieldRow key={f.cle} item={f} ownerType="item" ownerId={item.id}
      panelId={typeCode==='filtre_cta'?'p-remar-filtres':typeCode==='mesure_cta'?'p-remar-cta-mesures':typeCode==='reseau_froid'?'p-remar-froid':'p-remar-releves'}
      section={typeCode} visiteId={visiteId} saved={data} onSaved={onSaved} />)}
  </View>;
}

function EquipmentCard({ equipment, visiteId, panelId, sections, family, onRefresh, onSaved, isReference, onReference }) {
  const [expanded,setExpanded]=useState(false);
  const [values,setValues]=useState({});
  const [children,setChildren]=useState([]);
  const [addChild,setAddChild]=useState(false), [busy,setBusy]=useState(false);
  const childType=ENFANT_PAR_ONGLET[panelId] || null;
  const load=useCallback(async ()=>{
    const [v,c]=await Promise.all([
      listerRemarValeurs(visiteId,'equipement',equipment.id),
      childType?listerRemarItems(visiteId,childType,equipment.id):Promise.resolve([]),
    ]);
    setValues(v);
    setChildren(await Promise.all(c.map(async child=>({...child,
      data:await listerRemarValeurs(visiteId,'item',child.id)}))));
  },[visiteId,equipment.id,childType]);
  useEffect(()=>{load().catch(e=>console.warn('REMAR equipment load',e));},[load]);
  const remove=()=>Alert.alert('Retirer cet équipement du patrimoine ?', 'Les anciennes visites et les photos restent conservées.',[
    {text:'Annuler',style:'cancel'}, {text:'Retirer',style:'destructive',
      onPress:()=>retirerRemarEquipement(visiteId,equipment.id).then(onRefresh).catch(e=>Alert.alert('Retrait impossible',String(e?.message||e)))},
  ]);
  const addItem=async nom=>{
    if(busy)return;setBusy(true);
    try{
      await creerRemarItem(visiteId,{typeCode:childType,nom,
        unite:childType==='mesure_cta'?mesureUnit(nom):null,parentEquipementId:equipment.id});
      setAddChild(false);await load();onSaved?.();
    }catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  const reservedFields = Object.entries(sections||{}).flatMap(([section, fields])=>
    (fields||[]).filter(f=>!(family==='froid'&&/^Réseau \d+$/i.test(f.cle)) &&
      !(family==='vmc'&&f.cle==='Nombre de caissons')).map(f=>({section,field:f})));
  const showFields = !childType || (panelId==='p-remar-froid');
  return <View style={ui.card}>
    <TouchableOpacity onPress={()=>setExpanded(s=>!s)} style={ui.header}>
      <Text style={ui.cardTitle}>{equipment.designation||REMAR_FAMILLES[family]?.label}</Text>
      <Text style={ui.fold}>{expanded?'▴':'▾'}</Text>
    </TouchableOpacity>
    {expanded ? <>
      <View style={ui.hRow}>
        <PhotoButton visiteId={visiteId} entiteKey={`equipement||${equipment.id}`} label={equipment.designation||'Équipement'}/>
        <TouchableOpacity onPress={onReference} accessibilityRole="button">
          <Text style={ui.link}>{isReference?'✓ Référence du rapport':'Référence du rapport Excel'}</Text>
        </TouchableOpacity>
      </View>
      {showFields ? reservedFields.map(({section,field})=><FieldRow key={section+field.cle}
        item={field} ownerType="equipement" ownerId={equipment.id} panelId={panelId}
        section={section} visiteId={visiteId} saved={values} onSaved={onSaved} />) : null}
      {childType ? <>
        {children.map(child=><ChildRow key={child.id} visiteId={visiteId} parent={equipment}
          item={child} typeCode={childType} data={child.data}
          onRefresh={load} onSaved={onSaved} />)}
        <TouchableOpacity accessibilityRole="button" style={ui.addSmall} onPress={()=>setAddChild(true)}>
          <Text style={ui.addText}>+ {childType==='filtre_cta'?'Ajouter un filtre':childType==='mesure_cta'?'Ajouter une mesure':'Ajouter un réseau froid'}</Text>
        </TouchableOpacity>
        <AddSheet visible={addChild} title="Ajouter à cet équipement" disabled={busy}
          choices={PRESETS[childType]} onCancel={()=>setAddChild(false)} onCreate={addItem}/>
      </> : null}
      <TouchableOpacity onPress={remove}><Text style={ui.remove}>Retirer l'équipement du patrimoine</Text></TouchableOpacity>
    </> : null}
  </View>;
}

function LegacyRemarReadOnly({visiteId,panelId,sections}) {
  const [items,setItems]=useState([]),[visible,setVisible]=useState(false);
  useEffect(()=>{
    let live=true;
    Promise.all([getChampsVisite(visiteId),getControlesVisite(visiteId)]).then(([ch,co])=>{
      const found=[];
      for(const [section,fields] of Object.entries(sections||{})){
        const sec=panelId.replace('p-','')+'.'+section.toLowerCase().replace(/[^a-z0-9]+/g,'_');
        for(const f of fields){
          const v=(f.type==='controle'?co:ch).find(r=>r.section_code===sec&&r.cle===f.cle);
          if(v && (clean(v.valeur)||clean(v.avis)||clean(v.commentaire))) found.push({label:f.cle,section,valeur:v.valeur,avis:v.avis,comment:v.commentaire});
        }
      }
      if(live)setItems(found);
    }).catch(()=>{});return()=>{live=false};
  },[visiteId,panelId,sections]);
  if(!items.length)return null;
  return <View style={ui.legacy}>
    <TouchableOpacity onPress={()=>setVisible(v=>!v)}>
      <Text style={ui.legacyTitle}>Archives de saisie REMAR · {items.length} donnée(s) {visible?'▴':'▾'}</Text>
    </TouchableOpacity>
    {visible?items.map((item,i)=><Text key={i} style={ui.note}>
      {item.section} · {item.label} : {[item.valeur,item.avis,item.comment].filter(Boolean).join(' · ')}
    </Text>):null}
  </View>;
}

function RemarTemperatures({visiteId,onSaved}) {
  const [items,setItems]=useState([]),[newVisible,setNewVisible]=useState(false),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const rows=await listerRemarItems(visiteId,'temperature_chaufferie');
    setItems(await Promise.all(rows.map(async r=>({...r,data:await listerRemarValeurs(visiteId,'item',r.id)}))));
  },[visiteId]);
  useEffect(()=>{refresh().catch(e=>console.warn('Temperatures REMAR',e));},[refresh]);
  const add=async name=>{
    if(busy)return;setBusy(true);
    try{await creerRemarItem(visiteId,{typeCode:'temperature_chaufferie',nom:name,unite:'°C'});
      setNewVisible(false);await refresh();onSaved?.();}
    catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  return <View style={ui.group}>
    <Text style={ui.groupLabel}>Températures</Text>
    {items.map(item=><ChildRow key={item.id} visiteId={visiteId} item={item}
      typeCode="temperature_chaufferie" data={item.data} onRefresh={refresh} onSaved={onSaved} />)}
    <TouchableOpacity accessibilityRole="button" style={ui.action} onPress={()=>setNewVisible(true)}>
      <Text style={ui.actionText}>+ Ajouter une température</Text>
    </TouchableOpacity>
    <AddSheet visible={newVisible} title="Ajouter une température"
      choices={PRESETS.temperature_chaufferie} disabled={busy}
      onCancel={()=>setNewVisible(false)} onCreate={add}/>
  </View>;
}

export function RemarDynamicPanel({visiteId,panelId,onSaved,trameId='remar_v1'}) {
  const definition = obtenirTrame(trameId);
  const family=FAMILLE_PAR_ONGLET[panelId];
  const [equipments,setEquipments]=useState([]),[adding,setAdding]=useState(false);
  const [busy,setBusy]=useState(false),[selected,setSelected]=useState(null);
  const sections=definition?.ui?.panels?.[panelId]||{};
  const refresh=useCallback(async()=>{
    if(!family)return;
    const rows=await listerRemarEquipements(visiteId,family);
    setEquipments(rows);
    setSelected(await getRemarEquipementReference(visiteId,family,rows));
  },[visiteId,family]);
  useEffect(()=>{refresh().catch(e=>console.warn('REMAR dynamic screen',e));},[refresh]);
  const create=async name=>{
    if(busy)return;setBusy(true);
    try{await creerRemarEquipement(visiteId,family,name);
      setAdding(false);await refresh();onSaved?.();}
    catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  if(panelId==='p-remar-reseaux')return <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{paddingBottom:30,paddingHorizontal:12}}>
    <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} embedded networksOnly />
    <LegacyRemarReadOnly visiteId={visiteId} panelId={panelId} sections={sections}/>
  </ScrollView>;
  if(panelId==='p-remar-releves')return <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:30}}>
    <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} trameId={trameId}
      panels={definition?.ui?.panels} meterPanelId={panelId} embedded metersOnly remarMinimal />
    <RemarTemperatures visiteId={visiteId} onSaved={onSaved}/>
    <LegacyRemarReadOnly visiteId={visiteId} panelId={panelId} sections={sections}/>
  </ScrollView>;
  if(!family)return null;
  return <View style={{flex:1}}>
    <FlatList data={equipments} keyExtractor={item=>item.id}
      extraData={selected} contentContainerStyle={ui.list}
      renderItem={({item})=><EquipmentCard key={item.id+'-'+panelId} equipment={item}
        visiteId={visiteId} panelId={panelId} sections={sections} family={family}
        isReference={selected===item.id}
        onReference={()=>choisirRemarEquipementReference(visiteId,family,item.id)
          .then(()=>setSelected(item.id)).catch(e=>Alert.alert('Référence impossible',String(e?.message||e)))}
        onRefresh={refresh} onSaved={onSaved}/>}
      ListFooterComponent={<>
        <TouchableOpacity accessibilityRole="button" style={ui.action} onPress={()=>setAdding(true)}>
          <Text style={ui.actionText}>+ {REMAR_FAMILLES[family].ajout}</Text>
        </TouchableOpacity>
        <LegacyRemarReadOnly visiteId={visiteId} panelId={panelId} sections={sections}/>
      </>}
    />
    <AddSheet visible={adding} title={REMAR_FAMILLES[family].ajout}
      choices={PRESETS[family]} disabled={busy}
      onCancel={()=>setAdding(false)} onCreate={create}/>
  </View>;
}

const ui=StyleSheet.create({
  saveError:{fontSize:12,color:'#A33625',marginTop:4,fontWeight:'600'},
  quickChoices:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8,marginBottom:5},
  choiceChip:{borderWidth:1,borderColor:'#D6DCE3',borderRadius:12,
    paddingHorizontal:10,paddingVertical:9,backgroundColor:'#F5F8FA',minHeight:39},
  choiceChipSelected:{borderColor:'#C6531B',backgroundColor:'#FFF2E9'},
  choiceChipText:{fontSize:12,color:'#213E53',fontWeight:'600'},
  list:{padding:12,paddingBottom:28,gap:10},
  card:{borderWidth:1,borderColor:'#D8DEE5',borderRadius:16,backgroundColor:'#FFFFFF',padding:12,marginBottom:10},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44},
  cardTitle:{fontSize:16,fontWeight:'700',color:'#14283D',flex:1},
  childTitle:{fontSize:14,fontWeight:'700',color:'#14283D'},
  fold:{fontSize:22,color:'#37536C'},
  hRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginVertical:6},
  field:{paddingVertical:9,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:'#E2E7EA'},
  fieldName:{fontSize:13,fontWeight:'600',color:'#243B50',marginBottom:5},
  note:{fontSize:12,color:'#687585',lineHeight:17,marginVertical:3},
  historical:{fontSize:11,color:'#8D6C24',marginTop:4},
  input:{borderColor:'#CDD7E0',borderWidth:1,backgroundColor:'#FFFFFF',borderRadius:10,
    color:'#172C42',fontSize:14,minHeight:44,paddingHorizontal:12,paddingVertical:8},
  opinions:{flexDirection:'row',gap:4,flexWrap:'wrap',marginBottom:8},
  opinion:{borderWidth:1,borderColor:'#CBD5DF',borderRadius:8,paddingVertical:8,paddingHorizontal:10},
  opinionSelected:{backgroundColor:'#FDEADB',borderColor:'#E66D22'},
  opinionText:{fontSize:12,fontWeight:'700',color:'#2B445D'},
  opinionTextSelected:{color:'#AD4B12'},
  addSmall:{borderWidth:1,borderColor:'#E3A16E',borderRadius:11,padding:11,marginVertical:10,alignItems:'center'},
  addText:{fontSize:13,color:'#A24F20',fontWeight:'700'},
  action:{backgroundColor:'#C6531B',borderRadius:12,padding:14,marginVertical:8,alignItems:'center'},
  actionText:{fontSize:14,color:'#FFFFFF',fontWeight:'700'},
  disabled:{opacity:.5},
  choice:{borderWidth:1,borderColor:'#D4DBE3',borderRadius:12,padding:12,marginBottom:6},
  selected:{borderColor:'#C6531B',backgroundColor:'#FFF3E8'},
  choiceText:{fontSize:14,color:'#172C42'},
  child:{borderRadius:12,borderWidth:1,borderColor:'#DFE3E8',padding:10,marginVertical:6,backgroundColor:'#F7F9FB'},
  remove:{fontSize:12,color:'#A43E2A',marginTop:12},
  link:{fontSize:12,color:'#A34A1C',fontWeight:'600',padding:6},
  group:{padding:12},
  groupLabel:{fontSize:15,fontWeight:'700',color:'#243B50',marginBottom:8},
  legacy:{borderColor:'#E2C9A9',borderWidth:1,borderRadius:10,padding:12,marginVertical:10,backgroundColor:'#FFF9EF'},
  legacyTitle:{fontSize:12,fontWeight:'700',color:'#81521B'},
});
