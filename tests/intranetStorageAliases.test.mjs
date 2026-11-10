import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacySectionCode, canonicalSectionCode, canonicalKnownCode, candidateSectionCodes, resolveAliasValue } from '../intranetStorageAliases.js';

const cases = [
  ['p-regulation','Réseau ECS','regulation.reseau_ecs','regulation.r_seau_ecs'],
  ['p-regulation','Cascade chaudières','regulation.cascade','regulation.cascade_chaudi_res'],
  ['p-releves','Relevés des compteurs et manomètres','releves.compteurs','releves.relev_s_des_compteurs_et_manom_tres'],
  ['p-releves','Températures et pH','releves.temperatures','releves.temp_ratures_et_ph'],
];
for (const [panel,section,canonical,legacy] of cases) {
  test('tous les champs de section spécialisée : ' + section, () => {
    assert.equal(canonicalSectionCode(panel,section),canonical);
    assert.equal(legacySectionCode(panel,section),legacy);
    assert.equal(canonicalKnownCode(legacy),canonical);
    const field={cle:'Mesure test',type:'champ'};
    const definition={excel:{fieldMappings:[{panelId:panel,section,sectionCode:legacy,cle:field.cle,type:field.type}]}};
    assert.deepEqual(candidateSectionCodes(definition,panel,section,field),[canonical,legacy]);
  });
}
test('hors sections spécialisées : aucun renommage destructeur', () => {
  assert.equal(canonicalSectionCode('p-vmc-c1','Données générales'),'vmc-c1.donn_es_g_n_rales');
  assert.equal(canonicalKnownCode('vmc-c1.donn_es_g_n_rales'),'vmc-c1.donn_es_g_n_rales');
});
test('alias historique seul : valeur récupérée, aucune alerte', () => {
  const issues=[]; issues.freeTextFallbacks=[];
  const c={cle:'T° consigne (°C)',storageCodes:['regulation.reseau_ecs','regulation.r_seau_ecs']};
  assert.equal(resolveAliasValue(new Map([['regulation.r_seau_ecs||T° consigne (°C)','57']]),c,issues,'ECS'),'57');
  assert.equal(issues.freeTextFallbacks.length,0);
});
test('divergences : clé terrain prioritaire, TOUTES les valeurs en notes', () => {
  const issues=[];issues.freeTextFallbacks=[];
  const c={cle:'T° consigne (°C)',storageCodes:['regulation.reseau_ecs','regulation.r_seau_ecs']};
  const data=new Map([['regulation.reseau_ecs||T° consigne (°C)','58'],['regulation.r_seau_ecs||T° consigne (°C)','57']]);
  assert.equal(resolveAliasValue(data,c,issues,'ECS'),'58');
  assert.equal(issues.length,0);
  assert.match(issues.freeTextFallbacks[0].value,/regulation.reseau_ecs : 58/);
  assert.match(issues.freeTextFallbacks[0].value,/regulation.r_seau_ecs : 57/);
});
test('contrôles de toute trame : avis et commentaire archivés', () => {
  const issues=[];issues.freeTextFallbacks=[];
  const c={cle:'Test',storageCodes:['regulation.cascade','regulation.cascade_chaudi_res']};
  const data=new Map([['regulation.cascade||Test',{avis:'N.S',commentaire:'Écart'}],
    ['regulation.cascade_chaudi_res||Test',{avis:'S',commentaire:'Ancien'}]]);
  assert.equal(resolveAliasValue(data,c,issues,'Cascade').avis,'N.S');
  assert.match(issues.freeTextFallbacks[0].value,/Ancien/);
  assert.match(issues.freeTextFallbacks[0].value,/Écart/);
});
test('mêmes valeurs : aucune note en double', () => {
  const issues=[];issues.freeTextFallbacks=[];
  const c={cle:'Test',storageCodes:['a','b']};
  assert.equal(resolveAliasValue(new Map([['a||Test','22'],['b||Test','22']]),c,issues,'Test'),'22');
  assert.equal(issues.freeTextFallbacks.length,0);
});
test('pas de notes de secours : conflit conservatoirement bloquant', () => {
  const issues=[];const c={cle:'Test',storageCodes:['a','b']};
  assert.equal(resolveAliasValue(new Map([['a||Test','22'],['b||Test','23']]),c,issues,'Test'),null);
  assert.equal(issues.length,1);
});
