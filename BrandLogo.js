import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';

const RAW_BASE = 'https://raw.githubusercontent.com/SANS-COLORANT/VISITE-TECHNIQUE/3af148f5a3793e64634629d56f7fac1dd466e6c9/assets/brands';

const BRAND_LOGOS = {
  atlantic: `${RAW_BASE}/atlantic.png`, bosch: `${RAW_BASE}/bosch.png`, danfoss: `${RAW_BASE}/danfoss.png`,
  'de dietrich': `${RAW_BASE}/de-dietrich.png`, grundfos: `${RAW_BASE}/grundfos.png`, kamstrup: `${RAW_BASE}/kamstrup.png`,
  ksb: `${RAW_BASE}/ksb.png`, lowara: `${RAW_BASE}/lowara.png`, reflex: `${RAW_BASE}/reflex.png`, sauter: `${RAW_BASE}/sauter.png`,
  'schneider electric': `${RAW_BASE}/schneider-electric.png`, siemens: `${RAW_BASE}/siemens.png`, viessmann: `${RAW_BASE}/viessmann.png`,
  weishaupt: `${RAW_BASE}/weishaupt.png`, wilo: `${RAW_BASE}/wilo.png`,
};

const BRAND_DOMAINS = {
  'alfa laval':'alfalaval.com', bwt:'bwt.com', caleffi:'caleffi.com', carrier:'carrier.com', ciat:'ciat.com',
  culligan:'culligan.fr', daikin:'daikin.com', fernox:'fernox.com', honeywell:'honeywell.com', itron:'itron.com',
  belimo:'belimo.com', salmson:'salmson.com', sofrel:'sofrel.com', spirotech:'spirotech.com', swep:'swep.net',
  systemair:'systemair.com', trane:'trane.com', vaillant:'vaillant.fr', wika:'wika.com', zilmet:'zilmet.it',
  chappee:'chappee.com', 'saunier duval':'saunierduval.fr', wit:'wit.fr',
};

