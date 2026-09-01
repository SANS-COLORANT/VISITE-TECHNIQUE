import React, { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { COLORS } from './styles.js';
import { getChampsVisite, upsertChamp } from './db.js';
import { HydraulicSchemaScreen } from './HydraulicSchemaScreen.js';
import { EQUIPMENT_TYPES, PORTS_BY_TYPE } from './HydraulicEquipmentSvg.js';
import { mergeHydraulicSchemas, normalizeHydraulicSchema, summarizeHydraulicSchema } from './hydraulicSchemaFormat.js';

const SCHEMA_SECTION = 'schema.hydraulique';
const SCHEMA_KEY = 'layout_v1';
const EMPTY_SCHEMA = { version: 1, equipment: [], connections: [], networks: [], annotations: [] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateEditorCompatibility(schema) {
  const supportedTypes = new Set(EQUIPMENT_TYPES.map((item) => item.id));
  const unknownTypes = [...new Set(schema.equipment.map((item) => item.type).filter((type) => !supportedTypes.has(type)))];
  if (unknownTypes.length) throw new Error(`Type(s) d'équipement non reconnu(s) : ${unknownTypes.join(', ')}.`);

  schema.connections.forEach((connection, index) => {
    const fromEquipment = schema.equipment.find((item) => item.id === connection.from?.equipmentId);
    const toEquipment = schema.equipment.find((item) => item.id === connection.to?.equipmentId);
    const fromPorts = new Set((PORTS_BY_TYPE[fromEquipment?.type] || []).map((port) => port.id));
    const toPorts = new Set((PORTS_BY_TYPE[toEquipment?.type] || []).map((port) => port.id));
    if (!fromPorts.has(connection.from?.portId)) throw new Error(`Liaison ${index + 1} : borne « ${connection.from?.portId || '?'} » inconnue sur ${fromEquipment?.label || fromEquipment?.id || 'le départ'}.`);
    if (!toPorts.has(connection.to?.portId)) throw new Error(`Liaison ${index + 1} : borne « ${connection.to?.portId || '?'} » inconnue sur ${toEquipment?.label || toEquipment?.id || "l'arrivée"}.`);
  });
  return schema;
}

async function readStoredSchema(visiteId) {
  if (!visiteId) return EMPTY_SCHEMA;
  const rows = await getChampsVisite(visiteId);
  const row = rows.find((item) => item.section_code === SCHEMA_SECTION && item.cle === SCHEMA_KEY);
  if (!row?.valeur) return EMPTY_SCHEMA;
  try {
    return normalizeHydraulicSchema(JSON.parse(row.valeur));
  } catch (error) {
    console.warn('Schéma existant non normalisable, conservation en mode remplacement uniquement', error);
    return EMPTY_SCHEMA;
  }
}

function HydraulicSchemaWorkspace({ route }) {
  const visiteId = route?.params?.visiteId;
  const [revision, setRevision] = useState(0);
  const [editorVisible, setEditorVisible] = useState(true);
  const [importing, setImporting] = useState(false);

  const remountEditor = useCallback(() => {
    setRevision((value) => value + 1);
    setEditorVisible(true);
  }, []);

  const persistAndReload = useCallback(async (schema, message) => {
    await upsertChamp(visiteId, SCHEMA_SECTION, SCHEMA_KEY, JSON.stringify(schema));
    remountEditor();
    Alert.alert('Import METRA terminé', message);
  }, [visiteId, remountEditor]);

  const importJson = useCallback(async () => {
    if (!visiteId || importing) return;
    setImporting(true);
    setEditorVisible(false);
    try {
      // Le démontage déclenche la sauvegarde immédiate de l'éditeur avant lecture du fichier.
      await sleep(700);
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) { remountEditor(); return; }

      const asset = picked.assets?.[0];
      if (!asset?.uri) throw new Error('Le fichier sélectionné est inaccessible.');
      const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch { throw new Error('Le fichier sélectionné n’est pas un JSON valide.'); }

      const incoming = validateEditorCompatibility(normalizeHydraulicSchema(parsed));
      const summary = summarizeHydraulicSchema(incoming);
      const current = await readStoredSchema(visiteId);
      const hasCurrent = current.equipment.length > 0 || current.connections.length > 0;
      const fileLabel = asset.name || 'schéma METRA';
      const detail = `${fileLabel}\n${summary.equipment} équipement(s) · ${summary.connections} liaison(s)`;

      if (!hasCurrent) {
        await persistAndReload(incoming, `${detail}\nLe schéma a été importé dans la visite.`);
        return;
      }

      Alert.alert(
        'Importer le schéma METRA',
        `${detail}\n\nUn schéma existe déjà pour cette visite. Que veux-tu faire ?`,
        [
          { text: 'Annuler', style: 'cancel', onPress: remountEditor },
          {
            text: 'Fusionner',
            onPress: async () => {
              try {
                const merged = mergeHydraulicSchemas(current, incoming);
                await persistAndReload(merged, `${detail}\nLe fichier a été fusionné avec le schéma existant.`);
              } catch (error) {
                remountEditor();
                Alert.alert('Import impossible', String(error?.message || error));
              }
            },
          },
          {
            text: 'Remplacer',
            style: 'destructive',
            onPress: async () => {
              try { await persistAndReload(incoming, `${detail}\nLe schéma précédent a été remplacé.`); }
              catch (error) {
                remountEditor();
                Alert.alert('Import impossible', String(error?.message || error));
              }
            },
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      remountEditor();
      Alert.alert('Import JSON METRA impossible', String(error?.message || error));
    } finally {
      setImporting(false);
    }
  }, [visiteId, importing, persistAndReload, remountEditor]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {editorVisible ? <HydraulicSchemaScreen key={`hydraulic-${revision}`} route={route} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={COLORS.orange} /><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Préparation de l’import…</Text></View>}
      <TouchableOpacity
        onPress={importJson}
        disabled={importing}
        style={{ position: 'absolute', right: 18, top: 10, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: importing ? COLORS.line : COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center', elevation: 7, zIndex: 250 }}
      >
        <Text style={{ color: importing ? COLORS.inkSoft : COLORS.white, fontWeight: '900', fontSize: 11.5 }}>{importing ? 'Import…' : '⇩ Importer JSON METRA'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export { HydraulicSchemaWorkspace };
