import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { modifierEquipementMission } from './missionEquipmentDb.js';

const STATUS_BY_TYPE = Object.freeze({
  opr_reception: [
    ['installe','Installé'],
    ['controle','Contrôlé'],
    ['avec_reserve','Avec réserve'],
    ['receptionne','Réceptionné'],
  ],
  commissioning: [
    ['installe','Installé'],
    ['controle','Contrôlé'],
    ['avec_reserve','Avec réserve'],
    ['mis_en_service','Mis en service'],
  ],
  passation_travaux_exploitant: [
    ['receptionne','Réceptionné'],
    ['avec_reserve','Avec réserve'],
    ['mis_en_service','Mis en service'],
  ],
});

const LABEL_BY_TYPE = Object.freeze({
  opr_reception: 'OPR / réception',
  commissioning: 'Mise en service / commissioning',
  passation_travaux_exploitant: 'Passation travaux → exploitant',
});

function Chip({ label, selected, onPress }) {
  return <TouchableOpacity
    onPress={onPress}
    style={{
      borderWidth: 1,
      borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine,
      backgroundColor: selected ? MISSION_COLORS.accentLight : '#FFFFFF',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 7,
      marginRight: 6,
      marginBottom: 6,
    }}
  >
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.6, fontWeight: '900' }}>{label}</Text>
  </TouchableOpacity>;
}

function Stat({ value, label }) {
  return <View style={[missionStyles.statBox, { minWidth: '30%', flexGrow: 1, padding: 10, borderRadius: 11 }]}>
    <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 14, fontWeight: '900' }}>{value}</Text>
    <Text style={{ color: COLORS.inkFaint, fontSize: 8, marginTop: 2 }}>{label}</Text>
  </View>;
}

