import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { creerVisiteMission } from './missionsDb.js';
import { getMissionFieldPlaybook } from './missionFieldPlaybooks.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';

const FILTERS = Object.freeze([
  ['all','Tous'],
  ['todo','À faire'],
  ['progress','En cours'],
  ['done','Terminés'],
  ['exception','Accès / replanif.'],
]);

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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.8, fontFamily: FONTS.black }}>{label}</Text>
  </TouchableOpacity>;
}

function progress(site) {
  const total = Number(site.campaign_total || 0);
  const done = Number(site.campaign_done || 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function siteState(site) {
  const total = Number(site.campaign_total || 0);
  const planned = Number(site.campaign_planned || 0);
  const done = Number(site.campaign_done || 0);
  const exceptions = Number(site.campaign_exception || 0);
  const hardExceptions = Number(site.campaign_hard_exception || 0);
  const visits = Number(site.visit_count || 0);
  const equipment = Number(site.equipment_count || 0);

  if (total > 0 && planned === 0) return 'done';
  if (hardExceptions > 0 && done === hardExceptions && Number(site.campaign_measured || 0) === 0) return 'exception';
  if (total > 0 && done > 0) return 'progress';
  if (visits > 0 || equipment > 0) return 'progress';
  if (exceptions > 0) return 'exception';
  return 'todo';
}

function stateLabel(state) {
  return {
    todo: 'À faire',
    progress: 'En cours',
    done: 'Terminé',
    exception: 'Accès / replanifier',
  }[state] || state;
}

export function MissionCampaignDashboardScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [sites, setSites] = useState([]);
  const [missionType, setMissionType] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busySiteId, setBusySiteId] = useState(null);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [mission, rows] = await Promise.all([
      db.getFirstAsync('SELECT type FROM missions WHERE id=?', [missionId]),
      db.getAllAsync(
        `SELECT s.*,
          (SELECT COUNT(*) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id) AS visit_count,
          (SELECT MAX(COALESCE(v.visit_date,v.created_at)) FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id) AS last_visit_at,
          (SELECT id FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id ORDER BY COALESCE(v.visit_date,v.created_at) DESC LIMIT 1) AS last_visit_id,
          (SELECT status FROM mission_visits v WHERE v.mission_id=? AND v.site_id=s.id ORDER BY COALESCE(v.visit_date,v.created_at) DESC LIMIT 1) AS last_visit_status,
          (SELECT COUNT(*) FROM mission_equipment e WHERE e.site_id=s.id) AS equipment_count,
          (SELECT COUNT(*) FROM mission_points p WHERE p.mission_id=? AND p.site_id=s.id AND p.status NOT IN ('closed','cancelled','no_follow_up')) AS open_points,
          (SELECT COUNT(*) FROM mission_actions a WHERE a.mission_id=? AND a.site_id=s.id AND a.status NOT IN ('closed','cancelled')) AS open_actions,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id) AS campaign_total,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status='planned') AS campaign_planned,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status='measured') AS campaign_measured,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status<>'planned') AS campaign_done,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status NOT IN ('planned','measured','not_applicable')) AS campaign_exception,
          (SELECT COUNT(*) FROM mission_measure_campaign_points cp WHERE cp.mission_id=? AND cp.site_id=s.id AND cp.status IN ('inaccessible','refusal','absent','reschedule')) AS campaign_hard_exception
         FROM mission_sites s
         JOIN mission_site_links ml ON ml.site_id=s.id
         WHERE ml.mission_id=?
         ORDER BY s.name`,
        [
          missionId,missionId,missionId,missionId,
          missionId,missionId,
          missionId,missionId,missionId,missionId,missionId,missionId,
          missionId,
        ]
      ),
    ]);
    setMissionType(mission?.type || null);
    setSites(rows || []);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const enriched = useMemo(
    () => sites.map((site) => ({ ...site, derived_state: siteState(site), progress_pct: progress(site) })),
    [sites]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((site) => {
      if (filter !== 'all' && site.derived_state !== filter) return false;
      if (!q) return true;
      return [site.name,site.city,site.address,site.reference]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [enriched, filter, query]);

  const summary = useMemo(() => ({
    total: enriched.length,
    todo: enriched.filter((site) => site.derived_state === 'todo').length,
    progress: enriched.filter((site) => site.derived_state === 'progress').length,
    done: enriched.filter((site) => site.derived_state === 'done').length,
    exception: enriched.filter((site) => site.derived_state === 'exception').length,
  }), [enriched]);

  const openSite = async (site) => {
    if (busySiteId) return;
    setBusySiteId(site.id);
    try {
      if (site.last_visit_id && site.last_visit_status === 'draft') {
        navigation.navigate('MissionVisit',{ missionId, visitId: site.last_visit_id });
        return;
      }
      const playbook = getMissionFieldPlaybook(missionType);
      const visitId = await creerVisiteMission({
        missionId,
        siteId: site.id,
        visitType: playbook.defaultVisitType || 'campagne terrain',
      });
      await load();
      navigation.navigate('MissionVisit',{ missionId, visitId });
    } catch (e) {
      Alert.alert('Site non ouvert', String(e?.message || e));
    } finally {
      setBusySiteId(null);
    }
  };

  const nextSite = useMemo(
    () => enriched.find((site) => site.derived_state === 'progress')
      || enriched.find((site) => site.derived_state === 'todo')
      || enriched.find((site) => site.derived_state === 'exception')
      || null,
    [enriched]
  );

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.sectionTitle, missionStyles.title]}>Campagne multi-sites</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Cockpit léger pour 5 comme pour plusieurs centaines de sites : progression, accès, visites, inventaire, points et actions sans ouvrir chaque dossier.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
        {[
          [summary.total,'sites'],
          [summary.todo,'à faire'],
          [summary.progress,'en cours'],
          [summary.done,'terminés'],
          [summary.exception,'accès / replanif.'],
        ].map(([value,label]) => <View key={label} style={[missionStyles.statBox,{minWidth:'29%',flexGrow:1,padding:9,borderRadius:11}]}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 14, fontFamily: FONTS.black }}>{value}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>

      {nextSite ? <TouchableOpacity
        style={[styles.btnPrimary, missionStyles.primaryButton, { marginTop: 12, alignItems: 'center', paddingVertical: 11 }]}
        disabled={busySiteId === nextSite.id}
        onPress={() => openSite(nextSite)}
      >
        <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>
          {busySiteId === nextSite.id ? 'Ouverture…' : 'Continuer · ' + nextSite.name}
        </Text>
      </TouchableOpacity> : null}

      <TextInput
        style={[styles.input,missionStyles.input,{marginTop:12}]}
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher un site, une ville, une référence…"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 9 }}>
        {FILTERS.map(([key,label]) => <Chip key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} />)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2, marginBottom: 10 }}>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionMap',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Carte</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionMeasurementCampaign',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Campagnes de mesures</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionEquipment',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Inventaire global</Text>
        </TouchableOpacity>
      </View>

      {visible.map((site) => {
        const state = site.derived_state;
        return <View key={site.id} style={[missionStyles.card,{padding:11,marginBottom:8}]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.ink, fontSize: 10.8, fontFamily: FONTS.black }}>{site.name}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 2 }}>{[site.city,site.reference].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ borderRadius: 9, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: state === 'done' ? MISSION_COLORS.accentLight : '#FFFFFF', paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ color: state === 'done' ? MISSION_COLORS.accentDark : COLORS.inkSoft, fontSize: 8.2, fontFamily: FONTS.black }}>{stateLabel(state)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
            <Text style={{ color: COLORS.inkSoft, fontSize: 8.6 }}>{site.visit_count || 0} visite(s)</Text>
            <Text style={{ color: COLORS.inkSoft, fontSize: 8.6 }}>· {site.equipment_count || 0} équipement(s)</Text>
            <Text style={{ color: Number(site.open_points || 0) ? '#8A5B14' : COLORS.inkFaint, fontSize: 8.6 }}>· {site.open_points || 0} point(s) ouvert(s)</Text>
            <Text style={{ color: Number(site.open_actions || 0) ? '#8A5B14' : COLORS.inkFaint, fontSize: 8.6 }}>· {site.open_actions || 0} action(s)</Text>
          </View>

          {Number(site.campaign_total || 0) ? <View style={{ marginTop: 8 }}>
            <View style={{ height: 6, borderRadius: 4, backgroundColor: '#E7ECE9', overflow: 'hidden' }}>
              <View style={{ height: 6, width: Math.max(2,site.progress_pct) + '%', backgroundColor: MISSION_COLORS.accent }} />
            </View>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 4 }}>
              Campagne : {site.campaign_done || 0}/{site.campaign_total || 0} traité(s) · {site.progress_pct} %
              {Number(site.campaign_exception || 0) ? ' · ' + site.campaign_exception + ' exception(s)' : ''}
            </Text>
          </View> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
            <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} disabled={busySiteId === site.id} onPress={() => openSite(site)}>
              <Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>{site.last_visit_status === 'draft' ? 'Reprendre la visite' : 'Ouvrir terrain'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionEquipment',{missionId,siteId:site.id})}>
              <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Inventaire</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionActions',{missionId,siteId:site.id})}>
              <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Actions</Text>
            </TouchableOpacity>
          </View>
          {site.last_visit_at ? <Text style={{ color: COLORS.inkFaint, fontSize: 7.9, marginTop: 6 }}>Dernière occurrence : {site.last_visit_at}</Text> : null}
        </View>;
      })}

      {!visible.length ? <View style={[missionStyles.card,{padding:14}]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun site dans cette sélection.</Text>
      </View> : null}
    </ScrollView>
  </View>;
}
