/**
 * Compatibilite de listes METRA avec l'architecture React Native legacy.
 *
 * Cette application Play Store est construite avec newArchEnabled=false
 * (Expo SDK 54 / React Native 0.81). FlashList v2 exige Fabric et peut faire
 * fermer la page Catalogue des equipements lors du montage de la liste.
 *
 * FlatList est une implementation native prise en charge pour les deux
 * architectures. Garder la signature FastList pour ne modifier aucun ecran.
 */
import React from 'react';
import { FlatList } from 'react-native';

export function FastList({ estimatedItemSize: _estimatedItemSize = 96, numColumns = 1, columnWrapperStyle, ...props }) {
  return (
    <FlatList
      {...props}
      numColumns={numColumns}
      columnWrapperStyle={numColumns > 1 ? columnWrapperStyle : undefined}
      initialNumToRender={props.initialNumToRender ?? 12}
      maxToRenderPerBatch={props.maxToRenderPerBatch ?? 12}
      windowSize={props.windowSize ?? 7}
      removeClippedSubviews={props.removeClippedSubviews ?? false}
    />
  );
}
