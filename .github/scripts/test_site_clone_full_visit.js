/**
 * Cross-site full visit clone regression on a REAL SQLite migrated database.
 * New IDs must remain unique and remote Symfony targets never copied.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const root=path.resolve(__dirname,'../..');
function load(file,dependencies,names){
  const code=fs.readFileSync(path.join(root,file),'utf8')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(dependencies),code+'\nreturn {'+names.join(',')+'};')
    (...Object.values(dependencies));
}
function database(filename){
  const process=spawn('python3',[path.join(__dirname,'photo_sqlite_harness.py'),filename],{
    stdio:['pipe','pipe','inherit'],
  });
  const pending=new Map();let seq=0;
  readline.createInterface({input:process.stdout}).on('line',line=>{
    const result=JSON.parse(line),p=pending.get(result.id);
    if(!p)return;pending.delete(result.id);
    if(result.error)p.reject(new Error(result.error));
    else p.resolve(result.result);
  });
  const send=(method,sql='',params=[])=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});
    process.stdin.write(JSON.stringify({id,method,sql,params})+'\n');
  });
  const db={
    getAllAsync:(sql,params=[])=>send('all',sql,params),
    getFirstAsync:async(sql,params=[])=>(await send('all',sql,params))[0]||null,
    runAsync:(sql,params=[])=>send('run',sql,params),
    execAsync:sql=>send(/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)?'run':'exec',sql),
  };
  return {db,send,close:()=>process.stdin.end()};
}
let index=0;const uuidv4=()=>('copy-'+(++index));
const query=(db,sql,args=[])=>db.getAllAsync(sql,args);
async function start(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'metra-duplicate-complete-'));
  const {db,send,close}=database(path.join(dir,'clone.db'));
  try{
    const migrated=await send('migrate','',[0,50]);
    assert.equal(migrated.foreign_keys.length,0);
    const current=await db.getAllAsync('PRAGMA table_info(remarques)');
    assert.ok(current.some(c=>c.name==='urgence'),'migration 050 added urgency without deleting old remarks');
    assert.ok((await db.getAllAsync('PRAGMA table_info(reseaux)')).some(c=>c.name==='t_retour_c'),
      'migration 050 added ECS return temperature without old value changes');
    const insert=(sql,params=[])=>db.runAsync(sql,params);
    await insert("INSERT INTO clients(id,nom) VALUES('client-original','Client CROUS')");
    await insert("INSERT INTO sites(id,client_id,nom_site) VALUES('site-original','client-original','Site ancien')");
    await insert("INSERT INTO installations(id,site_id,type_code,nom) VALUES('local-original','site-original','chauffage','Sous-station')");
    await insert("INSERT INTO equipements(id,installation_id,type_code,designation) VALUES('cta-original','local-original','CTA','CTA soufflage')");
    await insert("INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES('cta-original','remar_v1',1)");
    await insert("INSERT INTO reseaux_site(id,installation_id,type_code,nom) VALUES('network-original','local-original','ecs','Boucle ECS')");
    await insert("INSERT INTO compteurs_site(id,installation_id,type_code,libelle,unite) VALUES('meter-original','local-original','energie','Energie chauffage','kWh')");
    await insert("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('visit-old','site-original','local-original','remar_v1','2026-10-01','terminee')");
    await insert("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('visit-current','site-original','local-original','remar_v1','2026-11-15','terminee')");
    await insert("INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES('visit-current','infos.general','Nom du site','Site ancien')");
    await insert("INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES('visit-current','infos.general','Autre','Texte de visite')");
    await insert("INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('visit-current','conf-local.ventilation','Contrôle A','N.S','Détérioration')");
    await insert("INSERT INTO reseaux(id,visite_id,reseau_site_id,ordre,nom_reseau,t_dep_c,t_retour_c) VALUES('network-visit','visit-current','network-original',1,'Boucle ECS','61','52')");
    await insert("INSERT INTO compteurs(id,visite_id,compteur_site_id,label,valeur,unite) VALUES('meter-visit','visit-current','meter-original','Compteur énergie chauffage','1250','kWh')");
    await insert("INSERT INTO materiel(id,visite_id,equipement_id,categorie,nombre,designation,etat) VALUES('material-visit','visit-current','cta-original','CTA','1','CTA soufflage','Bon')");
    await insert("INSERT INTO notes(visite_id,contenu) VALUES('visit-current','Note du site source')");
    await insert("INSERT INTO remarques(id,visite_id,poste,prestation,criticite,criticite_defaut,urgence,reference_type,reference_id) VALUES('remark-original','visit-current','Entretien P2','Filtre à changer',3,3,1,'equipement','cta-original')");
    await insert("INSERT INTO remar_items(id,installation_id,parent_equipement_id,type_code,nom) VALUES('filter-original','local-original','cta-original','filtre_cta','Filtre G4')");
    await insert("INSERT INTO remar_item_visits(visite_id,item_id) VALUES('visit-current','filter-original')");
    await insert("INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,confirme_le) VALUES('visit-current','equipement','cta-original','p-remar-cta','CTA','GTB','Surveillance','S','OK','2026-11-15')");
    await insert("INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,confirme_le) VALUES('visit-current','item','filter-original','p-remar-filtres','filtre_cta','Etat','Encrassé','N.S','À remplacer','2026-11-15')");
    await insert("INSERT INTO remar_report_focus(visite_id,famille,equipement_id) VALUES('visit-current','cta','cta-original')");
    await insert("INSERT INTO photos(id,visite_id,uri) VALUES('photo-original','visit-current','file:///original/photo.jpg')");
    await insert("INSERT INTO api_visit_outbox(envoi_id,visite_id,remote_client_id,status,payload_json,payload_bytes) VALUES('remote-original','visit-current','123','synced','{}',2)");
    const helper=load('siteVisitCloneDb.js',{},['copyLatestVisitsForClonedSite']);
    const dao=load('siteOrganizationDb.js',{
      getDb:async()=>db,uuidv4,copyLatestVisitsForClonedSite:helper.copyLatestVisitsForClonedSite,
    },['dupliquerSite']);
    const cloned=await dao.dupliquerSite('site-original',{
      nomSite:'Nouveau site CROUS',copierPatrimoine:true,copierLab3d:false,
    });
    assert.equal(cloned.visitsCopied,1,'latest visit per local copied exactly once');
    const newSite=await db.getFirstAsync('SELECT * FROM sites WHERE id=?',[cloned.siteId]);
    assert.equal(newSite.nom_site,'Nouveau site CROUS');
    const v=await db.getFirstAsync('SELECT * FROM visites WHERE site_id=?',[cloned.siteId]);
    assert.ok(v&&v.id!=='visit-current'&&v.id!=='visit-old');
    assert.equal(v.statut,'en_cours');
    assert.notEqual(v.installation_id,'local-original');
    assert.equal((await db.getAllAsync('SELECT * FROM visites WHERE site_id=?',[cloned.siteId])).length,1);
    assert.equal((await db.getFirstAsync("SELECT valeur FROM champs_visite WHERE visite_id=? AND cle='Nom du site'",[v.id])).valeur,'Nouveau site CROUS');
    assert.equal((await db.getFirstAsync("SELECT valeur FROM champs_visite WHERE visite_id=? AND cle='Autre'",[v.id])).valeur,'Texte de visite');
    assert.equal((await db.getFirstAsync('SELECT avis FROM controles_visite WHERE visite_id=?',[v.id])).avis,'N.S');
    assert.equal((await db.getFirstAsync('SELECT contenu FROM notes WHERE visite_id=?',[v.id])).contenu,'Note du site source');
    const eq=await db.getFirstAsync('SELECT * FROM equipements WHERE installation_id=?',[v.installation_id]);
    assert.equal(eq.designation,'CTA soufflage');
    assert.notEqual(eq.id,'cta-original');
    const m=await db.getFirstAsync('SELECT * FROM materiel WHERE visite_id=?',[v.id]);
    assert.equal(m.equipement_id,eq.id);
    assert.notEqual(m.id,'material-visit');
    const ret=await db.getFirstAsync('SELECT * FROM reseaux WHERE visite_id=?',[v.id]);
    assert.equal(ret.t_dep_c,'61');assert.equal(ret.t_retour_c,'52');
    assert.notEqual(ret.reseau_site_id,'network-original');
    const meter=await db.getFirstAsync('SELECT * FROM compteurs WHERE visite_id=?',[v.id]);
    assert.equal(meter.valeur,'1250');assert.equal(meter.unite,'kWh');
    assert.notEqual(meter.compteur_site_id,'meter-original');
    const remark=await db.getFirstAsync('SELECT * FROM remarques WHERE visite_id=?',[v.id]);
    assert.equal(remark.urgence,1);assert.equal(remark.poste,'Entretien P2');
    assert.equal(remark.reference_id,eq.id);
    const dynamic=await query(db,'SELECT * FROM remar_values WHERE visite_id=?',[v.id]);
    assert.equal(dynamic.length,2);
    assert.ok(dynamic.some(r=>r.owner_id===eq.id&&r.avis==='S'));
    assert.ok(dynamic.some(r=>r.avis==='N.S'&&r.commentaire==='À remplacer'));
    const newItem=await db.getFirstAsync('SELECT * FROM remar_items WHERE installation_id=?',[v.installation_id]);
    assert.ok(newItem&&newItem.id!=='filter-original'&&newItem.parent_equipement_id===eq.id);
    assert.ok(dynamic.some(r=>r.owner_id===newItem.id));
    assert.equal((await query(db,'SELECT * FROM photos WHERE visite_id=?',[v.id])).length,0,
      'dated source photos never aliased to new visit');
    assert.equal((await query(db,'SELECT * FROM api_visit_outbox WHERE visite_id=?',[v.id])).length,0,
      'no remote visit/upload ID reused');
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS n FROM photos WHERE visite_id=?',['visit-current'])).n,1,
      'original photos untouched');
    const source=await db.getFirstAsync('SELECT * FROM remar_values WHERE visite_id=? AND owner_id=?',
      ['visit-current','filter-original']);
    assert.equal(source.avis,'N.S');
    assert.equal((await query(db,'PRAGMA foreign_key_check')).length,0,'foreign keys valid');
    console.log('PASS site clone full visit, ECS return, 2 REMAR owners, urgency, 2 controls/notes/material, identities, no media/outbox duplication');
  } finally {close();}
}
start().catch(e=>{console.error(e);process.exitCode=1;});
