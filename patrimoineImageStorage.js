import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const TYPES = new Set(['client', 'site']);
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.78;

function typeValide(type) {
  const valeur = String(type || '').trim().toLowerCase();
  if (!TYPES.has(valeur)) throw new Error('Type d’image patrimoine invalide.');
  return valeur;
}

function idDossier(id) {
  const valeur = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!valeur) throw new Error('Identifiant patrimoine manquant.');
  return valeur;
}

function racineImages() {
  if (!FileSystem.documentDirectory) throw new Error('Stockage local Android indisponible.');
  return `${FileSystem.documentDirectory}visite-technique/patrimoine-images/`;
}

export function dossierImagePatrimoine(type, id) {
  return `${racineImages()}${typeValide(type)}/${idDossier(id)}/`;
}

export function estImagePatrimoineGeree(uri) {
  if (!uri || !FileSystem.documentDirectory) return false;
  return String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/patrimoine-images/`);
}

async function choisirAsset(source) {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("L’accès à l’appareil photo est nécessaire pour prendre une photo.");
    const resultat = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      base64: false,
      quality: 0.9,
    });
    return resultat.canceled ? null : resultat.assets?.[0] || null;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("L’accès aux photos est nécessaire pour choisir une image.");
  const resultat = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    base64: false,
    quality: 1,
  });
  return resultat.canceled ? null : resultat.assets?.[0] || null;
}

async function optimiserImage(asset) {
  if (!asset?.uri) return null;
  const largeur = Number(asset.width || 0);
  const actions = largeur > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [];
  const resultat = await ImageManipulator.manipulateAsync(
    asset.uri,
    actions,
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  return resultat?.uri || asset.uri;
}

export async function importerImagePatrimoine({ type, id, source = 'galerie' }) {
  const asset = await choisirAsset(source === 'camera' ? 'camera' : 'galerie');
  if (!asset) return null;
  const temporaire = await optimiserImage(asset);
  if (!temporaire) return null;

  const dossier = dossierImagePatrimoine(type, id);
  const destination = `${dossier}couverture.jpg`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: temporaire, to: destination });
  return destination;
}

export async function supprimerImagePatrimoine({ type, id, uri = null }) {
  if (uri && !estImagePatrimoineGeree(uri)) return;
  const dossier = dossierImagePatrimoine(type, id);
  await FileSystem.deleteAsync(dossier, { idempotent: true });
}
