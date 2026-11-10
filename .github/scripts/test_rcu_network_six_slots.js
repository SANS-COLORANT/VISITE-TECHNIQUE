/** RCU integration: exact production serializer against real normalized Symfony-shaped trames. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../intranetVisitPayload.js'),'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const local={
 id:'reseau_chaleur_v1',
 ui:{specialPanels:['p-regulation'],panels:{
   'p-infos':{'Informations générales':[{cle:'Nom du site',type:'champ'}]},
   'p-regulation':{}
 }},
 excel:{networks:{starts:[91,101,111,121,131,141],exportOffsets:{t_ext_c:0,nom_reseau:2}},
   heatNetwork:{summaryRows:{Primaire:{P2:362},Secondaire:{P2:373}}}}
};
const networks=Array.from({length:8},(_,i)=>({
  id:'n'+(i+1),ordre:i+1,nom_reseau:'Chauffage bâtiment '+(i+1),
  t_ext_c:String(-2+i),t_dep_c:String(60+i),
  courbe_de_chauffe:'1.'+i,tnc:String(20+i),
  consigne_programme_horaire:'6h-'+(19+i)+'h'
}));
let count=3, trame=local;
const db={async getAllAsync(sql){
 if(sql.includes('FROM champs_visite'))return [{section_code:'infos.informations_g_n_rales',cle:'Nom du site',valeur:'Site A'}];
 if(sql.includes('FROM controles_visite'))return [];
 if(sql.includes('FROM reseaux WHERE'))return networks.slice(0,count);
 if(sql.includes('FROM compteurs WHERE'))return [];
 if(sql.includes('FROM provenances p'))return [];
 if(sql.includes('FROM points_mesure_visite'))return [];
 if(sql.includes('FROM remarques WHERE'))return [];
 throw Error('SQL inconnu '+sql);
}};
const mocks={obtenirTrame:()=>trame,
 candidateStorageCodes:(_d,p,s)=>[p.replace('p-','')+'.'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_')],
 candidateStoredValue:(store,c)=>store.get(c.sectionCode+'||'+c.cle)||null,
 formaterReleves:v=>String(v||''),formaterTemperatureGroupee:(_k,v)=>v};
const api=new Function(...Object.keys(mocks),source+
 '\nreturn {buildCriteria};')(...Object.values(mocks));
const general={id:'10',nom:'Informations',sousCategories:[
 {id:'20',nom:'Informations générales',criteres:[{id:'100',nom:'Nom du site',avisApplicable:false}]}]};
const fields=['Nom réseau','T ext °C','T dep °C','Courbe de chauffe','TNC','Consigne et programme horaire'];
const grouped={id:'11',nom:'Régulation',sousCategories:Array.from({length:6},(_,i)=>({
 id:String(21+i),nom:'Réseau n°'+(i+1),
 criteres:fields.map((nom,j)=>({id:String(200+i*10+j),nom,avisApplicable:false}))
}))};
const flat={id:'12',nom:'Régulation',sousCategories:[{
 id:'30',nom:'Réseaux',criteres:Array.from({length:6},(_,i)=>({
   id:String(300+i),nom:'Réseau '+(i+1),avisApplicable:false
 }))
}]};
const visite={id:'visit',trame_id:'reseau_chaleur_v1'};
const freshIssues=()=>Object.assign([], {freeTextFallbacks:[]});
const run=async categories=>{
 const issues=freshIssues();
 const result=await api.buildCriteria(db,visite,{trame:{categories}},issues);
 return {issues,result};
};
(async()=>{
 let out=await run([general,grouped]);
 assert.equal(out.issues.length,0,out.issues.join('\n'));
 assert.equal(out.issues.freeTextFallbacks.length,0);
 assert.equal(out.result.length,37);
 for(let i=0;i<3;i++){
   const start=1+i*6;
   assert.equal(out.result[start].commentaire,networks[i].nom_reseau);
   assert.equal(out.result[start+1].commentaire,networks[i].t_ext_c);
   assert.equal(out.result[start+2].commentaire,networks[i].t_dep_c);
 }
 assert.equal(out.result[1+3*6].commentaire,'/','slot 4 unused');
 out=await run([general,flat]);
 assert.equal(out.issues.length,0,out.issues.join('\n'));
 assert.equal(out.result.length,7);
 for(let i=0;i<3;i++){
   assert.match(out.result[i+1].commentaire,new RegExp('Réseau '+(i+1)+' : Chauffage bâtiment '+(i+1)));
   assert.ok(out.result[i+1].commentaire.includes('Courbe de chauffe : 1.'+i));
 }
 assert.equal(out.result[4].commentaire,'/','unused flat slot');
 count=8;
 out=await run([general,flat]);
 assert.equal(out.issues.length,0,out.issues.join('\n'));
 assert.equal(out.result.length,7);
 for(let n of [6,7,8]) assert.ok(out.result[6].commentaire.includes('Réseau '+n+' : Chauffage bâtiment '+n));
 assert.ok(out.result[6].commentaire.includes('\n\n'));
 out=await run([general,grouped]);
 assert.equal(out.issues.length,0,out.issues.join('\n'));
 const sixth=1+5*6;
 for(let n of [6,7,8]){
   assert.ok(out.result[sixth].commentaire.includes('Réseau '+n+' (Chauffage bâtiment '+n+')'));
   assert.ok(out.result[sixth+2].commentaire.includes('Réseau '+n+' (Chauffage bâtiment '+n+')'));
 }
 count=3;
 out=await run([general]);
 assert.equal(out.issues.length,1,'no server cases must not invent a triplet');
 assert.match(out.issues[0],/aucune/);
 assert.equal(out.issues.freeTextFallbacks.length,0,'no network diverted to notes');
 trame={...local,id:'icpe_v1',excel:{networks:{exportOffsets:{nom_reseau:2}}}};
 out=await run([general]);
 assert.ok(out.issues.some(x=>/ne peuvent pas être rattachés/.test(x)),'non-RCU safety unchanged');
 console.log('RCU: 3/6 numbered groups, flat criteria, >6 grouped in slot 6, missing server slots, ICPE OK');
})().catch(e=>{console.error(e);process.exitCode=1});
