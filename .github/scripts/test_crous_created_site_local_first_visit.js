/**
 * Regression of METRA site->local creation acknowledgements, then FIRST visit
 * upload binding. The application already queues two idempotent structure POSTs
 * with stable creationId; this test checks that the visited installation uses
 * the two ACK IDs, never a guessed same-name local or a new creation request.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const file=fs.readFileSync(path.resolve(__dirname,'../../IntranetVisitSync.js'),'utf8');
const from=file.indexOf('async function bindSameImportedClient(visiteId) {');
const to=file.indexOf('\nasync function assertQueuedClientStillMatchesImportedClient',from);
assert.ok(from>=0&&to>from,'production routine remains discoverable');
const bindingFn=file.slice(from,to);
let passed=0;
function check(condition,message){assert.ok(condition,message);console.log('PASS',++passed,message);}
function scenario(config={}){
  let creation={
    ...(config.hasSite===false?{}:{
      site:{status:config.siteStatus||'pending',remote_id:config.siteRemoteId||null,
        operation_id:'stable-site-op'},
    }),
    ...(config.hasLocal===false?{}:{
      local:{status:config.localStatus||'pending',remote_id:config.localRemoteId||null,
        operation_id:'stable-local-op'},
    }),
  };
  let passes=0,reads=0,refreshes=0,hydrations=0,bindCalls=0;
  const creationRead=async()=>{reads++;return JSON.parse(JSON.stringify(creation));};
  const outbox=async()=>{
    passes++;
    if(config.offline)return [];
    if(creation.site && creation.site.status!=='synced'){
      creation.site={...creation.site,status:'synced',remote_id:'1101'};
    }else if(creation.local&&creation.local.status!=='synced'){
      creation.local={...creation.local,status:'synced',remote_id:'2202'};
    }
    return [];
  };
  const bind=async()=>{
    bindCalls++;
    if(config.existing)return {remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501'};
    if(creation.site?.status!=='synced')
      throw Object.assign(new Error('Site not yet acknowledged'),
        {code:'imported_site_missing',remoteClientId:'12'});
    if(creation.local?.status!=='synced')
      throw Object.assign(new Error('Physical local has no Symfony ID'),
        {code:'imported_local_ambiguous',remoteClientId:'12'});
    if(!hydrations)
      throw Object.assign(new Error('Created local lacks first-visit criteria'),
        {code:'intranet_reference_refresh_required',remoteClientId:'12'});
    return {remoteClientId:'12',remoteSiteId:creation.site.remote_id,
      remoteLocalId:creation.local.remote_id};
  };
  const source=bindingFn+'\nreturn bindSameImportedClient;';
  const production=new Function('bindVisitToImportedClientTarget',
    'getVisitStructureCreationState','processStructureOutbox',
    'syncClientPreparation','hydrateFirstVisitReference',source)(
      bind,creationRead,outbox,
      async clientId=>{assert.equal(clientId,'12');refreshes++;return {};},
      async(visiteId,clientId)=>{assert.equal(visiteId,'crous-visit');assert.equal(clientId,'12');hydrations++;}
  );
  return {run:()=>production('crous-visit'),stats:()=>({
    ...creation,passes,reads,refreshes,hydrations,bindCalls,
  })};
}
(async()=>{
  // A newly entered site and local use their original persistent operation IDs.
  // Site ACK must precede local ACK, which in turn precedes the visit binding.
  const created=scenario();
  const bound=await created.run();
  check(bound.remoteClientId==='12'&&bound.remoteSiteId==='1101'&&
    bound.remoteLocalId==='2202','first visit targets exactly the new Symfony site/local IDs');
  const after=created.stats();
  check(after.passes===2&&after.hydrations===1&&after.refreshes===1,
    'existing queue runs twice and hydrates missing initial visit criteria');
  check(after.site.operation_id==='stable-site-op'&&
    after.local.operation_id==='stable-local-op',
    'idempotent creation operation identities unchanged');

  const existing=scenario({existing:true,hasSite:false,hasLocal:false});
  check((await existing.run()).remoteLocalId==='501'&&existing.stats().passes===0,
    'already imported local never triggers an additional creation');

  const offline=scenario({offline:true});
  await assert.rejects(()=>offline.run(),error=>
    error.code==='structure_local_creation_unconfirmed'&&
    /reste(nt)? enregistrée|restent enregistrés/.test(error.message));
  check(offline.stats().passes===3&&offline.stats().hydrations===0,
    'offline existing site/local operations remain pending; no invented remote ID');

  const onlySite=scenario({hasLocal:false});
  await assert.rejects(()=>onlySite.run(),error=>
    error.code==='structure_local_required'&&
    error.message.includes('propre identifiant Symfony'));
  check(onlySite.stats().passes>=1&&!onlySite.stats().local,
    'site alone is created; technician must create its actual technical local');

  const terminal=scenario({siteStatus:'synced',localStatus:'validation_error'});
  await assert.rejects(()=>terminal.run(),error=>
    error.code==='structure_creation_failed'&&error.message.includes('validation_error'));
  check(terminal.stats().passes===0,'terminal rejection must not be blindly retried');

  console.log('PASS CROUS existing-creation ACK ID binding regression '+passed+' checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
