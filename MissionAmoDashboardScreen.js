import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { ButtonGlow } from './ButtonGlow.js';

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' : '—';
}

function yearOf(value) {
  const match = String(value || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

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

export function MissionAmoDashboardScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const currentYear = new Date().getFullYear();
  const [mission, setMission] = useState(null);
  const [workstreams, setWorkstreams] = useState([]);
  const [visits, setVisits] = useState([]);
  const [actions, setActions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [m,w,v,a,d,e] = await Promise.all([
      db.getFirstAsync('SELECT * FROM missions WHERE id=?', [missionId]),
      db.getAllAsync(
        `SELECT w.*,
          (SELECT COUNT(*) FROM mission_subjects s WHERE s.workstream_id=w.id) AS subject_count,
          (SELECT COUNT(*) FROM mission_subjects s WHERE s.workstream_id=w.id AND s.status<>'closed') AS open_subject_count,
          (SELECT COUNT(*) FROM mission_actions a
             JOIN mission_subjects s ON s.id=a.subject_id
             WHERE s.workstream_id=w.id AND a.status NOT IN ('closed','cancelled')) AS open_action_count
         FROM mission_workstreams w
         WHERE w.mission_id=? ORDER BY w.sort_order,w.label`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT v.*,s.name AS site_name,p.label AS phase_label
         FROM mission_visits v
         LEFT JOIN mission_sites s ON s.id=v.site_id
         LEFT JOIN mission_phases p ON p.id=v.phase_id
         WHERE v.mission_id=? ORDER BY COALESCE(v.visit_date,v.created_at) DESC`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT a.*,sub.workstream_id,sub.label AS subject_label,
          actor.company AS responsible_company,actor.name AS responsible_name
         FROM mission_actions a
         LEFT JOIN mission_subjects sub ON sub.id=a.subject_id
         LEFT JOIN mission_actors actor ON actor.id=a.responsible_actor_id
         WHERE a.mission_id=? ORDER BY COALESCE(a.due_date,'9999-12-31'),a.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT ed.*,actor.company AS responsible_company,actor.name AS responsible_name
         FROM mission_expected_documents ed
         LEFT JOIN mission_actors actor ON actor.id=ed.responsible_actor_id
         WHERE ed.mission_id=? ORDER BY COALESCE(ed.due_date,'9999-12-31'),ed.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT e.*,s.name AS site_name
         FROM mission_equipment e
         JOIN mission_site_links ml ON ml.site_id=e.site_id
         LEFT JOIN mission_sites s ON s.id=e.site_id
         WHERE ml.mission_id=? ORDER BY e.replacement_year,s.name,e.type`,
        [missionId]
      ),
    ]);
    setMission(m || null);
    setWorkstreams(w || []);
    setVisits(v || []);
    setActions(a || []);
    setDocuments(d || []);
    setEquipment(e || []);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const years = useMemo(() => {
    const values = new Set([currentYear]);
    const start = yearOf(mission?.start_date);
    const end = yearOf(mission?.end_date);
    if (start) values.add(start);
    if (end) values.add(end);
    for (const row of visits) {
      const y = yearOf(row.visit_date || row.created_at);
      if (y) values.add(y);
    }
    for (const row of actions) {
      const y = yearOf(row.due_date || row.created_at);
      if (y) values.add(y);
    }
    for (const row of equipment) {
      const y = Number(row.replacement_year);
      if (Number.isFinite(y) && y > 2000 && y < 2200) values.add(y);
    }
    return [...values].sort((a,b) => a-b);
  }, [mission, visits, actions, equipment, currentYear]);

  React.useEffect(() => {
    if (!years.includes(selectedYear)) setSelectedYear(years.includes(currentYear) ? currentYear : years[0]);
  }, [years, selectedYear, currentYear]);

  const yearVisits = useMemo(
    () => visits.filter((row) => yearOf(row.visit_date || row.created_at) === selectedYear),
    [visits, selectedYear]
  );
  const yearActions = useMemo(
    () => actions.filter((row) => yearOf(row.due_date || row.created_at) === selectedYear),
    [actions, selectedYear]
  );
  const yearDocuments = useMemo(
    () => documents.filter((row) => yearOf(row.due_date || row.created_at) === selectedYear),
    [documents, selectedYear]
  );
  const yearRenewals = useMemo(
    () => equipment.filter((row) => Number(row.replacement_year) === selectedYear),
    [equipment, selectedYear]
  );

  const openActions = yearActions.filter((row) => !['closed','cancelled'].includes(row.status));
  const overdue = actions.filter((row) =>
    !['closed','cancelled'].includes(row.status)
    && row.due_date
    && row.due_date < new Date().toISOString().slice(0,10)
  );
  const expectedDocs = yearDocuments.filter((row) => !['validated','up_to_date','not_existing'].includes(row.status));
  const renewalCost = yearRenewals.reduce((sum,row) => sum + (Number(row.replacement_cost) || 0), 0);

  const nextItems = useMemo(() => {
    const today = new Date().toISOString().slice(0,10);
    return actions
      .filter((row) => !['closed','cancelled'].includes(row.status))
      .sort((a,b) => {
        const aa = a.due_date || '9999-12-31';
        const bb = b.due_date || '9999-12-31';
        return aa.localeCompare(bb) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })
      .slice(0,10)
      .map((row) => ({ ...row, overdue: Boolean(row.due_date && row.due_date < today) }));
  }, [actions]);

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Pilotage AMO / exploitation</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Vue longue durée de la même Mission : Volets exploitation, énergie, P3, PPI, réunions et réception. Les visites, sujets, actions et renouvellements restent reliés au même dossier.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        {years.map((year) => <Chip key={year} label={String(year)} selected={selectedYear === year} onPress={() => setSelectedYear(year)} />)}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {[
          [yearVisits.length, 'occurrence(s)'],
          [openActions.length, 'action(s) ouverte(s)'],
          [expectedDocs.length, 'document(s) attendu(s)'],
          [yearRenewals.length, 'renouvellement(s)'],
          [money(renewalCost), 'projection P3'],
          [overdue.length, 'échéance(s) dépassée(s)'],
        ].map(([value,label]) => <View key={label} style={[missionStyles.statBox,{minWidth:'29%',flexGrow:1,padding:9,borderRadius:11}]}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 13.5, fontFamily: FONTS.black }}>{value}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
        <TouchableOpacity style={[styles.btnPrimary,missionStyles.primaryButton]} onPress={() => navigation.navigate('MissionWorkflow',{missionId})}><ButtonGlow tone="mission" />
          <Text style={[styles.btnPrimaryText,missionStyles.primaryButtonText]}>Workflow / occurrences</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionSubjects',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Sujets & décisions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionActions',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Actions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionP3Dashboard',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Projection P2 / P3</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary,missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionDocuments',{missionId})}>
          <Text style={[styles.btnSecondaryText,missionStyles.secondaryButtonText]}>Documents</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel,missionStyles.sectionLabel,{marginTop:18}]}>Volets / axes</Text>
      {workstreams.length ? workstreams.map((row) => <View key={row.id} style={[missionStyles.card,{padding:11,marginBottom:7}]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10.6, fontFamily: FONTS.black }}>{row.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 2 }}>{[row.kind,row.status].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.4, fontFamily: FONTS.black }}>
            {row.open_subject_count || 0} sujet(s) ouvert(s) · {row.open_action_count || 0} action(s)
          </Text>
        </View>
        {row.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 8.8, lineHeight: 12, marginTop: 4 }}>{row.description}</Text> : null}
      </View>) : <TouchableOpacity
        style={[missionStyles.card,{padding:13}]}
        onPress={() => navigation.navigate('MissionWorkflow',{missionId})}
      >
        <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 10, fontFamily: FONTS.black }}>Préparer les volets métier</Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, lineHeight: 12, marginTop: 3 }}>Exploitation · Énergie · P3 · PPI · Réunions · Réception</Text>
      </TouchableOpacity>}

      <Text style={[styles.sectionLabel,missionStyles.sectionLabel,{marginTop:18}]}>À traiter ensuite</Text>
      {nextItems.map((row) => <TouchableOpacity
        key={row.id}
        onPress={() => navigation.navigate('MissionActions',{missionId})}
        style={[missionStyles.card,{padding:10,marginBottom:7}]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.ink, fontSize: 10, fontFamily: FONTS.black }}>{row.label}</Text>
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, marginTop: 3 }}>{[row.subject_label,row.responsible_company || row.responsible_name].filter(Boolean).join(' · ') || 'Contexte à compléter'}</Text>
          </View>
          <Text style={{ color: row.overdue ? '#8B3A3A' : MISSION_COLORS.accentDark, fontSize: 8.3, fontFamily: FONTS.black }}>
            {row.overdue ? 'ÉCHUE · ' : ''}{row.due_date || row.due_text || 'Sans date'}
          </Text>
        </View>
      </TouchableOpacity>)}
      {!nextItems.length ? <Text style={{ color: COLORS.inkFaint, fontSize: 9.3 }}>Aucune action ouverte.</Text> : null}

      <Text style={[styles.sectionLabel,missionStyles.sectionLabel,{marginTop:18}]}>Bilan {selectedYear}</Text>
      <View style={[missionStyles.card,{padding:11}]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9, lineHeight: 13 }}>
          {yearVisits.length} occurrence(s) · {yearActions.length} action(s) enregistrée(s) · {yearDocuments.length} document(s) suivi(s) · {yearRenewals.length} renouvellement(s) positionné(s).
        </Text>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, lineHeight: 12, marginTop: 5 }}>
          Cette vue consolide les données de la Mission ; elle ne crée pas de données contractuelles ou budgétaires nouvelles.
        </Text>
      </View>
    </ScrollView>
  </View>;
}
