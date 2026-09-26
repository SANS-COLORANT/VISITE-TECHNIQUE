import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles, FONTS } from './styles.js';
import { getDb } from './db.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  calculerFormuleMission,
  creerFormuleMission,
  enregistrerCalculDepuisFormule,
  listerCalculsMission,
  listerFormulesMission,
} from './missionCalculationDb.js';
import { getCalculationAutoValues, isFormulaRecommended, sortFormulasForMission } from './missionCalculationAssist.js';
import { ButtonGlow } from './ButtonGlow.js';

function parse(value, fallback = []) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function FormulaCard({ item, selected, recommended, onPress }) {
  return <TouchableOpacity onPress={onPress} style={[missionStyles.card, { padding: 11, marginBottom: 7, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ flex: 1, color: MISSION_COLORS.accentStrong, fontSize: 11, fontFamily: FONTS.black }}>{item.label}</Text>
      {recommended ? <Text style={{ color: MISSION_COLORS.accentDark, backgroundColor: MISSION_COLORS.accentSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, fontSize: 7.7, fontFamily: FONTS.black }}>RECOMMANDÉ</Text> : null}
    </View>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>{item.family || 'Personnalisée'} · {item.unit || 'sans unité'}</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, marginTop: 4 }}>{item.formula}</Text>
  </TouchableOpacity>;
}

