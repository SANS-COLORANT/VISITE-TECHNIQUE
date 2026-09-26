/** Illustration des écrans vides : icône dans un rond, au-dessus du texte. */
import React from 'react';
import { View } from 'react-native';
import { IconOrb } from './premiumChrome.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS } from './styles.js';

export function EmptyIcon({ name = 'note' }) {
  return (
    <View style={{ marginBottom: 14, alignItems: 'center' }}>
      <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={62} radius={22}>
        <CvcIcon name={name} size={30} color={COLORS.orangeDark} />
      </IconOrb>
    </View>
  );
}
