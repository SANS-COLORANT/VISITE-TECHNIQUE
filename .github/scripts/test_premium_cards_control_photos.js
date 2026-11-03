/**
 * UX-only regression of directory cards and transversal photo action.
 * No server, camera, screenshot fixture, or destructive data mutation.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const babel=require('@babel/parser');
const root=path.resolve(__dirname,'../..');
const get=file=>fs.readFileSync(path.join(root,file),'utf8');
let count=0;
const check=(condition,message)=>{assert.ok(condition,message);count++};
const uiFiles=[
  'ClientSitesScreen.js','SiteLocalsScreen.js','SiteVisitesScreen.js',
  'ControlPhotoAction.js','PersistentControleGenerique.js',
  'PresetControleGenerique.js','VmcControleGenerique.js',
  'GenericFields.js','PreAllumageCompactControl.js',
  'PreAllumagePhotoButton.js','PhotoButton.js','remarkDb.js',
];
for(const file of uiFiles){
  assert.doesNotThrow(()=>babel.parse(get(file),{sourceType:'module',plugins:['jsx']}),
    file+' must remain syntactically valid JSX/JavaScript');count++;
}
const visits=get('SiteVisitesScreen.js');
check(!visits.includes('DepuisDerniereVisiteCard'),
  'local visit screen no longer mounts the large historical last-visit summary');
check(visits.includes('<SiteOverviewPanel') && visits.includes('IntranetVisitSyncControl'),
  'history removal does not remove reserves/equipment tabs or sync');
for(const file of ['ClientSitesScreen.js','SiteLocalsScreen.js','SiteVisitesScreen.js']){
  const s=get(file);
  check(s.includes("flexDirection: 'column'") &&
    s.includes("alignItems: 'stretch'") &&
    s.includes('minWidth: 0') &&
    s.includes('numberOfLines={2}'),
    file+' uses stable two-row cards and clamps identity text');
  check(s.includes("flexWrap: 'wrap'"),
    file+' actions wrap without squeezing titles');
}
const action=get('ControlPhotoAction.js');
check(action.includes("['S', 'N.S', 'S.O', 'N.R', 'N.V']"),
  'all five opinions offer optional photos; S / NS / SO always covered');
check(action.includes('controlPhoto') &&
      action.includes('entiteKey={entiteKey}')&&
      action.includes('PhotoComponent = PhotoButton'),
  'all controls use the existing photo capture, stable business key and optional cross-trame adapter');
for(const file of [
 'PersistentControleGenerique.js','PresetControleGenerique.js',
 'VmcControleGenerique.js','GenericFields.js',
 'PreAllumageCompactControl.js',
]){
 const s=get(file);
 check(s.includes('<ControlPhotoAction') &&
       s.includes('entiteKey={controleKey}') &&
       s.includes('avis={avis}'),
       file+' allows photo right next to the chosen state');
}
const persist=get('PersistentControleGenerique.js');
check(persist.match(/<ControlPhotoAction/g).length===2,
  'compact ICPE/RCU control and its open sheet both have immediate photo access');
const pre=get('PreAllumageCompactControl.js');
check(pre.includes('PhotoComponent={PreAllumagePhotoButton}')&&
  get('PreAllumagePhotoButton.js').includes('controlPhoto={controlPhoto}'),
  'pre-allumage keeps its photo thumbnail and stable key');
const btn=get('PhotoButton.js');
check(btn.includes('controlPhoto ? null') &&
  btn.includes('controlPhoto ? entiteKey') &&
  btn.includes('legacyReserveKeyRef.current'),
  'photo action never creates a reserve on S, but preserves legacy reserve photos in viewer');
check(btn.includes('compactPhone && hasPhotos ? (') && btn.includes('{photos.length}'),
  'photo count also shown when there is only one attached photo');
const remarks=get('remarkDb.js');
const marker=remarks.split('export async function supprimerRemarqueControle(')[1]
  ?.split('export async function ajouterRemarqueVisite(')[0];
check(!!marker&&marker.includes('UPDATE photos SET entite_key=?')&&
  !marker.includes('supprimerPhotosEntiteComplete('),
  'changing control opinion reattaches reserve photos rather than deleting them');
check(marker.includes('peekVisitPhotos(visiteId)'),
  'reparenting updates the photo cache only when already fully loaded');

// Exercise the actual reserve-removal implementation with an isolated
// in-memory DB. Both the photo DB row and camera file must survive.
const clean=remarks.replace(/^import\s+.+?;\s*$/gm,'').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const photos=[
 {id:'p-old',visite_id:'v1',entite_key:'remarque||r1',uri:'file://photo-original.jpg'},
 {id:'p-independent',visite_id:'v1',entite_key:'equipement||other',uri:'file://keep.jpg'}
];
const notes=[{id:'r1',visite_id:'v1',controle_key:'conf-local||BAES'}];
let deletedFiles=0,cacheUpdates=0;
const db={
 getAllAsync:async(sql,params)=>{
   if(sql.includes('FROM remarques'))return notes.filter(r=>r.visite_id===params[0]&&r.controle_key===params[1]);
   if(sql.includes('FROM photos'))return photos.filter(p=>p.visite_id===params[0]&&p.entite_key===params[1]).map(p=>({...p}));
   throw Error('Unexpected DB query: '+sql);
 },
 runAsync:async(sql,params)=>{
   if(sql.startsWith('UPDATE photos')){photos.forEach(p=>{if(p.visite_id===params[1]&&p.entite_key===params[2])p.entite_key=params[0];});return;}
   if(sql.startsWith('DELETE FROM remarques')){notes.splice(0,notes.length,...notes.filter(r=>!(r.visite_id===params[0]&&r.controle_key===params[1])));return;}
   throw Error('Unexpected SQL mutation: '+sql);
 }
};
const photoCache={peekVisitPhotos:()=>photos.map(p=>({...p})),
  upsertRuntimePhoto:(_visit,p)=>{cacheUpdates++;assert.equal(p.entite_key,'conf-local||BAES');}};
const api=new Function('openAppDatabase','createId','supprimerPhotosEntiteComplete','clampReserveSeverity','require',
 clean+'\nreturn {supprimerRemarqueControle}')(
   async()=>db,()=> 'some-id',async()=>{deletedFiles++;},x=>x,
   name=>{assert.equal(name,'./photoRuntimeCache.js');return photoCache;});
(async()=>{
 await api.supprimerRemarqueControle('v1','conf-local||BAES');
 check(!notes.length,'only control reserve removed after its opinion changes');
 check(photos[0].entite_key==='conf-local||BAES'&&
       photos[0].uri==='file://photo-original.jpg'&&deletedFiles===0,
       'photo reattached without deleting original file or reencoding');
 check(photos[1].entite_key==='equipement||other'&&cacheUpdates===1,
       'unrelated photograph kept and in-memory photo index refreshed');
 console.log('PASS '+count+' premium cards + all-trame control photos + reserve retention checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
