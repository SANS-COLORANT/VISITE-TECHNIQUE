/**
 * Liste rapide : FlashList (recyclage des cellules) pour les longues listes
 * à une colonne ; FlatList classique sinon (colonnes multiples avec
 * columnWrapperStyle, que FlashList ne gère pas).
 */
import React from 'react';
import { FlatList } from 'react-native';
import { FlashList } from '@shopify/flash-list';

export function FastList({ estimatedItemSize = 96, numColumns = 1, columnWrapperStyle, ...props }) {
  if (numColumns > 1 || columnWrapperStyle) {
    return <FlatList numColumns={numColumns} columnWrapperStyle={columnWrapperStyle} {...props} />;
  }
  const { initialNumToRender, maxToRenderPerBatch, windowSize, updateCellsBatchingPeriod, removeClippedSubviews, style, ...rest } = props;
  return <FlashList estimatedItemSize={estimatedItemSize} {...rest} />;
}
