/** Capture photo native Android + stockage durable et nommage métier. */

import React, { useState, useCallback } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { listerPhotos, ajouterPhoto, remplacerPhoto, getVisite } from './db.js';
import { supprimerPhotoComplete } from './photoDb.js';
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
    remarque: 'Reserve', materiel: 'Equipement', equipement: 'Equipement',
    reseau: 'Reseau', reseau_site: 'Reseau', compteur: 'Compteur', compteur_site: 'Compteur',
  })[type] || 'Photo';
}

function horodatagePhoto(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}
function suffixeCourt() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

function dossierPhotosVisite(visiteId) {
  const racine = FileSystem.documentDirectory;
  if (!racine) throw new Error('Stockage local Android indisponible');
  return `${racine}visite-technique/photos/${nettoyerNomFichier(visiteId, 'visite')}/`;
}

async function copierPhotoDurable(uriSource, visiteId, nom) {
  const dossier = dossierPhotosVisite(visiteId);
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = dossier + nom;
  const existante = await FileSystem.getInfoAsync(destination);
  if (existante.exists) await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: uriSource, to: destination });
  return destination;
}

async function supprimerPhotoGeree(uri) {
  if (!uri || !FileSystem.documentDirectory || !String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`)) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

async function preparerPhotoNommee({ visiteId, entiteKey = null, label = 'Photo', uri }) {
  if (!uri) return { uri: null, nom: null };
  let nomSite = 'Site';
  try { const visite = await getVisite(visiteId); nomSite = visite?.nom_site || 'Site'; } catch {}
  const site = nettoyerNomFichier(nomSite, 'Site');
  const type = typePhotoDepuisEntite(entiteKey);
  const libelle = nettoyerNomFichier(label || type, type);
  const nom = `${site}__${type}__${libelle}__${horodatagePhoto()}__${suffixeCourt()}.jpg`;
  const uriDurable = await copierPhotoDurable(uri, visiteId, nom);
  return { uri: uriDurable, nom };
}

async function enregistrerPhotoNommee(args) { const photo = await preparerPhotoNommee(args); return photo.uri; }

async function prendrePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre une photo.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: false, base64: false });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

function PhotoButton({ visiteId, entiteKey, label, style }) {
  const [photos, setPhotos] = useState([]);
  const [photosChargees, setPhotosChargees] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [index, setIndex] = useState(0);

  const charger = useCallback(async () => {
    const items = await listerPhotos(visiteId, entiteKey);
    setPhotos(items);
    setPhotosChargees(true);
    setIndex((actuel) => Math.min(actuel, Math.max(0, items.length - 1)));
    return items;
  }, [visiteId, entiteKey]);

  const ajouter = async () => {
    try {
      const captureUri = await prendrePhoto(); if (!captureUri) return;
      const photo = await preparerPhotoNommee({ visiteId, entiteKey, label, uri: captureUri });
      const labelDb = photo.nom ? `${label || typePhotoDepuisEntite(entiteKey)}||${photo.nom}` : (label || null);
      await ajouterPhoto(visiteId, entiteKey, photo.uri, labelDb);
      const items = await charger(); setIndex(Math.max(0, items.length - 1));
    } catch (e) { Alert.alert('Erreur photo', String(e?.message || e)); }
  };

  const onPress = async () => {
    const items = photosChargees ? photos : await charger();
    if (items.length > 0) { setIndex(0); setViewerVisible(true); }
    else await ajouter();
  };

  const reprendre = async () => {
    const photoExistante = photos[index]; if (!photoExistante) return;
    try {
      const captureUri = await prendrePhoto(); if (!captureUri) return;
      const nouvelle = await preparerPhotoNommee({ visiteId, entiteKey, label, uri: captureUri });
      await remplacerPhoto(photoExistante.id, nouvelle.uri);
      await supprimerPhotoGeree(photoExistante.uri);
      await charger();
    } catch (e) { Alert.alert('Erreur photo', String(e?.message || e)); }
  };

  const demanderSuppression = () => {
    const photo = photos[index];
    if (!photo) return;
    Alert.alert(
      'Supprimer cette photo ?',
      'La photo sera retirée de la visite et supprimée du stockage local de la tablette.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerPhotoComplete(photo.id);
              const items = await charger();
              if (items.length === 0) setViewerVisible(false);
              else setIndex((actuel) => Math.min(actuel, items.length - 1));
            } catch (e) {
              Alert.alert('Suppression impossible', String(e?.message || e));
            }
          },
        },
      ]
    );
  };

  return <>
    <TouchableOpacity style={[styles.photoBtn, photosChargees && photos.length > 0 && styles.photoBtnTaken, style]} onPress={onPress}>
      <Text style={[styles.photoBtnText, photosChargees && photos.length > 0 && styles.photoBtnTextTaken]}>{photosChargees && photos.length > 0 ? `👁 ${photos.length} photo${photos.length > 1 ? 's' : ''}` : '📷 Photo'}</Text>
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
          <TouchableOpacity style={styles.photoViewerSecondary} onPress={demanderSuppression}><Text style={styles.photoViewerSecondaryText}>Supprimer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.photoViewerSecondary} onPress={ajouter}><Text style={styles.photoViewerSecondaryText}>+ Ajouter</Text></TouchableOpacity>
          <TouchableOpacity style={styles.photoViewerPrimary} onPress={reprendre}><Text style={styles.photoViewerPrimaryText}>📷 Reprendre</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}

export { prendrePhoto, preparerPhotoNommee, enregistrerPhotoNommee, PhotoButton };
