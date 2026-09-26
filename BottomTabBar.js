/**
 * Barre de navigation du bas (DA "Verre chaud") : remplace le bouton Accueil
 * flottant. Placée dans le flux (pas en surimpression) pour ne jamais
 * recouvrir le contenu des écrans ; l'onglet actif prend la pastille dégradée.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';

function BottomTabBar({ tabs, activeKey, accent = COLORS.orange, accentDark = COLORS.orangeDark }) {
  const { width } = useWindowDimensions();
  // Sur téléphone avec 5 emplacements, la pastille horizontale ne tient pas :
  // l'onglet actif passe en pastille d'icône avec le libellé dessous.
  const compact = width / Math.max(1, tabs.length) < 112;
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        if (tab.center) {
          return (
            <View key={tab.key} style={styles.slot}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                onPress={tab.onPress}
                activeOpacity={0.85}
                style={[styles.centerShadow, { shadowColor: accent }]}
              >
                <LinearGradient
                  colors={[accent, accentDark]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.centerButton}
                >
                  <CvcIcon name={tab.icon} size={26} color={COLORS.white} strokeWidth={2.4} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={tab.onPress}
            style={styles.slot}
            activeOpacity={0.8}
          >
            {active && compact ? (
              <>
                <LinearGradient
                  colors={[accent, accentDark]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[styles.activeIconPill, { shadowColor: accent }]}
                >
                  <CvcIcon name={tab.icon} size={18} color={COLORS.white} strokeWidth={2.1} />
                </LinearGradient>
                <Text numberOfLines={1} style={[styles.label, { color: accentDark, fontFamily: FONTS.bodyBold }]}>{tab.label}</Text>
              </>
            ) : active ? (
              <LinearGradient
                colors={[accent, accentDark]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[styles.activePill, { shadowColor: accent }]}
              >
                <CvcIcon name={tab.icon} size={18} color={COLORS.white} strokeWidth={2.1} />
                <Text numberOfLines={1} style={styles.activeLabel}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <>
                <CvcIcon name={tab.icon} size={21} color={COLORS.inkSoft} />
                <Text numberOfLines={1} style={styles.label}>{tab.label}</Text>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(22,21,15,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  slot: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  centerShadow: {
    marginTop: -26,
    borderRadius: 19,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  activeIconPill: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  activeLabel: { fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.white },
});

export { BottomTabBar };
