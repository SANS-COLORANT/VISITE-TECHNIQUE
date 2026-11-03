/** Verify fast Intranet equipment setup on 80 real SQLite materials. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'apiVisitPreparationDb.js'),'utf8')
 .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
 .replace(/export\s+(?=(?:async\s+)?(?:function|const)\s)/g,'');
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`
 CREATE TABLE sites(id TEXT PRIMARY KEY);
 CREATE TABLE installations(id TEXT PRIMARY KEY,site_id TEXT,type_code TEXT,
   nom TEXT,description TEXT,actif INTEGER);
 CREATE TABLE visites(id TEXT PRIMARY KEY,site_id TEXT,trame_id TEXT,installation_id TEXT,
   api_remote_local_id TEXT,api_remote_client_id TEXT,api_remote_trame_id TEXT,
   api_source_remote_visit_id TEXT,modifie_le TEXT);
 CREATE TABLE api_local_links(remote_local_id TEXT PRIMARY KEY,local_installation_id TEXT);
 CREATE TABLE provenances(id TEXT PRIMARY KEY,entite_type TEXT,entite_id TEXT,
   origine TEXT,reference_externe TEXT,details_json TEXT,
   importe_le TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE equipements(id TEXT PRIMARY KEY,installation_id TEXT,type_code TEXT,
   designation TEXT,marque TEXT,modele TEXT,annee INTEGER,statut TEXT,
   modifie_le TEXT);
 CREATE TABLE equipement_trames(equipement_id TEXT,trame_id TEXT,actif INTEGER,
   modifie_le TEXT,PRIMARY KEY(equipement_id,trame_id));
 CREATE TABLE materiel(id TEXT PRIMARY KEY,visite_id TEXT,categorie TEXT,
   nombre TEXT,designation TEXT,numero_materiel TEXT,reseau_desservi TEXT,
   marque TEXT,modele TEXT,caracteristiques TEXT,annee TEXT,etat TEXT,
   equipement_id TEXT);
 CREATE TABLE attributs_libres(id TEXT PRIMARY KEY,entite_type TEXT,entite_id TEXT,
   cle TEXT,valeur TEXT,type_valeur TEXT,modifie_le TEXT,
   UNIQUE(entite_type,entite_id,cle));
`);
const exec=(sql,...args)=>sqlite.prepare(sql).run(...args);
exec("INSERT INTO sites VALUES(?)",'site');
exec("INSERT INTO sites VALUES(?)",'another-site');
exec("INSERT INTO api_local_links VALUES(?,NULL)",'501');
for(const id of ['v1','v2','v3'])exec(
 'INSERT INTO visites(id,site_id,trame_id) VALUES(?,?,?)',id,'site','remar_v1');
let ids=0;
const newId=()=> 'fast-equip-'+(++ids);
const reads=[];
const db={
 getAllAsync:async(sql,args=[])=>{reads.push(sql);return sqlite.prepare(sql).all(...args);},
 getFirstAsync:async(sql,args=[])=>{reads.push(sql);return sqlite.prepare(sql).get(...args)||null;},
 runAsync:async(sql,args=[])=>sqlite.prepare(sql).run(...args),
 withTransactionAsync:async cb=>{
   sqlite.exec('BEGIN');
   try{const res=await cb();sqlite.exec('COMMIT');return res;}
   catch(error){sqlite.exec('ROLLBACK');throw error;}
 },
};
const api=new Function('getDb','getCachedLocalReference','createId',
 source+'\nreturn {importApiReferenceForVisit};')(
 async()=>db,async()=>null,newId);
const materials=Array.from({length:80},(_,i)=>({
 id:String(1000+i),categorie:'pompe',designation:'Pompe '+i,marque:'ACME',
 modele:'PM-'+i,annee:2020,numeroMateriel:'P-'+i,nombre:'1',
 reseauDesservi:'Chauffage',caracteristiques:'100 kW',etat:'S'
}));
const ref={local:{id:'501',designation:'Chaufferie'},
 site:{id:'45'},trame:{id:'16',nom:'REMAR CLASSIQUE'},
 derniereVisite:{id:'55'},materiels:materials};
const get=sql=>sqlite.prepare(sql).get();
(async()=>{
 const first=await api.importApiReferenceForVisit('v1','501','12',ref);
 assert.equal(first.importedMaterials,80);
 assert.equal(get('SELECT COUNT(*) n FROM equipements').n,80);
 assert.equal(get('SELECT COUNT(*) n FROM materiel').n,80);
 assert.equal(get('SELECT COUNT(*) n FROM attributs_libres').n,480);
 assert.equal(get("SELECT COUNT(*) n FROM equipement_trames WHERE trame_id='remar_v1'").n,80);
 // The new visit should re-use current equipment rather than insert 80 more.
 reads.length=0;
 const second=await api.importApiReferenceForVisit('v2','501','12',ref);
 assert.equal(second.importedMaterials,80);
 assert.equal(get('SELECT COUNT(*) n FROM equipements').n,80);
 assert.equal(get('SELECT COUNT(*) n FROM materiel').n,160);
 assert.equal(get('SELECT COUNT(*) n FROM attributs_libres').n,480);
 const preload=reads.filter(sql=>sql.includes('p.reference_externe IN ('));
 const individual=reads.filter(sql=>sql.includes('p.reference_externe=?'));
 assert.equal(preload.length,1,'80 known equipment identifiers read in one bulk lookup');
 assert.equal(individual.length,0,'no per-equipment remote identity scans on revisit');
 assert.equal(get("SELECT COUNT(*) n FROM materiel WHERE visite_id='v2'").n,80);
 // A changed current listing must still be applied on a fresh visit.
 const updated={...ref,materiels:materials.map((m,i)=>
  i===9?{...m,caracteristiques:'120 kW'}:m)};
 const third=await api.importApiReferenceForVisit('v3','501','12',updated);
 assert.equal(third.importedMaterials,80);
 assert.equal(get('SELECT COUNT(*) n FROM equipements').n,80);
 assert.equal(get('SELECT COUNT(*) n FROM materiel').n,240);
 const change=sqlite.prepare(`SELECT a.valeur FROM attributs_libres a
   JOIN equipements e ON e.id=a.entite_id WHERE e.designation='Pompe 9'
   AND a.cle='api_symfony.caracteristiques'`).get();
 assert.equal(change.valeur,'120 kW','remote material update not hidden by acceleration');
 const history=sqlite.prepare("SELECT caracteristiques FROM materiel WHERE visite_id='v2' AND designation='Pompe 9'").get();
 assert.equal(history.caracteristiques,'100 kW','previous visit snapshot unchanged');
 assert.equal(get("SELECT COUNT(*) n FROM materiel WHERE visite_id='v3'").n,80);
 console.log('PASS bulk Intranet materials: 80 equipments, 480 attributes, one lookup per local instead of 80, no duplicates, historical snapshot preserved');
 sqlite.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
