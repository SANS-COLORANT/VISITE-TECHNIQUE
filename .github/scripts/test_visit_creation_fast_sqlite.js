/** Real SQLite regression for the fast, lossless new-visit snapshot. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { DatabaseSync }=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'visitLatestSnapshotDb.js'),'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const)\s)/g,'');
const createId=()=> 'id-fixture';
const mod=new Function('DEFAULT_TRAME_ID','createId',source+
  '\nreturn {copyLatestSameTrameVisit,isCurrentVisitMetadata};')('icpe_v1',createId);
const engine=new DatabaseSync(':memory:');
engine.exec(`
 CREATE TABLE visites(id TEXT PRIMARY KEY,site_id TEXT,installation_id TEXT,
   trame_id TEXT,statut TEXT,date_visite TEXT,modifie_le TEXT);
 CREATE TABLE _meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE champs_visite(visite_id TEXT,section_code TEXT,cle TEXT,valeur TEXT,
   PRIMARY KEY(visite_id,section_code,cle));
 CREATE TABLE controles_visite(visite_id TEXT,section_code TEXT,cle TEXT,avis TEXT,
   commentaire TEXT,PRIMARY KEY(visite_id,section_code,cle));
 CREATE TABLE notes(visite_id TEXT PRIMARY KEY,contenu TEXT);
 CREATE TABLE equipements(id TEXT PRIMARY KEY,installation_id TEXT);
 CREATE TABLE remar_items(id TEXT PRIMARY KEY,installation_id TEXT);
 CREATE TABLE remar_values(visite_id TEXT,owner_type TEXT,owner_id TEXT,
   panel_id TEXT,section_code TEXT,cle TEXT,valeur TEXT,avis TEXT,
   commentaire TEXT,source_visite_id TEXT,confirme_le TEXT,modifie_le TEXT,
   PRIMARY KEY(visite_id,owner_type,owner_id,panel_id,section_code,cle));
`);
const db={
 writes:0,
 getFirstAsync:async(sql,args=[])=>engine.prepare(sql).get(...args)||null,
 getAllAsync:async(sql,args=[])=>engine.prepare(sql).all(...args),
 runAsync:async(sql,args=[])=>{db.writes++;return engine.prepare(sql).run(...args);},
 withTransactionAsync:async(fn)=>{
   engine.exec('BEGIN');
   try{const r=await fn();engine.exec('COMMIT');return r;}
   catch(e){engine.exec('ROLLBACK');throw e;}
 },
};
const row=(sql,...args)=>engine.prepare(sql).run(...args);
const value=(sql,...args)=>engine.prepare(sql).get(...args);
row('INSERT INTO visites VALUES(?,?,?,?,?,?,?)','new','s','local-1','remar_v1','en_cours','2026-11-03','2026-11-03');
row('INSERT INTO visites VALUES(?,?,?,?,?,?,?)','foreign','s','local-2','remar_v1','terminee','2026-11-02','2026-11-02');
row('INSERT INTO visites VALUES(?,?,?,?,?,?,?)','old-other-trame','s','local-1','icpe_v1','terminee','2026-11-02','2026-11-02');
// Historical import can be INSERTed after the current visit. Its date still wins.
row('INSERT INTO visites VALUES(?,?,?,?,?,?,?)','old','s','local-1','remar_v1','terminee','2026-10-30','2026-10-30');
const field=engine.prepare('INSERT INTO champs_visite VALUES(?,?,?,?)');
const control=engine.prepare('INSERT INTO controles_visite VALUES(?,?,?,?,?)');
const states=['S','N.S','S.O','N.R','N.V'];
for(let i=0;i<400;i++)field.run('old','p-mesures.test','Champ '+i,'Valeur '+i);
for(let i=0;i<300;i++)control.run('old','p-avis.test','Contrôle '+i,states[i%5],'Commentaire '+i);
field.run('old','p-infos.test','Date de visite','2026-10-30');
field.run('old','p-infos.test','Adresse','Adresse ancienne');
field.run('old','p-infos.test','Date du dernier entretien','2024-08-22');
field.run('new','p-infos.test','Date de visite','2026-11-03');
field.run('new','p-infos.test','Adresse','Adresse nouvelle');
field.run('foreign','p-mesures.test','Interdit','Autre local');
field.run('old-other-trame','p-mesures.test','Interdit','Autre trame');
row('INSERT INTO notes VALUES(?,?)','new','');
row('INSERT INTO notes VALUES(?,?)','old','Conclusion historique');
row('INSERT INTO equipements VALUES(?,?)','cta1','local-1');
row('INSERT INTO equipements VALUES(?,?)','cta-foreign','local-2');
row('INSERT INTO remar_items VALUES(?,?)','filtre1','local-1');
const dynamic=engine.prepare('INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,confirme_le) VALUES(?,?,?,?,?,?,?,?,?,?)');
dynamic.run('old','equipement','cta1','p-remar-cta','suivi','Contrôle CTA','16','N.S','Calorifugeage','2026-10-30 10:00');
dynamic.run('old','item','filtre1','p-remar-filtre','suivi','Filtre F7','7','S.O',null,'2026-10-30 10:00');
dynamic.run('old','equipement','cta-foreign','p-remar-cta','suivi','Interdit','9','S','Hors local','2026-10-30 10:00');
(async()=>{
 const since=Date.now();
 const result=await mod.copyLatestSameTrameVisit(db,'new');
 assert.equal(result.sourceVisitId,'old');
 assert.equal(result.copiedFields,401);
 assert.equal(result.copiedControls,300);
 assert.equal(result.copiedDynamic,2);
 assert.equal(db.writes,5,'copy must issue five SQL mutations, not hundreds of writes');
 assert.equal(value("SELECT COUNT(*) AS n FROM champs_visite WHERE visite_id='new'").n,403);
 assert.equal(value("SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id='new'").n,300);
 assert.equal(value("SELECT COUNT(*) AS n FROM remar_values WHERE visite_id='new'").n,2);
 assert.equal(value("SELECT valeur FROM champs_visite WHERE visite_id='new' AND cle='Date de visite'").valeur,'2026-11-03');
 assert.equal(value("SELECT valeur FROM champs_visite WHERE visite_id='new' AND cle='Adresse'").valeur,'Adresse nouvelle');
 assert.equal(value("SELECT valeur FROM champs_visite WHERE visite_id='new' AND cle='Date du dernier entretien'").valeur,'2024-08-22');
 assert.equal(value("SELECT COUNT(*) AS n FROM champs_visite WHERE visite_id='new' AND cle='Interdit'").n,0);
 for(const avis of states)assert.equal(value('SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id=? AND avis=?','new',avis).n,60);
 assert.equal(value("SELECT commentaire FROM controles_visite WHERE visite_id='new' AND cle='Contrôle 1'").commentaire,'Commentaire 1');
 assert.equal(value("SELECT commentaire FROM remar_values WHERE visite_id='new' AND owner_id='cta1'").commentaire,'Calorifugeage');
 assert.equal(value("SELECT source_visite_id FROM remar_values WHERE visite_id='new' AND owner_id='filtre1'").source_visite_id,'copie_locale:old');
 assert.equal(value("SELECT contenu FROM notes WHERE visite_id='new'").contenu,'Conclusion historique');
 row("UPDATE controles_visite SET avis='S.O',commentaire='Correction locale' WHERE visite_id='new' AND cle='Contrôle 1'");
 const copiedAgain=await mod.copyLatestSameTrameVisit(db,'new');
 assert.equal(copiedAgain.alreadyCopied,true);
 assert.equal(db.writes,5);
 assert.equal(value("SELECT commentaire FROM controles_visite WHERE visite_id='new' AND cle='Contrôle 1'").commentaire,'Correction locale');
 console.log('PASS fast SQL snapshot: 401 fields, 300 opinions, 2 REMAR items, 5 mutations, all statuses and historical provenance; '+(Date.now()-since)+' ms');
 engine.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
