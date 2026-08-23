import React from 'react';
import { Image, Text, View } from 'react-native';
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

export function getBrandLogoSource(marque) {
  const nom = getNomMarque(marque);
  const uri = BRAND_LOGOS[normaliserMarque(nom)] || null;
  return uri ? { uri } : null;
}

export function BrandMark({ marque, compact = false }) {
  const nom = getNomMarque(marque);
  const remoteSource = getBrandLogoSource(marque);
  const customRemoteUri = typeof marque === 'object' ? marque?.logo_uri : null;
  const source = customRemoteUri ? { uri: customRemoteUri } : remoteSource;

  if (source) {
    return (
      <Image
        source={source}
        style={[styles.brandLogo, compact && styles.brandLogoCompact]}
        resizeMode="contain"
      />
    );
  }

  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  return (
    <View style={[styles.brandFallback, compact && styles.brandFallbackCompact]}>
      <Text style={styles.brandFallbackText}>{initiales}</Text>
    </View>
  );
}
