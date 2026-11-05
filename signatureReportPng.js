/**
 * Standalone, dependency-free PNG of a signature recorded by METRA.
 * Used for the active HTML-in-.doc exporter, which does not support SVG
 * reliably. This function NEVER modifies the stored signature.
 */
const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){
    c^=b;
    for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  }
  return (c^0xffffffff)>>>0;
}
function pngChunk(tag,data) {
  const t=[...tag].map(c=>c.charCodeAt(0)),body=[...t,...data];
  return [...u32(data.length),...body,...u32(crc32(body))];
}
function deflateStored(bytes) {
  const result=[0x78,0x01];
  let i=0;
  while(i<bytes.length){
    const len=Math.min(65535,bytes.length-i),final=i+len===bytes.length;
    result.push(final?1:0,len&255,(len>>>8)&255,(~len)&255,((~len)>>>8)&255);
    for(let j=0;j<len;j++)result.push(bytes[i+j]);
    i+=len;
  }
  let a=1,b=0;
  for(const v of bytes){a=(a+v)%65521;b=(b+a)%65521;}
  result.push(...u32(((b<<16)|a)>>>0));
  return result;
}
function base64(bytes) {
  let output='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2];
    output+=ABC[a>>>2];
    output+=ABC[((a&3)<<4)|(b===undefined?0:b>>>4)];
    output+=b===undefined?'=':ABC[((b&15)<<2)|(c===undefined?0:c>>>6)];
    output+=c===undefined?'=':ABC[c&63];
  }
  return output;
}
export function signaturePngDataUri(signature) {
  if(!Array.isArray(signature?.paths)||!signature.paths.length)return null;
  const width=400,height=200;
  const sourceW=Math.max(1,Number(signature.w)||320),sourceH=Math.max(1,Number(signature.h)||180);
  const pixels=new Uint8Array(width*height).fill(255);
  const draw=(x,y)=>{
    const cx=Math.round(x*width/sourceW),cy=Math.round(y*height/sourceH);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const px=cx+dx,py=cy+dy;
      if(px>=0&&px<width&&py>=0&&py<height)pixels[py*width+px]=15;
    }
  };
  const segment=(x1,y1,x2,y2)=>{
    const steps=Math.min(10000,Math.max(1,Math.ceil(Math.max(
      Math.abs((x2-x1)*width/sourceW),Math.abs((y2-y1)*height/sourceH))*1.5)));
    for(let k=0;k<=steps;k++){const t=k/steps;draw(x1+(x2-x1)*t,y1+(y2-y1)*t);}
  };
  let strokes=0;
  for(const source of signature.paths){
    const value=String(source||'').slice(0,300000);
    const re=/([MLml])\s*(-?\d+(?:\.\d+)?)\s*[,\s]+(-?\d+(?:\.\d+)?)/g;
    let previous=null,match;
    while((match=re.exec(value))){
      const cmd=match[1],relative=cmd===cmd.toLowerCase();
      const x=Number(match[2])+(relative?previous?.[0]||0:0);
      const y=Number(match[3])+(relative?previous?.[1]||0:0);
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      if(cmd.toUpperCase()==='M'||!previous){draw(x,y);previous=[x,y];strokes++;continue;}
      segment(previous[0],previous[1],x,y);
      previous=[x,y];strokes++;
    }
  }
  if(!strokes)return null;
  const scan=new Uint8Array(height*(width+1));
  for(let y=0;y<height;y++){
    scan[y*(width+1)]=0;
    scan.set(pixels.subarray(y*width,(y+1)*width),y*(width+1)+1);
  }
  const header=[...u32(width),...u32(height),8,0,0,0,0];
  const encoded=[...PNG_SIGNATURE,...pngChunk('IHDR',header),
    ...pngChunk('IDAT',deflateStored(scan)),...pngChunk('IEND',[])];
  return 'data:image/png;base64,'+base64(encoded);
}
