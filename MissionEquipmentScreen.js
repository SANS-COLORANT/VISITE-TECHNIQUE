import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  MISSION_EQUIPMENT_STATES,
  MISSION_LIFECYCLE_STATES,
  MISSION_VERIFICATION_STATES,
  confirmerOcrPlaqueMission,
  creerComposantMission,
  creerEquipementMission,
  dupliquerEquipementMission,
  getEquipmentDetails,
  lancerOcrPlaqueMission,
  listerEquipementsMission,
  modifierEquipementMission,
} from './missionEquipmentDb.js';
import { capturerPhotoMission } from './missionMediaDb.js';

const STATE_LABELS = Object.freeze({
  non_evalue: 'Non évalué',
  bon: 'Bon',
  correct: 'Correct',
  degrade: 'Dégradé',
  mauvais: 'Mauvais',
  hs: 'HS',
});
const VERIFY_LABELS = Object.freeze({
  non_verifie: 'Non vérifié',
  confirme: 'Confirmé',
  different: 'Différent',
  non_retrouve: 'Non retrouvé',
  depose: 'Déposé',
  remplace: 'Remplacé',
  inaccessible: 'Inaccessible',
  a_verifier: 'À vérifier',
});
const LIFE_LABELS = Object.freeze({
  existant_conserve: 'Existant conservé',
  a_deposer: 'À déposer',
  a_transferer: 'À transférer',
  reemploi_prevu: 'Réemploi prévu',
  depose: 'Déposé',
  stocke: 'Stocké',
  transfere: 'Transféré',
  reinstalle: 'Réinstallé',
  neuf: 'Neuf',
  mis_en_service: 'Mis en service',
});

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity
    onPress={onPress}
    style={{
      borderWidth: 1,
      borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
      backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: 11,
      marginRight: 6,
      marginBottom: 6,
    }}
  >
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9.5, fontWeight: '800' }}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value, onChangeText, keyboardType = 'default', placeholder = '' }) {
  return <View style={{ marginBottom: 9 }}>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, fontWeight: '800', marginBottom: 4 }}>{label.toUpperCase()}</Text>
    <TextInput
      style={[styles.input, missionStyles.input]}
      value={String(value ?? '')}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
    />
  </View>;
}

