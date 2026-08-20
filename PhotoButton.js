/** Capture photo réelle (expo-image-picker) + bouton photo réutilisable. */

import React, { useState, useCallback, useEffect } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { listerPhotos, ajouterPhoto, remplacerPhoto } from './db.js';
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
  const [photos, setPhotos] = useState([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [index, setIndex] = useState(0);

  const charger = useCallback(async () => {
    const items = await listerPhotos(visiteId, entiteKey);
    setPhotos(items);
    setIndex((actuel) => Math.min(actuel, Math.max(0, items.length - 1)));
    return items;
  }, [visiteId, entiteKey]);

  useEffect(useCallback(() => {
    charger();
  }, [charger]));

  const ajouter = async () => {
    const uri = await prendrePhoto();
    if (!uri) return;
    await ajouterPhoto(visiteId, entiteKey, uri, label);
    const items = await charger();
    setIndex(Math.max(0, items.length - 1));
  };

  const onPress = async () => {
    if (photos.length > 0) {
      setIndex(0);
      setViewerVisible(true);
    } else await ajouter();
  };

  const reprendre = async () => {
    const photo = photos[index];
    if (!photo) return;
    const uri = await prendrePhoto();
    if (!uri) return;
    await remplacerPhoto(photo.id, uri);
    await charger();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.photoBtn, photos.length > 0 && styles.photoBtnTaken, style]}
        onPress={onPress}
      >
        <Text style={[styles.photoBtnText, photos.length > 0 && styles.photoBtnTextTaken]}>
          {photos.length > 0 ? `👁 ${photos.length} photo${photos.length > 1 ? 's' : ''}` : '📷 Photo'}
        </Text>
      </TouchableOpacity>

      <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
        <View style={styles.photoViewerOverlay}>
          <View style={styles.photoViewerHeader}>
            <Text style={styles.photoViewerTitle}>{label || 'Photo'} · {index + 1}/{photos.length}</Text>
            <TouchableOpacity onPress={() => setViewerVisible(false)}><Text style={styles.photoViewerClose}>✕</Text></TouchableOpacity>
          </View>
          {photos[index] && <Image source={{ uri: photos[index].uri }} style={styles.photoViewerImage} resizeMode="contain" />}
          {photos.length > 1 && (
            <View style={styles.photoViewerNav}>
              <TouchableOpacity style={styles.photoViewerNavBtn} onPress={() => setIndex((index - 1 + photos.length) % photos.length)}><Text style={styles.photoViewerNavText}>‹ Précédente</Text></TouchableOpacity>
              <TouchableOpacity style={styles.photoViewerNavBtn} onPress={() => setIndex((index + 1) % photos.length)}><Text style={styles.photoViewerNavText}>Suivante ›</Text></TouchableOpacity>
            </View>
          )}
          <View style={styles.photoViewerActions}>
            <TouchableOpacity style={styles.photoViewerSecondary} onPress={ajouter}><Text style={styles.photoViewerSecondaryText}>+ Ajouter</Text></TouchableOpacity>
            <TouchableOpacity style={styles.photoViewerPrimary} onPress={reprendre}><Text style={styles.photoViewerPrimaryText}>📷 Reprendre</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}


export { prendrePhoto, PhotoButton };
