import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PanResponder,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { listerMissions } from './missionsDb.js';
import { choisirEtImporterMissionExcel } from './missionExcelImport.js';
import { choisirEtImporterPackageMission } from './missionPackageImport.js';

const STATUS_LABELS = Object.freeze({
  draft: 'Brouillon',
  active: 'En cours',
  waiting: 'En attente',
  closed: 'Clôturée',
  cancelled: 'Annulée'
});

const FILTERS = Object.freeze([
  ['all', 'Toutes'],
  ['active', 'En cours'],
  ['draft', 'Brouillons'],
  ['waiting', 'En attente'],
  ['closed', 'Clôturées']
]);

function SummaryCard({ value, label, emphasis = false }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 92,
        borderRadius: 16,
        padding: 12,
        backgroundColor: emphasis ? MISSION_COLORS.accent : '#FFFFFF',
        borderWidth: 1,
        borderColor: emphasis ? MISSION_COLORS.accent : MISSION_COLORS.accentLine
      }}
    >
      <Text
        style={{
          fontSize: 23,
          lineHeight: 26,
          fontWeight: '900',
          color: emphasis ? '#FFFFFF' : MISSION_COLORS.accentStrong
        }}
      >
        {value}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 9.5, fontWeight: '800', color: emphasis ? '#EAF7EF' : COLORS.inkSoft }}>
        {label}
      </Text>
    </View>
  );
}

