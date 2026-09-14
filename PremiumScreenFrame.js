import React from 'react';
import { View } from 'react-native';

const BG = '#F4F1E8';
const SURFACE = '#FFFDF8';
const BORDER = '#D8DDD9';

const IMMERSIVE = new Set(['Visite', 'Lab3D', 'HydraulicSchema']);

export function PremiumScreenFrame({ screen, children }) {
  if (!children) return null;
  if (IMMERSIVE.has(screen)) {
    return <View style={{ flex: 1, backgroundColor: SURFACE, paddingBottom: 64 }}>{children}</View>;
  }
  return <View style={{ flex: 1, backgroundColor: BG, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 72 }}>
    <View style={{
      flex: 1,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: BORDER,
      borderRadius: 24,
      overflow: 'hidden',
      shadowColor: '#14202C',
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    }}>
      {children}
    </View>
  </View>;
}
