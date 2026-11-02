const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const definition=JSON.parse(read('remarTrame.js').match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
function load(file,deps,functions){
  const code=read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s*\{[^}]+\};?/g,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(deps),code+'\nreturn {'+functions.join(',')+'}')(...Object.values(deps));
}
const payload=load('intranetVisitPayload.js',{obtenirTrame:()=>definition},
  ['inspectIntranetCriterionCandidate']);
const name=remote=>(/remar/i.test(remote?.nom||'')?'remar_v1':null);
const select=load('remarRemoteTrameSelection.js',{
  obtenirTrame:()=>definition,
  mapRemoteTrameToLocal:name,
  inspectIntranetCriterionCandidate:payload.inspectIntranetCriterionCandidate,
},['assessRemarRemoteTrame','chooseUniqueRemarRemoteTrame']);
let assertions=0;
const check=(truth,desc)=>{assert.ok(truth,desc);assertions++};
const frozen=JSON.parse(read('.github/fixtures/remar_classique_16_frozen_20261102.json'));
const missing=select.assessRemarRemoteTrame(frozen);
check(!missing.complete,'real partial CLASSIQUE 16 is not erroneously declared complete');
check(missing.totalCount>=130&&missing.mappedCount<misingNumber(),
  'missing local REMAR points remain measurable, not a fake 141/141 pass');
function misingNumber(){return missing.totalCount;}
check(missing.missing.some(x=>x.startsWith('p-remar-cta||')),
  'CLASSIQUE 16 has no verified matching CTA criteria in the supplied excerpt');
check(missing.missing.some(x=>x.startsWith('p-remar-vmc||')),
  'CLASSIQUE 16 cannot be silently treated as VMC destination');
check(missing.missing.some(x=>x.startsWith('p-remar-froid||')),
  'CLASSIQUE 16 cannot be silently treated as cold equipment destination');
check(!missing.missing.some(x=>x==='p-remar-reseaux||Réseaux chauffage||Réseau 1||champ'),
  'ID 303 real network category resolves as heating, not cold');
const full={
  id:92,nom:'REMAR TECHNIQUE COMPLET',
  categories:Object.entries(definition.ui.panels).map(([panel,sections],catIdx)=>({
    id:400+catIdx,nom:definition.ui.labels?.[panel]||panel,
    sousCategories:Object.entries(sections).map(([section,fields],subIdx)=>({
      id:700+catIdx*20+subIdx,nom:section,
      criteres:fields.filter(f=>f.hiddenInApp!==true).map((f,idx)=>({
        id:1000+catIdx*200+subIdx*30+idx,nom:f.cle,
        avisApplicable:f.type==='controle',
      })),
    })),
  })),
};
const all=select.assessRemarRemoteTrame(full);
check(all.complete,'synthetic fully published 141-criterion Symfony trame is verifiably complete: '+
  JSON.stringify({missing:all.missing,extra:all.extra,collisions:all.collisions,invalid:all.invalid}).slice(0,450));
check(all.mappedCount===all.totalCount,'every official non-metadata REMAR field is covered');
const choose=select.chooseUniqueRemarRemoteTrame([
  {reference:{trame:frozen}},{reference:{trame:full}},
]);
check(choose.selected?.reference.trame.id===92&&!choose.ambiguous,
  'unique complete remote template selected instead of CLASSIQUE 16');
const doubles=select.chooseUniqueRemarRemoteTrame([
  {reference:{trame:full}},
  {reference:{trame:{...full,id:93,nom:'REMAR COMPLET BIS'}}},
]);
check(!doubles.selected&&doubles.ambiguous,'two complete remote versions never guessed');
const noFull=select.chooseUniqueRemarRemoteTrame([{reference:{trame:frozen}}]);
check(!noFull.selected&&!noFull.ambiguous,'no complete trame means no automatic switch');
const wrongFamily=select.assessRemarRemoteTrame({...full,id:95,nom:'VMC'});
check(!wrongFamily.complete,'a VMC template cannot disguise itself as REMAR');
const partial=structuredClone(full);
partial.categories.find(c=>c.sousCategories.some(s=>s.criteres.some(v=>v.nom==='Année CTA')))
  .sousCategories.find(s=>s.criteres.some(v=>v.nom==='Année CTA')).criteres=
  partial.categories.find(c=>c.sousCategories.some(s=>s.criteres.some(v=>v.nom==='Année CTA')))
    .sousCategories.find(s=>s.criteres.some(v=>v.nom==='Année CTA')).criteres.filter(v=>v.nom!=='Année CTA');
const missingYear=select.assessRemarRemoteTrame(partial);
check(!missingYear.complete&&missingYear.missing.some(x=>x.includes('||Année CTA||')),
  'missing one real CTA field blocks automatic selection');
const duplicated=structuredClone(full);
const duplicateSection=duplicated.categories.flatMap(c=>c.sousCategories)
  .find(section=>section.criteres.some(criterion=>criterion.nom==='Année CTA'));
assert.ok(duplicateSection,'fixture must contain an official CTA year');
duplicateSection.criteres.push({
  ...duplicateSection.criteres.find(c=>c.nom==='Année CTA'),id:990099,
});
const dup=select.assessRemarRemoteTrame(duplicated);
check(!dup.complete&&dup.collisions.length===1,
  'two Symfony triplets mapping one local criterion are rejected');
const changedAvis=structuredClone(full);
for(const c of changedAvis.categories)for(const s of c.sousCategories)for(const cr of s.criteres){
  if(cr.nom==='Calorifugeage'){cr.avisApplicable=false;break;}
}
check(!select.assessRemarRemoteTrame(changedAvis).complete,
  'nonapplicable remote avis cannot silently swallow local control');
const wrongType=structuredClone(full);
const vmc=wrongType.categories.find(c=>c.sousCategories.some(s=>s.criteres.some(x=>x.nom==='Etat du caisson')));
vmc.sousCategories.find(s=>s.criteres.some(x=>x.nom==='Etat du caisson'))
  .criteres.find(x=>x.nom==='Etat du caisson').avisApplicable=false;
check(!select.assessRemarRemoteTrame(wrongType).complete,
  'VMC control cannot be written to a text-only criterion without per-equipment avis');
const syncSource=read('IntranetVisitSync.js');
check(syncSource.includes('await pinFullyPublishedRemarForFirstUpload(visiteId);'),
  'single-visit upload validates a fully published REMAR trame first');
const bulk=syncSource.split('export async function envoyerVisitesClient')[1]||'';
check(bulk.includes('await pinFullyPublishedRemarForFirstUpload(visite.id);') &&
      bulk.indexOf('pinFullyPublishedRemarForFirstUpload(visite.id)') <
      bulk.indexOf('await queueVisitUpload(visite.id'),
  'bulk upload uses the same REMAR full-coverage preflight BEFORE queueing');
console.log('PASS '+assertions+' REMAR remote trame selection/collision/coverage guards.');