export function MissionEquipmentScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState([]);
  const [sites, setSites] = useState([]);
  const [query, setQuery] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newSiteId, setNewSiteId] = useState('');
  const [newType, setNewType] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');

  const [edit, setEdit] = useState({});
  const [componentLabel, setComponentLabel] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrEdit, setOcrEdit] = useState({});

  const load = useCallback(async () => {
    if (!missionId) return;
    setLoading(true);
    try {
      const db = await getDb();
      const [eq, siteRows] = await Promise.all([
        listerEquipementsMission(missionId),
        db.getAllAsync(
          'SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name',
          [missionId]
        ),
      ]);
      setEquipment(eq || []);
      setSites(siteRows || []);
      if (!newSiteId && siteRows?.[0]?.id) setNewSiteId(siteRows[0].id);
    } catch (e) {
      Alert.alert('Inventaire indisponible', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [missionId, newSiteId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter((e) => [e.type, e.brand, e.model, e.site_name, e.location_label].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [equipment, query]);

  const openDetails = async (id) => {
    setSelectedId(id);
    try {
      const d = await getEquipmentDetails(id);
      setDetails(d);
      const e = d?.equipment || {};
      setEdit({
        type: e.type || '',
        brand: e.brand || '',
        model: e.model || '',
        installationYear: e.installation_year || '',
        state: e.state || 'non_evalue',
        verificationStatus: e.verification_status || 'non_verifie',
        lifecycleStatus: e.lifecycle_status || 'existant_conserve',
        expectedLifetimeYears: e.expected_lifetime_years === null || e.expected_lifetime_years === undefined ? '' : String(e.expected_lifetime_years),
        replacementCost: e.replacement_cost === null || e.replacement_cost === undefined ? '' : String(e.replacement_cost),
        replacementYear: e.replacement_year === null || e.replacement_year === undefined ? '' : String(e.replacement_year),
        criticality: e.criticality || {},
        criticalityReason: e.criticality?.reason || '',
      });
    } catch (err) {
      Alert.alert('Équipement indisponible', String(err?.message || err));
      setSelectedId(null);
    }
  };

  const createEquipment = async () => {
    if (!newSiteId || !newType.trim()) {
      Alert.alert('À compléter', 'Choisis un Site et indique au minimum le type/désignation de l’équipement.');
      return;
    }
    setBusy(true);
    try {
      const id = await creerEquipementMission({
        missionId,
        siteId: newSiteId,
        type: newType,
        brand: newBrand,
        model: newModel,
        sourceType: 'terrain',
      });
      const qty = Math.max(1, Math.min(200, Number(newQuantity) || 1));
      if (qty > 1) await dupliquerEquipementMission(id, qty - 1);
      setCreateVisible(false);
      setNewType('');
      setNewBrand('');
      setNewModel('');
      setNewQuantity('1');
      await load();
    } catch (e) {
      Alert.alert('Création impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const saveEquipment = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await modifierEquipementMission(selectedId, {
        ...edit,
        criticality: { ...(edit.criticality || {}), reason: edit.criticalityReason || null },
      });
      setDetails(await getEquipmentDetails(selectedId));
      await load();
      Alert.alert('Équipement mis à jour', 'Les caractéristiques sont enregistrées dans le référentiel local de la Mission.');
    } catch (e) {
      Alert.alert('Enregistrement impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const duplicateSelected = async () => {
    if (!selectedId) return;
    Alert.alert('Dupliquer cet équipement', 'Créer un équipement identique supplémentaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Dupliquer',
        onPress: async () => {
          await dupliquerEquipementMission(selectedId, 1);
          await load();
        },
      },
    ]);
  };

  const addComponent = async () => {
    if (!selectedId || !componentLabel.trim()) return;
    await creerComposantMission({ missionId, equipmentId: selectedId, label: componentLabel.trim() });
    setComponentLabel('');
    setDetails(await getEquipmentDetails(selectedId));
  };

  const photoPlaqueAndOcr = async () => {
    if (!selectedId || !details?.equipment || busy) return;
    setBusy(true);
    try {
      const photo = await capturerPhotoMission({
        missionId,
        siteId: details.equipment.site_id,
        equipmentId: selectedId,
        label: 'Plaque signalétique',
        type: 'plaque_signaletique',
      });
      if (!photo) return;
      const result = await lancerOcrPlaqueMission({
        missionId,
        photoId: photo.id,
        equipmentId: selectedId,
        fileUri: photo.fileUri,
      });
      if (result?.unavailable) {
        Alert.alert('Photo enregistrée', 'La plaque reste attachée à l’équipement. L’OCR local n’est pas disponible sur cet appareil.');
        setDetails(await getEquipmentDetails(selectedId));
        return;
      }
      setOcrResult(result);
      setOcrEdit({
        brand: result.detected?.brand || details.equipment.brand || '',
        model: result.detected?.model || details.equipment.model || '',
        serialNumber: result.detected?.serialNumber || details.equipment.properties?.serialNumber || '',
        installationYear: result.detected?.installationYear || details.equipment.installation_year || '',
        refrigerant: result.detected?.refrigerant || details.equipment.properties?.refrigerant || '',
        nominalPowerKw: result.detected?.nominalPowerKw ?? '',
        voltageV: result.detected?.voltageV ?? '',
        currentA: result.detected?.currentA ?? '',
        frequencyHz: result.detected?.frequencyHz ?? '',
        refrigerantChargeKg: result.detected?.refrigerantChargeKg ?? '',
      });
      setDetails(await getEquipmentDetails(selectedId));
    } catch (e) {
      Alert.alert('Lecture de plaque', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const confirmOcr = async () => {
    if (!ocrResult?.id || !selectedId) return;
    await confirmerOcrPlaqueMission({ jobId: ocrResult.id, equipmentId: selectedId, values: ocrEdit });
    setOcrResult(null);
    setOcrEdit({});
    await openDetails(selectedId);
    await load();
  };

  if (loading && !equipment.length) {
    return <View style={styles.center}><ActivityIndicator color={MISSION_COLORS.accent} /><Text style={{ marginTop: 8, color: COLORS.muted }}>Chargement de l’inventaire…</Text></View>;
  }

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      ListHeaderComponent={<View>
        <Text style={[styles.sectionTitle, missionStyles.title]}>Inventaire Mission</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginBottom: 12 }}>
          Inventaire indépendant des Visites techniques. Une fiche peut rester partielle et être complétée progressivement.
        </Text>
        <TextInput style={[styles.input, missionStyles.input]} value={query} onChangeText={setQuery} placeholder="Rechercher équipement, marque, modèle, site…" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 14 }}>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => setCreateVisible(true)}>
            <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>＋ Équipement</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionTechnicalGraph', { missionId })}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Synoptique</Text>
          </TouchableOpacity>
        </View>
      </View>}
      renderItem={({ item }) => <TouchableOpacity
        onPress={() => openDetails(item.id)}
        activeOpacity={0.82}
        style={[missionStyles.card, { marginBottom: 9, padding: 12 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 12.5 }}>{item.type || 'Équipement'}</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 3 }}>{[item.brand, item.model].filter(Boolean).join(' · ') || 'Caractéristiques à compléter'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 9, marginTop: 4 }}>{item.site_name || ''}{item.location_label ? ' · ' + item.location_label : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9, fontWeight: '900' }}>{STATE_LABELS[item.state] || item.state || 'Non évalué'}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 4 }}>{VERIFY_LABELS[item.verification_status] || 'Non vérifié'}</Text>
          </View>
        </View>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={[missionStyles.card, { padding: 14 }]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>Aucun équipement ne correspond. L’inventaire peut aussi être alimenté depuis Excel.</Text>
      </View>}
    />

    <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Ajouter rapidement un équipement</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 9, marginBottom: 6 }}>SITE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 45, marginBottom: 9 }}>
          {sites.map((site) => <Chip key={site.id} label={site.name} selected={newSiteId === site.id} onPress={() => setNewSiteId(site.id)} />)}
        </ScrollView>
        <Field label="Type / désignation" value={newType} onChangeText={setNewType} placeholder="Pompe, chaudière, ballon, automate…" />
        <Field label="Marque" value={newBrand} onChangeText={setNewBrand} />
        <Field label="Modèle" value={newModel} onChangeText={setNewModel} />
        <Field label="Quantité identique à créer" value={newQuantity} onChangeText={setNewQuantity} keyboardType="number-pad" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setCreateVisible(false)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} disabled={busy} onPress={createEquipment}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{busy ? 'Création…' : 'Créer'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>

    <Modal visible={!!selectedId && !!details} animationType="slide" onRequestClose={() => { setSelectedId(null); setDetails(null); }}>
      <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: MISSION_COLORS.accentStrong, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => { setSelectedId(null); setDetails(null); }} style={{ paddingRight: 12, paddingVertical: 5 }}><Text style={{ color: '#FFFFFF', fontSize: 21 }}>←</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#BFE2CC', fontSize: 8.5, fontWeight: '900', letterSpacing: 1 }}>ÉQUIPEMENT MISSION</Text>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>{details?.equipment?.type || 'Équipement'}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Identification</Text>
          <Field label="Type" value={edit.type} onChangeText={(v) => setEdit((p) => ({ ...p, type: v }))} />
          <Field label="Marque" value={edit.brand} onChangeText={(v) => setEdit((p) => ({ ...p, brand: v }))} />
          <Field label="Modèle" value={edit.model} onChangeText={(v) => setEdit((p) => ({ ...p, model: v }))} />
          <Field label="Année / mise en service" value={edit.installationYear} onChangeText={(v) => setEdit((p) => ({ ...p, installationYear: v }))} />

          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { marginBottom: 16, alignItems: 'center' }]} disabled={busy} onPress={photoPlaqueAndOcr}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>{busy ? 'Analyse…' : '📷 Plaque signalétique · photo + OCR local'}</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>État</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {MISSION_EQUIPMENT_STATES.map((key) => <Chip key={key} label={STATE_LABELS[key]} selected={edit.state === key} onPress={() => setEdit((p) => ({ ...p, state: key }))} />)}
          </View>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Vérification documentaire ↔ terrain</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {MISSION_VERIFICATION_STATES.map((key) => <Chip key={key} label={VERIFY_LABELS[key]} selected={edit.verificationStatus === key} onPress={() => setEdit((p) => ({ ...p, verificationStatus: key }))} />)}
          </View>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Cycle de vie projet</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {MISSION_LIFECYCLE_STATES.map((key) => <Chip key={key} label={LIFE_LABELS[key]} selected={edit.lifecycleStatus === key} onPress={() => setEdit((p) => ({ ...p, lifecycleStatus: key }))} />)}
          </View>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Renouvellement</Text>
          <Field label="Durée de vie indicative (ans)" value={edit.expectedLifetimeYears} onChangeText={(v) => setEdit((p) => ({ ...p, expectedLifetimeYears: v }))} keyboardType="decimal-pad" />
          <Field label="Coût de remplacement estimé (€)" value={edit.replacementCost} onChangeText={(v) => setEdit((p) => ({ ...p, replacementCost: v }))} keyboardType="decimal-pad" />
          <Field label="Année de remplacement projetée" value={edit.replacementYear} onChangeText={(v) => setEdit((p) => ({ ...p, replacementYear: v }))} keyboardType="number-pad" />

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Criticité explicable</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 9, lineHeight: 13, marginBottom: 7 }}>
            METRA conserve les axes sélectionnés et la justification. Il ne transforme pas automatiquement cette saisie en diagnostic définitif.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
            {[
              ['security','Sécurité'],
              ['regulatory','Réglementaire'],
              ['continuity','Continuité'],
              ['energy','Énergie'],
              ['comfort','Confort'],
              ['asset','Patrimoine'],
            ].map(([key,label]) => <Chip
              key={key}
              label={label}
              selected={Boolean(edit.criticality?.[key])}
              onPress={() => setEdit((p) => ({ ...p, criticality: { ...(p.criticality || {}), [key]: !p.criticality?.[key] } }))}
            />)}
          </View>
          <Field label="Justification / contexte de criticité" value={edit.criticalityReason} onChangeText={(v) => setEdit((p) => ({ ...p, criticalityReason: v }))} placeholder="Pourquoi cet équipement est sensible ?" />

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Composants</Text>
          {(details?.components || []).map((c) => <View key={c.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '800' }}>{c.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 9 }}>{[c.brand, c.model, c.state].filter(Boolean).join(' · ')}</Text>
          </View>)}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
            <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={componentLabel} onChangeText={setComponentLabel} placeholder="Ajouter sonde, filtre, vanne…" />
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={addComponent}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋</Text></TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Historique de l’équipement</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 9, lineHeight: 13, marginBottom: 7 }}>
            Historique transversal du même équipement dans le référentiel local Missions. Les valeurs anciennes restent volontairement discrètes.
          </Text>
          {(details?.measures || []).slice(0, 5).map((m) => <View key={m.id} style={{ opacity: 0.68, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 9.5 }}>{m.type || 'Mesure'} · {m.value_number ?? m.value_text ?? '/'} {m.unit || ''}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2 }}>{m.created_at || ''}</Text>
          </View>)}
          {(details?.points || []).slice(0, 5).map((p) => <View key={p.id} style={{ opacity: 0.68, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 9.5 }}>{p.label || p.description || 'Point'} · {p.status}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2 }}>{p.created_at || ''}</Text>
          </View>)}
          {(details?.lifecycle || []).slice(0, 5).map((h) => <View key={h.id} style={{ opacity: 0.68, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.ink, fontSize: 9.5 }}>{h.from_state || '—'} → {h.to_state}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2 }}>{h.effective_date || h.created_at || ''}</Text>
          </View>)}
          {!details?.measures?.length && !details?.points?.length && !details?.lifecycle?.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9 }}>Aucun historique antérieur.</Text> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={duplicateSelected}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Dupliquer</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { flexGrow: 1, alignItems: 'center' }]} disabled={busy} onPress={saveEquipment}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Enregistrer</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={!!ocrResult} transparent animationType="fade" onRequestClose={() => setOcrResult(null)}>
      <View style={styles.modalOverlay}><ScrollView style={[styles.modalSheet, missionStyles.modalSheet]} contentContainerStyle={{ paddingBottom: 18 }}>
        <Text style={[styles.modalTitle, missionStyles.title]}>Données détectées sur la plaque</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, lineHeight: 14, marginBottom: 10 }}>
          OCR réalisé localement sur la tablette. Vérifiez/corrigez avant validation. La photo originale reste attachée à l’équipement.
        </Text>
        <Field label="Marque" value={ocrEdit.brand} onChangeText={(v) => setOcrEdit((p) => ({ ...p, brand: v }))} />
        <Field label="Modèle" value={ocrEdit.model} onChangeText={(v) => setOcrEdit((p) => ({ ...p, model: v }))} />
        <Field label="N° de série" value={ocrEdit.serialNumber} onChangeText={(v) => setOcrEdit((p) => ({ ...p, serialNumber: v }))} />
        <Field label="Année" value={ocrEdit.installationYear} onChangeText={(v) => setOcrEdit((p) => ({ ...p, installationYear: v }))} />
        <Field label="Fluide" value={ocrEdit.refrigerant} onChangeText={(v) => setOcrEdit((p) => ({ ...p, refrigerant: v }))} />
        <Field label="Puissance nominale kW" value={ocrEdit.nominalPowerKw} onChangeText={(v) => setOcrEdit((p) => ({ ...p, nominalPowerKw: v }))} keyboardType="decimal-pad" />
        <Field label="Tension V" value={ocrEdit.voltageV} onChangeText={(v) => setOcrEdit((p) => ({ ...p, voltageV: v }))} keyboardType="decimal-pad" />
        <Field label="Courant A" value={ocrEdit.currentA} onChangeText={(v) => setOcrEdit((p) => ({ ...p, currentA: v }))} keyboardType="decimal-pad" />
        <Field label="Fréquence Hz" value={ocrEdit.frequencyHz} onChangeText={(v) => setOcrEdit((p) => ({ ...p, frequencyHz: v }))} keyboardType="decimal-pad" />
        <Field label="Charge fluide kg" value={ocrEdit.refrigerantChargeKg} onChangeText={(v) => setOcrEdit((p) => ({ ...p, refrigerantChargeKg: v }))} keyboardType="decimal-pad" />
        <View style={styles.modalActions}>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => setOcrResult(null)}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Plus tard</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={confirmOcr}><Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Confirmer</Text></TouchableOpacity>
        </View>
      </ScrollView></View>
    </Modal>
  </View>;
}
