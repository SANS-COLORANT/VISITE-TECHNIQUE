import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ClassicStartupAnimation } from '../classic/StartupAnimation.js';
import { DoomStartupAnimation } from '../doom/StartupAnimation.js';
import { VisualEffectLayer } from './VisualEffectLayer.js';
import { VisualPackAsset } from './VisualPackAsset.js';
import { VisualPackAnimatedLayer } from './VisualPackAnimatedLayer.js';
import { resolveVisualPackAssetUri } from './visualPackManager.js';

function BuiltinStartup({ preset }) {
  if (preset === 'metra-doom') return <DoomStartupAnimation />;
  if (preset === 'none') return null;
  return <ClassicStartupAnimation />;
}

export function VisualPackLoadingScreen({ pack }) {
  const preset = pack?.startup?.preset || 'metra-classic';
  const logoUri = resolveVisualPackAssetUri(pack, pack?.startup?.logo);
  const layers = Array.isArray(pack?.startup?.layers) ? pack.startup.layers : [];
  const backgroundColor = pack?.startup?.backgroundColor || '#FBF0E1';

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <BuiltinStartup preset={preset} />

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
  customLogo: { width: 240, height: 180 },
});
