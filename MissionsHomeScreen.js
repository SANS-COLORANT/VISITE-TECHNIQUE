import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MetraSpinner as ActivityIndicator } from './MetraSpinner.js';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { listerMissions, MISSION_FAMILIES } from './missionsDb.js';
import { listerReprisesMissions } from './missionSheetDb.js';
import { GlassCard, IconOrb } from './premiumChrome.js';
import { ButtonGlow } from './ButtonGlow.js';
import { getPrefSync, PREFS } from './uiPrefs.js';
import { formatSheetAgo, plural } from './missionSheetUi.js';
import { choisirEtImporterMissionExcel } from './missionExcelImport.js';
import { choisirEtImporterPackageMission } from './missionPackageImport.js';
import { CvcIcon } from './MetraCvcIcons.js';

const STATUS_LABELS = Object.freeze({
  draft: 'Brouillon',
  active: 'En cours',
  waiting: 'En attente',
  closed: 'Clôturée',
  cancelled: 'Annulée',
});

const TYPE_LABELS = new Map(MISSION_FAMILIES.flatMap((family) => family.types.map(([key, label]) => [key, label])));
const FAMILY_LABELS = new Map(MISSION_FAMILIES.map((family) => [family.key, family.label]));
const typeLabel = (mission) => TYPE_LABELS.get(mission.type) || FAMILY_LABELS.get(mission.family) || mission.type || mission.family || null;

const FILTERS = Object.freeze([
  ['all', 'Toutes'],
  ['active', 'En cours'],
  ['draft', 'Brouillons'],
  ['waiting', 'En attente'],
  ['closed', 'Clôturées'],
]);

