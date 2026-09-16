import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { listerMissions } from './missionsDb.js';

const STATUS_LABELS = Object.freeze({
  draft: 'Brouillon',
  active: 'En cours',
  waiting: 'En attente',
  closed: 'Clôturée',
  cancelled: 'Annulée',
});

function MissionCard({ mission, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 15, marginBottom: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 15 }} numberOfLines={2}>
            {mission.label || 'Mission sans titre'}
          </Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 11.5, marginTop: 4 }} numberOfLines={1}>
            {[mission.client_name, mission.type || mission.family].filter(Boolean).join(' · ') || 'À compléter'}
          </Text>
        </View>
        <View style={{ backgroundColor: mission.status === 'active' ? '#EDF8F0' : COLORS.bg, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: mission.status === 'active' ? '#246B38' : COLORS.inkSoft, fontSize: 9.5, fontWeight: '900' }}>
            {STATUS_LABELS[mission.status] || mission.status || 'Brouillon'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{mission.site_count || 0} site(s)</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{mission.visit_count || 0} visite(s)</Text>
        <Text style={{ color: COLORS.inkSoft, fontSize: 10.5 }}>{mission.open_point_count || 0} point(s) ouvert(s)</Text>
      </View>
    </TouchableOpacity>
  );
}

export function MissionsHomeScreen({ navigation }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try { setMissions(await listerMissions({ limit: 60 })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    if (!q) return missions;
    return missions.filter((m) => `${m.label || ''} ${m.client_name || ''} ${m.family || ''} ${m.type || ''} ${m.reference || ''}`.toLocaleLowerCase('fr').includes(q));
  }, [missions, query]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={(
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink, fontSize: 22, fontWeight: '900' }}>Missions</Text>
                <Text style={{ color: COLORS.inkSoft, fontSize: 11.5, marginTop: 3 }}>Dossiers ponctuels · indépendants de l’Intranet</Text>
              </View>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('MissionCreate')}>
                <Text style={styles.btnPrimaryText}>＋ Nouvelle mission</Text>
              </TouchableOpacity>
            </View>

            <View style={{ minHeight: 48, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: COLORS.inkFaint, fontSize: 18, marginRight: 8 }}>⌕</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Mission, client, référence…"
                placeholderTextColor={COLORS.inkFaint}
                style={{ flex: 1, color: COLORS.ink, fontSize: 13.5 }}
              />
            </View>

            <View style={{ backgroundColor: '#F4F7F9', borderRadius: 13, padding: 12, marginBottom: 15 }}>
              <Text style={{ color: COLORS.ink, fontSize: 11.5, fontWeight: '900' }}>Saisie libre et progressive</Text>
              <Text style={{ color: COLORS.inkSoft, fontSize: 10.5, lineHeight: 15, marginTop: 3 }}>
                Une Mission peut rester incomplète. Les champs non renseignés n’empêchent ni l’enregistrement, ni la reprise plus tard.
              </Text>
            </View>
          </>
        )}
        renderItem={({ item }) => <MissionCard mission={item} onPress={() => navigation.navigate('Mission', { missionId: item.id })} />}
        ListEmptyComponent={loading
          ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={COLORS.orange}/></View>
          : <View style={{ padding: 34, alignItems: 'center' }}><Text style={{ color: COLORS.ink, fontWeight: '800' }}>Aucune mission</Text><Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 5, textAlign: 'center' }}>Crée un brouillon ou une Mission guidée. Rien n’est envoyé à l’Intranet.</Text></View>}
      />
    </View>
  );
}
