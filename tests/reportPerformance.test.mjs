import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {planifierLotsPdf,pagesPhotosRapport,choisirBudgetPdf,composerHtmlLot,decouperRapportPdf} from '../reportPdfFragments.js';
import {createReportPhotoCache} from '../reportPhotoCacheCore.js';
const datas=Array.from({length:45},(_,i)=>({visite:{id:'V'+i},sections:[{groups:[{rows:[{label:'CONTROL'+i}]}]}],note:'NOTE'+i,remarques:[{id:'R'+i}],materiel:[{id:'M'+i}]}));
const photos=datas.flatMap(d=>Array.from({length:10},(_,j)=>({id:d.visite.id+'P'+j,visiteId:d.visite.id,ordre:j,include:true,exportAllowed:true,size:'medium'})));
test('45 visits / 450 photographs: preserve identity, order, sections, notes, reserves, equipment; fewer print jobs',()=>{
 const start=performance.now();
 const baseline=decouperRapportPdf(datas,photos);
 const results=[8,16,24].map(budget=>{
   const lots=planifierLotsPdf(datas,photos,true,budget),pieces=lots.flat();
   assert.deepEqual(pieces.flatMap(p=>p.photosConfig.map(x=>x.id)),photos.map(x=>x.id));
   for(const d of datas){
     const fr=pieces.filter(p=>p.data.visite.id===d.visite.id);
     assert.equal(fr.filter(x=>x.premierLocal).length,1);
     assert.equal(fr.filter(x=>x.dernierLocal).length,1);
     assert.equal(fr.filter(x=>x.data.note===d.note).length,1);
     assert.equal(fr.flatMap(x=>x.data.sections).length,1);
     assert.equal(fr.flatMap(x=>x.data.remarques).length,1);
     assert.equal(fr.flatMap(x=>x.data.materiel).length,1);
     assert.deepEqual(fr.flatMap(x=>pagesPhotosRapport(x.photosConfig).map(page=>page.map(p=>p.id))),pagesPhotosRapport(photos.filter(p=>p.visiteId===d.visite.id)).map(page=>page.map(p=>p.id)));
   }
   assert.ok(lots.every(l=>l.reduce((n,p)=>n+p.poids,0)<=budget));
   return {budget,plannedPrintJobs:lots.length};
 });
 assert.equal(baseline.length,90);
 assert.ok(results[1].plannedPrintJobs<=45);
 assert.ok(results[2].plannedPrintJobs<=23);
 console.log('PDF PLANNER BENCHMARK '+JSON.stringify({visits:45,photos:450,baselinePrintJobs:baseline.length,results,plannerMs:performance.now()-start,nativeRenderingMeasured:false}));
});
test('mixed-size, excluded and zero-photo reports keep complete pages and all selected visits',()=>{
 const mixed=photos.map((p,i)=>({...p,size:['small','medium','large','full'][i%4],exportAllowed:i%13!==0}));
 const lots=planifierLotsPdf(datas,mixed,true,8);
 assert.deepEqual(lots.flat().flatMap(p=>p.photosConfig.map(x=>x.id)),mixed.filter(x=>x.exportAllowed).map(x=>x.id));
 assert.ok(lots.every(l=>l.reduce((n,p)=>n+p.poids,0)<=8));
 const no=planifierLotsPdf(datas,mixed,false,24).flat();
 assert.equal(no.length,45);assert.ok(no.every(x=>!x.photosConfig.length));
 assert.equal(choisirBudgetPdf({}),8);
 assert.equal(choisirBudgetPdf({memoryClassMb:256,availableBytes:2**31}),24);
 assert.equal(choisirBudgetPdf({memoryClassMb:256,availableBytes:2**31,lowRam:true}),8);
});
test('lot composition includes cover once, retains article order and signatures',()=>{
 const h=(name,signature)=>'<html><head><style>ok</style></head><body><article class="siteReport"><div class="siteStart"><h1>'+name+'</h1></div><section class="photoPage pageBreakBefore">'+name+'-PHOTO</section></article>'+signature+'</body></html>';
 const a={html:h('LOCAL-A','SIGN-A'),fragment:{premierLocal:true,dernierLocal:true}};
 const b={html:h('LOCAL-B','SIGN-B'),fragment:{premierLocal:true,dernierLocal:true}};
 const html=composerHtmlLot([a,b],'COVER',true);
 assert.equal((html.match(/COVER/g)||[]).length,1);assert.ok(html.indexOf('SIGN-A')<html.indexOf('LOCAL-B'));
 assert.ok(html.includes('page-break-before:always'));assert.ok(html.includes('SIGN-B'));
 const continuation=composerHtmlLot([{html:h('LOCAL-A','SIGN-A'),fragment:{premierLocal:false,dernierLocal:false}}],'COVER',false);
 assert.ok(!continuation.includes('<h1>'));assert.ok(!continuation.includes('SIGN-A'));assert.ok(continuation.includes('LOCAL-A-PHOTO'));
});
test('450 unique JPEGs: cache warm export uses zero encodes, content change and missing source never served stale',async()=>{
 const store=new Map(),sha=v=>createHash('md5').update(v).digest('hex');
 let encodes=0,active=0,peak=0;
 for(let i=0;i<450;i++)store.set('original/'+i,Buffer.from('photo-'+i));
 const fs={
  async getInfoAsync(p,o){const v=store.get(p);return v?{exists:true,isDirectory:false,size:v.length,md5:o.md5?sha(v):undefined,modificationTime:Date.now()/1000}:{exists:false};},
  async makeDirectoryAsync(){},
  async deleteAsync(p){store.delete(p);},
  async moveAsync({from,to}){assert.ok(store.has(from));store.set(to,store.get(from));store.delete(from);},
  async readDirectoryAsync(root){return [...store.keys()].filter(p=>p.startsWith(root)).map(p=>p.slice(root.length));}
 };
 const cache=createReportPhotoCache({fs,root:'cache/',read:async p=>store.get(p)?.toString('base64'),encode:async(uri,cfg)=>{
   active++;peak=Math.max(peak,active);
   await Promise.resolve();
   const name='temp/'+(++encodes);store.set(name,Buffer.concat([Buffer.from([255,216,255]),store.get(uri),Buffer.from(String(cfg.width)),Buffer.from([255,217])]));active--;return name;
 }});
 const input=Array.from({length:450},(_,i)=>'original/'+i);
 const coldStart=performance.now();
 const cold=await Promise.all(input.map(uri=>cache.get(uri)));
 const coldMs=performance.now()-coldStart;
 const warmStart=performance.now();
 const warm=await Promise.all(input.map(uri=>cache.get(uri)));
 const warmMs=performance.now()-warmStart;
 assert.equal(encodes,450);assert.equal(peak,2);assert.deepEqual(warm,cold);
 assert.equal(cache.stats().hits,450);
 store.set(input[0],Buffer.from('replacement'));
 assert.notEqual(await cache.get(input[0]),cold[0]);
 store.delete(input[1]);await assert.rejects(cache.get(input[1]),/inaccessible/);
 assert.ok(store.get(input[2]).equals(Buffer.from('photo-2')));
 console.log('PDF CACHE BENCHMARK '+JSON.stringify({coldEncodes:450,warmEncodes:0,coldMs,warmMs,peak,simulation:true}));
});
test('binary copy creates only a new output, cancellation and safe fallback remain wired',()=>{
 const s=readFileSync('reportEditorExporter.js','utf8');
 assert.match(s,/await lirePdfBinaire\(printed.uri\)/);
 assert.match(s,/habillerPdfEdite\(null,config,siteFooter,clientCover,result.coverDataUri,result.pdf\)/);
 assert.match(s,/checkReportCancelled/);
 assert.match(s,/creerFichierSafDepuisFichier/);
 assert.match(s,/copyReportToDocument/);
});
