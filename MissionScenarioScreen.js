import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';

function clean(v) { const s = String(v ?? '').trim(); return s || null; }
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function Field({ label, value, onChangeText, keyboardType = 'default', multiline = false }) {
  return <View style={{ marginBottom: 9 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '800', marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput
      style={[styles.input, missionStyles.input, multiline ? { minHeight: 72, textAlignVertical: 'top' } : null]}
      value={String(value ?? '')}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  </View>;
}

export function MissionScenarioScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [scenarios, setScenarios] = useState([]);
  const [actions, setActions] = useState([]);
  const [links, setLinks] = useState([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState({
    label: '',
    description: '',
    investment: '',
    annualSaving: '',
    energySaving: '',
    co2Saving: '',
    payback: '',
    constraints: '',
    benefits: '',
  });

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [s, a, l] = await Promise.all([
      db.getAllAsync('SELECT * FROM mission_scenarios WHERE mission_id=? ORDER BY created_at', [missionId]),
      db.getAllAsync('SELECT * FROM mission_actions WHERE mission_id=? ORDER BY created_at', [missionId]),
      db.getAllAsync(
        'SELECT sa.* FROM mission_scenario_actions sa JOIN mission_scenarios s ON s.id=sa.scenario_id WHERE s.mission_id=?',
        [missionId]
      ),
    ]);
    setScenarios(s || []);
    setActions(a || []);
    setLinks(l || []);
    if (!selectedId && s?.[0]?.id) setSelectedId(s[0].id);
  }, [missionId, selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => scenarios.find((s) => s.id === selectedId) || null, [scenarios, selectedId]);
  const selectedLinks = useMemo(() => links.filter((l) => l.scenario_id === selectedId), [links, selectedId]);
  const linkByAction = useMemo(() => new Map(selectedLinks.map((l) => [l.action_id, l])), [selectedLinks]);

  const computed = useMemo(() => {
    if (!selected) return null;
    let investment = num(selected.investment) || 0;
    let annual = num(selected.annual_saving) || 0;
    for (const link of selectedLinks.filter((l) => Number(l.included) === 1)) {
      const action = actions.find((a) => a.id === link.action_id);
      investment += num(link.investment_override) ?? num(action?.cost_estimate) ?? 0;
      annual += num(link.annual_saving_override) ?? 0;
    }
    return {
      investment,
      annual,
      payback: annual > 0 ? investment / annual : num(selected.payback_years),
    };
  }, [selected, selectedLinks, actions]);

  const createScenario = async () => {
    if (!draft.label.trim()) {
      Alert.alert('À compléter', 'Indique un nom de scénario.');
      return;
    }
    const db = await getDb();
    const id = createId('mscen');
    await db.runAsync(
      `INSERT INTO mission_scenarios(
        id,mission_id,label,description,investment,annual_saving,energy_saving_kwh,co2_saving_kg,payback_years,constraints_text,benefits_text
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, missionId, draft.label.trim(), clean(draft.description), num(draft.investment), num(draft.annualSaving),
        num(draft.energySaving), num(draft.co2Saving), num(draft.payback), clean(draft.constraints), clean(draft.benefits),
      ]
    );
    setDraft({ label: '', description: '', investment: '', annualSaving: '', energySaving: '', co2Saving: '', payback: '', constraints: '', benefits: '' });
    setCreateVisible(false);
    await load();
    setSelectedId(id);
  };

  const toggleAction = async (action) => {
    if (!selectedId) return;
    const db = await getDb();
    const existing = linkByAction.get(action.id);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO mission_scenario_actions(scenario_id,action_id,sort_order,included) VALUES(?,?,?,1)',
        [selectedId, action.id, selectedLinks.length]
      );
    } else {
      await db.runAsync(
        'UPDATE mission_scenario_actions SET included=?,updated_at=datetime(\'now\') WHERE scenario_id=? AND action_id=?',
        [Number(existing.included) ? 0 : 1, selectedId, action.id]
      );
    }
    await load();
  };

  const setRetained = async () => {
    if (!selectedId) return;
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE mission_scenarios SET status='draft' WHERE mission_id=?", [missionId]);
      await db.runAsync("UPDATE mission_scenarios SET status='retained',updated_at=datetime('now') WHERE id=?", [selectedId]);
    });
    await load();
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Scénarios · étude / rénovation</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Compare l’existant et plusieurs scénarios sans dupliquer la Mission. Les actions déjà créées peuvent être incluses ou exclues du scénario.
      </Text>

      <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { alignSelf: 'flex-start', marginTop: 12 }]} onPress={() => setCreateVisible(true)}>
        <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Scénario</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Comparer</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {scenarios.map((s) => <TouchableOpacity key={s.id} onPress={() => setSelectedId(s.id)} style={{ width: 190, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: selectedId === s.id ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selectedId === s.id ? MISSION_COLORS.accentLight : '#FFFFFF', marginRight: 8 }}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11, fontWeight: '900' }}>{s.label}</Text>
          <Text style={{ color: s.status === 'retained' ? MISSION_COLORS.accentDark : COLORS.inkFaint, fontSize: 8.5, fontWeight: '900', marginTop: 2 }}>{s.status === 'retained' ? 'RETENU' : 'BROUILLON'}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 7 }}>Invest. {Number(s.investment || 0).toLocaleString('fr-FR')} €</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>Énergie {Number(s.energy_saving_kwh || 0).toLocaleString('fr-FR')} kWh/an</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>CO₂ {Number(s.co2_saving_kg || 0).toLocaleString('fr-FR')} kg/an</Text>
        </TouchableOpacity>)}
      </ScrollView>

      {selected ? <>
        <View style={[missionStyles.card, { padding: 13, marginTop: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 14 }}>{selected.label}</Text>
              {selected.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 4 }}>{selected.description}</Text> : null}
            </View>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={setRetained}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{selected.status === 'retained' ? 'Scénario retenu' : 'Retenir ce scénario'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {[
              [computed?.investment || 0, '€ invest.'],
              [computed?.annual || 0, '€/an'],
              [selected.energy_saving_kwh || 0, 'kWh/an'],
              [selected.co2_saving_kg || 0, 'kgCO₂/an'],
              [computed?.payback ?? '-', 'ans TRB'],
            ].map(([value, label]) => <View key={label} style={[missionStyles.statBox, { minWidth: 95, flexGrow: 1, borderRadius: 11, padding: 9 }]}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 13 }}>{typeof value === 'number' ? Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : value}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.3 }}>{label}</Text>
            </View>)}
          </View>
          {selected.benefits_text ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 10 }}>Avantages : {selected.benefits_text}</Text> : null}
          {selected.constraints_text ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 5 }}>Contraintes : {selected.constraints_text}</Text> : null}
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Actions incluses</Text>
        {actions.length ? actions.map((action) => {
          const link = linkByAction.get(action.id);
          const included = Boolean(link && Number(link.included) === 1);
          return <TouchableOpacity key={action.id} onPress={() => toggleAction(action)} style={[missionStyles.card, { padding: 10, marginBottom: 6, backgroundColor: included ? MISSION_COLORS.accentSoft : '#FFFFFF' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ width: 28, color: included ? MISSION_COLORS.accentStrong : COLORS.inkFaint, fontSize: 16 }}>{included ? '✓' : '○'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{action.label}</Text>
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 2 }}>{action.cost_estimate ? Number(action.cost_estimate).toLocaleString('fr-FR') + ' €' : 'Coût non renseigné'}{action.priority ? ' · ' + action.priority : ''}</Text>
              </View>
            </View>
          </TouchableOpacity>;
        }) : <Text style={{ color: COLORS.inkFaint, fontSize: 9.5 }}>Aucune action structurée. Elles peuvent être créées depuis les constats / points puis réutilisées ici.</Text>}
      </> : null}
    </ScrollView>

    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Nouveau scénario</Text>
        <Field label="Nom" value={draft.label} onChangeText={(v) => setDraft((p) => ({ ...p, label: v }))} />
        <Field label="Description" value={draft.description} onChangeText={(v) => setDraft((p) => ({ ...p, description: v }))} multiline />
        <Field label="Investissement de base €" value={draft.investment} onChangeText={(v) => setDraft((p) => ({ ...p, investment: v }))} keyboardType="decimal-pad" />
        <Field label="Économie annuelle €/an" value={draft.annualSaving} onChangeText={(v) => setDraft((p) => ({ ...p, annualSaving: v }))} keyboardType="decimal-pad" />
        <Field label="Économie énergie kWh/an" value={draft.energySaving} onChangeText={(v) => setDraft((p) => ({ ...p, energySaving: v }))} keyboardType="decimal-pad" />
        <Field label="CO₂ évité kg/an" value={draft.co2Saving} onChangeText={(v) => setDraft((p) => ({ ...p, co2Saving: v }))} keyboardType="decimal-pad" />
        <Field label="TRB si déjà connu (ans)" value={draft.payback} onChangeText={(v) => setDraft((p) => ({ ...p, payback: v }))} keyboardType="decimal-pad" />
        <Field label="Avantages" value={draft.benefits} onChangeText={(v) => setDraft((p) => ({ ...p, benefits: v }))} multiline />
        <Field label="Contraintes" value={draft.constraints} onChangeText={(v) => setDraft((p) => ({ ...p, constraints: v }))} multiline />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setCreateVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createScenario}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>
  </View>;
}
