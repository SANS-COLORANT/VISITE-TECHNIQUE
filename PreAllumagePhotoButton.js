import React, { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { listerPhotos } from './db.js';
import { PhotoButton } from './PhotoButton.js';

/** Photo contextuelle avec miniature visible sans ouvrir la visionneuse. */
export function PreAllumagePhotoButton({ visiteId, entiteKey, label, style }) {
  const [photos, setPhotos] = useState([]);
  const charger = useCallback(async () => {
    if (!entiteKey) return setPhotos([]);
    try { setPhotos(await listerPhotos(visiteId, entiteKey)); } catch { setPhotos([]); }
  }, [visiteId, entiteKey]);
  useEffect(() => { charger(); }, [charger]);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    {photos[0]?.uri ? <Image source={{ uri: photos[0].uri }} style={{ width: 34, height: 34, borderRadius: 7 }} resizeMode="cover" /> : null}
    <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} style={style} onPhotoSaved={charger} />
  </View>;
}
