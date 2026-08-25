/** Synthèse patrimoine client 100 % offline, sans chargement des photos ni des trames. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { listerSitesClient } from './db.js';
import { getStatsClientPatrimoine, getStatsSitePatrimoine } from './patrimoineDb.js';
import { COLORS, styles } from './styles.js';

function StatCard({ value, label, sub }) {
  return <View style={{ flex: 1, minWidth: 130, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14 }}><Text style={{ fontSize: 26, fontWeight: '900', color: COLORS.ink }}>{value}</Text><Text style={{ fontSize: 12, color: COLORS.inkSoft, fontWeight: '700', marginTop: 2 }}>{label}</Text>{sub ? <Text style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 4 }}>{sub}</Text> : null}</View>;
}

function Barre({ value, max, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return <View style={{ marginTop: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}><Text style={{ fontSize: 11, color: COLORS.muted }}>{label}</Text><Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.ink }}>{value || 0}</Text></View><View style={{ height: 7, borderRadius: 4, backgroundColor: '#ECEFF2', overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: COLORS.orange }} /></View></View>;
}

export function ClientPatrimoineScreen({ route, navigation }) {
  const { clientId, nomClient } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState(null);
  const [sites, setSites] = useState([]);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const liste = await listerSitesClient(clientId);
      const resumeClient = await getStatsClientPatrimoine(clientId);
      const lignes = [];
      for (const site of liste) {
        lignes.push({ ...site, stats: await getStatsSitePatrimoine(site.id) });
      }
      setResume(resumeClient);
      setSites(lignes);
    } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { charger(); }, [charger]);

  const maxReserves = useMemo(() => Math.max(1, ...sites.map((s) => s.stats?.reserves?.ouvertes || 0)), [sites]);
  const maxVetustes = useMemo(() => Math.max(1, ...sites.map((s) => s.stats?.equipements?.aSurveiller || 0)), [sites]);
  const tauxTraitement = resume?.reserves?.total ? Math.round((resume.reserves.levees / resume.reserves.total) * 100) : 0;

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.orange} size="large"/><Text style={{ color: COLORS.muted, marginTop: 10 }}>Calcul de la synthèse locale…</Text></View>;

  return <FlatList
    data={sites}
    keyExtractor={(item) => item.id}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View>
      <Text style={styles.sectionTitle}>Synthèse patrimoine</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 14 }}>{nomClient || 'Client'} · données calculées localement sur la tablette</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 }}>
        <StatCard value={resume?.sites || 0} label="Sites" />
        <StatCard value={resume?.reserves?.ouvertes || 0} label="Réserves à traiter" sub={`${resume?.reserves?.levees || 0} levées · ${tauxTraitement}% traitées`} />
        <StatCard value={resume?.equipements?.actifs || 0} label="Équipements actifs" sub={`${resume?.equipements?.remplaces || 0} remplacés dans l’historique`} />
      </View>
      <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14, marginBottom: 16 }}><Text style={{ fontWeight: '900', color: COLORS.ink }}>Lecture rapide</Text><Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 5 }}>Les barres comparent les sites entre eux. Aucun fichier Excel, photo ou trame complète n’est chargé pour cet écran : uniquement des agrégats SQLite indexés.</Text></View>
      <Text style={[styles.sectionLabel, { marginBottom: 9 }]}>État par site</Text>
    </View>}
    renderItem={({ item }) => {
      const r = item.stats?.reserves || {};
      const e = item.stats?.equipements || {};
      return <TouchableOpacity style={[styles.card, { alignItems: 'stretch' }]} activeOpacity={0.75} onPress={() => navigation.navigate('SiteVisites', { siteId: item.id, nomSite: item.nom_site })}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom_site}</Text><Text style={styles.cardSub}>{r.ouvertes || 0} réserve(s) ouverte(s) · {r.levees || 0} levée(s)</Text></View><Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 18 }}>›</Text></View>
          <Barre value={r.ouvertes || 0} max={maxReserves} label="Réserves à traiter" />
          <Barre value={e.aSurveiller || 0} max={maxVetustes} label="Équipements vétustes / à surveiller" />
          <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 8 }}>{e.actifs || 0} équipement(s) actif(s) · {e.remplaces || 0} remplacé(s)</Text>
        </View>
      </TouchableOpacity>;
    }}
    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
  />;
}
