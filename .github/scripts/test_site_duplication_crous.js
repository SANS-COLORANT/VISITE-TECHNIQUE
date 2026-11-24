const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const load=(file,deps)=>{
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
  const code=source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
};
function harness(name){
  const child=spawn('python3',[path.join(__dirname,'photo_sqlite_harness.py'),name],
    {stdio:['pipe','pipe','inherit']});
  const pending=new Map();let sequence=0;
  readline.createInterface({input:child.stdout}).on('line',line=>{
    const data=JSON.parse(line),resolve=pending.get(data.id);
    if(!resolve)return;
    pending.delete(data.id);
    if(data.error)resolve.reject(new Error(data.error));else resolve.resolve(data.result);
  });
  const send=(method,sql='',params=[])=>new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});
    child.stdin.write(JSON.stringify({id,method,sql,params})+'\n');
  });
  return {send,db:{
    execAsync:s=>send('exec',s),
    runAsync:(s,p)=>send('run',s,p),
    getAllAsync:(s,p)=>send('all',s,p),
    getFirstAsync:async(s,p)=>(await send('all',s,p))[0]||null,
  },close:()=>child.stdin.end()};
}
(async()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'metra-clone-'));
const db=harness(path.join(dir,'clone.db'));
try{
  await db.send('migrate','',[0,51]);
  await db.db.execAsync(`
    INSERT INTO clients(id,nom) VALUES('c','CROUS');
    INSERT INTO sites(id,client_id,nom_site) VALUES('old','c','Résidence origine');
    INSERT INTO installations(id,site_id,type_code,nom) VALUES('old-local','old','installation_technique','Chaufferie');
    INSERT INTO installations(id,site_id,type_code,nom) VALUES('old-local-2','old','installation_technique','Chaufferie');
    INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite) VALUES('old-v2','old','old-local-2','icpe_v1','terminee','2026-11-16');
    INSERT INTO equipements(id,installation_id,type_code,designation) VALUES('cta1','old-local','CTA','CTA Soufflage');
    INSERT INTO reseaux_site(id,installation_id,type_code,nom) VALUES('network1','old-local','chauffage','Boucle ECS');
    INSERT INTO compteurs_site(id,installation_id,type_code,libelle) VALUES('meter1','old-local','compteur','Eau');
    INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite,api_remote_local_id)
      VALUES('old-v','old','old-local','remar_v1','terminee','2026-11-16','991');
    INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
      VALUES('old-v','infos.informations_generales','Nom du site','Résidence origine'),
            ('old-v','infos.informations_generales','Adresse','Rue test');
    INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
      VALUES('old-v','test.local','Conformité','N.S','Correction urgente');
    INSERT INTO notes(visite_id,contenu) VALUES('old-v','Note enregistrée');
    INSERT INTO reseaux(id,visite_id,reseau_site_id,ordre,nom_reseau,t_dep_c,t_retour_ecs_c,t_stockage_ecs_c)
      VALUES('old-network','old-v','network1',1,'Boucle ECS','60','53','62');
    INSERT INTO compteurs(id,visite_id,compteur_site_id,label,valeur,unite)
      VALUES('old-meter','old-v','meter1','Energie','1250','kWh');
    INSERT INTO materiel(id,visite_id,equipement_id,categorie,designation,etat)
      VALUES('old-material','old-v','cta1','CTA','CTA Soufflage','Bon');
    INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,criticite)
      VALUES('old-remark','old-v','remar||equipement||cta1||p-remar-cta||CTA||GTB',
        'Travaux de conformité','Réparer automate',4);
    INSERT INTO remar_items(id,installation_id,parent_equipement_id,type_code,nom)
      VALUES('old-item','old-local','cta1','filtre_cta','Filtre G4');
    INSERT INTO remar_item_visits(visite_id,item_id) VALUES('old-v','old-item');
    INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,avis,commentaire)
      VALUES('old-v','equipement','cta1','p-remar-cta','CTA','GTB','N.S','Erreur GTB'),
            ('old-v','item','old-item','p-remar-filtres','filtre_cta','Filtration','S','Filtre OK');
  `);
  await db.db.execAsync(`
    INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('12','c','CROUS','{}');
    INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','old','Origine','{"lotId":2,"energie":"GAZ","typeBatiment":"Habitation"}');
    INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','old');
    INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json,local_installation_id,remote_trame_id) VALUES('991','45','Chaufferie','{"local":{"type":"Chaufferie","situation":"RDC"},"trame":{"id":16}}','old-local','16');
    INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json,remote_trame_id) VALUES('992','45','Local non ouvert','{"local":{"type":"Technique","situation":"RDC"},"trame":{"id":3}}','3');
    INSERT INTO visites(id,site_id,trame_id,statut,date_visite,api_remote_local_id) VALUES('old-v3','old','icpe_v1','terminee','2026-11-16','992');
  `);
  let seq=0;const uuidv4=()=>('copy-'+(++seq).toString().padStart(6,'0'));
  const clone=load('siteVisitCloneDb.js',{});
  const ownership=load('siteHierarchyDb.js',{});
  const api=load('siteOrganizationDb.js',{getDb:async()=>db.db,uuidv4,...ownership,
    cloneLatestVisitsForSite:clone.cloneLatestVisitsForSite});
  const result=await api.dupliquerSite('old',{copierPatrimoine:true,copierLab3d:false,copierVisites:true});
  assert.equal(result.visitesCopiees,3);
  assert.equal(result.locauxCopies,3);
  const copied=await db.db.getAllAsync('SELECT v.id,v.site_id,v.installation_id,i.site_id AS local_site FROM visites v JOIN installations i ON i.id=v.installation_id WHERE v.site_id=?',[result.siteId]);
  assert.equal(copied.length,3);assert.equal(new Set(copied.map(v=>v.installation_id)).size,3);
  assert.ok(copied.every(v=>v.site_id===v.local_site&&v.site_id===result.siteId&&!v.installation_id.startsWith('old-local')));
  await assert.rejects(ownership.assertVisitParent(db.db,'old',copied[0].installation_id),/ne fait pas partie/);
  const metadata=await db.db.getFirstAsync("SELECT valeur FROM attributs_libres WHERE entite_type='site' AND entite_id=? AND cle=?",[result.siteId,ownership.COPY_TEMPLATE_KEY]);
  assert.equal(JSON.parse(metadata.valeur).lotId,2);
  assert.equal(JSON.parse(metadata.valeur).id,undefined);
  assert.equal((await db.db.getAllAsync("SELECT * FROM api_site_links WHERE local_site_id=?",[result.siteId])).length,0);
  const remoteCopy=await db.db.getFirstAsync("SELECT i.id FROM installations i WHERE site_id=? AND nom='Local non ouvert'",[result.siteId]);
  assert.ok(remoteCopy);
  assert.equal((await db.db.getFirstAsync("SELECT api_remote_local_id FROM visites WHERE installation_id=?",[remoteCopy.id])).api_remote_local_id,null);
  assert.equal((await db.db.getFirstAsync("SELECT local_installation_id FROM api_local_links WHERE remote_local_id='992'")).local_installation_id,null);
  const copy=await db.db.getFirstAsync(
    "SELECT * FROM visites WHERE site_id=? AND trame_id='remar_v1'",[result.siteId]);
  assert.ok(copy&&copy.id!=='old-v'&&copy.api_remote_local_id===null);
  assert.equal(copy.statut,'a_completer');
  const materiel=await db.db.getFirstAsync(
    'SELECT * FROM materiel WHERE visite_id=?',[copy.id]);
  assert.ok(materiel.equipement_id!=='cta1');
  const control=await db.db.getFirstAsync('SELECT * FROM controles_visite WHERE visite_id=?',[copy.id]);
  assert.equal(control.avis,'N.S');
  const remarks=await db.db.getFirstAsync('SELECT * FROM remarques WHERE visite_id=?',[copy.id]);
  assert.equal(remarks.criticite,4);
  assert.ok(!remarks.controle_key.includes('cta1'));
  const cta=await db.db.getFirstAsync(
    "SELECT * FROM remar_values WHERE visite_id=? AND owner_type='equipement'",[copy.id]);
  assert.equal(cta.avis,'N.S');assert.equal(cta.commentaire,'Erreur GTB');
  const ecs=await db.db.getFirstAsync('SELECT * FROM reseaux WHERE visite_id=?',[copy.id]);
  assert.equal(ecs.t_dep_c,'60');assert.equal(ecs.t_retour_ecs_c,'53');assert.equal(ecs.t_stockage_ecs_c,'62');
  assert.equal((await db.db.getFirstAsync(
    "SELECT valeur FROM champs_visite WHERE visite_id=? AND cle='Nom du site'",[copy.id])).valeur,
    result.nomSite);
  assert.equal((await db.db.getFirstAsync("SELECT valeur FROM champs_visite WHERE visite_id='old-v' AND cle='Nom du site'")).valeur,'Résidence origine');
  assert.equal((await db.db.getAllAsync('PRAGMA foreign_key_check')).length,0);
  assert.equal((await db.db.getAllAsync('SELECT * FROM photos WHERE visite_id=?',[copy.id])).length,0);
  await ownership.assertRemoteLocalParent(db.db,'old','991',{site:{id:'45'}});
  await assert.rejects(ownership.assertRemoteLocalParent(db.db,result.siteId,'991',{site:{id:'45'}}),/autre site/);
  assert.equal((await db.db.getFirstAsync("SELECT local_installation_id FROM api_local_links WHERE remote_local_id='991'")).local_installation_id,'old-local');
  console.log('PASS CROUS: new site/visit and material IDs, cloned avis, REMAR child, ECS temperatures, no old Symfony identity, original unchanged and no photo aliases');
} finally {db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
