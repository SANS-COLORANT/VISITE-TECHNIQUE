import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from './styles.js';

function HydraulicFeatureSettingRow({ enabled = false, onChange }) {
  return <View style={{ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.ink }}>Outil expérimental · Schéma technique</Text>
        <Text style={{ marginTop: 2, fontSize: 9, color: COLORS.inkSoft }} numberOfLines={1}>Afficher le bouton du schéma hydraulique dans une visite</Text>
      </View>
      <TouchableOpacity onPress={() => onChange?.(!enabled)} style={{ minWidth: 68, minHeight: 30, borderRadius: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled ? COLORS.orangeLight : COLORS.bg, borderWidth: 1, borderColor: enabled ? COLORS.orange : COLORS.line }}>
        <Text style={{ fontSize: 9.5, fontWeight: '900', color: enabled ? COLORS.orangeDark : COLORS.inkSoft }}>{enabled ? 'ACTIVÉ' : 'MASQUÉ'}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

export { HydraulicFeatureSettingRow };
