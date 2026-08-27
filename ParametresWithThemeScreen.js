import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { ParametresScreen } from './ParametresScreen.js';
import { setAppThemeMode, THEME_ANIMATED, THEME_CLASSIC } from './themePreference.js';
import { getRuntimeAccent, setRuntimeThemeMode } from './themeRuntime.js';

function ThemeChoice({ active, title, subtitle, onPress }) {
  const accent = getRuntimeAccent();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 76,
        borderRadius: 12,
        borderWidth: active ? 2 : 1,
        borderColor: active ? accent : COLORS.line,
        backgroundColor: active ? (title.includes('animé') ? '#E7F2EB' : '#FFF1EA') : COLORS.white,
        padding: 12,
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: active ? accent : COLORS.ink }}>{active ? '● ' : '○ '}{title}</Text>
      <Text style={{ marginTop: 5, fontSize: 11, lineHeight: 15, color: COLORS.inkSoft }}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export function ParametresWithThemeScreen({ themeMode = THEME_CLASSIC, onThemeChanged }) {
  const [saving, setSaving] = useState(false);

  const choisir = async (mode) => {
    if (saving || mode === themeMode) return;
    setSaving(true);
    try {
      const saved = await setAppThemeMode(mode);
      setRuntimeThemeMode(saved);
      onThemeChanged?.(saved);
      Alert.alert(
        'Thème appliqué',
        saved === THEME_ANIMATED
          ? 'Le thème animé Doom est activé. Les éléments orange de l’application passent en vert #106836. Les rapports et exports restent inchangés.'
          : 'Le thème classique est activé. Les couleurs orange d’origine sont restaurées.'
      );
    } catch (e) {
      Alert.alert('Thème non modifié', String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <Text style={styles.sectionLabel}>Thème de l’application</Text>
        <Text style={[styles.cardSub, { marginTop: 5, marginBottom: 10 }]}>Le thème ne modifie que l’interface de METRA. Les PDF, Word et Excel conservent leurs couleurs habituelles.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ThemeChoice
            active={themeMode === THEME_CLASSIC}
            title="Thème classique"
            subtitle="Animation METRA et orange d’origine."
            onPress={() => choisir(THEME_CLASSIC)}
          />
          <ThemeChoice
            active={themeMode === THEME_ANIMATED}
            title="Thème animé"
            subtitle="Animation Doom et accent vert #106836."
            onPress={() => choisir(THEME_ANIMATED)}
          />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <ParametresScreen />
      </View>
    </View>
  );
}
