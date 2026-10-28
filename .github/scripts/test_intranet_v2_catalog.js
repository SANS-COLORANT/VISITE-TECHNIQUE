/** Contrat V2 futur : identité/version, couverture, trames nouvelles, offline. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(root, 'intranetV2Catalog.js'), 'utf8')
  .replace(/export\s+(?=function\s)/g, '');
const v2 = new Function(code + '\nreturn {inspectV2TrameCatalog,inspectV2TrameCompatibility};')();
const fingerprint = 'sha256:' + 'a'.repeat(64);
const rcu = { idSymfony: 85, cleMetierStable: 'reseau_chaleur', version: 1, empreinte: fingerprint,
  statut: 'active', criteres: [
    { brancheId: '100:200:300', cleMetierStable: 'rcu.primaire.synthese.p2', type: 'synthese',
      obligatoire: true, avis: { applicable: true } },
    { brancheId: '100:201:300', cleMetierStable: 'rcu.secondaire.synthese.p2', type: 'synthese',
      obligatoire: true, avis: { applicable: false } },
  ] };
const catalog = { schemaVersion: 2, trames: [rcu] };
const scoped = { cleMetierStable: 'reseau_chaleur', version: 1, empreinte: fingerprint,
  localId: 501, tramesAutorisees: [{ cleMetierStable: 'reseau_chaleur', version: 1, empreinte: fingerprint }],
  mappedCriterionKeys: rcu.criteres.map((c) => c.cleMetierStable) };
let checks = 0;
const check = (yes, label) => { assert.ok(yes, label); console.log('OK ' + ++checks + ': ' + label); };
check(v2.inspectV2TrameCatalog(catalog).valid, 'explicit versioned catalogue validates');
check(v2.inspectV2TrameCompatibility(catalog, scoped).compatible, 'offline compatibility succeeds with exact key/version/branch mapping');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, mappedCriterionKeys: [] }).compatible,
  'unmapped required fields block offline upload before terrain');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, empreinte: 'sha256:' + 'b'.repeat(64) }).compatible,
  'changed server schema fingerprint blocks stale visit');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, tramesAutorisees: [] }).compatible,
  'server trame not assigned to local cannot be selected by name');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, cleMetierStable: 'nouvelle_trame' }).compatible,
  'unpublished future trames are local/export only');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [rcu, { ...rcu, idSymfony: 88 }] }).valid,
  'model business key duplicates are rejected');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, criteres: [
  rcu.criteres[0], { ...rcu.criteres[0], cleMetierStable: 'duplicate' },
] }] }).valid, 'duplicate full remote branches are rejected despite different semantic keys');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, localId: null }).compatible,
  'numeric remote LOCAL identity is mandatory');
console.log(checks + ' V2 catalogue contract tests passed without Symfony deployment.');
