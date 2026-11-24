import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir,rename,cp,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRestoreJournal,RESTORE_MARKER} from '../restoreRecoveryCore.js';
import {validerEntreesZip} from '../backupPolicy.js';
const ID='2026-11-24T09-00-00-000Z', DB='visite_technique.db';
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'metra-journal-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const root=dir+'/';let fault=null;
  const fs={
    async getInfoAsync(p,opts){try{const s=await stat(p);return {exists:true,isDirectory:s.isDirectory(),size:s.size,md5:opts?.md5&&!s.isDirectory()?createHash('md5').update(await readFile(p)).digest('hex'):undefined};}catch(e){if(e.code==='ENOENT')return{exists:false};throw e;}},
    readDirectoryAsync:readdir,readAsStringAsync:p=>readFile(p,'utf8'),writeAsStringAsync:writeFile,
    moveAsync:({from,to})=>rename(from,to),makeDirectoryAsync:(p)=>mkdir(p,{recursive:true}),
    async deleteAsync(p){await rm(p,{force:true,recursive:true});},
    async copyAsync({from,to}){if(fault===to)throw Error('simulated interruption');await cp(from,to,{recursive:true});}
  };
  const j=createRestoreJournal(fs,root,DB),safety=j.snapshotPath(ID);
  async function put(p,data){await mkdir(p.slice(0,p.lastIndexOf('/')),{recursive:true});await writeFile(p,data);}
  const good=Buffer.alloc(4096,65),bad=Buffer.alloc(4096,66);
  await put(safety+'database/'+DB,good);
  await put(safety+'visite-technique/photos/1.jpg','ORIGINAL-PHOTO');
  await put(safety+'metra-missions/doc.txt','ORIGINAL-DOC');
  await put(root+'SQLite/'+DB,bad);
  await put(root+'visite-technique/photos/1.jpg','NEW-PHOTO');
  await put(root+'metra-missions/doc.txt','NEW-DOC');
  return{root,safety,j,good,bad,put,setFault:v=>fault=v};
}
test('no marker means never replace existing data',async t=>{
 const f=await fixture(t);assert.equal(await f.j.recover(),false);
 assert.deepEqual(await readFile(f.root+'SQLite/'+DB),f.bad);
});
test('restart after partial replacement restores DB and both media roots byte for byte',async t=>{
 const f=await fixture(t);await f.j.arm(ID);assert.equal(await f.j.hasPending(),true);
 await f.put(f.root+'SQLite/'+DB+'-wal','stale');
 assert.equal(await f.j.recover(),true);
 assert.deepEqual(await readFile(f.root+'SQLite/'+DB),f.good);
 assert.equal(await readFile(f.root+'visite-technique/photos/1.jpg','utf8'),'ORIGINAL-PHOTO');
 assert.equal(await readFile(f.root+'metra-missions/doc.txt','utf8'),'ORIGINAL-DOC');
 assert.equal(await f.j.hasPending(),false);
 assert.equal(await f.j.recover(),false);
 await assert.rejects(readFile(f.root+'SQLite/'+DB+'-wal'));
});
test('copy failure preserves journal and original snapshot; retry recovers',async t=>{
 const f=await fixture(t);await f.j.arm(ID);f.setFault(f.root+'metra-missions/');
 await assert.rejects(f.j.recover(),/simulated interruption/);
 assert.equal(await f.j.hasPending(),true);
 assert.deepEqual(await readFile(f.safety+'database/'+DB),f.good);
 f.setFault(null);await f.j.recover();
 assert.equal(await readFile(f.root+'metra-missions/doc.txt','utf8'),'ORIGINAL-DOC');
});
test('tampered safety snapshot blocks all destructive work',async t=>{
 const f=await fixture(t);await f.j.arm(ID);await f.put(f.safety+'visite-technique/photos/1.jpg','TAMPERED');
 await assert.rejects(f.j.recover(),/incomplète/);
 assert.deepEqual(await readFile(f.root+'SQLite/'+DB),f.bad);
 assert.equal(await readFile(f.root+'visite-technique/photos/1.jpg','utf8'),'NEW-PHOTO');
 assert.equal(await f.j.hasPending(),true);
});
test('successful commit removes marker without replacing verified new data',async t=>{
 const f=await fixture(t);await f.j.arm(ID);await f.j.complete(ID);
 assert.equal(await f.j.hasPending(),false);assert.equal(await f.j.recover(),false);
 assert.deepEqual(await readFile(f.root+'SQLite/'+DB),f.bad);
});
test('duplicate entries and file-directory conflicts rejected',()=>{
 assert.throws(()=>validerEntreesZip([{path:'photos/a.jpg',size:5},{path:'photos/a.jpg',size:5}]),/dupliquée/);
 assert.throws(()=>validerEntreesZip([{path:'photos',size:2},{path:'photos/a.jpg',size:5}]),/Conflit/);
 assert.equal(validerEntreesZip([{path:'photos/',size:0,isDirectory:true},{path:'photos/a.jpg',size:5}]),5);
});
