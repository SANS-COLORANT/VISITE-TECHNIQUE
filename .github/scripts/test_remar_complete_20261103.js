const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const definition=JSON.parse(read('remarTrame.js').match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
const contract=new Function(read('remarSymfonyCompleteContract.js').replace(/export /g,'')+
  '\nreturn {remarCompleteMappings,remarMappingsForRemote,isRemarCompleteTrame}')();
const importer=new Function('obtenirTrame','remarMappingsForRemote','inspectIntranetCriterionCandidate','createId',
  read('remarSymfonyMultilineImport.js').replace(/^import\s+.*?from .*?;\s*$/gm,'')
    .replace(/export /g,'')+
  '\nreturn {parseRemarNamedCell,decodeRemarSymfonyDetail}')(
    ()=>definition,contract.remarMappingsForRemote,
    (id,criterion,cat,sub,remote)=>{
      const matches=contract.remarMappingsForRemote(definition,remote)
        .filter(m=>(m.cle===criterion.nom||m.remoteCle===criterion.nom)&&m.section===sub);
      return {resolved:matches.length===1?matches[0]:null};
    },()=> 'test-id');
const full={nom:'REMAR COMPLÈTE'};
const mappings=contract.remarCompleteMappings(definition);
let count=0;const check=(v,message)=>{assert.ok(v,message);count++};
check(contract.isRemarCompleteTrame(full),'REMAR COMPLÈTE recognized');
check(mappings.length===147,'147 published fields');
check(new Set(mappings.map(m=>m.valueCell)).size===147,'distinct worksheet cells');
check(new Set(mappings.map(m=>[m.panelId,m.section,m.cle].join('|'))).size===147,'distinct identities');
check(contract.remarMappingsForRemote(definition,{nom:'REMAR CLASSIQUE'}).length===141,'historical version unchanged');
const at=(panel,section,cle)=>mappings.find(m=>m.panelId===panel&&m.section===section&&m.cle===cle);
for(const [p,s,c,cell] of [
  ['p-remar-filtres','Filtre n°1','Etat du filtre','B158'],
  ['p-remar-filtres','Filtre n°1','Pertes de charge (Pa)','C156'],
  ['p-remar-filtres','Filtre n°3',"Seuil d'alarme (Pa)",'C173'],
  ['p-remar-cta-mesures','Températures','Après récupération','C185'],
  ['p-remar-vmc','Situation','Situation du caisson','B217'],
  ['p-remar-froid','Informations du site','Production froid','C254'],
  ['p-remar-froid','Réseaux','Réseau 5','C269']
])check(at(p,s,c)?.valueCell===cell,'cell '+p+' / '+s+' / '+c);
check(at('p-remar-cta-mesures','Températures','Après récupération').remoteCle==='Récupération',
  'published rename preserves local field key');
check(mappings.every(m=>m.panelId!=='p-remar-cta-energie'),'legacy CTA checks not mapped into another category');
const lines=importer.parseRemarNamedCell('CTA 1 : 2019\r\nCTA 2 : 2022',{family:'cta'});
check(lines.length===2&&lines[1].parent==='CTA 2','two separate named CTA rows');
check(importer.parseRemarNamedCell('Observation : texte\nAutre : texte',
  {family:'cta'}).length===0,'free text not parsed as equipment');
check(importer.parseRemarNamedCell('Triple : Triple',
  {family:'cta',identity:true}).length===1,'named CTA identity accepts custom name');
assert.throws(()=>importer.parseRemarNamedCell('CTA 1 : valeur\nfree text',
  {family:'cta'}),/mêlent blocs/);count++;
const ref={trame:{nom:'REMAR COMPLÈTE',categories:[
  {nom:'CTA',sousCategories:[
    {nom:'Informations techniques',criteres:[
      {nom:'Désignation CTA',commentaire:'CTA 1 : CTA 1\nCTA 2 : CTA 2',visiteSourceId:'9'},
      {nom:'Année CTA',commentaire:'CTA 1 : 2019\nCTA 2 : 2022',visiteSourceId:'9'}]},
    {nom:'Avis sur l’entretien général',criteres:[
      {nom:'Calorifugeage',avis:'N.S',
        commentaire:'CTA 1 : [S] Conforme\nCTA 2 : [N.S] Isolant détérioré',visiteSourceId:'9'}]}
  ]},
  {nom:'Filtration CTA',sousCategories:[
    {nom:'Filtre n°1',criteres:[
      {nom:'Type de filtre',commentaire:'CTA 1 / Filtre G4 : G4',visiteSourceId:'9'},
      {nom:'Pertes de charge (Pa)',commentaire:'CTA 1 / Filtre G4 : 130 Pa',visiteSourceId:'9'}]}
  ]}
]},derniereVisite:{id:'9'}};
const rows=importer.decodeRemarSymfonyDetail(ref,{historical:true});
check(rows.filter(r=>r.type==='equipement'&&r.cle==='Identité patrimoine').length===2,
  'two CTA equipment identities');
check(rows.some(r=>r.nom==='CTA 2'&&r.cle==='Année CTA'&&r.valeur==='2022'),
  'CTA 2 year');
check(rows.some(r=>r.nom==='CTA 1'&&r.cle==='Calorifugeage'&&r.avis==='S'),
  'CTA 1 control');
check(rows.some(r=>r.nom==='CTA 2'&&r.cle==='Calorifugeage'&&r.avis==='N.S'),
  'CTA 2 nonconformity');
check(rows.some(r=>r.type==='filtre_cta'&&r.cle==='Pertes de charge (Pa)'&&r.valeur==='130'),
  'filtration pressure');
check(rows.filter(r=>r.cle!=='Identité patrimoine'&&r.cle!=='Type / presence')
  .every(r=>r.statut==='Historique à confirmer'),'no historical observation confirmed');
console.log('PASS '+count+' REMAR COMPLÈTE offline assertions.');
