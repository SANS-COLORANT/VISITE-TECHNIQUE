import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { creerPointMission } from './missionsDb.js';
import { creerActionMission, creerOuTrouverActeurMission, creerReferenceMission, enregistrerDetailsPointMission, enregistrerMesureMission } from './missionDomainDb.js';
import { capturerPhotoMission, choisirEtAjouterDocumentMission } from './missionMediaDb.js';
import { demarrerDicteeLocale } from './missionNativeTools.js';
import { enregistrerNoteVocaleMission, genererChecklistFinVisite, ignorerCheckVisite } from './missionVisitQualityDb.js';
import { getMissionVisitRecipe, MISSION_CAPTURE_MODES } from './missionRecipes.js';
import { getMissionFieldPlaybook } from './missionFieldPlaybooks.js';
import { ajouterNoteVisiteMission, chargerVisiteMission, compterSaisieVisiteMission, enregistrerValeurTrameMission, mettreAJourVisiteMission } from './missionVisitDb.js';
import { listerStructureMission } from './missionStructureDb.js';
import { modifierEquipementMission } from './missionEquipmentDb.js';
import { chargerContexteAutoVisiteMission, valeurAutoPourChampMission } from './missionVisitAutofillDb.js';

const POINT_TYPES = [
  ['reserve', 'Réserve'], ['action', 'Action'], ['request', 'Demande'], ['control', 'Contrôle'], ['decision', 'Décision'], ['information', 'Information'],
];

function ChoiceField({ field, value, onChange }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
    {(field.options || []).map((option) => {
      const selected = value === option;
      return <TouchableOpacity key={option} onPress={() => onChange(selected ? '' : option)} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : COLORS.white, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, marginRight: 7, marginBottom: 7 }}><Text style={{ color: selected ? MISSION_COLORS.accentDark : COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{option}</Text></TouchableOpacity>;
    })}
  </View>;
}

function OptionalField({ sectionKey, field, value, autoValue = '', onChange, onSave, onDictate, dictationBusy }) {
  return <View style={{ marginBottom: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
      <Text style={{ flex: 1, color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{field.label}</Text>
      <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.5, fontWeight: '700' }}>OPTIONNEL</Text>
    </View>
    {autoValue ? <View style={{ marginBottom: 7, borderRadius: 10, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.accentSoft, padding: 9 }}>
      <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 7.8, fontWeight: '900', letterSpacing: 0.45 }}>DÉJÀ CONNU PAR METRA · PAS DE RESSAISIE</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, lineHeight: 13, marginTop: 3 }}>{autoValue}</Text>
    </View> : null}
    {field.type === 'choice'
      ? <ChoiceField field={field} value={value || ''} onChange={(next) => { onChange(next); onSave(next); }} />
      : <View>
          <TextInput
            value={value || ''}
            onChangeText={onChange}
            onBlur={() => onSave(value || '')}
            multiline
            placeholder={autoValue ? 'Ajouter uniquement une précision si nécessaire' : 'Laisser vide si non renseigné'}
            placeholderTextColor={COLORS.inkFaint}
            style={[styles.input, missionStyles.input, { minHeight: 62, textAlignVertical: 'top', paddingRight: 46 }]}
          />
          {onDictate ? <TouchableOpacity
            onPress={onDictate}
            disabled={dictationBusy}
            style={{ position: 'absolute', right: 7, top: 7, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16 }}>{dictationBusy ? '…' : '🎙'}</Text>
          </TouchableOpacity> : null}
        </View>}
  </View>;
}

