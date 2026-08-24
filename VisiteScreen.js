/** Écran Visite — navigation responsive téléphone/tablette. */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, useWindowDimensions } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getVisite, getNote, upsertNote, getDb } from './db.js';
import { ajouterRemarqueVisite } from './remarkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { recalculerProgressionVisite } from './visitProgressDb.js';
import { exporterEtPartager } from './excelExport.js';
import { PANEL_LABELS, TAB_ORDER, PanelGenerique, PanelRegulation, PanelReleves } from './VisitePanels.js';
import { OptimizedPhotoPanel } from './OptimizedPhotoPanel.js';
import { OptimizedEquipmentPanel } from './OptimizedEquipmentPanel.js';
import { OptimizedRemarksPanel } from './OptimizedRemarksPanel.js';

const TABS_REELS = TAB_ORDER.filter((t) => t !== 'SEP');

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const { width } = useWindowDimensions();
  const modeTablette = width >= 900;
  const [visite, setVisite] = useState(null);
  const [activeTab, setActiveTab] = useState('p-infos');
  const activeTabRef = useRef('p-infos');
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    await recalculerProgressionVisite(db, visiteId);
    const v = await getVisite(visiteId);
    setVisite(v);
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  // Une saisie ne recharge plus tout l'écran ni le panneau courant.
  // Les composants gardent leur état local et SQLite est mis à jour en arrière-plan.
  // On ne recalcule que le pourcentage affiché dans l'en-tête.
  const onSaved = useCallback(async () => {
    const db = await getDb();
    const progression = await recalculerProgressionVisite(db, visiteId);
    setVisite((actuelle) => actuelle ? { ...actuelle, progression_pct: progression } : actuelle);
  }, [visiteId]);

  const swipeHandlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dx) > 35 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (evt, g) => {
        const idx = TABS_REELS.indexOf(activeTabRef.current);
        if (g.dx < -35 && idx < TABS_REELS.length - 1) setActiveTab(TABS_REELS[idx + 1]);
        else if (g.dx > 35 && idx > 0) setActiveTab(TABS_REELS[idx - 1]);
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
  };

  const contenuActif = () => {
    if (activeTab === 'p-regulation') return <PanelRegulation visiteId={visiteId} onSaved={onSaved} />;
    if (activeTab === 'p-releves') return <PanelReleves visiteId={visiteId} onSaved={onSaved} />;
    if (activeTab === 'p-equip') return <OptimizedEquipmentPanel visiteId={visiteId} />;
    if (activeTab === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} />;
    if (activeTab === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
    return <PanelGenerique visiteId={visiteId} panelId={activeTab} onSaved={onSaved} />;
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
        {!modeTablette && (
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
        )}
      </View>

      {modeTablette ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: 205, backgroundColor: '#FFFFFF', borderRightWidth: 1, borderRightColor: COLORS.line }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 9 }} showsVerticalScrollIndicator={false}>
              {TAB_ORDER.map((pid, i) => pid === 'SEP' ? (
                <View key={`side-sep-${i}`} style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 8 }} />
              ) : (
                <TouchableOpacity
                  key={pid}
                  onPress={() => setActiveTab(pid)}
                  style={{
                    minHeight: 43,
                    paddingHorizontal: 11,
                    paddingVertical: 10,
                    borderRadius: 10,
                    marginVertical: 2,
                    justifyContent: 'center',
                    backgroundColor: activeTab === pid ? '#FFF3E8' : 'transparent',
                    borderWidth: activeTab === pid ? 1 : 0,
                    borderColor: activeTab === pid ? '#F3C89B' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: activeTab === pid ? '800' : '600', color: activeTab === pid ? COLORS.primary : COLORS.text }}>
                    {PANEL_LABELS[pid]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {contenuActif()}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }} {...swipeHandlers.panHandlers}>
          {contenuActif()}
        </View>
      )}

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