export function normaliserMarque(nom='') {
  return String(nom).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[®™]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function getNomMarque(marque){ return typeof marque==='string' ? marque : (marque?.marque || marque?.nom || ''); }

const BRAND_PROFILES = {
  grundfos:{color:'#005696',display:'GRUNDFOS',mode:'logo',size:96,style:{fontWeight:'900',letterSpacing:-.45}},
  wilo:{color:'#009B67',display:'wilo',mode:'wordmark',size:24,style:{fontWeight:'900',fontStyle:'italic',letterSpacing:-.55}},
  lowara:{color:'#4A5560',display:'Lowara',mode:'wordmark',size:22,style:{fontWeight:'800',fontStyle:'italic',letterSpacing:.05}},
  ksb:{color:'#00549F',display:'KSB',mode:'logo',size:92,style:{fontWeight:'900',letterSpacing:.8}},
  salmson:{color:'#B4205A',display:'Salmson',mode:'wordmark',size:21,style:{fontWeight:'800',fontStyle:'italic',letterSpacing:-.15}},
  'de dietrich':{color:'#E30613',display:'De Dietrich',mode:'logo',size:96,style:{fontWeight:'800',letterSpacing:-.15}},
  viessmann:{color:'#F26A21',display:'VIESSMANN',mode:'wordmark',size:18,style:{fontWeight:'900',letterSpacing:-.4}},
  atlantic:{color:'#6840A8',display:'ATLANTIC',mode:'wordmark',size:21,style:{fontWeight:'900',letterSpacing:.35}},
  chappee:{color:'#D71920',display:'CHAPPÉE',mode:'wordmark',size:19,style:{fontWeight:'900',letterSpacing:.35}},
  bosch:{color:'#D71920',display:'BOSCH',mode:'wordmark',size:20,style:{fontWeight:'900',letterSpacing:.55}},
  vaillant:{color:'#007C83',display:'Vaillant',mode:'wordmark',size:20,style:{fontWeight:'800',letterSpacing:-.25}},
  weishaupt:{color:'#D71920',display:'weishaupt',mode:'wordmark',size:18,style:{fontWeight:'800',letterSpacing:.15}},
  'alfa laval':{color:'#1B365D',display:'ALFA LAVAL',mode:'wordmark',size:16,style:{fontWeight:'900',letterSpacing:.9}},
  swep:{color:'#D32A20',display:'SWEP',mode:'wordmark',size:22,style:{fontWeight:'900',fontStyle:'italic',letterSpacing:.15}},
  reflex:{color:'#2D9997',display:'reflex',mode:'wordmark',size:22,style:{fontWeight:'800',letterSpacing:-.35}},
  zilmet:{color:'#275EB2',display:'ZILMET',mode:'wordmark',size:18,style:{fontWeight:'900',letterSpacing:.8}},
  bwt:{color:'#175BA7',display:'BWT',mode:'wordmark',size:22,style:{fontWeight:'900',letterSpacing:1}},
  culligan:{color:'#0066B3',display:'Culligan',mode:'wordmark',size:19,style:{fontWeight:'800',fontStyle:'italic',letterSpacing:-.2}},
  fernox:{color:'#34323A',display:'FERNOX',mode:'wordmark',size:19,style:{fontWeight:'900',letterSpacing:.8}},
  spirotech:{color:'#F2A900',display:'Spirotech',mode:'wordmark',size:18,style:{fontWeight:'800',letterSpacing:-.2}},
  caleffi:{color:'#009A44',display:'CALEFFI',mode:'wordmark',size:18,style:{fontWeight:'900',letterSpacing:.8}},
  siemens:{color:'#009999',display:'SIEMENS',mode:'wordmark',size:19,style:{fontWeight:'900',letterSpacing:1}},
  'schneider electric':{color:'#2E9C42',display:'Schneider Electric',mode:'logo',size:98,style:{fontWeight:'800',letterSpacing:-.15}},
  wit:{color:'#ED6B23',display:'WIT',mode:'wordmark',size:23,style:{fontWeight:'900',letterSpacing:1.2}},
  sofrel:{color:'#3565B0',display:'SOFREL',mode:'wordmark',size:20,style:{fontWeight:'900',letterSpacing:.7}},
  kamstrup:{color:'#E30613',display:'Kamstrup',mode:'wordmark',size:19,style:{fontWeight:'800',letterSpacing:-.4}},
  itron:{color:'#9A5A8A',display:'Itron',mode:'wordmark',size:21,style:{fontWeight:'800',letterSpacing:-.25}},
  danfoss:{color:'#E30613',display:'DANFOSS',mode:'logo',size:96,style:{fontWeight:'900',fontStyle:'italic'}},
  sauter:{color:'#147DB0',display:'SAUTER',mode:'wordmark',size:19,style:{fontWeight:'900',letterSpacing:.75}},
  belimo:{color:'#0057A6',display:'BELIMO',mode:'wordmark',size:20,style:{fontWeight:'900',letterSpacing:.9}},
  wika:{color:'#184DA0',display:'WIKA',mode:'wordmark',size:21,style:{fontWeight:'900',letterSpacing:1}},
  honeywell:{color:'#A95A17',display:'Honeywell',mode:'wordmark',size:18,style:{fontWeight:'800',letterSpacing:-.3}},
  daikin:{color:'#0085CA',display:'DAIKIN',mode:'wordmark',size:20,style:{fontWeight:'900',fontStyle:'italic',letterSpacing:.5}},
  systemair:{color:'#D71920',display:'Systemair',mode:'wordmark',size:18,style:{fontWeight:'900',letterSpacing:-.25}},
  ciat:{color:'#005AA9',display:'CIAT',mode:'wordmark',size:23,style:{fontWeight:'900',letterSpacing:1.5}},
  trane:{color:'#00549E',display:'TRANE',mode:'wordmark',size:20,style:{fontWeight:'900',letterSpacing:.65}},
  carrier:{color:'#00529B',display:'Carrier',mode:'wordmark',size:20,style:{fontWeight:'800',fontStyle:'italic',letterSpacing:-.1}},
};

export const BRAND_COLORS = Object.fromEntries(Object.entries(BRAND_PROFILES).map(([k,v])=>[k,v.color]));

export function getBrandColor(marque){
  const key=normaliserMarque(getNomMarque(marque));
  if(BRAND_PROFILES[key]) return BRAND_PROFILES[key].color;
  const palette=['#315B7D','#2A7A72','#8A4F7D','#9A6A32','#526AA3','#6A7B35','#A34E4E'];
  let hash=0; for(let i=0;i<key.length;i++) hash=((hash<<5)-hash+key.charCodeAt(i))|0;
  return palette[Math.abs(hash)%palette.length];
}

export function mixWithWhite(hex,ratio){
  const clean=hex.replace('#',''); const value=parseInt(clean.length===3?clean.split('').map(c=>c+c).join(''):clean,16);
  const r=(value>>16)&255,g=(value>>8)&255,b=value&255; const mix=c=>Math.round(c+(255-c)*ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function sourceLogoPourMarque(marque){
  const key=normaliserMarque(getNomMarque(marque));
  if(BRAND_LOGOS[key]) return {uri:BRAND_LOGOS[key]};
  const custom=typeof marque==='object'?marque?.logo_uri:null; if(custom) return {uri:custom};
  if(BRAND_DOMAINS[key]) return {uri:`https://img.logokit.com/${BRAND_DOMAINS[key]}`};
  return null;
}
export function getBrandLogoSource(marque){ return sourceLogoPourMarque(marque); }

function Wordmark({nom,compact=false}){
  const key=normaliserMarque(nom); const p=BRAND_PROFILES[key]||{};
  const display=p.display||nom; const fontSize=compact?Math.max(14,(p.size||19)-3):(p.size||19);
  return <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.56} style={{color:'#fff',fontSize,fontWeight:'800',maxWidth:compact?82:108,textAlign:'center',...(p.style||{})}}>{display}</Text>;
}

export function BrandMark({marque,compact=false,onColor=false}){
  const nom=getNomMarque(marque); const key=normaliserMarque(nom); const p=BRAND_PROFILES[key]||{};
  const source=useMemo(()=>sourceLogoPourMarque(marque),[marque,nom]); const[imageFailed,setImageFailed]=useState(false);
  useEffect(()=>setImageFailed(false),[source?.uri]);
  const width=compact?82:110,height=compact?42:56;

  if(!onColor){
    if(source&&!imageFailed) return <Image source={source} style={[styles.brandLogo,compact&&styles.brandLogoCompact,{width,height}]} resizeMode="contain" onError={()=>setImageFailed(true)}/>;
    return <View style={[styles.brandFallback,compact&&styles.brandFallbackCompact,{width,height,borderRadius:10}]}><Text style={styles.brandFallbackText}>{(p.display||nom).slice(0,2).toUpperCase()||'?'}</Text></View>;
  }

  if(p.mode==='logo'&&source&&!imageFailed){
    return <View style={{width,height,alignItems:'center',justifyContent:'center'}}><Image source={source} style={{width:compact?78:Math.min(102,p.size||100),height:compact?38:46,tintColor:'#FFFFFF'}} resizeMode="contain" onError={()=>setImageFailed(true)}/></View>;
  }
  return <View style={{width,height,alignItems:'center',justifyContent:'center'}}><Wordmark nom={nom} compact={compact}/></View>;
}
