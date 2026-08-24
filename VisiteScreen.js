/** Écran Visite — navigation responsive pilotée par la trame active. */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert, Keyboard, useWindowDimensions } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getVisite, getNote, upsertNote, getDb } from './db.js';
import { ajouterRemarqueVisite } from './remarkDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { recalculerProgressionVisite } from './visitProgressDb.js';
import { exporterEtPartager } from './excelExport.js';
import { PanelRegulation, PanelReleves } from './VisitePanels.js';
import { OptimizedPhotoPanel } from './OptimizedPhotoPanel.js';
import { OptimizedEquipmentPanel } from './OptimizedEquipmentPanel.js';
import { OptimizedRemarksPanel } from './OptimizedRemarksPanel.js';
import { TrameGenericPanel } from './TrameGenericPanel.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SPECIAL_PANEL_DEFAULTS = ['p-regulation', 'p-releves', 'p-equip', 'p-remarques', 'p-photos'];

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const { width } = useWindowDimensions();
  const modeTablette = width >= 900;
  const [visite, setVisite] = useState(null);
  const [activeTab, setActiveTab] = useState('p-infos');
  const activeTabRef = useRef('p-infos');
  const tabOrderRef = useRef([]);
  const changementTimerRef = useRef(null);
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');
  const [anomalieVisible, setAnomalieVisible] = useState(false);
  const [anomalieTxt, setAnomalieTxt] = useState('');

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  const tabOrder = trame.ui?.tabOrder || [];
  const panelLabels = trame.ui?.labels || {};
  const panels = trame.ui?.panels || {};
  const specialPanels = new Set(trame.ui?.specialPanels || SPECIAL_PANEL_DEFAULTS);
  const tabsReels = tabOrder.filter((t) => t !== 'SEP');

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tabOrderRef.current = tabsReels; }, [trame.id, tabOrder.join('|')]);
  useEffect(() => () => { if (changementTimerRef.current) clearTimeout(changementTimerRef.current); }, []);

  useEffect(() => {
    if (!visite || tabsReels.length === 0) return;
    if (!tabsReels.includes(activeTabRef.current)) {
      activeTabRef.current = tabsReels[0];
      setActiveTab(tabsReels[0]);
    }
  }, [visite?.trame_id, tabsReels.join('|')]);

  const changerOnglet = useCallback((prochain) => {
    if (!prochain || prochain === activeTabRef.current) return;
    Keyboard.dismiss();
    if (changementTimerRef.current) clearTimeout(changementTimerRef.current);
    changementTimerRef.current = setTimeout(() => {
      activeTabRef.current = prochain;
      setActiveTab(prochain);
      changementTimerRef.current = null;
    }, 0);
  }, []);

  const retourSecurise = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => onBack?.(), 0);
  }, [onBack]);

  const charger = useCallback(async () => {
    const db = await getDb();
    await preremplirVisiteDepuisContexte(db, visiteId);
    await recalculerProgressionVisite(db, visiteId);
    const v = await getVisite(visiteId);
    setVisite(v);
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  const onSaved = useCallback(async () => {
    const db = await getDb();
    const progression = await recalculerProgressionVisite(db, visiteId);
    setVisite((actuelle) => actuelle ? { ...actuelle, progression_pct: progression } : actuelle);
  }, [visiteId]);

  const swipeHandlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dx) > 35 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (evt, g) => {
        const tabs = tabOrderRef.current;
        const idx = tabs.indexOf(activeTabRef.current);
        if (g.dx < -35 && idx >= 0 && idx < tabs.length - 1) changerOnglet(tabs[idx + 1]);
        else if (g.dx > 35 && idx > 0) changerOnglet(tabs[idx - 1]);
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
    if (exporting) return;
    setExporting(true);
    try {
      Keyboard.dismiss();
      await attendre(180);
      const resultat = await exporterEtPartager(visiteId);
      if (resultat?.stats?.reseauxSupplementaires > 0) {
        Alert.alert(
          'Export complet',
          `${resultat.stats.reseauxSupplementaires} réseau(x) supplémentaire(s) ont été placés dans la feuille « RESEAUX COMPLEMENTAIRES » afin de ne perdre aucune donnée.`
        );
      }
    } catch (e) {
      Alert.alert('Erreur export', String(e.message || e));
    } finally {
      setExporting(false);
    }
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
    if (tabsReels.includes('p-remarques')) changerOnglet('p-remarques');
  };

  const contenuActif = () => {
    if (specialPanels.has(activeTab)) {
      if (activeTab === 'p-regulation') return <PanelRegulation visiteId={visiteId} onSaved={onSaved} />;
      if (activeTab === 'p-releves') return <PanelReleves visiteId={visiteId} onSaved={onSaved} />;
      if (activeTab === 'p-equip') return <OptimizedEquipmentPanel visiteId={visiteId} />;
      if (activeTab === 'p-remarques') return <OptimizedRemarksPanel visiteId={visiteId} />;
      if (activeTab === 'p-photos') return <OptimizedPhotoPanel visiteId={visiteId} />;
    }
    return <TrameGenericPanel visiteId={visiteId} panelId={activeTab} sections={panels[activeTab]} onSaved={onSaved} />;
  };

  if (!visite) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.visiteTopbar}>
        <View style={styles.visiteHeaderRow}>
          <TouchableOpacity style={styles.visiteBackBtn} onPress={retourSecurise}>
            <Text style={styles.visiteBackBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{visite.nom_site}</Text>
            <Text style={styles.cardSub}>{visite.nom_client} · {visite.date_visite} · {trame.nom} · {visite.mode_visite === 'express' ? 'Mode Express' : 'Mode complet'}</Text>
          </View>
          <TouchableOpacity style={styles.noteBtn} onPress={ouvrirNote}>
            <Text style={styles.noteBtnText}>Note libre</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exporter} disabled={exporting}>
            <Text style={styles.exportBtnText}>{exporting ? '...' : `Exporter ${trame.nom}`}</Text>
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
            {tabOrder.map((pid, i) =>
              pid === 'SEP' ? (
                <View key={`sep-${i}`} style={styles.tabSep} />
              ) : (
                <TouchableOpacity key={pid} style={styles.tabItem} onPress={() => changerOnglet(pid)}>
                  <Text style={[styles.tabItemText, activeTab === pid && styles.tabItemTextActive]}>{panelLabels[pid] || pid}</Text>
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
              {tabOrder.map((pid, i) => pid === 'SEP' ? (
                <View key={`side-sep-${i}`} style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 8 }} />
              ) : (
                <TouchableOpacity
                  key={pid}
                  onPress={() => changerOnglet(pid)}
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
                    {panelLabels[pid] || pid}
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
            <Text style={styles.modalTitle}>Note libre — {trame.nom}</Text>
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
