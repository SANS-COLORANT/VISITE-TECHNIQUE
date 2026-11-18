/** CTA progression: selection, explicit end-of-list actions, and no auto-validation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
const plan=read('remarJourneyPlan.js')
  .replace(/export\s+(?=(?:function|const|class)\s)/g,'');
const {prochaineCtaDuParcours}=new Function(plan+'\nreturn {prochaineCtaDuParcours};')();
const ctas=[{id:'cta-1'},{id:'cta-2'},{id:'cta-3'}];
assert.deepEqual(prochaineCtaDuParcours(ctas,'cta-1'),{type:'suivante',id:'cta-2'});
assert.deepEqual(prochaineCtaDuParcours(ctas,'cta-2'),{type:'suivante',id:'cta-3'});
assert.deepEqual(prochaineCtaDuParcours(ctas,'cta-3'),{type:'options'});
assert.deepEqual(prochaineCtaDuParcours([{id:'seule'}],'seule'),{type:'options'});
assert.deepEqual(prochaineCtaDuParcours([],'seule'),{type:'inconnue'});
assert.deepEqual(prochaineCtaDuParcours(ctas,'inconnue'),{type:'inconnue'});
assert.deepEqual(prochaineCtaDuParcours(null,null),{type:'inconnue'});
assert.deepEqual(ctas,[{id:'cta-1'},{id:'cta-2'},{id:'cta-3'}],'pure navigation must not alter equipment');
const src=read('RemarDynamicPanel.js');
for(const needle of [
 'const destination=prochaineCtaDuParcours(equipments,activeCtaId)',
 "if(destination.type==='suivante')",
 'await selectCta(destination.id)',
 "destination.type==='options'",
 'setFinCtaVisible(true)',
 'visible={finCtaVisible}',
 '+ Créer une nouvelle CTA',
 'onPress={creerCtaDepuisFin}',
 'Passer aux VMC',
 "onNextPanel('p-remar-vmc')",
 'if(!await flushAvantNavigation())return;',
 'ctaScrollRef.current?.scrollTo({y:0,animated:false})',
 'setCurrentStep(\'p-remar-cta\')',
 'Aucun contrôle n’est validé automatiquement en S.',
])assert.ok(src.includes(needle),'CTA journey missing: '+needle);
assert.ok(!src.includes('Parcours CTA parcouru'),'old blocking alert must not remain');
assert.ok(src.includes('onNextPanel,active=true'),'parent visit navigation callback remains connected');
const host=read('VisiteScreen.js');
const route=read('TrameGenericPanel.js');
assert.ok(host.includes('onNextPanel={changerOnglet}'),'the visit screen forwards navigation');
assert.ok(route.includes('<RemarDynamicPanel {...props} />'),'the REMAR panel receives the callback');
const flow=src.match(/const continuerApresValidation=async\(\)=>\{([\s\S]*?)\n  \};/);
assert.ok(flow,'end CTA handler missing');
assert.ok(!/enregistrerRemarValeur|choisirRemarEquipementReference|upsert/.test(flow[1]),'navigation must not set avis or report focus');
console.log('PASS: CTA navigation advances directly, handles last CTA, offers add/VMC and never auto-validates');
