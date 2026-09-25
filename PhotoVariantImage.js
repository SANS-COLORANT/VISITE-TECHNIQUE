import React, { memo, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { getPhotoVariant } from './photoVariantCache.js';

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
    return <View style={[{ backgroundColor: '#EEF1F3', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#7B8790', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{placeholderLabel}</Text>
    </View>;
  }

  return <Image
    {...props}
    source={{ uri: resolved }}
    style={style}
    resizeMode={resizeMode}
    resizeMethod="resize"
    fadeDuration={0}
    onError={() => {
      if (resolved !== uri && fallbackToOriginal) setResolved(uri);
      else setFailed(true);
    }}
  />;
});

export { PhotoVariantImage };
