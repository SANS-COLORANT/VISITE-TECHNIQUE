import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { choisirEtAjouterDocumentMission } from './missionMediaDb.js';
import {
  accepterItemRevueMission,
  analyserDocumentMission,
  ignorerItemRevueMission,
  listerInboxDocumentsMission,
} from './missionDocumentExtractionDb.js';

const TYPE_LABELS = {
  action: 'Action',
  finding: 'Constat / écart',
  measure: 'Mesure / valeur',
  equipment: 'Équipement',
  document: 'Document / pièce',
  information: 'Information',
};

export function MissionDocumentInboxScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [data, setData] = useState({ documents: [], reviewItems: [] });
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('to_review');

  const load = useCallback(async () => {
    if (!missionId) return;
    setData(await listerInboxDocumentsMission(missionId));
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  const importDoc = async () => {
    try {
      const doc = await choisirEtAjouterDocumentMission({ missionId, type: 'source_mission' });
      if (doc) await load();
    } catch (e) {
      Alert.alert('Import impossible', String(e?.message || e));
    }
  };

  const analyse = async (doc) => {
    if (busyId) return;
    setBusyId(doc.id);
    try {
      const result = await analyserDocumentMission({ missionId, documentId: doc.id });
      await load();
      Alert.alert(
        'Analyse locale terminée',
        String(result.parts || 0) + ' partie(s) analysée(s) · ' + String(result.reviewItems || 0) + ' élément(s) proposés à la revue.\n\nAucune donnée extraite n’est injectée sans validation.'
      );
    } catch (e) {
      Alert.alert('Analyse impossible', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const review = useMemo(() => {
    if (filter === 'all') return data.reviewItems || [];
    return (data.reviewItems || []).filter((item) => item.status === filter);
  }, [data.reviewItems, filter]);

  const accept = async (item) => {
    try {
      const result = await accepterItemRevueMission(item.id);
      await load();
      Alert.alert('Élément intégré', result?.entityType ? 'Créé dans METRA : ' + result.entityType : 'Information intégrée.');
    } catch (e) {
      Alert.alert('Intégration impossible', String(e?.message || e));
    }
  };

  const ignore = async (item) => {
    await ignorerItemRevueMission(item.id);
    await load();
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Inbox documents Mission</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        PDF, DOCX, images et fichiers texte restent conservés comme sources. METRA peut en extraire localement du texte et proposer des éléments à valider avant intégration.
      </Text>

      <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { alignSelf: 'flex-start', marginTop: 12 }]} onPress={importDoc}>
        <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Ajouter un document source</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Sources</Text>
      {(data.documents || []).map((doc) => <View key={doc.id} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.7, fontWeight: '900' }}>{doc.name || 'Document'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 2 }}>{doc.type || 'source'} · {doc.extraction_count || 0} extraction(s) · {doc.review_count || 0} à revoir</Text>
          </View>
          <TouchableOpacity disabled={!!busyId} style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => analyse(doc)}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{busyId === doc.id ? 'Analyse…' : 'Analyser localement'}</Text>
          </TouchableOpacity>
        </View>
      </View>)}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Revue avant import</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 9 }}>
        {[
          ['to_review','À revoir'],
          ['accepted','Acceptés'],
          ['ignored','Ignorés'],
          ['all','Tous'],
        ].map(([key,label]) => <TouchableOpacity key={key} onPress={() => setFilter(key)} style={{ borderWidth: 1, borderColor: filter === key ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: filter === key ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
          <Text style={{ color: filter === key ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{label}</Text>
        </TouchableOpacity>)}
      </View>

      {review.map((item) => <View key={item.id} style={[missionStyles.card, { padding: 11, marginBottom: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 8.8, fontWeight: '900' }}>{TYPE_LABELS[item.item_type] || item.item_type}</Text>
            <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800', marginTop: 3 }}>{item.label || item.value_text || 'Information'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.4, marginTop: 3 }}>{item.document_name || ''}{item.source_ref ? ' · ' + item.source_ref : ''}</Text>
          </View>
          <Text style={{ color: item.status === 'accepted' ? MISSION_COLORS.accentDark : COLORS.inkFaint, fontSize: 8.5, fontWeight: '900' }}>{item.status}</Text>
        </View>
        {item.status === 'to_review' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => ignore(item)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Ignorer</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => accept(item)}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Valider & intégrer</Text></TouchableOpacity>
        </View> : null}
      </View>)}

      {!review.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.5 }}>Aucun élément dans ce filtre.</Text> : null}
    </ScrollView>
  </View>;
}
