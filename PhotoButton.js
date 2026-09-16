/** Capture photo native Android + stockage durable et nommage métier. */

import React, { useState, useCallback, useEffect } from 'react';
import { TouchableOpacity, Text, Alert, View, Image, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { listerPhotos, ajouterPhoto, remplacerPhoto, getVisite } from './db.js';
import { upsertRemarquePrescription } from './remarkDb.js';
import { openAppDatabase } from './database/index.js';
import { supprimerPhotoComplete } from './photoDb.js';
import { copierPhotoDansDocuments, supprimerCopiePhotoDocuments } from './photoDocumentsStorage.js';
import { styles } from './styles.js';

const PHOTO_SNAPSHOT_TTL_MS = 1800;
const photoVisitSnapshots = new Map();
const canonicalPhotoKeys = new Map();

function invaliderPhotoSnapshot(visiteId) {
  photoVisitSnapshots.delete(String(visiteId || ''));
}

async function chargerPhotosVisitePartagees(visiteId, force = false) {
  const key = String(visiteId || '');
  if (!key) return [];
  const now = Date.now();
  const cached = photoVisitSnapshots.get(key);
  if (!force && cached?.data && now - cached.at < PHOTO_SNAPSHOT_TTL_MS) return cached.data;
  if (!force && cached?.promise) return cached.promise;

  const entry = { data: null, at: 0, promise: null };
  entry.promise = listerPhotos(visiteId).then((rows) => {
    const data = Array.isArray(rows) ? rows : [];
    if (photoVisitSnapshots.get(key) === entry) {
      entry.data = data;
      entry.at = Date.now();
      entry.promise = null;
    }
    return data;
  }).catch((error) => {
    if (photoVisitSnapshots.get(key) === entry) photoVisitSnapshots.delete(key);
    throw error;
  });
  photoVisitSnapshots.set(key, entry);
  return entry.promise;
}

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

function estCleControle(entiteKey) {
  const cle = String(entiteKey || '');
  if (!cle.includes('||')) return false;
  const prefixe = cle.split('||')[0];
  return prefixe.startsWith('conf-');
}

function horodatagePhoto(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}
function suffixeCourt() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

function libelleCaissonVmc(index, nom) {
  const base = `Caisson n°${index}`;
  const brut = String(nom || '').trim();
  if (!brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut)) return base;
  return `${base} - ${brut}`;
}

async function clePhotoCanoniqueVmc(visiteId, entiteKey) {
  const cle = String(entiteKey || '').trim();
  if (!cle.startsWith('remarque||')) return cle;
  const remarqueId = cle.slice('remarque||'.length);
  if (!remarqueId) return cle;
  const cacheKey = `${String(visiteId || '')}||${cle}`;
  if (canonicalPhotoKeys.has(cacheKey)) return canonicalPhotoKeys.get(cacheKey);
  let resultat = cle;
  try {
    const db = await openAppDatabase();
    const remarque = await db.getFirstAsync(
      `SELECT controle_key FROM remarques WHERE visite_id=? AND id=? LIMIT 1`,
      [visiteId, remarqueId]
    );
    const controleKey = String(remarque?.controle_key || '').trim();
    // Une réserve VMC et son contrôle partagent la même preuve photo. On garde
    // le contrôle comme rattachement canonique pour que l'image ne disparaisse
    // jamais si l'avis repasse ensuite de N.S à S.
    if (/^vmc-c\d+\./.test(controleKey)) resultat = controleKey;
  } catch {}
  canonicalPhotoKeys.set(cacheKey, resultat);
  return resultat;
}

async function libellePhotoMetier(visiteId, entiteKey, label) {
  const libelleInitial = String(label || typePhotoDepuisEntite(entiteKey) || 'Photo').trim() || 'Photo';
  const sectionCode = String(entiteKey || '').split('||')[0];
  const matchVmc = sectionCode.match(/^vmc-c(\d+)\./);
  if (!matchVmc) return libelleInitial;

  if (/^Caisson n°\d+(?:\s*-\s*[^·]+)?\s*·/i.test(libelleInitial)) return libelleInitial;

  const index = Number(matchVmc[1]);
  let nomCaisson = '';
  try {
    const db = await openAppDatabase();
    const row = await db.getFirstAsync(
      `SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code='vmc.config' AND cle=?`,
      [visiteId, `caisson_${index}_nom`]
    );
    nomCaisson = String(row?.valeur || '').trim();
  } catch {}

  return `${libelleCaissonVmc(index, nomCaisson)} · ${libelleInitial}`;
}

