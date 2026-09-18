import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  appliquerMappingImportMission,
  enregistrerMappingImportMission,
  getImportBatchStructure,
  listerImportsMission,
  listerMappingsImportMission,
} from './missionExcelMappingDb.js';

const TARGETS = Object.freeze({
  site: [
    ['name', 'Nom du site'],
    ['code', 'Code site'],
    ['city', 'Ville'],
    ['address', 'Adresse'],
  ],
  equipment: [
    ['site', 'Site'],
    ['type', 'Type / désignation'],
    ['brand', 'Marque'],
    ['model', 'Modèle'],
    ['installation_year', 'Année'],
    ['state', 'État'],
    ['quantity', 'Quantité'],
    ['network', 'Réseau / circuit'],
  ],
  action: [
    ['site', 'Site'],
    ['label', 'Action / prestation'],
    ['responsible', 'Responsable / entreprise'],
    ['due', 'Échéance'],
    ['priority', 'Priorité'],
    ['cost', 'Coût'],
    ['allocation', 'Imputation / lot'],
    ['status', 'Statut'],
  ],
  measure: [
    ['site', 'Site'],
    ['type', 'Type de mesure'],
    ['value', 'Valeur numérique'],
    ['value_text', 'Valeur texte'],
    ['unit', 'Unité'],
  ],
});

const ENTITY_LABELS = Object.freeze({
  site: 'Sites',
  equipment: 'Équipements',
  action: 'Actions',
  measure: 'Mesures',
});

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
  ><Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{label}</Text></TouchableOpacity>;
}

