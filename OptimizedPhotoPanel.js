/** Galerie photo virtualisée pour limiter la mémoire sur tablette. */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { listerPhotos, ajouterPhoto } from './db.js';
import { prendrePhoto, preparerPhotoNommee } from './PhotoButton.js';
import { COLORS, styles } from './styles.js';

const PhotoTile = memo(function PhotoTile({ photo, taille, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.photoThumb, { width: taille, height: taille }]}
      onPress={() => onPress(photo.uri)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={photo.label ? `Ouvrir ${photo.label}` : 'Ouvrir la photo'}
    >
      <Image
        source={{ uri: photo.uri }}
        style={[styles.photoThumbImg, { width: '100%', height: '100%' }]}
        resizeMode="cover"
        fadeDuration={0}
      />
    </TouchableOpacity>
  );
});

function OptimizedPhotoPanel({ visiteId }) {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState([]);
  const [viewerUri, setViewerUri] = useState(null);
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
    } finally {
      setAjoutEnCours(false);
    }
  }, [ajoutEnCours, charger, visiteId]);

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
        renderItem={({ item }) => <PhotoTile photo={item} taille={taille} onPress={setViewerUri} />}
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

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <TouchableOpacity style={styles.viewerOverlay} onPress={() => setViewerUri(null)} activeOpacity={1}>
          {viewerUri ? <Image source={{ uri: viewerUri }} style={styles.viewerImg} resizeMode="contain" /> : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export { OptimizedPhotoPanel };
