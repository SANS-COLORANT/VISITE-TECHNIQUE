// Pure, injectable private JPEG cache. Never modify the source photo.
// Fingerprint the source bytes, not just the URI: a restored/replaced file
// at the same path must never reuse the previous report's picture.
export const REPORT_PHOTO_PROFILES=Object.freeze({
  standard:{width:720,compress:.46},
  large:{width:1200,compress:.62},
  full:{width:1600,compress:.68},
});
export function reportPhotoProfile(size){return size==='full'?'full':size==='large'?'large':'standard';}
export function createReportPhotoCache({fs,root,encode,read,now=()=>Date.now(),maxBytes=192*1024*1024,maxEntries=1000,maxAgeMs=7*86400000}){
  const queue=[],pending=new Map(),stats={hits:0,misses:0,encoded:0,peak:0};
  let active=0;
  const safeRemove=p=>fs.deleteAsync(p,{idempotent:true}).catch(()=>{});
  async function info(p,hash=false){return fs.getInfoAsync(p,{size:true,md5:hash});}
  async function ensure(){await fs.makeDirectoryAsync(root,{intermediates:true});}
  function pump(){
    while(active<2 && queue.length){
      const j=queue.shift();active++;stats.peak=Math.max(active,stats.peak);
      Promise.resolve().then(j.work).then(j.resolve,j.reject).finally(()=>{active--;pump();});
    }
  }
  function enqueue(work){return new Promise((resolve,reject)=>{queue.push({work,resolve,reject});pump();});}
  async function prune(){
    await ensure();
    const names=(await fs.readDirectoryAsync(root)).filter(n=>/^(standard|large|full)-[a-f0-9]{32}-\d+\.jpg$/.test(n));
    const list=[];
    for(let i=0;i<names.length;i+=16){
      const group=await Promise.all(names.slice(i,i+16).map(async name=>{
        const uri=root+name;
        const x=await info(uri).catch(()=>null);
        return x?.exists?{uri,size:Number(x.size)||0,time:Number(x.modificationTime||0)*1000}:null;
      }));
      list.push(...group.filter(Boolean));
    }
    list.sort((a,b)=>b.time-a.time);
    let bytes=0,count=0;
    for(const x of list){
      bytes+=x.size;count++;
      if(bytes>maxBytes||count>maxEntries||(x.time>0&&now()-x.time>maxAgeMs))await safeRemove(x.uri);
    }
  }
  async function get(source,size='medium',wantData=true){
    const profile=reportPhotoProfile(size),cfg=REPORT_PHOTO_PROFILES[profile];
    if(!source)throw Error('Photo sans fichier.');
    const input=await info(source,true).catch(()=>null);
    if(!input?.exists||input.isDirectory||!(input.size>0))throw Error('Photo originale inaccessible.');
    const fingerprint=/^[a-f0-9]{32}$/i.test(input.md5||'')?input.md5.toLowerCase():null;
    const target=fingerprint?root+profile+'-'+fingerprint+'-'+input.size+'.jpg':null;
    const key=target||profile+'|'+source;
    // The promise owns the JPEG until all waiters have read it. For an
    // unsupported fingerprint, do not cache even a successfully encoded file.
    if(pending.has(key)){
      const value=await pending.get(key);return wantData?value.data:null;
    }
    const task=enqueue(async()=>{
      let temporary=null;
      try{
        if(target){
          await ensure();
          const cached=await info(target).catch(()=>null);
          if(cached?.exists&&!cached.isDirectory&&cached.size>0){
            const data=await read(target).catch(()=>null);
            if(data&&data.startsWith('/9j/')){
              stats.hits++;return{data:'data:image/jpeg;base64,'+data};
            }
            await safeRemove(target);
          }
        }
        stats.misses++;
        temporary=await encode(source,cfg);stats.encoded++;
        if(!temporary||temporary===source)throw Error('JPEG rapport non généré.');
        const data=await read(temporary);
        if(!data||!data.startsWith('/9j/'))throw Error('JPEG rapport illisible.');
        if(target){
          // Detect a replacement/restore that occurred during compression.
          const after=await info(source,true);
          if(!after.exists||after.size!==input.size||String(after.md5).toLowerCase()!==fingerprint)throw Error('Photo modifiée pendant la préparation du rapport.');
          // The destination is a new private cache file. No source is overwritten.
          await fs.moveAsync({from:temporary,to:target});
          temporary=null;
        }
        return{data:'data:image/jpeg;base64,'+data};
      }finally{if(temporary)await safeRemove(temporary);}
    }).finally(()=>pending.delete(key));
    pending.set(key,task);
    const value=await task;
    return wantData?value.data:null;
  }
  return{get,prune,stats:()=>({...stats,active,queued:queue.length,pending:pending.size})};
}
