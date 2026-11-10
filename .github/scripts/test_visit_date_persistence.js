const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=fs.readFileSync(path.resolve(__dirname,'../../visitDateDb.js'),'utf8');
const script=file.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?function\s)/g,'');
let visite={id:'v',site_id:'site',installation_id:'local',date_visite:'2026-11-01'};
const champ=new Map(),actions=[];
const db={
  async getFirstAsync(sql,args){return sql.includes('FROM visites')&&args[0]==='v'?{...visite}:null},
  async runAsync(sql,args){
    if(sql.includes('INSERT INTO champs_visite'))champ.set(args[1]+'||'+args[2],args[3]);
    else if(sql.includes('UPDATE champs_visite'))for(const key of champ.keys()){
      if(key.endsWith('||Date de visite')||key.endsWith('||Date de la visite'))champ.set(key,args[0]);
    }
    else if(sql.includes('UPDATE visites'))visite.date_visite=args[0];
    else throw Error('SQL inattendu: '+sql);
  },
  async withTransactionAsync(fn){actions.push('BEGIN');await fn();actions.push('COMMIT')},
};
const mocks={
 getDb:async()=>db,canonicalKnownCode:s=>s,
 invalidateLocalVisits:(...a)=>actions.push(['local',...a]),
 invalidateSiteLocals:(...a)=>actions.push(['site',...a]),
 markVisitHot:(...a)=>actions.push(['hot',...a]),
};
const {estChampDateVisite,dateVisiteIso,enregistrerDateVisite}=
  new Function(...Object.keys(mocks),script+'\nreturn {estChampDateVisite,dateVisiteIso,enregistrerDateVisite};')(...Object.values(mocks));
assert.equal(estChampDateVisite('Date de visite'),true);
assert.equal(estChampDateVisite('Date de contrôle'),false);
assert.equal(dateVisiteIso('29/02/2024'),'2024-02-29');
assert.equal(dateVisiteIso('29/02/2025'),null);
assert.equal(dateVisiteIso('2026-02-30'),null);
(async()=>{
  await enregistrerDateVisite('v','infos.g_n_ral','Date de visite','15/11/2026');
  assert.equal(visite.date_visite,'2026-11-15');
  assert.equal(champ.get('infos.g_n_ral||Date de visite'),'15/11/2026');
  assert.ok(actions.some(a=>Array.isArray(a)&&a[0]==='local'&&a[2]==='local'));
  assert.ok(actions.some(a=>Array.isArray(a)&&a[0]==='site'&&a[1]==='site'));
  assert.ok(actions.some(a=>Array.isArray(a)&&a[0]==='hot'&&a[2].preview.date_visite==='2026-11-15'));
  await assert.rejects(()=>enregistrerDateVisite('v','infos.g_n_ral','Date de visite','30/02/2026'),/invalide/);
  assert.equal(visite.date_visite,'2026-11-15');
  console.log('Date de visite : champ SQLite, visite officielle, caches, validation : OK');
})().catch(e=>{console.error(e);process.exitCode=1});
