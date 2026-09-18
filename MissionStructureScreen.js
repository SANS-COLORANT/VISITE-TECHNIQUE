import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  MISSION_LOCATION_KINDS,
  construireArbreLocalisations,
  creerLocalisationMission,
  listerStructureMission,
  modifierLocalisationMission,
  supprimerLocalisationMission,
} from './missionStructureDb.js';

const KIND_LABEL = Object.freeze(Object.fromEntries(MISSION_LOCATION_KINDS));

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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{label}</Text>
  </TouchableOpacity>;
}

function EquipmentRow({ equipment }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 12 }}>
    <Text style={{ color: MISSION_COLORS.accent, fontSize: 10, marginRight: 6 }}>●</Text>
    <View style={{ flex: 1 }}>
      <Text style={{ color: COLORS.ink, fontSize: 9.7, fontWeight: '800' }}>{equipment.type || 'Équipement'}</Text>
      <Text style={{ color: COLORS.inkFaint, fontSize: 8.3 }}>{[equipment.brand, equipment.model, equipment.state].filter(Boolean).join(' · ') || 'À compléter'}</Text>
    </View>
  </View>;
}

function LocationNode({ node, onAddChild, onEdit, onDelete }) {
  return <View style={{ marginLeft: Math.min(38, Number(node.depth || 0) * 14), marginTop: 6 }}>
    <View style={[missionStyles.card, { padding: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11, fontWeight: '900' }}>{Number(node.depth || 0) + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontSize: 10.7, fontWeight: '900' }}>{node.label}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 2 }}>{KIND_LABEL[node.kind] || node.kind || 'Localisation'} · {node.equipment?.length || 0} équipement(s) direct(s)</Text>
        </View>
        <TouchableOpacity onPress={() => onAddChild(node)} style={{ paddingHorizontal: 7, paddingVertical: 5 }}>
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 15, fontWeight: '900' }}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onEdit(node)} style={{ paddingHorizontal: 7, paddingVertical: 5 }}>
          <Text style={{ color: COLORS.inkSoft, fontSize: 12 }}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(node)} style={{ paddingHorizontal: 7, paddingVertical: 5 }}>
          <Text style={{ color: '#8B3A3A', fontSize: 12 }}>×</Text>
        </TouchableOpacity>
      </View>

      {(node.equipment || []).map((eq) => <EquipmentRow key={eq.id} equipment={eq} />)}
    </View>

    {(node.children || []).map((child) => <LocationNode
      key={child.id}
      node={child}
      onAddChild={onAddChild}
      onEdit={onEdit}
      onDelete={onDelete}
    />)}
  </View>;
}

