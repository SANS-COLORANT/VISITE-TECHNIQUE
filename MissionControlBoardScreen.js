import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { creerPointMission } from './missionsDb.js';
import { capturerPhotoMission } from './missionMediaDb.js';
import {
  creerActionMission,
  creerReferenceMission,
  enregistrerDetailsPointMission,
} from './missionDomainDb.js';

const RESULTS = Object.freeze([
  ['conforme','Conforme','closed'],
  ['ecart','Écart','open'],
  ['a_recontroler','À recontrôler','waiting'],
  ['non_verifiable','Non vérifiable','to_check'],
  ['non_applicable','Non concerné','no_follow_up'],
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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.7, fontWeight: '900' }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, multiline = false, placeholder = '' }) {
  return <View style={{ marginBottom: 8 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontWeight: '900', marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput
      style={[styles.input,missionStyles.input,multiline ? { minHeight: 72, textAlignVertical: 'top' } : null]}
      value={String(value ?? '')}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholder={placeholder}
    />
  </View>;
}

export function MissionControlBoardScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [controls, setControls] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState('open');
  const [createVisible, setCreateVisible] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [draft, setDraft] = useState({
    label: '',
    description: '',
    siteId: '',
    reference: '',
    source: '',
    requestedAction: '',
  });

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [rows, siteRows] = await Promise.all([
      db.getAllAsync(
        `SELECT p.*,s.name AS site_name,l.label AS location_label,
          e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
          d.reference_id,d.requested_action,
          r.value_text AS reference_text,r.value_number AS reference_number,r.unit AS reference_unit,
          r.source_label AS reference_source,
          (SELECT COUNT(*) FROM mission_photos ph WHERE ph.point_id=p.id) AS photo_count,
          (SELECT COUNT(*) FROM mission_actions a WHERE a.source_point_id=p.id AND a.status NOT IN ('closed','cancelled')) AS open_action_count
         FROM mission_points p
         LEFT JOIN mission_sites s ON s.id=p.site_id
         LEFT JOIN mission_locations l ON l.id=p.location_id
         LEFT JOIN mission_equipment e ON e.id=p.equipment_id
         LEFT JOIN mission_point_details d ON d.point_id=p.id
         LEFT JOIN mission_references r ON r.id=d.reference_id
         WHERE p.mission_id=? AND p.type='control'
         ORDER BY CASE p.status WHEN 'open' THEN 0 WHEN 'waiting' THEN 1 WHEN 'to_check' THEN 2 ELSE 3 END,p.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        'SELECT s.* FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name',
        [missionId]
      ),
    ]);
    setControls(rows || []);
    setSites(siteRows || []);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return controls;
    if (filter === 'closed') return controls.filter((row) => ['closed','no_follow_up'].includes(row.status));
    if (filter === 'recheck') return controls.filter((row) => ['waiting','to_check'].includes(row.status));
    return controls.filter((row) => !['closed','no_follow_up'].includes(row.status));
  }, [controls, filter]);

  const summary = useMemo(() => ({
    total: controls.length,
    conform: controls.filter((row) => row.qualification === 'conforme').length,
    gaps: controls.filter((row) => row.qualification === 'ecart').length,
    recheck: controls.filter((row) => ['a_recontroler','non_verifiable'].includes(row.qualification)).length,
  }), [controls]);

  const openCreate = () => {
    setDraft({
      label: '',
      description: '',
      siteId: sites?.[0]?.id || '',
      reference: '',
      source: '',
      requestedAction: '',
    });
    setCreateVisible(true);
  };

  const createControl = async () => {
    if (!draft.label.trim()) return;
    setBusyId('create');
    try {
      const pointId = await creerPointMission({
        missionId,
        siteId: draft.siteId || null,
        type: 'control',
        label: draft.label,
        description: draft.description,
        status: 'open',
        qualification: 'non_verifiable',
        visibility: 'report',
      });
      let referenceId = null;
      if (draft.reference.trim() || draft.source.trim()) {
        referenceId = await creerReferenceMission({
          missionId,
          siteId: draft.siteId || null,
          pointId,
          measureType: 'exigence_controle',
          valueText: draft.reference,
          sourceType: 'document',
          sourceLabel: draft.source,
        });
      }
      await enregistrerDetailsPointMission({
        pointId,
        requestedAction: draft.requestedAction,
        referenceId,
      });
      setCreateVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Contrôle non créé', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const setResult = async (row, qualification, status) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const db = await getDb();
      const previousStatus = row.status || 'open';
      const now = new Date().toISOString();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE mission_points SET
            qualification=?,status=?,verified_at=?,closed_at=?,updated_at=datetime('now')
           WHERE id=? AND mission_id=?`,
          [
            qualification,status,now,
            ['closed','no_follow_up'].includes(status) ? now : null,
            row.id,missionId,
          ]
        );
        await db.runAsync(
          `INSERT INTO mission_point_history(
            id,point_id,status_before,status_after,comment,source
          ) VALUES(?,?,?,?,?,?)`,
          [
            createId('mph'),
            row.id,
            previousStatus,
            status,
            'Contrôle ciblé · ' + qualification,
            'mission_control_board',
          ]
        );
      });

      if (qualification === 'ecart' && Number(row.open_action_count || 0) === 0) {
        await creerActionMission({
          missionId,
          sourcePointId: row.id,
          siteId: row.site_id,
          locationId: row.location_id,
          equipmentId: row.equipment_id,
          label: row.requested_action || ('Traiter l’écart · ' + (row.label || 'Contrôle')),
          description: row.description,
          priority: row.priority || 'À traiter',
        });
      }
      await load();
    } catch (e) {
      Alert.alert('Résultat non enregistré', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const addProof = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const photo = await capturerPhotoMission({
        missionId,
        siteId: row.site_id,
        pointId: row.id,
        equipmentId: row.equipment_id,
        locationId: row.location_id,
        type: 'control_evidence',
        label: 'Preuve · ' + (row.label || 'Contrôle'),
      });
      if (photo) await load();
    } catch (e) {
      Alert.alert('Photo impossible', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle,missionStyles.title]}>Contrôle ciblé / conformité</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Référence → contrôle → preuve → écart éventuel → action → recontrôle. METRA aide à structurer le constat sans se substituer à un organisme de contrôle ou à une certification réglementaire.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {[
          [summary.total,'contrôles'],
          [summary.conform,'conformes'],
          [summary.gaps,'écarts'],
          [summary.recheck,'à recontrôler'],
        ].map(([value,label]) => <View key={label} style={[missionStyles.statBox,{flex:1,padding:9,borderRadius:11}]}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13.5, fontWeight: '900' }}>{value}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} onPress={openCreate}>
          <Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>＋ Contrôle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionDocuments',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Références / documents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionActions',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Actions correctives</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        <Chip label="Ouverts" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="À recontrôler" selected={filter === 'recheck'} onPress={() => setFilter('recheck')} />
        <Chip label="Soldés" selected={filter === 'closed'} onPress={() => setFilter('closed')} />
        <Chip label="Tous" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </View>

      {visible.map((row) => <View key={row.id} style={[missionStyles.card,{padding:11,marginBottom:8}]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.8, fontWeight: '900' }}>{row.label || 'Contrôle'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 3 }}>
              {[row.site_name,row.location_label,[row.equipment_type,row.equipment_brand,row.equipment_model].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || 'Contexte Mission'}
            </Text>
            {row.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 8.9, lineHeight: 13, marginTop: 4 }}>{row.description}</Text> : null}
          </View>
          <Text style={{ color: ['conforme','non_applicable'].includes(row.qualification) ? MISSION_COLORS.accentDark : '#8A5B14', fontSize: 8.4, fontWeight: '900' }}>
            {RESULTS.find(([key]) => key === row.qualification)?.[1] || 'Non qualifié'}
          </Text>
        </View>

        {(row.reference_text || row.reference_number !== null && row.reference_number !== undefined || row.reference_source) ? <View style={{ borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, padding: 8, marginTop: 7 }}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, fontWeight: '900' }}>RÉFÉRENCE / EXIGENCE</Text>
          <Text style={{ color: COLORS.ink, fontSize: 8.9, lineHeight: 13, marginTop: 2 }}>
            {row.reference_number !== null && row.reference_number !== undefined ? String(row.reference_number) + (row.reference_unit ? ' ' + row.reference_unit : '') : (row.reference_text || '')}
          </Text>
          {row.reference_source ? <Text style={{ color: COLORS.inkFaint, fontSize: 8, marginTop: 2 }}>Source : {row.reference_source}</Text> : null}
        </View> : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {RESULTS.map(([key,label,status]) => <Chip
            key={key}
            label={label}
            selected={row.qualification === key}
            onPress={() => setResult(row,key,status)}
          />)}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 }}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} disabled={busyId === row.id} onPress={() => addProof(row)}>
            <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>📷 Preuve ({row.photo_count || 0})</Text>
          </TouchableOpacity>
          {Number(row.open_action_count || 0) ? <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionActions',{missionId,siteId:row.site_id})}>
            <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>{row.open_action_count} action(s) ouverte(s)</Text>
          </TouchableOpacity> : null}
        </View>
      </View>)}

      {!visible.length ? <View style={[missionStyles.card,{padding:14}]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun contrôle dans cette sélection.</Text>
      </View> : null}
    </ScrollView>

    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet,missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={[styles.modalTitle,missionStyles.title]}>Nouveau contrôle</Text>
        <Field label="Point contrôlé" value={draft.label} onChangeText={(v)=>setDraft((d)=>({...d,label:v}))} placeholder="Ex. Repérage organe, dispositif de sécurité, document attendu…" />
        <Field label="Objet / méthode / constat attendu" value={draft.description} onChangeText={(v)=>setDraft((d)=>({...d,description:v}))} multiline />
        <Field label="Référence / exigence" value={draft.reference} onChangeText={(v)=>setDraft((d)=>({...d,reference:v}))} multiline placeholder="Texte, valeur ou exigence à vérifier." />
        <Field label="Source de la référence" value={draft.source} onChangeText={(v)=>setDraft((d)=>({...d,source:v}))} placeholder="CCTP, document, texte applicable, consigne…" />
        <Field label="Action attendue en cas d’écart" value={draft.requestedAction} onChangeText={(v)=>setDraft((d)=>({...d,requestedAction:v}))} />
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontWeight: '900', marginBottom: 5 }}>SITE (FACULTATIF)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sites.map((site) => <Chip key={site.id} label={site.name} selected={draft.siteId === site.id} onPress={()=>setDraft((d)=>({...d,siteId:d.siteId===site.id?'':site.id}))} />)}
        </View>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={()=>setCreateVisible(false)}><Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busyId === 'create'} onPress={createControl}><Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Créer</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>
  </View>;
}
