/**
 * RCU regression : 3 réseaux de chaleur sans sous-catégorie réseau Symfony
 * doivent être conservés en notes, sans inventer d'association de critères.
 * Teste le vrai buildCriteria du sérialiseur, sans serveur de production.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root,'intranetVisitPayload.js'),'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const definitions = {
  rcu: {
    id:'reseau_chaleur_v1',
    ui: {specialPanels:['p-regulation'],panels:{
      'p-infos': {'Informations générales':[{cle:'Nom du site',type:'champ'}]},
      'p-regulation': {}
    }},
    excel:{networks:{exportOffsets:{t_ext_c:0,nom_reseau:2}},
      heatNetwork:{summaryRows:{Primaire:{P2:362},Secondaire:{P2:373}}}}
  },
  icpe: {
    id:'icpe_v1',
    ui:{specialPanels:['p-regulation'],panels:{
      'p-infos': {'Informations générales':[{cle:'Nom du site',type:'champ'}]}
    }},
    excel:{networks:{exportOffsets:{t_ext_c:0,nom_reseau:2}}}
  },
};
let definition=definitions.rcu;
const mocks={
  obtenirTrame:()=>definition,
  candidateStorageCodes:(_def,panel,section)=>[panel.replace('p-','')+'.'+section.toLowerCase().replace(/[^a-z0-9]+/g,'_')],
  candidateStoredValue:(store,candidate)=>store.get(candidate.sectionCode+'||'+candidate.cle) || null,
  formaterReleves:x=>String(x||''),
  formaterTemperatureGroupee:(_k,v)=>v,
};
const core = new Function(...Object.keys(mocks),source+
  '\nreturn {buildCriteria,mapNetworksToRemoteGroups,archiverReseauxRcuSansDestination};')(...Object.values(mocks));
const sourceNetworks=[
  {id:'nr1',ordre:1,nom_reseau:'Réseau 1',t_ext_c:'-2',t_dep_c:'75',tnc:'22',courbe_de_chauffe:'1,5',consigne_programme_horaire:'6h-22h'},
  {id:'nr2',ordre:2,nom_reseau:'Réseau 2',t_ext_c:'3',t_dep_c:'60',tnc:'17',courbe_de_chauffe:'1,2',consigne_programme_horaire:'24h/24'},
  {id:'nr3',ordre:3,nom_reseau:'Réseau 3',t_ext_c:'5',t_dep_c:'50',tnc:'19',courbe_de_chauffe:'0,8',consigne_programme_horaire:'Automatique'},
];
let networks=sourceNetworks.map(n=>({...n}));
const db={
 async getAllAsync(sql){
   if(sql.includes('FROM champs_visite'))return [{section_code:'infos.informations_g_n_rales',cle:'Nom du site',valeur:'SITE A'}];
   if(sql.includes('FROM controles_visite'))return [];
   if(sql.includes('FROM reseaux WHERE'))return networks;
   if(sql.includes('FROM compteurs WHERE'))return [];
   if(sql.includes('FROM provenances p'))return [];
   if(sql.includes('FROM points_mesure_visite'))return [];
   if(sql.includes('FROM remarques WHERE'))return [];
   throw new Error('Unexpected SQL: '+sql);
 }
};
const general={id:'10',nom:'Informations',sousCategories:[{
 id:'20',nom:'Informations générales',criteres:[
   {id:'100',nom:'Nom du site',avisApplicable:false}
 ]}]};
const oneNetwork={id:'11',nom:'Régulation',sousCategories:[{
 id:'21',nom:'Réseau n°1',criteres:[
   {id:'101',nom:'T ext °C',avisApplicable:false},
   {id:'102',nom:'T dep °C',avisApplicable:false}
 ]}]};
const visit={id:'visit-rcu',trame_id:'reseau_chaleur_v1'};
const issues=()=>Object.assign([], {freeTextFallbacks:[]});
(async()=>{
  // Scénario réel signalé : 3 réseaux METRA, aucune branche réseau Symfony.
  const err=issues();
  const result=await core.buildCriteria(db,visit,{trame:{categories:[general]}},err);
  assert.equal(err.length,0,err.join('\n'));
  assert.equal(result.length,1);
  assert.equal(result[0].commentaire,'SITE A');
  assert.equal(err.freeTextFallbacks.length,3);
  for(const [i,record] of sourceNetworks.entries()){
    const note=err.freeTextFallbacks[i];
    assert.match(note.path,/non rattaché/);
    assert.ok(note.value.includes(record.nom_reseau), 'network identity preserved');
    for(const val of [record.t_ext_c,record.t_dep_c,record.tnc,record.courbe_de_chauffe,record.consigne_programme_horaire])
      assert.ok(note.value.includes(val), 'all measurements preserved: '+val);
  }
  assert.deepEqual(networks,sourceNetworks,'no SQLite row mutation');

  // Le groupe 1 est identifiable ; seules ses valeurs hors contrat et les
  // réseaux 2/3 sont archivés, aucun réseau 2/3 recopié dans le groupe 1.
  const partial=issues();
  const withOne=await core.buildCriteria(db,visit,{trame:{categories:[general,oneNetwork]}},partial);
  assert.equal(partial.length,0,partial.join('\n'));
  assert.equal(withOne.length,3);
  assert.equal(withOne[1].commentaire,'-2');
  assert.equal(withOne[2].commentaire,'75');
  assert.equal(partial.freeTextFallbacks.length,3);
  assert.ok(partial.freeTextFallbacks[0].path.includes('champs non couverts'));
  assert.ok(!partial.freeTextFallbacks[0].value.includes('Température départ (°C) : 75'));
  assert.ok(partial.freeTextFallbacks.slice(1).every(x=>x.path.includes('non rattaché')));

  // Ambiguïté de noms : aucune attribution en fonction du simple ordre.
  networks=sourceNetworks.map((n,i)=>({...n,nom_reseau:i<2?'Réseau 1':n.nom_reseau}));
  const ambiguous=issues();
  const ambiguResult=await core.buildCriteria(db,visit,{trame:{categories:[general,oneNetwork]}},ambiguous);
  assert.equal(ambiguous.length,0,ambiguous.join('\n'));
  assert.equal(ambiguResult[1].commentaire,'/');
  assert.equal(ambiguous.freeTextFallbacks.length,4);
  assert.ok(ambiguous.freeTextFallbacks.some(x=>x.path.includes('ambiguïtés')));
  assert.ok(ambiguous.freeTextFallbacks.some(x=>x.value.includes('Réseau local 2')));

  // ICPE inchangé : sans groupe distant officiel, le refus demeure.
  definition=definitions.icpe;
  const strict=issues();
  await core.buildCriteria(db,{...visit,trame_id:'icpe_v1'},{trame:{categories:[general]}},strict);
  assert.ok(strict.some(x=>x.includes('ne peuvent pas être rattachés')));

  // Aucun canal de sauvegarde = blocage conservatoire, pas de perte.
  const noArchive=[];
  core.archiverReseauxRcuSansDestination(sourceNetworks,[],new Map(),[],noArchive);
  assert.equal(noArchive.length,3);
  console.log('RCU: 3 réseaux conservés; matching sûr, champs partiels, collision et ICPE : OK');
})().catch(e=>{console.error(e);process.exitCode=1});
