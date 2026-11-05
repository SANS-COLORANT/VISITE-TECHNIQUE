/**
 * Lot 06 / build >= 869: executable source regressions without user SQLite.
 * Pure Node fixtures exercise report data projections, photo conversion failure,
 * Word signature media, Excel limits and partial group exports.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const source=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const tests=[];
function test(name,fn){tests.push({name,fn});}
function body(file,start,end){
  const code=source(file),a=code.indexOf(start),b=code.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'cannot extract '+file+' '+start);
  return code.slice(a,b).replace(/^export /,'');
}
function loaded(file,start,end,symbol,deps){
  return new Function(...Object.keys(deps),body(file,start,end)+'\nreturn '+symbol+';')(...Object.values(deps));
}
const esc=(v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dateFr=(v)=>{const a=String(v||'').slice(0,10).split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:String(v||'');};
const network=new Function(source('networkProgramming.js').replace(/^export /gm,'')+
  '\nreturn {networkTemperatureSeries,validateWeeklySchedule,formatWeeklySchedule};')();
function reportFixture({trame,model=null,controls=[],networks=[],points=[],dynamic=null,programmed=new Map()}){
  const getDb=async()=>({
    getFirstAsync:async(sql)=>{
      if(sql.includes('FROM visites v'))return {id:'v',site_id:'s',client_id:'c',installation_id:'i',
        trame_id:trame.id,nom_site:'Site',nom_client:'Client',nom_local_db:'Local',date_visite:'2026-11-05'};
      return null;
    },
    getAllAsync:async(sql)=>{
      if(sql.includes('FROM champs_visite'))return [{section_code:'pa.test',cle:'Champ PA',valeur:'PA_OK'}];
      if(sql.includes('FROM controles_visite'))return controls;
      if(sql.includes('FROM reseaux'))return networks;
      if(sql.includes('FROM points_mesure_visite'))return points;
      return [];
    },
  });
  const deps={
    PA_REPORT_ORDER:['p-pa-infos','p-pa-batiments','p-pa-compteurs','p-pa-regulation','p-pa-chaufferie','p-pa-sst','p-pa-conclusion'],
    REPORT_SECTION_META:{},
    getDb,listerMateriel:async()=>[],obtenirTrame:()=>trame,DEFAULT_TRAME_ID:'icpe_v1',
    chargerPreAllumageModulaire:async()=>model,listerAliasesPreAllumage:async()=>({}),
    lireContextePhotosRemar:async()=>null,construireRemarDynamiquePourRapport:async()=>dynamic,
    normaliserSectionCode:(p,s)=>p.replace('p-','')+'.'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_'),
    remarDynamicOwnsMapping:(mapping,projection)=>Boolean(projection?.hasDynamic&&
      projection.familyCounts?.cta&&mapping.panelId==='p-remar-cta'),
    readNetworkProgrammingForVisit:async()=>programmed,...network,
    titreLocalDepuisChamps:()=>'',typeLocalDepuisChamps:()=>'',titreSectionRapport:(p,l)=>l||p,
    court:(v)=>String(v||''),formaterReleves:()=>'', 
  };
  return loaded('reportBuilder.js','export async function chargerDonneesVisiteRapport','function libelleReserveCourt','chargerDonneesVisiteRapport',deps);
}
test('R04: seven PA sections survive simplified UI navigation',async()=>{
 const panels=['p-pa-infos','p-pa-batiments','p-pa-compteurs','p-pa-regulation',
 'p-pa-chaufferie','p-pa-sst','p-pa-conclusion'];
 const trame={id:'pre_allumage',ui:{tabOrder:[panels[0],panels[1],panels[6]],
   panels:{},labels:Object.fromEntries(panels.map(x=>[x,x]))}};
 const model={locaux:[{id:'L',nom:'SST A'}],rubriques:panels.map((panel_id,i)=>({
  panel_id,section_code:'pa.test',nom:'Rubrique '+i,local_id:'L',
  champs:[{cle_stockage:'Champ PA',libelle:'Sentinelle '+i,type_code:'champ'}]}))};
 const report=await reportFixture({trame,model})('v');
 assert.deepEqual(report.sections.map(s=>s.panelId),panels);
 assert.equal(report.sections.flatMap(s=>s.groups).length,7);
 assert.ok(report.sections[2].groups[0].rows.some(x=>x.comment==='PA_OK'));
});
test('R05: dynamic REMAR owner prevents stale legacy N.S in document',async()=>{
 const trame={id:'remar_v1',familyId:'remar_v1',ui:{tabOrder:['p-remar-cta'],
  panels:{'p-remar-cta':{'Avis CTA':[{type:'controle',cle:'Eclairage du caisson'}]}}}};
 const controls=[{section_code:'remar-cta.avis_cta',cle:'Eclairage du caisson',avis:'N.S',commentaire:'LEGACY'}];
 const dynamique={hasDynamic:true,familyCounts:{cta:1},replacements:new Map(),details:[]};
 const current=await reportFixture({trame,controls,dynamic:dynamique})('v');
 assert.equal(current.sections[0].groups[0].rows.length,0);
 const old=await reportFixture({trame,controls,dynamic:{hasDynamic:false,replacements:new Map(),details:[]}})('v');
 assert.equal(old.sections[0].groups[0].rows[0].avis,'N.S');
});
test('R02: current network series and measurements override stale legacy',async()=>{
 const trame={id:'icpe_v1',ui:{tabOrder:['p-regulation','p-releves'],panels:{}}};
 const schedule={allDays:true,days:{Lun:[{start:'08:00',end:'18:00',comfort:'20',reduced:'16'}]}};
 const programmed=new Map([['n1',{points:[{ext:'-7',dep:'70'},{ext:'12',dep:'40'}],schedule}]]);
 const ds=await reportFixture({trame,networks:[{id:'n1',nom_reseau:'Réseau A',t_ext_c:'OLD',t_dep_c:'OLD'}],
  programmed,points:[{id:'m1',libelle:'Pression',valeur:'0',unite:'bar'}]})('v');
 assert.equal(ds.reseaux[0].t_ext_c,'-7\n12');
 assert.equal(ds.reseaux[0].t_dep_c,'70\n40');
 assert.ok(ds.reseaux[0].consigne_programme_horaire.includes('Tous les jours'));
 assert.ok(ds.sections.find(s=>s.panelId==='p-mesures-complementaires').groups[0].rows[0].comment==='0 bar');
});
test('R03: missing included photo fails before declaring report complete',async()=>{
 const fn=loaded('reportBuilder.js','async function photosHtml','async function siteHtml','photosHtml',{
  imageRapportBase64:async uri=>uri==='missing'?null:'data:image/jpeg;base64,AAAA',
  chunk:(arr,n)=>{const r=[];for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n));return r;},esc,
 });
 const data={visite:{id:'v'}},config={photos:true};
 await assert.rejects(fn(data,config,[{id:'a',uri:'missing',visiteId:'v',include:true},
  {id:'b',uri:'ok',visiteId:'v',include:true}], 'pdf'),/photo\(s\) sélectionnée\(s\) illisible\(s\)/);
 const html=await fn(data,config,[{id:'b',uri:'ok',visiteId:'v',include:true}], 'pdf');
 assert.ok(html.includes('data-photo-id="b"'));
});
test('R06: Word signature is a real PNG stroke rather than blank block',()=>{
 const raster=new Function(source('signatureReportPng.js').replace('export function','function')+
  '\nreturn signaturePngDataUri;')();
 const uri=raster({w:320,h:180,paths:['M10 10 L100 60 L250 80']});
 assert.ok(uri.startsWith('data:image/png;base64,'));
 const png=Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),400);
 const htmlSignature=loaded('visitSignature.js','export function signatureHtml','export function SignatureSheet','signatureHtml',{esc,signaturePngDataUri:raster});
 const word=htmlSignature({paths:['M0 0 L10 10'],w:320,h:180,nom:'Client'}, {output:'word'});
 assert.ok(word.includes('data:image/png;base64,'));
 assert.ok(!word.includes('Tracé de signature non reproductible'));
});
test('R09: reserve date respects Intranet business date',()=>{
 const reserves=loaded('reportBuilder.js','function reservesHtml','function notesHtml','reservesHtml',{esc,dateFr});
 const html=reserves({remarques:[{poste:'Chauffage',prestation:'P2',intranet_date_reserve:'2020-03-04',cree_le:'2026-11-05'}]}, {remarques:true});
 assert.ok(html.includes('04/03/2020'));assert.ok(!html.includes('05/11/2026'));
});
test('R10: 600 Excel rows imported; explicit failure beyond safety bound',()=>{
 const XLSX={utils:{decode_range:ref=>({e:{r:Number(ref.split(':').at(-1).replace(/^[A-Z]+/,''))-1}})}};
 const table=loaded('excelImport.js','const MAX_IMPORT_TABLE_ROWS','function infererPerimetreReserveReseau','lireTable',{
  XLSX,valeurCellule:(_sheet,ref)=>{const row=Number(ref.match(/\d+/)?.[0]||0);return ref.startsWith('A')&&row>=4&&row<=603?'Equipement '+(row-4):'';}
 });
 const rows=table({'!ref':'A1:J603'},{startRow:4,maxImportRow:500,columns:[['A','designation']]});
 assert.equal(rows.length,600);assert.equal(rows.at(-1).designation,'Equipement 599');
 assert.throws(()=>table({'!ref':'A1:J22000'},{startRow:4,columns:[['A','designation']]}),/import refusé sans troncature/);
});
test('R11: failed SAF write cleans ONLY newly created document',async()=>{
 const removed=[];
 const fn=loaded('metraStorage.js','export async function creerFichierSaf','export { nettoyerSegment }','creerFichierSaf',{
  FileSystem:{StorageAccessFramework:{createFileAsync:async()=> 'content://new'},
   writeAsStringAsync:async()=>{throw Error('Full');},
   deleteAsync:async uri=>{removed.push(uri);},EncodingType:{Base64:'base64'}},
  nettoyerSegment:v=>v,
 });
 await assert.rejects(fn('dir','rapport.pdf','application/pdf','AA'),/Écriture du nouvel export METRA interrompue/);
 assert.deepEqual(removed,['content://new']);
});
test('R12/R13: second-site failure preserves first success and chosen second-local cover',async()=>{
 const fn=loaded('reportEditorExporter.js','export async function exporterRapportsParSiteEdites',
   'export async function exporterRapportsParLocalEdites','exporterRapportsParSiteEdites',{
   dossierRapportsClientMetra:async()=> 'folderClient',
   dossierRapportsSiteMetra:async()=> 'folderSite',
   choisirDossier:async()=> 'manual',
   exporterRapportEdite:async p=>p.datas[0].visite.site_id==='B'
    ?Promise.reject(Error('panne B')):({format:'pdf',nom:'A.pdf',cover:p.config.coverUri}),
  });
 const visit=(id,site_id)=>({visite:{id,site_id,client_id:'C',nom_client:'Client',nom_site:site_id}});
 const results=await fn({datas:[visit('v1','A'),visit('v2','A'),visit('v3','B')],
  config:{coverVisiteId:'v2',coverUri:'photo-v2'},photosConfig:[],format:'pdf'});
 assert.equal(results.resultats.length,1);assert.equal(results.resultats[0].cover,'photo-v2');
 assert.equal(results.erreurs.length,1);assert.deepEqual(results.erreurs[0].visiteIds,['v3']);
});
test('R16: opted-out photo labels and internal filenames absent from Excel',()=>{
 const added=[];
 const fn=loaded('excelExport.js','function exporterAnnexesDynamiques','function exporterCompteursDynamiques','exporterAnnexesDynamiques',{
  modulesDynamiques:()=>({meters:true,networks:false}),
  ajouterAnnexeDynamique:(_wb,_name,_headers,rows)=>added.push(rows),
 });
 fn({}, {}, [],[{id:'c1',label:'Gaz'}],[
  {entite_key:'compteur||c1',label:'SECRET||raw.jpg',inclure_export:0},
  {entite_key:'compteur||c1',label:'Visible||filename.jpg',inclure_export:1},
 ]);
 assert.equal(added[0][0][5],'Visible');
});
test('R15: specialized PA annexes include reservations/photos/signature',()=>{
 const pa=loaded('preAllumageReportHtml.js','export function construireAnnexesPreAllumageHtml',
   'export function construireSitePreAllumageHtml','construireAnnexesPreAllumageHtml',{esc,dateFr});
 const html=pa({remarques:[{poste:'CHA',prestation:'Correction',intranet_date_reserve:'2020-03-04'}]},
  [{id:'p1',src:'data:image/jpeg;base64,AAAA',label:'Photo 1'}],'<div>SIGNATURE</div>');
 assert.ok(html.includes('04/03/2020')&&html.includes('data-photo-id="p1"')&&html.includes('SIGNATURE'));
 assert.ok(!html.includes('PHOTO_EXCLUE'));
});
test('R17: normalized homonyms have distinct report destinations',()=>{
 const fn=loaded('metraStorage.js','function segmentRapportAvecId','export async function dossierRapportsClientMetra','segmentRapportAvecId',{
  nettoyerSegment:v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().slice(0,80),
 });
 assert.notEqual(fn('Résidence Étoile','Client','c1'),fn('Residence Etoile','Client','c2'));
 assert.equal(fn('Résidence Étoile','Client'), 'Residence Etoile');
});
test('R20: one missing child makes recursive Mission folder copy fail',async()=>{
 const copied=[];
 const FileSystem={
  getInfoAsync:async(uri)=>({exists:uri!=='src/b',isDirectory:uri==='src'}),
  makeDirectoryAsync:async()=>{},readDirectoryAsync:async()=>['a','b'],
  copyAsync:async({from})=>{copied.push(from);},
 };
 const fn=loaded('missionPackageExport.js','async function copyPath','export const DEFAULT_MISSION_PACKAGE_OPTIONS','copyPath',{FileSystem});
 assert.equal(await fn('src','dst'),false);
 assert.deepEqual(copied,['src/a']);
});
test('Other Lot06 contracts: reserve cols, opt-in notes, PDF fallback, preview fragments and Mission durability',()=>{
 const registry=source('trameRegistry.js'),report=source('ReportScreen.js'),builder=source('reportBuilder.js');
 assert.ok(registry.includes("['E', 'intranet_etat_avancement']"));
 assert.ok(report.includes('setInclureNotes')&&report.includes("notes:inclureNotes"));
 assert.ok(builder.includes('config.notes !== true'));
 assert.ok(source('reportEditorExporter.js').includes('return uriSource;'));
 assert.ok(source('visitReportPreview.js').includes('preparerApercuPdfFragmente'));
 const missions=source('missionReportExporter.js');
 assert.ok(missions.includes('durableMissionFolder')&&missions.includes('verifierFichierMission(uri)'));
 const missionPackage=source('missionPackageExport.js');
 assert.ok(missionPackage.includes('if (!copied) return false'));
 assert.ok(missionPackage.includes('Paquet Mission incomplet'));
});
(async()=>{
 for(const entry of tests){
  try {await entry.fn();console.log('PASS '+entry.name);}
  catch(error){console.error('FAIL '+entry.name, error);process.exitCode=1;return;}
 }
 console.log('LOT 06: '+tests.length+' source-derived and isolated executable checks succeeded.');
})().catch(error=>{console.error(error);process.exitCode=1;});
