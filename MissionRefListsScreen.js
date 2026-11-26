/**
 * Listes de référence : marques, états, fiches CEE, lots… Saisies à la main
 * (une valeur par ligne) ou importées d'une colonne d'un classeur Excel, puis
 * réutilisées dans les champs « choix » des trames.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { BottomSheet, confirmer } from './VisitKit.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess } from './fieldFeedback.js';
import { missionSheetStore } from './missionSheetStore.js';
import { workbookColumns } from './missionRefListImport.js';
import { enregistrerListeRef, listerListesRef, supprimerListeRef } from './missionFormsDb.js';
import { SHEET_TYPE, SheetButton, SheetCard, SheetEmptyLine, SheetErgoProvider, SheetIconButton, SheetRow } from './missionSheetUi.js';

const errorText = (e) => String(e?.message || e || 'Erreur inconnue');
const parseItems = (raw) => { try { return JSON.parse(raw || '[]'); } catch { return []; } };

export function MissionRefListsScreen() {
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null); // { id, label, text, sourceName }
  const [columns, setColumns] = useState(null); // { name, items: [...] }
  const gloves = useMemo(() => missionSheetStore.getGloves(), []);

  const reload = useCallback(async () => setLists(await listerListesRef()), []);
  useEffect(() => { reload().catch(() => setLists([])); }, [reload]);

  const save = async () => {
    try {
      await enregistrerListeRef({ id: editing.id, label: editing.label, items: editing.text.split('\n'), sourceName: editing.sourceName });
      setEditing(null);
      hapticSuccess();
      await reload();
    } catch (e) {
      Alert.alert('Liste non enregistrée', errorText(e));
    }
  };

  const importExcel = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], copyToCacheDirectory: true, multiple: false });
      if (picked?.canceled) return;
      const asset = picked.assets?.[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const found = workbookColumns(XLSX.read(base64, { type: 'base64' }), XLSX);
      if (!found.length) throw new Error('Aucune colonne avec des valeurs dans ce classeur.');
      setColumns({ name: asset.name || 'Classeur', items: found });
    } catch (e) {
      Alert.alert('Import impossible', errorText(e));
    }
  };

  const pickColumn = (col) => {
    setColumns(null);
    setTimeout(() => setEditing({ id: null, label: col.header, text: col.values.join('\n'), sourceName: columns?.name || null }), 250);
  };

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[{ flex: 1 }, missionStyles.screen]}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={[SHEET_TYPE.meta, { paddingHorizontal: 4 }]}>Une liste se crée une fois et sert dans toutes les trames : dans le constructeur, choisis-la pour un champ « choix ».</Text>
          <View style={s.row}>
            <SheetButton icon="plus" label="Nouvelle liste" onPress={() => setEditing({ id: null, label: '', text: '', sourceName: null })} style={{ flex: 1 }} />
            <SheetButton icon="upload" label="Depuis Excel" onPress={importExcel} style={{ flex: 1 }} />
          </View>
          <SheetCard title="Mes listes" icon="list" count={lists.length || null}>
            {lists.length ? lists.map((list, index) => {
              const items = parseItems(list.items_json);
              return (
                <SheetRow
                  key={list.id}
                  icon="list"
                  title={list.label}
                  meta={`${items.length} valeur(s) · ${items.slice(0, 4).join(', ')}${items.length > 4 ? '…' : ''}`}
                  onPress={() => setEditing({ id: list.id, label: list.label, text: items.join('\n'), sourceName: null })}
                  right={<SheetIconButton icon="trash" tone="neutral" label={`Supprimer ${list.label}`} onPress={() => confirmer({ title: `Supprimer « ${list.label} » ?`, message: 'Les champs qui l’utilisent garderont leurs choix saisis à la main.', onConfirm: async () => { await supprimerListeRef(list.id); await reload(); showToast(list.label, { title: 'Liste supprimée' }); } })} />}
                  last={index === lists.length - 1}
                />
              );
            }) : <SheetEmptyLine icon="list" text="Aucune liste. Crée-en une ou importe une colonne d’un Excel." />}
          </SheetCard>
        </ScrollView>

        <BottomSheet
          visible={Boolean(editing)}
          onClose={() => setEditing(null)}
          title={editing?.id ? 'Modifier la liste' : 'Nouvelle liste'}
          subtitle="Une valeur par ligne ; doublons et lignes vides retirés."
          footer={<TouchableOpacity accessibilityRole="button" onPress={save} style={s.save}><Text style={s.saveText}>Enregistrer</Text></TouchableOpacity>}
        >
          <Text style={SHEET_TYPE.label}>Nom</Text>
          <TextInput value={editing?.label || ''} onChangeText={(v) => setEditing((e) => ({ ...e, label: v }))} placeholder="Ex. Marques de chaudières" placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: 52 }]} accessibilityLabel="Nom de la liste" />
          <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Valeurs</Text>
          <TextInput value={editing?.text || ''} onChangeText={(v) => setEditing((e) => ({ ...e, text: v }))} multiline placeholder={'Viessmann\nDe Dietrich\nAtlantic'} placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: 200, textAlignVertical: 'top' }]} accessibilityLabel="Valeurs, une par ligne" />
        </BottomSheet>

        <BottomSheet visible={Boolean(columns)} onClose={() => setColumns(null)} title="Quelle colonne ?" subtitle={columns?.name}>
          {columns?.items.map((col, index) => (
            <SheetRow key={`${col.sheet}-${col.column}`} icon="list" title={col.header} meta={`${col.sheet} · ${col.values.length} valeur(s) · ${col.values.slice(0, 3).join(', ')}`} onPress={() => pickColumn(col)} last={index === columns.items.length - 1} />
          ))}
        </BottomSheet>
      </View>
    </SheetErgoProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  input: { marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  save: { minHeight: 52, borderRadius: 17, backgroundColor: MISSION_COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 15 },
});
