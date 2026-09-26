import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { creerVisiteMission } from './missionsDb.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { getMissionWorkstreamPresets } from './missionWorkstreamPresets.js';

const PHASE_STATUS = [['planned','Prévue'],['active','Active'],['done','Terminée'],['skipped','Non retenue']];

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontFamily: FONTS.bold }}>{label}</Text>
  </TouchableOpacity>;
}

export function MissionWorkflowScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [phases, setPhases] = useState([]);
  const [workstreams, setWorkstreams] = useState([]);
  const [sites, setSites] = useState([]);
  const [visits, setVisits] = useState([]);
  const [missionType, setMissionType] = useState(null);
  const [preparingWorkstreams, setPreparingWorkstreams] = useState(false);
  const [phaseModal, setPhaseModal] = useState(false);
  const [workstreamModal, setWorkstreamModal] = useState(false);
  const [visitModal, setVisitModal] = useState(false);
  const [phaseDraft, setPhaseDraft] = useState({ label: '', type: '' });
  const [workstreamDraft, setWorkstreamDraft] = useState({ label: '', kind: '', description: '' });
  const [visitDraft, setVisitDraft] = useState({ phaseId: '', siteId: '', visitType: 'terrain', visitDate: '' });

  const load = useCallback(async () => {
    const db = await getDb();
    const [p,w,s,v,m] = await Promise.all([
      db.getAllAsync('SELECT * FROM mission_phases WHERE mission_id=? ORDER BY sort_order,id', [missionId]),
      db.getAllAsync(
        `SELECT w.*,
          (SELECT COUNT(*) FROM mission_subjects sub WHERE sub.workstream_id=w.id) AS subject_count,
          (SELECT COUNT(*) FROM mission_subjects sub WHERE sub.workstream_id=w.id AND sub.status<>'closed') AS open_subject_count
         FROM mission_workstreams w
         WHERE w.mission_id=? ORDER BY w.sort_order,w.id`,
        [missionId]
      ),
      db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
      db.getAllAsync(
        `SELECT v.*,p.label AS phase_label,s.name AS site_name FROM mission_visits v
         LEFT JOIN mission_phases p ON p.id=v.phase_id
         LEFT JOIN mission_sites s ON s.id=v.site_id
         WHERE v.mission_id=? ORDER BY COALESCE(v.visit_date,v.created_at) DESC`,
        [missionId]
      ),
      db.getFirstAsync('SELECT type FROM missions WHERE id=?', [missionId]),
    ]);
    setPhases(p || []);
    setWorkstreams(w || []);
    setSites(s || []);
    setVisits(v || []);
    setMissionType(m?.type || null);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const recommendedWorkstreams = React.useMemo(
    () => getMissionWorkstreamPresets(missionType),
    [missionType]
  );

  const addPhase = async () => {
    if (!phaseDraft.label.trim()) return;
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO mission_phases(id,mission_id,type,label,status,sort_order) VALUES(?,?,?,?,?,?)',
      [createId('mph'), missionId, phaseDraft.type || null, phaseDraft.label.trim(), 'planned', phases.length]
    );
    setPhaseModal(false);
    setPhaseDraft({ label: '', type: '' });
    await load();
  };

  const setPhaseStatus = async (phase, status) => {
    const db = await getDb();
    await db.runAsync(
      "UPDATE mission_phases SET status=?,updated_at=datetime('now'),start_date=CASE WHEN ?='active' AND start_date IS NULL THEN date('now') ELSE start_date END,end_date=CASE WHEN ?='done' THEN date('now') ELSE end_date END WHERE id=?",
      [status, status, status, phase.id]
    );
    await load();
  };

  const movePhase = async (phase, delta) => {
    const index = phases.findIndex((p) => p.id === phase.id);
    const other = phases[index + delta];
    if (!other) return;
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE mission_phases SET sort_order=?,updated_at=datetime('now') WHERE id=?", [other.sort_order, phase.id]);
      await db.runAsync("UPDATE mission_phases SET sort_order=?,updated_at=datetime('now') WHERE id=?", [phase.sort_order, other.id]);
    });
    await load();
  };

  const prepareRecommendedWorkstreams = async () => {
    if (!recommendedWorkstreams.length || preparingWorkstreams) return;
    setPreparingWorkstreams(true);
    try {
      const db = await getDb();
      const existing = new Set(workstreams.map((row) => String(row.label || '').trim().toLowerCase()));
      let added = 0;
      await db.withTransactionAsync(async () => {
        for (const preset of recommendedWorkstreams) {
          const key = String(preset.label || '').trim().toLowerCase();
          if (!key || existing.has(key)) continue;
          const nextOrder = workstreams.length + added;
          await db.runAsync(
            'INSERT INTO mission_workstreams(id,mission_id,kind,label,status,sort_order,description) VALUES(?,?,?,?,?,?,?)',
            [createId('mw'), missionId, preset.kind || null, preset.label, 'active', nextOrder, preset.description || null]
          );
          existing.add(key);
          added += 1;
        }
      });
      await load();
      Alert.alert(
        added ? 'Volets préparés' : 'Volets déjà disponibles',
        added
          ? String(added) + ' volet(s) ajoutés. Ils restent entièrement modifiables.'
          : 'Aucun doublon créé.'
      );
    } catch (e) {
      Alert.alert('Préparation impossible', String(e?.message || e));
    } finally {
      setPreparingWorkstreams(false);
    }
  };

  const addWorkstream = async () => {
    if (!workstreamDraft.label.trim()) return;
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO mission_workstreams(id,mission_id,kind,label,description,sort_order) VALUES(?,?,?,?,?,?)',
      [createId('mw'), missionId, workstreamDraft.kind || null, workstreamDraft.label.trim(), workstreamDraft.description || null, workstreams.length]
    );
    setWorkstreamModal(false);
    setWorkstreamDraft({ label: '', kind: '', description: '' });
    await load();
  };

  const createVisit = async () => {
    const id = await creerVisiteMission({
      missionId,
      phaseId: visitDraft.phaseId || null,
      siteId: visitDraft.siteId || null,
      visitType: visitDraft.visitType || 'terrain',
      visitDate: visitDraft.visitDate || null,
    });
    setVisitModal(false);
    setVisitDraft({ phaseId: '', siteId: '', visitType: 'terrain', visitDate: '' });
    await load();
    navigation.navigate('MissionVisit', { missionId, visitId: id });
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Workflow de la Mission</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Une même Mission peut évoluer du diagnostic à l’étude, au chantier puis à la réception sans perdre l’état initial. Les volets permettent aussi de gérer un dossier pluriannuel.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setVisitModal(true)}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Occurrence / visite</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setPhaseModal(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Phase</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setWorkstreamModal(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Volet</Text></TouchableOpacity>
        {recommendedWorkstreams.length ? <TouchableOpacity
          style={[styles.btnSecondary, missionStyles.secondaryButton]}
          disabled={preparingWorkstreams}
          onPress={prepareRecommendedWorkstreams}
        >
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
            {preparingWorkstreams ? 'Préparation…' : 'Préparer les volets métier'}
          </Text>
        </TouchableOpacity> : null}
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Phases</Text>
      {phases.map((phase, index) => <View key={phase.id} style={[missionStyles.card, { padding: 11, marginBottom: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11.3, fontFamily: FONTS.black }}>{phase.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 2 }}>{phase.type || 'Phase'} · {phase.status}</Text>
          </View>
          <TouchableOpacity onPress={() => movePhase(phase,-1)} disabled={index===0} style={{ padding: 6 }}><Text style={{ color: index===0 ? COLORS.inkFaint : COLORS.inkSoft }}>↑</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => movePhase(phase,1)} disabled={index===phases.length-1} style={{ padding: 6 }}><Text style={{ color: index===phases.length-1 ? COLORS.inkFaint : COLORS.inkSoft }}>↓</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 7 }}>
          {PHASE_STATUS.map(([key,label]) => <Chip key={key} label={label} selected={phase.status===key} onPress={() => setPhaseStatus(phase,key)} />)}
        </ScrollView>
      </View>)}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Volets / axes</Text>
      {workstreams.length ? workstreams.map((w) => <View key={w.id} style={[missionStyles.card,{padding:11,marginBottom:7}]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.8, fontWeight:'900' }}>{w.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop:2 }}>{w.kind || 'Volet'} · {w.status}</Text>
          </View>
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.3, fontFamily: FONTS.black }}>
            {w.open_subject_count || 0} ouvert(s) / {w.subject_count || 0} sujet(s)
          </Text>
        </View>
        {w.description ? <Text style={{ color: COLORS.inkSoft, fontSize:9.2, marginTop:4 }}>{w.description}</Text> : null}
      </View>) : <Text style={{ color: COLORS.inkFaint, fontSize:9.5 }}>Aucun volet. Utile pour une AMO pluriannuelle : exploitation, énergie, P3, PPI, réunions, réception…</Text>}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Occurrences / visites</Text>
      {visits.map((v) => <TouchableOpacity key={v.id} onPress={() => navigation.navigate('MissionVisit',{missionId,visitId:v.id})} style={[missionStyles.card,{padding:11,marginBottom:7}]}>
        <Text style={{ color: COLORS.ink, fontSize:10.8,fontWeight:'900' }}>{v.visit_date || 'Date à préciser'} · {v.visit_type || 'Visite'}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize:8.7,marginTop:2 }}>{[v.phase_label,v.site_name,v.status].filter(Boolean).join(' · ')}</Text>
      </TouchableOpacity>)}
    </ScrollView>

    <Modal visible={phaseModal} transparent animationType="fade" onRequestClose={() => setPhaseModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Nouvelle phase</Text>
        <TextInput style={[styles.input,missionStyles.input]} value={phaseDraft.label} onChangeText={(v)=>setPhaseDraft((p)=>({...p,label:v}))} placeholder="DIA, AVP, PRO/DCE, DET, OPR…" />
        <TextInput style={[styles.input,missionStyles.input,{marginTop:8}]} value={phaseDraft.type} onChangeText={(v)=>setPhaseDraft((p)=>({...p,type:v}))} placeholder="Type interne (facultatif)" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setPhaseModal(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} onPress={addPhase}><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={workstreamModal} transparent animationType="fade" onRequestClose={() => setWorkstreamModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Nouveau volet</Text>
        <TextInput style={[styles.input,missionStyles.input]} value={workstreamDraft.label} onChangeText={(v)=>setWorkstreamDraft((p)=>({...p,label:v}))} placeholder="Exploitation, Énergie, P3, PPI…" />
        <TextInput style={[styles.input,missionStyles.input,{marginTop:8}]} value={workstreamDraft.kind} onChangeText={(v)=>setWorkstreamDraft((p)=>({...p,kind:v}))} placeholder="Type" />
        <TextInput style={[styles.input,missionStyles.input,{marginTop:8,minHeight:70,textAlignVertical:'top'}]} multiline value={workstreamDraft.description} onChangeText={(v)=>setWorkstreamDraft((p)=>({...p,description:v}))} placeholder="Périmètre du volet" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setWorkstreamModal(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} onPress={addWorkstream}><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={visitModal} transparent animationType="fade" onRequestClose={() => setVisitModal(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet,missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Nouvelle occurrence / visite</Text>
        <Text style={{ color:COLORS.inkFaint,fontSize:8.5,fontWeight:'800',marginBottom:4 }}>PHASE</Text>
        <View style={{ flexDirection:'row',flexWrap:'wrap',marginBottom:7 }}>{phases.map((p)=><Chip key={p.id} label={p.label} selected={visitDraft.phaseId===p.id} onPress={()=>setVisitDraft((v)=>({...v,phaseId:v.phaseId===p.id?'':p.id}))}/>)}</View>
        <Text style={{ color:COLORS.inkFaint,fontSize:8.5,fontWeight:'800',marginBottom:4 }}>SITE</Text>
        <View style={{ flexDirection:'row',flexWrap:'wrap',marginBottom:7 }}>{sites.map((s)=><Chip key={s.id} label={s.name} selected={visitDraft.siteId===s.id} onPress={()=>setVisitDraft((v)=>({...v,siteId:v.siteId===s.id?'':s.id}))}/>)}</View>
        <TextInput style={[styles.input,missionStyles.input]} value={visitDraft.visitType} onChangeText={(v)=>setVisitDraft((p)=>({...p,visitType:v}))} placeholder="Type : terrain, réunion, OPR, mesures…" />
        <TextInput style={[styles.input,missionStyles.input,{marginTop:8}]} value={visitDraft.visitDate} onChangeText={(v)=>setVisitDraft((p)=>({...p,visitDate:v}))} placeholder="Date AAAA-MM-JJ (vide = aujourd’hui)" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setVisitModal(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} onPress={createVisit}><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer & ouvrir</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
