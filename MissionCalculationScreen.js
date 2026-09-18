import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  calculerFormuleMission,
  creerFormuleMission,
  enregistrerCalculDepuisFormule,
  listerCalculsMission,
  listerFormulesMission,
} from './missionCalculationDb.js';

function parse(value, fallback = []) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function FormulaCard({ item, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={[missionStyles.card, { padding: 11, marginBottom: 7, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine }]}>
    <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11, fontWeight: '900' }}>{item.label}</Text>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>{item.family || 'Personnalisée'} · {item.unit || 'sans unité'}</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, marginTop: 4 }}>{item.formula}</Text>
  </TouchableOpacity>;
}

export function MissionCalculationScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [formulas, setFormulas] = useState([]);
  const [calculations, setCalculations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [values, setValues] = useState({});
  const [preview, setPreview] = useState(null);
  const [customVisible, setCustomVisible] = useState(false);
  const [custom, setCustom] = useState({ label: '', family: 'CVC', formula: '', unit: '', inputs: '' });

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([listerFormulesMission(missionId), listerCalculsMission(missionId)]);
    setFormulas(f || []);
    setCalculations(c || []);
    if (!selectedId && f?.[0]?.id) setSelectedId(f[0].id);
  }, [missionId, selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => formulas.find((f) => f.id === selectedId) || null, [formulas, selectedId]);
  const schema = useMemo(() => parse(selected?.input_schema_json, []), [selected]);

  useEffect(() => {
    setValues({});
    setPreview(null);
  }, [selectedId]);

  const calculate = () => {
    if (!selected) return;
    try {
      const result = calculerFormuleMission(selected, values);
      setPreview(result.result);
    } catch (e) {
      Alert.alert('Calcul impossible', String(e?.message || e));
    }
  };

  const saveCalculation = async () => {
    if (!selected) return;
    try {
      const result = await enregistrerCalculDepuisFormule({ missionId, formulaRow: selected, inputValues: values });
      setPreview(result.result);
      await load();
      Alert.alert('Calcul enregistré', 'Le résultat, la formule et les valeurs d’entrée restent traçables dans la Mission.');
    } catch (e) {
      Alert.alert('Calcul impossible', String(e?.message || e));
    }
  };

  const saveCustom = async () => {
    const inputKeys = String(custom.inputs || '').split(',').map((v) => v.trim()).filter(Boolean);
    if (!custom.label.trim() || !custom.formula.trim() || !inputKeys.length) {
      Alert.alert('À compléter', 'Indique un nom, une formule et au moins une variable séparée par une virgule.');
      return;
    }
    const inputs = inputKeys.map((key) => ({ key, label: key, unit: '' }));
    const id = await creerFormuleMission({
      missionId,
      scope: 'mission',
      family: custom.family,
      label: custom.label,
      formula: custom.formula,
      unit: custom.unit,
      inputs,
    });
    setCustomVisible(false);
    setCustom({ label: '', family: 'CVC', formula: '', unit: '', inputs: '' });
    await load();
    setSelectedId(id);
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Calculs 🧮</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginBottom: 12 }}>
        Les calculs restent explicables : formule, entrées, hypothèses et résultat sont conservés. Une formule peut être ajoutée et réutilisée.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setCustomVisible(true)}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Formule personnalisée</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Bibliothèque</Text>
      <View style={{ maxHeight: 260 }}>
        {formulas.map((item) => <FormulaCard key={item.id} item={item} selected={item.id === selectedId} onPress={() => setSelectedId(item.id)} />)}
      </View>

      {selected ? <View style={[missionStyles.card, { padding: 13, marginTop: 12 }]}>
        <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 13 }}>{selected.label}</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 3 }}>{selected.formula} {selected.unit ? '→ ' + selected.unit : ''}</Text>
        <View style={{ marginTop: 12 }}>
          {schema.map((input) => <View key={input.key} style={{ marginBottom: 9 }}>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '800', marginBottom: 4 }}>{input.label || input.key}{input.unit ? ' · ' + input.unit : ''}</Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              keyboardType="decimal-pad"
              value={String(values[input.key] ?? '')}
              onChangeText={(v) => setValues((all) => ({ ...all, [input.key]: v }))}
              placeholder={input.key}
            />
          </View>)}
        </View>
        {preview !== null ? <View style={[missionStyles.statBox, { padding: 12, borderRadius: 12, marginBottom: 10 }]}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>RÉSULTAT</Text>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 22, fontWeight: '900', marginTop: 2 }}>{Number(preview).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} {selected.unit || ''}</Text>
        </View> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={calculate}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Calculer</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { flex: 1, alignItems: 'center' }]} onPress={saveCalculation}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Calculer & enregistrer</Text></TouchableOpacity>
        </View>
      </View> : null}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Calculs enregistrés</Text>
      {calculations.map((c) => <View key={c.id} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 10.8 }}>{c.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 2 }}>{c.formula}</Text>
          </View>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 12 }}>{c.result_number ?? c.result_text ?? '/'} {c.unit || ''}</Text>
        </View>
      </View>)}
    </ScrollView>

    <Modal visible={customVisible} transparent animationType="fade" onRequestClose={() => setCustomVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Nouvelle formule</Text>
        <TextInput style={[styles.input, missionStyles.input]} value={custom.label} onChangeText={(v) => setCustom((p) => ({ ...p, label: v }))} placeholder="Nom de la formule" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={custom.family} onChangeText={(v) => setCustom((p) => ({ ...p, family: v }))} placeholder="Famille" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={custom.inputs} onChangeText={(v) => setCustom((p) => ({ ...p, inputs: v }))} placeholder="Variables : debit, deltaT, puissance" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={custom.formula} onChangeText={(v) => setCustom((p) => ({ ...p, formula: v }))} placeholder="Ex : debit * deltaT * 1.163" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={custom.unit} onChangeText={(v) => setCustom((p) => ({ ...p, unit: v }))} placeholder="Unité résultat" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setCustomVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveCustom}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