export function MissionStructureScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const initialSiteId = route?.params?.siteId || null;
  const [raw, setRaw] = useState({ sites: [], locations: [], equipment: [] });
  const [expandedSite, setExpandedSite] = useState(initialSiteId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ siteId: '', parentLocationId: '', kind: 'building', label: '' });

  const load = useCallback(async () => {
    if (!missionId) return;
    const result = await listerStructureMission(missionId);
    setRaw(result);
    if (!expandedSite && result?.sites?.[0]?.id) setExpandedSite(result.sites[0].id);
  }, [missionId, expandedSite]);

  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => construireArbreLocalisations(raw), [raw]);
  const selectedSite = useMemo(() => tree.find((s) => s.id === expandedSite) || tree[0] || null, [tree, expandedSite]);

  const openNewRoot = (site) => {
    setEditingId(null);
    setDraft({ siteId: site.id, parentLocationId: '', kind: 'building', label: '' });
    setModalVisible(true);
  };

  const openChild = (node) => {
    setEditingId(null);
    setDraft({
      siteId: node.site_id,
      parentLocationId: node.id,
      kind: node.kind === 'building' ? 'level' : node.kind === 'level' ? 'room' : 'technical_room',
      label: '',
    });
    setModalVisible(true);
  };

  const openEdit = (node) => {
    setEditingId(node.id);
    setDraft({
      siteId: node.site_id,
      parentLocationId: node.parent_location_id || '',
      kind: node.kind || 'room',
      label: node.label || '',
    });
    setModalVisible(true);
  };

  const save = async () => {
    if (!draft.label.trim()) {
      Alert.alert('À compléter', 'Indique le nom du bâtiment, niveau, local ou zone.');
      return;
    }
    try {
      if (editingId) {
        await modifierLocalisationMission(editingId, {
          label: draft.label,
          kind: draft.kind,
          parentLocationId: draft.parentLocationId || null,
        });
      } else {
        await creerLocalisationMission({
          missionId,
          siteId: draft.siteId,
          parentLocationId: draft.parentLocationId || null,
          kind: draft.kind,
          label: draft.label,
        });
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e?.message || e));
    }
  };

  const remove = (node) => {
    Alert.alert(
      'Supprimer cette localisation ?',
      'Les sous-localisations seront supprimées. Les équipements restent dans le référentiel Mission mais perdent ce rattachement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerLocalisationMission(node.id);
              await load();
            } catch (e) {
              Alert.alert('Suppression impossible', String(e?.message || e));
            }
          },
        },
      ]
    );
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Patrimoine · navigation intérieure</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Construis une hiérarchie simple : Site → Bâtiment → Niveau → Local / local technique → Équipement. Elle sert ensuite aux plans, photos, mesures et constats sans ressaisie.
      </Text>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Site</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {tree.map((site) => <Chip key={site.id} label={site.name} selected={site.id === selectedSite?.id} onPress={() => setExpandedSite(site.id)} />)}
      </ScrollView>

      {selectedSite ? <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => openNewRoot(selectedSite)}>
            <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Bâtiment / zone racine</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionEquipment', { missionId, siteId: selectedSite.id })}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Inventaire du site</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionPlan', { missionId })}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Plans</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Arborescence</Text>
        {(selectedSite.locations || []).length
          ? selectedSite.locations.map((node) => <LocationNode key={node.id} node={node} onAddChild={openChild} onEdit={openEdit} onDelete={remove} />)
          : <View style={[missionStyles.card, { padding: 13 }]}>
              <Text style={{ color: COLORS.inkSoft, fontSize: 9.8 }}>Aucune structure créée. Commence par un bâtiment ou une zone.</Text>
            </View>}

        {(selectedSite.unlocatedEquipment || []).length ? <View style={{ marginTop: 16 }}>
          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Équipements sans localisation</Text>
          <View style={[missionStyles.card, { padding: 10 }]}>
            {selectedSite.unlocatedEquipment.map((eq) => <EquipmentRow key={eq.id} equipment={eq} />)}
          </View>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, lineHeight: 13, marginTop: 6 }}>
            Ils restent exploitables. Tu peux les rattacher progressivement depuis l’inventaire.
          </Text>
        </View> : null}
      </> : <Text style={{ color: COLORS.inkFaint, fontSize: 10, marginTop: 14 }}>Aucun Site rattaché à cette Mission.</Text>}
    </ScrollView>

    <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>{editingId ? 'Modifier la localisation' : 'Ajouter une localisation'}</Text>
        <TextInput
          style={[styles.input, missionStyles.input]}
          value={draft.label}
          onChangeText={(v) => setDraft((p) => ({ ...p, label: v }))}
          placeholder="Bâtiment A, R+2, Chaufferie, Local CTA…"
          autoFocus
        />
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, fontWeight: '800', marginTop: 10, marginBottom: 5 }}>TYPE</Text>
        <ScrollView style={{ maxHeight: 250 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MISSION_LOCATION_KINDS.map(([key,label]) => <Chip key={key} label={label} selected={draft.kind === key} onPress={() => setDraft((p) => ({ ...p, kind: key }))} />)}
          </View>
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setModalVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={save}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
