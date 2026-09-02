import React, { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { COLORS } from './styles.js';
import { getChampsVisite, upsertChamp } from './db.js';
import { HydraulicSchemaScreenV2 } from './HydraulicSchemaScreenV2.js';
import { HYDRAULIC_EQUIPMENT_TYPES, hydraulicPorts } from './hydraulicEquipmentLibrary.js';
import { mergeHydraulicSchemas, normalizeHydraulicSchema, summarizeHydraulicSchema } from './hydraulicSchemaFormat.js';

const SCHEMA_SECTION = 'schema.hydraulique';
const SCHEMA_KEY = 'layout_v1';
const EMPTY_SCHEMA = { version: 1, equipment: [], connections: [], networks: [], annotations: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validateEditorCompatibility(schema) {
  const supportedTypes = new Set(HYDRAULIC_EQUIPMENT_TYPES.map((item) => item.id));
  const unknownTypes = [...new Set(schema.equipment.map((item) => item.type).filter((type) => !supportedTypes.has(type)))];
  if (unknownTypes.length) throw new Error(`Type(s) d'équipement non reconnu(s) : ${unknownTypes.join(', ')}.`);

  schema.connections.forEach((connection, index) => {
    for (const [label, endpoint] of [['départ', connection.from], ['arrivée', connection.to]]) {
      if (endpoint?.free) continue;
      const equipment = schema.equipment.find((item) => item.id === endpoint?.equipmentId);
      if (!equipment) throw new Error(`Liaison ${index + 1} : équipement de ${label} introuvable.`);
      const ports = new Set(hydraulicPorts(equipment.type).map((port) => port.id));
      if (!ports.has(endpoint?.portId)) throw new Error(`Liaison ${index + 1} : borne « ${endpoint?.portId || '?'} » inconnue sur ${equipment.label || equipment.id}.`);
    }
  });
  return schema;
}

async function readStoredSchema(visiteId) {
  if (!visiteId) return EMPTY_SCHEMA;
  const rows = await getChampsVisite(visiteId);
  const row = rows.find((item) => item.section_code === SCHEMA_SECTION && item.cle === SCHEMA_KEY);
  if (!row?.valeur) return EMPTY_SCHEMA;
  try { return normalizeHydraulicSchema(JSON.parse(row.valeur)); }
  catch (error) {
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
      await sleep(650);
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/json', 'text/plain'], copyToCacheDirectory: true, multiple: false });
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
      const freeText = summary.freeEndpoints ? ` · ${summary.freeEndpoints} extrémité(s) libre(s)` : '';
      const detail = `${fileLabel}\n${summary.equipment} équipement(s) · ${summary.connections} réseau(x)${freeText}`;

      if (!hasCurrent) {
        await persistAndReload(incoming, `${detail}\nLe schéma a été importé dans la visite.`);
        return;
      }

      Alert.alert('Importer le schéma METRA', `${detail}\n\nUn schéma existe déjà pour cette visite.`, [
        { text: 'Annuler', style: 'cancel', onPress: remountEditor },
        { text: 'Fusionner', onPress: async () => {
          try { await persistAndReload(mergeHydraulicSchemas(current, incoming), `${detail}\nLe fichier a été fusionné avec le schéma existant.`); }
          catch (error) { remountEditor(); Alert.alert('Import impossible', String(error?.message || error)); }
        } },
        { text: 'Remplacer', style: 'destructive', onPress: async () => {
          try { await persistAndReload(incoming, `${detail}\nLe schéma précédent a été remplacé.`); }
          catch (error) { remountEditor(); Alert.alert('Import impossible', String(error?.message || error)); }
        } },
      ], { cancelable: false });
    } catch (error) {
      remountEditor();
      Alert.alert('Import JSON METRA impossible', String(error?.message || error));
    } finally { setImporting(false); }
  }, [visiteId, importing, persistAndReload, remountEditor]);

  return <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
    {editorVisible
      ? <HydraulicSchemaScreenV2 key={`hydraulic-${revision}`} route={route} onImportJson={importJson} importingJson={importing} />
      : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={COLORS.orange} /><Text style={{ marginTop: 10, color: COLORS.inkSoft }}>Préparation de l’import…</Text></View>}
  </View>;
}

export { HydraulicSchemaWorkspace };
