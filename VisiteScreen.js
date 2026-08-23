/** Écran Visite — conteneur avec onglets horizontaux. */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getVisite, getNote, upsertNote, getDb } from './db.js';
import { ajouterRemarqueVisite } from './remarkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { recalculerProgressionVisite } from './visitProgressDb.js';
import { exporterEtPartager } from './excelExport.js';
import { PANEL_LABELS, TAB_ORDER, PanelGenerique, PanelRegulation, PanelReleves, PanelEquipements, PanelRemarques, PanelPhotos } from './VisitePanels.js';

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const [visite, setVisite] = useState(null);
  const [activeTab, setActiveTab] = useState('p-infos');
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');

  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    await recalculerProgressionVisite(db, visiteId);
    const v = await getVisite(visiteId);
    setVisite(v);
  }, [visiteId]);

  useEffect(useCallback(() => { charger(); }, [charger, refreshKey]));

  const onSaved = () => setRefreshKey((k) => k + 1);
  const tabsReels = TAB_ORDER.filter((t) => t !== 'SEP');
  const allerVoisin = (direction) => {
    const idx = tabsReels.indexOf(activeTab);
    const suivant = idx + direction;
    if (suivant >= 0 && suivant < tabsReels.length) setActiveTab(tabsReels[suivant]);
  };
  const swipeHandlers = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (evt, g) => {
        if (g.dx < -30) allerVoisin(1);
        else if (g.dx > 30) allerVoisin(-1);
      },
    })
  ).current;

  const ouvrirNote = async () => {
    const note = await getNote(visiteId);
    setNoteTxt(note?.contenu || '');
    setNoteVisible(true);
  };
  const fermerNote = async () => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    await upsertNote(visiteId, noteTxt);
    setNoteVisible(false);
  };

  const noteTimerRef = useRef(null);
  const onChangeNoteTxt = (t) => {
    setNoteTxt(t);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => upsertNote(visiteId, t), 700);
  };

  const [exporting, setExporting] = useState(false);
  const exporter = async () => {
    setExporting(true);
    try {
      await exporterEtPartager(visiteId);
    } catch (e) {
      Alert.alert('Erreur export', String(e.message || e));
    }
    setExporting(false);
  };
  const enregistrerAnomalie = async () => {
    const texte = anomalieTxt.trim();
    if (!texte) return;
    await ajouterRemarqueVisite(visiteId, {
      poste: 'Observation',
      prestation: texte,
      origine: 'Anomalie rapide',
    });
    setAnomalieTxt('');
    setAnomalieVisible(false);
    setActiveTab('p-remarques');
    onSaved();
  };

  if (!visite) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.visiteTopbar}>
        <View style={styles.visiteHeaderRow}>
          <TouchableOpacity style={styles.visiteBackBtn} onPress={onBack}>
            <Text style={styles.visiteBackBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{visite.nom_site}</Text>
            <Text style={styles.cardSub}>{visite.nom_client} · {visite.date_visite} · {visite.mode_visite === 'express' ? 'Mode Express' : 'Mode complet'}</Text>
          </View>
          <TouchableOpacity style={styles.noteBtn} onPress={ouvrirNote}>
            <Text style={styles.noteBtnText}>Note libre</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exporter} disabled={exporting}>
            <Text style={styles.exportBtnText}>{exporting ? '...' : 'Exporter'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${visite.progression_pct}%` }]} />
          </View>
          <Text style={styles.progressPct}>{visite.progression_pct}%</Text>
        </View>
        <TouchableOpacity style={styles.anomalyBtn} onPress={() => setAnomalieVisible(true)}>
          <Text style={styles.anomalyBtnText}>⚠ Ajouter une anomalie, une remarque ou une réserve</Text>
        </TouchableOpacity>
        {visite.mode_visite === 'express' && (
          <Text style={styles.expressHint}>⚡ Données reprises de la visite précédente · index et mesures variables à actualiser</Text>
        )}
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
          {TAB_ORDER.map((pid, i) =>
            pid === 'SEP' ? (
              <View key={`sep-${i}`} style={styles.tabSep} />
            ) : (
              <TouchableOpacity key={pid} style={styles.tabItem} onPress={() => setActiveTab(pid)}>
                <Text style={[styles.tabItemText, activeTab === pid && styles.tabItemTextActive]}>{PANEL_LABELS[pid]}</Text>
                {activeTab === pid && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }} {...swipeHandlers.panHandlers}>
        {activeTab === 'p-regulation' && <PanelRegulation visiteId={visiteId} refreshKey={refreshKey} onSaved={onSaved} />}
        {activeTab === 'p-releves' && <PanelReleves visiteId={visiteId} refreshKey={refreshKey} onSaved={onSaved} />}
        {activeTab === 'p-equip' && <PanelEquipements visiteId={visiteId} />}
        {activeTab === 'p-remarques' && <PanelRemarques visiteId={visiteId} refreshKey={refreshKey} />}
        {activeTab === 'p-photos' && <PanelPhotos visiteId={visiteId} refreshKey={refreshKey} />}
        {!['p-regulation', 'p-releves', 'p-equip', 'p-remarques', 'p-photos'].includes(activeTab) && (
          <PanelGenerique visiteId={visiteId} panelId={activeTab} refreshKey={refreshKey} onSaved={onSaved} />
        )}
      </View>

      <Modal visible={noteVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Note libre — feuille NOTE</Text>
            <TextInput style={[styles.input, { height: 160, textAlignVertical: 'top' }]} multiline value={noteTxt} onChangeText={onChangeNoteTxt} placeholder="Notes générales sur la visite..." />
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={fermerNote}><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={anomalieVisible} transparent animationType="fade" onRequestClose={() => setAnomalieVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Ajouter une anomalie</Text>
            <Text style={styles.importHint}>Décris rapidement le constat. La réserve créée sera entièrement modifiable dans la synthèse.</Text>
            <TextInput style={[styles.input, { minHeight: 100, marginTop: 12, textAlignVertical: 'top' }]} multiline autoFocus value={anomalieTxt} onChangeText={setAnomalieTxt} placeholder="Ex. Pompe défaillante, température de départ trop basse…" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setAnomalieVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={enregistrerAnomalie}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { VisiteScreen };
