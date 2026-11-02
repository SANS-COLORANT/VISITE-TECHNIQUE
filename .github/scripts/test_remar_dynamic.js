/**
 * REMAR multi-instance SQLite executable contract.
 * Snapshot copying, scoped equipment identity and lossless export are checked
 * on real node:sqlite, not a mocked in-memory array.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname,'..','..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function load(file,deps,names) {
  const code=read(file).replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+names.join(',')+'};')(...Object.values(deps));
}
const engine=new DatabaseSync(':memory:');
engine.exec('PRAGMA foreign_keys=ON');
engine.exec(`
 CREATE TABLE sites(id TEXT PRIMARY KEY);
 CREATE TABLE _meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE installations(id TEXT PRIMARY KEY,site_id TEXT,actif INTEGER);
 CREATE TABLE visites(id TEXT PRIMARY KEY,site_id TEXT,installation_id TEXT,trame_id TEXT,statut TEXT,date_visite TEXT);
 CREATE TABLE equipements(id TEXT PRIMARY KEY,installation_id TEXT,type_code TEXT,designation TEXT,statut TEXT,cree_le TEXT DEFAULT CURRENT_TIMESTAMP,modifie_le TEXT);
 CREATE TABLE equipement_trames(equipement_id TEXT,trame_id TEXT,actif INTEGER,PRIMARY KEY(equipement_id,trame_id));
 CREATE TABLE materiel(id TEXT PRIMARY KEY,visite_id TEXT,equipement_id TEXT,categorie TEXT,nombre TEXT,designation TEXT,etat TEXT,ajoute_pendant_visite INTEGER);
 CREATE TABLE reseaux_site(id TEXT PRIMARY KEY,installation_id TEXT,actif INTEGER);
`);
const migration=load('database/migrations/049_remar_dynamic_components.js',{},['migration049']).migration049;
assert.equal(migration.version,49);
engine.exec(migration.sql);
const db={
 getFirstAsync:async(q,args=[])=>engine.prepare(q).get(...args)||null,
 getAllAsync:async(q,args=[])=>engine.prepare(q).all(...args),
 runAsync:async(q,args=[])=>engine.prepare(q).run(...args),
 withExclusiveTransactionAsync:async fn=>{
   engine.exec('BEGIN EXCLUSIVE');
   try{const result=await fn(db);engine.exec('COMMIT');return result;}
   catch(e){engine.exec('ROLLBACK');throw e;}
 },
};
let ids=0; const createId=()=>`remar-id-${++ids}`;
const guidance=load('remarFieldGuidance.js',{},
  ['COMPTEURS_REMAR_USUELS','TEMPERATURES_REMAR_USUELLES','MESURES_CTA_REMAR_USUELLES',
   'ETATS_MESURE_REMAR','AVIS_REMAR','classificationFiltre','destinationMesureCTA',
   'commentaireRemarPropose','valeurOfficielleRemar']);
const dao=load('remarDynamicDb.js',{getDb:async()=>db,createId,
 obtenirTrame:id=>({id,familyId:'remar_v1'})},
  ['remarFamilleEquipement','creerRemarEquipement','listerRemarEquipements',
    'creerRemarItem','listerRemarItems','figerItemsRemarPourVisite',
    'enregistrerRemarValeur','listerRemarValeurs','retirerRemarItem',
    'retirerRemarEquipement','choisirRemarEquipementReference',
    'getRemarEquipementReference','lireCtaParcours','choisirCtaParcours']);
const exporter=load('remarDynamicExportDb.js',{
 getDb:async()=>db, listerRemarEquipements:dao.listerRemarEquipements,
 listerRemarItems:dao.listerRemarItems, listerRemarValeurs:dao.listerRemarValeurs,
 getRemarEquipementReference:dao.getRemarEquipementReference,
 destinationMesureCTA:guidance.destinationMesureCTA,
 valeurOfficielleRemar:guidance.valeurOfficielleRemar,
},['construireRemarDynamiquePourRapport']);
const definition=JSON.parse(read('remarTrame.js').match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
let tests=0;const ok=(condition,title)=>{assert.ok(condition,title);tests++;console.log('PASS '+tests+' '+title);};
async function run(){
 ok(guidance.COMPTEURS_REMAR_USUELS.length===4,'4 official meter quick slots, no invented indexes');
 ok(guidance.TEMPERATURES_REMAR_USUELLES.length===7 &&
   guidance.TEMPERATURES_REMAR_USUELLES.includes('Primaire aller') &&
   guidance.TEMPERATURES_REMAR_USUELLES.includes('ECS stockage'),
   '7 primary/heating/DHW temperature slots');
 ok(guidance.MESURES_CTA_REMAR_USUELLES.length===9,'9 usual CTA measurement slots');
 ok(guidance.ETATS_MESURE_REMAR.find(x=>x.code==='N.R')?.label==='Pas vérifié' &&
    guidance.ETATS_MESURE_REMAR.find(x=>x.code==='S.O')?.label==='Sans objet',
    'N.R. and S.O. remain distinct states');
 ok(guidance.classificationFiltre('Filtre F7')==='F7','filter classification distinct from item name');
 ok(guidance.destinationMesureCTA('Vitesse extraction')[0]==='Variation de vitesse',
    'CTA speed mapping has exact official section');
 engine.exec(`
 INSERT INTO sites(id) VALUES('s1'),('s2');
 INSERT INTO installations(id,site_id,actif) VALUES('i1','s1',1),('i2','s1',1);
 INSERT INTO visites(id,site_id,installation_id,trame_id,statut,date_visite)
  VALUES('v1','s1','i1','remar_v1','terminee','2026-10-01'),
        ('v2','s1','i1','remar_v1','en_cours','2026-11-02'),
        ('vOther','s1','i2','remar_v1','en_cours','2026-11-02');
 `);
 // Fixture: earlier finished visit is not editable; start historical creation
 engine.exec("UPDATE visites SET statut='en_cours' WHERE id='v1'");
 const cta=await dao.creerRemarEquipement('v1','cta','CTA des bureaux');
 const filter=await dao.creerRemarItem('v1',{typeCode:'filtre_cta',nom:'Filtre F7',parentEquipementId:cta});
 await dao.enregistrerRemarValeur('v1',{ownerType:'item',ownerId:filter,panelId:'p-remar-filtres',
   sectionCode:'filtre_cta',cle:'Etat du filtre',avis:'N.S',commentaire:'Encrasse'});
 await dao.enregistrerRemarValeur('v1',{ownerType:'equipement',ownerId:cta,panelId:'p-remar-cta',
   sectionCode:'Informations techniques',cle:'Année CTA',valeur:'2019'});
 engine.exec("UPDATE visites SET statut='terminee' WHERE id='v1'");
 ok((await dao.listerRemarEquipements('v1','cta')).length===1,'real shared CTA visible in source visit');
 await assert.rejects(()=>dao.creerRemarEquipement('v2','cta','CTA des bureaux'),/existe deja/);
 ok((await dao.listerRemarEquipements('v2','cta')).length===1,'new visit reuses same local equipment ID, no duplicate');
 await dao.figerItemsRemarPourVisite('v2');
 const child=await dao.listerRemarItems('v2','filtre_cta',cta);
 ok(child.length===1 && child[0].id===filter,'filter snapshot reuses permanent identity');
 const initial=await dao.listerRemarValeurs('v2','item',filter);
 const k='p-remar-filtres||filtre_cta||Etat du filtre';
 ok(initial[k]?.avis==='N.S'&&initial[k]?.inherited===true,
   'latest compatible historical control is prefilled but unconfirmed');
 await dao.enregistrerRemarValeur('v2',{ownerType:'item',ownerId:filter,
   panelId:'p-remar-filtres',sectionCode:'filtre_cta',cle:'Etat du filtre',avis:'S',commentaire:'Propre'});
 const now=await dao.listerRemarValeurs('v2','item',filter);
 ok(now[k].avis==='S'&&!now[k].inherited,'current visit overrides prior control without altering it');
 ok((await dao.listerRemarValeurs('v1','item',filter))[k].avis==='N.S','old observation remains untouched');
 ok((await dao.listerRemarItems('vOther','filtre_cta',cta)).length===0,'other local never sees this filter');
 await dao.enregistrerRemarValeur('v2',{ownerType:'item',ownerId:filter,
   panelId:'p-remar-filtres',sectionCode:'filtre_cta',cle:'Classe de filtration',valeur:'F7'});
 await dao.enregistrerRemarValeur('v2',{ownerType:'item',ownerId:filter,
   panelId:'p-remar-filtres',sectionCode:'filtre_cta',cle:'Etat du filtre',commentaire:'Nettoyé, validé'});
 ok((await dao.listerRemarValeurs('v2','item',filter))[k].avis==='S',
   'comment autosave preserves concurrent opinion (partial patch)');
 const measure=await dao.creerRemarItem('v2',{typeCode:'mesure_cta',
   nom:'Air neuf',parentEquipementId:cta,unite:'°C'});
 await dao.enregistrerRemarValeur('v2',{ownerType:'item',ownerId:measure,
   panelId:'p-remar-cta-mesures',sectionCode:'mesure_cta',cle:'Valeur',avis:'N.R',valeur:null});
 await dao.choisirCtaParcours('v2',cta);
 ok((await dao.lireCtaParcours('v2'))===cta,
   'current CTA remains selected locally across navigation/restart');
 const snapshot=await exporter.construireRemarDynamiquePourRapport('v2',definition);
 ok(snapshot.replacements.get('p-remar-filtres||Filtre n°1||Type de filtre')?.valeur==='F7',
    'filter class F7 exported, not its editable display name');
 ok(snapshot.replacements.get('p-remar-cta-mesures||Températures||Air neuf')?.valeur==='N.R',
   'explicit non-releved CTA measure survives official cell export');

 ok(snapshot.replacements.get('p-remar-filtres||Filtre n°1||Etat du filtre')?.avis==='S',
   'single CTA filter maps to existing official Excel field');
 ok(snapshot.details.some(line=>line[4]===filter),'annex contains stable child ID for reversibility');
 ok(snapshot.details.some(line=>line[4]===measure&&line[10]==='N.R'),
   'measurement status remains identifiable in the detailed annex');
 ok(snapshot.replacements.get('p-remar-cta||Informations techniques||Année CTA')?.valeur==='2019',
   'persistent CTA field is prefilled from historical value');
 const another=await dao.creerRemarEquipement('v2','cta','CTA gymnase');
 const two=await exporter.construireRemarDynamiquePourRapport('v2',definition);
 ok(two.ambiguous.length>0,'multiple CTA block ambiguous implicit report focus');
 await dao.choisirRemarEquipementReference('v2','cta',cta);
 const chosen=await exporter.construireRemarDynamiquePourRapport('v2',definition);
 ok(chosen.ambiguous.length===0,'explicit report focus resolves ambiguity');
 await dao.retirerRemarItem('v2',filter);
 ok((await dao.listerRemarItems('v2','filtre_cta',cta)).length===0,'retired filter disappears from active visit');
 ok((await dao.listerRemarItems('v1','filtre_cta',cta)).length===1,'old visit still shows retired filter');
 await dao.retirerRemarEquipement('v2',another);
 ok(!(await dao.listerRemarEquipements('v2','cta')).some(e=>e.id===another),
   'retired equipment no longer appears in active local list');
 engine.exec("UPDATE visites SET statut='terminee' WHERE id='v2'");
 ok((await dao.listerRemarEquipements('v2','cta')).some(e=>e.id===another),
   'retired equipment remains in closed historical visit inventory');
 const ui=read('TrameGenericPanel.js');
 ok(ui.includes("const { RemarDynamicPanel } = require('./RemarDynamicPanel.js')"),
   'dynamic REMAR is routed without rewriting other trame components');
 ok(read('database/constants.js').includes('DATABASE_SCHEMA_VERSION = 49'),'additive migration version is registered');
 const panel=read('RemarDynamicPanel.js');
 ok(panel.includes('flushDurableAutosaves()')&&panel.includes('useDurableAutosave('),
   'before step navigation and app suspend, save uses durable METRA writer');
 ok(panel.includes('ValidationParCTA')&&panel.includes('NOMS_ETAPES_CTA'),
   'CTA-by-CTA five-step journey exists and has explicit verification');
 const meterUI=read('OptimizedRelevesPanel.js');
 ok(meterUI.includes('COMPTEURS_REMAR_USUELS')&&meterUI.includes('creerCompteurRemarUsuel'),
   'standard meters are rendered as quick slots instead of phantom assets');

 console.log(`${tests} REMAR SQLite/export non-regression tests passed`);
}
run().catch(e=>{console.error(e);process.exitCode=1;});
