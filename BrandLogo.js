import React from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';

const BRAND_LOGOS = {
  atlantic: require('./assets/brands/atlantic.png'),
  bosch: require('./assets/brands/bosch.png'),
  danfoss: require('./assets/brands/danfoss.png'),
  'de dietrich': require('./assets/brands/de-dietrich.png'),
  grundfos: require('./assets/brands/grundfos.png'),
  kamstrup: require('./assets/brands/kamstrup.png'),
  ksb: require('./assets/brands/ksb.png'),
  lowara: require('./assets/brands/lowara.png'),
  reflex: require('./assets/brands/reflex.png'),
  sauter: require('./assets/brands/sauter.png'),
  'schneider electric': require('./assets/brands/schneider-electric.png'),
  siemens: require('./assets/brands/siemens.png'),
  viessmann: require('./assets/brands/viessmann.png'),
  weishaupt: require('./assets/brands/weishaupt.png'),
  wilo: require('./assets/brands/wilo.png'),
};

function normaliserMarque(nom = '') {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function getBrandLogoSource(marque) {
  const nom = typeof marque === 'string' ? marque : marque?.nom || marque?.marque || '';
  return BRAND_LOGOS[normaliserMarque(nom)] || null;
}

export function BrandMark({ marque, compact = false }) {
  const nom = typeof marque === 'string' ? marque : marque?.nom || marque?.marque || '';
  const localSource = getBrandLogoSource(marque);
  const remoteUri = typeof marque === 'object' ? marque?.logo_uri : null;
  if (localSource || remoteUri) {
    return <Image source={localSource || { uri: remoteUri }} style={[styles.brandLogo, compact && styles.brandLogoCompact]} resizeMode="contain" />;
  }
  const initiales = nom.split(/\s+/).filter(Boolean).map((mot) => mot[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <View style={[styles.brandFallback, compact && styles.brandFallbackCompact]}><Text style={styles.brandFallbackText}>{initiales}</Text></View>;
}
