import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';

const RAW_BASE = 'https://raw.githubusercontent.com/SANS-COLORANT/VISITE-TECHNIQUE/3af148f5a3793e64634629d56f7fac1dd466e6c9/assets/brands';

// Assets du dépôt dont le fond transparent est fiable sur une carte colorée.
const SAFE_LOCAL_LOGOS = {
  grundfos: `${RAW_BASE}/grundfos.png`,
  ksb: `${RAW_BASE}/ksb.png`,
  danfoss: `${RAW_BASE}/danfoss.png`,
  'de dietrich': `${RAW_BASE}/de-dietrich.png`,
  'schneider electric': `${RAW_BASE}/schneider-electric.png`,
};

// Pour les autres marques on préfère un logo transparent réel plutôt qu'un faux wordmark.
// Si la ressource distante échoue, BrandMark retombe automatiquement sur le wordmark.
const BRAND_DOMAINS = {
  grundfos:'grundfos.com', wilo:'wilo.com', lowara:'xylem.com', ksb:'ksb.com', salmson:'salmson.com',
  'de dietrich':'dedietrich-thermique.fr', viessmann:'viessmann.com', atlantic:'atlantic.fr', chappee:'chappee.com',
  bosch:'bosch.com', vaillant:'vaillant.com', weishaupt:'weishaupt.de', 'alfa laval':'alfalaval.com', swep:'swep.net',
  reflex:'reflex-winkelmann.com', zilmet:'zilmet.it', bwt:'bwt.com', culligan:'culligan.com', fernox:'fernox.com',
  spirotech:'spirotech.com', caleffi:'caleffi.com', siemens:'siemens.com', 'schneider electric':'se.com', wit:'wit.fr',
  sofrel:'sofrel.com', kamstrup:'kamstrup.com', itron:'itron.com', danfoss:'danfoss.com', sauter:'sauter-controls.com',
  belimo:'belimo.com', wika:'wika.com', honeywell:'honeywell.com', daikin:'daikin.com', systemair:'systemair.com',
  ciat:'ciat.com', trane:'trane.com', carrier:'carrier.com', ariston:'ariston.com', 'imi hydronic':'imi-hydronic.com',
  sfa:'sfa.fr', toshiba:'toshiba.com', hitachi:'hitachi.com', ebara:'ebara.com', pedrollo:'pedrollo.com',
  dab:'dabpumps.com', acv:'acv.com', giacomini:'giacomini.com', 'saunier duval':'saunierduval.fr', frisquet:'frisquet.com',
  'elm leblanc':'elmleblanc.fr', chaffoteaux:'chaffoteaux.fr', desautel:'desautel.fr', samson:'samsongroup.com',
};

export const BRAND_COLORS = {
  danfoss:'#E30613', grundfos:'#005696', wilo:'#009B67', ksb:'#00549F', siemens:'#009999', viessmann:'#F26A21',
  atlantic:'#6840A8', 'schneider electric':'#2E9C42', ariston:'#D71920', 'imi hydronic':'#009AA6', belimo:'#0057A6',
  sfa:'#298FCE', toshiba:'#F59C00', daikin:'#0085CA', hitachi:'#D71920', caleffi:'#009A44', honeywell:'#A95A17',
  'johnson controls':'#31566B', ebara:'#F5A623', lowara:'#3E586B', pedrollo:'#006EB6', dab:'#2B7A3D', reflex:'#2D9997',
  acv:'#666A70', giacomini:'#B51230', spirotech:'#F2A900', bwt:'#175BA7', bosch:'#D71920', 'de dietrich':'#E30613',
  kamstrup:'#E30613', sauter:'#147DB0', weishaupt:'#D71920', 'alfa laval':'#1B365D', vaillant:'#007C83',
  'saunier duval':'#D71920', frisquet:'#315B50', 'elm leblanc':'#0073A8', chappee:'#D71920', chaffoteaux:'#E30613',
  fernox:'#34323A', culligan:'#0066B3', zilmet:'#275EB2', wika:'#184DA0', desautel:'#D71920', salmson:'#B4205A',
  sofrel:'#3565B0', swep:'#D32A20', itron:'#9A5A8A', samson:'#A94168', ciat:'#005AA9', trane:'#00549E',
  carrier:'#00529B', systemair:'#D71920', wit:'#EB6B25',
};

