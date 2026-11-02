/**
 * Real SQLite regression for REMAR progress and tab badges.
 * Records two CTAs with duplicate material inventory rows, unconfirmed N.S,
 * optional networks and filter state. ICPE/VMC trames are not modified.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,deps,names){
  const code=read(file).replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
const definition=JSON.parse(read('remarTrame.js').match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
const sql=new DatabaseSync(':memory:');
sql.exec(`
CREATE TABLE visites(id TEXT PRIMARY KEY,installation_id TEXT,trame_id TEXT,statut TEXT,progression_pct INTEGER,modifie_le TEXT);
CREATE TABLE champs_visite(visite_id TEXT,section_code TEXT,cle TEXT,valeur TEXT);
CREATE TABLE controles_visite(visite_id TEXT,section_code TEXT,cle TEXT,avis TEXT);
CREATE TABLE equipements(id TEXT PRIMARY KEY,installation_id TEXT,type_code TEXT,designation TEXT,statut TEXT);
CREATE TABLE materiel(id TEXT PRIMARY KEY,visite_id TEXT,equipement_id TEXT);
CREATE TABLE remar_items(id TEXT PRIMARY KEY,type_code TEXT,parent_equipement_id TEXT);
CREATE TABLE remar_item_visits(visite_id TEXT,item_id TEXT);
CREATE TABLE remar_values(visite_id TEXT,owner_type TEXT,owner_id TEXT,panel_id TEXT,section_code TEXT,cle TEXT,valeur TEXT,avis TEXT,commentaire TEXT);
CREATE TABLE reseaux(visite_id TEXT,nom_reseau TEXT,t_ext_c TEXT,t_dep_c TEXT,courbe_de_chauffe TEXT,tnc TEXT,consigne_programme_horaire TEXT);
CREATE TABLE compteurs(visite_id TEXT,valeur TEXT);
INSERT INTO visites VALUES('v','local','remar_v1','en_cours',5,NULL);
INSERT INTO equipements VALUES('cta1','local','CTA','CTA soufflage','actif');
INSERT INTO equipements VALUES('cta2','local','CTA','CTA extraction','actif');
INSERT INTO materiel VALUES('m1','v','cta1');
INSERT INTO materiel VALUES('m1b','v','cta1');
INSERT INTO materiel VALUES('m2','v','cta2');
INSERT INTO reseaux(visite_id,nom_reseau) VALUES('v','Radiateurs');
INSERT INTO remar_items VALUES('filtre1','filtre_cta','cta1');
INSERT INTO remar_item_visits VALUES('v','filtre1');
INSERT INTO remar_values VALUES('v','equipement','cta1','p-remar-cta','Avis sur l’entretien général','Calorifugeage',NULL,'S','Isolation en état.');
INSERT INTO remar_values VALUES('v','equipement','cta1','p-remar-cta','Avis sur l’entretien général','Eclairage du caisson',NULL,'N.S',NULL);
`);
const db={
 getAllAsync:async(q,args=[])=>sql.prepare(q).all(...args),
 getFirstAsync:async(q,args=[])=>sql.prepare(q).get(...args),
 runAsync:async(q,args=[])=>sql.prepare(q).run(...args),
};
const normaliserSectionCode=(panel,section)=>panel.replace('p-','')+'.'+String(section).toLowerCase().replace(/[^a-z0-9]+/g,'_');
const obtenirTrame=()=>definition;
const remarFamilleEquipement=e=>({CTA:'cta',VMC:'vmc',Froid:'froid'})[e.type_code]||null;
const badge=load('visitTabStatusDb.js',
 {getDb:async()=>db,obtenirTrame,DEFAULT_TRAME_ID:'icpe_v1',normaliserSectionCode,remarFamilleEquipement},
 ['calculerEtatOnglets']);
const progress=load('visitProgressDb.js',
 {obtenirTrame,DEFAULT_TRAME_ID:'icpe_v1',normaliserSectionCode,calculerEtatOnglets:badge.calculerEtatOnglets},
 ['recalculerProgressionVisite']);
let n=0;function ok(x,msg){assert.ok(x,msg);n++}
async function run(){
 let st=await badge.calculerEtatOnglets('v','remar_v1');
 ok(st.tabs['p-remar-cta'].total===24,'2 CTAs = exactly 24 steps, not 36 from duplicate materiel');
 ok(st.tabs['p-remar-cta'].done===1,'S confirmed, N.S without description is incomplete');
 ok(st.tabs['p-remar-cta'].ns===1,'unresolved NS continues to flag red');
 ok(st.tabs['p-remar-reseaux'].total===1&&st.tabs['p-remar-reseaux'].done===0,
   'naming a network does not pretend a measurement was taken');
 ok(st.tabs['p-remar-filtres'].total===1&&st.tabs['p-remar-filtres'].done===0,
   'filter creation does not validate its condition');
 sql.exec("INSERT INTO remar_values VALUES('v','item','filtre1','p-remar-filtres','filtre_cta','Classe de filtration','G4',NULL,NULL)");
 st=await badge.calculerEtatOnglets('v','remar_v1');
 ok(st.tabs['p-remar-filtres'].done===0,'classifying filter G4 is not an S opinion');
 sql.exec("UPDATE remar_values SET commentaire='Éclairage défaillant à reprendre.' WHERE owner_id='cta1' AND cle='Eclairage du caisson'");
 sql.exec("INSERT INTO remar_values VALUES('v','item','filtre1','p-remar-filtres','filtre_cta','Etat du filtre',NULL,'S','Filtre propre et en place.')");
 sql.exec("UPDATE reseaux SET t_dep_c='60' WHERE visite_id='v'");
 st=await badge.calculerEtatOnglets('v','remar_v1');
 ok(st.tabs['p-remar-cta'].done===2,'NS documented becomes a completed check');
 ok(st.tabs['p-remar-filtres'].done===1,'filter visually confirmed done');
 ok(st.tabs['p-remar-reseaux'].done===1,'network temperature recorded counts');
 const pct=await progress.recalculerProgressionVisite(db,'v');
 ok(pct===Number(sql.prepare("SELECT progression_pct FROM visites WHERE id='v'").get().progression_pct),
   'same dynamic panel totals drive header percentage and persist in SQLite');
 const earlier=st.tabs['p-remar-cta'].total;
 sql.exec("UPDATE equipements SET statut='retire' WHERE id='cta2'");
 st=await badge.calculerEtatOnglets('v','remar_v1');
 ok(st.tabs['p-remar-cta'].total===earlier-12,
   'active visit hides retired equipment despite historical material snapshot');
 sql.exec("UPDATE visites SET statut='terminee' WHERE id='v'");
 st=await badge.calculerEtatOnglets('v','remar_v1');
 ok(st.tabs['p-remar-cta'].total===earlier,
   'closed visit still includes its retired CTA history without reusing current asset state');
 console.log('PASS '+n+' REMAR real SQLite progress, asset uniqueness and history checks.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
