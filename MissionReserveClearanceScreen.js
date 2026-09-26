import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { COLORS, styles, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { capturerPhotoMission } from './missionMediaDb.js';

const CLEARANCE = Object.freeze([
  ['levee', 'Levée', 'closed'],
  ['maintenue', 'Maintenue', 'open'],
  ['partielle', 'Partielle', 'in_progress'],
  ['inaccessible', 'Inaccessible', 'waiting'],
  ['non_verifiable', 'Non vérifiable', 'to_check'],
]);

const QUALIFICATION_LABEL = Object.freeze(Object.fromEntries(CLEARANCE.map(([key,label]) => [key,label])));

function photoUri(photo) {
  return photo?.thumbnail_uri || photo?.preview_uri || photo?.file_uri || null;
}

function equipmentLabel(row) {
  return [row.equipment_type,row.equipment_brand,row.equipment_model].filter(Boolean).join(' · ');
}

function StatusChip({ label, selected, onPress }) {
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
    <Text style={{ color: selected ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.7, fontFamily: FONTS.black }}>{label}</Text>
  </TouchableOpacity>;
}

export function MissionReserveClearanceScreen({ route }) {
  const missionId = route?.params?.missionId;
  const [reserves, setReserves] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState('open');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!missionId) return;
    const db = await getDb();
    const [rows, photoRows] = await Promise.all([
      db.getAllAsync(
        `SELECT p.*,s.name AS site_name,l.label AS location_label,
          e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
          d.requested_action,d.cost_estimate,d.allocation,
          actor.company AS responsible_company,actor.name AS responsible_name,
          a.id AS action_id,a.status AS action_status,a.due_date AS action_due_date,a.due_text AS action_due_text
         FROM mission_points p
         LEFT JOIN mission_sites s ON s.id=p.site_id
         LEFT JOIN mission_locations l ON l.id=p.location_id
         LEFT JOIN mission_equipment e ON e.id=p.equipment_id
         LEFT JOIN mission_point_details d ON d.point_id=p.id
         LEFT JOIN mission_actors actor ON actor.id=p.responsible_actor_id
         LEFT JOIN mission_actions a ON a.id=(
           SELECT aa.id FROM mission_actions aa WHERE aa.source_point_id=p.id ORDER BY aa.created_at LIMIT 1
         )
         WHERE p.mission_id=? AND p.type='reserve'
         ORDER BY CASE p.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 WHEN 'to_check' THEN 3 ELSE 4 END,
           COALESCE(p.due_date,'9999-12-31'),p.created_at`,
        [missionId]
      ),
      db.getAllAsync(
        'SELECT * FROM mission_photos WHERE mission_id=? AND (point_id IS NOT NULL OR action_id IS NOT NULL) ORDER BY COALESCE(taken_at,created_at)',
        [missionId]
      ),
    ]);
    setReserves(rows || []);
    setPhotos(photoRows || []);
  }, [missionId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return reserves;
    if (filter === 'closed') return reserves.filter((row) => row.status === 'closed');
    return reserves.filter((row) => row.status !== 'closed');
  }, [reserves, filter]);

  const summary = useMemo(() => ({
    open: reserves.filter((row) => row.status !== 'closed').length,
    cleared: reserves.filter((row) => row.qualification === 'levee' || row.status === 'closed').length,
    partial: reserves.filter((row) => row.qualification === 'partielle').length,
    inaccessible: reserves.filter((row) => row.qualification === 'inaccessible').length,
  }), [reserves]);

  const photosFor = useCallback((reserve, role = null) => {
    return photos.filter((photo) =>
      (photo.point_id === reserve.id || (reserve.action_id && photo.action_id === reserve.action_id))
      && (!role || photo.phase_role === role)
    );
  }, [photos]);

  const initialPhotoFor = useCallback((reserve) => {
    const explicit = photosFor(reserve, 'before');
    if (explicit.length) return explicit[0];
    return photosFor(reserve).find((photo) => photo.phase_role !== 'after') || null;
  }, [photosFor]);

  const afterPhotoFor = useCallback((reserve) => photosFor(reserve, 'after')[0] || null, [photosFor]);

  const capture = async (reserve, role) => {
    if (busyId) return;
    setBusyId(reserve.id);
    try {
      const photo = await capturerPhotoMission({
        missionId,
        siteId: reserve.site_id,
        pointId: reserve.id,
        equipmentId: reserve.equipment_id,
        locationId: reserve.location_id,
        actionId: reserve.action_id,
        phaseRole: role,
        label: role === 'before' ? 'Réserve · état initial' : 'Réserve · après intervention',
        type: 'reserve_evidence',
      });
      if (photo) await load();
    } catch (e) {
      Alert.alert('Photo impossible', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const setClearance = async (reserve, qualification, status) => {
    if (busyId) return;
    setBusyId(reserve.id);
    try {
      const db = await getDb();
      const before = reserve.status || 'open';
      const now = new Date().toISOString();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE mission_points SET
            qualification=?,status=?,closed_at=?,updated_at=datetime('now')
           WHERE id=? AND mission_id=?`,
          [qualification,status,status === 'closed' ? now : null,reserve.id,missionId]
        );
        await db.runAsync(
          `INSERT INTO mission_point_history(
            id,point_id,status_before,status_after,comment,source
          ) VALUES(?,?,?,?,?,?)`,
          [
            createId('mph'),
            reserve.id,
            before,
            status,
            'Levée de réserves · ' + (QUALIFICATION_LABEL[qualification] || qualification),
            'mission_reserve_clearance',
          ]
        );

        if (reserve.action_id) {
          await db.runAsync(
            `UPDATE mission_actions SET
              status=?,
              progress=CASE WHEN ?='closed' THEN 100 ELSE progress END,
              closed_at=?,
              updated_at=datetime('now')
             WHERE id=? AND mission_id=?`,
            [status,status,status === 'closed' ? now : null,reserve.action_id,missionId]
          );
        }
      });
      await load();
    } catch (e) {
      Alert.alert('Statut non enregistré', String(e?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <Text style={[styles.sectionTitle, missionStyles.title]}>Levée de réserves</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15 }}>
        Retrouve la réserve initiale, ajoute la preuve après intervention et tranche en un geste : levée, maintenue, partielle, inaccessible ou non vérifiable.
      </Text>

      <View style={{ flexDirection: 'row', gap: 7, marginTop: 12 }}>
        {[
          [summary.open, 'à recontrôler'],
          [summary.cleared, 'levées'],
          [summary.partial, 'partielles'],
          [summary.inaccessible, 'inaccessibles'],
        ].map(([value,label]) => <View key={label} style={[missionStyles.statBox, { flex: 1, borderRadius: 11, padding: 9 }]}>
          <Text style={{ color: MISSION_COLORS.accentStrong, fontSize: 14, fontFamily: FONTS.black }}>{value}</Text>
          <Text style={{ color: COLORS.inkFaint, fontSize: 7.8, marginTop: 2 }}>{label}</Text>
        </View>)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
        <StatusChip label="À recontrôler" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <StatusChip label="Levées" selected={filter === 'closed'} onPress={() => setFilter('closed')} />
        <StatusChip label="Toutes" selected={filter === 'all'} onPress={() => setFilter('all')} />
      </View>

      {visible.map((reserve, index) => {
        const before = initialPhotoFor(reserve);
        const after = afterPhotoFor(reserve);
        return <View key={reserve.id} style={[missionStyles.card, { padding: 12, marginTop: 9 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontFamily: FONTS.black }}>RÉSERVE {String(index + 1).padStart(2,'0')}</Text>
              <Text style={{ color: COLORS.ink, fontSize: 11.5, fontFamily: FONTS.black, marginTop: 3 }}>{reserve.label || 'Réserve'}</Text>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8.6, marginTop: 3 }}>
                {[reserve.site_name,reserve.location_label,equipmentLabel(reserve)].filter(Boolean).join(' · ') || 'Contexte à compléter'}
              </Text>
              {reserve.description ? <Text style={{ color: COLORS.inkSoft, fontSize: 9.3, lineHeight: 13, marginTop: 5 }}>{reserve.description}</Text> : null}
            </View>
            <View style={{ borderRadius: 9, backgroundColor: reserve.status === 'closed' ? MISSION_COLORS.accentLight : '#FFFFFF', borderWidth: 1, borderColor: MISSION_COLORS.accentLine, paddingHorizontal: 7, paddingVertical: 5 }}>
              <Text style={{ color: reserve.status === 'closed' ? MISSION_COLORS.accentStrong : COLORS.inkSoft, fontSize: 8.2, fontFamily: FONTS.black }}>
                {QUALIFICATION_LABEL[reserve.qualification] || (reserve.status === 'closed' ? 'Levée' : 'À recontrôler')}
              </Text>
            </View>
          </View>

          {(reserve.requested_action || reserve.responsible_company || reserve.responsible_name || reserve.due_date || reserve.due_text) ? <View style={{ marginTop: 8, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, padding: 8 }}>
            {reserve.requested_action ? <Text style={{ color: COLORS.ink, fontSize: 8.8 }}>Action : {reserve.requested_action}</Text> : null}
            <Text style={{ color: COLORS.inkFaint, fontSize: 8.3, marginTop: 2 }}>
              {[reserve.responsible_company || reserve.responsible_name,reserve.due_date || reserve.due_text].filter(Boolean).join(' · ')}
            </Text>
          </View> : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8, fontFamily: FONTS.black, marginBottom: 4 }}>AVANT</Text>
              {before ? <Image source={{ uri: photoUri(before) }} style={{ width: '100%', height: 105, borderRadius: 9 }} resizeMode="cover" /> : <View style={{ height: 105, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>Pas de photo initiale</Text></View>}
              <TouchableOpacity disabled={busyId === reserve.id} onPress={() => capture(reserve, 'before')} style={{ paddingVertical: 7, alignItems: 'center' }}>
                <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.5, fontFamily: FONTS.black }}>📷 {before ? 'Remplacer / ajouter' : 'Photo initiale'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 8, fontFamily: FONTS.black, marginBottom: 4 }}>APRÈS</Text>
              {after ? <Image source={{ uri: photoUri(after) }} style={{ width: '100%', height: 105, borderRadius: 9 }} resizeMode="cover" /> : <View style={{ height: 105, borderRadius: 9, backgroundColor: MISSION_COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.inkFaint, fontSize: 8.5 }}>À photographier si utile</Text></View>}
              <TouchableOpacity disabled={busyId === reserve.id} onPress={() => capture(reserve, 'after')} style={{ paddingVertical: 7, alignItems: 'center' }}>
                <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 8.5, fontFamily: FONTS.black }}>📷 Photo après</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={{ color: COLORS.inkFaint, fontSize: 8.2, fontFamily: FONTS.black, marginTop: 7, marginBottom: 5 }}>RÉSULTAT DU RECONTRÔLE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {CLEARANCE.map(([key,label,status]) => <StatusChip
              key={key}
              label={label}
              selected={reserve.qualification === key}
              onPress={() => setClearance(reserve,key,status)}
            />)}
          </View>
        </View>;
      })}

      {!visible.length ? <View style={[missionStyles.card, { padding: 14, marginTop: 12 }]}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 9.7 }}>
          {filter === 'open' ? 'Aucune réserve restant à recontrôler dans cette Mission.' : 'Aucune réserve dans cette sélection.'}
        </Text>
      </View> : null}
    </ScrollView>
  </View>;
}
