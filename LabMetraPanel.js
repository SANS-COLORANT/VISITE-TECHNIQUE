import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { LAB_FEATURES, getLabFeatureStates, setLabFeatureEnabled } from './featureSettings.js';

function FeatureRow({ feature, enabled, disabled, onChange }) {
  return (
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: enabled ? COLORS.orange : COLORS.line, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: enabled ? COLORS.orangeLight : COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 19, color: enabled ? COLORS.orangeDark : COLORS.inkSoft }}>{feature.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.ink }}>{feature.title}</Text>
          <Text style={{ marginTop: 4, fontSize: 11, lineHeight: 15, color: COLORS.inkSoft }}>{feature.description}</Text>
        </View>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => onChange(!enabled)}
          activeOpacity={0.75}
          style={{ width: 68, height: 34, borderRadius: 17, padding: 3, justifyContent: 'center', backgroundColor: enabled ? COLORS.orange : COLORS.line, opacity: disabled ? 0.55 : 1 }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.white, alignSelf: enabled ? 'flex-end' : 'flex-start', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: enabled ? COLORS.orange : COLORS.inkSoft }}>{enabled ? 'ON' : 'OFF'}</Text>
          </View>
        </TouchableOpacity>
      </View>
      {enabled ? <Text style={{ marginTop: 9, fontSize: 10, color: COLORS.orangeDark, fontWeight: '800' }}>Fonction expérimentale active</Text> : null}
    </View>
  );
}

export function LabMetraPanel() {
  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setStates(await getLabFeatureStates()); }
    catch (error) { Alert.alert('LAB METRA', String(error?.message || error)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggle = useCallback(async (key, enabled) => {
    if (savingKey) return;
    setSavingKey(key);
    setStates((current) => ({ ...current, [key]: enabled }));
    try {
      await setLabFeatureEnabled(key, enabled);
    } catch (error) {
      setStates((current) => ({ ...current, [key]: !enabled }));
      Alert.alert('Réglage non enregistré', String(error?.message || error));
    } finally {
      setSavingKey(null);
    }
  }, [savingKey]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}><ActivityIndicator color={COLORS.orange} size="large"/><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Chargement du LAB METRA…</Text></View>;

  return (
    <View style={styles.content}>
      <View style={{ borderRadius: 15, backgroundColor: '#FFF7F1', borderWidth: 1, borderColor: '#F6C7AD', padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.ink }}>LAB METRA</Text>
        <Text style={{ marginTop: 5, color: COLORS.inkSoft, fontSize: 11.5, lineHeight: 16 }}>
          Active uniquement les fonctions que tu veux essayer. Une fonction désactivée reste masquée dans l'application et n'altère pas le fonctionnement normal des visites.
        </Text>
      </View>
      {LAB_FEATURES.map((feature) => (
        <FeatureRow
          key={feature.key}
          feature={feature}
          enabled={!!states[feature.key]}
          disabled={!!savingKey}
          onChange={(enabled) => toggle(feature.key, enabled)}
        />
      ))}
      <Text style={{ marginTop: 4, fontSize: 9.5, color: COLORS.inkFaint, textAlign: 'center' }}>
        LAB METRA · fonctionnalités expérimentales locales à cette tablette
      </Text>
    </View>
  );
}
