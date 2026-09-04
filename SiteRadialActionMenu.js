import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

const SIZE = 232;
const HALF = SIZE / 2;
const RADIUS = 78;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function SiteRadialActionMenu({ menu, onAction, onClose }) {
  const { width, height } = useWindowDimensions();
  if (!menu) return null;

  const actions = [
    { key: 'rename', label: 'Renommer', icon: '✎', angle: -90 },
    { key: 'duplicate', label: 'Dupliquer', icon: '⧉', angle: 30 },
    { key: 'delete', label: 'Supprimer', icon: '×', angle: 150, danger: true },
  ];

  const centerX = clamp(Number(menu.x || width / 2), HALF + 8, Math.max(HALF + 8, width - HALF - 8));
  const centerY = clamp(Number(menu.y || height / 2), HALF + 8, Math.max(HALF + 8, height - HALF - 8));

  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1 }}>
      <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#0004' }} />
      <View pointerEvents="box-none" style={{ position: 'absolute', left: centerX - HALF, top: centerY - HALF, width: SIZE, height: SIZE }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 43, top: 43, width: 146, height: 146, borderRadius: 73, backgroundColor: '#06111ADC', borderWidth: 1, borderColor: '#31576C' }} />
        {actions.map((action) => {
          const rad = action.angle * Math.PI / 180;
          const left = HALF + Math.cos(rad) * RADIUS - 30;
          const top = HALF + Math.sin(rad) * RADIUS - 30;
          return <TouchableOpacity key={action.key} onPress={() => onAction?.(action.key, menu.site)} style={{ position: 'absolute', left, top, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: action.danger ? '#FF7A80' : '#477186', backgroundColor: action.danger ? '#53252B' : '#143143' }}>
            <Text style={{ color: action.danger ? '#FFB0B4' : '#F5FBFF', fontWeight: '900', fontSize: 19 }}>{action.icon}</Text>
            <Text numberOfLines={1} style={{ color: action.danger ? '#FFB0B4' : '#D8EEF8', fontSize: 8.5, fontWeight: '800', marginTop: 1 }}>{action.label}</Text>
          </TouchableOpacity>;
        })}
        <TouchableOpacity onPress={onClose} style={{ position: 'absolute', left: 85, top: 85, width: 62, height: 62, borderRadius: 31, backgroundColor: '#0B202D', borderWidth: 2, borderColor: '#3DC7E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text numberOfLines={2} style={{ color: '#F5FBFF', fontWeight: '900', fontSize: 9.5, textAlign: 'center', maxWidth: 52 }}>{String(menu.site?.nom_site || 'Actions').slice(0, 18)}</Text>
          <Text style={{ color: '#91A7B5', fontSize: 10 }}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
