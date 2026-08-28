import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, styles } from '../../styles.js';
import { ParametresScreen } from '../../ParametresScreen.js';
import { setRuntimeVisualPalette } from './visualPaletteRuntime.js';
import {
  activateVisualPack,
  importVisualPackZip,
  listVisualPacks,
} from './visualPackManager.js';

const LONG_PRESS_MS = 2500;

function PackChoice({ active, pack, disabled, onPress }) {
  const accent = pack?.colors?.main || '#F26426';
  const light = pack?.colors?.light || '#FFF1EA';
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderRadius: 12,
        borderWidth: active ? 2 : 1,
        borderColor: active ? accent : COLORS.line,
        backgroundColor: active ? light : COLORS.white,
        paddingHorizontal: 13,
        paddingVertical: 11,
        marginBottom: 8,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: active ? accent : COLORS.line,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          {active ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accent }} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: active ? accent : COLORS.ink }}>
            {pack?.name || 'Pack visuel'}
          </Text>
          <Text style={{ marginTop: 3, fontSize: 10.5, lineHeight: 14, color: COLORS.inkSoft }}>
            {pack?.description || 'Personnalisation de l’interface METRA.'}
          </Text>
        </View>
        <Text style={{ marginLeft: 10, fontSize: 9.5, color: COLORS.inkFaint }}>
          v{pack?.version || 1}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function CompactToggle({ animationOn, activeName, accent, disabled, onOff, onOn, onLongPressOn }) {
  return (
    <View
      style={{
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: animationOn ? `${accent}14` : COLORS.bg,
            borderWidth: 1,
            borderColor: animationOn ? `${accent}55` : COLORS.line,
            marginRight: 10,
          }}
        >
          <Text style={{ fontSize: 15, color: animationOn ? accent : COLORS.inkSoft }}>✦</Text>
        </View>

        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.ink }}>
            Animations visuelles
          </Text>
          <Text style={{ marginTop: 1, fontSize: 9.5, color: COLORS.inkSoft }} numberOfLines={1}>
            {animationOn ? activeName : 'Désactivées'}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            borderRadius: 9,
            borderWidth: 1,
            borderColor: COLORS.line,
            backgroundColor: COLORS.bg,
            padding: 2,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={onOff}
            style={{
              minWidth: 54,
              paddingHorizontal: 9,
              paddingVertical: 7,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: !animationOn ? COLORS.white : 'transparent',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: !animationOn ? COLORS.ink : COLORS.inkSoft }}>
              ○ OFF
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={onOn}
            onLongPress={onLongPressOn}
            delayLongPress={LONG_PRESS_MS}
            style={{
              minWidth: 54,
              paddingHorizontal: 9,
              paddingVertical: 7,
              borderRadius: 7,
              alignItems: 'center',
              backgroundColor: animationOn ? accent : 'transparent',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: animationOn ? '#FFFFFF' : COLORS.inkSoft }}>
              ✦ ON
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={{ marginTop: 4, textAlign: 'right', fontSize: 8.5, color: COLORS.inkFaint }}>
        Maintenir ON 2,5 s pour choisir un thème
      </Text>
    </View>
  );
}

export function VisualPacksSettingsScreen({ visualPack, onVisualPackChanged }) {
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [lastAnimatedPackId, setLastAnimatedPackId] = useState(null);
  const longPressTriggered = useRef(false);

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

  useEffect(() => {
    if (visualPack?.id && visualPack.id !== 'classic') setLastAnimatedPackId(visualPack.id);
  }, [visualPack?.id]);

  const appliquer = useCallback(async (pack, { closeSelector = false } = {}) => {
    if (saving || !pack) return null;
    if (pack.id === visualPack?.id) {
      if (closeSelector) setSelectorVisible(false);
      return pack;
    }

    setSaving(true);
    try {
      const selected = await activateVisualPack(pack.id);
      setRuntimeVisualPalette(selected.colors);
      if (selected.id !== 'classic') setLastAnimatedPackId(selected.id);
      onVisualPackChanged?.(selected);
      if (closeSelector) setSelectorVisible(false);
      return selected;
    } catch (e) {
      Alert.alert('Pack non modifié', String(e.message || e));
      return null;
    } finally {
      setSaving(false);
    }
  }, [onVisualPackChanged, saving, visualPack?.id]);

  const turnOff = useCallback(() => {
    const classic = packs.find((pack) => pack.id === 'classic');
    if (classic) appliquer(classic);
  }, [appliquer, packs]);

  const turnOn = useCallback(() => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (visualPack?.id && visualPack.id !== 'classic') return;
    const preferred = packs.find((pack) => pack.id === lastAnimatedPackId && pack.id !== 'classic');
    const fallback = packs.find((pack) => pack.id !== 'classic');
    if (preferred || fallback) appliquer(preferred || fallback);
  }, [appliquer, lastAnimatedPackId, packs, visualPack?.id]);

  const openSelector = useCallback(() => {
    longPressTriggered.current = true;
    setSelectorVisible(true);
  }, []);

  const choisir = useCallback((pack) => appliquer(pack, { closeSelector: true }), [appliquer]);

  const importer = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const imported = await importVisualPackZip();
      if (!imported) return;
      await reloadPacks();
      Alert.alert(
        'Thème ajouté',
        `${imported.name} v${imported.version} est disponible hors ligne. Tu peux maintenant le sélectionner dans cette fenêtre.`
      );
    } catch (e) {
      Alert.alert('Import impossible', String(e.message || e));
    } finally {
      setSaving(false);
    }
  }, [reloadPacks, saving]);

  const animationOn = !!visualPack?.id && visualPack.id !== 'classic';
  const accent = visualPack?.colors?.main || '#F26426';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <CompactToggle
        animationOn={animationOn}
        activeName={visualPack?.name || 'Thème animé'}
        accent={accent}
        disabled={saving || loadingPacks}
        onOff={turnOff}
        onOn={turnOn}
        onLongPressOn={openSelector}
      />

      <View style={{ flex: 1 }}>
        <ParametresScreen />
      </View>

      <Modal
        visible={selectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(20,20,20,0.42)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '78%',
              backgroundColor: COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.line,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 13,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.ink }}>Thèmes visuels</Text>
                <Text style={{ marginTop: 2, fontSize: 10, color: COLORS.inkSoft }}>
                  Apparence et animation de démarrage
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectorVisible(false)}
                style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 24, lineHeight: 26, color: COLORS.inkSoft }}>×</Text>
              </TouchableOpacity>
            </View>

            {loadingPacks ? (
              <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 14 }}>
                {packs.map((pack) => (
                  <PackChoice
                    key={pack.id}
                    active={pack.id === visualPack?.id}
                    pack={pack}
                    disabled={saving}
                    onPress={() => choisir(pack)}
                  />
                ))}

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={saving}
                  onPress={importer}
                  style={{
                    marginTop: 4,
                    borderRadius: 11,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: accent,
                    paddingHorizontal: 13,
                    paddingVertical: 11,
                    alignItems: 'center',
                    opacity: saving ? 0.55 : 1,
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: accent }}>
                    ＋ Ajouter un thème (.zip)
                  </Text>
                </TouchableOpacity>

                <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 8.5, color: COLORS.inkFaint }}>
                  Les thèmes modifient uniquement l'interface. Les PDF, Word et Excel restent inchangés.
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
