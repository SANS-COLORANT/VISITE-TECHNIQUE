import { PDFName, PDFDict, PDFArray, PDFHexString } from 'pdf-lib';
// The marker is a local PDF link target, never fetched over the network.
// Android print engines may omit links; use exact destinations when present,
// otherwise provide honest print-batch bookmarks. Strip every marker action.
const PREFIX='https://metra.invalid/report/';
export const reportMarker=(kind,id)=>PREFIX+kind+'/'+encodeURIComponent(String(id));
export function installReportNavigation(pdf,batches=[]){
  const ctx=pdf.context, pages=pdf.getPages(), local=new Map(), toc=[];
  const key=s=>PDFName.of(s);
  for(let i=0;i<pages.length;i++){
    const ann=pages[i].node.lookupMaybe(key('Annots'),PDFArray);
    if(!ann)continue;
    for(let j=ann.size()-1;j>=0;j--){
      try{
        const d=ctx.lookup(ann.get(j),PDFDict),a=d.lookupMaybe(key('A'),PDFDict);
        const value=a?.lookup(key('URI'))?.decodeText?.();
        if(!value?.startsWith(PREFIX))continue;
        const m=/^(local|toc)\/(.+)$/.exec(value.slice(PREFIX.length));
        if(!m){ann.remove(j);continue;}
        const id=decodeURIComponent(m[2]);
        d.delete(key('A'));
        if(m[1]==='local'){if(!local.has(id))local.set(id,i);ann.remove(j);}
        else toc.push({d,ann,ref:ann.get(j),id});
      }catch{/* unrelated or unsupported annotation */}
    }
  }
  for(const t of toc){
    const pageIndex=local.get(t.id);
    if(pageIndex!=null)t.d.set(key('Dest'),ctx.obj([pages[pageIndex].ref,'Fit']));
    else{
      for(let j=t.ann.size()-1;j>=0;j--)if(t.ann.get(j)===t.ref)t.ann.remove(j);
    }
  }
  const bookmarks=[{label:'Couverture et sommaire',index:0}];
  for(const batch of batches){
    const remaining=[];
    for(const item of batch.locals||[]){
      if(local.has(String(item.id)))bookmarks.push({label:item.label,index:local.get(String(item.id))});
      else remaining.push(item.label);
    }
    if(remaining.length&&batch.index>0)bookmarks.push({label:'Lot : '+remaining.join(' · '),index:batch.index});
  }
  const valid=bookmarks.filter(b=>pages[b.index]).sort((a,b)=>a.index-b.index);
  if(!valid.length)return {exact:local.size,bookmarks:0};
  const outline=ctx.obj({Type:'Outlines',Count:valid.length}),root=ctx.register(outline);
  const entries=valid.map(b=>ctx.obj({Title:PDFHexString.fromText(b.label),Parent:root,Dest:ctx.obj([pages[b.index].ref,'Fit'])}));
  const refs=entries.map(d=>ctx.register(d));
  entries.forEach((d,i)=>{if(i)d.set(key('Prev'),refs[i-1]);if(i+1<refs.length)d.set(key('Next'),refs[i+1]);});
  outline.set(key('First'),refs[0]);outline.set(key('Last'),refs.at(-1));
  pdf.catalog.set(key('Outlines'),root);
  return {exact:local.size,bookmarks:valid.length};
}
