import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { ajouterConstatMission, creerHypotheseMission, creerSujetMission } from './missionDomainDb.js';
import { ButtonGlow } from './ButtonGlow.js';

const HYPOTHESIS_STATUS = Object.freeze([
  ['untested', 'À tester'],
  ['under_investigation', 'En investigation'],
  ['supported', 'Étayée'],
  ['rejected', 'Écartée'],
  ['inconclusive', 'Non concluante'],
]);

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity
    onPress={onPress}
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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontFamily: FONTS.black }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, multiline = false, placeholder = '' }) {
  return <View style={{ marginBottom: 8 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontFamily: FONTS.black, marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput
      style={[styles.input, missionStyles.input, multiline ? { minHeight: 76, textAlignVertical: 'top' } : null]}
      value={String(value ?? '')}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholder={placeholder}
    />
  </View>;
}

export function MissionExpertiseScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [observations, setObservations] = useState([]);
  const [hypotheses, setHypotheses] = useState([]);
  const [subjectVisible, setSubjectVisible] = useState(false);
  const [factVisible, setFactVisible] = useState(false);
  const [hypothesisVisible, setHypothesisVisible] = useState(false);
  const [conclusionHypothesis, setConclusionHypothesis] = useState(null);
  const [conclusionDraft, setConclusionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState({ label: '', description: '' });
  const [factDraft, setFactDraft] = useState({ content: '', sourceType: 'terrain', confidence: 'confirmed' });
  const [hypothesisDraft, setHypothesisDraft] = useState({ label: '', rationale: '' });

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [subRows, obsRows, hypRows] = await Promise.all([
      db.getAllAsync(
        `SELECT s.*,site.name AS site_name
         FROM mission_subjects s
         LEFT JOIN mission_sites site ON site.id=s.site_id
         WHERE s.mission_id=? ORDER BY s.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT o.*,s.label AS subject_label,site.name AS site_name
         FROM mission_observations o
         LEFT JOIN mission_subjects s ON s.id=o.subject_id
         LEFT JOIN mission_sites site ON site.id=o.site_id
         WHERE o.mission_id=? ORDER BY COALESCE(o.observed_at,o.created_at),o.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT h.*,s.label AS subject_label,o.content AS source_fact
         FROM mission_hypotheses h
         LEFT JOIN mission_subjects s ON s.id=h.subject_id
         LEFT JOIN mission_observations o ON o.id=h.observation_id
         WHERE h.mission_id=? ORDER BY h.created_at`,
        [missionId]
      ),
    ]);
    setSubjects(subRows || []);
    setObservations(obsRows || []);
    setHypotheses(hypRows || []);
    if (!selectedSubjectId && subRows?.[0]?.id) setSelectedSubjectId(subRows[0].id);
  }, [missionId, selectedSubjectId]);

  React.useEffect(() => { load(); }, [load]);

  const selectedSubject = useMemo(
    () => subjects.find((row) => row.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );
  const facts = useMemo(
    () => observations.filter((row) => !selectedSubjectId || row.subject_id === selectedSubjectId),
    [observations, selectedSubjectId]
  );
  const hypothesesForSubject = useMemo(
    () => hypotheses.filter((row) => !selectedSubjectId || row.subject_id === selectedSubjectId),
    [hypotheses, selectedSubjectId]
  );
  const supported = hypothesesForSubject.filter((row) => row.status === 'supported').length;
  const open = hypothesesForSubject.filter((row) => !['supported','rejected','inconclusive'].includes(row.status)).length;

  const ensureSubject = async () => {
    if (selectedSubjectId) return selectedSubjectId;
    if (subjects?.[0]?.id) return subjects[0].id;
    const id = await creerSujetMission({
      missionId,
      label: 'Expertise / sinistre',
      description: 'Sujet principal créé par le moteur Expertise.',
      priority: 'Investigation',
    });
    setSelectedSubjectId(id);
    return id;
  };

  const createSubject = async () => {
    if (!subjectDraft.label.trim() || busy) return;
    setBusy(true);
    try {
      const id = await creerSujetMission({
        missionId,
        label: subjectDraft.label,
        description: subjectDraft.description,
        priority: 'Investigation',
      });
      setSelectedSubjectId(id);
      setSubjectVisible(false);
      setSubjectDraft({ label: '', description: '' });
      await load();
    } catch (e) {
      Alert.alert('Sujet non créé', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const createFact = async () => {
    if (!factDraft.content.trim() || busy) return;
    setBusy(true);
    try {
      const subjectId = await ensureSubject();
      await ajouterConstatMission({
        missionId,
        subjectId,
        kind: 'fact',
        content: factDraft.content,
        sourceType: factDraft.sourceType || 'terrain',
        confidence: factDraft.confidence || 'confirmed',
        observedAt: new Date().toISOString(),
      });
      setFactVisible(false);
      setFactDraft({ content: '', sourceType: 'terrain', confidence: 'confirmed' });
      await load();
    } catch (e) {
      Alert.alert('Fait non enregistré', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const createHypothesis = async () => {
    if (!hypothesisDraft.label.trim() || busy) return;
    setBusy(true);
    try {
      const subjectId = await ensureSubject();
      await creerHypotheseMission({
        missionId,
        subjectId,
        label: hypothesisDraft.label,
        rationale: hypothesisDraft.rationale,
        status: 'untested',
      });
      setHypothesisVisible(false);
      setHypothesisDraft({ label: '', rationale: '' });
      await load();
    } catch (e) {
      Alert.alert('Hypothèse non enregistrée', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const setHypothesisStatus = async (row, status) => {
    const db = await getDb();
    await db.runAsync(
      "UPDATE mission_hypotheses SET status=?,updated_at=datetime('now') WHERE id=? AND mission_id=?",
      [status,row.id,missionId]
    );
    await load();
  };

  const openConclusion = (row) => {
    setConclusionHypothesis(row);
    setConclusionDraft(row.conclusion || '');
  };

  const saveConclusion = async () => {
    if (!conclusionHypothesis || busy) return;
    setBusy(true);
    try {
      const db = await getDb();
      await db.runAsync(
        "UPDATE mission_hypotheses SET conclusion=?,updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [String(conclusionDraft || '').trim() || null,conclusionHypothesis.id,missionId]
      );
      setConclusionHypothesis(null);
      setConclusionDraft('');
      await load();
    } catch (e) {
      Alert.alert('Conclusion non enregistrée', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.sectionTitle, missionStyles.title]}>Expertise / sinistre</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        METRA sépare strictement le fait observé, l’hypothèse de travail et la conclusion. Une hypothèse n’est jamais présentée comme un fait tant qu’elle n’est pas étayée.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setFactVisible(true)}><ButtonGlow tone="mission" />
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Fait horodaté</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setHypothesisVisible(true)}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Hypothèse</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setSubjectVisible(true)}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Sujet d’investigation</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {[
          [facts.length,'faits'],
          [hypothesesForSubject.length,'hypothèses'],
          [open,'à investiguer'],
          [supported,'étayées'],
        ].map(([value,label]) => <View key={label} style={[missionStyles.statBox, { flex: 1, padding: 9, borderRadius: 11 }]}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13.5, fontFamily: FONTS.black }}>{value}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 17 }]}>Sujets d’investigation</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 92 }}>
        {subjects.map((row) => <TouchableOpacity
          key={row.id}
          onPress={() => setSelectedSubjectId(row.id)}
          style={{
            width: 205, minHeight: 70, marginRight: 7, padding: 9, borderRadius: 11, borderWidth: 1,
            borderColor: selectedSubjectId === row.id ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
            backgroundColor: selectedSubjectId === row.id ? MISSION_COLORS.accentSoft : '#FFFFFF',
          }}
        >
          <Text style={{ color: COLORS.ink, fontSize: 10, fontFamily: FONTS.black }} numberOfLines={2}>{row.label}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8, marginTop: 3 }}>{[row.site_name,row.status].filter(Boolean).join(' · ') || 'Investigation'}</Text>
        </TouchableOpacity>)}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionMeasurements',{missionId})}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Mesures</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionDocuments',{missionId})}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Documents</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionPhotoAnnotations',{missionId})}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Photos / preuves</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionPlan',{missionId})}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Plan / localisation</Text></TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Chronologie factuelle</Text>
      {facts.map((row,index) => <View key={row.id} style={[missionStyles.card,{padding:10,marginBottom:7}]}>
        <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, fontFamily: FONTS.black }}>FAIT {String(index + 1).padStart(2,'0')} · {row.observed_at || row.created_at || ''}</Text>
        <Text style={{ color: COLORS.ink, fontSize: 9.8, lineHeight: 14, marginTop: 3 }}>{row.content}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8, marginTop: 4 }}>{[row.source_type,row.confidence].filter(Boolean).join(' · ')}</Text>
      </View>)}
      {!facts.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.3 }}>Aucun fait enregistré pour ce sujet.</Text> : null}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Hypothèses & conclusions</Text>
      {hypothesesForSubject.map((row) => <View key={row.id} style={[missionStyles.card,{padding:11,marginBottom:8}]}>
        <Text style={{ color: COLORS.ink, fontSize: 10.3, fontFamily: FONTS.black }}>{row.label}</Text>
        {row.rationale ? <Text style={{ color: COLORS.inkSoft, fontSize: 9, lineHeight: 13, marginTop: 4 }}>{row.rationale}</Text> : null}
        {row.source_fact ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 4 }}>Rattachée au fait : {row.source_fact}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
          {HYPOTHESIS_STATUS.map(([key,label]) => <Chip key={key} label={label} selected={row.status === key} onPress={() => setHypothesisStatus(row,key)} />)}
        </View>
        {row.conclusion ? <View style={{ backgroundColor: MISSION_COLORS.accentSoft, borderRadius: 9, padding: 8, marginTop: 4 }}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, fontFamily: FONTS.black }}>CONCLUSION</Text>
          <Text style={{ color: COLORS.ink, fontSize: 9, lineHeight: 13, marginTop: 3 }}>{row.conclusion}</Text>
        </View> : null}
        <TouchableOpacity onPress={() => openConclusion(row)} style={{ alignSelf: 'flex-start', marginTop: 7 }}>
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.4, fontFamily: FONTS.black }}>{row.conclusion ? 'Modifier la conclusion' : '＋ Conclusion'}</Text>
        </TouchableOpacity>
      </View>)}
      {!hypothesesForSubject.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.3 }}>Aucune hypothèse enregistrée.</Text> : null}

      <View style={[missionStyles.card,{padding:10,marginTop:13,borderColor:'#D7DDD9'}]}>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8, fontFamily: FONTS.black }}>RÈGLE EXPERTISE</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 8.7, lineHeight: 12, marginTop: 3 }}>
          Les faits restent inchangés dans la chronologie. Les hypothèses peuvent évoluer, être écartées ou étayées. La conclusion est enregistrée séparément.
        </Text>
      </View>
    </ScrollView>

    <Modal visible={subjectVisible} transparent animationType="fade" onRequestClose={() => setSubjectVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Sujet d’investigation</Text>
        <Field label="Sujet" value={subjectDraft.label} onChangeText={(v)=>setSubjectDraft((d)=>({...d,label:v}))} placeholder="Ex. Dégradation échangeur, fuite réseau…" />
        <Field label="Contexte" value={subjectDraft.description} onChangeText={(v)=>setSubjectDraft((d)=>({...d,description:v}))} multiline />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setSubjectVisible(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busy} onPress={createSubject}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={factVisible} transparent animationType="fade" onRequestClose={() => setFactVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Fait horodaté</Text>
        <Field label="Fait observé" value={factDraft.content} onChangeText={(v)=>setFactDraft((d)=>({...d,content:v}))} multiline placeholder="Décrire uniquement ce qui est observé / mesuré / documenté." />
        <Field label="Source" value={factDraft.sourceType} onChangeText={(v)=>setFactDraft((d)=>({...d,sourceType:v}))} placeholder="terrain, document, mesure, tiers…" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setFactVisible(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busy} onPress={createFact}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Enregistrer le fait</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={hypothesisVisible} transparent animationType="fade" onRequestClose={() => setHypothesisVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Hypothèse de travail</Text>
        <Field label="Hypothèse" value={hypothesisDraft.label} onChangeText={(v)=>setHypothesisDraft((d)=>({...d,label:v}))} />
        <Field label="Raisonnement / éléments à vérifier" value={hypothesisDraft.rationale} onChangeText={(v)=>setHypothesisDraft((d)=>({...d,rationale:v}))} multiline />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setHypothesisVisible(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busy} onPress={createHypothesis}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer l’hypothèse</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!conclusionHypothesis} transparent animationType="fade" onRequestClose={() => setConclusionHypothesis(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Conclusion de l’hypothèse</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, lineHeight: 13, marginBottom: 8 }}>{conclusionHypothesis?.label || ''}</Text>
        <Field label="Conclusion distincte du fait" value={conclusionDraft} onChangeText={setConclusionDraft} multiline placeholder="Conclusion, résultat des investigations, limites restantes…" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setConclusionHypothesis(null)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busy} onPress={saveConclusion}><ButtonGlow tone="mission" /><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
