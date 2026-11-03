/**
 * Tests independants: les clefs photos REMAR sont immuables et associees a la
 * bonne CTA, y compris les filtres, mesures et reserves. Aucun ancien ID photo
 * ni aucune photo libre n'est reformate/supprime.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const raw=read('remarPhotoContext.js')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const {identifiantCtaPhoto,contextePhotoRemar}=new Function(
  'getDb','obtenirTrame','remarFamilleEquipement',
  raw+'\nreturn {identifiantCtaPhoto,contextePhotoRemar};',
)(async()=>null,()=>null,()=>null);
const sample={
  ctas:{'cta-a':{id:'cta-a',nom:'CTA 1 Bureaux'},'cta-b':{id:'cta-b',nom:'CTA 2 Atelier'}},
  items:{
    'f-a':{parentId:'cta-a',nom:'Filtre F7 Soufflage'},
    'm-a':{parentId:'cta-a',nom:'Mesure soufflage'},
    'f-b':{parentId:'cta-b',nom:'Filtre G4 Reprise'},
  },
  reserves:{
    'r-a':'remar||item||f-a||p-remar-filtres||filtre_cta||Etat du filtre',
    'r-b':'remar||equipement||cta-b||p-remar-cta||entretien||GTC',
  },
};
let n=0;function check(input,expected){
  assert.equal(identifiantCtaPhoto(input,sample),expected,input);n++;
}
check('equipement||cta-a','cta-a');
check('equipement||cta-b','cta-b');
check('remar||equipement||cta-b||p-remar-cta||section||controle','cta-b');
check('remar||item||f-a||p-remar-filtres||filtre_cta||Etat du filtre','cta-a');
check('remar||item||m-a||p-remar-cta-mesures||mesure_cta||Valeur','cta-a');
check('remar||item||f-b||p-remar-filtres||filtre_cta||Etat du filtre','cta-b');
check('remarque||r-a','cta-a');
check('remarque||r-b','cta-b');
check('remarque||missing',null);
check('remar||item||unknown||p-remar-filtres||filtre_cta||Etat du filtre',null);
check('',null);
const photo=contextePhotoRemar('remarque||r-a',sample);
assert.equal(photo.prefix,'CTA 1 Bureaux · Filtre F7 Soufflage');n++;
const ui=read('OptimizedPhotoPanel.js');
assert.match(ui,/contextePhotoRemar\(p.entite_key,remarPhotoContext\)/);n++;
assert.match(ui,/remar-cta:/);n++;
const report=read('reportBuilder.js');
assert.match(report,/contextePhotoRemar\((?:key|photo.entite_key),data.photosRemar\)/);n++;
const field=read('RemarDynamicPanel.js');
assert.match(field,/entiteKey=\{controlKey\} label=\{photoLabel\}/);n++;
const visit=read('VisiteScreen.js');
assert.match(visit,/REMAR_CTA_ETAPES_INTERNES/);n++;
const trame=read('remarTrame.js');
const def=JSON.parse(trame.match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
for(const step of ['p-remar-filtres','p-remar-cta-mesures','p-remar-cta-energie']){
  assert.ok(def.ui.tabOrder.includes(step),'Official mapping of '+step+' retained');n++;
}
const remap=read('remarDynamicExportDb.js');
assert.match(remap,/familyCounts\[family\]=parents.length/);n++;
const intranet=read('intranetVisitPayload.js');
// Publication REMAR partielle : l'absence d'avis/description ne doit plus
// faire échouer le POST, tout en gardant les valeurs héritées non confirmées.
assert.doesNotMatch(intranet,/Sélectionne S, N.S, N.R \(non vérifié\), S.O ou N.V avant l.envoi/);n++;
assert.match(intranet,/const confirmed=value.inherited!==true/);n++;
assert.match(intranet,/const hasUnfilled=entries.some\(e=>!e.avis\)/);n++;
assert.match(intranet,/const status=e.avis\|\|'Non renseigné'/);n++;
assert.doesNotMatch(intranet,/l'avis N.S doit préciser un défaut observé/);n++;
const photoCapture=read('photoLibreCapture.js');
assert.match(photoCapture,/inclure_export: entiteKey \? 1 : 0/);n++;
assert.match(photoCapture,/ajouterPhoto\(visiteId, entiteKey, photo.uri, labelDb\)/);n++;
assert.match(field,/const proposerAvisEnMasse/);n++;
assert.match(field,/if\(row\?\.avis && !row.inherited\)continue/);n++;
console.log('PASS '+n+' REMAR photo/CTA-navigation identity and historic mapping protections');
