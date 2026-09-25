import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PhotoButton } from './PhotoButton.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { loadVisitPhotos, peekVisitPhotos, subscribeVisitPhotos } from './photoRuntimeCache.js';

/** Photo contextuelle Pré-allumage : zéro requête SQLite au toucher. */
export function PreAllumagePhotoButton({ visiteId, entiteKey, label, style }) {
  const initial = peekVisitPhotos(visiteId, entiteKey) || [];
  const [photos, setPhotos] = useState(initial);

  useEffect(() => {
    let alive = true;
    const apply = (rows) => {
      if (!alive) return;
      const key = String(entiteKey || '');
      setPhotos((rows || []).filter((photo) => String(photo.entite_key || '') === key));
    };
    const cached = peekVisitPhotos(visiteId);
    if (cached) apply(cached);
    const unsubscribe = subscribeVisitPhotos(visiteId, apply);
    if (!cached) loadVisitPhotos(visiteId).catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [visiteId, entiteKey]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {photos[0]?.uri ? (
        <PhotoVariantImage
          uri={photos[0].uri}
          variant={photos[0].pending ? 'original' : 'thumb'}
          style={{ width: 34, height: 34, borderRadius: 7 }}
          resizeMode="cover"
        />
      ) : null}
      <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} style={style} />
    </View>
  );
}
