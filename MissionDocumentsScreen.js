import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { choisirEtAjouterDocumentMission } from './missionMediaDb.js';
import { creerOuTrouverActeurMission } from './missionDomainDb.js';

const EXPECTED_STATUS = [
  ['expected','Attendu'],
  ['received','Reçu'],
  ['up_to_date','Présent & à jour'],
  ['obsolete','Présent mais obsolète'],
  ['incomplete','Incomplet'],
  ['to_send','À transmettre'],
  ['missing','Introuvable'],
  ['not_existing','Non existant'],
  ['validated','Validé'],
];

const VISA_STATUS = [
  ['to_review','À contrôler'],
  ['validated','Validé'],
  ['validated_with_reservations','Validé avec réserves'],
  ['rejected','Refusé'],
  ['to_revise','À réviser'],
  ['obsolete','Obsolète'],
];

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{label}</Text>
  </TouchableOpacity>;
}

export function MissionDocumentsScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [docs, setDocs] = useState([]);
  const [expected, setExpected] = useState([]);
  const [validations, setValidations] = useState([]);
  const [addExpectedVisible, setAddExpectedVisible] = useState(false);
  const [draft, setDraft] = useState({ label: '', type: '', responsible: '', due: '', comment: '', status: 'expected' });
  const [visaDoc, setVisaDoc] = useState(null);
  const [visaStatus, setVisaStatus] = useState('to_review');
  const [visaComment, setVisaComment] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    const [d,e,v] = await Promise.all([
      db.getAllAsync('SELECT * FROM mission_documents WHERE mission_id=? ORDER BY created_at DESC', [missionId]),
      db.getAllAsync(
        `SELECT ed.*,a.company AS responsible_company,a.name AS responsible_name,d.name AS document_name
         FROM mission_expected_documents ed
         LEFT JOIN mission_actors a ON a.id=ed.responsible_actor_id
         LEFT JOIN mission_documents d ON d.id=ed.document_id
         WHERE ed.mission_id=? ORDER BY ed.created_at DESC`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT v.*,d.name AS document_name,a.company AS reviewer_company,a.name AS reviewer_name
         FROM mission_validations v
         LEFT JOIN mission_documents d ON d.id=v.document_id
         LEFT JOIN mission_actors a ON a.id=v.reviewer_actor_id
         WHERE v.mission_id=? ORDER BY v.created_at DESC`,
        [missionId]
      ),
    ]);
    setDocs(d || []);
    setExpected(e || []);
    setValidations(v || []);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const importDoc = async () => {
    try {
      const doc = await choisirEtAjouterDocumentMission({ missionId, type: 'source_mission' });
      if (doc) {
        await load();
        Alert.alert('Document importé', doc.name || 'Document enregistré hors ligne.');
      }
    } catch (e) { Alert.alert('Import impossible', String(e?.message || e)); }
  };

  const addExpected = async () => {
    if (!draft.label.trim()) return;
    const db = await getDb();
    const actorId = draft.responsible.trim()
      ? await creerOuTrouverActeurMission({ missionId, company: draft.responsible.trim(), role: 'Document attendu' })
      : null;
    await db.runAsync(
      'INSERT INTO mission_expected_documents(id,mission_id,type,label,status,responsible_actor_id,due_text,comment) VALUES(?,?,?,?,?,?,?,?)',
      [createId('medoc'), missionId, draft.type || null, draft.label.trim(), draft.status || 'expected', actorId, draft.due || null, draft.comment || null]
    );
    setAddExpectedVisible(false);
    setDraft({ label: '', type: '', responsible: '', due: '', comment: '', status: 'expected' });
    await load();
  };

  const changeExpectedStatus = async (row, status) => {
    const db = await getDb();
    await db.runAsync("UPDATE mission_expected_documents SET status=?,updated_at=datetime('now') WHERE id=?", [status, row.id]);
    await load();
  };

  const attachDocument = async (row) => {
    try {
      const doc = await choisirEtAjouterDocumentMission({ missionId, type: row.type || 'document_attendu' });
      if (!doc) return;
      const db = await getDb();
      await db.runAsync(
        "UPDATE mission_expected_documents SET document_id=?,status='received',updated_at=datetime('now') WHERE id=?",
        [doc.id, row.id]
      );
      await load();
    } catch (e) { Alert.alert('Document impossible', String(e?.message || e)); }
  };

  const saveVisa = async () => {
    if (!visaDoc) return;
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO mission_validations(id,mission_id,document_id,validation_type,version_label,status,comment,validated_at) VALUES(?,?,?,?,?,?,?,?)',
      [
        createId('mval'), missionId, visaDoc.id, 'visa', null, visaStatus, visaComment || null,
        ['validated','validated_with_reservations'].includes(visaStatus) ? new Date().toISOString() : null,
      ]
    );
    setVisaDoc(null);
    setVisaComment('');
    setVisaStatus('to_review');
    await load();
  };

  const latestVisa = (docId) => validations.find((v) => v.document_id === docId);

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Documents · attendus · VISA</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Le document source reste conservé. METRA distingue présence, mise à jour, document attendu et décision de validation.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={importDoc}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Importer document</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setAddExpectedVisible(true)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Document attendu</Text></TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Documents attendus</Text>
      {expected.map((row) => <View key={row.id} style={[missionStyles.card, { padding: 11, marginBottom: 8 }]}>
        <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 10.8 }}>{row.label}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 3 }}>{[row.responsible_company || row.responsible_name, row.due_date || row.due_text, row.document_name].filter(Boolean).join(' · ') || 'Contexte à compléter'}</Text>
        {row.comment ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.2, marginTop: 4 }}>{row.comment}</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {EXPECTED_STATUS.map(([key,label]) => <Chip key={key} label={label} selected={row.status === key} onPress={() => changeExpectedStatus(row,key)} />)}
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => attachDocument(row)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Joindre fichier</Text></TouchableOpacity>
        </ScrollView>
      </View>)}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Documents Mission</Text>
      {docs.map((doc) => {
        const visa = latestVisa(doc.id);
        return <TouchableOpacity key={doc.id} onPress={() => { setVisaDoc(doc); setVisaStatus(visa?.status || 'to_review'); setVisaComment(visa?.comment || ''); }} style={[missionStyles.card, { padding: 11, marginBottom: 7 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900' }}>{doc.name || 'Document'}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 2 }}>{doc.type || 'source'} · {doc.source || 'Mission'}</Text>
            </View>
            <Text style={{ color: visa?.status === 'validated' ? MISSION_COLORS.accentDark : COLORS.inkFaint, fontSize: 8.7, fontWeight: '900' }}>{visa?.status || 'Sans VISA'}</Text>
          </View>
        </TouchableOpacity>;
      })}
    </ScrollView>

    <Modal visible={addExpectedVisible} transparent animationType="fade" onRequestClose={() => setAddExpectedVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Document attendu</Text>
        <TextInput style={[styles.input, missionStyles.input]} value={draft.label} onChangeText={(v) => setDraft((p) => ({ ...p, label: v }))} placeholder="Schéma hydraulique, DOE, PV essais…" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={draft.type} onChangeText={(v) => setDraft((p) => ({ ...p, type: v }))} placeholder="Type" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={draft.responsible} onChangeText={(v) => setDraft((p) => ({ ...p, responsible: v }))} placeholder="Responsable / entreprise" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8 }]} value={draft.due} onChangeText={(v) => setDraft((p) => ({ ...p, due: v }))} placeholder="Échéance" />
        <TextInput style={[styles.input, missionStyles.input, { marginTop: 8, minHeight: 65, textAlignVertical: 'top' }]} multiline value={draft.comment} onChangeText={(v) => setDraft((p) => ({ ...p, comment: v }))} placeholder="Commentaire" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setAddExpectedVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={addExpected}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Ajouter</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!visaDoc} transparent animationType="fade" onRequestClose={() => setVisaDoc(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>VISA · {visaDoc?.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {VISA_STATUS.map(([key,label]) => <Chip key={key} label={label} selected={visaStatus === key} onPress={() => setVisaStatus(key)} />)}
        </View>
        <TextInput style={[styles.input, missionStyles.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={visaComment} onChangeText={setVisaComment} placeholder="Remarques / réserves de validation" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setVisaDoc(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveVisa}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer le VISA</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
