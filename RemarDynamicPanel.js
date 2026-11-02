/**
 * Panneaux REMAR multi-equipements. Affichage uniquement des objets reels,
 * avec choix type courant / nom libre. La definition Excel v1 reste figee.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles as fieldStyles } from './styles.js';
import { hapticTick } from './fieldFeedback.js';
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
  const [sExpanded,setSExpanded] = useState(false);
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
    hapticTick();
    setSExpanded(false);
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
  const avisPalette=avis==='S'
    ? {bg:COLORS.greenBg,border:COLORS.green,text:COLORS.green}
    : avis==='N.S' ? {bg:COLORS.redBg,border:COLORS.red,text:COLORS.red}
    : {bg:COLORS.bg,border:COLORS.line,text:COLORS.inkSoft};
  const paletteChip=code=>code==='S'
    ? {bg:COLORS.greenBg,border:COLORS.green,text:COLORS.green}
    : code==='N.S'?{bg:COLORS.redBg,border:COLORS.red,text:COLORS.red}
    : {bg:COLORS.line,border:COLORS.inkFaint,text:COLORS.inkSoft};
  const pickedPresets=controls && avis ? (field.presets?.[avis]||[]) : [];
  const photoLabel=equipmentLabel ? `${equipmentLabel} · ${field.cle}` : field.cle;
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
    <View style={fieldStyles.avisGroup}>
      {statuses.map(opt=>{
        const tone=paletteChip(opt.code),active=avis===opt.code;
        return <TouchableOpacity key={opt.code} accessibilityRole="button"
          accessibilityLabel={opt.label} accessibilityState={{selected:active}}
          activeOpacity={0.75} disabled={busy}
          style={[fieldStyles.avisChip,
            {minHeight:44,justifyContent:'center',minWidth:controls?50:75},
            active&&{backgroundColor:tone.bg,borderColor:tone.border}]}
          onPress={()=>choose(opt.code)}>
          <Text style={[fieldStyles.avisChipText,active&&{color:tone.text,fontFamily:FONTS.bold}]}>
            {controls?opt.code:opt.label}
          </Text>
        </TouchableOpacity>;
      })}
      {!controls&&avis ? <TouchableOpacity accessibilityRole="button"
        accessibilityLabel="Relever cette mesure"
        onPress={async()=>{
          try{await enregistrerRemarValeur(visiteId,{...identity,avis:null});setAvis(null);onSaved?.();}
          catch(e){setSaveError(String(e?.message||e));}
        }} style={fieldStyles.avisChip}>
        <Text style={fieldStyles.avisChipText}>Relever</Text>
      </TouchableOpacity> : null}
    </View>
    {avis ? <View style={[fieldStyles.criterePanel,
      {backgroundColor:avisPalette.bg,borderColor:avisPalette.border,marginTop:7}]}>
      <Text style={[fieldStyles.criterePanelLabel,{color:avisPalette.text}]}>
        {avis==='S'?'Fonctionnel / satisfaisant':
          avis==='N.S'?'Anomalie / non satisfaisant':
          avis==='S.O'?'Sans objet / non présent':
          avis==='N.R'?'Non réalisé / non vérifié':'Non visible / inaccessible'}
      </Text>
      {avis==='S'&&!sExpanded ? <View style={ui.hRow}>
        <Text numberOfLines={2} style={[ui.note,{flex:1,color:COLORS.green}]}>
          {comment||'Satisfaisant · commentaire disponible'}
        </Text>
        <TouchableOpacity onPress={()=>setSExpanded(true)} accessibilityRole="button"
          style={[ui.choiceChip,{borderColor:COLORS.green}]}>
          <Text style={{color:COLORS.green,fontFamily:FONTS.bold,fontSize:12}}>Modifier</Text>
        </TouchableOpacity>
      </View> : <>
        {pickedPresets.length>0 ? <View style={fieldStyles.critereChips}>
          {pickedPresets.map((p,i)=><TouchableOpacity key={i}
            accessibilityRole="button" accessibilityLabel={p.label||'Commentaire rapide'}
            style={[fieldStyles.critereChip,{borderColor:avisPalette.text}]}
            onPress={()=>setCommentImmediate(p.commentaire||'')
              .catch(e=>setSaveError(String(e?.message||e)))}>
            <Text style={[fieldStyles.critereChipText,{color:avisPalette.text}]}>
              {p.label||'Commentaire proposé'}
            </Text>
          </TouchableOpacity>)}
        </View> : null}
        <TextInput value={comment} onChangeText={setComment}
          onBlur={flush(flushComment)} onEndEditing={flush(flushComment)}
          placeholder="Commentaire technique personnalisable" multiline
          style={[ui.input,{minHeight:60,marginTop:7,backgroundColor:COLORS.white}]}/>
        {avis==='S' ? <TouchableOpacity accessibilityRole="button" onPress={()=>setSExpanded(false)}>
          <Text style={{color:COLORS.green,fontFamily:FONTS.bodySemi,fontSize:11,paddingVertical:8}}>
            Replier le commentaire
          </Text>
        </TouchableOpacity> : null}
      </>}
    </View> : null}
    {source?.inherited ? <Text style={ui.historical}>Dernière visite : {source?.date_source||'date inconnue'} · référence modifiable, non vérifiée aujourd’hui</Text> : null}
    {saveError ? <Text style={ui.saveError}>Sauvegarde à reprendre : {saveError}</Text> : null}
    <PhotoButton visiteId={visiteId} entiteKey={controlKey} label={photoLabel} />
  </View>;
}

function ChildRow({ visiteId, parent, item, typeCode, fields, data, onRefresh, onSaved }) {
  const [editName,setEditName] = useState(false);
  const [name,setName,flushName] = useDurableAutosave(item.nom,async next=>{
    const propre=clean(next);
    if(!propre)throw new Error('Le nom de cet élément ne peut pas être vide.');
    if(propre!==item.nom){await renommerRemarItem(visiteId,item.id,propre);onSaved?.();}
  });
  const remove=()=>Alert.alert('Retirer cet élément ?',
    'Il disparaîtra de la visite courante et du patrimoine actif, mais restera dans les anciennes visites.',
    [{text:'Annuler',style:'cancel'}, {text:'Retirer',style:'destructive',onPress:async()=>{
      try{await flushDurableAutosaves();await retirerRemarItem(visiteId,item.id);
        await onRefresh?.();onSaved?.();}
      catch(e){Alert.alert('Retrait impossible',String(e?.message||e));}
    }}]);
  const filtre=typeCode==='filtre_cta';
  const namedFields=fields || (filtre ? [
    {cle:'Classe de filtration',type:'champ',options:CLASSES_FILTRES_REMAR},
    {cle:'Etat du filtre',type:'controle',poste:parent?.designation||'Filtration',
      presets:{
        S:[{commentaire:'Filtre : propre, correctement positionné et état visuel satisfaisant.'}],
        'N.S':[{commentaire:'Filtre : encrassement, dégradation ou défaut de montage constaté, à préciser.'}],
        'N.R':[{commentaire:'Filtre non contrôlé, motif à préciser.'}],
        'S.O':[{commentaire:'Filtre sans objet pour cette installation.'}],
        'N.V':[{commentaire:'Filtre non visible ou inaccessible.'}],
      }},
  ] : [{cle:'Valeur',type:'champ',numeric:true}]);
  return <View style={ui.child}>
    <View style={ui.hRow}>
      {editName ? <TextInput value={name} onChangeText={setName}
         onBlur={()=>flushName().catch(e=>Alert.alert('Nom non enregistré',String(e?.message||e))).finally(()=>setEditName(false))}
         onEndEditing={()=>flushName().catch(()=>{})}
         autoFocus style={[ui.input,{flex:1}]}
         accessibilityLabel={filtre?'Nom du filtre':'Nom de l’élément'}/> :
        <TouchableOpacity onPress={()=>setEditName(true)} style={{flex:1}}>
          <Text style={ui.childTitle}>{filtre?'Nom du filtre : ':''}{name}  ✎</Text>
          {filtre ? <Text style={ui.note}>La classe G4/F7/ePM est distincte du nom et reste modifiable.</Text> : null}
          {!filtre && item.unite ? <Text style={ui.note}>Unité : {item.unite}</Text> : null}
        </TouchableOpacity>}
      <TouchableOpacity onPress={remove} accessibilityRole="button" accessibilityLabel="Retirer cet élément">
        <Text style={ui.remove}>Retirer</Text>
      </TouchableOpacity>
    </View>
    {namedFields.map(f=><FieldRow key={f.cle} item={f} ownerType="item" ownerId={item.id}
      equipmentLabel={parent?.designation ? parent.designation+' / '+item.nom : item.nom}
      panelId={typeCode==='filtre_cta'?'p-remar-filtres':typeCode==='mesure_cta'?'p-remar-cta-mesures':typeCode==='reseau_froid'?'p-remar-froid':'p-remar-releves'}
      section={typeCode} visiteId={visiteId} saved={data} onSaved={onSaved} />)}
  </View>;
}

/** Raccourcis techniques visibles mais non enregistres : un clic explicite
 * cree la fiche. Aucun materiel, valeur ni avis ne sont inventes en SQLite.
 */
