/** Écran Visite — conteneur avec onglets horizontaux. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, PanResponder, Alert } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getVisite, getNote, upsertNote } from './db.js';
import { exporterEtPartager } from './excelExport.js';
import { PANEL_LABELS, TAB_ORDER, PanelGenerique, PanelRegulation, PanelReleves, PanelEquipements, PanelRemarques, PanelPhotos } from './VisitePanels.js';

// ============================================================================
// 6. ÉCRAN VISITE — conteneur avec onglets horizontaux
// ============================================================================

function VisiteScreen({ route, onBack }) {
  const { visiteId } = route.params;
  const [visite, setVisite] = useState(null);
  const [activeTab, setActiveTab] = useState('p-infos');
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteTxt, setNoteTxt] = useState('');

  const charger = useCallback(async () => {
    const v = await getVisite(visiteId);
    setVisite(v);
  }, [visiteId]);

  useEffect(useCallback(() => { charger(); }, [charger, refreshKey]));

  const onSaved = () => setRefreshKey((k) => k + 1);

  // Liste des vrais onglets (sans les séparateurs), pour naviguer au swipe.
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
        if (g.dx < -30) allerVoisin(1);       // glisse vers la gauche → onglet suivant
        else if (g.dx > 30) allerVoisin(-1);  // glisse vers la droite → onglet précédent
      },
    })
  ).current;

  const ouvrirNote = async () => {
    setNoteTxt(await getNote(visiteId));
    setNoteVisible(true);
  };
  const fermerNote = async () => {
    await upsertNote(visiteId, noteTxt);
    setNoteVisible(false);
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
            <Text style={styles.cardSub}>{visite.nom_client} · {visite.date_visite}</Text>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabStrip}>
          {TAB_ORDER.map((pid, i) =>
            pid === 'SEP' ? (
              <View key={`sep-${i}`} style={styles.tabSep} />
            ) : (
              <TouchableOpacity key={pid} style={styles.tabItem} onPress={() => setActiveTab(pid)}>
                <Text style={[styles.tabItemText, activeTab === pid && styles.tabItemTextActive]}>
                  {PANEL_LABELS[pid]}
                </Text>
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
            <TextInput
              style={[styles.input, { height: 160, textAlignVertical: 'top' }]}
              multiline
              value={noteTxt}
              onChangeText={setNoteTxt}
              placeholder="Notes générales sur la visite..."
            />
            <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={fermerNote}>
              <Text style={styles.btnPrimaryText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


export { VisiteScreen };
