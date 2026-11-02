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
  formaterReleves:rows=>rows.map(x=>x.label+': '+x.valeur+' '+(x.unite||'')).join('\n'),
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
  return {id:cId,nom:definition.ui.labels?.[panelId]||panelId,
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
    {trame:remote},issues);
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
  check(six.issues.some(x=>x.includes('seulement cinq cases')),
    'sixth network prevents lossy V1 POST');

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
  console.log('PASS '+checks+' REMAR field->SQL->Symfony synthetic structure checks; real Symfony GET/POST/GET still required.');
})().catch(e=>{console.error(e);process.exitCode=1;});
