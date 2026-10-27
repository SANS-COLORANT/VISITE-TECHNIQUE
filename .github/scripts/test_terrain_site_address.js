/** Non regression: site address is not client address; ambiguous counts stay ambiguous. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
function load(file, dependencies={}) {
  const src=fs.readFileSync(path.join(root,file),'utf8')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
    .replace(/export\s*\{[^}]+\};?/g,'')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
  return new Function(...Object.keys(dependencies),src+'\nreturn {addressFromRemoteSite:typeof addressFromRemoteSite==="function"?addressFromRemoteSite:null,typedSiteCounts:typeof typedSiteCounts==="function"?typedSiteCounts:null};')(...Object.values(dependencies));
}
const api=load('symfonyApiCacheDb.js',{openAppDatabase:async()=>null,createId:()=>''});
const prefill=load('visitPrefillDb.js',{obtenirTrame:()=>({}),DEFAULT_TRAME_ID:'icpe_v1',
  carryForwardPreviousVisit:async()=>{},BoundedLruMap:class{get(){}set(){}delete(){}}});
assert.equal(api.addressFromRemoteSite({adresse:'68 rue du 11 Novembre',codePostal:'44000',ville:'Nantes'}),
  '68 rue du 11 Novembre\n44000 Nantes');
assert.equal(api.addressFromRemoteSite('{"nom":"Sans adresse"}'),null);
assert.deepEqual(prefill.typedSiteCounts({nombre_logements:8}),{logements:'8',batiments:null});
assert.deepEqual(prefill.typedSiteCounts({nombre_batiments:3}),{logements:null,batiments:'3'});
assert.deepEqual(prefill.typedSiteCounts({'Nbr de bât/lgt':8,type_batiment:'Résidentiel'}),
  {logements:null,batiments:null},'ambiguous mixed count is never guessed');
const source=fs.readFileSync(path.join(root,'symfonyApiCacheDb.js'),'utf8');
assert.ok(source.includes("AND (adresse IS NULL OR trim(adresse)='')"),
  'site import cannot overwrite manually corrected address');
assert.ok(source.includes("remote.payload_json"),'address must be read from site payload');
console.log('OK: site-specific address, safe override and typed counts.');
