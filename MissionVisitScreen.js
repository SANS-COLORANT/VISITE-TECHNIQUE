import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { creerPointMission } from './missionsDb.js';
import { getMissionVisitRecipe } from './missionRecipes.js';
import { ajouterNoteVisiteMission, chargerVisiteMission, compterSaisieVisiteMission, enregistrerValeurTrameMission, mettreAJourVisiteMission } from './missionVisitDb.js';

const POINT_TYPES = [
  ['reserve', 'Réserve'], ['action', 'Action'], ['request', 'Demande'], ['control', 'Contrôle'], ['decision', 'Décision'], ['information', 'Information'],
];

function ChoiceField({ field, value, onChange }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
    {(field.options || []).map((option) => {
      const selected = value === option;
      return <TouchableOpacity key={option} onPress={() => onChange(selected ? '' : option)} style={{ borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orangeLight : COLORS.white, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, marginRight: 7, marginBottom: 7 }}><Text style={{ color: selected ? COLORS.orangeDark : COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{option}</Text></TouchableOpacity>;
    })}
  </View>;
}

function OptionalField({ sectionKey, field, value, onChange, onSave }) {
  return <View style={{ marginBottom: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
      <Text style={{ flex: 1, color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{field.label}</Text>
      <Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>OPTIONNEL</Text>
    </View>
    {field.type === 'choice'
      ? <ChoiceField field={field} value={value || ''} onChange={(next) => { onChange(next); onSave(next); }} />
      : <TextInput
          value={value || ''}
          onChangeText={onChange}
          onBlur={() => onSave(value || '')}
          multiline
          placeholder="Laisser vide si non renseigné"
          placeholderTextColor={COLORS.inkFaint}
          style={[styles.input, { minHeight: 62, textAlignVertical: 'top', backgroundColor: COLORS.white }]}
        />}
  </View>;
}

export function MissionVisitScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const visitId = route?.params?.visitId;
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [pointModal, setPointModal] = useState(false);
  const [pointType, setPointType] = useState('information');
  const [pointLabel, setPointLabel] = useState('');
  const [pointDescription, setPointDescription] = useState('');

  const reload = useCallback(async () => {
    if (!visitId) return;
    setLoading(true);
    try {
      const next = await chargerVisiteMission(visitId);
      setData(next);
      const map = {};
      for (const row of next?.values || []) map[row.field_code] = row.value_text ?? row.value_number ?? row.value_boolean ?? row.value_date ?? '';
      setValues(map);
      setStats(await compterSaisieVisiteMission(visitId));
      if (next?.visit?.status === 'draft') await mettreAJourVisiteMission(visitId, { status: 'in_progress' });
    } finally { setLoading(false); }
  }, [visitId]);

  useEffect(() => { reload(); }, [reload]);

  const recipe = useMemo(() => getMissionVisitRecipe(data?.visit?.family), [data?.visit?.family]);

  const saveField = async (sectionKey, field, value) => {
    if (!data?.visit) return;
    try {
      await enregistrerValeurTrameMission({
        missionId,
        visitId,
        siteId: data.visit.site_id,
        templateId: data.visit.family || 'libre',
        fieldCode: `${sectionKey}.${field.key}`,
        fieldLabel: field.label,
        value,
        valueType: 'text',
      });
      setStats(await compterSaisieVisiteMission(visitId));
    } catch (e) { Alert.alert('Enregistrement impossible', String(e.message || e)); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await ajouterNoteVisiteMission({ missionId, visitId, siteId: data?.visit?.site_id, content: note, visibility: 'internal' });
      setNote('');
      await reload();
    } catch (e) { Alert.alert('Note non enregistrée', String(e.message || e)); }
  };

  const addPoint = async () => {
    try {
      await creerPointMission({
        missionId,
        siteId: data?.visit?.site_id,
        visitId,
        type: pointType,
        label: pointLabel,
        description: pointDescription,
      });
      setPointModal(false);
      setPointLabel('');
      setPointDescription('');
      setPointType('information');
      await reload();
    } catch (e) { Alert.alert('Point non créé', String(e.message || e)); }
  };

  const complete = () => Alert.alert(
    'Terminer cette visite ?',
    'Les rubriques laissées vides resteront vides. METRA ne bloque pas la fin de visite et tu pourras toujours consulter les données saisies.',
    [
      { text: 'Continuer la saisie', style: 'cancel' },
      { text: 'Terminer sans tout remplir', onPress: async () => { await mettreAJourVisiteMission(visitId, { status: 'completed' }); navigation.goBack(); } },
    ]
  );

  if (loading && !data) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}><ActivityIndicator color={COLORS.orange}/></View>;
  if (!data?.visit) return <View style={styles.center}><Text style={styles.errorTitle}>Visite Mission introuvable</Text></View>;

  const visit = data.visit;
  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 14, marginBottom: 14 }}>
        <Text style={{ color: COLORS.ink, fontSize: 17, fontWeight: '900' }}>{visit.mission_label || 'Mission'}</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, marginTop: 4 }}>{[visit.client_name, visit.site_name, visit.visit_date].filter(Boolean).join(' · ')}</Text>
        <Text style={{ color: COLORS.orangeDark, fontSize: 10, fontWeight: '900', marginTop: 9 }}>Aucun champ de cette visite n’est obligatoire.</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 1, backgroundColor: '#F4F7F9', borderRadius: 12, padding: 10 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 15 }}>{stats?.fields_count || 0}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>champs saisis</Text></View>
        <View style={{ flex: 1, backgroundColor: '#F4F7F9', borderRadius: 12, padding: 10 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 15 }}>{stats?.points_count || 0}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>points</Text></View>
        <View style={{ flex: 1, backgroundColor: '#F4F7F9', borderRadius: 12, padding: 10 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 15 }}>{stats?.notes_count || 0}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9 }}>notes</Text></View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1, alignItems: 'center' }]} onPress={() => setPointModal(true)}><Text style={styles.btnSecondaryText}>＋ Point non prévu</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { flex: 1, alignItems: 'center' }]} onPress={complete}><Text style={styles.btnSecondaryText}>Fin de visite</Text></TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Trame proposée · {recipe.label}</Text>
      {!recipe.sections.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 10.5, marginBottom: 16 }}>Mission libre : utilise les Points et Notes, ou complète la Mission plus tard.</Text> : null}
      {recipe.sections.map((section) => <View key={section.key} style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, padding: 14, marginBottom: 12 }}>
        <Text style={{ color: COLORS.ink, fontSize: 13.5, fontWeight: '900', marginBottom: 12 }}>{section.label}</Text>
        {section.fields.map((field) => {
          const code = `${section.key}.${field.key}`;
          return <OptionalField key={field.key} sectionKey={section.key} field={field} value={values[code] || ''} onChange={(next) => setValues((current) => ({ ...current, [code]: next }))} onSave={(next) => saveField(section.key, field, next)} />;
        })}
      </View>)}

      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Note libre</Text>
      <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12 }}>
        <TextInput style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]} multiline value={note} onChangeText={setNote} placeholder="Note terrain / réunion interne…" />
        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 9, alignItems: 'center' }]} onPress={addNote}><Text style={styles.btnSecondaryText}>Ajouter la note</Text></TouchableOpacity>
      </View>

      {(data.points || []).length ? <>
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Points créés pendant cette visite</Text>
        {data.points.map((point) => <View key={point.id} style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 11, marginBottom: 7 }}><Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{point.label || point.description || 'Point sans titre'}</Text><Text style={{ color: COLORS.inkSoft, marginTop: 3, fontSize: 9.5 }}>{point.type} · {point.status}</Text></View>)}
      </> : null}
    </ScrollView>

    <Modal visible={pointModal} transparent animationType="fade" onRequestClose={() => setPointModal(false)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter un point non prévu</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {POINT_TYPES.map(([key, label]) => <TouchableOpacity key={key} onPress={() => setPointType(key)} style={{ borderWidth: 1, borderColor: pointType === key ? COLORS.orange : COLORS.line, backgroundColor: pointType === key ? COLORS.orangeLight : COLORS.white, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}><Text style={{ color: pointType === key ? COLORS.orangeDark : COLORS.ink, fontSize: 9.5, fontWeight: '800' }}>{label}</Text></TouchableOpacity>)}
        </View>
        <TextInput style={styles.input} value={pointLabel} onChangeText={setPointLabel} placeholder="Titre / constat (optionnel)" />
        <TextInput style={[styles.input, { marginTop: 9, minHeight: 70, textAlignVertical: 'top' }]} multiline value={pointDescription} onChangeText={setPointDescription} placeholder="Description (optionnelle)" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setPointModal(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={addPoint}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
