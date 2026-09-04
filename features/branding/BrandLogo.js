import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';
import { EQUIPMENT_BRAND_DOMAINS, normaliserMarqueVisuelle } from '../../equipmentVisuals.js';

const RAW_BASE = 'https://raw.githubusercontent.com/SANS-COLORANT/VISITE-TECHNIQUE/3af148f5a3793e64634629d56f7fac1dd466e6c9/assets/brands';

// Assets locaux/pinnés dont le rendu est fiable.
// Lowara et Reflex sont volontairement exclus ici : leurs anciens PNG contiennent
// un fond interne qui provoquait les rectangles blancs sur les cartes colorées.
const BRAND_LOGOS = {
  atlantic: `${RAW_BASE}/atlantic.png`,
  bosch: `${RAW_BASE}/bosch.png`,
  danfoss: `${RAW_BASE}/danfoss.png`,
  'de dietrich': `${RAW_BASE}/de-dietrich.png`,
  grundfos: `${RAW_BASE}/grundfos.png`,
  kamstrup: `${RAW_BASE}/kamstrup.png`,
  ksb: `${RAW_BASE}/ksb.png`,
  sauter: `${RAW_BASE}/sauter.png`,
  'schneider electric': `${RAW_BASE}/schneider-electric.png`,
  siemens: `${RAW_BASE}/siemens.png`,
  viessmann: `${RAW_BASE}/viessmann.png`,
  weishaupt: `${RAW_BASE}/weishaupt.png`,
  wilo: `${RAW_BASE}/wilo.png`,
};

export function normaliserMarque(nom='') {
  return normaliserMarqueVisuelle(nom);
}

function getNomMarque(marque){
  return typeof marque==='string' ? marque : (marque?.marque || marque?.nom || '');
}

