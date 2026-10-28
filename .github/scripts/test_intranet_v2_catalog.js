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
  statut: 'active', capabilities: ['criteres','reserves'], criteres: [
    { brancheId: '100:200:300', cleMetierStable: 'rcu.primaire.synthese.p2', type: 'synthese',
      obligatoire: true, avis: { applicable: true } },
    { brancheId: '100:201:300', cleMetierStable: 'rcu.secondaire.synthese.p2', type: 'synthese',
      obligatoire: true, avis: { applicable: false } },
  ] };
const catalog = { schemaVersion: 2, trames: [rcu] };
const scoped = { cleMetierStable: 'reseau_chaleur', version: 1, empreinte: fingerprint,
  localId: 501, tramesAutorisees: [{ cleMetierStable: 'reseau_chaleur', version: 1, empreinte: fingerprint }],
  mappedCriteria: rcu.criteres.map((c) => ({ cleMetierStable: c.cleMetierStable,
    brancheId: c.brancheId, sourceKey: 'metra.' + c.cleMetierStable })),
  supportedCapabilities: ['criteres','reserves'] };
let checks = 0;
const check = (yes, label) => { assert.ok(yes, label); console.log('OK ' + ++checks + ': ' + label); };
check(v2.inspectV2TrameCatalog(catalog).valid, 'explicit versioned catalogue validates');
check(v2.inspectV2TrameCompatibility(catalog, scoped).compatible, 'offline compatibility succeeds with exact key/version/branch mapping');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, mappedCriteria: [] }).compatible,
  'unmapped required fields block offline upload before terrain');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, empreinte: 'sha256:' + 'b'.repeat(64) }).compatible,
  'changed server schema fingerprint blocks stale visit');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, tramesAutorisees: [] }).compatible,
  'server trame not assigned to local cannot be selected by name');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, cleMetierStable: 'nouvelle_trame' }).compatible,
  'unpublished future trames are local/export only');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [rcu, { ...rcu, idSymfony: 88 }] }).valid,
  'same business key and version cannot be published twice');
const earlier = { ...rcu, statut: 'deprecated', acceptsExistingOfflineVisits: true };
const newer = { ...rcu, version: 2, empreinte: 'sha256:' + 'b'.repeat(64),
  criteres: rcu.criteres.map((c) => ({ ...c, brancheId: c.brancheId.replace('100:', '110:') })) };
const both = { schemaVersion: 2, trames: [earlier, newer] };
check(v2.inspectV2TrameCatalog(both).valid, 'same stable trame key can coexist in multiple versions');
check(!v2.inspectV2TrameCompatibility(both, scoped).compatible, 'deprecated version cannot create a new visit');
check(v2.inspectV2TrameCompatibility(both, {...scoped, mode: 'existing_offline_visit'}).compatible,
  'server explicitly accepts a frozen offline visit on deprecated version');
check(v2.inspectV2TrameCompatibility(both, { ...scoped, version: 2, empreinte: newer.empreinte,
  tramesAutorisees: [{ cleMetierStable: 'reseau_chaleur', version: 2, empreinte: newer.empreinte }],
  mappedCriteria: scoped.mappedCriteria.map((c) => ({...c, brancheId: c.brancheId.replace('100:', '110:')})) }).compatible,
  'exact version 2 is selected, not first matching family');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, mappedCriteria: scoped.mappedCriteria.slice(0,1) }).compatible,
  'even optional criterion needs a declared local mapping');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped,
  mappedCriteria: scoped.mappedCriteria.map((c, i) => i ? {...c,brancheId:'100:999:300'} : c) }).compatible,
  'matching key with a wrong category/subcategory/criterion triple is rejected');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped,
  mappedCriteria: scoped.mappedCriteria.map((c, i) => i ? {...c,sourceKey:''} : c) }).compatible,
  'mapping without a concrete METRA source is rejected');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, supportedCapabilities:['criteres'] }).compatible,
  'unsupported reserve capability is rejected even if fields map');
check(!v2.inspectV2TrameCatalog({ ...catalog, schemaVersion: '2' }).valid,
  'catalogue version must be a number, not a string');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, version: '01' }] }).valid,
  'noncanonical version 01 is rejected');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, idSymfony: true }] }).valid,
  'boolean identity can never become Symfony ID 1');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, version: '1e0' }] }).valid,
  'scientific notation version is not a stable identity');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, capabilities:['criteres','unknown'] }] }).valid,
  'unknown future capability cannot silently pass');
check(!v2.inspectV2TrameCatalog({ ...catalog, trames: [{ ...rcu, criteres: [
  rcu.criteres[0], { ...rcu.criteres[0], cleMetierStable: 'duplicate' },
] }] }).valid, 'duplicate full remote branches are rejected despite different semantic keys');
check(!v2.inspectV2TrameCompatibility(catalog, { ...scoped, localId: null }).compatible,
  'numeric remote LOCAL identity is mandatory');
console.log(checks + ' V2 catalogue contract tests passed without Symfony deployment.');
