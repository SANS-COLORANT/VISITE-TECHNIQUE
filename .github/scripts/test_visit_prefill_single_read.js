/** Stable-fields prefill reads previous visit once, independent of field count. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const code=fs.readFileSync(path.join(root,'visitPrefillDb.js'),'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
class BoundedLruMap {constructor(){}}
const {copierChampsPersistantsMemeTrame}=new Function('BoundedLruMap',
  code+'\nreturn {copierChampsPersistantsMemeTrame};')(BoundedLruMap);
const trame={ui:{panels:{'p-test':{'Section X':[
 ...Array.from({length:150},(_,i)=>({type:'champ',cle:'P'+i,stable:true})),
 ...Array.from({length:80},(_,i)=>({type:'champ',cle:'T'+i,stable:false})),
]}}}};
const history=[
 ...Array.from({length:150},(_,i)=>({section_code:'test.section_x',cle:'P'+i,valeur:'stable-'+i})),
 ...Array.from({length:80},(_,i)=>({section_code:'test.section_x',cle:'T'+i,valeur:'transient-'+i})),
];
const state={reads:0,writes:[]};
const db={
 getAllAsync:async(sql,params)=>{
   assert.match(sql,/FROM champs_visite/);
   assert.deepEqual(params,['historical']);
   state.reads++;
   return history;
 },
 getFirstAsync:async()=>{throw Error('Unexpected per-field select');},
 runAsync:async(sql,args)=>{state.writes.push(args);return {changes:1};}
};
(async()=>{
 await copierChampsPersistantsMemeTrame(db,'new','historical',trame);
 assert.equal(state.reads,1,'230 fields use one SQL SELECT');
 assert.equal(state.writes.length,150,'all durable fields, no transient values');
 assert.ok(state.writes.every(r=>r[1]==='test.section_x'&&r[2].startsWith('P')));
 assert.equal(state.writes[0][3],'stable-0');
 assert.equal(state.writes[149][3],'stable-149');
 console.log('PASS persistent prefill: 230 previous values loaded in 1 query; 150 durable fields retained, 80 transient excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