export function MissionReceptionBoardScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const [mission, setMission] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [tests, setTests] = useState([]);
  const [actions, setActions] = useState([]);
  const [points, setPoints] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [displayLimit, setDisplayLimit] = useState(120);
  const [activeModes, setActiveModes] = useState({ static: true, dynamic: true, clearance: true });

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [m,e,t,a,p,d] = await Promise.all([
      db.getFirstAsync('SELECT * FROM missions WHERE id=?', [missionId]),
      db.getAllAsync(
        `SELECT e.*,s.name AS site_name,l.label AS location_label
         FROM mission_equipment e
         JOIN mission_site_links ml ON ml.site_id=e.site_id
         LEFT JOIN mission_sites s ON s.id=e.site_id
         LEFT JOIN mission_locations l ON l.id=e.location_id
         WHERE ml.mission_id=?
         ORDER BY s.name,l.sort_order,e.type,e.brand,e.model`,
        [missionId]
      ),
      db.getAllAsync(
        `SELECT tr.*,p.label AS protocol_label,e.type AS equipment_type
         FROM mission_test_runs tr
         JOIN mission_test_protocols p ON p.id=tr.protocol_id
         LEFT JOIN mission_equipment e ON e.id=tr.equipment_id
         WHERE tr.mission_id=? ORDER BY tr.created_at DESC`,
        [missionId]
      ),
      db.getAllAsync(
        "SELECT * FROM mission_actions WHERE mission_id=? ORDER BY created_at DESC",
        [missionId]
      ),
      db.getAllAsync(
        "SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at DESC",
        [missionId]
      ),
      db.getAllAsync(
        "SELECT * FROM mission_expected_documents WHERE mission_id=? ORDER BY created_at DESC",
        [missionId]
      ),
    ]);
    setMission(m || null);
    setEquipment(e || []);
    setTests(t || []);
    setActions(a || []);
    setPoints(p || []);
    setDocuments(d || []);
  }, [missionId]);

  React.useEffect(() => { load(); }, [load]);

  const statuses = STATUS_BY_TYPE[mission?.type] || STATUS_BY_TYPE.opr_reception;
  const summary = useMemo(() => {
    const openReserves = points.filter((row) => row.type === 'reserve' && !['closed','no_follow_up','cancelled'].includes(row.status));
    const openActions = actions.filter((row) => !['closed','cancelled'].includes(row.status));
    const completedTests = tests.filter((row) => row.status === 'completed');
    const expectedPending = documents.filter((row) => !['received','validated','up_to_date','not_existing'].includes(row.status));
    return {
      equipment: equipment.length,
      checked: equipment.filter((row) => ['controle','receptionne','mis_en_service'].includes(row.lifecycle_status)).length,
      reserved: equipment.filter((row) => row.lifecycle_status === 'avec_reserve').length,
      openReserves: openReserves.length,
      openActions: openActions.length,
      tests: tests.length,
      completedTests: completedTests.length,
      pendingDocuments: expectedPending.length,
      inventoryDifferences: equipment.filter((row) => ['different','non_retrouve','a_verifier'].includes(row.verification_status)).length,
    };
  }, [equipment,tests,actions,points,documents]);

  const setLifecycle = async (row, status) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      await modifierEquipementMission(row.id, { missionId, lifecycleStatus: status, changeComment: 'Mise à jour depuis tableau réception / passation' });
      setEquipment((all) => all.map((item) => item.id === row.id ? { ...item, lifecycle_status: status } : item));
    } finally {
      setBusyId(null);
    }
  };

  const setDocumentStatus = async (row, status) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const db = await getDb();
      await db.runAsync(
        "UPDATE mission_expected_documents SET status=?,updated_at=datetime('now') WHERE id=? AND mission_id=?",
        [status,row.id,missionId]
      );
      setDocuments((all) => all.map((item) => item.id === row.id ? { ...item, status } : item));
    } finally {
      setBusyId(null);
    }
  };

  const filteredEquipment = useMemo(() => {
    if (equipmentFilter === 'issues') return equipment.filter((row) => ['different','non_retrouve','a_verifier'].includes(row.verification_status));
    if (equipmentFilter === 'reserved') return equipment.filter((row) => row.lifecycle_status === 'avec_reserve');
    if (equipmentFilter === 'pending') return equipment.filter((row) => !['controle','receptionne','mis_en_service'].includes(row.lifecycle_status));
    return equipment;
  }, [equipment,equipmentFilter]);
  const displayedEquipment = filteredEquipment.slice(0, displayLimit);

  const title = LABEL_BY_TYPE[mission?.type] || 'Réception / mise en service';
  const toggleMode = (key) => setActiveModes((current) => ({ ...current, [key]: !current[key] }));
  const completionLabel = mission?.type === 'commissioning'
    ? 'mis en service'
    : mission?.type === 'passation_travaux_exploitant'
      ? 'remis / exploitable'
      : 'contrôlé / reçu';

  return <View style={{ flex: 1, backgroundColor: MISSION_COLORS.bg }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>{title}</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Tableau terrain synthétique : l’état de chaque ouvrage, les essais, les réserves, les actions et les documents restent reliés à la même Mission. Aucun inventaire n’est recréé pour cette phase.
      </Text>
      {mission?.type === 'opr_reception' ? <View style={[missionStyles.card, { padding: 11, marginTop: 12 }]}>
        <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontWeight: '900', letterSpacing: 0.45 }}>MODES OPR · CUMULABLES</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 8.8, lineHeight: 12, marginTop: 3 }}>
          Une même OPR peut combiner contrôle statique, essais dynamiques et recontrôle de réserves. Aucun dossier séparé n’est créé.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          <Chip label="OPR statique" selected={activeModes.static} onPress={() => toggleMode('static')} />
          <Chip label="OPR dynamique" selected={activeModes.dynamic} onPress={() => toggleMode('dynamic')} />
          <Chip label="Levée / recontrôle" selected={activeModes.clearance} onPress={() => toggleMode('clearance')} />
        </View>
      </View> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
        <Stat value={summary.equipment} label="ouvrages / équipements" />
        <Stat value={summary.checked} label={completionLabel} />
        <Stat value={summary.reserved} label="avec réserve" />
        <Stat value={summary.openReserves} label="réserves ouvertes" />
        <Stat value={summary.completedTests + '/' + summary.tests} label="essais terminés" />
        <Stat value={summary.pendingDocuments} label="documents attendus" />
        <Stat value={summary.inventoryDifferences} label="écarts inventaire" />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
        {activeModes.dynamic || mission?.type !== 'opr_reception' ? <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton]} onPress={() => navigation.navigate('MissionTests',{ missionId })}>
          <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>Essais</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionActions',{ missionId })}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Réserves / actions</Text>
        </TouchableOpacity>
        {mission?.type === 'opr_reception' && activeModes.clearance && summary.openReserves ? <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionReserveClearance',{ missionId })}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Levée / recontrôle</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionDocuments',{ missionId })}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Documents</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={() => navigation.navigate('MissionSignature',{ missionId })}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Signature / PV</Text>
        </TouchableOpacity>
      </View>

      {activeModes.static || mission?.type !== 'opr_reception' ? <>
      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Ouvrages · statut en 1 geste</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 7 }}>
        <Chip label={'Tous · ' + equipment.length} selected={equipmentFilter === 'all'} onPress={() => { setEquipmentFilter('all'); setDisplayLimit(120); }} />
        <Chip label={'À contrôler · ' + summary.inventoryDifferences} selected={equipmentFilter === 'issues'} onPress={() => { setEquipmentFilter('issues'); setDisplayLimit(120); }} />
        <Chip label={'Avec réserve · ' + summary.reserved} selected={equipmentFilter === 'reserved'} onPress={() => { setEquipmentFilter('reserved'); setDisplayLimit(120); }} />
        <Chip label="Restant à valider" selected={equipmentFilter === 'pending'} onPress={() => { setEquipmentFilter('pending'); setDisplayLimit(120); }} />
      </View>
      {displayedEquipment.map((row) => <View key={row.id} style={[missionStyles.card, { padding: 11, marginBottom: 8 }]}>
        <TouchableOpacity onPress={() => navigation.navigate('MissionEquipment',{ missionId,siteId:row.site_id,equipmentId:row.id })}>
          <Text style={{ color: COLORS.ink, fontSize: 10.8, fontWeight: '900' }}>{row.type || 'Équipement'}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 8.9, marginTop: 3 }}>{[row.brand,row.model].filter(Boolean).join(' · ') || 'Caractéristiques à compléter'}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 3 }}>{[row.site_name,row.location_label].filter(Boolean).join(' · ')}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {statuses.map(([key,label]) => <Chip
            key={key}
            label={label}
            selected={row.lifecycle_status === key}
            onPress={() => setLifecycle(row,key)}
          />)}
        </View>
      </View>)}
      {filteredEquipment.length > displayedEquipment.length ? <TouchableOpacity
        style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'center', marginBottom: 10 }]}
        onPress={() => setDisplayLimit((value) => value + 120)}
      >
        <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>
          Afficher 120 de plus · {displayedEquipment.length}/{filteredEquipment.length}
        </Text>
      </TouchableOpacity> : null}
      {!equipment.length ? <View style={[missionStyles.card,{padding:14}]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun équipement dans cette Mission. L’inventaire peut être préparé sur PC ou créé rapidement sur le terrain.</Text>
      </View> : null}
      {equipment.length && !filteredEquipment.length ? <View style={[missionStyles.card,{padding:14}]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.5 }}>Aucun ouvrage dans ce filtre.</Text>
      </View> : null}
      </> : null}

      {activeModes.dynamic && mission?.type === 'opr_reception' ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>OPR dynamique · essais</Text>
        <View style={[missionStyles.card, { padding: 11 }]}>
          <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900' }}>
            {summary.completedTests}/{summary.tests} essai(s) terminé(s)
          </Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, lineHeight: 12, marginTop: 3 }}>
            Les protocoles conservent attendu, observé, valeur de référence, mesure, résultat et preuve. Plusieurs passages restent possibles sur le même essai.
          </Text>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => navigation.navigate('MissionTests',{ missionId })}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Ouvrir les essais dynamiques</Text>
          </TouchableOpacity>
        </View>
      </> : null}

      {mission?.type === 'opr_reception' && activeModes.clearance ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Levée / recontrôle</Text>
        <View style={[missionStyles.card, { padding: 11 }]}>
          <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900' }}>{summary.openReserves} réserve(s) ouverte(s)</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, lineHeight: 12, marginTop: 3 }}>
            Reprendre la réserve initiale, contrôler, photographier après intervention puis qualifier : levée, maintenue, partielle, inaccessible ou non vérifiable.
          </Text>
          <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => navigation.navigate('MissionReserveClearance',{ missionId })}>
            <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Ouvrir le recontrôle</Text>
          </TouchableOpacity>
        </View>
      </> : null}

      {documents.length ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 18 }]}>Documents de réception / passation · statut rapide</Text>
        {documents.slice(0, 16).map((row) => <View key={row.id} style={[missionStyles.card, { padding: 10, marginBottom: 7 }]}>
          <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900' }}>{row.label || 'Document attendu'}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 2 }}>
            {[row.type,row.due_date || row.due_text].filter(Boolean).join(' · ') || 'Document Mission'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
            {[
              ['received','Reçu'],
              ['up_to_date','À jour'],
              ['incomplete','Incomplet'],
              ['to_send','À transmettre'],
              ['missing','Introuvable'],
              ['validated','Validé'],
            ].map(([key,label]) => <Chip
              key={key}
              label={label}
              selected={row.status === key}
              onPress={() => setDocumentStatus(row,key)}
            />)}
          </View>
        </View>)}
        {documents.length > 16 ? <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton, { alignSelf: 'flex-start' }]} onPress={() => navigation.navigate('MissionDocuments',{ missionId })}>
          <Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>Voir les {documents.length} documents</Text>
        </TouchableOpacity> : null}
      </> : null}
    </ScrollView>
  </View>;
}
