import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { getDb } from './db.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { ButtonGlow } from './ButtonGlow.js';
import {
  creerInstrumentMission,
  creerTypeMesureMission,
  enregistrerMesureCompleteMission,
  importerSerieMesuresMission,
  listerInstrumentsMission,
  listerMesuresMission,
  listerTypesMesureMission,
} from './missionMeasurementDb.js';

const SOURCES = [
  ['terrain','Terrain'],
  ['document','Document'],
  ['operator','Exploitant'],
  ['gtc','GTC/GTB'],
  ['meter','Compteur'],
  ['calculation','Calcul'],
  ['simulation','Simulation'],
  ['estimate','Estimation'],
];

const REFERENCE_SOURCES = [
  ['contractual','Contractuelle'],
  ['manufacturer','Constructeur'],
  ['regulatory','Réglementaire'],
  ['setpoint','Consigne'],
  ['document','Document'],
  ['previous_campaign','Campagne précédente'],
  ['project','Projet'],
  ['manual','Libre'],
];

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontFamily: FONTS.bold }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder = '' }) {
  return <View style={{ marginBottom: 8 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontFamily: FONTS.bold, marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput style={[styles.input, missionStyles.input]} value={String(value ?? '')} onChangeText={onChangeText} keyboardType={keyboardType} placeholder={placeholder} />
  </View>;
}

function SeriesChart({ series, width }) {
  const summary = series?.summary || {};
  const points = Array.isArray(summary.points) ? summary.points : [];
  const h = 180;
  const w = Math.max(280, width || 320);
  if (points.length < 2) return <Text style={{ color: COLORS.inkFaint, fontSize: 9 }}>Pas assez de points pour afficher le graphe.</Text>;
  const vals = points.map((p) => Number(p.value)).filter(Number.isFinite);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = 10 + i * ((w - 20) / Math.max(1, points.length - 1));
    const y = h - 20 - ((Number(p.value) - min) / span) * (h - 40);
    return x + ',' + y;
  }).join(' ');
  return <Svg width={w} height={h}>
    <Line x1="10" y1={h - 20} x2={w - 10} y2={h - 20} stroke={MISSION_COLORS.accentLineStrong} strokeWidth="1" />
    <Line x1="10" y1="20" x2="10" y2={h - 20} stroke={MISSION_COLORS.accentLineStrong} strokeWidth="1" />
    <Polyline points={coords} fill="none" stroke={MISSION_COLORS.accent} strokeWidth="2.5" />
    <SvgText x="12" y="16" fontSize="9" fill={COLORS.inkSoft}>{max.toFixed(2)} {series.unit || ''}</SvgText>
    <SvgText x="12" y={h - 5} fontSize="9" fill={COLORS.inkSoft}>{min.toFixed(2)} {series.unit || ''}</SvgText>
  </Svg>;
}

