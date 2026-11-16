/**
 * Real wire-level integration fixture for the REMAR optional-reading incident
 * (Épicéa: primary supply/return and general cold-water meter). Only Symfony
 * transport is mocked; this exercises the production payload builder and
 * note serialization, not just the internal buildCriteria function.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function load(file,deps,names){
  const code=read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s*\{[^}]+\};?/g,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+names.join(',')+'};')
    (...Object.values(deps));
}
const trame=JSON.parse(read('remarTrame.js')
  .match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
const remoteCategoryName=panel=>panel==='p-infos'
  ?'INFORMATION GÉNÉRALE CHAUFFERIE':panel==='p-remar-froid'
    ?'INFORMATION GÉNÉRALE PRODUCTION FROID':trame.ui.labels?.[panel]||panel;
let catId=20,subId=100,criterionId=500;
const remote={
  id:92,nom:'TRAME REMAR CLASSIQUE',
  categories:Object.entries(trame.ui.panels).map(([panel,sections])=>({
    id:catId++,nom:remoteCategoryName(panel),
    sousCategories:Object.entries(sections).map(([section,fields])=>({
      id:subId++,nom:section,
      criteres:fields.map(f=>({id:criterionId++,nom:f.cle,avisApplicable:f.type==='controle'})),
    })),
  })),
};
const source={
  sourceType:'preparation_visite',trame:remote,materiels:[],
  site:{id:41,nom:'Épicéa'},derniereVisite:{id:800,date:'2026-11-01'},
};
const visit={id:'epicea',site_id:'site1',installation_id:'local1',
  trame_id:'remar_v1',statut:'terminee',date_visite:'2026-11-16',
  api_remote_local_id:'110',api_remote_client_id:'40',api_remote_trame_id:'92',
  api_source_remote_visit_id:'800',client_id:'c1'};
const tempDetail=(id,name,value,avis='',commentaire='')=>[
  'chaufferie','','',name,id,'temperature_chaufferie',
  'p-remar-releves','temperature_chaufferie','Valeur',
  value,avis,commentaire,'','Visite courante','°C',
];
let projection={
  hasDynamic:true,familyCounts:{cta:0,vmc:0,froid:0},temperaturesCount:2,
  replacements:new Map(),ambiguous:[],unsupported:[],
  details:[
    tempDetail('temp-in','Primaire aller','70'),
    tempDetail('temp-out','Primaire retour','58','N.R','Mesure à reprendre'),
  ],
};
let meters=[{id:'water-1',label:'Compteur eau froide générale',unite:'m³',
  valeur:'125',destination:'supplementaire'}];
const db={
  getFirstAsync:async sql=>{
    if(sql.includes('FROM visites v JOIN sites'))return visit;
    if(sql.includes('FROM notes'))return {contenu:'Observation terrain conservée'};
    return null;
  },
  getAllAsync:async sql=>{
    if(sql.includes('FROM provenances')&&sql.includes('JOIN reseaux'))return [];
    if(sql.includes('FROM provenances'))
      return [{details_json:JSON.stringify(source),reference_externe:'110',importe_le:'2026-11-16'}];
    if(sql.includes('FROM compteurs'))return meters;
    if(sql.includes('FROM champs_visite')||sql.includes('FROM controles_visite')||
       sql.includes('FROM reseaux')||sql.includes('FROM materiel')||
       sql.includes('FROM remarques')||sql.includes('FROM points_mesure_visite'))
      return [];
    throw new Error('Unhandled SQL '+sql);
  },
};
const aliases=load('intranetStorageAliases.js',{},['candidateSectionCodes','resolveAliasValue']);
const mapping=load('remarSymfonyCompleteContract.js',{},
  ['remarMappingsForRemote','isRemarCompleteTrame']);
const exportTools=load('remarDynamicExportDb.js',{},['remarDynamicOwnsMapping']);
const multiline=load('releveMultiligne.js',{pictoTemperature:()=>({})},
  ['formaterReleves','formaterTemperatureGroupee']);
const serializer=load('intranetVisitPayload.js',{
  getDb:async()=>db,obtenirTrame:()=>trame,
  construireRemarDynamiquePourRapport:async()=>projection,
  remarDynamicOwnsMapping:exportTools.remarDynamicOwnsMapping,
  remarMappingsForRemote:mapping.remarMappingsForRemote,
  isRemarCompleteTrame:mapping.isRemarCompleteTrame,
  formaterReleves:multiline.formaterReleves,
  formaterTemperatureGroupee:multiline.formaterTemperatureGroupee,
  candidateStorageCodes:aliases.candidateSectionCodes,
  candidateStoredValue:aliases.resolveAliasValue,
},['buildIntranetVisitPayload','inspectIntranetVisitWirePayload']);
const envoi='c1b4a9e8-21b7-40a5-83b7-1e12b2ce7619';
(async()=>{
  const output=await serializer.buildIntranetVisitPayload('epicea',envoi);
  const wire=serializer.inspectIntranetVisitWirePayload(output.serialized).parsed.visites[0];
  assert.equal(wire.criteres.length,141,'all official criteria must remain');
  assert.equal(wire.notes.length,4,'one user note plus three distinct extra readings');
  assert.equal(wire.notes[0].contenu,'Observation terrain conservée');
  assert.equal(output.summary.remarSupplementalReadingsInNotes,3);
  assert.equal(output.summary.freeTextInVisitNotes,3);
  for(const [id,name,value,unit] of [
    ['temp-in','Primaire aller','70','°C'],
    ['temp-out','Primaire retour','58','°C'],
    ['water-1','Compteur eau froide générale','125','m³'],
  ]){
    const found=wire.notes.find(n=>n.contenu.includes('ID METRA : '+id));
    assert.ok(found,'separate note with METRA identity '+id);
    assert.ok(found.contenu.includes('Nom : '+name),'measure name '+name);
    assert.ok(found.contenu.includes('Valeur : '+value),'unaltered value '+value);
    assert.ok(found.contenu.includes('Unité : '+unit),'unaltered unit '+unit);
    assert.ok(found.contenu.includes('hors critère Symfony officiel'),
      'source clearly marked as complementary');
  }
  assert.ok(wire.notes.find(n=>n.contenu.includes('temp-out')).contenu.includes('Avis : N.R'));
  assert.ok(wire.notes.find(n=>n.contenu.includes('temp-out')).contenu.includes('Mesure à reprendre'));
  assert.ok(wire.notes.every(note=>note.contenu.length<=1000),'note size bound respected');
  assert.ok(wire.criteres.every(c=>!/(^|\n)(70 °C|58 °C|125 m³)/.test(c.commentaire)),
    'no false wiring into heating, ECS or other official criterion');
  const replay=await serializer.buildIntranetVisitPayload('epicea',envoi);
  assert.equal(replay.serialized,output.serialized,'identical payload on preview and replay');
  // No current observation must not generate a fictitious note.
  projection={...projection,details:projection.details.map(row=>
    [...row.slice(0,9),'','','',...row.slice(12)])};
  meters=[{...meters[0],valeur:''}];
  const blank=await serializer.buildIntranetVisitPayload('epicea',envoi);
  assert.equal(blank.summary.remarSupplementalReadingsInNotes,0);
  assert.equal(blank.payload.visites[0].notes.length,1);
  console.log('PASS complete REMAR V1 wire notes, 3 supplemental readings, no false destinations, replay and empty semantics');
})().catch(e=>{console.error(e);process.exitCode=1;});