async function dossierPhotosVisite(visiteId, visiteConnue = null) {
  const racine = FileSystem.documentDirectory;
  if (!racine) throw new Error('Stockage local Android indisponible');
  let visite = visiteConnue;
  if (!visite) { try { visite = await getVisite(visiteId); } catch {} }
  const client = nettoyerNomFichier(visite?.nom_client, 'Client');
  const site = nettoyerNomFichier(visite?.nom_site, 'Site');
  const date = nettoyerNomFichier(visite?.date_visite, 'Sans_date');
  const visiteDossier = `${date}__${nettoyerNomFichier(visiteId, 'visite')}`;
  return `${racine}visite-technique/photos/${client}/${site}/${visiteDossier}/`;
}

async function copierPhotoDurable(uriSource, visiteId, nom, visiteConnue = null) {
  const dossier = await dossierPhotosVisite(visiteId, visiteConnue);
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = dossier + nom;
  // Le nom contient horodatage + suffixe aléatoire. Un delete idempotent évite
  // le getInfoAsync supplémentaire tout en gardant copyAsync sûr en cas de collision.
  await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: uriSource, to: destination });
  return destination;
}

async function supprimerPhotoGeree(uri) {
  if (!uri || !FileSystem.documentDirectory || !String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`)) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

async function preparerPhotoNommee({ visiteId, entiteKey = null, label = 'Photo', uri }) {
  if (!uri) return { uri: null, nom: null, label: null };
  const entiteCanonique = await clePhotoCanoniqueVmc(visiteId, entiteKey);
  let visite = null;
  try { visite = await getVisite(visiteId); } catch {}
  const site = nettoyerNomFichier(visite?.nom_site, 'Site');
  const type = typePhotoDepuisEntite(entiteCanonique);
  const labelMetier = await libellePhotoMetier(visiteId, entiteCanonique, label);
  const libelle = nettoyerNomFichier(labelMetier || type, type);
  const nom = `${site}__${type}__${libelle}__${horodatagePhoto()}__${suffixeCourt()}.jpg`;
  const uriDurable = await copierPhotoDurable(uri, visiteId, nom, visite);
  // La copie privée est la source canonique/durable. La copie Documents est une
  // commodité utilisateur : elle ne doit pas bloquer le retour caméra ni l'écriture SQLite.
  void copierPhotoDansDocuments(uriDurable, nom).catch(() => null);
  return { uri: uriDurable, nom, label: labelMetier, entiteKey: entiteCanonique };
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

async function resoudreReserveDepuisControle(visiteId, controleKey, label) {
  if (!estCleControle(controleKey)) return null;
  const db = await openAppDatabase();
  let remarque = await db.getFirstAsync(
    `SELECT * FROM remarques WHERE visite_id=? AND controle_key=? LIMIT 1`,
    [visiteId, controleKey]
  );
  if (!remarque?.id) {
    const id = await upsertRemarquePrescription(
      visiteId,
      controleKey,
      { poste: 'Observation', prestation: String(label || 'Non conformité'), delai: null, estimatif: null },
      String(label || 'Non conformité')
    );
    remarque = { id, prestation: String(label || 'Non conformité') };
  }
  return { entiteKey: `remarque||${remarque.id}`, label: remarque.prestation || label || 'Réserve' };
}

function PhotoButton({ visiteId, entiteKey, label, style, beforeCapture, onPhotoSaved }) {
  const [photos, setPhotos] = useState([]);
  const [photosChargees, setPhotosChargees] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const estReserve = String(entiteKey || '').startsWith('remarque||');

  useEffect(() => {
    setPhotos([]);
    setPhotosChargees(false);
    setViewerVisible(false);
    setIndex(0);
  }, [visiteId, entiteKey]);

  const charger = useCallback(async (cle = entiteKey, force = false) => {
    const canonique = await clePhotoCanoniqueVmc(visiteId, cle);
    // Tous les PhotoButton montés ensemble partagent la même lecture de visite.
    // On évite ainsi une requête SELECT par conformité/réserve au changement d'onglet.
    const snapshot = await chargerPhotosVisitePartagees(visiteId, force);
    const attendu = String(canonique || '');
    const items = snapshot.filter((photo) => String(photo?.entite_key || '') === attendu);
    setPhotos(items);
    setPhotosChargees(true);
    setIndex((actuel) => Math.min(actuel, Math.max(0, items.length - 1)));
    return items;
  }, [visiteId, entiteKey]);

  useEffect(() => {
    if (entiteKey) charger(entiteKey).catch(() => {});
    else setPhotosChargees(true);
  }, [entiteKey, charger]);

  const resoudreCible = useCallback(async () => {
    let cible = null;
    if (beforeCapture) {
      const cibleAvant = await beforeCapture();
      if (typeof cibleAvant === 'string') cible = { entiteKey: cibleAvant, label };
      else if (cibleAvant) cible = { entiteKey: cibleAvant.entiteKey || entiteKey, label: cibleAvant.label || label };
    }
    if (!cible) {
      const reserve = await resoudreReserveDepuisControle(visiteId, entiteKey, label);
      cible = reserve || { entiteKey, label };
    }
    const canonique = await clePhotoCanoniqueVmc(visiteId, cible.entiteKey);
    return { ...cible, entiteKey: canonique };
  }, [beforeCapture, visiteId, entiteKey, label]);

  const ajouter = async (ciblePrecalculee = null) => {
    try {
      const captureUri = await prendrePhoto(); if (!captureUri) return;
      const cible = ciblePrecalculee?.entiteKey ? ciblePrecalculee : await resoudreCible();
      const photo = await preparerPhotoNommee({ visiteId, entiteKey: cible.entiteKey, label: cible.label, uri: captureUri });
      const labelFinal = photo.label || cible.label || typePhotoDepuisEntite(cible.entiteKey);
      const labelDb = photo.nom ? `${labelFinal}||${photo.nom}` : (labelFinal || null);
      const cibleKey = photo.entiteKey || cible.entiteKey;
      const photoId = await ajouterPhoto(visiteId, cibleKey, photo.uri, labelDb);
      invaliderPhotoSnapshot(visiteId);
      const items = await charger(cibleKey, true);
      setIndex(Math.max(0, items.length - 1));
      onPhotoSaved?.({ id: photoId, entiteKey: cibleKey, uri: photo.uri, label: labelFinal });
    } catch (e) { Alert.alert('Erreur photo', String(e?.message || e)); }
  };

  const onPress = async () => {
    try {
      const cible = await resoudreCible();
      const items = photosChargees ? photos : await charger(cible.entiteKey);
      if (items.length > 0) { setIndex(0); setViewerVisible(true); }
      else await ajouter(cible);
    } catch (e) { Alert.alert('Erreur photo', String(e?.message || e)); }
  };

  const reprendre = async () => {
    const photoExistante = photos[index]; if (!photoExistante) return;
    try {
      const captureUri = await prendrePhoto(); if (!captureUri) return;
      const cibleKey = photoExistante.entite_key || await clePhotoCanoniqueVmc(visiteId, entiteKey);
      const nouvelle = await preparerPhotoNommee({ visiteId, entiteKey: cibleKey, label, uri: captureUri });
      await remplacerPhoto(photoExistante.id, nouvelle.uri);
      if (nouvelle.label) {
        const db = await openAppDatabase();
        await db.runAsync(`UPDATE photos SET label=?, entite_key=? WHERE id=?`, [nouvelle.nom ? `${nouvelle.label}||${nouvelle.nom}` : nouvelle.label, nouvelle.entiteKey || cibleKey, photoExistante.id]);
      }
      await supprimerCopiePhotoDocuments(photoExistante.uri).catch(() => {});
      await supprimerPhotoGeree(photoExistante.uri);
      invaliderPhotoSnapshot(visiteId);
      await charger(nouvelle.entiteKey || cibleKey, true);
      onPhotoSaved?.({ id: photoExistante.id, entiteKey: nouvelle.entiteKey || cibleKey, uri: nouvelle.uri, label: nouvelle.label || label });
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
              invaliderPhotoSnapshot(visiteId);
              const items = await charger(photo.entite_key || entiteKey, true);
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
    <TouchableOpacity
      style={[styles.photoBtn, photosChargees && photos.length > 0 && styles.photoBtnTaken, estReserve && photos.length > 0 && { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}
      onPress={onPress}
    >
      {estReserve && photosChargees && photos[0]?.uri ? <Image source={{ uri: photos[0].uri }} style={{ width: 44, height: 44, borderRadius: 7 }} resizeMode="cover" resizeMethod="resize" fadeDuration={0} /> : null}
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
          <TouchableOpacity style={styles.photoViewerSecondary} onPress={() => ajouter()}><Text style={styles.photoViewerSecondaryText}>+ Ajouter</Text></TouchableOpacity>
          <TouchableOpacity style={styles.photoViewerPrimary} onPress={reprendre}><Text style={styles.photoViewerPrimaryText}>📷 Reprendre</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}

export { prendrePhoto, preparerPhotoNommee, enregistrerPhotoNommee, PhotoButton };
