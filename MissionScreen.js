import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { creerPointMission, creerVisiteMission, getMissionDashboard, mettreAJourMission, mettreAJourStatutPoint } from './missionsDb.js';
import { exporterMissionExcel } from './missionExcelExport.js';

const POINT_TYPES = Object.freeze([
  ['reserve', 'Réserve'],
  ['action', 'Action'],
  ['request', 'Demande'],
  ['control', 'Contrôle'],
  ['decision', 'Décision'],
  ['information', 'Information'],
]);

const POINT_STATUS = Object.freeze({
  open: 'Ouvert',
  in_progress: 'En cours',
  waiting: 'En attente',
  to_check: 'À contrôler',
  closed: 'Clôturé',
  no_follow_up: 'Sans suite',
});

function Pill({ active, label, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderRadius: 12, borderWidth: 1, borderColor: active ? COLORS.orange : COLORS.line, backgroundColor: active ? COLORS.orangeLight : COLORS.white, paddingHorizontal: 11, paddingVertical: 8, marginRight: 7, marginBottom: 7 }}><Text style={{ color: active ? COLORS.orangeDark : COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{label}</Text></TouchableOpacity>;
}

function PhaseRail({ phases = [] }) {
  if (!phases.length) return <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucune phase imposée. La Mission reste libre.</Text>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
    {phases.map((phase, index) => <View key={phase.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ minWidth: 96, borderRadius: 12, borderWidth: 1, borderColor: phase.status === 'done' ? '#8AC49A' : COLORS.line, backgroundColor: phase.status === 'done' ? '#EDF8F0' : COLORS.white, paddingHorizontal: 10, paddingVertical: 9 }}>
        <Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 10.5 }} numberOfLines={2}>{phase.label}</Text>
      </View>
      {index < phases.length - 1 ? <Text style={{ marginHorizontal: 5, color: COLORS.inkFaint }}>→</Text> : null}
    </View>)}
  </ScrollView>;
}