function SummaryCard({ value, label, emphasis = false }) {
  return (
    <View style={{ flex: 1, minWidth: 92, borderRadius: 16, padding: 12, backgroundColor: emphasis ? MISSION_COLORS.accent : '#FFFFFF', borderWidth: 1, borderColor: emphasis ? MISSION_COLORS.accent : MISSION_COLORS.accentLine }}>
      <Text style={{ fontSize: 23, lineHeight: 26, fontFamily: FONTS.black, color: emphasis ? '#FFFFFF' : MISSION_COLORS.accentStrong }}>{value}</Text>
      <Text style={{ marginTop: 4, fontSize: 12, fontFamily: FONTS.bodyBold, color: emphasis ? '#EAF7EF' : COLORS.inkSoft }}>{label}</Text>
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
        backgroundColor: 'rgba(255,255,255,0.82)',
        borderWidth: 1,
        borderColor: MISSION_COLORS.accentLine,
        borderRadius: compact ? 15 : 18,
        padding: compact ? 13 : 15,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: active ? MISSION_COLORS.accent : MISSION_COLORS.accentLineStrong }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: compact ? 14.5 : 15.5, lineHeight: compact ? 19 : 20 }} numberOfLines={2}>
            {mission.label || 'Mission sans titre'}
          </Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 17, marginTop: 4, fontFamily: FONTS.bodyMedium }} numberOfLines={2}>
            {[mission.client_name, typeLabel(mission)].filter(Boolean).join(' · ') || 'Contexte à compléter'}
          </Text>
          {mission.reference ? <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 12, fontFamily: FONTS.bodyBold, marginTop: 5 }}>Réf. {mission.reference}</Text> : null}
        </View>
        <View style={{ backgroundColor: statusBg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: statusColor, fontSize: 12, fontFamily: FONTS.bodyBold }}>{STATUS_LABELS[mission.status] || mission.status || 'Brouillon'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <View style={{ borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={{ color: COLORS.inkSoft, fontSize: 12, fontFamily: FONTS.bodySemi }}>{mission.site_count || 0} site(s)</Text></View>
        <View style={{ borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={{ color: COLORS.inkSoft, fontSize: 12, fontFamily: FONTS.bodySemi }}>{mission.visit_count || 0} visite(s)</Text></View>
        <View style={{ borderRadius: 9, backgroundColor: (mission.open_point_count || 0) > 0 ? MISSION_COLORS.accentLight : MISSION_COLORS.accentSoft, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={{ color: (mission.open_point_count || 0) > 0 ? MISSION_COLORS.accentDark : COLORS.inkSoft, fontSize: 12, fontFamily: (mission.open_point_count || 0) > 0 ? FONTS.bodyBold : FONTS.bodySemi }}>{mission.open_point_count || 0} point(s) ouvert(s)</Text></View>
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
        paddingHorizontal: 14,
        minHeight: 44,
        justifyContent: 'center',
        marginRight: 7,
        marginBottom: 7,
        borderWidth: 1,
        borderColor: active ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
        backgroundColor: active ? MISSION_COLORS.accent : '#FFFFFF',
      }}
    >
      <Text style={{ color: active ? '#FFFFFF' : MISSION_COLORS.accentDark, fontSize: 13.5, fontFamily: FONTS.bodyBold }}>{label}</Text>
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
  const [resumeVisit, setResumeVisit] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, resumes] = await Promise.all([
        listerMissions({ limit: 80 }),
        listerReprisesMissions({ limit: 1 }).catch(() => []),
      ]);
      setMissions(list);
      setResumeVisit(resumes?.[0] || null);
    }
    finally { setLoading(false); }
  }, []);

  // Âge de la dernière sauvegarde automatique, seulement si un dossier est configuré.
  const backupLine = useMemo(() => {
    if (!getPrefSync(PREFS.dossierSauvegardeAuto, null)) return null;
    const last = getPrefSync(PREFS.derniereSauvegardeAuto, null);
    return last ? `Sauvegarde ${formatSheetAgo(last)}` : 'Aucune sauvegarde encore faite';
  }, [missions]);

  useEffect(() => { reload(); }, [reload]);

  const importExcel = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await choisirEtImporterMissionExcel();
      if (!result) return;
      await reload();
      if (result.canonical) {
        Alert.alert('Mission importée', 'Le classeur METRA a été réintégré avec ses données structurées et ses liaisons.');
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
        result.mapLayers?.restored || 0,
      ].reduce((sum, value) => sum + Number(value || 0), 0);
      Alert.alert(
        'Dossier Mission restauré',
        (result.mission?.label || 'Mission') + '\n\n'
          + restoredFiles + ' fichier(s)/couche(s) restauré(s) hors ligne. '
          + 'Les données structurées ont été réintégrées depuis l’Excel relationnel.'
      );
      navigation.navigate('Mission', { missionId: result.missionId });
    } catch (e) {
      Alert.alert('Restauration ZIP impossible', String(e?.message || e));
    } finally {
      setRestoringPackage(false);
    }
  };

  const stats = useMemo(() => ({
    active: missions.filter((m) => m.status === 'active').length,
    draft: missions.filter((m) => m.status === 'draft').length,
    waiting: missions.filter((m) => m.status === 'waiting').length,
    openPoints: missions.reduce((sum, m) => sum + Number(m.open_point_count || 0), 0),
  }), [missions]);

  const resume = useMemo(() => missions
    .filter((m) => ['active', 'waiting', 'draft'].includes(m.status))
    .slice(0, 3), [missions]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    return missions.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (!q) return true;
      return `${m.label || ''} ${m.client_name || ''} ${m.family || ''} ${m.type || ''} ${m.reference || ''}`.toLocaleLowerCase('fr').includes(q);
    });
  }, [missions, query, filter]);

  const header = (
    <>
      <View style={{ backgroundColor: MISSION_COLORS.accentStrong, borderRadius: 22, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -28, top: -34, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        <View style={{ position: 'absolute', right: 38, bottom: -38, width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <Text style={{ color: '#BFE2CC', fontSize: 12, fontFamily: FONTS.bodyBold, letterSpacing: 1.2 }}>ESPACE MISSIONS</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 23, fontFamily: FONTS.black, marginTop: 5 }}>Piloter les dossiers ponctuels</Text>
        <Text style={{ color: '#D7EEE0', fontSize: 13, lineHeight: 18, marginTop: 6, maxWidth: '88%', fontFamily: FONTS.bodyMedium }}>
          Préparation, terrain, points à suivre et données exploitables sur PC — sans lien avec l’Intranet.
        </Text>
        {backupLine ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.12)' }}><CvcIcon name="cloud-check" size={15} color="#D7EEE0" strokeWidth={2.1} /><Text style={{ color: '#D7EEE0', fontSize: 12, fontFamily: FONTS.bodySemi }}>{backupLine}</Text></View> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MissionCreate')}
            activeOpacity={0.82}
            style={{ minHeight: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.82)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><CvcIcon name="plus" size={18} color={MISSION_COLORS.accentStrong} strokeWidth={2.2} /><Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.bodyBold, fontSize: 14 }}>Nouvelle Mission</Text></View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={importExcel}
            disabled={importing}
            activeOpacity={0.82}
            style={{ minHeight: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><CvcIcon name="upload" size={18} color={'#FFFFFF'} strokeWidth={2.2} /><Text style={{ color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 14 }}>{importing ? 'Import…' : 'Importer Excel'}</Text></View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={restorePackage}
            disabled={restoringPackage}
            activeOpacity={0.82}
            style={{ minHeight: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><CvcIcon name="storage" size={18} color={'#FFFFFF'} strokeWidth={2.2} /><Text style={{ color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 14 }}>{restoringPackage ? 'Restauration…' : 'Restaurer ZIP'}</Text></View>
          </TouchableOpacity>
        </View>
      </View>

      {resumeVisit ? (
        <GlassCard radius={22} style={{ marginBottom: 14 }}>
          <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconOrb accent={MISSION_COLORS.accent} light={MISSION_COLORS.accentLight} size={46}>
              <CvcIcon name="play" size={23} color={MISSION_COLORS.accentDark} strokeWidth={2} />
            </IconOrb>
            <View style={{ flex: 1 }}>
              <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 12, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Reprendre où tu en étais</Text>
              <Text style={{ color: COLORS.ink, fontSize: 15.5, lineHeight: 20, fontFamily: FONTS.bold, marginTop: 2 }} numberOfLines={2}>{resumeVisit.mission_label || 'Mission'}</Text>
              <Text style={{ color: COLORS.inkSoft, fontSize: 12.5, lineHeight: 17, fontFamily: FONTS.bodyMedium, marginTop: 2 }} numberOfLines={2}>
                {[resumeVisit.site_name, `modifiée ${formatSheetAgo(resumeVisit.touched_at)}`, resumeVisit.photos_count ? plural(resumeVisit.photos_count, 'photo') : null, resumeVisit.fields_count ? plural(resumeVisit.fields_count, 'champ') : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Reprendre la visite de ${resumeVisit.mission_label || 'la Mission'}`}
            onPress={() => navigation.navigate('MissionVisit', { missionId: resumeVisit.mission_id, visitId: resumeVisit.visit_id })}
            style={{ minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <ButtonGlow tone="mission" radius={17} />
            <CvcIcon name="play" size={20} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={{ color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 }}>Reprendre la visite</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Mission', { missionId: resumeVisit.mission_id })} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: MISSION_COLORS.accent, fontFamily: FONTS.bodyBold, fontSize: 13.5 }}>Ouvrir la fiche Mission</Text>
          </TouchableOpacity>
          </View>
        </GlassCard>
      ) : null}

      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('MissionForms', {})} activeOpacity={0.85}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 18, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: 'rgba(255,255,255,0.86)', padding: 14, marginBottom: 14 }}>
        <IconOrb accent={MISSION_COLORS.accent} light={MISSION_COLORS.accentLight} size={42}><CvcIcon name="control" size={21} color={MISSION_COLORS.accentDark} strokeWidth={2} /></IconOrb>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 15 }}>Trames & modèles</Text>
          <Text style={{ color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium, fontSize: 12.5, marginTop: 2 }}>Tes formulaires, listes, modèles Word et partage</Text>
        </View>
        <CvcIcon name="chevron-right" size={18} color={MISSION_COLORS.accent} strokeWidth={2.2} />
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <SummaryCard value={stats.active} label="En cours" emphasis />
        <SummaryCard value={stats.draft} label="Brouillons" />
        <SummaryCard value={stats.openPoints} label="Points ouverts" />
      </View>

      {resume.length ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={[{ flex: 1, fontSize: 12, fontFamily: FONTS.bodyBold, textTransform: 'uppercase', letterSpacing: 0.6 }, missionStyles.sectionLabel]}>À reprendre</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 12, fontFamily: FONTS.bodyMedium }}>Priorité aux Missions actives</Text>
        </View>
        {resume.map((mission) => <MissionCard key={`resume-${mission.id}`} mission={mission} compact onPress={() => navigation.navigate('Mission', { missionId: mission.id })} />)}
      </> : null}

      <View style={{ marginTop: 6, marginBottom: 10 }}>
        <Text style={[{ fontSize: 12, fontFamily: FONTS.bodyBold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }, missionStyles.sectionLabel]}>Rechercher et filtrer</Text>
        <View style={[{ minHeight: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 10 }, missionStyles.input]}>
          <CvcIcon name="search" size={19} color={MISSION_COLORS.accentDark} strokeWidth={2.1} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Mission, client, référence…"
            placeholderTextColor={COLORS.inkFaint}
            style={{ flex: 1, color: COLORS.ink, fontSize: 15, fontFamily: FONTS.bodyMedium }}
            accessibilityLabel="Rechercher une Mission"
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {FILTERS.map(([key, label]) => <FilterChip key={key} active={filter === key} label={label} onPress={() => setFilter(key)} />)}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
        <Text style={[{ flex: 1, fontSize: 12, fontFamily: FONTS.bodyBold, textTransform: 'uppercase', letterSpacing: 0.6 }, missionStyles.sectionLabel]}>Toutes les Missions</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 12, fontFamily: FONTS.bodyMedium }}>{visible.length} affichée(s)</Text>
      </View>
    </>
  );

  return (
    <View style={[{ flex: 1 }, missionStyles.screen]}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => <MissionCard mission={item} onPress={() => navigation.navigate('Mission', { missionId: item.id })} />}
        ListEmptyComponent={loading
          ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={MISSION_COLORS.accent}/></View>
          : <View style={{ padding: 34, alignItems: 'center' }}><Text style={{ color: MISSION_COLORS.accentStrong, fontFamily: FONTS.black, fontSize: 15.5 }}>Aucune Mission dans cette vue</Text><Text style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: FONTS.bodyMedium, marginTop: 6, textAlign: 'center' }}>Change le filtre ou crée une Mission. Une Mission peut rester incomplète et être reprise plus tard.</Text></View>}
      />
    </View>
  );
}
