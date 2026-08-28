import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { ParametresScreen } from './ParametresScreen.js';
import { setRuntimeVisualPalette } from './visual-packs/runtime/visualPaletteRuntime.js';
import {
  activateVisualPack,
  importVisualPackZip,
  listVisualPacks,
} from './visual-packs/runtime/visualPackManager.js';

function PackChoice({ active, pack, onPress }) {
  const accent = pack?.colors?.main || '#F26426';
  const light = pack?.colors?.light || '#FFF1EA';
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        width: 210,
        minHeight: 92,
        marginRight: 10,
        borderRadius: 12,
        borderWidth: active ? 2 : 1,
        borderColor: active ? accent : COLORS.line,
        backgroundColor: active ? light : COLORS.white,
        padding: 12,
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: active ? accent : COLORS.ink }}>
        {active ? '● ' : '○ '}{pack?.name || 'Pack visuel'}
      </Text>
      <Text style={{ marginTop: 5, fontSize: 11, lineHeight: 15, color: COLORS.inkSoft }}>
        {pack?.description || 'Personnalisation de l’interface METRA.'}
      </Text>
      <Text style={{ marginTop: 6, fontSize: 10, fontWeight: '700', color: COLORS.inkSoft }}>
        v{pack?.version || 1}{pack?._builtin ? ' · intégré' : ' · local'}
      </Text>
    </TouchableOpacity>
  );
}

export function ParametresVisualPacksScreen({ visualPack, onVisualPackChanged }) {
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(true);

  const reloadPacks = useCallback(async () => {
    setLoadingPacks(true);
    try {
      setPacks(await listVisualPacks());
    } catch (e) {
      Alert.alert('Packs visuels', String(e.message || e));
    } finally {
      setLoadingPacks(false);
    }
  }, []);

  useEffect(() => { reloadPacks(); }, [reloadPacks]);

  const choisir = async (pack) => {
    if (saving || !pack || pack.id === visualPack?.id) return;
    setSaving(true);
    try {
      const selected = await activateVisualPack(pack.id);
      setRuntimeVisualPalette(selected.colors);
      onVisualPackChanged?.(selected);
      Alert.alert(
        'Pack visuel appliqué',
        `${selected.name} est maintenant actif. Les couleurs de l’interface sont appliquées immédiatement. Les animations de démarrage seront visibles au prochain lancement. Les PDF, Word et Excel restent inchangés.`
      );
    } catch (e) {
      Alert.alert('Pack non modifié', String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const importer = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const imported = await importVisualPackZip();
      if (!imported) return;
      await reloadPacks();
      Alert.alert(
        'Pack importé',
        `${imported.name} v${imported.version} est stocké localement et restera disponible hors ligne. Sélectionne-le dans la liste pour l’activer.`
      );
    } catch (e) {
      Alert.alert('Import impossible', String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        <Text style={styles.sectionLabel}>Apparence et packs visuels</Text>
        <Text style={[styles.cardSub, { marginTop: 5, marginBottom: 10 }]}>
          Les packs peuvent contenir couleurs, logos et petites animations. Ils ne modifient jamais les PDF, Word ou Excel. Le pack Classique reste toujours disponible comme secours.
        </Text>

        {loadingPacks ? (
          <View style={{ height: 92, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
            {packs.map((pack) => (
              <PackChoice
                key={pack.id}
                active={pack.id === visualPack?.id}
                pack={pack}
                onPress={() => choisir(pack)}
              />
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={saving}
          onPress={importer}
          style={{
            marginTop: 10,
            alignSelf: 'flex-start',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: visualPack?.colors?.main || '#F26426',
            paddingHorizontal: 13,
            paddingVertical: 9,
            opacity: saving ? 0.55 : 1,
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: visualPack?.colors?.main || '#F26426' }}>
            {saving ? 'Traitement…' : 'Importer un pack visuel (.zip)'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        <ParametresScreen />
      </View>
    </View>
  );
}
