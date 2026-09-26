/**
 * Dégradé des boutons principaux (DA "Verre chaud"). Posé en premier enfant
 * d'un bouton `styles.btnPrimary` : il remplit le bouton sous son libellé,
 * sans capter les appuis. `tone="mission"` donne le dégradé vert de Missions.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from './styles.js';
import { MISSION_COLORS } from './missionTheme.js';

function ButtonGlow({ tone = 'visite', radius = 17 }) {
  const colors = tone === 'mission'
    ? [MISSION_COLORS.accent, MISSION_COLORS.accentDark]
    : ['#F7813F', COLORS.orange, COLORS.orangeDark];
  return (
    <LinearGradient
      pointerEvents="none"
      colors={colors}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
    />
  );
}

export { ButtonGlow };