export function MissionMeasurementsScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const { width } = useWindowDimensions();
  const [data, setData] = useState({ measures: [], series: [] });
  const [types, setTypes] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [sites, setSites] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [measureVisible, setMeasureVisible] = useState(false);
  const [typeVisible, setTypeVisible] = useState(false);
  const [instrumentVisible, setInstrumentVisible] = useState(false);
  const [seriesVisible, setSeriesVisible] = useState(null);
  const [draft, setDraft] = useState({
    siteId: '', equipmentId: '', typeKey: '', typeLabel: '', value: '', valueText: '', unit: '',
    sourceType: 'terrain', sourceLabel: '', referenceValue: '', referenceText: '', referenceSourceType: 'manual',
    referenceSourceLabel: '', toleranceAbs: '', tolerancePct: '', instrumentId: '', comment: '',
  });
  const [customType, setCustomType] = useState({ label: '', unit: '', min: '', max: '' });
  const [instrumentDraft, setInstrumentDraft] = useState({ label: '', brand: '', model: '', serial: '', calibration: '', due: '' });
  const [seriesType, setSeriesType] = useState('Température');
  const [seriesUnit, setSeriesUnit] = useState('°C');

  const load = useCallback(async () => {
    const db = await getDb();
    const [m,t,i,s,e] = await Promise.all([
      listerMesuresMission(missionId),
      listerTypesMesureMission(missionId),
      listerInstrumentsMission(missionId),
      db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
      db.getAllAsync('SELECT e.*,s.name AS site_name FROM mission_equipment e JOIN mission_site_links l ON l.site_id=e.site_id LEFT JOIN mission_sites s ON s.id=e.site_id WHERE l.mission_id=? ORDER BY s.name,e.type,e.brand,e.model LIMIT 2000', [missionId]),
    ]);
    setData(m);
    setTypes(t);
    setInstruments(i);
    setSites(s);
    setEquipment(e);
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  const filteredEquipment = useMemo(() => equipment.filter((e) => !draft.siteId || e.site_id === draft.siteId), [equipment, draft.siteId]);

  const selectType = (type) => {
    setDraft((p) => ({ ...p, typeKey: type.key, typeLabel: type.label, unit: type.unit || p.unit }));
  };

  const saveMeasure = async () => {
    if (!draft.typeLabel && !draft.typeKey) {
      Alert.alert('Type de mesure requis', 'Choisis le type de mesure.');
      return;
    }
    if (!draft.value.trim() && !draft.valueText.trim()) {
      Alert.alert('Valeur requise', 'Indique une valeur numérique ou texte.');
      return;
    }
    try {
      const result = await enregistrerMesureCompleteMission({
        missionId,
        siteId: draft.siteId || null,
        equipmentId: draft.equipmentId || null,
        type: draft.typeLabel || draft.typeKey,
        value: draft.value,
        valueText: draft.valueText,
        unit: draft.unit,
        referenceValue: draft.referenceValue,
        referenceText: draft.referenceText,
        referenceSourceType: draft.referenceSourceType,
        referenceSourceLabel: draft.referenceSourceLabel,
        toleranceAbs: draft.toleranceAbs,
        tolerancePct: draft.tolerancePct,
        sourceType: draft.sourceType,
        sourceLabel: draft.sourceLabel,
        instrumentId: draft.instrumentId || null,
        comment: draft.comment,
      });
      setMeasureVisible(false);
      setDraft((p) => ({ ...p, value: '', valueText: '', referenceValue: '', referenceText: '', comment: '' }));
      await load();
      if (result?.anomalyStatus === 'to_check') Alert.alert('À contrôler', 'La valeur dépasse la tolérance définie. METRA conserve l’écart sans conclure automatiquement à un défaut.');
    } catch (e) { Alert.alert('Mesure impossible', String(e?.message || e)); }
  };

  const createType = async () => {
    if (!customType.label.trim()) return;
    const id = await creerTypeMesureMission({ missionId, label: customType.label, unit: customType.unit, expectedMin: customType.min, expectedMax: customType.max });
    setTypeVisible(false);
    setCustomType({ label: '', unit: '', min: '', max: '' });
    await load();
    const row = (await listerTypesMesureMission(missionId)).find((t) => t.id === id);
    if (row) selectType(row);
  };

  const createInstrument = async () => {
    if (!instrumentDraft.label.trim()) return;
    const id = await creerInstrumentMission({
      missionId,
      label: instrumentDraft.label,
      brand: instrumentDraft.brand,
      model: instrumentDraft.model,
      serialNumber: instrumentDraft.serial,
      calibrationDate: instrumentDraft.calibration,
      calibrationDueDate: instrumentDraft.due,
    });
    setInstrumentVisible(false);
    setInstrumentDraft({ label: '', brand: '', model: '', serial: '', calibration: '', due: '' });
    await load();
    setDraft((p) => ({ ...p, instrumentId: id }));
  };

  const importSeries = async () => {
    try {
      const result = await importerSerieMesuresMission({
        missionId,
        siteId: draft.siteId || null,
        equipmentId: draft.equipmentId || null,
        type: seriesType,
        unit: seriesUnit,
      });
      if (result) {
        await load();
        Alert.alert('Série importée', String(result.sampleCount) + ' point(s) · min ' + result.minValue + ' · max ' + result.maxValue + ' · moy. ' + result.avgValue.toFixed(2));
      }
    } catch (e) { Alert.alert('Import de série impossible', String(e?.message || e)); }
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Mesures · campagnes · séries</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Mesuré, documentaire, GTC, compteur, simulé ou estimé : la source reste visible. Une référence est séparée de la mesure pour comparer sans ambiguïté.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setMeasureVisible(true)}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Mesure</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setTypeVisible(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Type personnalisé</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setInstrumentVisible(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Instrument</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionMeasurementCampaign', { missionId })}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Campagnes terrain · valeur → suivant</Text></TouchableOpacity>
      </View>

      <View style={[missionStyles.card, { padding: 12, marginTop: 12 }]}>
        <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11, fontFamily: FONTS.black }}>Importer une série / campagne</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 3 }}>CSV / XLSX : METRA conserve le fichier brut, calcule min/max/moyenne et mémorise un échantillon graphique léger.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={seriesType} onChangeText={setSeriesType} placeholder="Type série" />
          <TextInput style={[styles.input, missionStyles.input, { width: 90 }]} value={seriesUnit} onChangeText={setSeriesUnit} placeholder="Unité" />
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={importSeries}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Importer</Text></TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Mesures ponctuelles</Text>
      {(data.measures || []).map((m) => <View key={m.id} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.5, fontFamily: FONTS.black }}>{m.type}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>{[m.source_label || m.source_type, m.instrument_label].filter(Boolean).join(' · ') || 'Source non précisée'}</Text>
            {m.reference_number !== null && m.reference_number !== undefined ? <Text style={{ color: COLORS.inkSoft, fontSize: 8.8, marginTop: 3 }}>Référence {m.reference_number} {m.unit || ''} · {m.reference_source_label || m.reference_source_type || ''}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13, fontFamily: FONTS.black }}>{m.value_number ?? m.value_text ?? '/'} {m.unit || ''}</Text>
            {m.delta_percent !== null && m.delta_percent !== undefined ? <Text style={{ color: m.anomaly_status === 'to_check' ? '#8A5B14' : COLORS.inkFaint, fontSize: 8.7, marginTop: 3 }}>{Number(m.delta_percent).toFixed(1)} % {m.anomaly_status === 'to_check' ? '· À contrôler' : ''}</Text> : null}
          </View>
        </View>
      </View>)}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Séries</Text>
      {(data.series || []).map((s) => <TouchableOpacity key={s.id} onPress={() => setSeriesVisible(s)} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
        <Text style={{ color: COLORS.ink, fontSize: 10.5, fontFamily: FONTS.black }}>{s.type} · {s.sample_count} point(s)</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 3 }}>Min {s.min_value} · Moy {Number(s.avg_value || 0).toFixed(2)} · Max {s.max_value} {s.unit || ''}</Text>
      </TouchableOpacity>)}
    </ScrollView>

    <Modal visible={measureVisible} animationType="slide" onRequestClose={() => setMeasureVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 52, paddingBottom: 90 }}>
          <Text style={[styles.sectionTitle, missionStyles.title]}>Nouvelle mesure</Text>
          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Site</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {sites.map((s) => <Chip key={s.id} label={s.name} selected={draft.siteId === s.id} onPress={() => setDraft((p) => ({ ...p, siteId: p.siteId === s.id ? '' : s.id, equipmentId: '' }))} />)}
          </View>
          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Équipement (facultatif)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46, marginBottom: 8 }}>
            {filteredEquipment.map((e) => <Chip key={e.id} label={[e.type,e.brand,e.model].filter(Boolean).join(' · ')} selected={draft.equipmentId === e.id} onPress={() => setDraft((p) => ({ ...p, equipmentId: p.equipmentId === e.id ? '' : e.id }))} />)}
          </ScrollView>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', maxHeight: 190, overflow: 'hidden', marginBottom: 8 }}>
            {types.slice(0, 26).map((t) => <Chip key={t.id} label={t.label} selected={draft.typeKey === t.key} onPress={() => selectType(t)} />)}
          </View>
          <Field label="Type libre si nécessaire" value={draft.typeLabel} onChangeText={(v) => setDraft((p) => ({ ...p, typeLabel: v, typeKey: p.typeKey || 'free' }))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Valeur numérique" value={draft.value} onChangeText={(v) => setDraft((p) => ({ ...p, value: v }))} keyboardType="decimal-pad" /></View>
            <View style={{ width: 100 }}><Field label="Unité" value={draft.unit} onChangeText={(v) => setDraft((p) => ({ ...p, unit: v }))} /></View>
          </View>
          <Field label="Valeur texte si non numérique" value={draft.valueText} onChangeText={(v) => setDraft((p) => ({ ...p, valueText: v }))} />

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Origine de la mesure</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 }}>{SOURCES.map(([k,l]) => <Chip key={k} label={l} selected={draft.sourceType === k} onPress={() => setDraft((p) => ({ ...p, sourceType: k }))} />)}</View>
          <Field label="Source / libellé" value={draft.sourceLabel} onChangeText={(v) => setDraft((p) => ({ ...p, sourceLabel: v }))} placeholder="Écran GTC, compteur, rapport exploitant…" />

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Référence (facultatif)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Valeur référence" value={draft.referenceValue} onChangeText={(v) => setDraft((p) => ({ ...p, referenceValue: v }))} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Référence texte" value={draft.referenceText} onChangeText={(v) => setDraft((p) => ({ ...p, referenceText: v }))} /></View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 }}>{REFERENCE_SOURCES.map(([k,l]) => <Chip key={k} label={l} selected={draft.referenceSourceType === k} onPress={() => setDraft((p) => ({ ...p, referenceSourceType: k }))} />)}</View>
          <Field label="Source de référence" value={draft.referenceSourceLabel} onChangeText={(v) => setDraft((p) => ({ ...p, referenceSourceLabel: v }))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Tolérance absolue" value={draft.toleranceAbs} onChangeText={(v) => setDraft((p) => ({ ...p, toleranceAbs: v }))} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Tolérance %" value={draft.tolerancePct} onChangeText={(v) => setDraft((p) => ({ ...p, tolerancePct: v }))} keyboardType="decimal-pad" /></View>
          </View>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Instrument (facultatif)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {instruments.map((i) => <Chip key={i.id} label={i.label} selected={draft.instrumentId === i.id} onPress={() => setDraft((p) => ({ ...p, instrumentId: p.instrumentId === i.id ? '' : i.id }))} />)}
          </View>
          <Field label="Commentaire" value={draft.comment} onChangeText={(v) => setDraft((p) => ({ ...p, comment: v }))} />

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setMeasureVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { flex: 1, alignItems: 'center' }]} onPress={saveMeasure}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={typeVisible} transparent animationType="fade" onRequestClose={() => setTypeVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Type de mesure personnalisé</Text>
        <Field label="Nom" value={customType.label} onChangeText={(v) => setCustomType((p) => ({ ...p, label: v }))} />
        <Field label="Unité" value={customType.unit} onChangeText={(v) => setCustomType((p) => ({ ...p, unit: v }))} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="Min attendu" value={customType.min} onChangeText={(v) => setCustomType((p) => ({ ...p, min: v }))} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Max attendu" value={customType.max} onChangeText={(v) => setCustomType((p) => ({ ...p, max: v }))} keyboardType="decimal-pad" /></View>
        </View>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setTypeVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createType}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={instrumentVisible} transparent animationType="fade" onRequestClose={() => setInstrumentVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 14 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Instrument de mesure</Text>
        <Field label="Nom" value={instrumentDraft.label} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, label: v }))} />
        <Field label="Marque" value={instrumentDraft.brand} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, brand: v }))} />
        <Field label="Modèle" value={instrumentDraft.model} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, model: v }))} />
        <Field label="N° série" value={instrumentDraft.serial} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, serial: v }))} />
        <Field label="Étalonnage AAAA-MM-JJ" value={instrumentDraft.calibration} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, calibration: v }))} />
        <Field label="Prochain étalonnage" value={instrumentDraft.due} onChangeText={(v) => setInstrumentDraft((p) => ({ ...p, due: v }))} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setInstrumentVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={createInstrument}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>

    <Modal visible={!!seriesVisible} transparent animationType="fade" onRequestClose={() => setSeriesVisible(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>{seriesVisible?.type || 'Série'}</Text>
        {seriesVisible ? <SeriesChart series={seriesVisible} width={Math.min(620, width - 70)} /> : null}
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 5 }}>{seriesVisible?.sample_count || 0} point(s) · min {seriesVisible?.min_value} · moy {Number(seriesVisible?.avg_value || 0).toFixed(2)} · max {seriesVisible?.max_value} {seriesVisible?.unit || ''}</Text>
        <View style={styles.modalActions}><TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setSeriesVisible(null)}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Fermer</Text></TouchableOpacity></View>
      </View></View>
    </Modal>
  </View>;
}
