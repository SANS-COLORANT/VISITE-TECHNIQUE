import React from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import { styles } from './styles.js';

// Commit figé contenant les logos. Utiliser un SHA évite toute ambiguïté liée
// au nom de branche avec des slashs et garantit des URL raw stables dans Snack.
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

// Couleur dominante de chaque fabricant. Les marques non listées reçoivent
// automatiquement une teinte stable calculée à partir de leur nom.
const BRAND_COLORS = {
  danfoss: '#E30613',
  grundfos: '#005696',
  wilo: '#009B67',
  ksb: '#00549F',
  siemens: '#009999',
  viessmann: '#F26A21',
  atlantic: '#6840A8',
  'schneider electric': '#00A651',
  ariston: '#D71920',
  'imi hydronic': '#009AA6',
  belimo: '#0057A6',
  sfa: '#298FCE',
  toshiba: '#F59C00',
  daikin: '#0085CA',
  hitachi: '#D71920',
  caleffi: '#009A44',
  honeywell: '#B58A4C',
  'johnson controls': '#31566B',
  ebara: '#F5A623',
  lowara: '#3E515B',
  pedrollo: '#006EB6',
  dab: '#B21E4B',
  reflex: '#008C88',
  acv: '#5E6366',
  giacomini: '#B51230',
  spirotech: '#F2A900',
  bwt: '#00529B',
  bosch: '#D71920',
  'de dietrich': '#E30613',
  kamstrup: '#E30613',
  sauter: '#005A9C',
  weishaupt: '#D71920',
  'alfa laval': '#1B365D',
  vaillant: '#007C83',
  'saunier duval': '#E30613',
  frisquet: '#315B50',
  'elm leblanc': '#0073A8',
  chappee: '#D71920',
  chaffoteaux: '#E30613',
  fernox: '#242424',
  culligan: '#0066B3',
  zilmet: '#D71920',
  spirotech: '#F2A900',
  wika: '#005AA9',
  desautel: '#D71920',
};

function normaliserMarque(nom = '') {
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
  // Un objet équipement/modèle peut avoir à la fois `nom` (nom du modèle)
  // et `marque` (fabricant). Il faut toujours privilégier `marque`.
  return marque?.marque || marque?.nom || '';
}

function couleurDepuisNom(nom) {
  const key = normaliserMarque(nom);
  if (BRAND_COLORS[key]) return BRAND_COLORS[key];
  const palette = ['#315B7D', '#2A7A72', '#8A4F7D', '#9A6A32', '#526AA3', '#6A7B35', '#A34E4E'];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function mixWithWhite(hex, ratio) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (c) => Math.round(c + (255 - c) * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function getBrandLogoSource(marque) {
  const nom = getNomMarque(marque);
  const uri = BRAND_LOGOS[normaliserMarque(nom)] || null;
  return uri ? { uri } : null;
}

function GradientBackdrop({ nom }) {
  const { width } = useWindowDimensions();
  const base = couleurDepuisNom(nom);
  // Largeur volontairement supérieure à la carte : le fond part du composant
  // logo à gauche et déborde sous tout le contenu, smartphone comme tablette.
  const backdropWidth = Math.max(360, width - 36);
  const stops = [0, 0.10, 0.22, 0.38, 0.56, 0.73, 0.87, 0.96];
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: -14, top: -14, width: backdropWidth,
        height: 112, borderRadius: 13, overflow: 'hidden', flexDirection: 'row',
      }}
    >
      {stops.map((ratio, index) => (
        <View key={index} style={{ flex: 1, backgroundColor: mixWithWhite(base, ratio) }} />
      ))}
    </View>
  );
}

export function BrandMark({ marque, compact = false }) {
  const nom = getNomMarque(marque);
  const remoteSource = getBrandLogoSource(marque);
  const customRemoteUri = typeof marque === 'object' ? marque?.logo_uri : null;
  const source = customRemoteUri ? { uri: customRemoteUri } : remoteSource;

  // Deux contextes correspondent aux grandes cartes du catalogue :
  // - onglet Marques : l'objet possède nb_modeles ;
  // - onglet Modèles : marquePourModele fournit seulement marque + logo_uri.
  const isCatalogueBrand = typeof marque === 'object' && marque?.nb_modeles !== undefined;
  const isCatalogueModel = typeof marque === 'object' && !!marque?.marque && !marque?.nom && !marque?.categorie && !marque?.modele;
  const fullGradient = isCatalogueBrand || isCatalogueModel;

  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      {fullGradient ? <GradientBackdrop nom={nom} /> : null}
      {source ? (
        <Image
          source={source}
          style={[
            styles.brandLogo,
            compact && styles.brandLogoCompact,
            fullGradient && { tintColor: '#FFFFFF', width: compact ? 52 : 58, height: compact ? 28 : 42 },
          ]}
          resizeMode="contain"
        />
      ) : (
        <View style={[
          styles.brandFallback,
          compact && styles.brandFallbackCompact,
          fullGradient && { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
        ]}>
          <Text style={[styles.brandFallbackText, fullGradient && { color: '#FFFFFF' }]}>{initiales}</Text>
        </View>
      )}
    </View>
  );
}
