/** Capture photo native Android + stockage durable et nommage métier. */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, Alert, View, Modal } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ajouterPhoto, remplacerPhoto } from './db.js';
import { upsertRemarquePrescription } from './remarkDb.js';
import { openAppDatabase } from './database/index.js';
import { supprimerPhotoComplete } from './photoDb.js';
import { copierPhotoDansDocuments, supprimerCopiePhotoDocuments } from './photoDocumentsStorage.js';
import { styles } from './styles.js';
import { confirmerPhotoJournalisee, journaliserPhotoEnAttente } from './photoPersistenceJournal.js';
import { forgetPhotoVariants, preparePhotoVariants } from './photoVariantCache.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { beginExternalSave, endExternalSave } from './saveActivity.js';
import { launchMetraCamera, prewarmCameraRuntime } from './cameraRuntime.js';
import { nettoyerNomFichier, prewarmPhotoCaptureContext } from './photoCaptureContext.js';
import { loadVisitPhotos, peekVisitPhotos, removeRuntimePhoto, replaceRuntimePhoto, subscribeVisitPhotos, upsertRuntimePhoto } from './photoRuntimeCache.js';

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
    if (/^vmc-c\d+\./.test(controleKey)) return controleKey;
  } catch {}
  return cle;
}

async function libellePhotoMetier(visiteId, entiteKey, label) {
  const libelleInitial = String(label || typePhotoDepuisEntite(entiteKey) || 'Photo').trim() || 'Photo';
  const sectionCode = String(entiteKey || '').split('||')[0];
  const matchVmc = sectionCode.match(/^vmc-c(\d+)\./);
  if (!matchVmc) return libelleInitial;

  // Si le libellé est déjà qualifié par un caisson (ex. depuis la carte Réserve),
  // on le conserve tel quel afin de ne jamais créer « Caisson n°1 · Caisson n°1 … ».
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

async function copierPhotoDurable(uriSource, visiteId, nom) {
  const context = await prewarmPhotoCaptureContext(visiteId);
  if (!context?.directory) throw new Error('Stockage photo METRA indisponible');
  const destination = context.directory + nom;
  await FileSystem.copyAsync({ from: uriSource, to: destination });
  return destination;
}

async function supprimerPhotoGeree(uri) {
  if (!uri || !FileSystem.documentDirectory || !String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/photos/`)) return;
  forgetPhotoVariants(uri).catch(() => {});
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
}

async function preparerPhotoNommee({ visiteId, entiteKey = null, label = 'Photo', uri }) {
  if (!uri) return { uri: null, nom: null, label: null };
  const [entiteCanonique, context] = await Promise.all([
    clePhotoCanoniqueVmc(visiteId, entiteKey),
    prewarmPhotoCaptureContext(visiteId),
  ]);
  const site = context?.site || nettoyerNomFichier(context?.siteName, 'Site');
  const type = typePhotoDepuisEntite(entiteCanonique);
  const labelMetier = await libellePhotoMetier(visiteId, entiteCanonique, label);
  const libelle = nettoyerNomFichier(labelMetier || type, type);
  const nom = `${site}__${type}__${libelle}__${horodatagePhoto()}__${suffixeCourt()}.jpg`;
  const uriDurable = await copierPhotoDurable(uri, visiteId, nom);
  // La copie interne reste la source canonique pour le backup. Une seconde copie
  // est déposée dans Documents afin d'être directement visible par l'utilisateur.
  copierPhotoDansDocuments(uriDurable, nom).catch(() => null);
  // Miniature + aperçu se génèrent en arrière-plan. L'original reste la seule
  // source durable et n'est jamais chargé dans les listes si une variante existe.
  preparePhotoVariants(uriDurable).catch(() => {});
  return { uri: uriDurable, nom, label: labelMetier, entiteKey: entiteCanonique };
}

async function enregistrerPhotoNommee(args) { const photo = await preparerPhotoNommee(args); return photo.uri; }

async function prendrePhoto() {
  const result = await launchMetraCamera({ quality: 0.5, allowsEditing: false });
  if (result?.status === 'permission') {
    Alert.alert('Permission requise', "L'accès à l'appareil photo est nécessaire pour prendre une photo.");
    return null;
  }
  return result?.uri || null;
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
  const [viewerHd, setViewerHd] = useState(false);
  const [index, setIndex] = useState(0);
  const canonicalKeyRef = useRef(String(entiteKey || ''));
  const targetPromiseRef = useRef(null);
  const estReserve = String(entiteKey || '').startsWith('remarque||');

  useEffect(() => {
    setPhotos([]);
    setPhotosChargees(false);
    setViewerVisible(false);
    setViewerHd(false);
    setIndex(0);
    canonicalKeyRef.current = String(entiteKey || '');
    targetPromiseRef.current = null;
  }, [visiteId, entiteKey]);

  const appliquerPhotos = useCallback((rows, cle = canonicalKeyRef.current) => {
    const wanted = String(cle || '');
    const items = (rows || []).filter((row) => String(row.entite_key || '') === wanted);
    setPhotos(items);
    setPhotosChargees(true);
    setIndex((actuel) => Math.min(actuel, Math.max(0, items.length - 1)));
    return items;
  }, []);

  const charger = useCallback(async (cle = entiteKey) => {
    const canonique = await clePhotoCanoniqueVmc(visiteId, cle);
    canonicalKeyRef.current = String(canonique || '');
    const cached = peekVisitPhotos(visiteId);
    if (cached) return appliquerPhotos(cached, canonique);
    const rows = await loadVisitPhotos(visiteId);
    return appliquerPhotos(rows, canonique);
  }, [visiteId, entiteKey, appliquerPhotos]);

  // Un seul index photo est chargé par visite. Tous les boutons se mettent à jour
  // depuis ce cache partagé, sans requête SQLite au moment où le technicien touche
  // l'appareil photo.
  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    (async () => {
      const canonique = await clePhotoCanoniqueVmc(visiteId, entiteKey);
      if (!alive) return;
      canonicalKeyRef.current = String(canonique || '');
      const cached = peekVisitPhotos(visiteId);
      if (cached) appliquerPhotos(cached, canonique);
      unsubscribe = subscribeVisitPhotos(visiteId, (rows) => {
        if (alive) appliquerPhotos(rows, canonicalKeyRef.current);
      });
      if (!cached) await loadVisitPhotos(visiteId).catch(() => {});
      if (alive) setPhotosChargees(true);
    })().catch(() => { if (alive) setPhotosChargees(true); });
    return () => { alive = false; unsubscribe(); };
  }, [visiteId, entiteKey, appliquerPhotos]);

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

  const prechaufferCapture = useCallback(() => {
    prewarmCameraRuntime().catch(() => {});
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    if (!peekVisitPhotos(visiteId)) loadVisitPhotos(visiteId).catch(() => {});
    if (!targetPromiseRef.current) {
      targetPromiseRef.current = Promise.resolve()
        .then(() => resoudreCible())
        .catch((error) => {
          targetPromiseRef.current = null;
          throw error;
        });
    }
    return targetPromiseRef.current;
  }, [visiteId, resoudreCible]);


  const ajouter = async () => {
    let saveKey = null;
    let tempId = null;
    let journalKey = null;
    try {
      const ciblePromise = prechaufferCapture();
      const captureUri = await prendrePhoto();
      if (!captureUri) return;
      const cible = await ciblePromise;
      targetPromiseRef.current = null;

      tempId = `photo-pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      const optimistic = {
        id: tempId,
        visite_id: visiteId,
        entite_key: cible.entiteKey || null,
        uri: captureUri,
        label: cible.label || label || 'Photo',
        cree_le: new Date().toISOString(),
        pending: true,
      };
      // Retour caméra -> photo visible immédiatement. La copie durable et SQLite
      // continuent derrière sans bloquer la saisie ni le swipe.
      upsertRuntimePhoto(visiteId, optimistic);
      setIndex(Math.max(0, photos.length));

      saveKey = `photo:${visiteId}:${Date.now()}`;
      beginExternalSave(saveKey);
      const photo = await preparerPhotoNommee({ visiteId, entiteKey: cible.entiteKey, label: cible.label, uri: captureUri });
      const labelFinal = photo.label || cible.label || typePhotoDepuisEntite(cible.entiteKey);
      const labelDb = photo.nom ? `${labelFinal}||${photo.nom}` : (labelFinal || null);
      const cibleKey = photo.entiteKey || cible.entiteKey;

      // Dès que la copie privée METRA existe, on remplace l'URI temporaire.
      replaceRuntimePhoto(visiteId, tempId, {
        ...optimistic,
        id: tempId,
        entite_key: cibleKey || null,
        uri: photo.uri,
        label: labelDb,
        pending: true,
      });

      journalKey = await journaliserPhotoEnAttente({ visiteId, entiteKey: cibleKey, uri: photo.uri, labelDb });
      const photoId = await ajouterPhoto(visiteId, cibleKey, photo.uri, labelDb);
      await confirmerPhotoJournalisee(journalKey).catch(() => {});
      journalKey = null;

      replaceRuntimePhoto(visiteId, tempId, {
        id: photoId,
        visite_id: visiteId,
        entite_key: cibleKey || null,
        uri: photo.uri,
        label: labelDb,
        cree_le: new Date().toISOString(),
        pending: false,
      });
      endExternalSave(saveKey);
      saveKey = null;
      onPhotoSaved?.({ id: photoId, entiteKey: cibleKey, uri: photo.uri, label: labelFinal });
    } catch (e) {
      targetPromiseRef.current = null;
      // Si la copie durable a déjà été journalisée, on laisse la ligne optimiste :
      // la récupération au prochain accès pourra finaliser SQLite.
      if (tempId && !journalKey) removeRuntimePhoto(visiteId, tempId);
      if (saveKey) endExternalSave(saveKey, e);
      Alert.alert('Erreur photo', String(e?.message || e));
    }
  };

  const onPress = async () => {
    try {
      if (photosChargees && photos.length > 0) {
        setIndex(0);
        setViewerHd(false);
        setViewerVisible(true);
        return;
      }
      // onPressIn a déjà préchauffé permissions, cible, dossier et index photos.
      // Si l'index vient juste d'arriver, on respecte encore le comportement
      // historique "photos existantes -> visionneuse".
      const cible = await prechaufferCapture();
      const cached = peekVisitPhotos(visiteId, cible.entiteKey);
      if (cached?.length) {
        setPhotos(cached);
        setPhotosChargees(true);
        setIndex(0);
        setViewerHd(false);
        setViewerVisible(true);
        return;
      }
      await ajouter();
    } catch (e) { Alert.alert('Erreur photo', String(e?.message || e)); }
  };

  const reprendre = async () => {
    const photoExistante = photos[index]; if (!photoExistante || photoExistante.pending) return;
    const ancienne = { ...photoExistante };
    let saveKey = null;
    try {
      prewarmCameraRuntime().catch(() => {});
      prewarmPhotoCaptureContext(visiteId).catch(() => {});
      const captureUri = await prendrePhoto(); if (!captureUri) return;
      const cibleKey = photoExistante.entite_key || await clePhotoCanoniqueVmc(visiteId, entiteKey);

      // La nouvelle prise remplace visuellement l'ancienne dès le retour caméra.
      upsertRuntimePhoto(visiteId, { ...photoExistante, uri: captureUri, pending: true });
      saveKey = `photo-replace:${visiteId}:${photoExistante.id}`;
      beginExternalSave(saveKey);

      const nouvelle = await preparerPhotoNommee({ visiteId, entiteKey: cibleKey, label, uri: captureUri });
      const labelDb = nouvelle.nom ? `${nouvelle.label || label || 'Photo'}||${nouvelle.nom}` : (nouvelle.label || label || null);
      upsertRuntimePhoto(visiteId, { ...photoExistante, uri: nouvelle.uri, label: labelDb, entite_key: nouvelle.entiteKey || cibleKey, pending: true });

      await remplacerPhoto(photoExistante.id, nouvelle.uri);
      if (nouvelle.label) {
        const db = await openAppDatabase();
        await db.runAsync(`UPDATE photos SET label=?, entite_key=? WHERE id=?`, [labelDb, nouvelle.entiteKey || cibleKey, photoExistante.id]);
      }
      await supprimerCopiePhotoDocuments(ancienne.uri).catch(() => {});
      await supprimerPhotoGeree(ancienne.uri);
      upsertRuntimePhoto(visiteId, { ...photoExistante, uri: nouvelle.uri, label: labelDb, entite_key: nouvelle.entiteKey || cibleKey, pending: false });
      endExternalSave(saveKey);
      saveKey = null;
      onPhotoSaved?.({ id: photoExistante.id, entiteKey: nouvelle.entiteKey || cibleKey, uri: nouvelle.uri, label: nouvelle.label || label });
    } catch (e) {
      upsertRuntimePhoto(visiteId, ancienne);
      if (saveKey) endExternalSave(saveKey, e);
      Alert.alert('Erreur photo', String(e?.message || e));
    }
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
            if (photo.pending) return;
            const backup = { ...photo };
            removeRuntimePhoto(visiteId, photo.id);
            const restant = photos.filter((item) => item.id !== photo.id);
            if (restant.length === 0) setViewerVisible(false);
            else setIndex((actuel) => Math.min(actuel, restant.length - 1));
            try {
              await supprimerPhotoComplete(photo.id);
            } catch (e) {
              upsertRuntimePhoto(visiteId, backup);
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
      onPressIn={prechaufferCapture}
      onPress={onPress}
    >
      {estReserve && photosChargees && photos[0]?.uri ? <PhotoVariantImage uri={photos[0].uri} variant={photos[0].pending ? 'original' : 'thumb'} style={{ width: 44, height: 44, borderRadius: 7 }} resizeMode="cover" /> : null}
      <Text style={[styles.photoBtnText, photosChargees && photos.length > 0 && styles.photoBtnTextTaken]}>{photosChargees && photos.length > 0 ? `👁 ${photos.length} photo${photos.length > 1 ? 's' : ''}` : '📷 Photo'}</Text>
    </TouchableOpacity>
    <Modal visible={viewerVisible} transparent animationType="fade" onRequestClose={() => setViewerVisible(false)}>
      <View style={styles.photoViewerOverlay}>
        <View style={styles.photoViewerHeader}>
          <Text style={styles.photoViewerTitle}>{label || 'Photo'} · {index + 1}/{photos.length}</Text>
          <TouchableOpacity onPress={() => setViewerHd((value) => !value)} style={{ paddingHorizontal: 12, paddingVertical: 7 }}><Text style={styles.photoViewerSecondaryText}>{viewerHd ? 'Aperçu' : 'HD'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setViewerVisible(false)}><Text style={styles.photoViewerClose}>✕</Text></TouchableOpacity>
        </View>
        {photos[index] && <PhotoVariantImage uri={photos[index].uri} variant={photos[index].pending || viewerHd ? 'original' : 'preview'} style={styles.photoViewerImage} resizeMode="contain" />}
        {photos.length > 1 && (
          <View style={styles.photoViewerNav}>
            <TouchableOpacity style={styles.photoViewerNavBtn} onPress={() => setIndex((index - 1 + photos.length) % photos.length)}><Text style={styles.photoViewerNavText}>‹ Précédente</Text></TouchableOpacity>
            <TouchableOpacity style={styles.photoViewerNavBtn} onPress={() => setIndex((index + 1) % photos.length)}><Text style={styles.photoViewerNavText}>Suivante ›</Text></TouchableOpacity>
          </View>
        )}
        <View style={styles.photoViewerActions}>
          <TouchableOpacity style={styles.photoViewerSecondary} onPress={demanderSuppression}><Text style={styles.photoViewerSecondaryText}>Supprimer</Text></TouchableOpacity>
          <TouchableOpacity style={styles.photoViewerSecondary} onPressIn={prechaufferCapture} onPress={ajouter}><Text style={styles.photoViewerSecondaryText}>+ Ajouter</Text></TouchableOpacity>
          <TouchableOpacity style={styles.photoViewerPrimary} onPressIn={() => { prewarmCameraRuntime().catch(() => {}); prewarmPhotoCaptureContext(visiteId).catch(() => {}); }} onPress={reprendre}><Text style={styles.photoViewerPrimaryText}>📷 Reprendre</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}

export { prendrePhoto, preparerPhotoNommee, enregistrerPhotoNommee, PhotoButton };
