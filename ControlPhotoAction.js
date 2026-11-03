/**
 * Raccourci photo métier transversal : ICPE, VMC, Réseau de chaleur,
 * REMAR, Pré-allumage et autres panneaux utilisant les mêmes contrôles.
 *
 * Un avis ouvre uniquement l'accès à la photo ; jamais la caméra de force.
 * L'identité physique de la photo reste le controleKey historique, même si
 * l'utilisateur change S / N.S / S.O. Aucune suppression de photos.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { PhotoButton } from './PhotoButton.js';

const AVIS_PHOTO = new Set(['S', 'N.S', 'S.O', 'N.R', 'N.V']);

export function ControlPhotoAction({
  visiteId, entiteKey, label, avis, PhotoComponent = PhotoButton,
}) {
  if (!AVIS_PHOTO.has(avis) || !visiteId || !entiteKey) return null;
  const Photo = PhotoComponent;
  const isNs = avis === 'N.S';
  return <View accessibilityLabel={`Photo du contrôle : ${label}`}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48,
      paddingVertical: 4, marginTop: 6, marginBottom: 4 }}>
    <Photo visiteId={visiteId} entiteKey={entiteKey} label={label}
      controlPhoto style={{ minHeight: 42, minWidth: 42 }} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 12, color: isNs ? COLORS.red : COLORS.ink,
        fontFamily: FONTS.bodyBold }}>Photo du contrôle</Text>
      <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 10.5, lineHeight: 14,
        color: COLORS.inkSoft }}>
        {isNs ? 'Recommandée pour documenter l’anomalie · facultative'
          : 'Facultative · ajout possible à tout moment'}
      </Text>
    </View>
  </View>;
}
