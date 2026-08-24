/** Galerie photo virtualisée pour limiter la mémoire sur tablette. */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Modal, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { listerPhotos, ajouterPhoto } from './db.js';
import { supprimerPhotoComplete } from './photoDb.js';
import { prendrePhoto, preparerPhotoNommee } from './PhotoButton.js';
import { COLORS, styles } from './styles.js';

const PhotoTile = memo(function PhotoTile({ photo, taille, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.photoThumb, { width: taille, height: taille }]}
      onPress={() => onPress(photo)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={photo.label ? `Ouvrir ${photo.label}` : 'Ouvrir la photo'}
    >
      <Image
        source={{ uri: photo.uri }}
        style={[styles.photoThumbImg, { width: '100%', height: '100%' }]}
        resizeMode="cover"
        resizeMethod="resize"
        fadeDuration={0}
      />
    </TouchableOpacity>
  );
});

function OptimizedPhotoPanel({ visiteId }) {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState([]);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const charger = useCallback(async () => {
    setPhotos(await listerPhotos(visiteId));
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  const colonnes = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const espace = 10;
  const largeurDisponible = Math.max(240, width - (width >= 900 ? 270 : 32));
  const taille = useMemo(
    () => Math.max(105, Math.floor((largeurDisponible - espace * (colonnes - 1)) / colonnes)),
    [largeurDisponible, colonnes]
  );

  const onAjouter = useCallback(async () => {
    if (ajoutEnCours) return;
    setAjoutEnCours(true);
    try {
      const captureUri = await prendrePhoto();
      if (!captureUri) return;
      const photo = await preparerPhotoNommee({
        visiteId,
        entiteKey: null,
        label: 'Photo générale',
        uri: captureUri,
      });
      if (!photo.uri) return;
      const labelDb = photo.nom ? `Photo générale||${photo.nom}` : 'Photo générale';
      await ajouterPhoto(visiteId, null, photo.uri, labelDb);
      await charger();
    } catch (e) {
      Alert.alert('Erreur photo', String(e?.message || e));
    } finally {
      setAjoutEnCours(false);
    }
  }, [ajoutEnCours, charger, visiteId]);

  const supprimerSelection = useCallback(() => {
    if (!viewerPhoto?.id) return;
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
              await supprimerPhotoComplete(viewerPhoto.id);
              setViewerPhoto(null);
              await charger();
            } catch (e) {
              Alert.alert('Suppression impossible', String(e?.message || e));
            }
          },
        },
      ]
    );
  }, [charger, viewerPhoto]);

  const header = useMemo(() => (
    <View>
      <Text style={styles.sectionTitle}>Toutes les photos de la visite · {photos.length}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>
        Galerie virtualisée : seules les images proches de l’écran restent montées pour préserver la mémoire de la tablette.
      </Text>
    </View>
  ), [photos.length]);

  const footer = useMemo(() => (
    <TouchableOpacity
      style={[styles.addBtn, ajoutEnCours && { opacity: 0.55 }]}
      onPress={onAjouter}
      disabled={ajoutEnCours}
    >
      <Text style={styles.addBtnText}>{ajoutEnCours ? 'Ajout de la photo…' : '+ Ajouter une photo générale'}</Text>
    </TouchableOpacity>
  ), [ajoutEnCours, onAjouter]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={photos}
        key={`photos-${colonnes}`}
        numColumns={colonnes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PhotoTile photo={item} taille={taille} onPress={setViewerPhoto} />}
        columnWrapperStyle={colonnes > 1 ? { gap: espace } : undefined}
        contentContainerStyle={styles.panelContent}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucune photo pour cette visite.</Text><Text style={styles.emptySub}>Les photos prises depuis les équipements, réserves et compteurs apparaîtront aussi ici.</Text></View>}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />

      <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
        <View style={styles.viewerOverlay}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setViewerPhoto(null)} activeOpacity={1} />
          {viewerPhoto ? <Image source={{ uri: viewerPhoto.uri }} style={styles.viewerImg} resizeMode="contain" /> : null}
          <View style={{ position: 'absolute', bottom: 26, left: 24, right: 24, flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
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
