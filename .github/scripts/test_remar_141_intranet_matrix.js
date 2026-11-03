/**
 * Audit exhaustif REMAR -> Intranet V1 (contrat de simulation hors ligne).
 * Exerce le VRAI sérialiseur pour les 141 champs du référentiel local.
 * Ce test ne remplace pas un aller-retour authentifié avec Symfony.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const definition=JSON.parse(read('remarTrame.js').match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
function load(file,deps,names){
  const code=read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s*\{[^}]+\};?/g,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
const projectionTools=load('remarDynamicExportDb.js',{},['remarDynamicOwnsMapping']);
let projection={hasDynamic:false};
const serializer=load('intranetVisitPayload.js',{
  getDb:async()=>{throw new Error('SQLite access mocked explicitly by this field test');},
  obtenirTrame:()=>definition,
  construireRemarDynamiquePourRapport:async()=>projection,
  remarDynamicOwnsMapping:projectionTools.remarDynamicOwnsMapping,
  formaterReleves:load('releveMultiligne.js',{pictoTemperature:()=>({})},['formaterReleves']).formaterReleves,
  formaterTemperatureGroupee:(_name,value)=>value,
},['buildCriteria','inspectIntranetCriterionCandidate']);

const mappings=definition.excel.fieldMappings;
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
const identity=m=>[m.panelId,m.section,m.cle,m.type].join('||');
const official=m=>[m.sectionCode,m.cle].join('||');
const uniqueKeys=new Set(mappings.map(identity));
check(mappings.length===141&&uniqueKeys.size===141,'141 unique official REMAR fields');
check(mappings.filter(m=>m.type==='controle').length===70,'70 S/NS controls');
check(mappings.filter(m=>m.type==='champ').length===71,'71 user data fields');
check(new Set(mappings.map(official)).size===141,'SQL key uniqueness');
check(new Set(mappings.map(m=>m.valueCell)).size===141,'Excel cell uniqueness');
for(const m of mappings) {
  const field=definition.ui.panels[m.panelId]?.[m.section]?.find(f=>f.cle===m.cle&&f.type===m.type);
  check(!!field,'UI field with exact identity: '+identity(m));
}

// Référence serveur fictive mais structurellement complète, une ID de critère
// par point, cat/sous-cat indépendants : jamais un ID de production inventé.
let rid=1000, cid=10;
const remoteIndex=[];
const categories=Object.entries(definition.ui.panels).map(([panelId,sections])=>{
  const cId=cid++;
  return {id:cId,nom:panelId==='p-infos'
    ?'INFORMATION GÉNÉRALE CHAUFFERIE':panelId==='p-remar-froid'
      ?'INFORMATION GÉNÉRALE PRODUCTION FROID':definition.ui.labels?.[panelId]||panelId,
    sousCategories:Object.entries(sections).map(([section,fields])=>{
      const sId=cid++;
      return {id:sId,nom:section,criteres:fields.map(field=>{
        const criterion={id:rid++,nom:field.cle,avisApplicable:field.type==='controle'};
        const m=mappings.find(x=>x.panelId===panelId&&x.section===section&&x.cle===field.cle&&x.type===field.type);
        remoteIndex.push({criterion,m,panelId,section});
        return criterion;
      })};
    })};
});
const remote={categories};
check(remoteIndex.length===141,'141 distinct Symfony-style fixture criteria');
for(const {criterion,m,panelId,section} of remoteIndex){
  const resolved=serializer.inspectIntranetCriterionCandidate('remar_v1',criterion,
    definition.ui.labels?.[panelId]||panelId,section).resolved;
  check(resolved && identity(resolved)===identity(m),
    'one-to-one deterministic candidate '+identity(m)+', found '+JSON.stringify(resolved));
}

const fields=mappings.filter(m=>m.type==='champ').map(m=>({
  section_code:m.sectionCode,cle:m.cle,valeur:'CHAMP:'+identity(m),
}));
const controls=mappings.filter(m=>m.type==='controle').map(m=>({
  section_code:m.sectionCode,cle:m.cle,avis:'S',commentaire:'CONTROLE:'+identity(m),
}));
function dbFor({networks=[],meters=[],fieldRows=fields,controlRows=controls}={}){
  return {getAllAsync:async sql=>{
    if(sql.includes('FROM champs_visite'))return fieldRows;
    if(sql.includes('FROM controles_visite'))return controlRows;
    if(sql.includes('FROM reseaux'))return networks;
    if(sql.includes('FROM compteurs'))return meters;
    if(sql.includes('FROM provenances'))return [];
    if(sql.includes('FROM points_mesure_visite'))return [];
    if(sql.includes('FROM remarques'))return [];
    throw new Error('Unexpected SQLite query: '+sql);
  }};
}
async function build(extra={}){
  const issues=[];
  const values=await serializer.buildCriteria(dbFor(extra),{id:'remar-141',trame_id:'remar_v1'},
    {trame:extra.remote||remote},issues);
  return {values,issues};
}
function outputFor(result,m){
  const idx=remoteIndex.findIndex(x=>identity(x.m)===identity(m));
  return result.values[idx];
}
function find(panel,cle,section=null){
  const m=mappings.find(x=>x.panelId===panel&&x.cle===cle&&(!section||x.section===section));
  assert.ok(m,'Missing fixture mapping '+panel+'/'+cle);
  return m;
}

(async()=>{
  const base=await build();
  check(base.issues.length===0,'full static criterion mapping passes: '+base.issues.join(' | '));
  check(base.values.length===141,'141 criteria in outbound wire');
  for(const {m} of remoteIndex){
    const wire=outputFor(base,m);
    if(m.type==='controle')
      check(wire.avis==='S'&&wire.commentaire==='CONTROLE:'+identity(m),
        'control and description survive: '+identity(m));
    else
      check(wire.avis===null&&wire.commentaire==='CHAMP:'+identity(m),
        'input value survives: '+identity(m));
  }

  // Contrôle inverse (le problème A2) : un point local saisi mais absent
  // du catalogue Symfony ne doit pas disparaître du POST comme si de rien.
  // Les champs de métadonnées dans le panneau Informations sont transportés
  // par les propriétés localId/trameId/date du POST, pas deux fois comme critères.
  const metadataRemote=structuredClone(remote);
  let removedMetadata=0;
  for(let catIndex=0;catIndex<metadataRemote.categories.length;catIndex++){
    const [panel,sections]=Object.entries(definition.ui.panels)[catIndex];
    for(let subIndex=0;subIndex<metadataRemote.categories[catIndex].sousCategories.length;subIndex++){
      const [section]=Object.entries(sections)[subIndex];
      const sub=metadataRemote.categories[catIndex].sousCategories[subIndex];
      const original=sub.criteres.length;
      sub.criteres=sub.criteres.filter(c=>!sections[section].some(f=>
        f.cle===c.nom && ['client','site','local','type','dateVisite'].includes(f.meta)));
      removedMetadata+=original-sub.criteres.length;
    }
  }
  check(removedMetadata>=5,'fixture excludes visit identity from remote criteria');
  const withoutMetadata=await build({remote:metadataRemote});
  check(withoutMetadata.issues.length===0,
    'REMAR visit metadata do not require duplicate Symfony criteria: '+withoutMetadata.issues.join(' | '));

  const oneMissing=structuredClone(remote);
  const missingCriterion=remoteIndex.find(r=>r.panelId==='p-remar-cta' && r.m.cle==='Année CTA');
  for(const cat of oneMissing.categories)for(const sub of cat.sousCategories)
    sub.criteres=sub.criteres.filter(c=>c.id!==missingCriterion.criterion.id);
  const missing=await build({remote:oneMissing});
  check(missing.issues.some(x=>x.includes('non couverte par les critères') && x.includes('Année CTA')),
    'REMAR refuses a genuine CTA field without any published Symfony criterion');
  const duplicated=structuredClone(remote);
  duplicated.categories[0].sousCategories[0].criteres.push({
    ...duplicated.categories[0].sousCategories[0].criteres[0],id:999999,
  });
  const duplicateRemote=await build({remote:duplicated});
  check(duplicateRemote.issues.some(x=>x.includes('plusieurs critères Intranet')),
    'REMAR refuses a single local value mapped to multiple remote criteria');

  // Recette de la véritable trame CLASSIQUE 16 du terrain 02/11/2026.
  // L'extrait du rapport s'arrête au milieu du dernier critère ; il ne
  // prétend pas décrire tous les critères serveur. Contrairement à notre
  // fixture 141/141, il contient les mêmes noms « Réseau 1 » en contexte
  // chaufferie et des compteurs techniques avisApplicable=oui.
  const frozen=JSON.parse(read('.github/fixtures/remar_classique_16_frozen_20261102.json'));
  check(frozen.id===16&&frozen.truncated===true&&frozen.categories.length===5,
    'preserve true remote REMAR CLASSIQUE ID 16 excerpt and truncation marker');
  const frozenCount=frozen.categories.reduce((n,cat)=>n+cat.sousCategories.reduce(
    (m,sub)=>m+sub.criteres.length,0),0);
  check(frozenCount===69,'69 complete Symfony criteria preserved from terrain (last record truncated)');
  const heating=serializer.inspectIntranetCriterionCandidate('remar_v1',
    {id:303,nom:'Réseau 1',avisApplicable:false},
    'INFORMATION GÉNÉRALE CHAUFFERIE','Réseaux').resolved;
  check(heating?.panelId==='p-remar-reseaux',
    'real Symfony category 53 / sub 89 / criterion 303 maps HEATING, never cooling');
  const cooling=serializer.inspectIntranetCriterionCandidate('remar_v1',
    {id:7003,nom:'Réseau 1',avisApplicable:false},
    'PRODUCTION DE FROID','Réseaux').resolved;
  check(cooling?.panelId==='p-remar-froid',
    'identically named network criterion in cooling context maps COOLING');
  const noContext=serializer.inspectIntranetCriterionCandidate('remar_v1',
    {id:7777,nom:'Réseau 1',avisApplicable:false},
    'INSTALLATIONS','Réseaux').resolved;
  check(noContext===null,'same-name network without domain context is refused');
  // Actual 03/11/2026 incident: 3 criteria are published in BOTH site
  // categories with the exact same label and subcategory. Never map the
  // heating criterion to cold merely because the cold section has a better
  // fuzzy score ("Informations du site").
  for(const criterionName of ['Type de régulation','Situation','Accessibilité']){
    const criterion={id:9100,nom:criterionName,avisApplicable:false};
    const heating=serializer.inspectIntranetCriterionCandidate('remar_v1',criterion,
      'INFORMATION GÉNÉRALE CHAUFFERIE','Informations du site').resolved;
    const cooling=serializer.inspectIntranetCriterionCandidate('remar_v1',criterion,
      'INFORMATION GÉNÉRALE PRODUCTION FROID','Informations du site').resolved;
    const unknown=serializer.inspectIntranetCriterionCandidate('remar_v1',criterion,
      'INFORMATION GÉNÉRALE','Informations du site').resolved;
    const mixed=serializer.inspectIntranetCriterionCandidate('remar_v1',criterion,
      'CHAUFFERIE ET PRODUCTION FROID','Informations du site').resolved;
    check(heating?.panelId==='p-infos' && heating.cle===criterionName,
      'chauffage site '+criterionName+' maps ONLY to p-infos');
    check(cooling?.panelId==='p-remar-froid' && cooling.cle===criterionName,
      'cold site '+criterionName+' maps ONLY to p-remar-froid');
    check(unknown===null&&mixed===null,
      'ambiguous server category fails closed for '+criterionName);
  }

  const testNetwork=[{id:'r-1',ordre:1,nom_reseau:'Réseau chauffage bureaux',
    courbe_de_chauffe:'1.2',tnc:'20'}];
  const testEnergyMeters=[
    {id:'eA',label:'Chaleur A',destination:"Compteur d'énergie (MWh)",
      valeur:'1234',unite:'MWh'},
    {id:'eB',label:'Chaleur B',destination:"Compteur d'énergie (MWh)",
      valeur:'5678',unite:'MWh'},
  ];
  const actualRemote=await build({
    remote:frozen,networks:testNetwork,meters:testEnergyMeters,
  });
  check(actualRemote.values.length===69,'one output criterion per real frozen Symfony criterion');
  check(!actualRemote.issues.some(issue=>issue.includes('Réseau REMAR 1 : aucun critère')),
    'the observed false network 1 blocker is eliminated');
  const networkCriterion=actualRemote.values.find(row=>
    row.categorieId===53&&row.sousCategorieId===89&&row.critereId===303);
  check(networkCriterion?.commentaire==='Réseau chauffage bureaux\nCourbe de chauffe : 1.2\nTNC : 20 °C',
    'real criterion 303 receives current heating network plus curve, never a cooling network');
  const energy=actualRemote.values.find(row=>
    row.categorieId===51&&row.sousCategorieId===73&&row.critereId===233);
  check(energy?.avis==='N.V'&&energy?.commentaire===
      'Chaleur A : 1234 MWh\nChaleur B : 5678 MWh',
    'a meter with avisApplicable=true still exports BOTH numeric readings and explicit N.V');
  const temperature=actualRemote.values.find(row=>
    row.categorieId===51&&row.sousCategorieId===95&&row.critereId===228);
  check(temperature?.avis==='N.V'&&
    temperature?.commentaire==='CHAMP:p-remar-releves||Température chaufferie||Chauffage aller (°C)||champ',
    'real Symfony temperature applicable avis must not erase METRA field');
  for(const [name,panel] of [
    ['Année CTA','p-remar-cta'],
    ['Etat du caisson','p-remar-vmc'],
    ['Production froid','p-remar-froid'],
  ])check(actualRemote.issues.some(issue=>
      issue.includes('non couverte par les critères') &&
      issue.includes('« '+name+' »') && issue.includes('('+panel+' /')),
    'genuinely missing family criterion remains blocked: '+panel+'/'+name);
  check(!actualRemote.values.some(row=>row.critereId===330 &&
      row.commentaire.includes('p-remar-cta-energie')),
    'CTA programs are not smuggled into central heating criteria');

  // Les cinq états réglementaires doivent rester des codes distincts pour
  // les 70 contrôles, sans transformer N.R / S.O / N.V en S ni en N.S.
  for(const avis of ['S','N.S','N.R','S.O','N.V']){
    const variant=await build({controlRows:controls.map(row=>({...row,avis,
      commentaire:avis+': observation technique explicitement saisie.'}))});
    check(variant.issues.length===0,'no loss on status '+avis+': '+variant.issues.join(' | '));
    for(const {m} of remoteIndex.filter(x=>x.m.type==='controle')){
      const sent=outputFor(variant,m);
      check(sent.avis===avis&&sent.commentaire===avis+': observation technique explicitement saisie.',
        avis+' retained for '+identity(m));
    }
  }

  const networks=[
    {id:'n1',ordre:1,nom_reseau:'Circuit bureau actuel'},
    {id:'n2',ordre:2,nom_reseau:'Circuit gymnase actuel'},
  ];
  const withNetworks=await build({networks});
  check(withNetworks.issues.length===0,
    'REMAR fixed network slots do not require nonexistent Symfony network groups: '+withNetworks.issues.join(' | '));
  check(outputFor(withNetworks,find('p-remar-reseaux','Réseau 1')).commentaire==='Circuit bureau actuel',
    'current network 1 replaces flat historic value');
  check(outputFor(withNetworks,find('p-remar-reseaux','Réseau 2')).commentaire==='Circuit gymnase actuel',
    'current network 2 replaces flat historic value');
  check(outputFor(withNetworks,find('p-remar-reseaux','Réseau 3')).commentaire==='/',
    'absent current network 3 never resurrects historic field');
  const six=await build({networks:[...networks,...[3,4,5,6].map(n=>({
    id:'n'+n,ordre:n,nom_reseau:'Circuit '+n,
  }))]});
  check(six.issues.length===0,'six REMAR networks fit five Symfony cells');
  check(outputFor(six,find('p-remar-reseaux','Réseau 5')).commentaire===
    'Réseau 5 : Circuit 5\nRéseau 6 : Circuit 6',
    'network six has its own line in the fifth official cell');

  // Reproduire un serveur REMAR ne proposant pas les cinq cases « Réseau n »
  // mais un champ texte officiel « Réseaux de chauffage » unique.
  const oneNetworkCriterion=structuredClone(remote);
  const netCategoryIndex=Object.keys(definition.ui.panels).indexOf('p-remar-reseaux');
  const netCategory=oneNetworkCriterion.categories[netCategoryIndex];
  netCategory.sousCategories.forEach(sub=>sub.criteres=[]);
  const aggregateId=909090;
  netCategory.sousCategories[0].criteres.push({
    id:aggregateId,nom:'Réseaux de chauffage',avisApplicable:false,
  });
  const networkSummary=await build({networks,remote:oneNetworkCriterion});
  check(networkSummary.issues.length===0,
    'REMAR can use uniquely named Symfony network summary instead of nonexistent numbered slots: '+
      networkSummary.issues.join(' | '));
  check(networkSummary.values.find(v=>v.critereId===aggregateId)?.commentaire===
    'Réseau 1 : Circuit bureau actuel\nRéseau 2 : Circuit gymnase actuel',
    'single official network criterion groups all named networks with line breaks');

  const noNetworkCriterion=structuredClone(oneNetworkCriterion);
  noNetworkCriterion.categories[netCategoryIndex].sousCategories[0].criteres=[];
  const noNetwork=await build({networks,remote:noNetworkCriterion});
  check(noNetwork.issues.some(v=>v.includes('Réseau REMAR 1')),
    'REMAR still rejects network data with no confirmed destination at all');

  const tooMuchNetwork=await build({networks:[
    {id:'n1',ordre:1,nom_reseau:'Circuit bureaux',tnc:'20',courbe_de_chauffe:'1.1'},
  ]});
  check(tooMuchNetwork.issues.length===0,'named REMAR network technical fields fit Symfony text');
  check(outputFor(tooMuchNetwork,find('p-remar-reseaux','Réseau 1')).commentaire===
    'Circuit bureaux\nCourbe de chauffe : 1.1\nTNC : 20 °C',
    'network name, curve and TNC survive in readable separate lines');

  const extraMeter=await build({meters:[
    {id:'extra',destination:'supplementaire',label:'Sous-compteur magasin',valeur:'345',unite:'m³'},
  ]});
  check(extraMeter.issues.some(x=>x.includes('destination Intranet ambiguë ou inconnue')),
    'unclassifiable supplementary meter requires an explicit destination');
  const unknownMeter=await build({meters:[
    {id:'unknown',destination:null,label:'Compteur de test inconnu',valeur:'12',unite:'m³'},
  ]});
  check(unknownMeter.issues.some(x=>x.includes('destination Intranet ambiguë ou inconnue')),
    'unmapped manual REMAR meter cannot be silently discarded');

  const groupedGas=await build({meters:[
    {id:'gaz-a',destination:'supplementaire',label:'Compteur Gaz A',valeur:'1222',unite:'m³'},
    {id:'gaz-b',destination:'supplementaire',label:'Compteur Gaz B',valeur:'2588899',unite:'m³'},
  ]});
  check(groupedGas.issues.length===0,'two supplementary named gas meters can be classified safely: '+groupedGas.issues.join(' | '));
  check(outputFor(groupedGas,find('p-remar-releves','Compteur Gaz (m³)')).commentaire===
    'Compteur Gaz A : 1222 m³\nCompteur Gaz B : 2588899 m³',
    'Symfony V1 receives two independent gas meter readings in one multiline criterion; actual='+
      JSON.stringify(outputFor(groupedGas,find('p-remar-releves','Compteur Gaz (m³)')).commentaire));

  const conflictingMeter=await build({meters:[
    {id:'bad',destination:'supplementaire',label:'Compteur gaz ECS',valeur:'123',unite:'m³'},
  ]});
  check(conflictingMeter.issues.some(x=>x.includes('destination Intranet ambiguë')),
    'a meter matching two possible destinations stays blocked, never guessed');

  const withMeter=await build({meters:[
    {id:'gaz',destination:'Compteur Gaz (m³)',label:'Gaz chaufferie',valeur:'15855',unite:'m³'},
  ]});
  check(withMeter.issues.length===0,'meter mapping is accepted');
  check(outputFor(withMeter,find('p-remar-releves','Compteur Gaz (m³)')).commentaire==='15855',
    'actual gas meter value has precedence');
  check(outputFor(withMeter,find('p-remar-releves',"Compteur d'énergie (MWh)")).commentaire==='/',
    'old energy meter field not resurrected');

  // REMAR new equipment state claims its complete panel. The untouched
  // historical flat values must NOT leak into the new Symfony visit.
  const replacements=new Map();
  for(const m of mappings.filter(m=>['p-remar-cta','p-remar-cta-energie'].includes(m.panelId)&&m.type==='controle')){
    replacements.set([m.panelId,m.section,m.cle].join('||'),{
      avis:'S',commentaire:'Contrôle réalisé sur la CTA sélectionnée.',
    });
  }
  const year=find('p-remar-cta','Année CTA');
  replacements.set([year.panelId,year.section,year.cle].join('||'),{valeur:'2026'});
  projection={hasDynamic:true,familyCounts:{cta:1,vmc:1,froid:1},temperaturesCount:1,
    replacements,ambiguous:[],unsupported:[]};
  const dynamic=await build();
  check(dynamic.issues.length===0,'complete confirmed CTA with other families missing values: '+dynamic.issues.join(' | '));
  check(outputFor(dynamic,year).commentaire==='2026','CTA official year current value');
  check(outputFor(dynamic,find('p-remar-cta','Type de batterie')).commentaire==='/',
    'current CTA blank cannot inherit old flat field');
  check(outputFor(dynamic,find('p-remar-filtres','Etat du filtre','Filtre n°1')).avis==='N.V',
    'missing current filter opinion is not replaced by old S');
  check(outputFor(dynamic,find('p-remar-vmc','Type de ventilation')).commentaire==='/',
    'current VMC blank cannot inherit old legacy field');
  check(outputFor(dynamic,find('p-remar-froid','Production froid')).commentaire==='/',
    'current cold-production blank cannot inherit old legacy field');
  check(outputFor(dynamic,find('p-remar-releves','Chauffage aller (°C)')).commentaire==='/',
    'current temperature blank cannot inherit old flat measure');
  check(outputFor(dynamic,find('p-conf-local','BAES')).avis==='S',
    'static compliance outside dynamic panels remains unchanged');
  // Plusieurs fiches matérielles distinctes -> UN critère texte par case
  // Symfony V1. Les noms, valeurs, unités et avis doivent rester lisibles.
  const detail=[];
  const push=(family,parentName,parentId,name,id,type,panel,section,cle,valeur='',avis='',commentaire='',status='Visite courante',unite='')=>
    detail.push([family,parentName,parentId,name,id,type,panel,section,cle,valeur,avis,commentaire,'',status,unite]);
  for(const [id,name] of [['cta-a','CTA bureaux'],['cta-b','CTA gymnase']]){
    push('cta','','',name,id,'equipement','p-remar-cta','Équipement','Identité patrimoine',name);
    push('cta','','',name,id,'equipement','p-remar-cta','Informations techniques','Année CTA',id==='cta-a'?'2019':'2025');
    for(const m of mappings.filter(m=>['p-remar-cta','p-remar-cta-energie'].includes(m.panelId)&&m.type==='controle')){
      const nonSatisfied=id==='cta-b'&&m.cle==='Eclairage du caisson';
      push('cta','','',name,id,'equipement',m.panelId,m.section,m.cle,'',
        nonSatisfied?'N.S':'S',nonSatisfied?'Éclairage du caisson défectueux.':'Point vérifié et satisfaisant.');
    }
    const filterId=id+'-filtre';
    push('cta',name,id,'Filtre soufflage',filterId,'filtre_cta','p-remar-filtres','filtre_cta',
      'Classe de filtration',id==='cta-a'?'G4':'F7');
    push('cta',name,id,'Filtre soufflage',filterId,'filtre_cta','p-remar-filtres','filtre_cta',
      'Etat du filtre','',id==='cta-a'?'S':'N.S',id==='cta-a'?'Filtre propre.':'Filtre à remplacer.');
    push('cta',name,id,'Air neuf',id+'-mesure','mesure_cta','p-remar-cta-mesures','mesure_cta',
      'Valeur',id==='cta-a'?'12,5':'18,2','','','Visite courante','°C');
  }
  for(const [id,name,avis] of [['vmc-a','VMC toiture','S'],['vmc-b','VMC sous-sol','N.S']]){
    push('vmc','','',name,id,'equipement','p-remar-vmc','Équipement','Identité patrimoine',name);
    push('vmc','','',name,id,'equipement','p-remar-vmc','Caisson','Etat du caisson','',avis,
      avis==='S'?'Caisson en bon état.':'Corrosion sur le caisson.');
  }
  for(const [id,name,prod] of [['froid-a','Groupe froid A','Groupe eau glacée'],['froid-b','Groupe froid B','Groupe à condensation']]){
    push('froid','','',name,id,'equipement','p-remar-froid','Équipement','Identité patrimoine',name);
    push('froid','','',name,id,'equipement','p-remar-froid','Informations du site','Production froid',prod);
  }
  projection={hasDynamic:true,familyCounts:{cta:2,vmc:2,froid:2},temperaturesCount:0,
    replacements:new Map(),ambiguous:['CTA : reference Excel absente'],
    unsupported:['CTA : 2 équipements indépendants, une seule série de cases'],
    details:detail};
  const multilines=await build();
  check(multilines.issues.length===0,
    'multi-equipment official fields are safely grouped: '+multilines.issues.join(' | '));
  const multiYear=outputFor(multilines,year).commentaire;
  check(multiYear==='CTA bureaux : 2019\nCTA gymnase : 2025',
    'both CTA years stored in one Symfony criterion without reference loss');
  const multiLight=outputFor(multilines,find('p-remar-cta','Eclairage du caisson'));
  check(multiLight.avis==='N.S'&&multiLight.commentaire.includes('CTA bureaux : [S]')&&
      multiLight.commentaire.includes('CTA gymnase : [N.S] Éclairage du caisson défectueux.'),
    'mixed opinions retain each CTA S/N.S in lines, conservative global N.S');
  check(outputFor(multilines,find('p-remar-filtres','Type de filtre','Filtre n°1')).commentaire===
    'CTA bureaux / Filtre soufflage : G4\nCTA gymnase / Filtre soufflage : F7',
    'two CTA filters retain their own classes in one criterion');
  const filterOpinion=outputFor(multilines,find('p-remar-filtres','Etat du filtre','Filtre n°1'));
  check(filterOpinion.avis==='N.S'&&filterOpinion.commentaire.includes('CTA gymnase / Filtre soufflage : [N.S]'),
    'filter status remains individually traceable');
  check(outputFor(multilines,find('p-remar-cta-mesures','Air neuf')).commentaire===
    'CTA bureaux / Air neuf : 12,5 °C\nCTA gymnase / Air neuf : 18,2 °C',
    'measures keep original units and CTA ownership');
  check(outputFor(multilines,find('p-remar-vmc','Nombre de caissons')).commentaire.includes('VMC sous-sol'),
    'VMC equipment identities are retained even with one number criterion');
  const vmcOpinion=outputFor(multilines,find('p-remar-vmc','Etat du caisson'));
  check(vmcOpinion.avis==='N.S'&&vmcOpinion.commentaire.includes('VMC toiture : [S]')&&
      vmcOpinion.commentaire.includes('VMC sous-sol : [N.S]'),
    'independent VMC opinions survive in one Symfony criterion');
  check(outputFor(multilines,find('p-remar-froid','Production froid')).commentaire===
    'Groupe froid A : Groupe eau glacée\nGroupe froid B : Groupe à condensation',
    'both cold production data survive in one criterion');
  const incomplete=detail.filter(row=>!(row[4]==='cta-b'&&row[8]==='Eclairage du caisson'));
  projection={...projection,details:incomplete};
  const missingCTA=await build();
  check(missingCTA.issues.some(x=>x.includes('CTA gymnase / Eclairage du caisson')),
    'missing second CTA control is detected instead of inferred from first CTA');
  projection={...projection,details:detail};
  const oversized=detail.map(r=>r[4]==='cta-b'&&r[8]==='Année CTA'?
    [...r.slice(0,9),'X'.repeat(1600),...r.slice(10)]:r);
  projection={...projection,details:oversized};
  const lengthGuard=await build();
  check(lengthGuard.issues.some(x=>x.includes('maximum 1500')),
    'grouped fields longer than Symfony 1500-character limit are blocked, not truncated');

  console.log('PASS '+checks+' REMAR field->SQL->Symfony synthetic structure checks; real Symfony GET/POST/GET still required.');
})().catch(e=>{console.error(e);process.exitCode=1;});
