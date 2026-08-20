/** Capture photo réelle (expo-image-picker) + bouton photo réutilisable. */

import React, { useState, useCallback } from 'react';
import { TouchableOpacity, Text, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { listerPhotos, ajouterPhoto } from './db.js';
import { styles } from './styles.js';

// ============================================================================
// 3. CAPTURE PHOTO RÉELLE — via expo-image-picker, compression intégrée
// ============================================================================

async function prendrePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre une photo.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.5,      // compression JPEG intégrée — réduit fortement la taille du fichier
    allowsEditing: false,
    base64: false,
  });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

/** Petit bouton photo réutilisable partout dans l'app. */
function PhotoButton({ visiteId, entiteKey, label, style }) {
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    listerPhotos(visiteId, entiteKey).then((p) => setCount(p.length));
  }, [visiteId, entiteKey]));

  const onPress = async () => {
    const uri = await prendrePhoto();
    if (uri) {
      await ajouterPhoto(visiteId, entiteKey, uri, label);
      const p = await listerPhotos(visiteId, entiteKey);
      setCount(p.length);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.photoBtn, count > 0 && styles.photoBtnTaken, style]}
      onPress={onPress}
    >
      <Text style={[styles.photoBtnText, count > 0 && styles.photoBtnTextTaken]}>
        {count > 0 ? `✓ ${count} photo${count > 1 ? 's' : ''}` : '📷 Photo'}
      </Text>
    </TouchableOpacity>
  );
}


export { prendrePhoto, PhotoButton };
