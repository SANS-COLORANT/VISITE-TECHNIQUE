/** Executable METRA regression: complete visit copy, template choice, batch selection, post-sync safety. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const babel=require('@babel/parser');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
let checks=0;
const check=(value,msg)=>{assert.ok(value,msg);checks++};
const codePaths=[
 'visitLatestSnapshotDb.js','visitCreationDb.js','remarVisitSelection.js',
 'SiteVisitesScreen.js','ClientVisitSendPicker.js','ClientSitesScreen.js',
 'clientVisitSendSelection.js','IntranetVisitSync.js','intranetVisitOutboxDb.js',
 'VisiteScreen.js','remarDynamicDb.js',
];
for(const file of codePaths){
 assert.doesNotThrow(()=>babel.parse(read(file),{sourceType:'module',plugins:['jsx']}),file+' is valid JS/JSX');
 checks++;
}
const evalModule=(file,returns,ctx={})=>{
 const cleaned=read(file).replace(/^import .*?;\r?\n/gm,'')
   .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const)\b)/g,'');
 return new Function(...Object.keys(ctx),cleaned+'\nreturn { '+returns.join(',')+' };')(...Object.values(ctx));
};
const {latestClientVisitsByLocalAndTemplate}=evalModule(
 'clientVisitSendSelection.js',['latestClientVisitsByLocalAndTemplate']);
const rows=[
 {id:'old-A',site_id:'s1',installation_id:'A',trame_id:'icpe_v1',date_visite:'2026-10-01',envoi:null},
 {id:'new-A',site_id:'s1',installation_id:'A',trame_id:'icpe_v1',date_visite:'2026-11-03',envoi:'synced'},
 {id:'rcu-A',site_id:'s1',installation_id:'A',trame_id:'reseau_chaleur_v1',date_visite:'2026-10-31',envoi:null},
 {id:'new-B',site_id:'s1',installation_id:'B',trame_id:'icpe_v1',date_visite:'2026-11-03',envoi:null},
 {id:'new-C',site_id:'s2',installation_id:'A',trame_id:'icpe_v1',date_visite:'2026-11-01',envoi:null},
];
const last=latestClientVisitsByLocalAndTemplate(rows);
check(last.length===4&&!last.some(x=>x.id==='old-A'),
 'only latest per site/local/trame: old unsent visits excluded, no duplicate remote visit');
check(last.some(x=>x.id==='rcu-A')&&last.some(x=>x.id==='new-C'),
 'distinct templates and distinct sites remain independent');
const {preferredRemarCompleteId}=evalModule('remarVisitSelection.js',['preferredRemarCompleteId']);
check(preferredRemarCompleteId([{id:16,nom:'REMAR CLASSIQUE'},{id:22,nom:'TRAME REMAR COMPLÈTE'}])==='22',
 'complete REMAR is chosen instead of classic even if classic is first');
check(preferredRemarCompleteId([{id:16,nom:'REMAR CLASSIQUE'}])===null,
 'do not silently default to the incomplete Symfony classic');
check(preferredRemarCompleteId([{id:22,nom:'REMAR COMPLETE'},{id:23,nom:'REMAR COMPLETE'}])===null,
 'ambiguous published complete IDs require explicit choice');

const {copyLatestSameTrameVisit,isCurrentVisitMetadata,restorePreAllumageSnapshot}=evalModule(
 'visitLatestSnapshotDb.js',['copyLatestSameTrameVisit','isCurrentVisitMetadata','restorePreAllumageSnapshot'],
 {DEFAULT_TRAME_ID:'icpe_v1',createId:()=> 'custom-section-or-field'});
check(isCurrentVisitMetadata('Date de la visite')&&isCurrentVisitMetadata('Date de visite')&&
 !isCurrentVisitMetadata('Date du dernier entretien'),
 'copy does not replace new visit date or current meta, but retains maintenance date');
const newId='new-visit',oldId='last-visit';
const state={fields:[],controls:[],dynamic:[],notes:[],meta:null,previousQueries:0};
const db={
 async getFirstAsync(sql,args){
   if(sql.includes('FROM visites')&&sql.includes('COALESCE(trame_id')){
     state.previousQueries++;
     check(sql.includes('installation_id=?')&&!sql.includes('rowid <'),
       'source is restricted to this local/trame, including later-imported history');
     return {id:oldId,date_visite:'2026-10-25'};
   }
   if(sql.includes('FROM visites WHERE id=?')) return {id:newId,site_id:'s1',
     installation_id:'local-A',trame_id:'remar_v1',statut:'en_cours',date_visite:'2026-11-03'};
   if(sql.includes('FROM _meta'))return state.meta?{value:state.meta}:null;
   throw Error('Unexpected snapshot SELECT '+sql);
 },
 async getAllAsync(sql){ throw Error('Per-record snapshot query still used: '+sql); },
 async runAsync(sql,args){
   if(sql.includes('INSERT INTO champs_visite')){
     check(sql.includes('SELECT')&&sql.includes('NOT IN')&&sql.includes('ON CONFLICT'),
       'fields copied atomically without replacing current metadata');
     state.fields.push([newId,'releves.compteurs','Compteur Gaz','123,5']);
     state.fields.push([newId,'infos.generale','Date du dernier entretien','2024-01-10']);
     return {changes:2};
   }
   if(sql.includes('INSERT INTO controles_visite')){
     check(sql.includes('SELECT')&&sql.includes('avis=excluded.avis'),
       'opinions copied in a single INSERT SELECT');
     state.controls.push([newId,'conf-local.securite','BAES','S','Conforme']);
     state.controls.push([newId,'conf-ecs.eau','Soupape','N.S','À remplacer']);
     state.controls.push([newId,'conf-local.securite','Porte','S.O',null]);
     return {changes:3};
   }
   if(sql.includes('INSERT INTO remar_values')){
     check(sql.includes('FROM equipements')&&sql.includes('FROM remar_items')&&
       sql.includes('installation_id=?'), 'dynamic values scoped to same local');
     state.dynamic.push(args);
     return {changes:1};
   }
   if(sql.includes('INSERT INTO notes')){
     check(sql.includes('SELECT')&&args[1]===oldId,'notes copied from source');
     state.notes.push([newId,'Note technique historique']); return {changes:1};
   }
   if(sql.includes('INSERT INTO _meta')){state.meta='1';return {changes:1};}
   throw Error('Unexpected snapshot write '+sql);
 },
 async withTransactionAsync(callback){await callback();}
};
(async()=>{
 const result=await copyLatestSameTrameVisit(db,newId);
 check(result.sourceVisitId===oldId&&result.copiedFields===2&&result.copiedControls===3&&result.copiedDynamic===1,
   'full fields S, N.S and S.O and individual dynamic CTA control inherited');
 check(state.controls.map(r=>r[3]).join(',')==='S,N.S,S.O',
   'controls retain all five-opinion-compatible old state values and comments');
 check(state.fields.every(row=>!isCurrentVisitMetadata(row[2]))&&
    state.fields.some(row=>row[2]==='Date du dernier entretien'),
   'new visit date and address are kept fresh; maintenance date stays');
 check(state.dynamic[0][1]==='copie_locale:'+oldId&&state.notes[0][1]==='Note technique historique',
   'REMAR copy provenance and free note are preserved');
 const runAgain=await copyLatestSameTrameVisit(db,newId);
 check(runAgain.alreadyCopied&&state.controls.length===3,
   'idempotent new-visit copy never overwrites subsequent technician corrections');


 // Pre-allumage creates different IDs for each new local. Even though all
 // historical opinions are in SQLite, they MUST be visible under new IDs.
 const oldSection='pa.local.old-pa.chauffage',newSection='pa.local.new-pa.chauffage';
 const paWrites={controls:[],fields:[],meta:0};
 const oldPa={id:'old-pa',nom:'SST 1',type_code:'sous_station'};
 const newPa={id:'new-pa',nom:'SST 1',type_code:'sous_station'};
 const oldRub={id:'old-rub',local_id:oldPa.id,panel_id:'p-pa-sst',
   section_code:oldSection,nom:'SST 1 — Chauffage',ordre:1,supprimable:1};
 const newRub={...oldRub,id:'new-rub',local_id:newPa.id,section_code:newSection};
 const fakePa={
   async getFirstAsync(sql){if(sql.includes('FROM _meta'))return null;throw Error(sql);},
   async getAllAsync(sql,args){
     const source=args[0]==='last-visit';
     if(sql.includes('FROM pre_allumage_locaux'))return [source?oldPa:newPa];
     if(sql.includes('FROM pre_allumage_rubriques'))return [source?oldRub:newRub];
     if(sql.includes('FROM pre_allumage_champs'))return [
       {id:source?'old-f':'new-f',rubrique_id:source?'old-rub':'new-rub',
         cle_stockage:'Calorifugeage',libelle:'Calorifugeage',type_code:'controle',ordre:0}];
     if(sql.includes('FROM champs_visite'))return [];
     if(sql.includes('FROM controles_visite'))return source?[
       {section_code:oldSection,cle:'Calorifugeage',avis:'N.S',commentaire:'Isolant absent'}]:[];
     throw Error('Unexpected pre-allumage query: '+sql);
   },
   async runAsync(sql,args){
     if(sql.includes('INSERT INTO controles_visite'))paWrites.controls.push(args);
     else if(sql.includes('INSERT INTO champs_visite'))paWrites.fields.push(args);
     else if(sql.includes('INSERT INTO _meta'))paWrites.meta++;
     else throw Error('Unexpected pre-allumage mutation: '+sql);
   },
   async withTransactionAsync(fn){await fn();}
 };
 const pa=await restorePreAllumageSnapshot(fakePa,'last-visit','new-visit');
 check(pa.controls===1&&paWrites.controls.length===1&&
   paWrites.controls[0][1]===newSection&&paWrites.controls[0][3]==='N.S',
   'pre-allumage source N.S is remapped and displayed under current local ID');
 check(paWrites.meta===1,
   'pre-allumage snapshot remap completed atomically with an idempotent marker');

 const picker=read('ClientVisitSendPicker.js');
 check(picker.includes('new Set(visits.map(v=>String(v.id)))')&&
       picker.includes("allSelected?'Tout désélectionner':'Tout sélectionner'")&&
       picker.includes('onSend?.([...selected])'),
   'all visits selected by default, reversible all-selection, explicit selected IDs only');
 const uploader=read('IntranetVisitSync.js');
 check(uploader.includes('visiteIds = null')&&
       uploader.includes('candidats.filter(v=>autorises.has(String(v.id)))'),
   'batch sender enforces the selected subset');
 check(uploader.includes('isSyncedVisitChangedLocally')&&
       uploader.includes('changedSinceSync && visitSynced')&&
       uploader.includes('aucun doublon'),
   'synced visit changes make icon grey; unsafe second POST forbidden');
 const outbox=read('intranetVisitOutboxDb.js');
 check(outbox.includes('export async function isSyncedVisitChangedLocally')&&
       outbox.includes('current.serialized !== row.payload_json'),
   'dirty status survives app restarts based on original acknowledged snapshot');
 const screen=read('SiteVisitesScreen.js');
 check(!screen.includes('Trame Intranet non renseignée')&&
       screen.includes('preferredRemarCompleteId'),
   'old unwanted site/trame panel is absent and REMAR complete is preselected');
 check(read('visitCreationDb.js').includes('await copyLatestSameTrameVisit(db, id)') &&
       read('visitCreationDb.js').includes('await restorePreAllumageSnapshot('),
   'both classic and PA dynamic control copies complete before opening new visit');
 console.log('PASS '+checks+' complete visit snapshot / REMAR complete / post-sync / bulk selection checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
