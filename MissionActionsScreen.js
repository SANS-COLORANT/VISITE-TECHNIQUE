import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { creerOuTrouverActeurMission } from './missionDomainDb.js';

const STATUSES = [['open','Ouverte'],['in_progress','En cours'],['waiting','En attente'],['to_check','À contrôler'],['closed','Clôturée'],['cancelled','Annulée']];

function clean(v) { const s = String(v ?? '').trim(); return s || null; }
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', multiline = false }) {
  return <View style={{ marginBottom: 8 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, fontWeight: '800', marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput style={[styles.input, missionStyles.input, multiline ? { minHeight: 70, textAlignVertical: 'top' } : null]} value={String(value ?? '')} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} />
  </View>;
}

export function MissionActionsScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [actions, setActions] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState('open');
  const [editVisible, setEditVisible] = useState(false);
  const [draft, setDraft] = useState({});
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    const db = await getDb();
    const [a, s] = await Promise.all([
      db.getAllAsync(
        `SELECT a.*,s.name AS site_name,ac.company AS responsible_company,ac.name AS responsible_name,p.label AS source_point_label
         FROM mission_actions a
         LEFT JOIN mission_sites s ON s.id=a.site_id
         LEFT JOIN mission_actors ac ON ac.id=a.responsible_actor_id
         LEFT JOIN mission_points p ON p.id=a.source_point_id
         WHERE a.mission_id=? ORDER BY CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,COALESCE(a.due_date,'9999-12-31'),a.created_at DESC`,
        [missionId]
      ),
      db.getAllAsync('SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name', [missionId]),
    ]);
    setActions(a || []);
    setSites(s || []);
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return actions;
    if (filter === 'closed') return actions.filter((a) => ['closed','cancelled'].includes(a.status));
    return actions.filter((a) => !['closed','cancelled'].includes(a.status));
  }, [actions, filter]);

  const openNew = () => {
    setEditingId(null);
    setDraft({
      siteId: sites?.[0]?.id || '',
      label: '',
      description: '',
      status: 'open',
      priority: '',
      responsible: '',
      dueDate: '',
      dueText: '',
      cost: '',
      allocation: '',
      progress: '',
    });
    setEditVisible(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setDraft({
      siteId: a.site_id || '',
      label: a.label || '',
      description: a.description || '',
      status: a.status || 'open',
      priority: a.priority || '',
      responsible: a.responsible_company || a.responsible_name || '',
      dueDate: a.due_date || '',
      dueText: a.due_text || '',
      cost: a.cost_estimate === null || a.cost_estimate === undefined ? '' : String(a.cost_estimate),
      allocation: a.allocation || '',
      progress: a.progress === null || a.progress === undefined ? '' : String(a.progress),
    });
    setEditVisible(true);
  };

  const save = async () => {
    if (!draft.label?.trim()) {
      Alert.alert('À compléter', 'Indique au minimum l’action à réaliser.');
      return;
    }
    const db = await getDb();
    const actorId = draft.responsible?.trim()
      ? await creerOuTrouverActeurMission({ missionId, siteId: draft.siteId || null, company: draft.responsible.trim(), role: 'Responsable action' })
      : null;
    if (editingId) {
      await db.runAsync(
        `UPDATE mission_actions SET site_id=?,label=?,description=?,status=?,priority=?,responsible_actor_id=?,due_date=?,due_text=?,cost_estimate=?,allocation=?,progress=?,closed_at=?,updated_at=datetime('now') WHERE id=?`,
        [
          clean(draft.siteId), draft.label.trim(), clean(draft.description), draft.status || 'open', clean(draft.priority),
          actorId, clean(draft.dueDate), clean(draft.dueText), num(draft.cost), clean(draft.allocation), num(draft.progress),
          ['closed','cancelled'].includes(draft.status) ? new Date().toISOString() : null, editingId,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO mission_actions(id,mission_id,site_id,label,description,status,priority,responsible_actor_id,due_date,due_text,cost_estimate,allocation,progress)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          createId('mact'), missionId, clean(draft.siteId), draft.label.trim(), clean(draft.description), draft.status || 'open',
          clean(draft.priority), actorId, clean(draft.dueDate), clean(draft.dueText), num(draft.cost), clean(draft.allocation), num(draft.progress),
        ]
      );
    }
    setEditVisible(false);
    await load();
  };

  const totalCost = useMemo(() => visible.reduce((sum, a) => sum + (num(a.cost_estimate) || 0), 0), [visible]);

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Actions · responsables · échéances</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Les actions sont indépendantes du texte du rapport : elles gardent leur responsable, échéance, coût, imputation et historique de statut.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={openNew}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Action</Text></TouchableOpacity>
        <Chip label="Ouvertes" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Clôturées" selected={filter === 'closed'} onPress={() => setFilter('closed')} />
        <Chip label="Toutes" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View style={[missionStyles.statBox, { flex: 1, padding: 10, borderRadius: 11 }]}><Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 15 }}>{visible.length}</Text><Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>actions affichées</Text></View>
        <View style={[missionStyles.statBox, { flex: 1, padding: 10, borderRadius: 11 }]}><Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 15 }}>{totalCost.toLocaleString('fr-FR')} €</Text><Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>coût estimé</Text></View>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Liste</Text>
      {visible.map((a) => <TouchableOpacity key={a.id} onPress={() => openEdit(a)} style={[missionStyles.card, { padding: 12, marginBottom: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 11.2 }}>{a.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 3 }}>{[a.site_name, a.responsible_company || a.responsible_name, a.due_date || a.due_text].filter(Boolean).join(' · ') || 'Contexte à compléter'}</Text>
            {a.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.3, marginTop: 4 }} numberOfLines={2}>{a.description}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: ['closed','cancelled'].includes(a.status) ? COLORS.inkFaint : MISSION_COLORS.accentDark, fontSize: 8.8, fontWeight: '900' }}>{a.status}</Text>
            {a.cost_estimate !== null && a.cost_estimate !== undefined ? <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 4 }}>{Number(a.cost_estimate).toLocaleString('fr-FR')} €</Text> : null}
          </View>
        </View>
        {a.source_point_label ? <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.5, marginTop: 6 }}>Origine : {a.source_point_label}</Text> : null}
      </TouchableOpacity>)}
    </ScrollView>

    <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>{editingId ? 'Modifier l’action' : 'Nouvelle action'}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '800', marginBottom: 4 }}>SITE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 7 }}>
          {sites.map((s) => <Chip key={s.id} label={s.name} selected={draft.siteId === s.id} onPress={() => setDraft((p) => ({ ...p, siteId: s.id }))} />)}
        </View>
        <Field label="Action" value={draft.label} onChangeText={(v) => setDraft((p) => ({ ...p, label: v }))} />
        <Field label="Description" value={draft.description} onChangeText={(v) => setDraft((p) => ({ ...p, description: v }))} multiline />
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, fontWeight: '800', marginBottom: 4 }}>STATUT</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 7 }}>
          {STATUSES.map(([key,label]) => <Chip key={key} label={label} selected={draft.status === key} onPress={() => setDraft((p) => ({ ...p, status: key }))} />)}
        </View>
        <Field label="Responsable / entreprise" value={draft.responsible} onChangeText={(v) => setDraft((p) => ({ ...p, responsible: v }))} />
        <Field label="Priorité / criticité" value={draft.priority} onChangeText={(v) => setDraft((p) => ({ ...p, priority: v }))} />
        <Field label="Date échéance AAAA-MM-JJ" value={draft.dueDate} onChangeText={(v) => setDraft((p) => ({ ...p, dueDate: v }))} />
        <Field label="Échéance libre" value={draft.dueText} onChangeText={(v) => setDraft((p) => ({ ...p, dueText: v }))} />
        <Field label="Coût estimé €" value={draft.cost} onChangeText={(v) => setDraft((p) => ({ ...p, cost: v }))} keyboardType="decimal-pad" />
        <Field label="Imputation / lot" value={draft.allocation} onChangeText={(v) => setDraft((p) => ({ ...p, allocation: v }))} />
        <Field label="Progression %" value={draft.progress} onChangeText={(v) => setDraft((p) => ({ ...p, progress: v }))} keyboardType="decimal-pad" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setEditVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={save}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>
  </View>;
}
