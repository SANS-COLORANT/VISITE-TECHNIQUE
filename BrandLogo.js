import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';

const RAW_BASE = 'https://raw.githubusercontent.com/SANS-COLORANT/VISITE-TECHNIQUE/3af148f5a3793e64634629d56f7fac1dd466e6c9/assets/brands';

const BRAND_LOGOS = {
  atlantic: `${RAW_BASE}/atlantic.png`,
  bosch: `${RAW_BASE}/bosch.png`,
  danfoss: `${RAW_BASE}/danfoss.png`,
  'de dietrich': `${RAW_BASE}/de-dietrich.png`,
  grundfos: `${RAW_BASE}/grundfos.png`,
  kamstrup: `${RAW_BASE}/kamstrup.png`,
  ksb: `${RAW_BASE}/ksb.png`,
  lowara: `${RAW_BASE}/lowara.png`,
  reflex: `${RAW_BASE}/reflex.png`,
  sauter: `${RAW_BASE}/sauter.png`,
  'schneider electric': `${RAW_BASE}/schneider-electric.png`,
  siemens: `${RAW_BASE}/siemens.png`,
  viessmann: `${RAW_BASE}/viessmann.png`,
  weishaupt: `${RAW_BASE}/weishaupt.png`,
  wilo: `${RAW_BASE}/wilo.png`,
};

const BRAND_DOMAINS = {
  'alfa laval': 'alfalaval.com', ariston: 'ariston.com', belimo: 'belimo.com', bwt: 'bwt.com',
  caleffi: 'caleffi.com', chaffoteaux: 'chaffoteaux.fr', chappee: 'chappee.com', culligan: 'culligan.fr',
  dab: 'dabpumps.com', daikin: 'daikin.com', desautel: 'desautel.fr', ebara: 'ebara.com',
  'elm leblanc': 'elmleblanc.fr', fernox: 'fernox.com', frisquet: 'frisquet.com', giacomini: 'giacomini.com',
  hitachi: 'hitachi.com', honeywell: 'honeywell.com', 'imi hydronic': 'imi-hydronic.com',
  'johnson controls': 'johnsoncontrols.com', pedrollo: 'pedrollo.com', salmson: 'salmson.com',
  'saunier duval': 'saunierduval.fr', sfa: 'sfa.fr', sofrel: 'sofrel.com', spirotech: 'spirotech.com',
  swep: 'swep.net', toshiba: 'toshiba.com', vaillant: 'vaillant.fr', wika: 'wika.com', zilmet: 'zilmet.it',
  itron: 'itron.com', acv: 'acv.com', samson: 'samsongroup.com',
};

export const BRAND_COLORS = {
  danfoss: '#E30613', grundfos: '#005696', wilo: '#009B67', ksb: '#00549F', siemens: '#009999',
  viessmann: '#F26A21', atlantic: '#6840A8', 'schneider electric': '#2E9C42', ariston: '#D71920',
  'imi hydronic': '#009AA6', belimo: '#0057A6', sfa: '#298FCE', toshiba: '#F59C00', daikin: '#0085CA',
  hitachi: '#D71920', caleffi: '#009A44', honeywell: '#A95A17', 'johnson controls': '#31566B', ebara: '#F5A623',
  lowara: '#4A5560', pedrollo: '#006EB6', dab: '#2B7A3D', reflex: '#2D9997', acv: '#666A70', giacomini: '#B51230',
  spirotech: '#F2A900', bwt: '#175BA7', bosch: '#D71920', 'de dietrich': '#E30613', kamstrup: '#E30613',
  sauter: '#147DB0', weishaupt: '#D71920', 'alfa laval': '#1B365D', vaillant: '#007C83', 'saunier duval': '#D71920',
  frisquet: '#315B50', 'elm leblanc': '#0073A8', chappee: '#D71920', chaffoteaux: '#E30613', fernox: '#34323A',
  culligan: '#0066B3', zilmet: '#275EB2', wika: '#184DA0', desautel: '#D71920', salmson: '#B4205A',
  sofrel: '#3565B0', swep: '#D32A20', itron: '#9A5A8A', samson: '#A94168',
};

export function normaliserMarque(nom = '') {
  return String(nom)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getNomMarque(marque) {
  if (typeof marque === 'string') return marque;
  return marque?.marque || marque?.nom || '';
}

export function getBrandColor(marque) {
  const nom = getNomMarque(marque);
  const key = normaliserMarque(nom);
  if (BRAND_COLORS[key]) return BRAND_COLORS[key];
  const palette = ['#315B7D', '#2A7A72', '#8A4F7D', '#9A6A32', '#526AA3', '#6A7B35', '#A34E4E'];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function mixWithWhite(hex, ratio) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (c) => Math.round(c + (255 - c) * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function sourceLogoPourMarque(marque) {
  const key = normaliserMarque(getNomMarque(marque));
  const custom = typeof marque === 'object' ? marque?.logo_uri : null;
  if (custom) return { uri: custom };
  if (BRAND_LOGOS[key]) return { uri: BRAND_LOGOS[key] };
  if (BRAND_DOMAINS[key]) return { uri: `https://img.logokit.com/${BRAND_DOMAINS[key]}` };
  return null;
}

export function getBrandLogoSource(marque) {
  return sourceLogoPourMarque(marque);
}

function Wordmark({ nom, compact }) {
  const key = normaliserMarque(nom);
  const custom = {
    danfoss: { fontStyle: 'italic', fontWeight: '900' },
    wilo: { fontStyle: 'italic', fontWeight: '900' },
    siemens: { fontWeight: '900', letterSpacing: 0.4 },
    swep: { fontWeight: '900', fontStyle: 'italic' },
    fernox: { fontWeight: '900', letterSpacing: 0.5 },
    honeywell: { fontWeight: '800' },
  }[key] || {};
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.68}
      style={{
        color: '#FFFFFF',
        fontSize: compact ? 16 : 19,
        fontWeight: '800',
        maxWidth: compact ? 70 : 92,
        textAlign: 'center',
        ...custom,
      }}
    >
      {nom}
    </Text>
  );
}

export function BrandMark({ marque, compact = false, onColor = false }) {
  const nom = getNomMarque(marque);
  const source = useMemo(() => sourceLogoPourMarque(marque), [marque, nom]);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [source?.uri]);

  const width = compact ? 72 : 98;
  const height = compact ? 38 : 52;

  if (!onColor) {
    if (source && !imageFailed) {
      return (
        <Image
          source={source}
          style={[styles.brandLogo, compact && styles.brandLogoCompact, { width, height }]}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
        />
      );
    }
    return (
      <View style={[styles.brandFallback, compact && styles.brandFallbackCompact, { width, height, borderRadius: 10 }]}>
        <Text style={styles.brandFallbackText}>{nom.slice(0, 2).toUpperCase() || '?'}</Text>
      </View>
    );
  }

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {source && !imageFailed ? (
        <Image
          source={source}
          style={{ width: width - 4, height: height - 4, tintColor: '#FFFFFF' }}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Wordmark nom={nom} compact={compact} />
      )}
    </View>
  );
}