export function normaliserMarque(nom='') {
  return String(nom).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[®™]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function getNomMarque(marque){ return typeof marque==='string' ? marque : (marque?.marque || marque?.nom || ''); }

export function getBrandColor(marque){
  const key=normaliserMarque(getNomMarque(marque));
  if(BRAND_COLORS[key]) return BRAND_COLORS[key];
  const palette=['#315B7D','#2A7A72','#8A4F7D','#9A6A32','#526AA3','#6A7B35','#A34E4E'];
  let hash=0; for(let i=0;i<key.length;i++) hash=((hash<<5)-hash+key.charCodeAt(i))|0;
  return palette[Math.abs(hash)%palette.length];
}

export function mixWithWhite(hex,ratio){
  const clean=hex.replace('#',''); const value=parseInt(clean.length===3?clean.split('').map(c=>c+c).join(''):clean,16);
  const r=(value>>16)&255,g=(value>>8)&255,b=value&255; const mix=c=>Math.round(c+(255-c)*ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function logoKitSource(key){
  const domain=BRAND_DOMAINS[key];
  return domain ? {uri:`https://img.logokit.com/${domain}`} : null;
}

function sourceLogoPourMarque(marque,{onColor=false}={}){
  const key=normaliserMarque(getNomMarque(marque));
  // Sur les cartes colorées : asset local fiable d'abord, sinon logo transparent réel.
  if(onColor){
    if(SAFE_LOCAL_LOGOS[key]) return {uri:SAFE_LOCAL_LOGOS[key]};
    const remote=logoKitSource(key); if(remote) return remote;
  }
  // Hors carte colorée : on accepte l'URL enregistrée en base puis LogoKit.
  const custom=typeof marque==='object'?marque?.logo_uri:null;
  if(custom) return {uri:custom};
  if(SAFE_LOCAL_LOGOS[key]) return {uri:SAFE_LOCAL_LOGOS[key]};
  return logoKitSource(key);
}
export function getBrandLogoSource(marque){ return sourceLogoPourMarque(marque); }

const WORDMARKS = {
  grundfos:{text:'GRUNDFOS',style:{fontWeight:'900',letterSpacing:-.45}},
  wilo:{text:'wilo',style:{fontWeight:'900',fontStyle:'italic',fontSize:24,letterSpacing:-.55}},
  lowara:{text:'Lowara',style:{fontWeight:'800',fontStyle:'italic',fontSize:22}},
  ksb:{text:'KSB',style:{fontWeight:'900',letterSpacing:.9}},
  salmson:{text:'Salmson',style:{fontWeight:'800',fontStyle:'italic'}},
  viessmann:{text:'VIESSMANN',style:{fontWeight:'900',fontSize:18,letterSpacing:-.4}},
  atlantic:{text:'ATLANTIC',style:{fontWeight:'900',fontSize:20,letterSpacing:.4}},
  bosch:{text:'BOSCH',style:{fontWeight:'900',letterSpacing:.55}},
  'alfa laval':{text:'ALFA LAVAL',style:{fontWeight:'900',fontSize:16,letterSpacing:.85}},
  swep:{text:'SWEP',style:{fontWeight:'900',fontStyle:'italic',fontSize:21}},
  reflex:{text:'reflex',style:{fontWeight:'800',fontSize:22,letterSpacing:-.3}},
  bwt:{text:'BWT',style:{fontWeight:'900',fontSize:22,letterSpacing:1}},
  siemens:{text:'SIEMENS',style:{fontWeight:'900',letterSpacing:1}},
  sofrel:{text:'SOFREL',style:{fontWeight:'900',letterSpacing:.65}},
  kamstrup:{text:'Kamstrup',style:{fontWeight:'800',letterSpacing:-.35}},
  danfoss:{text:'DANFOSS',style:{fontWeight:'900',fontStyle:'italic'}},
  sauter:{text:'SAUTER',style:{fontWeight:'900',letterSpacing:.7}},
  belimo:{text:'BELIMO',style:{fontWeight:'900',letterSpacing:.8}},
  wika:{text:'WIKA',style:{fontWeight:'900',letterSpacing:1}},
  daikin:{text:'DAIKIN',style:{fontWeight:'900',fontStyle:'italic',letterSpacing:.4}},
  systemair:{text:'Systemair',style:{fontWeight:'900'}},
  ciat:{text:'CIAT',style:{fontWeight:'900',fontSize:22,letterSpacing:1.5}},
  trane:{text:'TRANE',style:{fontWeight:'900',letterSpacing:.65}},
  carrier:{text:'Carrier',style:{fontWeight:'800',fontStyle:'italic',fontSize:20}},
};

function Wordmark({nom,compact=false}){
  const key=normaliserMarque(nom); const cfg=WORDMARKS[key]||{text:nom,style:{}};
  const adjusted={...cfg.style};
  if(compact && adjusted.fontSize) adjusted.fontSize=Math.max(14,adjusted.fontSize-3);
  return <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.56} style={{color:'#fff',fontSize:compact?16:19,fontWeight:'800',maxWidth:compact?82:108,textAlign:'center',...adjusted}}>{cfg.text}</Text>;
}

export function BrandMark({marque,compact=false,onColor=false}){
  const nom=getNomMarque(marque);
  const source=useMemo(()=>sourceLogoPourMarque(marque,{onColor}),[marque,nom,onColor]);
  const[imageFailed,setImageFailed]=useState(false);
  useEffect(()=>setImageFailed(false),[source?.uri]);
  const width=compact?82:110,height=compact?42:56;

  if(!onColor){
    if(source&&!imageFailed) return <Image source={source} style={[styles.brandLogo,compact&&styles.brandLogoCompact,{width,height}]} resizeMode="contain" onError={()=>setImageFailed(true)}/>;
    return <View style={[styles.brandFallback,compact&&styles.brandFallbackCompact,{width,height,borderRadius:10}]}><Text style={styles.brandFallbackText}>{nom.slice(0,2).toUpperCase()||'?'}</Text></View>;
  }

  // Le logo est teinté en blanc : sa vraie silhouette/typographie reste intacte sans boîte blanche.
  if(source&&!imageFailed){
    return <View style={{width,height,alignItems:'center',justifyContent:'center'}}>
      <Image source={source} style={{width:compact?80:104,height:compact?38:48,tintColor:'#FFFFFF'}} resizeMode="contain" onError={()=>setImageFailed(true)}/>
    </View>;
  }
  return <View style={{width,height,alignItems:'center',justifyContent:'center'}}><Wordmark nom={nom} compact={compact}/></View>;
}
