import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ActivityIndicator, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles, COLORS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  ajouterSectionRapportMission,
  initialiserRapportMission,
  modifierSectionRapportMission,
  supprimerSectionRapportMission
} from './missionReportDb.js';
import { exporterRapportMissionDocx, exporterRapportMissionPdf } from './missionReportExporter.js';

function parseBlocks(section) {
  try {
    const parsed = JSON.parse(section?.content_json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SectionPreview({ section }) {
  const blocks = parseBlocks(section);
  const tableCount = blocks.filter((b) => b.type === 'table').length;
  const rowCount = blocks.reduce((sum, b) => sum + (Array.isArray(b.rows) ? b.rows.length : 0), 0);
  return (
    <View style={{ marginTop: 7 }}>
      {tableCount ? (
        <Text style={{ color: COLORS.inkFaint, fontSize: 9.5 }}>
          {tableCount} tableau(x) · {rowCount} ligne(s) issus des données structurées
        </Text>
      ) : null}
      {section.content_text ? (
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginTop: 5 }} numberOfLines={3}>
          {section.content_text}
        </Text>
      ) : null}
    </View>
  );
}

export function MissionReportScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!missionId) return;
      setLoading(true);
      try {
        setReport(await initialiserRapportMission(missionId, { forceRefresh }));
      } catch (e) {
        Alert.alert('Rapport indisponible', String(e?.message || e));
      } finally {
        setLoading(false);
      }
    },
    [missionId]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const openEdit = (section) => {
    setEditing(section);
    setDraftTitle(section.title || '');
    setDraftText(section.content_text || '');
  };

  const saveEdit = async () => {
    if (!editing?.id) return;
    await modifierSectionRapportMission(editing.id, { title: draftTitle, contentText: draftText });
    setEditing(null);
    await load(false);
  };

  const toggle = async (section) => {
    await modifierSectionRapportMission(section.id, { hidden: !Number(section.hidden) });
    await load(false);
  };

  const move = async (section, delta) => {
    const all = report?.sections || [];
    const index = all.findIndex((item) => item.id === section.id);
    const other = all[index + delta];
    if (!other) return;
    const a = Number(section.sort_order || index);
    const b = Number(other.sort_order || index + delta);
    await modifierSectionRapportMission(section.id, { sortOrder: b });
    await modifierSectionRapportMission(other.id, { sortOrder: a });
    await load(false);
  };

  const addSection = async () => {
    if (!report?.profile?.id) return;
    const id = await ajouterSectionRapportMission({
      missionId,
      profileId: report.profile.id,
      title: 'Nouvelle section',
      contentText: '',
      sortOrder: (report.sections?.length || 0) + 10
    });
    await load(false);
    const next = (await initialiserRapportMission(missionId)).sections.find((s) => s.id === id);
    if (next) openEdit(next);
  };

  const remove = (section) => {
    Alert.alert('Supprimer cette section ?', 'Les données techniques sources ne seront pas supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supprimerSectionRapportMission(section.id);
          await load(false);
        }
      }
    ]);
  };

  const exportFile = async (format) => {
    if (busy) return;
    setBusy(true);
    try {
      if (format === 'pdf') await exporterRapportMissionPdf(missionId);
      else await exporterRapportMissionDocx(missionId);
    } catch (e) {
      Alert.alert('Export impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={MISSION_COLORS.accent} />
        <Text style={{ marginTop: 8, color: COLORS.muted }}>Préparation du rapport…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <FlatList
        data={report?.sections || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.sectionTitle, missionStyles.title]}>
              {report?.profile?.label || 'Rapport Mission'}
            </Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginBottom: 12 }}>
              Le rapport est une présentation des données structurées. Vous pouvez modifier les titres, ajouter du
              texte, masquer ou déplacer les sections sans altérer les constats, mesures, actions et essais d’origine.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={addSection}>
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Section</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => load(true)}>
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
                  ↻ Actualiser les données
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                disabled={busy}
                onPress={() => exportFile('docx')}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Word</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, missionStyles.primaryButton]}
                disabled={busy}
                onPress={() => exportFile('pdf')}
              >
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{busy ? 'Export…' : 'PDF'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const hidden = Number(item.hidden) === 1;
          return (
            <View style={[missionStyles.card, { marginBottom: 10, opacity: hidden ? 0.48 : 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 12.5 }}>
                    {item.title || 'Section'}
                  </Text>
                  <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>
                    {item.source_type === 'edited' ? 'MODIFIÉE' : 'GÉNÉRÉE DEPUIS LES DONNÉES'}
                  </Text>
                  <SectionPreview section={item} />
                </View>
                <TouchableOpacity onPress={() => openEdit(item)} style={{ padding: 6 }}>
                  <Text style={{ color: MISSION_COLORS.accent, fontWeight: '900' }}>Modifier</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 9, gap: 7 }}>
                <TouchableOpacity onPress={() => move(item, -1)} disabled={index === 0} style={{ padding: 6 }}>
                  <Text style={{ color: COLORS.inkSoft }}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => move(item, 1)}
                  disabled={index === (report?.sections?.length || 1) - 1}
                  style={{ padding: 6 }}
                >
                  <Text style={{ color: COLORS.inkSoft }}>↓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggle(item)} style={{ padding: 6 }}>
                  <Text style={{ color: COLORS.inkSoft }}>{hidden ? 'Afficher' : 'Masquer'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} style={{ padding: 6 }}>
                  <Text style={{ color: '#8B3A3A' }}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: COLORS.muted }}>Aucune section. Utilisez « Actualiser les données ».</Text>
        }
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, missionStyles.modalSheet]}>
            <Text style={[styles.modalTitle, missionStyles.title]}>Modifier la section</Text>
            <TextInput
              style={[styles.input, missionStyles.input]}
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="Titre"
            />
            <TextInput
              style={[styles.input, missionStyles.input, { marginTop: 9, minHeight: 150, textAlignVertical: 'top' }]}
              value={draftText}
              onChangeText={setDraftText}
              multiline
              placeholder="Texte rédactionnel libre / analyse / conclusion de cette section"
            />
            <Text style={{ color: COLORS.inkFaint, fontSize: 9, lineHeight: 13, marginTop: 7 }}>
              Les tableaux issus des mesures, points, actions ou scénarios restent liés aux données structurées.
              Modifiez ces données à leur source pour conserver une seule vérité.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, missionStyles.secondaryButton]}
                onPress={() => setEditing(null)}
              >
                <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={saveEdit}>
                <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
