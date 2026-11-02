const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
function load(file, dependencies) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m => m[1]);
  const code = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), code + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
const selected = { id: 4, nom: 'VMC' };
const local = { local: { id: 501 }, site: { id: 45 }, trame: { id: 3, nom: 'ICPE' } };
const criterion = { id: 90, nom: 'Ventilation', avis: null, commentaire: null };
const prepared = { client: { id: 12 }, visites: [
  { local: { id: 999 }, site: { id: 45 }, trame: { id: 4, nom: 'VMC', categories: [] } },
  { local: { id: 501 }, site: { id: 45 }, trame: { id: 4, nom: 'VMC', categories: [{ id: 7, sousCategories: [{ id: 8, criteres: [criterion] }] }] } },
] };
const calls = [];
let payload = prepared;
const { prepareIntranetSelectedTrame } = load('intranetSelectedTrame.js', {
  getCachedLocalReference: async () => local,
  normalizePreparationPayload: value => value,
  getCachedStructureReferential: async () => ({ trames: [selected, { id: 3, nom: 'ICPE' }] }),
  syncStructureReferential: async () => { throw new Error('Unexpected refresh'); },
  syncClientPreparation: async (clientId, trameId, options) => { calls.push([clientId,trameId,options]); return payload; },
  mapRemoteTrameToLocal: trame => trame?.nom === 'VMC' ? 'vmc' : 'icpe_v1',
});
(async () => {
  const result = await prepareIntranetSelectedTrame({ remoteClientId: 12, remoteLocalId: 501, remoteTrameId: 4, localTrameId: 'vmc' });
  assert.equal(result.different, true);
  assert.deepEqual(calls, [['12','4',{cacheResult:false}]]);
  assert.equal(result.reference.local.id,501);
  assert.equal(result.reference.trame.categories[0].sousCategories[0].criteres[0].avis, null);
  assert.equal(result.reference.trame.categories[0].sousCategories[0].criteres[0].commentaire, null);
  payload = { ...prepared, visites: [] };
  await assert.rejects(() => prepareIntranetSelectedTrame({ remoteClientId: 12, remoteLocalId: 501, remoteTrameId: 4, localTrameId: 'vmc' }), { code: 'selected_trame_wrong_local' });
  payload = { ...prepared, visites: [{ ...prepared.visites[1], trame: { id: 3, nom: 'ICPE', categories: prepared.visites[1].trame.categories } }] };
  await assert.rejects(() => prepareIntranetSelectedTrame({ remoteClientId: 12, remoteLocalId: 501, remoteTrameId: 4, localTrameId: 'vmc' }), { code: 'selected_trame_incomplete' });
  const creation = fs.readFileSync(path.join(root,'visitCreationDb.js'),'utf8');
  const screen = fs.readFileSync(path.join(root,'SiteVisitesScreen.js'),'utf8');
  const binding = fs.readFileSync(path.join(root,'intranetVisitBindingDb.js'),'utf8');
  assert.ok(creation.includes('await prepareIntranetSelectedTrame('));
  assert.ok(creation.includes('if (!selectedPreparation?.different) await importLatestApiVisitForLocal'));
  assert.ok(creation.includes('selectedSymfonyTrame: selectedPreparation?.different === true'));
  assert.ok(creation.includes('await importSelectedPreparationCriteria('));
  assert.ok(screen.includes('apiRemoteTrameId: apiRemoteLocalId ? remoteTrameChoisie : null'));
  assert.ok(binding.includes('frozenVisitReference(db, visite)'));
  console.log('Selected Symfony trame checks passed (ID, local, empty criteria, fail-closed, creation, binding).');
})().catch(error => { console.error(error); process.exitCode = 1; }); 
