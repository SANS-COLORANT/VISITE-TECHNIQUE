const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.resolve(__dirname,'../../intranetV1Freshness.js'),'utf8').replace(/export\s+(?=function\s)/g,'');
const {inspectV1PreparationFreshness}=new Function(code+'\nreturn {inspectV1PreparationFreshness}')();
const m=(id,name)=>({id,categorie:'Chauffage',nombre:'1',designation:name,etat:'Bon'});
const trame={id:85,nom:'RCU',categories:[{id:10,nom:'PRIMAIRE',
 sousCategories:[{id:20,nom:'Opération',criteres:[{id:30,nom:'P2',avisApplicable:true}]}]}]};
const frozen={local:{id:501},site:{id:45},trame,derniereVisite:{id:812},
 materiels:[m('m1','Pompe'),m('m2','Vanne')]};
const wire={localId:501,trameId:85,derniereVisiteIdSource:812};
const check=(condition,label)=>assert.ok(condition,label);
const assess=(ref,records,out=wire)=>inspectV1PreparationFreshness(ref,{visites:records},out).compatible;
check(assess(frozen,[frozen]),'fresh GET matches');
check(assess(frozen,[{...frozen,materiels:frozen.materiels.slice().reverse()}]),'order irrelevant');
check(!assess(frozen,[{...frozen,materiels:[m('m1','Pompe'),m('m3','Vanne')]}]),'same count, different material ID blocked');
check(!assess(frozen,[{...frozen,materiels:[m('m1','Pompe'),m('m2','Soupape')]}]),'same count, changed attributes blocked');
check(!assess(frozen,[{...frozen,materiels:frozen.materiels.concat(m('m3','Sonde'))}]),'remote addition blocked');
check(!assess(frozen,[{...frozen,derniereVisite:{id:813}}]),'concurrent visit blocked');
check(!assess(frozen,[{...frozen,site:{id:46}}]),'site drift blocked');
const renamed={...trame,categories:[{...trame.categories[0],nom:'RENOMMÉ'}]};
check(!assess(frozen,[{...frozen,trame:renamed}]),'criterion name changed blocked');
check(!assess(frozen,[]),'missing remote local blocked');
check(!assess(frozen,[frozen,frozen]),'ambiguous remote local blocked');
check(!assess(frozen,[frozen],{...wire,localId:502}),'wrong destination blocked');
check(assess({...frozen,derniereVisite:null},[{...frozen,derniereVisite:null}],
 {...wire,derniereVisiteIdSource:null}),'first visit no history supported');
console.log('12/12 V1 freshness safety checks passed without network access.');