export function MissionCalculationScreen({ route }) {
  const missionId = route?.params?.missionId;
  const siteId = route?.params?.siteId || null;
  const equipmentId = route?.params?.equipmentId || null;
  const [formulas, setFormulas] = useState([]);
  const [calculations, setCalculations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [values, setValues] = useState({});
  const [preview, setPreview] = useState(null);
  const [customVisible, setCustomVisible] = useState(false);
  const [custom, setCustom] = useState({ label: '', family: 'CVC', formula: '', unit: '', inputs: '' });
  const [missionType, setMissionType] = useState(null);
  const [recommendedOnly, setRecommendedOnly] = useState(true);
  const [autoSources, setAutoSources] = useState({});
  const [autoLoading, setAutoLoading] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const [f, c, mission] = await Promise.all([
      listerFormulesMission(missionId),
      listerCalculsMission(missionId),
      db.getFirstAsync('SELECT type FROM missions WHERE id=?', [missionId]),
    ]);
    const nextType = mission?.type || null;
    const sorted = sortFormulasForMission(nextType, f || []);
    setMissionType(nextType);
    setFormulas(sorted);
    setCalculations(c || []);
    if (!selectedId && sorted?.[0]?.id) setSelectedId(sorted[0].id);
  }, [missionId, selectedId]);

  useEffect(() => { load(); }, [load]);

  const recommendedCount = useMemo(
    () => formulas.filter((formula) => isFormulaRecommended(missionType, formula)).length,
    [formulas, missionType]
  );
  const visibleFormulas = useMemo(
    () => recommendedOnly && recommendedCount
      ? formulas.filter((formula) => isFormulaRecommended(missionType, formula))
      : formulas,
    [formulas, missionType, recommendedOnly, recommendedCount]
  );
  const selected = useMemo(() => formulas.find((f) => f.id === selectedId) || null, [formulas, selectedId]);
  const schema = useMemo(() => parse(selected?.input_schema_json, []), [selected]);

  useEffect(() => {
    let cancelled = false;
    setValues({});
    setPreview(null);
    setAutoSources({});
    if (!selected || !missionId) return () => { cancelled = true; };

    setAutoLoading(true);
    (async () => {
      try {
        const auto = await getCalculationAutoValues({
          missionId,
          formulaRow: selected,
          siteId,
          equipmentId,
        });
        if (cancelled) return;
        setValues(auto.values || {});
        setAutoSources(auto.sources || {});
      } catch {
        if (!cancelled) {
          setValues({});
          setAutoSources({});
        }
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, selected, missionId, siteId, equipmentId]);

  useEffect(() => {
    if (!selected || !schema.length) {
      setPreview(null);
      return;
    }
    const complete = schema.every((input) => {
      const raw = values[input.key];
      if (raw === null || raw === undefined || String(raw).trim() === '') return false;
      return Number.isFinite(Number(String(raw).replace(',', '.')));
    });
    if (!complete) {
      setPreview(null);
      return;
    }
    try {
      const result = calculerFormuleMission(selected, values);
      setPreview(result.result);
    } catch {
      setPreview(null);
    }
  }, [selected, schema, values]);

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

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Calculs 🧮</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginBottom: 12 }}>
        Les calculs restent explicables : formule, entrées, hypothèses et résultat sont conservés. Dès que toutes les entrées sont disponibles, le résultat se recalcule automatiquement.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setCustomVisible(true)}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Formule personnalisée</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { flex: 1, marginBottom: 0 }]}>Bibliothèque</Text>
        {recommendedCount ? <TouchableOpacity
          onPress={() => setRecommendedOnly((value) => !value)}
          style={{ borderWidth: 1, borderColor: MISSION_COLORS.accentLine, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: recommendedOnly ? MISSION_COLORS.accentSoft : '#FFFFFF' }}
        >
          <Text style={{ color: recommendedOnly ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.4, fontFamily: FONTS.black }}>
            {recommendedOnly ? 'Recommandées · ' + recommendedCount : 'Toutes les formules'}
          </Text>
        </TouchableOpacity> : null}
      </View>
      {recommendedCount ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, lineHeight: 12, marginBottom: 7 }}>
        METRA place en premier les calculs cohérents avec cette Mission. Tu peux toujours afficher toute la bibliothèque.
      </Text> : null}
      <View style={{ maxHeight: 260 }}>
        {visibleFormulas.map((item) => <FormulaCard
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          recommended={isFormulaRecommended(missionType, item)}
          onPress={() => setSelectedId(item.id)}
        />)}
      </View>

      {selected ? <View style={[missionStyles.card, { padding: 13, marginTop: 12 }]}>
        <Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.black, fontSize: 13 }}>{selected.label}</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 3 }}>{selected.formula} {selected.unit ? '→ ' + selected.unit : ''}</Text>
        <View style={{ marginTop: 12 }}>
          {schema.map((input) => <View key={input.key} style={{ marginBottom: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ flex: 1, color: COLORS.inkFaint, fontSize: 8.5, fontFamily: FONTS.bold }}>{input.label || input.key}{input.unit ? ' · ' + input.unit : ''}</Text>
              {autoSources[input.key] ? <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 7.6, fontFamily: FONTS.black }}>PRÉREMPLI</Text> : null}
            </View>
            {autoSources[input.key] ? <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, lineHeight: 11, marginBottom: 4 }}>{autoSources[input.key]}</Text> : null}
            <TextInput
              style={[styles.input, missionStyles.input]}
              keyboardType="decimal-pad"
              value={String(values[input.key] ?? '')}
              onChangeText={(v) => {
                setValues((all) => ({ ...all, [input.key]: v }));
                setAutoSources((all) => {
                  if (!all[input.key]) return all;
                  const next = { ...all };
                  delete next[input.key];
                  return next;
                });
              }}
              placeholder={autoLoading ? 'Recherche dans la Mission…' : input.key}
            />
          </View>)}
        </View>
        {preview !== null ? <View style={[missionStyles.statBox, { padding: 12, borderRadius: 12, marginBottom: 10 }]}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>RÉSULTAT · RECALCUL AUTOMATIQUE</Text>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 22, fontFamily: FONTS.black, marginTop: 2 }}>{Number(preview).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} {selected.unit || ''}</Text>
        </View> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={calculate}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Calculer</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { flex: 1, alignItems: 'center' }]} onPress={saveCalculation}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Calculer & enregistrer</Text></TouchableOpacity>
        </View>
      </View> : null}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Calculs enregistrés</Text>
      {calculations.map((c) => <View key={c.id} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 10.8 }}>{c.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 2 }}>{c.formula}</Text>
          </View>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.black, fontSize: 12 }}>{c.result_number ?? c.result_text ?? '/'} {c.unit || ''}</Text>
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
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveCustom}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
