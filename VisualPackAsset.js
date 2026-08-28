import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { SvgXml } from 'react-native-svg';

function isSvgUri(uri) {
  return /\.svg(?:$|[?#])/i.test(String(uri || ''));
}

export function VisualPackAsset({ uri, style, resizeMode = 'contain' }) {
  const [xml, setXml] = useState(null);
  const [failed, setFailed] = useState(false);
  const svg = isSvgUri(uri);

  useEffect(() => {
    let cancelled = false;
    setXml(null);
    setFailed(false);
    if (!svg || !uri) return undefined;

    FileSystem.readAsStringAsync(uri)
      .then((value) => {
        if (!cancelled) setXml(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [svg, uri]);

  if (!uri || failed) return null;
  if (svg) {
    return (
      <View style={style} pointerEvents="none">
        {xml ? <SvgXml xml={xml} width="100%" height="100%" /> : null}
      </View>
    );
  }
  return <Image source={{ uri }} resizeMode={resizeMode} style={style} />;
}
