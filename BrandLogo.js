import React from 'react';
import { Image, Text, View } from 'react-native';
import { styles } from './styles.js';

/**
 * Version compatible Expo Snack.
 * Les logos PNG locaux sont volontairement désactivés sur cette branche :
 * l'import Git de Snack échoue actuellement pendant l'upload des assets binaires.
 * Les marques gardent un affichage propre via leurs initiales, et un logo distant
 * reste pris en charge lorsqu'un logo_uri est fourni.
 */
export function getBrandLogoSource() {
  return null;
}

export function BrandMark({ marque, compact = false }) {
  const nom = typeof marque === 'string' ? marque : marque?.nom || marque?.marque || '';
  const remoteUri = typeof marque === 'object' ? marque?.logo_uri : null;

  if (remoteUri) {
    return (
      <Image
        source={{ uri: remoteUri }}
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
