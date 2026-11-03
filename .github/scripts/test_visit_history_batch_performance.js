/** 250 historical visits: semantic values and reserve lineage with bounded SQLite queries. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'visitCarryForwardDb.js'),'utf8')
 .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
 .replace(/export\s+(?=(?:async\s+)?(?:function|const)\s)/g,'');
let nextId=0;
const index={
 byStorage:new Map([
  ['data||Notice',{semanticKey:'notice'}],
  ['checks||BAES',{semanticKey:'baes'}],
 ])
};
const mod=new Function('createId','DEFAULT_TRAME_ID','obtenirTrame','construireIndexSemantiqueTrame',
 source+'\nreturn {collectSemanticSnapshot,copyUnresolvedReserves,latestVisitWithRows};')(
 ()=> 'carried-'+(++nextId),'icpe_v1',()=>({id:'icpe_v1'}),()=>index);
const e=new DatabaseSync(':memory:');
e.exec(`
 CREATE TABLE visites(id TEXT PRIMARY KEY,site_id TEXT,installation_id TEXT,
   trame_id TEXT,statut TEXT,date_visite TEXT);
 CREATE TABLE champs_visite(visite_id TEXT,section_code TEXT,cle TEXT,valeur TEXT,
   PRIMARY KEY(visite_id,section_code,cle));
 CREATE TABLE controles_visite(visite_id TEXT,section_code TEXT,cle TEXT,avis TEXT,
   commentaire TEXT,PRIMARY KEY(visite_id,section_code,cle));
 CREATE TABLE remarques(id TEXT PRIMARY KEY,visite_id TEXT,controle_key TEXT,
   poste TEXT,prestation TEXT,delai INTEGER,estimatif REAL,origine TEXT,
   reference_onglet TEXT,reference_type TEXT,reference_id TEXT,reference_libelle TEXT,
   criticite INTEGER,criticite_defaut INTEGER,criticite_modifiee INTEGER,
   intranet_date_reserve TEXT,intranet_delai TEXT,intranet_etat_avancement TEXT,
   perimetre TEXT,cree_le TEXT);
 CREATE TABLE provenances(entite_type TEXT,entite_id TEXT,origine TEXT);
 CREATE TABLE reseaux(visite_id TEXT);
 CREATE TABLE compteurs(visite_id TEXT);
`);
const insert=(sql,...args)=>e.prepare(sql).run(...args);
const visits=[];
for(let i=0;i<250;i++){
 const id='v'+i;
 insert('INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite) VALUES(?,?,?,?,?,?)',
   id,'site','local','icpe_v1','terminee','2026-01-01');
 insert('INSERT INTO champs_visite VALUES(?,?,?,?)',id,'data','Notice','Notice '+i);
 insert('INSERT INTO controles_visite VALUES(?,?,?,?,?)',id,'checks','BAES',i===249?'S.O':'N.S','Commentaire '+i);
 visits.push({id,trame_id:'icpe_v1'});
}
visits.reverse();
const reserve=(id,visitId,ref=null,status=null)=>insert(
 'INSERT INTO remarques(id,visite_id,poste,prestation,origine,reference_type,reference_id,criticite,intranet_etat_avancement,cree_le) VALUES(?,?,?,?,?,?,?,?,?,?)',
 id,visitId,'Fuite','Réparer','ICPE',ref?'reserve_historique':null,ref,3,status,'2026-01-01');
reserve('copy-A','v249','rA','Terminé');  // The newest occurrence is closed.
reserve('rA','v248');                     // Must not reappear from history.
reserve('rB','v247');                     // One open reserve to carry.
reserve('copy-B','v246','rB',null);        // Older duplicate.
reserve('rC','v245');                     // Explicitly removed from local lineage.
reserve('rD','v244',null,'Annulé');
reserve('rExisting','v243');
reserve('alreadyHere','new','rExisting');
insert('INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite) VALUES(?,?,?,?,?,?)',
  'new','site','local','icpe_v1','en_cours','2026-11-03');
insert('INSERT INTO provenances VALUES(?,?,?)','reserve_lignee','rC','retrait_visite');
insert('INSERT INTO reseaux VALUES(?)','v121');
insert('INSERT INTO reseaux VALUES(?)','v10');
insert('INSERT INTO compteurs VALUES(?)','v200');
const reads=[],writes=[];
const db={
 getAllAsync:async(sql,args=[])=>{reads.push({sql,args});return e.prepare(sql).all(...args);},
 runAsync:async(sql,args=[])=>{writes.push({sql,args});return e.prepare(sql).run(...args);},
};
(async()=>{
 const began=Date.now();
 const snap=await mod.collectSemanticSnapshot(db,visits);
 assert.equal(snap.get('notice').textValue,'Notice 249');
 assert.equal(snap.get('baes').avis,'S.O');
 assert.equal(snap.get('baes').commentaire,'Commentaire 249');
 assert.equal(snap.get('baes').controlSourceVisitId,'v249');
 assert.equal(reads.length,6,'250 visits must be read in 3 chunks x 2 queries');
 assert.ok(reads.every(x=>x.args.length<=120),'bound SQLite parameter count and memory');

 reads.length=0;
 const copied=await mod.copyUnresolvedReserves(db,'new',visits);
 assert.equal(copied,1,'only rB open and not removed/closed/existing');
 const carried=e.prepare("SELECT reference_id,prestation,origine FROM remarques WHERE visite_id='new' AND reference_id='rB'").get();
 assert.equal(carried.reference_id,'rB');
 assert.equal(carried.prestation,'Réparer');
 assert.match(carried.origine,/Reprise historique/);
 assert.equal(e.prepare("SELECT COUNT(*) n FROM remarques WHERE visite_id='new'").get().n,2);
 assert.ok(reads.length<=8,'batch reserves / tombstones, not N per-visit queries');
 const again=await mod.copyUnresolvedReserves(db,'new',visits);
 assert.equal(again,0,'idempotent carry without duplicates');
 reads.length=0;
 const newestNetwork=await mod.latestVisitWithRows(db,visits,'reseaux');
 assert.equal(newestNetwork.id,'v121','newest network visit takes priority even across batches');
 assert.equal(reads.length,2,'historical networks use two batched reads, not 129 individual checks');
 reads.length=0;
 const newestMeter=await mod.latestVisitWithRows(db,visits,'compteurs');
 assert.equal(newestMeter.id,'v200','newest meter visit keeps its original value source');
 assert.equal(reads.length,1,'historical meters use one batched read instead of fifty');
 console.log('PASS 250 historical visits: 6 semantic reads, <=8 reserve reads, S.O/N.S preserved, only open lineage copied ('+(Date.now()-began)+' ms)');
 e.close();
})().catch(err=>{console.error(err);process.exitCode=1;});