export function MissionVisitScreen({ navigation, route }) {
  const routeMissionId = route?.params?.missionId;
  const visitId = route?.params?.visitId;
  const routeLocationId = route?.params?.locationId || '';
  const routeEquipmentId = route?.params?.equipmentId || '';
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [pointModal, setPointModal] = useState(false);
  const [pointType, setPointType] = useState('information');
  const [pointLabel, setPointLabel] = useState('');
  const [pointDescription, setPointDescription] = useState('');
  const [pointResponsible, setPointResponsible] = useState('');
  const [pointDue, setPointDue] = useState('');
  const [pointPriority, setPointPriority] = useState('');
  const [pointCost, setPointCost] = useState('');
  const [pointAllocation, setPointAllocation] = useState('');
  const [pointRequestedAction, setPointRequestedAction] = useState('');
  const [captureMode, setCaptureMode] = useState('standard');
  const [measureModal, setMeasureModal] = useState(false);
  const [measureType, setMeasureType] = useState('');
  const [measureValue, setMeasureValue] = useState('');
  const [measureUnit, setMeasureUnit] = useState('');
  const [measureReference, setMeasureReference] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [checklistModal, setChecklistModal] = useState(false);
  const [contextLocations, setContextLocations] = useState([]);
  const [contextEquipment, setContextEquipment] = useState([]);
  const [contextLocationId, setContextLocationId] = useState(routeLocationId);
  const [contextEquipmentId, setContextEquipmentId] = useState(routeEquipmentId);
  const [contextModal, setContextModal] = useState(false);
  const [contextQuery, setContextQuery] = useState('');
  const [autoContext, setAutoContext] = useState({});

  const reload = useCallback(async () => {
    if (!visitId) return;
    setLoading(true);
    try {
      const next = await chargerVisiteMission(visitId);
      setData(next);
      const map = {};
      let nextMode = getMissionFieldPlaybook(next?.visit?.mission_type).defaultMode || 'standard';
      for (const row of next?.values || []) {
        const value = row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_date ?? '';
        if (row.field_code === '__meta.capture_mode') nextMode = value || nextMode;
        else map[row.field_code] = value;
      }
      setValues(map);
      setCaptureMode(nextMode);
      setStats(await compterSaisieVisiteMission(visitId));
      if (next?.visit?.status === 'draft') await mettreAJourVisiteMission(visitId, { status: 'in_progress' });
    } finally { setLoading(false); }
  }, [visitId]);

  useEffect(() => { reload(); }, [reload]);

  const recipe = useMemo(() => getMissionVisitRecipe(data?.visit?.family, data?.visit?.mission_type, captureMode), [data?.visit?.family, data?.visit?.mission_type, captureMode]);
  const playbook = useMemo(() => getMissionFieldPlaybook(data?.visit?.mission_type), [data?.visit?.mission_type]);
  const actualMissionId = data?.visit?.mission_id || routeMissionId;

  useEffect(() => {
    if (!actualMissionId || !data?.visit?.site_id) return;
    (async () => {
      try {
        const structure = await listerStructureMission(actualMissionId);
        const siteId = data.visit.site_id;
        const locations = (structure.locations || []).filter((row) => row.site_id === siteId);
        const equipment = (structure.equipment || []).filter((row) => row.site_id === siteId);
        setContextLocations(locations);
        setContextEquipment(equipment);

        if (routeEquipmentId) {
          const selected = equipment.find((row) => row.id === routeEquipmentId);
          if (selected?.location_id) setContextLocationId(selected.location_id);
        }
      } catch {}
    })();
  }, [actualMissionId, data?.visit?.site_id, routeEquipmentId]);

  useEffect(() => {
    if (!actualMissionId) {
      setAutoContext({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const next = await chargerContexteAutoVisiteMission(actualMissionId, {
          siteId: data?.visit?.site_id || null,
          locationId: contextLocationId || null,
          equipmentId: contextEquipmentId || null,
        });
        if (!cancelled) setAutoContext(next || {});
      } catch {
        if (!cancelled) setAutoContext({});
      }
    })();
    return () => { cancelled = true; };
  }, [actualMissionId, data?.visit?.site_id, contextLocationId, contextEquipmentId]);

  const selectedContextLocation = useMemo(
    () => contextLocations.find((row) => row.id === contextLocationId) || null,
    [contextLocations, contextLocationId]
  );
  const selectedContextEquipment = useMemo(
    () => contextEquipment.find((row) => row.id === contextEquipmentId) || null,
    [contextEquipment, contextEquipmentId]
  );
  const filteredContextLocations = useMemo(() => {
    const q = contextQuery.trim().toLowerCase();
    if (!q) return contextLocations.slice(0, 120);
    return contextLocations.filter((row) => [row.label,row.kind].some((value) => String(value || '').toLowerCase().includes(q))).slice(0, 120);
  }, [contextLocations, contextQuery]);
  const filteredContextEquipment = useMemo(() => {
    const q = contextQuery.trim().toLowerCase();
    return contextEquipment
      .filter((row) => !contextLocationId || row.location_id === contextLocationId)
      .filter((row) => !q || [row.type,row.brand,row.model].some((value) => String(value || '').toLowerCase().includes(q)))
      .slice(0, 180);
  }, [contextEquipment, contextLocationId, contextQuery]);

  const clearTechnicalContext = () => {
    setContextLocationId('');
    setContextEquipmentId('');
  };

  const selectLocationContext = (locationId) => {
    setContextLocationId(locationId || '');
    if (contextEquipmentId) {
      const currentEquipment = contextEquipment.find((row) => row.id === contextEquipmentId);
      if (!currentEquipment || currentEquipment.location_id !== locationId) setContextEquipmentId('');
    }
  };

  const selectEquipmentContext = (equipmentId) => {
    const equipment = contextEquipment.find((row) => row.id === equipmentId);
    setContextEquipmentId(equipmentId || '');
    if (equipment?.location_id) setContextLocationId(equipment.location_id);
    setContextModal(false);
    setContextQuery('');
  };

  const setContextEquipmentVerification = async (status) => {
    if (!contextEquipmentId || !actualMissionId) return;
    try {
      await modifierEquipementMission(contextEquipmentId, { verificationStatus: status });
      setContextEquipment((rows) => rows.map((row) => row.id === contextEquipmentId ? { ...row, verification_status: status } : row));
      const next = await chargerContexteAutoVisiteMission(actualMissionId, {
        siteId: data?.visit?.site_id || null,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId,
      });
      setAutoContext(next || {});
    } catch (e) {
      Alert.alert('Statut non enregistré', String(e?.message || e));
    }
  };

  const changeCaptureMode = async (nextMode) => {
    setCaptureMode(nextMode);
    if (!data?.visit || !actualMissionId) return;
    try {
      await enregistrerValeurTrameMission({
        missionId: actualMissionId,
        visitId,
        siteId: data.visit.site_id,
        templateId: '__meta',
        fieldCode: '__meta.capture_mode',
        fieldLabel: 'Mode de saisie',
        value: nextMode,
        valueType: 'text',
      });
    } catch (e) {
      Alert.alert('Mode non enregistré', String(e.message || e));
    }
  };

  const saveField = async (sectionKey, field, value) => {
    if (!data?.visit || !actualMissionId) return;
    try {
      await enregistrerValeurTrameMission({
        missionId: actualMissionId,
        visitId,
        siteId: data.visit.site_id,
        templateId: data.visit.family || 'libre',
        fieldCode: `${sectionKey}.${field.key}`,
        fieldLabel: field.label,
        value,
        valueType: field.type === 'number' ? 'number' : field.type === 'boolean' ? 'boolean' : field.type === 'date' ? 'date' : 'text',
      });
      setStats(await compterSaisieVisiteMission(visitId));
    } catch (e) { Alert.alert('Enregistrement impossible', String(e.message || e)); }
  };

  const addNote = async () => {
    if (!note.trim() || !actualMissionId) return;
    try {
      await ajouterNoteVisiteMission({ missionId: actualMissionId, visitId, siteId: data?.visit?.site_id, content: note, visibility: 'internal' });
      setNote('');
      await reload();
    } catch (e) { Alert.alert('Note non enregistrée', String(e.message || e)); }
  };

  const addPhoto = async () => {
    if (!actualMissionId || mediaBusy) return;
    setMediaBusy(true);
    try {
      const photo = await capturerPhotoMission({
        missionId: actualMissionId,
        siteId: data?.visit?.site_id,
        visitId,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
        label: 'Photo terrain',
        type: 'terrain',
      });
      if (photo) setStats(await compterSaisieVisiteMission(visitId));
    } catch (e) {
      Alert.alert('Photo non enregistrée', String(e?.message || e));
    } finally {
      setMediaBusy(false);
    }
  };

  const addDocument = async () => {
    if (!actualMissionId || mediaBusy) return;
    setMediaBusy(true);
    try {
      const document = await choisirEtAjouterDocumentMission({
        missionId: actualMissionId,
        siteId: data?.visit?.site_id,
        visitId,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
        type: 'source_terrain',
      });
      if (document) Alert.alert('Document ajouté', document.name || 'Document enregistré hors ligne.');
    } catch (e) {
      Alert.alert('Document non enregistré', String(e?.message || e));
    } finally {
      setMediaBusy(false);
    }
  };

  const openMeasurePreset = (preset = null) => {
    setMeasureType(preset?.type || '');
    setMeasureUnit(preset?.unit || '');
    setMeasureReference(preset?.referenceValue === null || preset?.referenceValue === undefined ? '' : String(preset.referenceValue));
    setMeasureValue('');
    setMeasureModal(true);
  };

  const openPointPreset = (preset = null) => {
    setPointType(preset?.pointType || 'information');
    setPointLabel(preset?.label || '');
    setPointDescription(preset?.description || '');
    setPointResponsible('');
    setPointDue(preset?.due || '');
    setPointPriority(preset?.priority || '');
    setPointCost(preset?.cost || '');
    setPointAllocation(preset?.allocation || '');
    setPointRequestedAction(preset?.requestedAction || '');
    setPointModal(true);
  };

  const runPlaybookAction = async (item) => {
    if (!item) return;
    if (item.kind === 'photo') {
      await addPhoto();
      return;
    }
    if (item.kind === 'document') {
      await addDocument();
      return;
    }
    if (item.kind === 'measure') {
      openMeasurePreset(item.preset || playbook?.measures?.[0] || null);
      return;
    }
    if (item.kind === 'point') {
      openPointPreset(item.preset || playbook?.pointPresets?.[0] || null);
      return;
    }
    if (item.kind === 'navigate' && item.route) {
      const params = {
        missionId: actualMissionId,
        siteId: data?.visit?.site_id || null,
        visitId,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
      };
      navigation.navigate(item.route, params);
    }
  };

  const addMeasure = async () => {
    if (!actualMissionId || !measureType.trim()) return;
    try {
      let referenceId = null;
      if (measureReference.trim() !== '') {
        const referenceNumber = Number(measureReference.replace(',', '.'));
        if (!Number.isFinite(referenceNumber)) throw new Error('La référence attendue doit être numérique.');
        referenceId = await creerReferenceMission({
          missionId: actualMissionId,
          siteId: data?.visit?.site_id,
          measureType: measureType,
          value: referenceNumber,
          unit: measureUnit,
          sourceType: 'manual',
          sourceLabel: 'Référence saisie pendant la Mission',
        });
      }
      const submitted = {
        type: measureType.trim(),
        value: measureValue.trim(),
        unit: measureUnit.trim(),
        reference: measureReference.trim(),
      };
      const numericValue = Number(measureValue.replace(',', '.'));
      const result = await enregistrerMesureMission({
        missionId: actualMissionId,
        visitId,
        siteId: data?.visit?.site_id,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
        type: measureType,
        value: Number.isFinite(numericValue) && measureValue.trim() !== '' ? numericValue : null,
        valueText: Number.isFinite(numericValue) && measureValue.trim() !== '' ? null : measureValue,
        unit: measureUnit,
        referenceId,
        sourceType: 'terrain',
        quality: 'measured',
      });
      setMeasureModal(false);
      setMeasureType('');
      setMeasureValue('');
      setMeasureUnit('');
      setMeasureReference('');
      setStats(await compterSaisieVisiteMission(visitId));
      if (result?.anomalyStatus === 'to_check') {
        const description = [
          submitted.value ? 'Mesure : ' + submitted.value + (submitted.unit ? ' ' + submitted.unit : '') : null,
          submitted.reference ? 'Référence : ' + submitted.reference + (submitted.unit ? ' ' + submitted.unit : '') : null,
        ].filter(Boolean).join(' · ');
        Alert.alert(
          'Valeur à contrôler',
          'La mesure dépasse la tolérance de sa référence. METRA la signale sans conclure automatiquement à un défaut.',
          [
            { text: 'Conserver seulement la mesure', style: 'cancel' },
            {
              text: 'Créer un point à contrôler',
              onPress: () => openPointPreset({
                pointType: 'control',
                label: 'Valeur à contrôler · ' + submitted.type,
                description,
                priority: 'À contrôler',
                requestedAction: 'Vérifier cette valeur et son contexte avant conclusion.',
              }),
            },
          ]
        );
      }
    } catch (e) {
      Alert.alert('Mesure non enregistrée', String(e?.message || e));
    }
  };

  const dictateText = async (currentValue, applyValue, { pointId = null } = {}) => {
    if (!actualMissionId || dictationBusy) return;
    setDictationBusy(true);
    try {
      const result = await demarrerDicteeLocale('fr-FR');
      const transcript = String(result?.text || '').trim();
      if (!transcript) return;
      const next = [String(currentValue || '').trim(), transcript].filter(Boolean).join(' ');
      applyValue(next);
      await enregistrerNoteVocaleMission({
        missionId: actualMissionId,
        visitId,
        siteId: data?.visit?.site_id,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
        pointId,
        transcript,
        locale: 'fr-FR',
      });
    } catch (e) {
      Alert.alert('Dictée indisponible', String(e?.message || e));
    } finally {
      setDictationBusy(false);
    }
  };

  const reallyComplete = async () => {
    await mettreAJourVisiteMission(visitId, { status: 'completed' });
    setChecklistModal(false);
    navigation.goBack();
  };

  const ignoreChecklistItem = async (item) => {
    try {
      await ignorerCheckVisite(item.id);
      setChecklist((current) => current.filter((row) => row.id !== item.id));
    } catch (e) {
      Alert.alert('Checklist non mise à jour', String(e?.message || e));
    }
  };

  const openChecklistItem = (item) => {
    setChecklistModal(false);
    if (item.entity_type === 'equipment' && item.entity_id) {
      navigation.navigate('MissionEquipment', {
        missionId: actualMissionId,
        equipmentId: item.entity_id,
        siteId: data?.visit?.site_id,
      });
      return;
    }
    if (item.entity_type === 'point') {
      navigation.navigate('MissionActions', { missionId: actualMissionId, siteId: data?.visit?.site_id || null });
      return;
    }
    if (item.entity_type === 'test_run') {
      navigation.navigate('MissionTests', { missionId: actualMissionId, visitId });
      return;
    }
    if (item.entity_type === 'measurement_campaign') {
      navigation.navigate('MissionMeasurementCampaign', { missionId: actualMissionId });
    }
  };

  const addPoint = async () => {
    if (!actualMissionId) return;
    try {
      const responsibleActorId = pointResponsible.trim()
        ? await creerOuTrouverActeurMission({ missionId: actualMissionId, siteId: data?.visit?.site_id, company: pointResponsible.trim(), role: 'Responsable action' })
        : null;
      const pointId = await creerPointMission({
        missionId: actualMissionId,
        siteId: data?.visit?.site_id,
        visitId,
        locationId: contextLocationId || null,
        equipmentId: contextEquipmentId || null,
        type: pointType,
        label: pointLabel,
        description: pointDescription,
        responsibleActorId,
        dueText: pointDue,
        priority: pointPriority,
      });
      if (pointCost.trim() || pointAllocation.trim() || pointRequestedAction.trim()) {
        await enregistrerDetailsPointMission({
          pointId,
          costEstimate: pointCost,
          allocation: pointAllocation,
          requestedAction: pointRequestedAction,
        });
      }

      const shouldCreateAction =
        ['reserve', 'action'].includes(pointType)
        || (
          ['request', 'control'].includes(pointType)
          && Boolean(
            pointRequestedAction.trim()
            || pointResponsible.trim()
            || pointDue.trim()
            || pointPriority.trim()
            || pointCost.trim()
            || pointAllocation.trim()
          )
        );
      if (shouldCreateAction) {
        await creerActionMission({
          missionId: actualMissionId,
          sourcePointId: pointId,
          siteId: data?.visit?.site_id,
          locationId: contextLocationId || null,
          equipmentId: contextEquipmentId || null,
          label: pointRequestedAction.trim() || pointLabel.trim() || (pointType === 'reserve' ? 'Lever la réserve' : 'Traiter le point'),
          description: pointDescription,
          priority: pointPriority,
          responsibleActorId,
          dueText: pointDue,
          costEstimate: pointCost,
          allocation: pointAllocation,
        });
      }
      setPointModal(false);
      setPointLabel('');
      setPointDescription('');
      setPointResponsible('');
      setPointDue('');
      setPointPriority('');
      setPointCost('');
      setPointAllocation('');
      setPointRequestedAction('');
      setPointType('information');
      await reload();
    } catch (e) { Alert.alert('Point non créé', String(e.message || e)); }
  };

  const complete = async () => {
    try {
      const checks = await genererChecklistFinVisite(actualMissionId, visitId);
      setChecklist(checks || []);
      if (checks?.length) {
        setChecklistModal(true);
        return;
      }
      Alert.alert(
        'Terminer cette visite ?',
        'Aucun point de vigilance automatique n’a été détecté. La visite restera modifiable.',
        [
          { text: 'Continuer la saisie', style: 'cancel' },
          { text: 'Terminer', onPress: reallyComplete },
        ]
      );
    } catch (e) {
      Alert.alert(
        'Terminer cette visite ?',
        'La checklist automatique n’a pas pu être calculée. Tu peux quand même terminer la visite.',
        [
          { text: 'Continuer la saisie', style: 'cancel' },
          { text: 'Terminer quand même', onPress: reallyComplete },
        ]
      );
    }
  };

  if (loading && !data) return <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, missionStyles.screen]}><ActivityIndicator color={MISSION_COLORS.accent}/></View>;
  if (!data?.visit) return <View style={styles.center}><Text style={styles.errorTitle}>Visite Mission introuvable</Text></View>;

  const visit = data.visit;
  return <View style={[{ flex: 1 }, missionStyles.screen]}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 }, missionStyles.card]}>
        <Text style={[{ fontSize: 17, fontWeight: '900' }, missionStyles.title]}>{visit.mission_label || 'Mission'}</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, marginTop: 4 }}>{[visit.client_name, visit.site_name, visit.visit_date].filter(Boolean).join(' · ')}</Text>
        <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 10, fontWeight: '900', marginTop: 9 }}>Aucun champ de cette visite n’est obligatoire.</Text>
      </View>

      <View style={[missionStyles.card, { padding: 11, marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 }}>CONTEXTE DE SAISIE</Text>
            <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900', marginTop: 3 }} numberOfLines={2}>
              {[
                visit.site_name,
                selectedContextLocation?.label,
                selectedContextEquipment ? [selectedContextEquipment.type, selectedContextEquipment.brand, selectedContextEquipment.model].filter(Boolean).join(' · ') : null,
              ].filter(Boolean).join('  ›  ')}
            </Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, lineHeight: 12, marginTop: 3 }}>
              Photos, mesures, points, documents et dictée héritent automatiquement de ce contexte.
            </Text>
          </View>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => { setContextQuery(''); setContextModal(true); }}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Changer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {selectedContextEquipment && (playbook.equipmentVerificationStatuses || []).length ? <View style={[missionStyles.card, { padding: 10, marginBottom: 12 }]}>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontWeight: '900', marginBottom: 6 }}>STATUT TERRAIN · 1 GESTE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {playbook.equipmentVerificationStatuses.map(([key,label]) => {
            const selected = selectedContextEquipment.verification_status === key;
            return <TouchableOpacity
              key={key}
              onPress={() => setContextEquipmentVerification(key)}
              style={{
                borderWidth: 1,
                borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
                backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
                borderRadius: 10,
                paddingHorizontal: 9,
                paddingVertical: 7,
                marginRight: 6,
                marginBottom: 6,
              }}
            >
              <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontWeight: '900' }}>{label}</Text>
            </TouchableOpacity>;
          })}
        </View>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, lineHeight: 11 }}>
          Le statut est enregistré sur la fiche équipement et sera réutilisé dans l’inventaire, les écarts et le rapport.
        </Text>
      </View> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[
          [stats?.fields_count || 0, 'champs'],
          [stats?.points_count || 0, 'points'],
          [stats?.measures_count || 0, 'mesures'],
          [stats?.photos_count || 0, 'photos'],
          [stats?.notes_count || 0, 'notes'],
        ].map(([value, label]) => <View key={label} style={[{ minWidth: 84, flexGrow: 1, borderRadius: 12, padding: 10 }, missionStyles.statBox]}><Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 15 }}>{value}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>{label}</Text></View>)}
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Mode terrain · {playbook.label}</Text>
      <View style={[missionStyles.card, { padding: 12, marginBottom: 12 }]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.7, lineHeight: 14 }}>{playbook.objective}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 38, marginTop: 9 }}>
          {(playbook.steps || []).map((step, index) => <View key={step} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ minHeight: 28, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 8.6, fontWeight: '900' }}>{index + 1} · {step}</Text>
            </View>
            {index < playbook.steps.length - 1 ? <Text style={{ color: MISSION_COLORS.accentLineStrong, marginHorizontal: 4 }}>›</Text> : null}
          </View>)}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
          {(playbook.quickActions || []).slice(0, 8).map((item) => <TouchableOpacity
            key={item.key}
            activeOpacity={0.82}
            disabled={mediaBusy && ['photo','document'].includes(item.kind)}
            style={[styles.btnSecondary, missionStyles.secondaryButton, { minHeight: 38, justifyContent: 'center' }]}
            onPress={() => runPlaybookAction(item)}
          >
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{item.label}</Text>
          </TouchableOpacity>)}
        </View>

        {(playbook.measures || []).length ? <>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontWeight: '900', marginTop: 10, marginBottom: 5 }}>MESURES COURANTES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42 }}>
            {playbook.measures.slice(0, 8).map((preset) => <TouchableOpacity
              key={preset.type + '|' + preset.unit}
              onPress={() => openMeasurePreset(preset)}
              style={{ borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6 }}
            >
              <Text style={{ color: COLORS.ink, fontSize: 8.8, fontWeight: '800' }}>{preset.label}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 1 }}>{preset.unit || 'Valeur'}</Text>
            </TouchableOpacity>)}
          </ScrollView>
        </> : null}

        {(playbook.pointPresets || []).length ? <>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontWeight: '900', marginTop: 10, marginBottom: 5 }}>POINTS EN 1 GESTE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42 }}>
            {playbook.pointPresets.slice(0, 7).map((preset) => <TouchableOpacity
              key={preset.label}
              onPress={() => openPointPreset(preset)}
              style={{ borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6 }}
            >
              <Text style={{ color: COLORS.ink, fontSize: 8.8, fontWeight: '800' }} numberOfLines={1}>{preset.label}</Text>
            </TouchableOpacity>)}
          </ScrollView>
        </> : null}
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Saisie libre</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flexGrow: 1, alignItems: 'center' }]} onPress={() => openPointPreset(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Point</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flexGrow: 1, alignItems: 'center' }]} onPress={() => openMeasurePreset(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Mesure</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flexGrow: 1, alignItems: 'center' }]} disabled={mediaBusy} onPress={addPhoto}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>📷 Photo</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { flexGrow: 1, alignItems: 'center' }]} disabled={mediaBusy} onPress={addDocument}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Document</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { marginBottom: 18, alignItems: 'center' }]} onPress={complete}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Fin de visite</Text></TouchableOpacity>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Niveau de saisie · {recipe.label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {MISSION_CAPTURE_MODES.map(([key, label]) => {
          const selected = captureMode === key;
          return <TouchableOpacity key={key} onPress={() => changeCaptureMode(key)} style={{ borderRadius: 11, borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : COLORS.white, paddingHorizontal: 11, paddingVertical: 8, marginRight: 7, marginBottom: 7 }}><Text style={{ color: selected ? MISSION_COLORS.accentDark : COLORS.inkSoft, fontSize: 10, fontWeight: '900' }}>{label}</Text></TouchableOpacity>;
        })}
      </View>
      <Text style={{ color: COLORS.inkFaint, fontSize: 9.5, lineHeight: 13.5, marginBottom: 12 }}>
        Rapide = constat essentiel · Standard = mesures/comparaisons · Expert = investigation, calculs et analyse approfondie. Le choix reste modifiable à tout moment.
      </Text>
      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Trame proposée</Text>
      {!recipe.sections.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 10.5, marginBottom: 16 }}>Mission libre : utilise les Points et Notes, ou complète la Mission plus tard.</Text> : null}
      {recipe.sections.map((section) => <View key={section.key} style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 15, padding: 14, marginBottom: 12 }, missionStyles.card]}>
        <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13.5, fontWeight: '900', marginBottom: 12 }}>{section.label}</Text>
        {section.fields.map((field) => {
          const code = `${section.key}.${field.key}`;
          return <OptionalField
            key={field.key}
            sectionKey={section.key}
            field={field}
            value={values[code] || ''}
            autoValue={valeurAutoPourChampMission(field, autoContext)}
            onChange={(next) => setValues((current) => ({ ...current, [code]: next }))}
            onSave={(next) => saveField(section.key, field, next)}
            dictationBusy={dictationBusy}
            onDictate={field.type === 'choice' ? null : async () => {
              const current = values[code] || '';
              await dictateText(current, async (next) => {
                setValues((all) => ({ ...all, [code]: next }));
                await saveField(section.key, field, next);
              });
            }}
          />;
        })}
      </View>)}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 8 }]}>Note libre</Text>
      <View style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 14, padding: 12 }, missionStyles.card]}>
        <View>
          <TextInput style={[styles.input, missionStyles.input, { minHeight: 76, textAlignVertical: 'top', paddingRight: 46 }]} multiline value={note} onChangeText={setNote} placeholder="Note terrain / réunion interne…" />
          <TouchableOpacity
            style={{ position: 'absolute', right: 7, top: 7, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => dictateText(note, setNote)}
            disabled={dictationBusy}
          ><Text style={{ fontSize: 16 }}>{dictationBusy ? '…' : '🎙'}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { marginTop: 9, alignItems: 'center' }]} onPress={addNote}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Ajouter la note</Text></TouchableOpacity>
      </View>

      {(data.points || []).length ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Points créés pendant cette visite</Text>
        {data.points.map((point) => <View key={point.id} style={[{ backgroundColor: COLORS.white, borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 7 }, missionStyles.card]}><Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{point.label || point.description || 'Point sans titre'}</Text><Text style={{ color: MISSION_COLORS.accentDark, marginTop: 3, fontSize: 9.5 }}>{point.type} · {point.status}</Text></View>)}
      </> : null}
    </ScrollView>

    <Modal visible={contextModal} transparent animationType="fade" onRequestClose={() => setContextModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Contexte de saisie</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.6, lineHeight: 14, marginBottom: 9 }}>
          Choisis seulement ce que tu connais. METRA reprend ensuite ce contexte dans les nouvelles données sans le redemander.
        </Text>
        <TextInput
          style={[styles.input, missionStyles.input]}
          value={contextQuery}
          onChangeText={setContextQuery}
          placeholder="Rechercher local, chaudière, pompe, CTA, UE, UI…"
        />
        <ScrollView style={{ maxHeight: 390, marginTop: 8 }}>
          <TouchableOpacity onPress={() => { clearTechnicalContext(); setContextModal(false); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 10.5, fontWeight: '900' }}>Site entier · {visit.site_name || 'Site'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>Aucun local / équipement imposé</Text>
          </TouchableOpacity>

          {filteredContextLocations.length ? <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 10 }]}>Locaux / zones</Text> : null}
          {filteredContextLocations.map((location) => <TouchableOpacity
            key={location.id}
            onPress={() => selectLocationContext(location.id)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine, backgroundColor: contextLocationId === location.id ? MISSION_COLORS.accentSoft : 'transparent' }}
          >
            <Text style={{ color: COLORS.ink, fontSize: 10.1, fontWeight: contextLocationId === location.id ? '900' : '700' }}>{location.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 2 }}>{location.kind || 'localisation'}</Text>
          </TouchableOpacity>)}

          {filteredContextEquipment.length ? <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 10 }]}>Équipements {contextLocationId ? 'du local sélectionné' : 'du site'}</Text> : null}
          {filteredContextEquipment.map((equipment) => <TouchableOpacity
            key={equipment.id}
            onPress={() => selectEquipmentContext(equipment.id)}
            style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine, backgroundColor: contextEquipmentId === equipment.id ? MISSION_COLORS.accentSoft : 'transparent' }}
          >
            <Text style={{ color: COLORS.ink, fontSize: 10.1, fontWeight: contextEquipmentId === equipment.id ? '900' : '700' }}>
              {[equipment.type,equipment.brand,equipment.model].filter(Boolean).join(' · ') || 'Équipement'}
            </Text>
          </TouchableOpacity>)}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={clearTechnicalContext}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Réinitialiser</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => { setContextModal(false); setContextQuery(''); }}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Utiliser ce contexte</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={checklistModal} transparent animationType="fade" onRequestClose={() => setChecklistModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Avant de quitter le site</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10, lineHeight: 14, marginBottom: 10 }}>
          METRA a détecté quelques points à vérifier. Cette liste est informative : elle ne bloque jamais la fin de visite.
        </Text>
        <ScrollView style={{ maxHeight: 340 }}>
          {checklist.map((item) => <View key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine, paddingVertical: 9 }}>
            <TouchableOpacity onPress={() => openChecklistItem(item)} activeOpacity={0.78}>
              <Text style={{ color: item.severity === 'warning' ? '#8A5B14' : MISSION_COLORS.accentStrong, fontSize: 10.5, fontWeight: '900' }}>{item.label}</Text>
              {item.message ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 3 }}>{item.message}</Text> : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => ignoreChecklistItem(item)} style={{ alignSelf: 'flex-start', marginTop: 6, paddingVertical: 3 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, fontWeight: '800' }}>Ignorer pour cette fin de visite</Text>
            </TouchableOpacity>
          </View>)}
          {!checklist.length ? <Text style={{ color: COLORS.inkSoft, fontSize: 10, lineHeight: 14, paddingVertical: 12 }}>Tous les points de vigilance ont été traités ou ignorés. Tu peux terminer la visite.</Text> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setChecklistModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Revenir à la visite</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={reallyComplete}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Terminer quand même</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={measureModal} transparent animationType="fade" onRequestClose={() => setMeasureModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Ajouter une mesure</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10, lineHeight: 14, marginBottom: 10 }}>
          Le contexte Mission / site / visite est repris automatiquement. La référence est facultative et sert à calculer l'écart.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} value={measureType} onChangeText={setMeasureType} placeholder="Type : température départ, débit, pression…" />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={measureValue} onChangeText={setMeasureValue} keyboardType="decimal-pad" placeholder="Valeur" />
          <TextInput style={[styles.input, missionStyles.input, { width: 92 }]} value={measureUnit} onChangeText={setMeasureUnit} placeholder="Unité" />
        </View>
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 9 }]} value={measureReference} onChangeText={setMeasureReference} keyboardType="decimal-pad" placeholder="Référence attendue (facultatif)" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setMeasureModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={addMeasure}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={pointModal} transparent animationType="fade" onRequestClose={() => setPointModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>{pointLabel ? 'Point · ' + pointLabel : 'Ajouter un point'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {POINT_TYPES.map(([key, label]) => <TouchableOpacity key={key} onPress={() => setPointType(key)} style={{ borderWidth: 1, borderColor: pointType === key ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: pointType === key ? MISSION_COLORS.accentLight : COLORS.white, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}><Text style={{ color: pointType === key ? MISSION_COLORS.accentDark : COLORS.ink, fontSize: 9.5, fontWeight: '800' }}>{label}</Text></TouchableOpacity>)}
        </View>
        <TextInput style={[styles.input, missionStyles.input]} value={pointLabel} onChangeText={setPointLabel} placeholder="Titre / constat (optionnel)" />
        <View style={{ marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { minHeight: 70, textAlignVertical: 'top', paddingRight: 46 }]} multiline value={pointDescription} onChangeText={setPointDescription} placeholder="Description (optionnelle)" />
          <TouchableOpacity
            onPress={() => dictateText(pointDescription, setPointDescription)}
            disabled={dictationBusy}
            style={{ position: 'absolute', right: 7, top: 7, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}
          ><Text style={{ fontSize: 16 }}>{dictationBusy ? '…' : '🎙'}</Text></TouchableOpacity>
        </View>
        <View style={{ marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { paddingRight: 46 }]} value={pointRequestedAction} onChangeText={setPointRequestedAction} placeholder="Action demandée / suite" />
          <TouchableOpacity
            onPress={() => dictateText(pointRequestedAction, setPointRequestedAction)}
            disabled={dictationBusy}
            style={{ position: 'absolute', right: 7, top: 7, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}
          ><Text style={{ fontSize: 16 }}>{dictationBusy ? '…' : '🎙'}</Text></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={pointResponsible} onChangeText={setPointResponsible} placeholder="Responsable / entreprise" />
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={pointDue} onChangeText={setPointDue} placeholder="Échéance" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={pointPriority} onChangeText={setPointPriority} placeholder="Priorité" />
          <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={pointAllocation} onChangeText={setPointAllocation} placeholder="Imputation / lot" />
          <TextInput style={[styles.input, missionStyles.input, { width: 90 }]} value={pointCost} onChangeText={setPointCost} keyboardType="decimal-pad" placeholder="€ estim." />
        </View>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setPointModal(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={addPoint}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Ajouter</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
