/** Multi-trame V2 fixture conformance — no live Symfony access. */
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=(pathName)=>JSON.parse(fs.readFileSync(path.join(root,pathName),'utf8'));
const source=fs.readFileSync(path.join(root,'intranetV2Catalog.js'),'utf8').replace(/export\s+(?=function\s)/g,'');
const contract=new Function(source+'\nreturn {inspectV2TrameCatalog,inspectV2TrameCompatibility}')();
const catalog=read('docs/fixtures/intranet_v2_catalogue_exemple.json');
const assignment=read('docs/fixtures/intranet_v2_local_exemple.json');
assert.equal(contract.inspectV2TrameCatalog(catalog).valid,true);
for(const trame of catalog.trames){
  const mappings=trame.criteres.map((c)=>({cleMetierStable:c.cleMetierStable,brancheId:c.brancheId,sourceKey:'metra.'+c.cleMetierStable}));
  const allowed=assignment.tramesAutorisees.some((t)=>t.cleMetierStable===trame.cleMetierStable&&t.version===trame.version&&t.empreinte===trame.empreinte);
  const result=contract.inspectV2TrameCompatibility(catalog,{
    cleMetierStable:trame.cleMetierStable,version:trame.version,empreinte:trame.empreinte,
    localId:assignment.local.id,tramesAutorisees:assignment.tramesAutorisees,
    mappedCriteria:mappings,supportedCapabilities:trame.capabilities
  });
  assert.equal(result.compatible,allowed&&trame.statut==='active',
    'server only allows explicitly assigned active trame '+trame.cleMetierStable+'@'+trame.version);
}
const v1=catalog.trames[0];
assert.equal(contract.inspectV2TrameCompatibility(catalog,{
  cleMetierStable:v1.cleMetierStable,version:1,empreinte:v1.empreinte,
  localId:assignment.local.id,mode:'existing_offline_visit',
  mappedCriteria:v1.criteres.map((c)=>({cleMetierStable:c.cleMetierStable,brancheId:c.brancheId,sourceKey:'metra.'+c.cleMetierStable})),
  supportedCapabilities:v1.capabilities,
  tramesAutorisees:[...assignment.tramesAutorisees,{cleMetierStable:v1.cleMetierStable,version:v1.version,empreinte:v1.empreinte}]
}).compatible,true,'server can explicitly accept old RCU offline version');
console.log('V2 example catalogue: 7 versions across ICPE, RCU, VMC, Pré-allumage, REMAR, and future trame validated.');
