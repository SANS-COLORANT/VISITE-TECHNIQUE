/** Capture photo réelle + nommage/persistance des fichiers de visite. */

import React, { useState, useCallback, useEffect } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { listerPhotos, ajouterPhoto, remplacerPhoto, getVisite } from './db.js';
import { styles } from './styles.js';

const PHOTO_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}visite-technique-photos/` : null;

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

async function assurerDossierPhotos() {
  if (!PHOTO_DIR) return false;
  try {
    const info = await FileSystem.getInfoAsync(PHOTO_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Copie la photo compressée générée par ImagePicker vers le stockage de l'app
 * avec un nom lisible : Site__Type__Libelle__date_heure__XXXX.jpg.
 * Si le stockage fichier n'est pas disponible (ex. environnement Snack limité),
 * on conserve l'URI d'origine afin de ne jamais bloquer la prise de photo.
 */
async function enregistrerPhotoNommee({ visiteId, entiteKey = null, label = 'Photo', uri, ancienneUri = null }) {
  if (!uri) return null;
  try {
    if (!(await assurerDossierPhotos())) return uri;
    const visite = await getVisite(visiteId);
    const site = nettoyerNomFichier(visite?.nom_site || 'Site');
    const type = typePhotoDepuisEntite(entiteKey);
    const libelle = nettoyerNomFichier(label || type);
    const nom = `${site}__${type}__${libelle}__${horodatagePhoto()}__${suffixeCourt()}.jpg`;
    const destination = `${PHOTO_DIR}${nom}`;
    await FileSystem.copyAsync({ from: uri, to: destination });

    // Lors d'une reprise, on supprime l'ancien fichier géré par l'app après succès.
    if (ancienneUri && PHOTO_DIR && String(ancienneUri).startsWith(PHOTO_DIR) && ancienneUri !== destination) {
      try { await FileSystem.deleteAsync(ancienneUri, { idempotent: true }); } catch {}
    }
    return destination;
  } catch {
    return uri;
  }
}

// ============================================================================
// CAPTURE PHOTO RÉELLE — compression JPEG intégrée
// ============================================================================

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
    const uri = await enregistrerPhotoNommee({ visiteId, entiteKey, label, uri: captureUri });
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
    const captureUri = await prendrePhoto();
    if (!captureUri) return;
    const uri = await enregistrerPhotoNommee({ visiteId, entiteKey, label, uri: captureUri, ancienneUri: photo.uri });
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

export { prendrePhoto, enregistrerPhotoNommee, PhotoButton };
