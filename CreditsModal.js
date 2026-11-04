import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';

export const METRA_CREDITS = Object.freeze([
  { code: 'TCA', label: 'Pour Thibault' },
  { code: 'EAL', label: 'Pour Erwan' },
  { code: 'TSAI', label: 'Pour Thomas' },
]);

export function CreditsModal({ visible, onClose }) {
  return <Modal visible={Boolean(visible)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet, { width: '90%', maxWidth: 440, alignSelf: 'center', padding: 20 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
            <CvcIcon name="tools" size={22} color={COLORS.orangeDark} />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 20, fontFamily: FONTS.black }}>Crédits</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 11.5, marginTop: 2 }}>METRA · Visite Technique</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer les crédits" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <CvcIcon name="close" size={22} color={COLORS.inkSoft} />
          </TouchableOpacity>
        </View>
        {METRA_CREDITS.map((entry) => <View key={entry.code} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.line }}>
          <View style={{ width: 66, minHeight: 34, borderRadius: 10, backgroundColor: COLORS.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: COLORS.orangeDark, fontFamily: FONTS.black, fontSize: 13 }}>{entry.code}</Text>
          </View>
          <Text style={{ marginLeft: 14, color: COLORS.ink, fontFamily: FONTS.bodyBold, fontSize: 14.5 }}>{entry.label}</Text>
        </View>)}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={[styles.btnPrimary, { marginTop: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={styles.btnPrimaryText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
