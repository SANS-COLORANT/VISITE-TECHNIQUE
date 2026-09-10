import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getPhotoDownloadState, subscribePhotoDownloads, pausePhotoDownload, resumePhotoDownload, dismissPhotoDownload } from './latestVisitPhotoTasks.js';

export function usePhotoDownloadState() {
  const [state, setState] = useState(getPhotoDownloadState);
  useEffect(() => {
    const unsubscribe = subscribePhotoDownloads(setState);
    setState(getPhotoDownloadState());
    return unsubscribe;
  }, []);
  return state;
}
const labels = { queued: 'En attente', running: 'En cours', pausing: 'Pause après les fichiers en cours', paused: 'En pause', partial: 'Partiellement terminé', done: 'Terminé', error: 'À reprendre' };
export function PhotoTaskList({ clientId = null }) {
  const state = usePhotoDownloadState();
  return <View>{state.tasks.filter((t) => clientId == null || t.clientId === String(clientId)).map((task) =>
    <View key={task.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
      <Text style={{ color: COLORS.ink, fontSize: 13, fontWeight: '700' }}>{task.label}</Text>
      <Text style={{ color: COLORS.muted, marginTop: 4 }}>{labels[task.status]}{task.progress ? ` · ${task.progress.completed}/${task.progress.total} traitées · ${task.progress.downloaded + task.progress.cached} enregistrées` : ''}</Text>
      {task.error ? <Text style={{ color: '#9A4C0A', marginTop: 4 }}>{task.error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['queued', 'running'].includes(task.status) ? <TouchableOpacity accessibilityRole="button" onPress={() => pausePhotoDownload(task.id)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: COLORS.primary, fontWeight: '700' }}>Mettre en pause</Text></TouchableOpacity> : null}
        {['paused', 'partial', 'error'].includes(task.status) ? <TouchableOpacity accessibilityRole="button" onPress={() => resumePhotoDownload(task.id)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: COLORS.primary, fontWeight: '700' }}>Reprendre les manquantes</Text></TouchableOpacity> : null}
        {!['queued', 'running', 'pausing'].includes(task.status) ? <TouchableOpacity accessibilityRole="button" onPress={() => dismissPhotoDownload(task.id)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: COLORS.muted }}>Masquer</Text></TouchableOpacity> : null}
      </View>
    </View>
  )}</View>;
}

export function PhotoDownloadBanner() {
  const state = usePhotoDownloadState();
  const [visible, setVisible] = useState(false);
  if (!state.tasks.length) return null;
  const task = state.tasks.find((t) => ['running', 'pausing'].includes(t.status)) || state.tasks[state.tasks.length - 1];
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Afficher les téléchargements de photos" onPress={() => setVisible(true)} style={{ minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#EFF4F8', borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', alignItems: 'center' }}>
      <Text numberOfLines={1} style={{ flex: 1, color: COLORS.ink, fontSize: 12.5, fontWeight: '700' }}>{task.label} · {labels[task.status]}{task.progress ? ` ${task.progress.completed}/${task.progress.total}` : ''}</Text>
      <Text style={{ color: COLORS.primary, fontWeight: '700', paddingLeft: 12 }}>Suivi</Text>
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxHeight: '85%' }]}>
        <Text style={styles.modalTitle}>Photos hors connexion</Text>
        <Text style={{ color: COLORS.muted, lineHeight: 19 }}>Tu peux continuer ta visite dans METRA. Les fichiers déjà enregistrés sont conservés même après fermeture de l'application.</Text>
        <ScrollView><PhotoTaskList /></ScrollView>
        <TouchableOpacity onPress={() => setVisible(false)} style={[styles.btnPrimary, { flex: 0, minHeight: 48, marginTop: 12 }]}><Text style={styles.btnPrimaryText}>Continuer ma visite</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </>;
}
