/** Capture photo réelle compatible Snack + nommage logique des photos de visite. */

import React, { useState, useCallback, useEffect } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { listerPhotos, ajouterPhoto, remplacerPhoto, getVisite } from './db.js';
import { styles } from './styles.js';

function nettoyerNomFichier(valeur = '', fallback = 'Photo') {
  const propre = String(valeur || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '')
    .slice(0, 70);
  return propre || fallback;
}

function typePhotoDepuisEntite(entiteKey) {
  const type = String(entiteKey || '').split('||')[0];
  return ({
    remarque: 'Reserve',
    materiel: 'Equipement',
    equipement: 'Equipement',
    reseau: 'Reseau',
    reseau_site: 'Reseau',
    compteur: 'Compteur',
    compteur_site: 'Compteur',
  })[type] || 'Photo';
}

function horodatagePhoto(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

function suffixeCourt() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Snack ne garantit pas l'accès à expo-file-system sur l'appareil.
 * On conserve donc l'URI native retournée par ImagePicker et on génère
 * un nom logique stable, utilisable pour l'affichage et les futurs exports.
 */
async function preparerPhotoNommee({ visiteId, entiteKey = null, label = 'Photo', uri }) {
  if (!uri) return { uri: null, nom: null };
  let nomSite = 'Site';
  try {
    const visite = await getVisite(visiteId);
    nomSite = visite?.nom_site || 'Site';
  } catch {}
  const site = nettoyerNomFichier(nomSite, 'Site');
  const type = typePhotoDepuisEntite(entiteKey);
  const libelle = nettoyerNomFichier(label || type, type);
  const nom = `${site}__${type}__${libelle}__${horodatagePhoto()}__${suffixeCourt()}.jpg`;
  return { uri, nom };
}

// Compatibilité avec le nom de fonction précédemment exporté.
async function enregistrerPhotoNommee(args) {
  const photo = await preparerPhotoNommee(args);
  return photo.uri;
}

async function prendrePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre une photo.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    quality: 0.5,
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
    const captureUri = await prendrePhoto();
    if (!captureUri) return;
    const photo = await preparerPhotoNommee({ visiteId, entiteKey, label, uri: captureUri });
    // Le nom logique est conservé dans le label DB sans modifier l'URI native Snack.
    const labelDb = photo.nom ? `${label || typePhotoDepuisEntite(entiteKey)}||${photo.nom}` : (label || null);
    await ajouterPhoto(visiteId, entiteKey, photo.uri, labelDb);
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
    const captureUri = await prendrePhoto();
    if (!captureUri) return;
    // Reprendre remplace uniquement l'URI de la photo sélectionnée.
    await remplacerPhoto(photo.id, captureUri);
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

export { prendrePhoto, preparerPhotoNommee, enregistrerPhotoNommee, PhotoButton };
