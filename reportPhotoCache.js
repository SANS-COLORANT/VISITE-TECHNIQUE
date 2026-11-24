import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { AppState } from 'react-native';
import { createReportPhotoCache } from './reportPhotoCacheCore.js';

const cache=createReportPhotoCache({
  fs:FileSystem,root:FileSystem.cacheDirectory+'metra-report-jpeg-v2/',
  read:uri=>FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64}),
  encode:async(uri,cfg)=>(await ImageManipulator.manipulateAsync(uri,[{resize:{width:cfg.width}}],{
    compress:cfg.compress,format:ImageManipulator.SaveFormat.JPEG,base64:false
  }))?.uri,
});
let warming=false,exporting=0,lastPrune=0;
export const getReportPhotoData=(uri,size)=>cache.get(uri,size);
export const reportPhotoCacheStats=()=>cache.stats();
export function beginReportPhotoExport(){exporting++;}
export function endReportPhotoExport(){exporting=Math.max(0,exporting-1);pruneReportPhotoCache();}
export function pruneReportPhotoCache(){
  // Do not prune while an encoder or an export is using the cache.
  if(exporting||warming||cache.stats().pending||Date.now()-lastPrune<60000)return;
  lastPrune=Date.now();cache.prune().catch(()=>{});
}
export async function warmReportPhotos(photos,shouldStop=()=>false){
  // Warm one image at a time, and yield after each image. Never enqueue
  // hundreds of images in front of a foreground export/camera action.
  if(warming)return;
  warming=true;
  try{
    for(const p of photos){
      if(shouldStop()||exporting||AppState.currentState!=='active')break;
      if(p.include===false||p.exportAllowed===false||!p.uri)continue;
      await cache.get(p.uri,p.size,false).catch(()=>{});
      await new Promise(resolve=>setTimeout(resolve,40));
    }
  }finally{warming=false;pruneReportPhotoCache();}
}
export function warmCapturedReportPhoto(uri){
  if(!uri||exporting||warming||AppState.currentState!=='active')return;
  // Opportunistic only; the original and its durable SQL save take priority.
  setTimeout(()=>warmReportPhotos([{uri,include:true,size:'medium'}]).catch(()=>{}),800);
}
