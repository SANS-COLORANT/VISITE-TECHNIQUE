// Only the compact, read-only projection crosses the native bridge. Original
// records, photos, issues and database references stay in JS.
const states=['none','green','orange','red','unknown','neutral'];
const n=v=>Math.max(0,Math.floor(Number(v)||0));
export function buildPilotageCanvasModel(sites,categories,collapsed={}){
  const columns=categories.map(c=>({key:String(c.key),label:String(c.label||c.key)}));
  const rows=[],lookup=new Map();
  function add(site,local=null){
    const key=local?'l:'+site.id+':'+local.id:'s:'+site.id;
    const target=local||site;
    const cells=columns.map(c=>{
      const x=target.cells?.[c.key]||{};
      return [Math.max(0,states.indexOf(x.state)),n(x.s),n(x.ns),n(x.nr),n(x.nv),n(x.so),n(x.total)];
    });
    rows.push({key,label:String(local?local.nom:site.nom_site),site:!local,collapsed:!!collapsed[site.id],cells});
    lookup.set(key,{site,local});
  }
  for(const site of sites){add(site);if(!collapsed[site.id])for(const local of site.locals||[])add(site,local);}
  return {json:JSON.stringify({columns,rows}),lookup};
}
