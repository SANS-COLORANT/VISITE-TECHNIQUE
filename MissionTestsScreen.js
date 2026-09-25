import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  chargerExecutionEssai,
  creerProtocoleEssaiComplet,
  demarrerExecutionEssai,
  enregistrerEtapeEssai,
  listerExecutionsEssaisMission,
  listerProtocolesEssaisMission,
  terminerExecutionEssai
} from './missionTestDb.js';
import { creerPointMission } from './missionsDb.js';
import { creerActionMission } from './missionDomainDb.js';
import { modifierEquipementMission } from './missionEquipmentDb.js';
import { getMissionTestPresets } from './missionTestPresets.js';

const STATUS_OPTIONS = [
  ['ok', 'OK'],
  ['deviation', 'Écart'],
  ['not_tested', 'Non testé'],
  ['impossible', 'Impossible'],
  ['to_repeat', 'À reprendre']
];

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 7,
        marginRight: 6,
        marginBottom: 6
      }}
    >
      <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function parseSteps(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const p = line.split('|').map((v) => v.trim());
      return {
        label: p[0] || 'Étape',
        expectedText: p[1] || '',
        referenceValue: p[2] || '',
        unit: p[3] || '',
        tolerancePct: p[4] || ''
      };
    });
}

export function MissionTestsScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [protocols, setProtocols] = useState([]);
  const [runs, setRuns] = useState([]);
  const [sites, setSites] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [protocolDraft, setProtocolDraft] = useState({ label: '', type: '', description: '', steps: '' });
  const [startProtocol, setStartProtocol] = useState(null);
  const [startSiteId, setStartSiteId] = useState(null);
  const [startEquipmentId, setStartEquipmentId] = useState(null);
  const [runData, setRunData] = useState(null);
  const [stepEdits, setStepEdits] = useState({});
  const [missionType, setMissionType] = useState(null);
  const [installingPresets, setInstallingPresets] = useState(false);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [p, r, s, e, m] = await Promise.all([
      listerProtocolesEssaisMission(missionId),
      listerExecutionsEssaisMission(missionId),
      db.getAllAsync(
        'SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name',
        [missionId]
      ),
      db.getAllAsync(
        'SELECT e.*,s.name AS site_name FROM mission_equipment e JOIN mission_site_links l ON l.site_id=e.site_id LEFT JOIN mission_sites s ON s.id=e.site_id WHERE l.mission_id=? ORDER BY s.name,e.type,e.brand,e.model LIMIT 1000',
        [missionId]
      ),
      db.getFirstAsync('SELECT type FROM missions WHERE id=?', [missionId])
    ]);
    setProtocols(p || []);
    setRuns(r || []);
    setSites(s || []);
    setEquipment(e || []);
    setMissionType(m?.type || null);
  }, [missionId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedEquipment = useMemo(
    () => equipment.filter((e) => !startSiteId || e.site_id === startSiteId),
    [equipment, startSiteId]
  );
  const recommendedPresets = useMemo(() => getMissionTestPresets(missionType), [missionType]);

  const installRecommended = async () => {
    if (!recommendedPresets.length || installingPresets) return;
    setInstallingPresets(true);
    try {
      const existingLabels = new Set(
        protocols.map((protocol) =>
          String(protocol.label || '')
            .trim()
            .toLowerCase()
        )
      );
      let added = 0;
      for (const preset of recommendedPresets) {
        if (
          existingLabels.has(
            String(preset.label || '')
              .trim()
              .toLowerCase()
          )
        )
          continue;
        await creerProtocoleEssaiComplet({
          missionId,
          label: preset.label,
          type: preset.type,
          description: preset.description,
          steps: preset.steps
        });
        added += 1;
      }
      await load();
      Alert.alert(
        added ? 'Protocoles ajoutés' : 'Protocoles déjà disponibles',
        added ? String(added) + ' protocole(s) recommandé(s) ajouté(s) à la Mission.' : 'Aucun doublon créé.'
      );
    } catch (e) {
      Alert.alert('Protocoles non ajoutés', String(e?.message || e));
    } finally {
      setInstallingPresets(false);
    }
  };

  const saveProtocol = async () => {
    const steps = parseSteps(protocolDraft.steps);
    if (!protocolDraft.label.trim() || !steps.length) {
      Alert.alert('À compléter', 'Indique un nom de protocole et au moins une étape.');
      return;
    }
    await creerProtocoleEssaiComplet({
      missionId,
      label: protocolDraft.label,
      type: protocolDraft.type,
      description: protocolDraft.description,
      steps
    });
    setProtocolDraft({ label: '', type: '', description: '', steps: '' });
    setCreateVisible(false);
    await load();
  };

  const startRun = async () => {
    if (!startProtocol) return;
    const run = await demarrerExecutionEssai({
      missionId,
      protocolId: startProtocol.id,
      siteId: startSiteId,
      equipmentId: startEquipmentId
    });
    setStartProtocol(null);
    setRunData(run);
    setStepEdits(
      Object.fromEntries(
        (run.steps || []).map((step) => [
          step.id,
          {
            status: step.result_status || '',
            value: step.result_number === null || step.result_number === undefined ? '' : String(step.result_number),
            text: step.result_text || '',
            comment: step.result_comment || ''
          }
        ])
      )
    );
  };

  const repeatRun = async (runRow) => {
    const run = await demarrerExecutionEssai({
      missionId,
      protocolId: runRow.protocol_id,
      siteId: runRow.site_id || null,
      equipmentId: runRow.equipment_id || null
    });
    setRunData(run);
    setStepEdits(
      Object.fromEntries(
        (run.steps || []).map((step) => [
          step.id,
          {
            status: step.result_status || '',
            value: step.result_number === null || step.result_number === undefined ? '' : String(step.result_number),
            text: step.result_text || '',
            comment: step.result_comment || ''
          }
        ])
      )
    );
    await load();
  };

  const openRun = async (runId) => {
    const run = await chargerExecutionEssai(runId);
    setRunData(run);
    setStepEdits(
      Object.fromEntries(
        (run.steps || []).map((step) => [
          step.id,
          {
            status: step.result_status || '',
            value: step.result_number === null || step.result_number === undefined ? '' : String(step.result_number),
            text: step.result_text || '',
            comment: step.result_comment || ''
          }
        ])
      )
    );
  };

  const saveStep = async (step) => {
    const edit = stepEdits[step.id] || {};
    await enregistrerEtapeEssai({
      runId: runData.run.id,
      step,
      status: edit.status || null,
      value: edit.value,
      valueText: edit.text,
      unit: step.reference_unit || '',
      comment: edit.comment
    });
    setRunData(await chargerExecutionEssai(runData.run.id));
  };

  const makePoint = async (step) => {
    if (step.point_id) {
      Alert.alert(
        'Point déjà lié',
        'Cette étape d’essai possède déjà un point de suivi. METRA évite de créer un doublon.'
      );
      return;
    }
    const edit = stepEdits[step.id] || {};
    const isOpr = missionType === 'opr_reception';
    const pointType = isOpr ? 'reserve' : 'control';
    const pointId = await creerPointMission({
      missionId,
      siteId: runData?.run?.site_id,
      visitId: runData?.run?.visit_id,
      equipmentId: runData?.run?.equipment_id,
      type: pointType,
      label: (isOpr ? 'Réserve OPR · ' : 'Essai · ') + step.label,
      description: [
        step.expected_text ? 'Attendu : ' + step.expected_text : '',
        edit.value
          ? 'Observé : ' + edit.value + ' ' + (step.reference_unit || '')
          : edit.text
            ? 'Observé : ' + edit.text
            : '',
        edit.comment || ''
      ]
        .filter(Boolean)
        .join('\n'),
      priority: isOpr ? 'À lever' : 'À contrôler'
    });

    await creerActionMission({
      missionId,
      sourcePointId: pointId,
      siteId: runData?.run?.site_id,
      equipmentId: runData?.run?.equipment_id,
      label: isOpr ? 'Lever la réserve · ' + step.label : 'Traiter l’écart d’essai · ' + step.label,
      description: edit.comment || step.expected_text || null,
      priority: isOpr ? 'À lever' : 'À régler'
    });

    await enregistrerEtapeEssai({
      runId: runData.run.id,
      step,
      status: edit.status || 'deviation',
      value: edit.value,
      valueText: edit.text,
      unit: step.reference_unit || '',
      comment: edit.comment,
      pointId
    });

    if (
      runData?.run?.equipment_id &&
      ['opr_reception', 'commissioning', 'passation_travaux_exploitant'].includes(missionType)
    ) {
      await modifierEquipementMission(runData.run.equipment_id, {
        missionId,
        lifecycleStatus: 'avec_reserve',
        changeComment: 'Écart issu d’un essai Mission'
      });
    }

    const refreshed = await chargerExecutionEssai(runData.run.id);
    setRunData(refreshed);
    setStepEdits((all) => ({ ...all, [step.id]: { ...edit, status: edit.status || 'deviation' } }));
    Alert.alert(
      'Suivi créé',
      'Le résultat d’essai, le point et l’action restent liés. Aucun diagnostic automatique n’est ajouté.'
    );
  };

  const finishRun = async () => {
    for (const step of runData?.steps || []) await saveStep(step);
    const refreshed = await chargerExecutionEssai(runData.run.id);
    const statuses = (refreshed?.steps || []).map((step) => step.result_status || 'not_tested');
    const hasIssue = statuses.some((status) =>
      ['deviation', 'impossible', 'to_repeat', 'failed', 'to_check'].includes(status)
    );
    const allOk = statuses.length > 0 && statuses.every((status) => status === 'ok');

    if (
      refreshed?.run?.equipment_id &&
      ['opr_reception', 'commissioning', 'passation_travaux_exploitant'].includes(missionType)
    ) {
      if (hasIssue) {
        await modifierEquipementMission(refreshed.run.equipment_id, {
          missionId,
          lifecycleStatus: 'avec_reserve',
          changeComment: 'Essai terminé avec écart'
        });
      } else if (allOk) {
        await modifierEquipementMission(refreshed.run.equipment_id, {
          missionId,
          lifecycleStatus: missionType === 'commissioning' ? 'mis_en_service' : 'controle',
          changeComment:
            missionType === 'commissioning' ? 'Essai Mission terminé sans écart' : 'Contrôle Mission terminé sans écart'
        });
      }
    }

    await terminerExecutionEssai(runData.run.id);
    setRunData(null);
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Text style={[styles.sectionTitle, missionStyles.title]}>Essais · Commissioning</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
          Un protocole conserve l’attendu ; chaque exécution conserve l’observé. Les écarts peuvent créer un point sans
          perdre le résultat d’essai.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.btnPrimary, missionStyles.primaryButton]}
            onPress={() => setCreateVisible(true)}
          >
            <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Protocole libre</Text>
          </TouchableOpacity>
          {recommendedPresets.length ? (
            <TouchableOpacity
              style={[styles.btnSecondary, missionStyles.secondaryButton]}
              disabled={installingPresets}
              onPress={installRecommended}
            >
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
                {installingPresets ? 'Ajout…' : '＋ Protocoles recommandés (' + recommendedPresets.length + ')'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {recommendedPresets.length ? (
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, lineHeight: 12, marginTop: 6 }}>
            Les protocoles proposés dépendent du type de Mission. Ils restent modifiables et ne concluent jamais
            automatiquement au diagnostic.
          </Text>
        ) : null}

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Protocoles</Text>
        {protocols.map((p) => (
          <View key={p.id} style={[missionStyles.card, { padding: 12, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11.5, fontWeight: '900' }}>{p.label}</Text>
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>
                  {p.type || 'Protocole'} · {p.steps.length} étape(s)
                </Text>
                {p.description ? (
                  <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 4 }}>{p.description}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => {
                  setStartProtocol(p);
                  setStartSiteId(sites?.[0]?.id || null);
                  setStartEquipmentId(null);
                }}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Démarrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Exécutions</Text>
        {runs.map((r) => {
          const samePasses = runs.filter(
            (item) =>
              item.protocol_id === r.protocol_id &&
              String(item.site_id || '') === String(r.site_id || '') &&
              String(item.equipment_id || '') === String(r.equipment_id || '')
          );
          const chronological = [...samePasses].sort((a, b) =>
            String(a.created_at || '').localeCompare(String(b.created_at || ''))
          );
          const passNumber = chronological.findIndex((item) => item.id === r.id) + 1;
          return (
            <View key={r.id} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
              <TouchableOpacity onPress={() => openRun(r.id)}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 10.8 }}>{r.protocol_label}</Text>
                    <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>
                      {[r.site_name, r.equipment_type, passNumber ? 'Passage ' + passNumber : null]
                        .filter(Boolean)
                        .join(' · ') || 'Sans rattachement'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        color: r.status === 'completed' ? MISSION_COLORS.accentDark : '#8A5B14',
                        fontSize: 9,
                        fontWeight: '900'
                      }}
                    >
                      {r.status}
                    </Text>
                    <Text
                      style={{ color: Number(r.deviations_count || 0) ? '#8B3A3A' : COLORS.inkFaint, fontSize: 8.7 }}
                    >
                      {r.deviations_count || 0} écart(s)
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              {r.status === 'completed' ? (
                <TouchableOpacity
                  onPress={() => repeatRun(r)}
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 7,
                    borderWidth: 1,
                    borderColor: MISSION_COLORS.accentLine,
                    borderRadius: 9,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    backgroundColor: MISSION_COLORS.accentSoft
                  }}
                >
                  <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.3, fontWeight: '900' }}>
                    ↻ Rejouer · nouveau passage
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, missionStyles.modalSheet]}>
            <Text style={[styles.modalTitle, missionStyles.title]}>Nouveau protocole</Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={protocolDraft.label}
              onChangeText={(v) => setProtocolDraft((p) => ({ ...p, label: v }))}
              placeholder="Nom : Essai antigel CTA, pompe, régulation…"
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={protocolDraft.type}
              onChangeText={(v) => setProtocolDraft((p) => ({ ...p, type: v }))}
              placeholder="Type"
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={protocolDraft.description}
              onChangeText={(v) => setProtocolDraft((p) => ({ ...p, description: v }))}
              placeholder="Description"
            />
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 10, marginBottom: 4 }}>
              UNE ÉTAPE PAR LIGNE · étape | attendu | référence | unité | tolérance %
            </Text>
            <TextInput
              style={[styles.input, missionStyles.input, { minHeight: 140, textAlignVertical: 'top' }]}
              multiline
              value={protocolDraft.steps}
              onChangeText={(v) => setProtocolDraft((p) => ({ ...p, steps: v }))}
              placeholder={
                'Ouverture vanne froid | La vanne s’ouvre | 100 | % | 5\nDébit soufflage | Conforme projet | 720 | m³/h | 10'
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setCreateVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveProtocol}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!startProtocol} transparent animationType="fade" onRequestClose={() => setStartProtocol(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, missionStyles.modalSheet]}>
            <Text style={[styles.modalTitle, missionStyles.title]}>Démarrer · {startProtocol?.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginBottom: 5 }}>SITE (FACULTATIF)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {sites.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={startSiteId === s.id}
                  onPress={() => {
                    setStartSiteId(s.id);
                    setStartEquipmentId(null);
                  }}
                />
              ))}
            </View>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginBottom: 5 }}>ÉQUIPEMENT (FACULTATIF)</Text>
            <ScrollView style={{ maxHeight: 190 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {selectedEquipment.map((e) => (
                  <Chip
                    key={e.id}
                    label={[e.type, e.brand, e.model].filter(Boolean).join(' · ')}
                    selected={startEquipmentId === e.id}
                    onPress={() => setStartEquipmentId(startEquipmentId === e.id ? null : e.id)}
                  />
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setStartProtocol(null)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={startRun}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Démarrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!runData} animationType="slide" onRequestClose={() => setRunData(null)}>
        <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
          <View
            style={{
              paddingTop: 48,
              paddingHorizontal: 16,
              paddingBottom: 10,
              backgroundColor: MISSION_COLORS.accentStrong,
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            <TouchableOpacity onPress={() => setRunData(null)} style={{ paddingRight: 12 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 21 }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#BFE2CC', fontSize: 8.5, fontWeight: '900' }}>ESSAI MISSION</Text>
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>{runData?.run?.protocol_label}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
            {runData?.previousRun ? (
              <View style={[missionStyles.card, { padding: 10, marginBottom: 10, borderColor: '#D7DDD9' }]}>
                <Text style={{ color: COLORS.inkFaint, fontSize: 8, fontWeight: '900' }}>
                  COMPARAISON AVEC LE PASSAGE PRÉCÉDENT
                </Text>
                <Text style={{ color: COLORS.inkSoft, fontSize: 8.8, lineHeight: 12, marginTop: 3 }}>
                  {runData.previousRun.completed_at || runData.previousRun.started_at || ''} · les anciennes valeurs
                  restent visibles sans être recopiées.
                </Text>
              </View>
            ) : null}
            {(runData?.steps || []).map((step, index) => {
              const edit = stepEdits[step.id] || {};
              return (
                <View key={step.id} style={[missionStyles.card, { padding: 12, marginBottom: 10 }]}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11.5, fontWeight: '900' }}>
                    {index + 1}. {step.label}
                  </Text>
                  {step.expected_text ? (
                    <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 4 }}>
                      Attendu : {step.expected_text}
                    </Text>
                  ) : null}
                  {step.reference_number !== null && step.reference_number !== undefined ? (
                    <Text style={{ color: COLORS.inkFaint, fontSize: 9, marginTop: 2 }}>
                      Référence : {step.reference_number} {step.reference_unit || ''}
                      {step.tolerance_pct !== null && step.tolerance_pct !== undefined
                        ? ' · ±' + step.tolerance_pct + '%'
                        : ''}
                    </Text>
                  ) : null}
                  {step.previous_status ? (
                    <View
                      style={{
                        marginTop: 6,
                        borderRadius: 9,
                        borderWidth: 1,
                        borderColor: '#D7DDD9',
                        backgroundColor: '#F5F7F6',
                        padding: 7
                      }}
                    >
                      <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, fontWeight: '900' }}>
                        PASSAGE PRÉCÉDENT · {step.previous_status}
                      </Text>
                      <Text style={{ color: COLORS.inkSoft, fontSize: 8.7, marginTop: 2 }}>
                        {step.previous_number !== null && step.previous_number !== undefined
                          ? String(step.previous_number) + (step.previous_unit ? ' ' + step.previous_unit : '')
                          : step.previous_text || 'Aucune valeur numérique'}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
                    <TextInput
                      style={[styles.input, missionStyles.input, { flex: 1 }]}
                      keyboardType="decimal-pad"
                      value={edit.value || ''}
                      onChangeText={(v) => setStepEdits((all) => ({ ...all, [step.id]: { ...edit, value: v } }))}
                      placeholder="Valeur observée"
                    />
                    <Text style={{ alignSelf: 'center', color: COLORS.inkSoft, fontSize: 10 }}>
                      {step.reference_unit || ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    {STATUS_OPTIONS.map(([key, label]) => (
                      <Chip
                        key={key}
                        label={label}
                        selected={edit.status === key}
                        onPress={() => setStepEdits((all) => ({ ...all, [step.id]: { ...edit, status: key } }))}
                      />
                    ))}
                  </View>
                  <TextInput
                    style={[styles.input, missionStyles.input, { marginTop: 5 }]}
                    value={edit.comment || ''}
                    onChangeText={(v) => setStepEdits((all) => ({ ...all, [step.id]: { ...edit, comment: v } }))}
                    placeholder="Commentaire / observation"
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.btnSecondary, missionStyles.secondaryButton]}
                      onPress={() => saveStep(step)}
                    >
                      <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Enregistrer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSecondary, missionStyles.secondaryButton]}
                      onPress={() => makePoint(step)}
                    >
                      <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
                        {step.point_id ? 'Point lié ✓' : 'Créer suivi'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity
              style={[styles.btnPrimary, missionStyles.primaryButton, { alignItems: 'center', marginTop: 4 }]}
              onPress={finishRun}
            >
              <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Terminer l’essai</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
