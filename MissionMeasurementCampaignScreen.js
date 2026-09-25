import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  CAMPAIGN_POINT_STATUSES,
  ajouterPointCampagneMesures,
  ajouterPointsCampagneDepuisStructure,
  comparerCampagneMesures,
  creerCampagneMesuresMission,
  dupliquerCampagneMesuresMission,
  enregistrerPointCampagneMesures,
  importerPointsCampagneMesuresExcel,
  listerCampagnesMesuresMission,
  listerPointsCampagneMesures,
  supprimerPointCampagneMesures
} from './missionMeasurementCampaignDb.js';

const STATUS_LABELS = Object.freeze(Object.fromEntries(CAMPAIGN_POINT_STATUSES));

const POINT_TYPES = Object.freeze([
  'Cuisine',
  'Lavabo',
  'Baignoire',
  'Douche',
  'Bouche extraction',
  'Bouche soufflage',
  'Équipement',
  'Local',
  'Autre'
]);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function Chip({ label, selected, onPress, compact = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 6 : 8,
        marginRight: 6,
        marginBottom: 6
      }}
    >
      <Text
        style={{
          color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft,
          fontSize: compact ? 8.5 : 9.3,
          fontWeight: '800'
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function progressPct(campaign) {
  const total = Number(campaign?.point_count || 0);
  const measured = Number(campaign?.measured_count || 0);
  const exceptions = Number(campaign?.exception_count || 0);
  return total ? Math.round(((measured + exceptions) / total) * 100) : 0;
}

export function MissionMeasurementCampaignScreen({ route }) {
  const missionId = route?.params?.missionId;
  const routeCampaignId = route?.params?.campaignId || null;
  const [campaigns, setCampaigns] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(routeCampaignId);
  const [points, setPoints] = useState([]);
  const [comparison, setComparison] = useState({ previousCampaign: null, rows: [] });
  const [createVisible, setCreateVisible] = useState(false);
  const [manualPointVisible, setManualPointVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [quickValue, setQuickValue] = useState('');
  const [quickComment, setQuickComment] = useState('');
  const [draft, setDraft] = useState({
    siteId: '',
    label: '',
    measureType: 'Température',
    unit: '°C',
    expectedValue: '',
    expectedText: '',
    referenceSourceType: 'manual',
    referenceSourceLabel: '',
    toleranceAbs: '',
    tolerancePct: '',
    comparisonGroup: ''
  });
  const [manualPoint, setManualPoint] = useState({
    label: '',
    pointType: 'Autre',
    expectedValue: '',
    expectedText: ''
  });

  const loadCampaigns = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [campaignRows, siteRows] = await Promise.all([
      listerCampagnesMesuresMission(missionId),
      db.getAllAsync(
        'SELECT s.* FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name',
        [missionId]
      )
    ]);
    setCampaigns(campaignRows || []);
    setSites(siteRows || []);
    if (!selectedCampaignId && campaignRows?.[0]?.id) setSelectedCampaignId(campaignRows[0].id);
  }, [missionId, selectedCampaignId]);

  const loadSelected = useCallback(async () => {
    if (!selectedCampaignId) {
      setPoints([]);
      setComparison({ previousCampaign: null, rows: [] });
      return;
    }
    const [rows, compare] = await Promise.all([
      listerPointsCampagneMesures(selectedCampaignId),
      comparerCampagneMesures(selectedCampaignId)
    ]);
    setPoints(rows || []);
    setComparison(compare || { previousCampaign: null, rows: [] });

    const preferred = (rows || []).findIndex((row) => row.status === 'planned');
    setCurrentIndex((current) => {
      if (!rows?.length) return 0;
      if (current >= rows.length) return Math.max(0, rows.length - 1);
      return preferred >= 0 ? preferred : current;
    });
  }, [selectedCampaignId]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);
  useEffect(() => {
    loadSelected();
  }, [loadSelected]);

  const selectedCampaign = useMemo(
    () => campaigns.find((row) => row.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );
  const currentPoint = points[currentIndex] || null;
  const comparisonById = useMemo(() => new Map((comparison.rows || []).map((row) => [row.id, row])), [comparison]);

  useEffect(() => {
    setQuickValue(
      currentPoint?.measured_value !== null && currentPoint?.measured_value !== undefined
        ? String(currentPoint.measured_value)
        : currentPoint?.measured_text || ''
    );
    setQuickComment(currentPoint?.comment || '');
  }, [currentPoint?.id]);

  const refreshAll = async () => {
    await Promise.all([loadCampaigns(), loadSelected()]);
  };

  const createCampaign = async () => {
    if (!draft.label.trim() || !draft.measureType.trim()) {
      Alert.alert('À compléter', 'Indique le nom de la campagne et le type de mesure.');
      return;
    }
    try {
      const id = await creerCampagneMesuresMission({
        missionId,
        siteId: draft.siteId || null,
        label: draft.label,
        measureType: draft.measureType,
        unit: draft.unit,
        defaultExpectedValue: draft.expectedValue,
        defaultExpectedText: draft.expectedText,
        referenceSourceType: draft.referenceSourceType,
        referenceSourceLabel: draft.referenceSourceLabel,
        toleranceAbs: draft.toleranceAbs,
        tolerancePct: draft.tolerancePct,
        comparisonGroup: draft.comparisonGroup
      });
      setCreateVisible(false);
      setDraft({
        siteId: '',
        label: '',
        measureType: 'Température',
        unit: '°C',
        expectedValue: '',
        expectedText: '',
        referenceSourceType: 'manual',
        referenceSourceLabel: '',
        toleranceAbs: '',
        tolerancePct: '',
        comparisonGroup: ''
      });
      setSelectedCampaignId(id);
      await loadCampaigns();
    } catch (e) {
      Alert.alert('Campagne non créée', String(e?.message || e));
    }
  };

  const addFromStructure = async (source) => {
    if (!selectedCampaign || busy) return;
    setBusy(true);
    try {
      const added = await ajouterPointsCampagneDepuisStructure(selectedCampaign.id, source);
      await refreshAll();
      Alert.alert('Liste préparée', String(added) + ' point(s) ajouté(s).');
    } catch (e) {
      Alert.alert('Ajout impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const importExcel = async () => {
    if (!selectedCampaign || busy) return;
    setBusy(true);
    try {
      const result = await importerPointsCampagneMesuresExcel(selectedCampaign.id);
      if (result) {
        await refreshAll();
        Alert.alert(
          'Liste importée',
          String(result.added || 0) + ' point(s) ajouté(s) depuis ' + (result.sourceName || 'Excel') + '.'
        );
      }
    } catch (e) {
      Alert.alert('Import impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const addManualPoint = async () => {
    if (!selectedCampaign || !manualPoint.label.trim()) return;
    try {
      await ajouterPointCampagneMesures({
        campaignId: selectedCampaign.id,
        label: manualPoint.label,
        pointType: manualPoint.pointType,
        expectedValue: manualPoint.expectedValue,
        expectedText: manualPoint.expectedText
      });
      setManualPointVisible(false);
      setManualPoint({ label: '', pointType: 'Autre', expectedValue: '', expectedText: '' });
      await refreshAll();
    } catch (e) {
      Alert.alert('Point non créé', String(e?.message || e));
    }
  };

  const goNext = () => {
    if (!points.length) return;
    setCurrentIndex((index) => Math.min(points.length - 1, index + 1));
  };

  const recordCurrent = async (status = 'measured') => {
    if (!currentPoint || busy) return;
    if (status === 'measured' && !quickValue.trim()) {
      Alert.alert('Valeur manquante', 'Saisis la valeur puis passe au point suivant.');
      return;
    }
    setBusy(true);
    try {
      const numeric = Number(String(quickValue).replace(',', '.'));
      const result = await enregistrerPointCampagneMesures(currentPoint.id, {
        status,
        value: status === 'measured' && Number.isFinite(numeric) ? numeric : null,
        valueText: status === 'measured' && !Number.isFinite(numeric) ? quickValue : null,
        comment: quickComment,
        sourceType: 'terrain'
      });
      const [nextRows, nextComparison] = await Promise.all([
        listerPointsCampagneMesures(selectedCampaign.id),
        comparerCampagneMesures(selectedCampaign.id),
        loadCampaigns()
      ]);
      setPoints(nextRows || []);
      setComparison(nextComparison || { previousCampaign: null, rows: [] });
      const afterCurrent = (nextRows || []).findIndex((row, index) => index > currentIndex && row.status === 'planned');
      const firstRemaining = (nextRows || []).findIndex((row) => row.status === 'planned');
      const targetIndex =
        afterCurrent >= 0
          ? afterCurrent
          : firstRemaining >= 0
            ? firstRemaining
            : Math.min(currentIndex, Math.max(0, (nextRows || []).length - 1));
      setCurrentIndex(targetIndex);
      setQuickValue('');
      setQuickComment('');
      if (status === 'measured' && result?.anomalyStatus === 'to_check') {
        Alert.alert(
          'Valeur à contrôler',
          'La valeur dépasse la tolérance de référence. METRA la signale sans conclure automatiquement à un défaut.'
        );
      }
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const duplicateCampaign = async () => {
    if (!selectedCampaign || busy) return;
    setBusy(true);
    try {
      const id = await dupliquerCampagneMesuresMission(selectedCampaign.id, {
        label: selectedCampaign.label + ' · nouvelle campagne'
      });
      setSelectedCampaignId(id);
      await loadCampaigns();
    } catch (e) {
      Alert.alert('Duplication impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const removePoint = (point) => {
    Alert.alert('Retirer ce point ?', point.label, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          await supprimerPointCampagneMesures(point.id);
          await refreshAll();
        }
      }
    ]);
  };

  const pointContext = (point) =>
    [
      point.location_label,
      [point.equipment_type, point.equipment_brand, point.equipment_model].filter(Boolean).join(' · '),
      point.point_type
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, missionStyles.title]}>Campagnes de mesures</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
          Prépare la liste au bureau, puis sur le terrain : valeur → suivant. Les absents, refus, inaccessibles et
          points à replanifier restent tracés sans ralentir la campagne.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            style={[styles.btnPrimary, missionStyles.primaryButton]}
            onPress={() => setCreateVisible(true)}
          >
            <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Campagne</Text>
          </TouchableOpacity>
          {selectedCampaign ? (
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={duplicateCampaign}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
                Dupliquer · avant / après / J+30
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Campagnes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 105 }}>
          {campaigns.map((campaign) => (
            <TouchableOpacity
              key={campaign.id}
              onPress={() => {
                setSelectedCampaignId(campaign.id);
                setCurrentIndex(0);
              }}
              style={{
                width: 200,
                minHeight: 88,
                marginRight: 8,
                borderRadius: 13,
                padding: 10,
                borderWidth: 1,
                borderColor: selectedCampaignId === campaign.id ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
                backgroundColor: selectedCampaignId === campaign.id ? MISSION_COLORS.accentLight : '#FFFFFF'
              }}
            >
              <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900' }} numberOfLines={2}>
                {campaign.label}
              </Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.4, marginTop: 3 }} numberOfLines={1}>
                {[campaign.site_name, campaign.measure_type, campaign.unit].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.2, fontWeight: '900', marginTop: 7 }}>
                {campaign.measured_count || 0}/{campaign.point_count || 0} mesuré(s) · {progressPct(campaign)} %
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selectedCampaign ? (
          <>
            <View style={[missionStyles.card, { padding: 12, marginTop: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 12.5, fontWeight: '900' }}>
                    {selectedCampaign.label}
                  </Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 3 }}>
                    {[selectedCampaign.site_name, selectedCampaign.measure_type, selectedCampaign.unit]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 4 }}>
                    {selectedCampaign.measured_count || 0} mesuré(s) · {selectedCampaign.exception_count || 0} statut(s)
                    terrain · {selectedCampaign.point_count || 0} point(s)
                  </Text>
                </View>
                {comparison.previousCampaign ? (
                  <View
                    style={{
                      backgroundColor: MISSION_COLORS.accentSoft,
                      borderRadius: 9,
                      paddingHorizontal: 8,
                      paddingVertical: 6
                    }}
                  >
                    <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.2, fontWeight: '900' }}>
                      COMPARÉ À
                    </Text>
                    <Text style={{ color: COLORS.inkSoft, fontSize: 8.4, marginTop: 2 }} numberOfLines={1}>
                      {comparison.previousCampaign.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  disabled={busy}
                  onPress={() => addFromStructure('locations')}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Locaux</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  disabled={busy}
                  onPress={() => addFromStructure('equipment')}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Équipements</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  disabled={busy}
                  onPress={importExcel}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>⇧ Liste Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSecondary, missionStyles.secondaryButton]}
                  onPress={() => setManualPointVisible(true)}
                >
                  <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Point libre</Text>
                </TouchableOpacity>
              </View>
            </View>

            {currentPoint ? (
              <View
                style={[
                  missionStyles.card,
                  { padding: 14, marginTop: 12, borderWidth: 2, borderColor: MISSION_COLORS.accentLineStrong }
                ]}
              >
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '900' }}>
                  SAISIE TERRAIN · {currentIndex + 1}/{points.length}
                </Text>
                <Text style={{ color: COLORS.ink, fontSize: 15, fontWeight: '900', marginTop: 5 }}>
                  {currentPoint.label}
                </Text>
                {pointContext(currentPoint) ? (
                  <Text style={{ color: COLORS.inkFaint, fontSize: 9, marginTop: 3 }}>
                    {pointContext(currentPoint)}
                  </Text>
                ) : null}
                {(currentPoint.expected_value !== null && currentPoint.expected_value !== undefined) ||
                currentPoint.expected_text ||
                selectedCampaign.default_expected_value !== null ||
                selectedCampaign.default_expected_text ? (
                  <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.2, marginTop: 7 }}>
                    Attendu :{' '}
                    {currentPoint.expected_value ??
                      currentPoint.expected_text ??
                      selectedCampaign.default_expected_value ??
                      selectedCampaign.default_expected_text}{' '}
                    {selectedCampaign.unit || ''}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TextInput
                    style={[
                      styles.input,
                      missionStyles.input,
                      { flex: 1, fontSize: 20, fontWeight: '900', textAlign: 'center' }
                    ]}
                    value={quickValue}
                    onChangeText={setQuickValue}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    placeholder="Valeur"
                  />
                  <View
                    style={{
                      width: 74,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 11,
                      backgroundColor: MISSION_COLORS.accentSoft
                    }}
                  >
                    <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 12, fontWeight: '900' }}>
                      {selectedCampaign.unit || '—'}
                    </Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, missionStyles.input, { marginTop: 8 }]}
                  value={quickComment}
                  onChangeText={setQuickComment}
                  placeholder="Commentaire facultatif"
                />

                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    missionStyles.primaryButton,
                    { marginTop: 10, alignItems: 'center', paddingVertical: 13 }
                  ]}
                  disabled={busy}
                  onPress={() => recordCurrent('measured')}
                >
                  <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>
                    {busy ? 'Enregistrement…' : 'Enregistrer → suivant'}
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 11 }]}>
                  Ou statut terrain
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {CAMPAIGN_POINT_STATUSES.filter(([key]) => !['planned', 'measured'].includes(key)).map(
                    ([key, label]) => (
                      <Chip
                        key={key}
                        label={label}
                        selected={currentPoint.status === key}
                        onPress={() => recordCurrent(key)}
                        compact
                      />
                    )
                  )}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                  <TouchableOpacity
                    disabled={currentIndex <= 0}
                    onPress={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                    style={{ padding: 8 }}
                  >
                    <Text
                      style={{
                        color: currentIndex <= 0 ? COLORS.inkFaint : MISSION_COLORS.accentDark,
                        fontWeight: '800'
                      }}
                    >
                      ← Précédent
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={currentIndex >= points.length - 1}
                    onPress={() => setCurrentIndex((index) => Math.min(points.length - 1, index + 1))}
                    style={{ padding: 8 }}
                  >
                    <Text
                      style={{
                        color: currentIndex >= points.length - 1 ? COLORS.inkFaint : MISSION_COLORS.accentDark,
                        fontWeight: '800'
                      }}
                    >
                      Suivant →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[missionStyles.card, { padding: 13, marginTop: 12 }]}>
                <Text style={{ color: COLORS.inkSoft, fontSize: 9.7 }}>
                  Aucun point préparé. Ajoute les locaux, équipements, une liste Excel ou un point libre.
                </Text>
              </View>
            )}

            {points.length ? (
              <>
                <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>
                  Liste de campagne
                </Text>
                {points.map((point, index) => {
                  const compare = comparisonById.get(point.id);
                  return (
                    <TouchableOpacity
                      key={point.id}
                      onPress={() => setCurrentIndex(index)}
                      onLongPress={() => removePoint(point)}
                      style={[
                        missionStyles.card,
                        {
                          padding: 10,
                          marginBottom: 6,
                          borderColor: index === currentIndex ? MISSION_COLORS.accent : MISSION_COLORS.accentLine
                        }
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, width: 28 }}>{index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800' }}>{point.label}</Text>
                          <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 2 }}>
                            {pointContext(point) || 'Point libre'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={{
                              color:
                                point.status === 'measured'
                                  ? MISSION_COLORS.accentDark
                                  : point.status === 'planned'
                                    ? COLORS.inkFaint
                                    : '#8A5B14',
                              fontSize: 8.6,
                              fontWeight: '900'
                            }}
                          >
                            {STATUS_LABELS[point.status] || point.status}
                          </Text>
                          {point.status === 'measured' ? (
                            <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900', marginTop: 2 }}>
                              {point.measured_value ?? point.measured_text} {selectedCampaign.unit || ''}
                            </Text>
                          ) : null}
                          {compare?.delta !== null && compare?.delta !== undefined ? (
                            <Text style={{ color: COLORS.inkFaint, fontSize: 8.1, marginTop: 2 }}>
                              Δ {Number(compare.delta) >= 0 ? '+' : ''}
                              {Number(compare.delta).toFixed(2)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, lineHeight: 12, marginTop: 2 }}>
                  Appui long sur un point pour le retirer de la campagne.
                </Text>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalSheet, missionStyles.modalSheet]}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <Text style={[styles.modalTitle, missionStyles.title]}>Nouvelle campagne</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '900', marginBottom: 5 }}>
              SITE (FACULTATIF)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {sites.map((site) => (
                <Chip
                  key={site.id}
                  label={site.name}
                  selected={draft.siteId === site.id}
                  onPress={() => setDraft((p) => ({ ...p, siteId: p.siteId === site.id ? '' : site.id }))}
                />
              ))}
            </View>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={draft.label}
              onChangeText={(v) => setDraft((p) => ({ ...p, label: v }))}
              placeholder="Ex. Températures ECS · campagne initiale"
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={draft.measureType}
              onChangeText={(v) => setDraft((p) => ({ ...p, measureType: v }))}
              placeholder="Type de mesure"
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={draft.unit}
              onChangeText={(v) => setDraft((p) => ({ ...p, unit: v }))}
              placeholder="Unité"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={draft.expectedValue}
                onChangeText={(v) => setDraft((p) => ({ ...p, expectedValue: v }))}
                placeholder="Valeur attendue"
              />
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                value={draft.expectedText}
                onChangeText={(v) => setDraft((p) => ({ ...p, expectedText: v }))}
                placeholder="Attendu texte"
              />
            </View>
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={draft.referenceSourceLabel}
              onChangeText={(v) => setDraft((p) => ({ ...p, referenceSourceLabel: v }))}
              placeholder="Source référence : CCTP, consigne exploitant…"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={draft.toleranceAbs}
                onChangeText={(v) => setDraft((p) => ({ ...p, toleranceAbs: v }))}
                placeholder="Tolérance abs."
              />
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={draft.tolerancePct}
                onChangeText={(v) => setDraft((p) => ({ ...p, tolerancePct: v }))}
                placeholder="Tolérance %"
              />
            </View>
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 8 }]}
              value={draft.comparisonGroup}
              onChangeText={(v) => setDraft((p) => ({ ...p, comparisonGroup: v }))}
              placeholder="Groupe comparaison (facultatif)"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setCreateVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createCampaign}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={manualPointVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManualPointVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, missionStyles.modalSheet]}>
            <Text style={[styles.modalTitle, missionStyles.title]}>Point de campagne</Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={manualPoint.label}
              onChangeText={(v) => setManualPoint((p) => ({ ...p, label: v }))}
              placeholder="Ex. Logement 24 · cuisine"
              autoFocus
            />
            <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 10 }]}>Type de point</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {POINT_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={type}
                  selected={manualPoint.pointType === type}
                  onPress={() => setManualPoint((p) => ({ ...p, pointType: type }))}
                  compact
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 7 }}>
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                keyboardType="decimal-pad"
                value={manualPoint.expectedValue}
                onChangeText={(v) => setManualPoint((p) => ({ ...p, expectedValue: v }))}
                placeholder="Attendu numérique"
              />
              <TextInput
                style={[styles.input, missionStyles.input, { flex: 1 }]}
                value={manualPoint.expectedText}
                onChangeText={(v) => setManualPoint((p) => ({ ...p, expectedText: v }))}
                placeholder="Attendu texte"
              />
            </View>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, lineHeight: 12, marginTop: 7 }}>
              Utilise une référence technique de logement/local ; évite les données personnelles inutiles.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setManualPointVisible(false)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={addManualPoint}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