export function MissionScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pointModal, setPointModal] = useState(false);
  const [pointType, setPointType] = useState('information');
  const [pointLabel, setPointLabel] = useState('');
  const [pointDescription, setPointDescription] = useState('');
  const [pointDueText, setPointDueText] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    try { setData(await getMissionDashboard(missionId)); }
    finally { setLoading(false); }
  }, [missionId]);

  useEffect(() => { reload(); }, [reload]);

  const openPoints = useMemo(() => (data?.points || []).filter((p) => !['closed', 'no_follow_up'].includes(p.status)), [data?.points]);

  const createVisit = async () => {
    try {
      const visitId = await creerVisiteMission({ missionId, siteId: data?.sites?.[0]?.id || null });
      await mettreAJourMission(missionId, { status: 'active' });
      await reload();
      navigation.navigate('MissionVisit', { missionId, visitId });
    } catch (e) { Alert.alert('Visite non créée', String(e.message || e)); }
  };

  const createPoint = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await creerPointMission({ missionId, siteId: data?.sites?.[0]?.id || null, type: pointType, label: pointLabel, description: pointDescription, dueText: pointDueText });
      setPointModal(false);
      setPointLabel('');
      setPointDescription('');
      setPointDueText('');
      setPointType('information');
      await reload();
    } catch (e) { Alert.alert('Point non créé', String(e.message || e)); }
    finally { setSaving(false); }
  };

  const closePoint = async (point) => {
    try {
      await mettreAJourStatutPoint(point.id, 'closed', { comment: 'Clôture depuis la fiche Mission' });
      await reload();
    } catch (e) { Alert.alert('Point non modifié', String(e.message || e)); }
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exporterMissionExcel(missionId);
      Alert.alert('Export Mission créé', `${result.name}\n\nLes données sont structurées par feuilles et les médias restent référencés séparément.`);
    } catch (e) { Alert.alert('Export impossible', String(e.message || e)); }
    finally { setExporting(false); }
  };

  if (loading && !data) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}><ActivityIndicator color={COLORS.orange} /></View>;
  if (!data?.mission) return <View style={styles.center}><Text style={styles.errorTitle}>Mission introuvable</Text></View>;

  const { mission, sites, phases, visits, points, documents } = data;
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={{ backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 16 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 20 }}>{mission.label || 'Mission sans titre'}</Text>
          <Text style={{ color: COLORS.inkSoft, marginTop: 4, fontSize: 11.5 }}>{[mission.client_name, sites?.[0]?.name].filter(Boolean).join(' · ') || 'Contexte à compléter'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
            <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{visits.length} visite(s)</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{openPoints.length} point(s) ouvert(s)</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{documents.length} document(s)</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Frise de la Mission</Text>
        <PhaseRail phases={phases} />

        <View style={{ marginTop: 16, backgroundColor: '#F4F7F9', borderRadius: 14, padding: 13 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 12 }}>Saisie non bloquante</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginTop: 4 }}>Pendant une visite, tu peux laisser n’importe quelle rubrique vide, quitter l’application et reprendre plus tard. La progression est informative uniquement.</Text>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Aujourd’hui</Text>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 1, alignItems: 'center' }]} onPress={createVisit}><Text style={styles.btnPrimaryText}>Démarrer une visite</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { flex: 1, alignItems: 'center' }]} onPress={() => setPointModal(true)}><Text style={styles.btnSecondaryText}>＋ Point libre</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 9, alignItems: 'center' }]} disabled={exporting} onPress={exportExcel}>
          <Text style={styles.btnSecondaryText}>{exporting ? 'Export Excel…' : '⇩ Exporter toutes les données en Excel'}</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Points à suivre</Text>
        {points.length ? points.map((point) => (
          <View key={point.id} style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 13, marginBottom: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 12.5 }}>{point.label || point.description || 'Point sans titre'}</Text>
                <Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 4 }}>{POINT_STATUS[point.status] || point.status} · {point.type || 'information'}{point.due_text ? ` · ${point.due_text}` : ''}</Text>
              </View>
              {!['closed', 'no_follow_up'].includes(point.status) ? <TouchableOpacity onPress={() => closePoint(point)} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: '#EDF8F0' }}><Text style={{ color: '#246B38', fontSize: 9.5, fontWeight: '900' }}>Clôturer</Text></TouchableOpacity> : null}
            </View>
          </View>
        )) : <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucun point. Tu peux en ajouter à tout moment, même s’il n’était pas prévu dans la trame.</Text>}

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Visites</Text>
        {visits.length ? visits.map((visit) => <TouchableOpacity key={visit.id} onPress={() => navigation.navigate('MissionVisit', { missionId, visitId: visit.id })} style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 12, marginBottom: 8 }}><Text style={{ color: COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{visit.visit_date || 'Date à préciser'} · {visit.visit_type || 'Visite'}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginTop: 3 }}>{visit.status === 'draft' ? 'Brouillon — reprise possible' : visit.status}</Text></TouchableOpacity>) : <Text style={{ color: COLORS.inkFaint, fontSize: 10.5 }}>Aucune visite créée.</Text>}
      </ScrollView>

      <Modal visible={pointModal} transparent animationType="fade" onRequestClose={() => setPointModal(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Nouveau point libre</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, marginBottom: 10 }}>Un point ajouté librement a la même valeur qu’un point proposé par une recette.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 5 }}>
            {POINT_TYPES.map(([key, labelText]) => <Pill key={key} active={pointType === key} label={labelText} onPress={() => setPointType(key)} />)}
          </View>
          <TextInput style={[styles.input, { marginTop: 6 }]} value={pointLabel} onChangeText={setPointLabel} placeholder="Titre / constat (peut rester vide)" />
          <TextInput style={[styles.input, { marginTop: 9, minHeight: 72, textAlignVertical: 'top' }]} multiline value={pointDescription} onChangeText={setPointDescription} placeholder="Description libre" />
          <TextInput style={[styles.input, { marginTop: 9 }]} value={pointDueText} onChangeText={setPointDueText} placeholder="Échéance libre : fin octobre, prochaine visite…" />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setPointModal(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={createPoint}><Text style={styles.btnPrimaryText}>{saving ? 'Ajout…' : 'Ajouter'}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
