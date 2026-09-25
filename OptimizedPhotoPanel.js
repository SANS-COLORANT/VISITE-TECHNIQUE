/** Galerie photo virtualisée pour limiter la mémoire sur tablette. */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { ajouterPhoto } from './db.js';
import { supprimerPhotoComplete } from './photoDb.js';
import { prendrePhoto, preparerPhotoNommee } from './PhotoButton.js';
import { COLORS, styles } from './styles.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { confirmerPhotoJournalisee, journaliserPhotoEnAttente } from './photoPersistenceJournal.js';
import { beginExternalSave, endExternalSave } from './saveActivity.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { prewarmPhotoCaptureContext } from './photoCaptureContext.js';
import {
  loadVisitPhotos,
  peekVisitPhotos,
  removeRuntimePhoto,
  replaceRuntimePhoto,
  subscribeVisitPhotos,
  upsertRuntimePhoto
} from './photoRuntimeCache.js';

const PhotoTile = memo(function PhotoTile({ photo, taille, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.photoThumb, { width: taille, height: taille }]}
      onPress={() => onPress(photo)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={photo.label ? `Ouvrir ${photo.label}` : 'Ouvrir la photo'}
    >
      <PhotoVariantImage
        uri={photo.uri}
        variant={photo.pending ? 'original' : 'thumb'}
        style={[styles.photoThumbImg, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
});

function OptimizedPhotoPanel({ visiteId }) {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState(() => peekVisitPhotos(visiteId) || []);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const [viewerHd, setViewerHd] = useState(false);
  const [cameraEnCours, setCameraEnCours] = useState(false);
  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-photos`, photos.length);

  useEffect(() => {
    let alive = true;
    const cached = peekVisitPhotos(visiteId);
    if (cached) setPhotos(cached);
    const unsubscribe = subscribeVisitPhotos(visiteId, (rows) => {
      if (!alive) return;
      setPhotos(rows);
      setViewerPhoto((current) => {
        if (!current) return null;
        const byId = rows.find((row) => String(row.id) === String(current.id));
        if (byId) return byId;
        return current.pending ? current : null;
      });
    });
    if (!cached) loadVisitPhotos(visiteId).catch(() => {});
    prewarmCameraRuntime().catch(() => {});
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [visiteId]);

  const colonnes = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const espace = 10;
  const largeurDisponible = Math.max(240, width - (width >= 900 ? 270 : 32));
  const taille = useMemo(
    () => Math.max(105, Math.floor((largeurDisponible - espace * (colonnes - 1)) / colonnes)),
    [largeurDisponible, colonnes]
  );

  const onAjouter = useCallback(async () => {
    if (cameraEnCours) return;
    setCameraEnCours(true);
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    let captureUri = null;
    try {
      captureUri = await prendrePhoto();
    } catch (e) {
      Alert.alert('Erreur photo', String(e?.message || e));
    } finally {
      // Le bouton redevient disponible dès le retour de l'appareil photo.
      setCameraEnCours(false);
    }
    if (!captureUri) return;

    const tempId = `photo-pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      id: tempId,
      visite_id: visiteId,
      entite_key: null,
      uri: captureUri,
      label: 'Photo générale',
      cree_le: new Date().toISOString(),
      pending: true
    };
    upsertRuntimePhoto(visiteId, optimistic);

    // Toute la persistance est découplée du retour caméra pour permettre une
    // nouvelle prise immédiatement, y compris en série.
    void (async () => {
      const saveKey = `photo-panel:${visiteId}:${Date.now()}`;
      let journalKey = null;
      beginExternalSave(saveKey);
      try {
        const photo = await preparerPhotoNommee({
          visiteId,
          entiteKey: null,
          label: 'Photo générale',
          uri: captureUri
        });
        if (!photo.uri) throw new Error('Photo non préparée');
        const labelDb = photo.nom ? `Photo générale||${photo.nom}` : 'Photo générale';

        replaceRuntimePhoto(visiteId, tempId, {
          ...optimistic,
          id: tempId,
          uri: photo.uri,
          label: labelDb,
          pending: true
        });

        journalKey = await journaliserPhotoEnAttente({ visiteId, entiteKey: null, uri: photo.uri, labelDb });
        const photoId = await ajouterPhoto(visiteId, null, photo.uri, labelDb);
        await confirmerPhotoJournalisee(journalKey).catch(() => {});
        journalKey = null;

        replaceRuntimePhoto(visiteId, tempId, {
          id: photoId,
          visite_id: visiteId,
          entite_key: null,
          uri: photo.uri,
          label: labelDb,
          cree_le: new Date().toISOString(),
          pending: false
        });
        endExternalSave(saveKey);
      } catch (e) {
        if (!journalKey) removeRuntimePhoto(visiteId, tempId);
        endExternalSave(saveKey, e);
        Alert.alert('Erreur photo', String(e?.message || e));
      }
    })();
  }, [cameraEnCours, visiteId]);

  const supprimerSelection = useCallback(() => {
    if (!viewerPhoto?.id || viewerPhoto.pending) return;
    const photo = { ...viewerPhoto };
    Alert.alert(
      'Supprimer cette photo ?',
      'La photo sera retirée de la visite et supprimée du stockage local de la tablette.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setViewerPhoto(null);
            removeRuntimePhoto(visiteId, photo.id);
            try {
              await supprimerPhotoComplete(photo.id);
            } catch (e) {
              upsertRuntimePhoto(visiteId, photo);
              Alert.alert('Suppression impossible', String(e?.message || e));
            }
          }
        }
      ]
    );
  }, [viewerPhoto, visiteId]);

  const header = useMemo(
    () => (
      <View>
        <Text style={styles.sectionTitle}>Toutes les photos de la visite · {photos.length}</Text>
        <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>
          Galerie virtualisée : seules les images proches de l’écran restent montées pour préserver la mémoire de la
          tablette.
        </Text>
      </View>
    ),
    [photos.length]
  );

  const footer = useMemo(
    () => (
      <TouchableOpacity
        style={[styles.addBtn, cameraEnCours && { opacity: 0.55 }]}
        onPressIn={() => {
          prewarmCameraRuntime().catch(() => {});
          prewarmPhotoCaptureContext(visiteId).catch(() => {});
        }}
        onPress={onAjouter}
        disabled={cameraEnCours}
      >
        <Text style={styles.addBtnText}>{cameraEnCours ? 'Appareil photo…' : '+ Ajouter une photo générale'}</Text>
      </TouchableOpacity>
    ),
    [cameraEnCours, onAjouter, visiteId]
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={photos}
        onScroll={onScroll}
        scrollEventThrottle={100}
        key={`photos-${colonnes}`}
        numColumns={colonnes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PhotoTile
            photo={item}
            taille={taille}
            onPress={(photo) => {
              setViewerHd(false);
              setViewerPhoto(photo);
            }}
          />
        )}
        columnWrapperStyle={colonnes > 1 ? { gap: espace } : undefined}
        contentContainerStyle={styles.panelContent}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune photo pour cette visite.</Text>
            <Text style={styles.emptySub}>
              Les photos prises depuis les équipements, réserves et compteurs apparaîtront aussi ici.
            </Text>
          </View>
        }
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setViewerPhoto(null)}
            activeOpacity={1}
          />
          {viewerPhoto ? (
            <PhotoVariantImage
              uri={viewerPhoto.uri}
              variant={viewerPhoto.pending || viewerHd ? 'original' : 'preview'}
              style={styles.viewerImg}
              resizeMode="contain"
            />
          ) : null}
          <View style={{ position: 'absolute', top: 24, right: 24 }}>
            <TouchableOpacity style={styles.photoViewerSecondary} onPress={() => setViewerHd((v) => !v)}>
              <Text style={styles.photoViewerSecondaryText}>{viewerHd ? 'Aperçu léger' : 'HD'}</Text>
            </TouchableOpacity>
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 26,
              left: 24,
              right: 24,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 12
            }}
          >
            <TouchableOpacity style={styles.photoViewerSecondary} onPress={supprimerSelection}>
              <Text style={styles.photoViewerSecondaryText}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoViewerPrimary} onPress={() => setViewerPhoto(null)}>
              <Text style={styles.photoViewerPrimaryText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { OptimizedPhotoPanel };