function MesureRapide({nom,onCreate,busy=false}) {
  return <View style={ui.missingMeasure}>
    <Text style={ui.missingLabel}>{nom}</Text>
    <View style={ui.quickChoices}>
      <TouchableOpacity disabled={busy} onPress={()=>onCreate(nom,null)} style={ui.choiceChip}>
        <Text style={ui.choiceChipText}>+ Relever</Text>
      </TouchableOpacity>
      {ETATS_MESURE_REMAR.map(opt=><TouchableOpacity key={opt.code}
        disabled={busy} onPress={()=>onCreate(nom,opt.code)} style={ui.choiceChip}>
        <Text style={ui.choiceChipText}>{opt.label}</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
}

function EquipmentCard({ equipment, visiteId, panelId, sections, family, onRefresh, onSaved, isReference, onReference, autoOpen=false }) {
  const [expanded,setExpanded]=useState(autoOpen);
  const [rename,setRename]=useState(false);
  const [equipmentName,setEquipmentName,flushEquipmentName] = useDurableAutosave(
    equipment.designation||'',async next=>{
      if(!clean(next))throw new Error('Nom de la CTA requis.');
      if(clean(next)!==equipment.designation){
        await renommerRemarEquipement(visiteId,equipment.id,clean(next));
        onSaved?.();
      }
    });
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
  const addItem=async (nom,etat=null)=>{
    if(busy)return;setBusy(true);
    try{
      const itemId=await creerRemarItem(visiteId,{typeCode:childType,nom,
        unite:childType==='mesure_cta'?uniteMesureCTA(nom):null,parentEquipementId:equipment.id});
      if(childType==='filtre_cta'){
        const classe=classificationFiltre(nom);
        if(classe)await enregistrerRemarValeur(visiteId,{
          ownerType:'item',ownerId:itemId,panelId:'p-remar-filtres',
          sectionCode:'filtre_cta',cle:'Classe de filtration',valeur:classe,
        });
      }
      if(childType==='mesure_cta' && etat)await enregistrerRemarValeur(visiteId,{
        ownerType:'item',ownerId:itemId,panelId:'p-remar-cta-mesures',
        sectionCode:'mesure_cta',cle:'Valeur',valeur:null,avis:etat,
        commentaire:etat==='N.R'?'Mesure non relevée.':etat==='S.O'?'Mesure sans objet pour cette CTA.':'Point inaccessible ou non visible.',
      });
      setAddChild(false);await load();onSaved?.();
    }catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  const missingMeasures = childType==='mesure_cta'
    ? MESURES_CTA_REMAR_USUELLES.filter(name=>!children.some(c=>clean(c.nom).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===clean(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()))
    : [];
  const reservedFields = Object.entries(sections||{}).flatMap(([section, fields])=>
    (fields||[]).filter(f=>!(family==='froid'&&/^Réseau \d+$/i.test(f.cle)) &&
      !(family==='vmc'&&f.cle==='Nombre de caissons')).map(f=>({section,field:f})));
  const showFields = !childType || (panelId==='p-remar-froid');
  return <View style={ui.card}>
    <View style={ui.header}>
      {rename ? <TextInput autoFocus value={equipmentName} onChangeText={setEquipmentName}
        accessibilityLabel="Nom de l'équipement"
        onBlur={()=>flushEquipmentName().catch(e=>Alert.alert('Renommage impossible',String(e?.message||e))).finally(()=>{setRename(false);onRefresh?.();})}
        style={[ui.input,{flex:1}]}/> :
      <TouchableOpacity onPress={()=>setExpanded(s=>!s)} style={{flex:1,minHeight:44,justifyContent:'center'}}>
        <Text style={ui.cardTitle}>{equipmentName||REMAR_FAMILLES[family]?.label} {expanded?'▴':'▾'}</Text>
      </TouchableOpacity>}
      <TouchableOpacity onPress={()=>setRename(true)} accessibilityLabel="Renommer l'équipement" style={ui.renameBtn}>
        <Text style={ui.link}>✎ Nom</Text>
      </TouchableOpacity>
    </View>
    {expanded ? <>
      <View style={ui.hRow}>
        <PhotoButton visiteId={visiteId} entiteKey={`equipement||${equipment.id}`} label={equipmentName||'Équipement'}/>
        <TouchableOpacity onPress={onReference} accessibilityRole="button">
          <Text style={ui.link}>{isReference?'✓ Référence du rapport':'Référence du rapport Excel'}</Text>
        </TouchableOpacity>
      </View>
      {showFields ? reservedFields.map(({section,field})=><FieldRow key={section+field.cle}
        item={field} ownerType="equipement" ownerId={equipment.id} panelId={panelId}
        equipmentLabel={equipmentName} section={section} visiteId={visiteId} saved={values} onSaved={onSaved} />) : null}
      {childType ? <>
        {children.map(child=><ChildRow key={child.id} visiteId={visiteId} parent={equipment}
          item={child} typeCode={childType} data={child.data}
          onRefresh={load} onSaved={onSaved} />)}
        {missingMeasures.length ? <View style={{marginVertical:10}}>
          <Text style={ui.groupLabel}>Mesures usuelles · à relever selon l'installation</Text>
          <Text style={ui.note}>Les mesures sont proposées sans valeur ni avis validé. Un seul toucher pour relever, N.R, S.O ou N.V.</Text>
          {missingMeasures.map(nom=><MesureRapide key={nom} nom={nom} busy={busy} onCreate={addItem}/>)}
        </View> : null}
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
  useEffect(()=>{refresh().catch(e=>console.warn('Températures REMAR',e));},[refresh]);
  const add=async (name,status=null)=>{
    if(busy)return;setBusy(true);
    try{
      const id=await creerRemarItem(visiteId,{typeCode:'temperature_chaufferie',nom:name,unite:'°C'});
      if(status)await enregistrerRemarValeur(visiteId,{
        ownerType:'item',ownerId:id,panelId:'p-remar-releves',
        sectionCode:'temperature_chaufferie',cle:'Valeur',valeur:null,avis:status,
        commentaire:status==='N.R'?'Température non relevée.':status==='S.O'?'Mesure sans objet pour ce local.':'Point inaccessible ou non visible.',
      });
      setNewVisible(false);await refresh();onSaved?.();
    }catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  const normalized = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const missing = TEMPERATURES_REMAR_USUELLES.filter(name=>!items.some(i=>normalized(i.nom)===normalized(name)));
  return <View style={ui.group}>
    <Text style={ui.groupLabel}>Températures usuelles</Text>
    <Text style={ui.note}>Primaire aller/retour, chauffage aller/retour, ECS départ/bouclage/stockage. Les lignes non relevées sont seulement des raccourcis, pas des mesures inventées.</Text>
    {items.map(item=><ChildRow key={item.id} visiteId={visiteId} item={item}
      typeCode="temperature_chaufferie" data={item.data} onRefresh={refresh} onSaved={onSaved} />)}
    {missing.map(name=><MesureRapide key={name} nom={name} busy={busy} onCreate={add}/>)}
    <TouchableOpacity accessibilityRole="button" style={ui.addSmall} onPress={()=>setNewVisible(true)}>
      <Text style={ui.addText}>+ Autre température</Text>
    </TouchableOpacity>
    <AddSheet visible={newVisible} title="Ajouter une autre température"
      choices={['Température extérieure','Autre température','Ballon haut','Ballon bas']}
      disabled={busy} onCancel={()=>setNewVisible(false)} onCreate={nom=>add(nom)}/>
  </View>;
}

function ValidationParCTA({visiteId,equipment,definition,onSaved}) {
  const [bilan,setBilan]=useState(null);
  const refresh=useCallback(async()=>{
    const panels=NOMS_ETAPES_CTA.filter(step=>step.id!=='validation');
    const [values,filters,measures]=await Promise.all([
      listerRemarValeurs(visiteId,'equipement',equipment.id),
      listerRemarItems(visiteId,'filtre_cta',equipment.id),
      listerRemarItems(visiteId,'mesure_cta',equipment.id),
    ]);
    const rows=[];
    for(const step of panels){
      const fields=Object.values(definition.ui?.panels?.[step.id]||{}).flat();
      const own=Object.values(values).filter(v=>v.panel_id===step.id &&
        v.visite_id===visiteId&&(clean(v.valeur)||clean(v.avis)||clean(v.commentaire)));
      if(step.id==='p-remar-filtres'||step.id==='p-remar-cta-mesures'){
        const list=step.id==='p-remar-filtres'?filters:measures;
        let checked=0,issues=0;
        for(const item of list){
          const observations=Object.values(await listerRemarValeurs(visiteId,'item',item.id))
            .filter(row=>row.visite_id===visiteId);
          if(observations.some(row=>clean(row.avis)||clean(row.valeur)))checked++;
          issues+=observations.filter(row=>row.avis==='N.S').length;
        }
        rows.push({title:step.nom,total:list.length,done:checked,issues});
      }else rows.push({title:step.nom,total:fields.length,done:own.length,
        issues:own.filter(v=>v.avis==='N.S').length});
    }
    setBilan(rows);
  },[visiteId,equipment.id,definition]);
  useEffect(()=>{refresh().catch(e=>console.warn('Bilan CTA indisponible',e));},[refresh]);
  return <View style={ui.card}>
    <Text style={ui.cardTitle}>Vérification · {equipment.designation}</Text>
    <Text style={ui.note}>Les dernières valeurs reprises servent de référence. Seuls les contrôles réalisés ou les choix explicites de cette visite comptent comme saisis.</Text>
    {(bilan||[]).map(item=><View key={item.title} style={ui.validationRow}>
      <Text style={ui.fieldName}>{item.title}</Text>
      <Text style={ui.note}>{item.done} / {item.total} renseigné(s) pendant cette visite
        {item.issues ? ` · ${item.issues} N.S` : ''}</Text>
    </View>)}
    <Text style={ui.historical}>Aucun contrôle n'est validé automatiquement en S. Vérifie les écarts avant de passer à la CTA suivante.</Text>
    <TouchableOpacity onPress={()=>{refresh().catch(()=>{});onSaved?.();}} style={ui.addSmall}>
      <Text style={ui.addText}>Actualiser la vérification</Text>
    </TouchableOpacity>
  </View>;
}

export function RemarDynamicPanel({visiteId,panelId,onSaved,trameId='remar_v1'}) {
  const definition = obtenirTrame(trameId);
  const family = FAMILLE_PAR_ONGLET[panelId] || null;
  const cta=family==='cta';
  const [equipments,setEquipments] = useState([]);
  const [adding,setAdding] = useState(false);
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState(null);
  const [activeCtaId,setActiveCtaId] = useState(null);
  const [currentStep,setCurrentStep] = useState(
    NOMS_ETAPES_CTA.some(x=>x.id===panelId)?panelId:'p-remar-cta'
  );
  const sections=definition?.ui?.panels?.[panelId]||{};
  useEffect(()=>{
    if(cta&&NOMS_ETAPES_CTA.some(x=>x.id===panelId))setCurrentStep(panelId);
  },[panelId,cta]);

  const refresh=useCallback(async()=>{
    if(!family)return;
    const rows=await listerRemarEquipements(visiteId,family);
    const reportReference=await getRemarEquipementReference(visiteId,family,rows);
    setEquipments(rows);
    setSelected(reportReference);
    if(family==='cta'){
      const persisted=await lireCtaParcours(visiteId);
      setActiveCtaId(old => rows.some(e=>e.id===old)?old:
        rows.find(e=>e.id===persisted)?.id || rows[0]?.id || null);
    }
  },[visiteId,family]);
  useEffect(()=>{refresh().catch(e=>console.warn('REMAR écran dynamique',e));},[refresh]);

  // Le flush est bloquant avant toute navigation CTA. Si SQLite refuse une
  // ecriture, l'agent reste dans la fiche au lieu de perdre sa modification.
  const flushAvantNavigation=async()=>{
    const results=await flushDurableAutosaves();
    const failure=results.find(result=>result.status==='rejected');
    if(failure){
      Alert.alert('Sauvegarde incomplète',
        String(failure.reason?.message||failure.reason)+'\nRéessaie sans quitter cette fiche.');
      return false;
    }
    return true;
  };
  const changeStep=async next=>{
    if(!await flushAvantNavigation())return;
    setCurrentStep(next);
  };
  const selectCta=async id=>{
    if(!await flushAvantNavigation())return;
    try{
      await choisirCtaParcours(visiteId,id);
      setActiveCtaId(id);
      setCurrentStep('p-remar-cta');
    }catch(e){Alert.alert('Choix CTA impossible',String(e?.message||e));}
  };
  const create=async name=>{
    if(busy)return;
    setBusy(true);
    try{
      let finalName=name;
      if(cta&&PRESETS.cta.includes(name)){
        const present=new Set(equipments.map(e=>clean(e.designation)));
        let number=1;
        while(present.has(`CTA ${number} — ${name}`))number++;
        finalName=`CTA ${number} — ${name}`;
      }
      const id=await creerRemarEquipement(visiteId,family,finalName);
      if(cta){
        await choisirCtaParcours(visiteId,id);
        setActiveCtaId(id);setCurrentStep('p-remar-cta');
      }
      setAdding(false);await refresh();onSaved?.();
    }catch(e){Alert.alert('Ajout impossible',String(e?.message||e));}
    finally{setBusy(false);}
  };
  if(panelId==='p-remar-reseaux')return <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{paddingBottom:30,paddingHorizontal:12}}>
    <OptimizedRegulationPanel visiteId={visiteId} onSaved={onSaved} embedded networksOnly />
    <LegacyRemarReadOnly visiteId={visiteId} panelId={panelId} sections={sections}/>
  </ScrollView>;
  if(panelId==='p-remar-releves')return <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled"
    contentContainerStyle={{paddingBottom:30}}>
    <OptimizedRelevesPanel visiteId={visiteId} onSaved={onSaved} trameId={trameId}
      panels={definition?.ui?.panels} meterPanelId={panelId} embedded metersOnly remarMinimal />
    <RemarTemperatures visiteId={visiteId} onSaved={onSaved}/>
    <LegacyRemarReadOnly visiteId={visiteId} panelId={panelId} sections={sections}/>
  </ScrollView>;
  if(!family)return null;
  const activeCta=cta?equipments.find(e=>e.id===activeCtaId)||equipments[0]||null:null;
  const stepIndex=NOMS_ETAPES_CTA.findIndex(x=>x.id===currentStep);
  const nextStep=NOMS_ETAPES_CTA[stepIndex+1];
  if(cta)return <View style={{flex:1}}>
    <ScrollView style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={ui.list}>
      <Text style={ui.groupLabel}>Parcours par CTA</Text>
      <Text style={ui.note}>Choisis une CTA : ses contrôles, ses filtres, ses mesures et ses améliorations restent regroupés. Les données sont sauvegardées avant tout changement de fiche.</Text>
      {equipments.length?<View style={ui.ctaSelector}>
        {equipments.map((e,index)=><TouchableOpacity key={e.id} accessibilityRole="button"
          accessibilityLabel={`Ouvrir CTA ${index+1}, ${e.designation}`}
          accessibilityState={{selected:activeCta?.id===e.id}}
          activeOpacity={0.7} hitSlop={6}
          onPress={()=>{selectCta(e.id).catch(error=>Alert.alert('Ouverture CTA impossible',String(error?.message||error)));}}
          style={[ui.ctaSelectCard,activeCta?.id===e.id&&ui.ctaChipSelected]}>
          <Text numberOfLines={2} style={[ui.ctaChipText,activeCta?.id===e.id&&ui.ctaChipTextSelected]}>
            {e.designation}
          </Text>
          <Text style={[ui.ctaSelectAction,activeCta?.id===e.id&&ui.ctaChipTextSelected]}>
            {activeCta?.id===e.id?'✓ CTA affichée':'Ouvrir cette CTA →'}
          </Text>
        </TouchableOpacity>)}
      </View>:<Text style={ui.note}>Aucune CTA constatée dans ce local. Commence par en ajouter une.</Text>}
      <TouchableOpacity style={ui.addSmall} accessibilityRole="button" onPress={()=>setAdding(true)}>
        <Text style={ui.addText}>+ Ajouter une CTA</Text>
      </TouchableOpacity>
      {activeCta?<>
        <View style={ui.ctaIdentity}>
          <Text style={ui.cardTitle}>{activeCta.designation}</Text>
          <Text style={ui.note}>Parcours de visite individuel · {stepIndex+1} / {NOMS_ETAPES_CTA.length}</Text>
        </View>
        <View style={ui.ctaStepGrid}>
          {NOMS_ETAPES_CTA.map((step,index)=><TouchableOpacity key={step.id}
            accessibilityRole="button" accessibilityLabel={`Ouvrir l'étape ${index+1} : ${step.nom}`}
            accessibilityState={{selected:currentStep===step.id}}
            activeOpacity={0.7} hitSlop={4}
            onPress={()=>{changeStep(step.id).catch(error=>Alert.alert('Navigation impossible',String(error?.message||error)));}}
            style={[ui.stepChip,currentStep===step.id&&ui.stepChipSelected]}>
            <Text style={[ui.stepText,currentStep===step.id&&ui.stepTextSelected]}>{index+1}. {step.nom}</Text>
          </TouchableOpacity>)}
        </View>
        {currentStep==='validation'
          ? <ValidationParCTA key={activeCta.id} visiteId={visiteId} equipment={activeCta}
            definition={definition} onSaved={onSaved}/>
          : <EquipmentCard key={activeCta.id+currentStep}
            equipment={activeCta} visiteId={visiteId} panelId={currentStep}
            sections={definition.ui?.panels?.[currentStep]||{}} family="cta"
            autoOpen onRefresh={refresh} onSaved={onSaved}
            isReference={selected===activeCta.id}
            onReference={()=>choisirRemarEquipementReference(visiteId,'cta',activeCta.id)
              .then(()=>setSelected(activeCta.id))
              .catch(e=>Alert.alert('Référence Excel impossible',String(e?.message||e)))}/>}
        <View style={ui.ctaActions}>
          {stepIndex>0?<TouchableOpacity style={ui.addSmall}
            onPress={()=>changeStep(NOMS_ETAPES_CTA[stepIndex-1].id)}>
            <Text style={ui.addText}>Étape précédente</Text>
          </TouchableOpacity>:null}
          {nextStep?<TouchableOpacity style={ui.action}
            onPress={()=>changeStep(nextStep.id)}>
            <Text style={ui.actionText}>Suivant · {nextStep.nom}</Text>
          </TouchableOpacity>:<TouchableOpacity style={ui.action} onPress={()=>{
            const index=equipments.findIndex(e=>e.id===activeCta.id);
            if(equipments[index+1])selectCta(equipments[index+1].id);
            else Alert.alert('Parcours CTA parcouru',
              'Vérifie les points non renseignés. Aucune valeur ou avis n’est confirmé automatiquement.');
          }}>
            <Text style={ui.actionText}>Passer à la CTA suivante</Text>
          </TouchableOpacity>}
        </View>
        <LegacyRemarReadOnly visiteId={visiteId} panelId={currentStep}
          sections={definition.ui?.panels?.[currentStep]||{}}/>
      </>:null}
    </ScrollView>
    <AddSheet visible={adding} title="Ajouter une CTA" disabled={busy}
      choices={PRESETS.cta} onCancel={()=>setAdding(false)} onCreate={create}/>
  </View>;
  return <View style={{flex:1}}>
    <FlatList data={equipments} keyExtractor={item=>item.id}
      extraData={selected} contentContainerStyle={ui.list}
      renderItem={({item})=><EquipmentCard key={item.id+panelId} equipment={item}
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
  // Des boutons fixes et larges évitent le conflit de gestes entre les deux
  // ScrollView horizontales et le pager natif de la tablette.
  ctaSelector:{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:8},
  ctaSelectCard:{borderWidth:1.5,borderColor:'#CBD8E2',backgroundColor:'#FFFFFF',
    borderRadius:15,minHeight:76,paddingVertical:13,paddingHorizontal:13,
    width:'48%',justifyContent:'space-between'},
  ctaSelectAction:{fontSize:12,color:'#A45124',fontWeight:'700',marginTop:7},
  ctaStepGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingVertical:9,
    justifyContent:'flex-start'},

  ctaIdentity:{padding:12,borderRadius:12,backgroundColor:'#F3F7F9',borderColor:'#D8E3E9',borderWidth:1,marginVertical:6},
  ctaPicker:{gap:7,paddingVertical:7,paddingRight:12},
  ctaChip:{borderRadius:12,borderWidth:1,borderColor:'#D9E2EA',paddingHorizontal:12,
    paddingVertical:12,backgroundColor:'#FFFFFF',minHeight:45,justifyContent:'center'},
  ctaChipSelected:{borderColor:'#C6531B',backgroundColor:'#FFF0E5'},
  ctaChipText:{fontSize:13,color:'#304A5D',fontWeight:'600'},
  ctaChipTextSelected:{color:'#8D4014'},
  stepChip:{borderWidth:1,borderColor:'#DBE4EA',borderRadius:10,
    paddingVertical:10,paddingHorizontal:10,minHeight:42,justifyContent:'center'},
  stepChipSelected:{backgroundColor:'#C6531B',borderColor:'#C6531B'},
  stepText:{fontSize:12,color:'#405A6A',fontWeight:'600'},
  stepTextSelected:{color:'#FFFFFF'},
  ctaActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:9},
  validationRow:{paddingVertical:10,borderBottomColor:'#E3E9EC',borderBottomWidth:1},

  renameBtn:{marginLeft:8,alignSelf:'center',minHeight:44,justifyContent:'center'},
  missingMeasure:{borderColor:'#DDE5EC',borderWidth:1,borderRadius:12,padding:10,marginVertical:4,backgroundColor:'#FAFBFC'},
  missingLabel:{fontSize:14,color:'#203B50',fontWeight:'700'},
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