function MissionCard({ mission, onPress, compact = false }) {
  const active = mission.status === 'active';
  const waiting = mission.status === 'waiting';
  const statusBg = active ? MISSION_COLORS.accentLight : waiting ? '#FFF7E7' : MISSION_COLORS.accentSoft;
  const statusColor = active ? MISSION_COLORS.accentDark : waiting ? '#8A5B12' : COLORS.inkSoft;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: MISSION_COLORS.accentLine,
        borderRadius: compact ? 15 : 18,
        padding: compact ? 13 : 15,
        marginBottom: 10,
        overflow: 'hidden'
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: active ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: compact ? 13 : 14.5 }} numberOfLines={2}>
            {mission.label || 'Mission sans titre'}
          </Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, marginTop: 4 }} numberOfLines={1}>
            {[mission.client_name, mission.type || mission.family].filter(Boolean).join(' · ') ||
              'Contexte à compléter'}
          </Text>
          {mission.reference ? (
            <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, fontWeight: '800', marginTop: 5 }}>
              Réf. {mission.reference}
            </Text>
          ) : null}
        </View>
        <View style={{ backgroundColor: statusBg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: statusColor, fontSize: 9, fontWeight: '900' }}>
            {STATUS_LABELS[mission.status] || mission.status || 'Brouillon'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <View
          style={{
            borderRadius: 9,
            backgroundColor: MISSION_COLORS.accentSoft,
            paddingHorizontal: 8,
            paddingVertical: 5
          }}
        >
          <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>{mission.site_count || 0} site(s)</Text>
        </View>
        <View
          style={{
            borderRadius: 9,
            backgroundColor: MISSION_COLORS.accentSoft,
            paddingHorizontal: 8,
            paddingVertical: 5
          }}
        >
          <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>{mission.visit_count || 0} visite(s)</Text>
        </View>
        <View
          style={{
            borderRadius: 9,
            backgroundColor:
              (mission.open_point_count || 0) > 0 ? MISSION_COLORS.accentLight : MISSION_COLORS.accentSoft,
            paddingHorizontal: 8,
            paddingVertical: 5
          }}
        >
          <Text
            style={{
              color: (mission.open_point_count || 0) > 0 ? MISSION_COLORS.accentDark : COLORS.inkSoft,
              fontSize: 9.5,
              fontWeight: (mission.open_point_count || 0) > 0 ? '800' : '500'
            }}
          >
            {mission.open_point_count || 0} point(s) ouvert(s)
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function FilterChip({ active, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        borderRadius: 13,
        paddingHorizontal: 11,
        paddingVertical: 8,
        marginRight: 7,
        marginBottom: 7,
        borderWidth: 1,
        borderColor: active ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: active ? MISSION_COLORS.accent : '#FFFFFF'
      }}
    >
      <Text style={{ color: active ? '#FFFFFF' : MISSION_COLORS.accentDark, fontSize: 10, fontWeight: '800' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function MissionsHomeScreen({ navigation }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [restoringPackage, setRestoringPackage] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMissions(await listerMissions({ limit: 80 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const importExcel = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await choisirEtImporterMissionExcel();
      if (!result) return;
      await reload();
      if (result.canonical) {
        Alert.alert(
          'Mission importée',
          'Le classeur METRA a été réintégré avec ses données structurées et ses liaisons.'
        );
        navigation.navigate('Mission', { missionId: result.missionId });
      } else {
        Alert.alert(
          'Classeur importé',
          `${result.rows || 0} ligne(s) provenant de ${result.sheets || 0} feuille(s) ont été conservées intégralement. Le mapping métier pourra être complété sans perdre la source Excel.`
        );
        navigation.navigate('Mission', { missionId: result.missionId });
      }
    } catch (e) {
      Alert.alert('Import Excel impossible', String(e?.message || e));
    } finally {
      setImporting(false);
    }
  };

  const restorePackage = async () => {
    if (restoringPackage) return;
    setRestoringPackage(true);
    try {
      const result = await choisirEtImporterPackageMission();
      if (!result) return;
      await reload();
      const restoredFiles = [
        result.photos?.restored || 0,
        result.documents?.restored || 0,
        result.plans?.restored || 0,
        result.mapLayers?.restored || 0
      ].reduce((sum, value) => sum + Number(value || 0), 0);
      Alert.alert(
        'Dossier Mission restauré',
        (result.mission?.label || 'Mission') +
          '\n\n' +
          restoredFiles +
          ' fichier(s)/couche(s) restauré(s) hors ligne. ' +
          'Les données structurées ont été réintégrées depuis l’Excel relationnel.'
      );
      navigation.navigate('Mission', { missionId: result.missionId });
    } catch (e) {
      Alert.alert('Restauration ZIP impossible', String(e?.message || e));
    } finally {
      setRestoringPackage(false);
    }
  };

  const stats = useMemo(
    () => ({
      active: missions.filter((m) => m.status === 'active').length,
      draft: missions.filter((m) => m.status === 'draft').length,
      waiting: missions.filter((m) => m.status === 'waiting').length,
      openPoints: missions.reduce((sum, m) => sum + Number(m.open_point_count || 0), 0)
    }),
    [missions]
  );

  const resume = useMemo(
    () => missions.filter((m) => ['active', 'waiting', 'draft'].includes(m.status)).slice(0, 3),
    [missions]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    return missions.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (!q) return true;
      return `${m.label || ''} ${m.client_name || ''} ${m.family || ''} ${m.type || ''} ${m.reference || ''}`
        .toLocaleLowerCase('fr')
        .includes(q);
    });
  }, [missions, query, filter]);

  const technicalVisitSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx < -22 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -85) navigation.goHome();
        }
      }),
    [navigation]
  );

  const header = (
    <>
      <View
        style={{
          backgroundColor: MISSION_COLORS.accentStrong,
          borderRadius: 22,
          padding: 18,
          marginBottom: 14,
          overflow: 'hidden'
        }}
      >
        <View
          style={{
            position: 'absolute',
            right: -28,
            top: -34,
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: 'rgba(255,255,255,0.06)'
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: 38,
            bottom: -38,
            width: 92,
            height: 92,
            borderRadius: 46,
            backgroundColor: 'rgba(255,255,255,0.05)'
          }}
        />
        <Text style={{ color: '#BFE2CC', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.2 }}>ESPACE MISSIONS</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 5 }}>
          Piloter les dossiers ponctuels
        </Text>
        <Text style={{ color: '#D7EEE0', fontSize: 10.5, lineHeight: 15, marginTop: 5, maxWidth: '82%' }}>
          Préparation, terrain, points à suivre et données exploitables sur PC — sans lien avec l’Intranet.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MissionCreate')}
            activeOpacity={0.82}
            style={{
              minHeight: 42,
              borderRadius: 13,
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              marginBottom: 8
            }}
          >
            <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900', fontSize: 11.5 }}>
              ＋ Nouvelle Mission
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={importExcel}
            disabled={importing}
            activeOpacity={0.82}
            style={{
              minHeight: 42,
              borderRadius: 13,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              marginBottom: 8
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11.5 }}>
              {importing ? 'Import…' : '⇧ Importer Excel'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={restorePackage}
            disabled={restoringPackage}
            activeOpacity={0.82}
            style={{
              minHeight: 42,
              borderRadius: 13,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11.5 }}>
              {restoringPackage ? 'Restauration…' : '↥ Restaurer ZIP'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <SummaryCard value={stats.active} label="En cours" emphasis />
        <SummaryCard value={stats.draft} label="Brouillons" />
        <SummaryCard value={stats.openPoints} label="Points ouverts" />
      </View>

      {resume.length ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text
              style={[
                { flex: 1, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
                missionStyles.sectionLabel
              ]}
            >
              À reprendre
            </Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 9 }}>Priorité aux Missions actives</Text>
          </View>
          {resume.map((mission) => (
            <MissionCard
              key={`resume-${mission.id}`}
              mission={mission}
              compact
              onPress={() => navigation.navigate('Mission', { missionId: mission.id })}
            />
          ))}
        </>
      ) : null}

      <View style={{ marginTop: 6, marginBottom: 10 }}>
        <Text
          style={[
            { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
            missionStyles.sectionLabel
          ]}
        >
          Rechercher et filtrer
        </Text>
        <View
          style={[
            {
              minHeight: 48,
              borderWidth: 1,
              borderRadius: 15,
              paddingHorizontal: 13,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10
            },
            missionStyles.input
          ]}
        >
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 18, marginRight: 8 }}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Mission, client, référence…"
            placeholderTextColor={COLORS.inkFaint}
            style={{ flex: 1, color: COLORS.ink, fontSize: 13.5 }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {FILTERS.map(([key, label]) => (
            <FilterChip key={key} active={filter === key} label={label} onPress={() => setFilter(key)} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
        <Text
          style={[
            { flex: 1, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
            missionStyles.sectionLabel
          ]}
        >
          Toutes les Missions
        </Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 9.5 }}>{visible.length} affichée(s)</Text>
      </View>
    </>
  );

  return (
    <View style={[{ flex: 1 }, missionStyles.screen]} {...technicalVisitSwipeResponder.panHandlers}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <MissionCard mission={item} onPress={() => navigation.navigate('Mission', { missionId: item.id })} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator color={MISSION_COLORS.accent} />
            </View>
          ) : (
            <View style={{ padding: 34, alignItems: 'center' }}>
              <Text style={{ color: MISSION_COLORS.accentStrong, fontWeight: '900' }}>
                Aucune Mission dans cette vue
              </Text>
              <Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 5, textAlign: 'center' }}>
                Change le filtre ou crée une Mission. Une Mission peut rester incomplète et être reprise plus tard.
              </Text>
            </View>
          )
        }
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 14,
          bottom: 18,
          borderRadius: 12,
          paddingHorizontal: 9,
          paddingVertical: 5,
          backgroundColor: 'rgba(31,95,67,0.10)'
        }}
      >
        <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9, fontWeight: '800' }}>
          ← Glisser vers la gauche · Visites techniques
        </Text>
      </View>
    </View>
  );
}
