import React, { memo, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';

// expo-image : cache mémoire + disque et fondu d'apparition (plus de
// clignotement quand une vignette revient à l'écran).
const CONTENT_FIT = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
import { getPhotoVariant } from './photoVariantCache.js';
import { FONTS } from './styles.js';

const PhotoVariantImage = memo(function PhotoVariantImage({
  uri,
  variant = 'thumb',
  style,
  resizeMode = 'cover',
  fallbackToOriginal = true,
  placeholderLabel = 'PHOTO',
  ...props
}) {
  const [resolved, setResolved] = useState(variant === 'original' ? uri : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!uri) {
      setResolved(null);
      return () => { alive = false; };
    }
    if (variant === 'original') {
      setResolved(uri);
      return () => { alive = false; };
    }
    setResolved(null);
    getPhotoVariant(uri, variant)
      .then((next) => { if (alive) setResolved(next || (fallbackToOriginal ? uri : null)); })
      .catch(() => { if (alive) setResolved(fallbackToOriginal ? uri : null); });
    return () => { alive = false; };
  }, [uri, variant, fallbackToOriginal]);

  if (!resolved || failed) {
    return <View style={[{ backgroundColor: '#EFEBE4', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#9B927C', fontSize: 9, fontFamily: FONTS.bold, letterSpacing: 0.5 }}>{placeholderLabel}</Text>
    </View>;
  }

  return <Image
    {...props}
    source={{ uri: resolved }}
    style={style}
    contentFit={CONTENT_FIT[resizeMode] || 'cover'}
    transition={160}
    cachePolicy="memory-disk"
    recyclingKey={resolved}
    onError={() => {
      if (resolved !== uri && fallbackToOriginal) setResolved(uri);
      else setFailed(true);
    }}
  />;
});

export { PhotoVariantImage };
