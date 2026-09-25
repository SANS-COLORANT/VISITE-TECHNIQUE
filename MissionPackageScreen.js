import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { DEFAULT_MISSION_PACKAGE_OPTIONS, exporterPackageMission } from './missionPackageExport.js';

const ITEMS = [
  ['reportPdf', 'Rapport PDF'],
  ['reportDocx', 'Rapport Word DOCX'],
  ['individualReports', 'Rapports individuels par site'],
  ['excel', 'Excel complet relationnel'],
  ['excelClient', 'Excel client simplifié'],
  ['actionsSummary', 'Synthèse actions / réserves'],
  ['photos', 'Photos originales'],
  ['photoAlbumAll', 'Album PDF · toutes les photos'],
  ['photoAlbumReport', 'Album PDF · sélection rapport/client'],
  ['photoAlbumIssues', 'Album PDF · points / actions'],
  ['sourceDocuments', 'Documents sources'],
  ['sourcePlans', 'Plans sources'],
  ['annotatedPlans', 'Plans annotés PDF'],
  ['sigGeoJson', 'SIG GeoJSON'],
  ['sigGeoPackage', 'SIG GeoPackage QGIS'],
  ['offlineMapLayers', 'Rasters / tuiles cartographiques hors ligne'],
  ['synopticData', 'Données des synoptiques'],
  ['manifest', 'Manifest du dossier']
];

export function MissionPackageScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [options, setOptions] = useState({ ...DEFAULT_MISSION_PACKAGE_OPTIONS });
  const [busy, setBusy] = useState(false);

  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  const exportAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exporterPackageMission(missionId, options);
      Alert.alert('Dossier Mission créé', result.name + '\n\nLe ZIP regroupe uniquement les éléments sélectionnés.');
    } catch (e) {
      Alert.alert('Export impossible', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Text style={[styles.sectionTitle, missionStyles.title]}>Dossier complet Mission</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
          Compose le livrable final sans ressaisie. Le ZIP peut contenir l’Excel relationnel réimportable, un Excel
          client lisible, une synthèse actions / réserves, les rapports, médias, plans et données SIG.
        </Text>
        <View style={[missionStyles.card, { padding: 12, marginTop: 14 }]}>
          {ITEMS.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => toggle(key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 9,
                borderBottomWidth: 1,
                borderBottomColor: MISSION_COLORS.accentLine
              }}
            >
              <View
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: options[key] ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong,
                  backgroundColor: options[key] ? MISSION_COLORS.accentLight : '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900' }}>{options[key] ? '✓' : ''}</Text>
              </View>
              <Text style={{ marginLeft: 10, color: COLORS.ink, fontSize: 10.8, fontWeight: '800' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[
            styles.btnPrimary,
            missionStyles.primaryButton,
            { marginTop: 16, alignItems: 'center', paddingVertical: 13 }
          ]}
          disabled={busy}
          onPress={exportAll}
        >
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>
            {busy ? 'Création du dossier…' : 'Créer et partager le ZIP complet'}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.8, lineHeight: 13, marginTop: 8, textAlign: 'center' }}>
          Photos et documents lourds sont copiés dans le ZIP ; le classeur Excel conserve également leurs références et
          toute la provenance.
        </Text>
      </ScrollView>
    </View>
  );
}
