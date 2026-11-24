import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteCreationTemplate,localCreationTemplate,assertVisitParent,assertRemoteLocalParent} from '../siteHierarchyDb.js';
test('only metadata, never identities or acknowledgements, is retained',()=>{
 const site=siteCreationTemplate({id:45,creationId:'old',lotId:2,energie:'GAZ',typeBatiment:'Habitation',sitePrincipal:'Oui'});
 assert.deepEqual(site,{lotId:2,adresse:null,codePostal:null,ville:null,energie:'GAZ',typeBatiment:'Habitation',sitePrincipal:'Non'});
 assert.deepEqual(localCreationTemplate({id:991,siteId:45,type:'Technique',situation:'RDC',trameId:3,creationId:'old'}),{type:'Technique',situation:'RDC',trameId:3,periodiciteVisite:null});
});
test('same names never authorize a cross-site remote link',async()=>{
 const db={getFirstAsync:async sql=>sql.includes('api_local_links')?{remote_site_id:'45',local_installation_id:'old-local'}:{id:'old-local',site_id:'old'},getAllAsync:async(sql,args)=>args[0]==='old'?[{remote_site_id:'45'}]:[]};
 await assertRemoteLocalParent(db,'old','991',{site:{id:'45'}});
 await assert.rejects(assertRemoteLocalParent(db,'copy','991',{site:{id:'45'}}),/autre site/);
 await assert.rejects(assertVisitParent(db,'copy','old-local'),/ne fait pas partie/);
});
test('scoped synchronization does not post siblings or another site',async()=>{
 const source=readFileSync('IntranetVisitSync.js','utf8');
 const segment=source.slice(source.indexOf('async function syncHierarchy('),source.indexOf('export function hierarchySyncMessage'));
 let sent=null,ensured=null;const photos=[];
 const rows=[
 {id:'v1',site_id:'copy',installation_id:'l1'},
 {id:'v2',site_id:'copy',installation_id:'l2'},
 {id:'v3',site_id:'old',installation_id:'old-l'},
 {id:'v4',site_id:'copy',installation_id:'l3'}];
 const sync=new Function('getDb','ensureHierarchyStructure','listerVisitesAEnvoyerClient','envoyerVisitesClient','isSyncedVisitChangedLocally','queueMissingSyncedVisitPhotos','processVisitPhotoOutbox','nomVisite',segment+'\nreturn syncHierarchy;')(
 async()=>({getFirstAsync:async()=>({site_id:'copy',installation_id:'l1'})}),
 async scope=>{ensured=scope;return {siteReady:true,clientId:'c',ready:scope.installationId?[scope.installationId]:['l1','l2'],pending:['l3'],blocked:[],localCount:3}},
 async()=>({aEnvoyer:rows,enCours:[{...rows[0],id:'draft'}],dejaEnvoyees:[{...rows[0],id:'synced'}]}),
 async(c,o)=>{sent=o.visiteIds;return {envoyees:sent,enAttente:[],aConfirmer:[],enErreur:[],total:sent.length}},
 async()=>false,async id=>{photos.push(id)},async()=>{},v=>v.id);
 await sync({siteId:'copy'});assert.deepEqual(sent,['v1','v2']);
 await sync({siteId:'copy',installationId:'l1'});assert.deepEqual(sent,['v1']);
 await sync({visiteId:'v1'});assert.deepEqual(sent,['v1']);assert.deepEqual(ensured,{siteId:'copy',installationId:'l1'});
 await assert.rejects(sync({siteId:'old',visiteId:'v1'}),/incohérent/);
 assert.ok(photos.includes('synced'));
});