export function MissionExcelMappingScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [imports, setImports] = useState({ batches: [], issues: [] });
  const [mappings, setMappings] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [structure, setStructure] = useState([]);
  const [sheetName, setSheetName] = useState(null);
  const [entityType, setEntityType] = useState('equipment');
  const [fieldMap, setFieldMap] = useState({});
  const [mappingName, setMappingName] = useState('');
  const [columnPicker, setColumnPicker] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [i, m] = await Promise.all([listerImportsMission(missionId), listerMappingsImportMission(missionId)]);
    setImports(i);
    setMappings(m);
    if (!batchId && i?.batches?.[0]?.id) setBatchId(i.batches[0].id);
  }, [missionId, batchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!batchId) {
        setStructure([]);
        setSheetName(null);
        return;
      }
      const s = await getImportBatchStructure(batchId, 120);
      setStructure(s || []);
      setSheetName((current) => current && s.some((x) => x.sheetName === current) ? current : s?.[0]?.sheetName || null);
    })();
  }, [batchId]);

  useEffect(() => {
    setFieldMap({});
    setMappingName('');
  }, [sheetName, entityType]);

  const sheet = useMemo(() => structure.find((s) => s.sheetName === sheetName) || null, [structure, sheetName]);
  const issues = useMemo(() => imports.issues.filter((i) => !batchId || i.batch_id === batchId), [imports, batchId]);
  const batch = useMemo(() => imports.batches.find((b) => b.id === batchId) || null, [imports, batchId]);

  const saveAndApply = async () => {
    if (!batchId || !sheetName) return;
    const required = entityType === 'site' ? ['name'] : entityType === 'equipment' ? ['type'] : entityType === 'action' ? ['label'] : ['type'];
    if (required.some((key) => !fieldMap[key])) {
      Alert.alert('Mapping incomplet', 'Associe au minimum : ' + required.join(', '));
      return;
    }
    setBusy(true);
    try {
      const id = await enregistrerMappingImportMission({
        missionId,
        name: mappingName.trim() || ENTITY_LABELS[entityType] + ' · ' + sheetName,
        sourceSignature: (batch?.source_name || '') + '|' + sheetName + '|' + (sheet?.columns || []).join('|'),
        entityType,
        sheetName,
        fieldMap,
      });
      const summary = await appliquerMappingImportMission({ missionId, batchId, mappingId: id });
      await load();
      Alert.alert(
        'Mapping appliqué',
        String(summary.created || 0) + ' objet(s) créé(s) · ' + String(summary.skipped || 0) + ' ligne(s) ignorée(s) · ' + String(summary.errors || 0) + ' erreur(s).'
      );
    } catch (e) {
      Alert.alert('Mapping impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const reuseMapping = async (row) => {
    try {
      const parsed = JSON.parse(row.mapping_json || '{}');
      setEntityType(parsed.entityType || 'equipment');
      if (parsed.sheetName && structure.some((s) => s.sheetName === parsed.sheetName)) setSheetName(parsed.sheetName);
      setFieldMap(parsed.fieldMap || {});
      setMappingName(row.name || '');
    } catch {
      Alert.alert('Mapping invalide', 'Ce mapping ne peut pas être relu.');
    }
  };

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Mapping Excel</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        METRA conserve d’abord le classeur brut, puis transforme les colonnes choisies. Les lignes originales et formules ne sont jamais perdues.
      </Text>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 16 }]}>Import source</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {(imports.batches || []).map((b) => <Chip key={b.id} label={b.source_name || b.source_type || 'Import'} selected={batchId === b.id} onPress={() => setBatchId(b.id)} />)}
      </ScrollView>

      {batch ? <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, marginTop: 4 }}>
        {batch.mode} · {batch.status} · {batch.created_at}
      </Text> : null}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 15 }]}>Feuille</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {structure.map((s) => <Chip key={s.sheetName} label={s.sheetName} selected={sheetName === s.sheetName} onPress={() => setSheetName(s.sheetName)} />)}
      </ScrollView>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 15 }]}>Créer</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Object.keys(TARGETS).map((key) => <Chip key={key} label={ENTITY_LABELS[key]} selected={entityType === key} onPress={() => setEntityType(key)} />)}
      </View>

      {sheet ? <View style={[missionStyles.card, { padding: 12, marginTop: 9 }]}>
        <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 11.5, fontWeight: '900' }}>{sheet.sheetName}</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.7, marginTop: 2 }}>{sheet.columns.length} colonne(s) détectée(s) · aperçu des {sheet.rows.length} première(s) ligne(s)</Text>

        <TextInput
          style={[styles.input, missionStyles.input, { marginTop: 10 }]}
          value={mappingName}
          onChangeText={setMappingName}
          placeholder="Nom du mapping réutilisable"
        />

        <View style={{ marginTop: 12 }}>
          {(TARGETS[entityType] || []).map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.ink, fontSize: 10.2, fontWeight: '800' }}>{label}</Text>
              <Text style={{ color: fieldMap[key] ? MISSION_COLORS.accentDark : COLORS.inkFaint, fontSize: 8.8, marginTop: 2 }}>{fieldMap[key] || 'Non associé'}</Text>
            </View>
            <TouchableOpacity onPress={() => setColumnPicker({ key, label })} style={[styles.btnSecondary, missionStyles.secondaryButton]}>
              <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Choisir</Text>
            </TouchableOpacity>
          </View>)}
        </View>

        <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, fontWeight: '800', marginTop: 12 }}>APERÇU SOURCE</Text>
        {(sheet.rows || []).slice(0, 3).map((row) => <View key={row.id} style={{ backgroundColor: MISSION_COLORS.accentSoft, borderRadius: 9, padding: 8, marginTop: 6 }}>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8 }}>Ligne {row.row_index}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 8.8, marginTop: 2 }} numberOfLines={4}>{Object.entries(row.values || {}).map(([k, v]) => k + '=' + String(v ?? '')).join(' · ')}</Text>
        </View>)}

        <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { marginTop: 14, alignItems: 'center' }]} disabled={busy} onPress={saveAndApply}>
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{busy ? 'Application…' : 'Enregistrer le mapping & appliquer'}</Text>
        </TouchableOpacity>
      </View> : null}

      {mappings.length ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Mappings enregistrés</Text>
        {mappings.map((m) => <TouchableOpacity key={m.id} onPress={() => reuseMapping(m)} style={[missionStyles.card, { padding: 10, marginBottom: 6 }]}>
          <Text style={{ color: COLORS.ink, fontSize: 10.5, fontWeight: '900' }}>{m.name}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>{m.source_signature || 'Mapping Mission'}</Text>
        </TouchableOpacity>)}
      </> : null}

      {issues.length ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Points à vérifier dans l’import</Text>
        {issues.map((i) => <View key={i.id} style={[missionStyles.card, { padding: 10, marginBottom: 6 }]}>
          <Text style={{ color: i.severity === 'warning' ? '#8A5B14' : MISSION_COLORS.accentStrong, fontSize: 10, fontWeight: '900' }}>{i.message}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.5, marginTop: 2 }}>{[i.source_ref, i.suggestion].filter(Boolean).join(' · ')}</Text>
        </View>)}
      </> : null}
    </ScrollView>

    <Modal visible={!!columnPicker} transparent animationType="fade" onRequestClose={() => setColumnPicker(null)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, missionStyles.modalSheet]}>
        <Text style={[styles.modalTitle, missionStyles.title]}>{columnPicker?.label}</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5, marginBottom: 9 }}>Choisis la colonne Excel qui alimente ce champ METRA.</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          <TouchableOpacity onPress={() => { setFieldMap((m) => { const n = { ...m }; delete n[columnPicker.key]; return n; }); setColumnPicker(null); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: COLORS.inkFaint, fontSize: 10 }}>— Ne pas importer ce champ —</Text>
          </TouchableOpacity>
          {(sheet?.columns || []).map((column) => <TouchableOpacity key={column} onPress={() => { setFieldMap((m) => ({ ...m, [columnPicker.key]: column })); setColumnPicker(null); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: MISSION_COLORS.accentLine }}>
            <Text style={{ color: fieldMap[columnPicker?.key] === column ? MISSION_COLORS.accentStrong : COLORS.ink, fontSize: 10.5, fontWeight: fieldMap[columnPicker?.key] === column ? '900' : '600' }}>{column}</Text>
          </TouchableOpacity>)}
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}