const BRAND_PROFILES = {
  grundfos:{color:'#005696',display:'GRUNDFOS',size:19,style:{fontWeight:'900',letterSpacing:-.45}},
  wilo:{color:'#009B67',display:'wilo',size:24,style:{fontWeight:'900',fontStyle:'italic',letterSpacing:-.55}},
  lowara:{color:'#4A5560',display:'Lowara',size:22,style:{fontWeight:'800',fontStyle:'italic'}},
  ksb:{color:'#00549F',display:'KSB',size:22,style:{fontWeight:'900',letterSpacing:.8}},
  salmson:{color:'#B4205A',display:'Salmson',size:21,style:{fontWeight:'800',fontStyle:'italic'}},
  'de dietrich':{color:'#E30613',display:'De Dietrich',size:18,style:{fontWeight:'800'}},
  viessmann:{color:'#F26A21',display:'VIESSMANN',size:18,style:{fontWeight:'900',letterSpacing:-.4}},
  atlantic:{color:'#6840A8',display:'ATLANTIC',size:21,style:{fontWeight:'900',letterSpacing:.35}},
  chappee:{color:'#D71920',display:'CHAPPÉE',size:19,style:{fontWeight:'900',letterSpacing:.35}},
  bosch:{color:'#D71920',display:'BOSCH',size:20,style:{fontWeight:'900',letterSpacing:.55}},
  vaillant:{color:'#007C83',display:'Vaillant',size:20,style:{fontWeight:'800'}},
  weishaupt:{color:'#D71920',display:'weishaupt',size:18,style:{fontWeight:'800'}},
  'alfa laval':{color:'#1B365D',display:'ALFA LAVAL',size:16,style:{fontWeight:'900',letterSpacing:.9}},
  swep:{color:'#D32A20',display:'SWEP',size:22,style:{fontWeight:'900',fontStyle:'italic'}},
  reflex:{color:'#2D9997',display:'reflex',size:22,style:{fontWeight:'800'}},
  zilmet:{color:'#275EB2',display:'ZILMET',size:18,style:{fontWeight:'900',letterSpacing:.8}},
  bwt:{color:'#175BA7',display:'BWT',size:22,style:{fontWeight:'900',letterSpacing:1}},
  culligan:{color:'#0066B3',display:'Culligan',size:19,style:{fontWeight:'800',fontStyle:'italic'}},
  fernox:{color:'#34323A',display:'FERNOX',size:19,style:{fontWeight:'900',letterSpacing:.8}},
  spirotech:{color:'#F2A900',display:'Spirotech',size:18,style:{fontWeight:'800'}},
  caleffi:{color:'#009A44',display:'CALEFFI',size:18,style:{fontWeight:'900',letterSpacing:.8}},
  siemens:{color:'#009999',display:'SIEMENS',size:19,style:{fontWeight:'900',letterSpacing:1}},
  'schneider electric':{color:'#2E9C42',display:'Schneider Electric',size:17,style:{fontWeight:'800'}},
  wit:{color:'#ED6B23',display:'WIT',size:23,style:{fontWeight:'900',letterSpacing:1.2}},
  sofrel:{color:'#3565B0',display:'SOFREL',size:20,style:{fontWeight:'900',letterSpacing:.7}},
  kamstrup:{color:'#E30613',display:'Kamstrup',size:19,style:{fontWeight:'800'}},
  itron:{color:'#9A5A8A',display:'Itron',size:21,style:{fontWeight:'800'}},
  danfoss:{color:'#E30613',display:'DANFOSS',size:19,style:{fontWeight:'900',fontStyle:'italic'}},
  sauter:{color:'#147DB0',display:'SAUTER',size:19,style:{fontWeight:'900',letterSpacing:.75}},
  belimo:{color:'#0057A6',display:'BELIMO',size:20,style:{fontWeight:'900',letterSpacing:.9}},
  wika:{color:'#184DA0',display:'WIKA',size:21,style:{fontWeight:'900',letterSpacing:1}},
  honeywell:{color:'#A95A17',display:'Honeywell',size:18,style:{fontWeight:'800'}},
  daikin:{color:'#0085CA',display:'DAIKIN',size:20,style:{fontWeight:'900',fontStyle:'italic',letterSpacing:.5}},
  systemair:{color:'#D71920',display:'Systemair',size:18,style:{fontWeight:'900'}},
  ciat:{color:'#005AA9',display:'CIAT',size:23,style:{fontWeight:'900',letterSpacing:1.5}},
  trane:{color:'#00549E',display:'TRANE',size:20,style:{fontWeight:'900',letterSpacing:.65}},
  carrier:{color:'#00529B',display:'Carrier',size:20,style:{fontWeight:'800',fontStyle:'italic'}},
  aldes:{color:'#005AA9',display:'ALDES',size:21,style:{fontWeight:'900',letterSpacing:.7}},
  's&p unelvent':{color:'#D71920',display:'S&P UNELVENT',size:16,style:{fontWeight:'900'}},
  vim:{color:'#1F6E9C',display:'VIM',size:23,style:{fontWeight:'900',letterSpacing:1}},
  'france air':{color:'#0068A9',display:'FRANCE AIR',size:17,style:{fontWeight:'900'}},
  swegon:{color:'#111827',display:'Swegon',size:20,style:{fontWeight:'900'}},
  flaktgroup:{color:'#E1251B',display:'FläktGroup',size:18,style:{fontWeight:'900'}},
  'flakt woods':{color:'#E1251B',display:'Fläkt Woods',size:17,style:{fontWeight:'900'}},
  wolf:{color:'#D71920',display:'WOLF',size:23,style:{fontWeight:'900',letterSpacing:1}},
  trox:{color:'#00529B',display:'TROX',size:23,style:{fontWeight:'900',letterSpacing:1}},
  helios:{color:'#E30613',display:'HELIOS',size:20,style:{fontWeight:'900'}},
  vortice:{color:'#0066A4',display:'VORTICE',size:19,style:{fontWeight:'900'}},
  komfovent:{color:'#1E6C52',display:'KOMFOVENT',size:16,style:{fontWeight:'900'}},
  salda:{color:'#005C95',display:'SALDA',size:21,style:{fontWeight:'900'}},
  zehnder:{color:'#D71920',display:'ZEHNDER',size:19,style:{fontWeight:'900'}},
  nilan:{color:'#3D7B40',display:'NILAN',size:21,style:{fontWeight:'900'}},
  rosenberg:{color:'#005A9C',display:'ROSENBERG',size:17,style:{fontWeight:'900'}},
  'nicotra gebhardt':{color:'#D71920',display:'NICOTRA GEBHARDT',size:14,style:{fontWeight:'900'}},
  aircalo:{color:'#1F5D8D',display:'AIRCALO',size:20,style:{fontWeight:'900'}},
  lennox:{color:'#D71920',display:'LENNOX',size:20,style:{fontWeight:'900'}},
  schako:{color:'#005B91',display:'SCHAKO',size:20,style:{fontWeight:'900'}},
  novenco:{color:'#005B91',display:'NOVENCO',size:19,style:{fontWeight:'900'}},
  halton:{color:'#005A9C',display:'HALTON',size:20,style:{fontWeight:'900'}},
};

