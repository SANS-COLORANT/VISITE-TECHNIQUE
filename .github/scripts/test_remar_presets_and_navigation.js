/** REMAR regression: 70 actionable controls, VMC phrase reuse, saved-CTA navigation,
 * duplicate equipment type naming and no false prefilled compliance. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
const rawVmc=read('vmcTrame.js');
const vmcPrelude=rawVmc.slice(rawVmc.indexOf('const nr ='),rawVmc.indexOf('const caissonRows'))
  .replace('export const VMC_PANELS','const VMC_PANELS');
const VMC_PANELS=new Function(vmcPrelude+'\nreturn VMC_PANELS;')();
const presetsSource=read('remarControlPresets.js')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const presets=new Function('VMC_PANELS',presetsSource+
  '\nreturn {enrichirControleRemar,enrichirChampRemar,inventaireGuidesRemar};')(VMC_PANELS);
const remar=JSON.parse(read('remarTrame.js')
  .match(/const definition = (\{[\s\S]*?\});\s*definition\.excel/)[1]);
let total=0;const ok=(v,msg)=>{assert.ok(v,msg);total++;};
const fields=[];
for(const [panel,sections] of Object.entries(remar.ui.panels||{}))
  for(const [section,entries]of Object.entries(sections))
    for(const field of entries.filter(x=>x.type==='controle'))
      fields.push({panel,section,field});
ok(fields.length===70,'70 official REMAR controls retained');
for(const {panel,field} of fields){
  const enhanced=presets.enrichirControleRemar(field,panel);
  const name=panel+'/'+field.cle;
  ok(enhanced.cle===field.cle&&enhanced.type==='controle','unchanged official identity '+name);
  ok(enhanced.presets?.S?.[0]?.commentaire?.length>35,'specific S diagnostic '+name);
  ok(enhanced.presets?.['N.S']?.length>=2,'two distinct N.S technical defects '+name);
  ok(enhanced.presets?.['N.S']?.every(p=>p.commentaire?.length>18&&p.reserve?.length>18
    &&p.label!=='Anomalie à préciser'),'actionable N.S + reserve '+name);
  ok(['N.R','S.O','N.V'].every(avis=>enhanced.presets?.[avis]?.length),
    'historical five-opinion schema intact '+name);
}
ok(presets.enrichirControleRemar({cle:'Etat courroie',type:'controle',presets:{}},'p-remar-vmc')
  .presets['N.S'].some(x=>/Retendre la courroie/.test(x.reserve)),
  'VMC scenario library reused without rewriting its evidence-based text');
ok(presets.enrichirChampRemar({cle:'Type de bouche',type:'champ'},'p-remar-vmc')
  .options.includes('Hygroréglable B'),'VMC outlet field has practical preset types');
ok(presets.enrichirChampRemar({cle:'Volume tampon',type:'champ'},'p-remar-froid')
  .label==='Volume tampon (L)','froid buffer volume has explicit units');
const namesSource=read('remarEquipmentNaming.js')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const {proposerNomUniqueRemar,afficherNomEquipementRemar}=new Function(namesSource+
  '\nreturn {proposerNomUniqueRemar,afficherNomEquipementRemar};')();
const ctaNames=['CTA soufflage','CTA extraction','CTA 1 — CTA soufflage','CTA 1 — CTA extraction'];
const newCta=proposerNomUniqueRemar('cta','CTA soufflage',ctaNames,['CTA soufflage','CTA extraction']);
ok(/^CTA 5 — soufflage$/.test(newCta),'CTA numbering shared across types, not repeated CTA 1');
ok(afficherNomEquipementRemar('cta','CTA soufflage',0)==='CTA 1 · soufflage' &&
  afficherNomEquipementRemar('cta','CTA 1 — CTA soufflage',2)==='CTA 3 · soufflage',
  'legacy CTA numbering duplicates disappear visually, stable original asset names remain');
ok(afficherNomEquipementRemar('vmc','Caisson extraction',0)==='Caisson VMC 1 · extraction',
  'VMC card has unique family-wide index without a stored rename');
const vmcA=proposerNomUniqueRemar('vmc','Caisson extraction',
  ['Caisson extraction'],['Caisson extraction','Caisson VMC']);
ok(vmcA==='Caisson VMC 2 — extraction','multiple identical VMC caisson types allowed');
ok(proposerNomUniqueRemar('cta','CTA Atelier',['CTA Atelier'],['CTA soufflage'])==='CTA Atelier',
   'free names are not silently rewritten');
const durable=read('durableAutosave.js');
const match=durable.match(/export async function flushDurableAutosaves\(\) \{([\s\S]*?)\n\}/);
ok(!!match,'shared durable flush remains exported');
const flush=new Function('activeFlushers','return async function flushDurableAutosaves(){'+match[1]+'\n}')(
  new Set([()=>Promise.resolve('ok'),()=>Promise.reject(new Error('simulated sqlite failure'))]));
flush().then(results=>{
  ok(Array.isArray(results)&&results[0].status==='fulfilled'&&results[1].status==='rejected',
    'CTA navigation receives all flush results, including failures');
  const panel=read('RemarDynamicPanel.js');
  ok(panel.includes('const failure=results.find(')&&panel.includes('if(failure)'),
    'CTA refuses to leave card on failed autosave');
  ok(panel.includes("f.cle==='Désignation CTA'"),'duplicate CTA designation removed in UI');
  const project=read('remarDynamicExportDb.js');
  ok(project.includes("'Désignation CTA',null,{valeur:parent.designation"),
    'CTA designation still exported into exact official Excel destination');
  ok(project.includes("if(parents.length>1) unsupported.push("),
    'additional CTA not silently discarded during Intranet V1 POST');
  const screen=read('visitProgressDb.js');
  ok(screen.includes('calculerEtatOnglets(visiteId, trame.id, { db, champsRows, controlesRows })'),
    'global visit ring includes real dynamic REMAR values');
  console.log('PASS '+total+' REMAR field intelligence, identity, save, navigation and export controls.');
}).catch(error=>{console.error(error);process.exitCode=1;});
