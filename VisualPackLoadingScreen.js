import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DoomLoadingScreen } from './DoomLoadingScreen.js';
import { MetraLoadingScreen } from './MetraLoadingScreen.js';
import { THEME_ANIMATED } from './themePreference.js';
import { VisualEffectLayer } from './VisualEffectLayer.js';
import { VisualPackAsset } from './VisualPackAsset.js';
import { VisualPackAnimatedLayer } from './VisualPackAnimatedLayer.js';
import { resolveVisualPackAssetUri } from './visualPackManager.js';

export function VisualPackLoadingScreen({ pack, themeMode }) {
  const base = pack?.startup?.base || (themeMode === THEME_ANIMATED ? 'doom' : 'classic');
  const logoUri = resolveVisualPackAssetUri(pack, pack?.startup?.logo);
  const layers = Array.isArray(pack?.startup?.layers) ? pack.startup.layers : [];
  const backgroundColor = pack?.startup?.backgroundColor || '#FBF0E1';

  return (
    <View style={[styles.root, { backgroundColor }]}>
      {base === 'doom' ? <DoomLoadingScreen /> : null}
      {base === 'classic' ? <MetraLoadingScreen /> : null}
      {base === 'none' ? <View style={[StyleSheet.absoluteFill, { backgroundColor }]} /> : null}

      {logoUri && layers.length === 0 ? (
        <View pointerEvents="none" style={styles.customLogoWrap}>
          <VisualPackAsset uri={logoUri} style={styles.customLogo} />
        </View>
      ) : null}

      {layers.map((layer, index) => (
        <VisualPackAnimatedLayer key={`${layer?.asset || 'layer'}-${index}`} pack={pack} layer={layer} />
      ))}

      <VisualEffectLayer effect={pack?.startup?.effect} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  customLogoWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customLogo: {
    width: 240,
    height: 180,
  },
});