export const BRAND_COLORS = Object.fromEntries(Object.entries(BRAND_PROFILES).map(([k,v])=>[k,v.color]));

export function getBrandColor(marque){
  const key=normaliserMarque(getNomMarque(marque));
  if(BRAND_PROFILES[key]) return BRAND_PROFILES[key].color;
  const palette=['#315B7D','#2A7A72','#8A4F7D','#9A6A32','#526AA3','#6A7B35','#A34E4E'];
  let hash=0;
  for(let i=0;i<key.length;i++) hash=((hash<<5)-hash+key.charCodeAt(i))|0;
  return palette[Math.abs(hash)%palette.length];
}

export function mixWithWhite(hex,ratio){
  const clean=hex.replace('#','');
  const value=parseInt(clean.length===3?clean.split('').map(c=>c+c).join(''):clean,16);
  const r=(value>>16)&255,g=(value>>8)&255,b=value&255;
  const mix=c=>Math.round(c+(255-c)*ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function sourceLogoPourMarque(marque){
  const key=normaliserMarque(getNomMarque(marque));
  // Les assets validés ont toujours priorité sur une ancienne URL SQLite.
  if(BRAND_LOGOS[key]) return {uri:BRAND_LOGOS[key]};
  const custom=typeof marque==='object'?marque?.logo_uri:null;
  if(custom) return {uri:custom};
  if(EQUIPMENT_BRAND_DOMAINS[key]) return {uri:`https://img.logokit.com/${EQUIPMENT_BRAND_DOMAINS[key]}`};
  return null;
}

export function getBrandLogoSource(marque){ return sourceLogoPourMarque(marque); }

function Wordmark({nom,compact=false,onColor=false}){
  const key=normaliserMarque(nom);
  const p=BRAND_PROFILES[key]||{};
  const display=p.display||nom;
  const fontSize=compact?Math.max(14,(p.size||19)-3):(p.size||19);
  return <Text
    numberOfLines={1}
    adjustsFontSizeToFit
    minimumFontScale={.56}
    style={{
      color:onColor?'#FFFFFF':'#31343A',
      fontSize,
      fontWeight:'800',
      maxWidth:compact?84:110,
      textAlign:'center',
      ...(p.style||{}),
    }}
  >{display}</Text>;
}

function LogoWithHalo({source,width,height,onError}){
  // Deux calques de la même image : le calque arrière crée uniquement un fin halo
  // blanc suivant l'alpha du logo. Aucun rectangle blanc n'est ajouté.
  return <View style={{width,height,alignItems:'center',justifyContent:'center'}}>
    <Image
      source={source}
      resizeMode="contain"
      style={{position:'absolute',width:width+4,height:height+4,tintColor:'#FFFFFF',opacity:.96}}
      onError={onError}
    />
    <Image
      source={source}
      resizeMode="contain"
      style={{width,height}}
      onError={onError}
    />
  </View>;
}

export function BrandMark({marque,compact=false,onColor=false}){
  const nom=getNomMarque(marque);
  const source=useMemo(()=>sourceLogoPourMarque(marque),[marque,nom]);
  const[imageFailed,setImageFailed]=useState(false);
  useEffect(()=>setImageFailed(false),[source?.uri]);

  const boxW=compact?84:112;
  const boxH=compact?44:58;
  const logoW=compact?78:104;
  const logoH=compact?38:48;

  if(source&&!imageFailed){
    if(onColor){
      return <LogoWithHalo source={source} width={logoW} height={logoH} onError={()=>setImageFailed(true)}/>;
    }
    return <Image
      source={source}
      style={[styles.brandLogo,compact&&styles.brandLogoCompact,{width:boxW,height:boxH}]}
      resizeMode="contain"
      onError={()=>setImageFailed(true)}
    />;
  }

  if(onColor){
    return <View style={{width:boxW,height:boxH,alignItems:'center',justifyContent:'center'}}><Wordmark nom={nom} compact={compact} onColor/></View>;
  }

  return <View style={[styles.brandFallback,compact&&styles.brandFallbackCompact,{width:boxW,height:boxH,borderRadius:10}]}>
    <Wordmark nom={nom} compact={compact}/>
  </View>;
}
