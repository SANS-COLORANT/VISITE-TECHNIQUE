import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  ajouterConstatMission,
  creerActionMission,
  creerDecisionMission,
  creerOuTrouverActeurMission,
  creerSujetMission,
} from './missionDomainDb.js';

const SUBJECT_STATUS = [
  ['open','Ouvert'],
  ['in_progress','En cours'],
  ['waiting','En attente'],
  ['closed','Clos'],
];

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontWeight: '900' }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, multiline = false, placeholder = '' }) {
  return <View style={{ marginBottom: 8 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontWeight: '900', marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput
      style={[styles.input, missionStyles.input, multiline ? { minHeight: 72, textAlignVertical: 'top' } : null]}
      value={String(value ?? '')}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholder={placeholder}
    />
  </View>;
}

export function MissionSubjectsScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [subjects, setSubjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [newVisible, setNewVisible] = useState(false);
  const [eventVisible, setEventVisible] = useState(false);
  const [eventKind, setEventKind] = useState('observation');
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(false);

  const [subjectDraft, setSubjectDraft] = useState({
    label: '',
    description: '',
    siteId: '',
    priority: '',
  });
  const [eventDraft, setEventDraft] = useState({
    label: '',
    description: '',
    responsible: '',
    due: '',
    priority: '',
  });

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [rows, siteRows] = await Promise.all([
      db.getAllAsync(
        `SELECT s.*,site.name AS site_name,
          (SELECT COUNT(*) FROM mission_observations o WHERE o.subject_id=s.id) AS observations_count,
          (SELECT COUNT(*) FROM mission_decisions d WHERE d.subject_id=s.id) AS decisions_count,
          (SELECT COUNT(*) FROM mission_actions a WHERE a.subject_id=s.id AND a.status NOT IN ('closed','cancelled')) AS open_actions_count
         FROM mission_subjects s
         LEFT JOIN mission_sites site ON site.id=s.site_id
         WHERE s.mission_id=?
         ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
           s.updated_at DESC,s.created_at DESC`,
        [missionId]
      ),
      db.getAllAsync(
        'SELECT s.* FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name',
        [missionId]
      ),
    ]);
    setSubjects(rows || []);
    setSites(siteRows || []);

    const targetId = selectedId || rows?.[0]?.id || null;
    if (!selectedId && targetId) setSelectedId(targetId);
  }, [missionId, selectedId]);

  const loadTimeline = useCallback(async () => {
    if (!selectedId) {
      setTimeline([]);
      return;
    }
    const db = await getDb();
    const [observations, decisions, actions] = await Promise.all([
      db.getAllAsync(
        `SELECT id,'observation' AS event_kind,kind AS event_type,content AS title,NULL AS description,
          COALESCE(observed_at,created_at) AS event_date,NULL AS status
         FROM mission_observations WHERE mission_id=? AND subject_id=?`,
        [missionId, selectedId]
      ),
      db.getAllAsync(
        `SELECT id,'decision' AS event_kind,NULL AS event_type,label AS title,description,
          COALESCE(decided_at,created_at) AS event_date,status
         FROM mission_decisions WHERE mission_id=? AND subject_id=?`,
        [missionId, selectedId]
      ),
      db.getAllAsync(
        `SELECT a.id,'action' AS event_kind,NULL AS event_type,a.label AS title,a.description,
          a.created_at AS event_date,a.status,
          actor.company AS responsible_company,actor.name AS responsible_name,a.due_date,a.due_text,a.priority
         FROM mission_actions a
         LEFT JOIN mission_actors actor ON actor.id=a.responsible_actor_id
         WHERE a.mission_id=? AND a.subject_id=?`,
        [missionId, selectedId]
      ),
    ]);
    setTimeline(
      [...observations, ...decisions, ...actions]
        .sort((a,b) => String(a.event_date || '').localeCompare(String(b.event_date || '')))
    );
  }, [missionId, selectedId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const selected = useMemo(() => subjects.find((row) => row.id === selectedId) || null, [subjects, selectedId]);
  const visibleSubjects = useMemo(() => {
    if (filter === 'all') return subjects;
    if (filter === 'closed') return subjects.filter((row) => row.status === 'closed');
    return subjects.filter((row) => row.status !== 'closed');
  }, [subjects, filter]);

  const openNew = () => {
    setSubjectDraft({
      label: '',
      description: '',
      siteId: sites?.[0]?.id || '',
      priority: '',
    });
    setNewVisible(true);
  };

  const saveSubject = async () => {
    if (!subjectDraft.label.trim() || busy) return;
    setBusy(true);
    try {
      const id = await creerSujetMission({
        missionId,
        siteId: subjectDraft.siteId || null,
        label: subjectDraft.label,
        description: subjectDraft.description,
        priority: subjectDraft.priority,
      });
      setNewVisible(false);
      setSelectedId(id);
      await load();
    } catch (e) {
      Alert.alert('Sujet non créé', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const setSubjectStatus = async (status) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `UPDATE mission_subjects SET
          status=?,
          closed_at=CASE WHEN ?='closed' THEN datetime('now') ELSE NULL END,
          updated_at=datetime('now')
         WHERE id=? AND mission_id=?`,
        [status,status,selected.id,missionId]
      );
      await load();
    } catch (e) {
      Alert.alert('Statut non enregistré', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const openEvent = (kind) => {
    setEventKind(kind);
    setEventDraft({ label: '', description: '', responsible: '', due: '', priority: '' });
    setEventVisible(true);
  };

  const saveEvent = async () => {
    if (!selected || !eventDraft.label.trim() || busy) return;
    setBusy(true);
    try {
      if (eventKind === 'observation') {
        await ajouterConstatMission({
          missionId,
          subjectId: selected.id,
          siteId: selected.site_id,
          locationId: selected.location_id,
          content: eventDraft.label,
          sourceType: 'terrain',
          confidence: 'confirmed',
        });
      } else if (eventKind === 'decision') {
        await creerDecisionMission({
          missionId,
          subjectId: selected.id,
          label: eventDraft.label,
          description: eventDraft.description,
        });
      } else if (eventKind === 'action') {
        const responsibleActorId = eventDraft.responsible.trim()
          ? await creerOuTrouverActeurMission({
              missionId,
              siteId: selected.site_id,
              company: eventDraft.responsible,
              role: 'Responsable action',
            })
          : null;
        await creerActionMission({
          missionId,
          subjectId: selected.id,
          siteId: selected.site_id,
          locationId: selected.location_id,
          label: eventDraft.label,
          description: eventDraft.description,
          responsibleActorId,
          dueText: eventDraft.due,
          priority: eventDraft.priority,
        });
      }
      setEventVisible(false);
      await Promise.all([load(), loadTimeline()]);
    } catch (e) {
      Alert.alert('Élément non enregistré', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const closeAction = async (item) => {
    if (item.event_kind !== 'action') return;
    const db = await getDb();
    await db.runAsync(
      "UPDATE mission_actions SET status='closed',progress=100,closed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND mission_id=?",
      [item.id,missionId]
    );
    await Promise.all([load(),loadTimeline()]);
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Sujets · constats · décisions</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Pour le chantier, l’AMO et les suivis ponctuels : un sujet reste vivant d’une visite à l’autre. METRA sépare le constat, la décision et l’action au lieu de recopier l’historique dans chaque compte rendu.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={openNew}>
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Sujet</Text>
        </TouchableOpacity>
        <Chip label="Ouverts" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Clos" selected={filter === 'closed'} onPress={() => setFilter('closed')} />
        <Chip label="Tous" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Sujets</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 118 }}>
        {visibleSubjects.map((row) => <TouchableOpacity
          key={row.id}
          onPress={() => setSelectedId(row.id)}
          style={{
            width: 225,
            marginRight: 8,
            borderWidth: 1,
            borderColor: row.id === selectedId ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
            backgroundColor: row.id === selectedId ? MISSION_COLORS.accentSoft : '#FFFFFF',
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900' }} numberOfLines={2}>{row.label}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 3 }}>{[row.site_name,row.priority,row.status].filter(Boolean).join(' · ')}</Text>
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.1, marginTop: 5 }}>
            {row.observations_count || 0} constat(s) · {row.decisions_count || 0} décision(s) · {row.open_actions_count || 0} action(s) ouverte(s)
          </Text>
        </TouchableOpacity>)}
      </ScrollView>

      {selected ? <>
        <View style={[missionStyles.card, { padding: 12, marginTop: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 12.4, fontWeight: '900' }}>{selected.label}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 3 }}>{[selected.site_name,selected.priority].filter(Boolean).join(' · ') || 'Sujet Mission'}</Text>
              {selected.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.3, lineHeight: 13, marginTop: 5 }}>{selected.description}</Text> : null}
            </View>
            <View style={{ marginLeft: 8 }}>
              {SUBJECT_STATUS.map(([key,label]) => <Chip key={key} label={label} selected={selected.status === key} onPress={() => setSubjectStatus(key)} />)}
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => openEvent('observation')}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Constat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => openEvent('decision')}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Décision</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => openEvent('action')}>
              <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Action</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Historique du sujet</Text>
        {timeline.map((item) => <View key={item.event_kind + ':' + item.id} style={[missionStyles.card, { padding: 10, marginBottom: 7 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, fontWeight: '900', letterSpacing: 0.4 }}>
                {item.event_kind === 'observation' ? 'CONSTAT' : item.event_kind === 'decision' ? 'DÉCISION' : 'ACTION'} · {item.event_date || ''}
              </Text>
              <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800', marginTop: 3 }}>{item.title}</Text>
              {item.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 9, lineHeight: 13, marginTop: 3 }}>{item.description}</Text> : null}
              {item.event_kind === 'action' ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 4 }}>
                {[item.responsible_company || item.responsible_name,item.due_date || item.due_text,item.priority].filter(Boolean).join(' · ')}
              </Text> : null}
            </View>
            {item.event_kind === 'action' && !['closed','cancelled'].includes(item.status) ? <TouchableOpacity onPress={() => closeAction(item)} style={{ marginLeft: 8, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.2, fontWeight: '900' }}>Clôturer</Text>
            </TouchableOpacity> : null}
          </View>
        </View>)}
        {!timeline.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.5 }}>Aucun historique. Ajoute un constat, une décision ou une action.</Text> : null}
      </> : <View style={[missionStyles.card, { padding: 14, marginTop: 12 }]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun sujet dans cette sélection.</Text>
      </View>}
    </ScrollView>

    <Modal visible={newVisible} transparent animationType="fade" onRequestClose={() => setNewVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Nouveau sujet</Text>
        <Field label="Sujet" value={subjectDraft.label} onChangeText={(v) => setSubjectDraft((d) => ({ ...d, label: v }))} placeholder="Signalétique, planning, trappes, stockage, faux-plafond…" />
        <Field label="Description / contexte" value={subjectDraft.description} onChangeText={(v) => setSubjectDraft((d) => ({ ...d, description: v }))} multiline />
        <Field label="Priorité" value={subjectDraft.priority} onChangeText={(v) => setSubjectDraft((d) => ({ ...d, priority: v }))} placeholder="Urgent, à suivre, information…" />
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontWeight: '900', marginBottom: 5 }}>SITE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sites.map((site) => <Chip key={site.id} label={site.name} selected={subjectDraft.siteId === site.id} onPress={() => setSubjectDraft((d) => ({ ...d, siteId: d.siteId === site.id ? '' : site.id }))} />)}
        </View>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setNewVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} disabled={busy} onPress={saveSubject}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{busy ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>

    <Modal visible={eventVisible} transparent animationType="fade" onRequestClose={() => setEventVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>
          {eventKind === 'observation' ? 'Nouveau constat' : eventKind === 'decision' ? 'Nouvelle décision' : 'Nouvelle action'}
        </Text>
        <Field
          label={eventKind === 'observation' ? 'Constat' : eventKind === 'decision' ? 'Décision' : 'Action'}
          value={eventDraft.label}
          onChangeText={(v) => setEventDraft((d) => ({ ...d, label: v }))}
          multiline={eventKind === 'observation'}
        />
        {eventKind !== 'observation' ? <Field label="Précision / commentaire" value={eventDraft.description} onChangeText={(v) => setEventDraft((d) => ({ ...d, description: v }))} multiline /> : null}
        {eventKind === 'action' ? <>
          <Field label="Responsable / entreprise" value={eventDraft.responsible} onChangeText={(v) => setEventDraft((d) => ({ ...d, responsible: v }))} />
          <Field label="Échéance / jalon" value={eventDraft.due} onChangeText={(v) => setEventDraft((d) => ({ ...d, due: v }))} />
          <Field label="Priorité" value={eventDraft.priority} onChangeText={(v) => setEventDraft((d) => ({ ...d, priority: v }))} />
        </> : null}
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setEventVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} disabled={busy} onPress={saveEvent}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>
  </View>;
}
