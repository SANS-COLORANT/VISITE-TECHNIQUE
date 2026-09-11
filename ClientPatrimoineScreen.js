/** Synthèse patrimoine client 100 % offline, enrichie par le LAB Santé. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { listerSitesClient } from './db.js';
import { getStatsSitesPatrimoine } from './patrimoineDb.js';
import { getLabFeatureEnabled } from './featureSettings.js';
import { HEALTH_DIMENSIONS, getClientHealth } from './siteHealth.js';
import { COLORS, styles } from './styles.js';

const CLIENT_PATRIMOINE_FAST_CACHE = new Map();

function scoreColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return COLORS.inkFaint;
  if (n >= 80) return COLORS.green || '#2E7D32';
  if (n >= 60) return COLORS.amber || '#B45309';
  return COLORS.red || '#B91C1C';
}
function scoreText(score) { return Number.isFinite(Number(score)) ? `${Math.round(Number(score))}` : '—'; }
function StatCard({ value, label, sub, accent = null }) { return <View style={{ flex: 1, minWidth: 130, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14 }}><Text style={{ fontSize: 26, fontWeight: '900', color: accent || COLORS.ink }}>{value}</Text><Text style={{ fontSize: 12, color: COLORS.inkSoft, fontWeight: '700', marginTop: 2 }}>{label}</Text>{sub ? <Text style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 4 }}>{sub}</Text> : null}</View>; }
function Barre({ value, max, label }) { const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / max) * 100)) : 0; return <View style={{ marginTop: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}><Text style={{ fontSize: 11, color: COLORS.muted }}>{label}</Text><Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.ink }}>{value || 0}</Text></View><View style={{ height: 7, borderRadius: 4, backgroundColor: '#ECEFF2', overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: COLORS.orange }} /></View></View>; }
function HealthPill({ label, score }) { return <View style={{ minWidth: 105, flex: 1, borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 9, paddingVertical: 8 }}><Text style={{ fontSize: 9.2, color: COLORS.inkSoft }} numberOfLines={1}>{label}</Text><Text style={{ marginTop: 2, fontSize: 15, fontWeight: '900', color: scoreColor(score) }}>{scoreText(score)}/100</Text></View>; }

function buildSummary(liste, statsBySite) {
  const lignes = (liste || []).map((site) => ({ ...site, stats: statsBySite.get(site.id) || { reserves: {}, equipements: {} } }));
  const resume = { sites: lignes.length, reserves: { total: 0, ouvertes: 0, levees: 0 }, equipements: { total: 0, actifs: 0, remplaces: 0 } };
  for (const site of lignes) {
    const r = site.stats?.reserves || {}, e = site.stats?.equipements || {};
    resume.reserves.total += Number(r.total || 0); resume.reserves.ouvertes += Number(r.ouvertes || 0); resume.reserves.levees += Number(r.levees || 0);
    resume.equipements.total += Number(e.total || 0); resume.equipements.actifs += Number(e.actifs || 0); resume.equipements.remplaces += Number(e.remplaces || 0);
  }
  return { lignes, resume };
}

export function ClientPatrimoineScreen({ route, navigation }) {
  const { clientId, nomClient } = route.params || {};
  const key = String(clientId || '');
  const initial = CLIENT_PATRIMOINE_FAST_CACHE.get(key);
  const [loading, setLoading] = useState(!initial);
  const [resume, setResume] = useState(initial?.resume || null);
  const [sites, setSites] = useState(initial?.sites || []);
  const [healthEnabled, setHealthEnabled] = useState(Boolean(initial?.healthEnabled));
  const [clientHealth, setClientHealth] = useState(initial?.clientHealth || null);

  const charger = useCallback(async () => {
    if (!initial) setLoading(true);
    try {
      const [liste, statsBySite, enabled] = await Promise.all([
        listerSitesClient(clientId), getStatsSitesPatrimoine(clientId), getLabFeatureEnabled('health_dashboard'),
      ]);
      const base = buildSummary(liste, statsBySite);
      setResume(base.resume); setSites(base.lignes); setHealthEnabled(enabled); setLoading(false);
      CLIENT_PATRIMOINE_FAST_CACHE.set(key, { resume: base.resume, sites: base.lignes, healthEnabled: enabled, clientHealth: CLIENT_PATRIMOINE_FAST_CACHE.get(key)?.clientHealth || null });
      // La santé est un enrichissement : elle ne bloque plus le premier rendu.
      if (enabled) {
        getClientHealth(clientId, statsBySite).then((health) => {
          setClientHealth(health);
          const current = CLIENT_PATRIMOINE_FAST_CACHE.get(key) || {};
          CLIENT_PATRIMOINE_FAST_CACHE.set(key, { ...current, clientHealth: health });
        }).catch(() => setClientHealth(null));
      } else setClientHealth(null);
    } finally { setLoading(false); }
  }, [clientId, key]);

  useEffect(() => { charger().catch(() => setLoading(false)); }, [charger]);

  const maxReserves = useMemo(() => Math.max(1, ...sites.map((s) => s.stats?.reserves?.ouvertes || 0)), [sites]);
  const maxVetustes = useMemo(() => Math.max(1, ...sites.map((s) => s.stats?.equipements?.aSurveiller || 0)), [sites]);
  const tauxTraitement = resume?.reserves?.total ? Math.round((resume.reserves.levees / resume.reserves.total) * 100) : 0;
  const healthBySite = useMemo(() => new Map((clientHealth?.items || []).map((item) => [item.siteId, item])), [clientHealth]);

  if (loading && !resume) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.orange} size="large"/><Text style={{ color: COLORS.muted, marginTop: 10 }}>Calcul de la synthèse locale…</Text></View>;

  return <FlatList
    style={{ flex: 1 }} data={sites} keyExtractor={(item) => item.id}
    initialNumToRender={10} maxToRenderPerBatch={8} updateCellsBatchingPeriod={20} windowSize={6} removeClippedSubviews
    contentContainerStyle={[styles.content, { paddingBottom: 34 }]}
    ListHeaderComponent={<View>
      <Text style={styles.sectionTitle}>{healthEnabled ? 'Santé du patrimoine' : 'Synthèse patrimoine'}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: 14 }}>{nomClient || 'Client'} · données calculées localement sur la tablette</Text>

      {healthEnabled && clientHealth ? <>
        <View style={{ borderRadius: 15, backgroundColor: '#FFF7F1', borderWidth: 1, borderColor: '#F6C7AD', padding: 15, marginBottom: 12 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '900', color: COLORS.orangeDark }}>LAB METRA · SANTÉ CLIENT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 5 }}><Text style={{ fontSize: 42, lineHeight: 46, fontWeight: '900', color: scoreColor(clientHealth.overall) }}>{scoreText(clientHealth.overall)}</Text><Text style={{ marginLeft: 4, marginBottom: 6, color: COLORS.inkSoft }}>/ 100 · {clientHealth.level?.label || 'Données insuffisantes'}</Text></View>
          <Text style={{ marginTop: 4, fontSize: 10.5, color: COLORS.inkSoft }}>{clientHealth.calculables || 0}/{clientHealth.sites || 0} site(s) calculable(s) · {clientHealth.satisfaisants || 0} satisfaisant(s) · {clientHealth.aSurveiller || 0} à surveiller · {clientHealth.prioritaires || 0} prioritaire(s)</Text>
          {clientHealth.lowest ? <Text style={{ marginTop: 5, fontSize: 10.5, fontWeight: '800', color: scoreColor(clientHealth.lowest.overall) }}>Site le plus faible : {clientHealth.lowest.siteName || 'Site'} · {scoreText(clientHealth.lowest.overall)}/100</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>{HEALTH_DIMENSIONS.map((dimension) => <HealthPill key={dimension.key} label={dimension.label} score={clientHealth.scores?.[dimension.key]} />)}</View>
      </> : healthEnabled ? <Text style={{ color: COLORS.muted, fontSize: 10.5, marginBottom: 10 }}>Indice santé en cours de calcul — le patrimoine reste déjà utilisable.</Text> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 }}>
        <StatCard value={resume?.sites || 0} label="Sites" />
        <StatCard value={resume?.reserves?.ouvertes || 0} label="Réserves à traiter" sub={`${resume?.reserves?.levees || 0} levées · ${tauxTraitement}% traitées`} />
        <StatCard value={resume?.equipements?.actifs || 0} label="Équipements actifs" sub={`${resume?.equipements?.remplaces || 0} remplacés dans l’historique`} />
      </View>
      <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14, marginBottom: 16 }}><Text style={{ fontWeight: '900', color: COLORS.ink }}>{healthEnabled ? 'Lecture de l’indice expérimental' : 'Lecture rapide'}</Text><Text style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 5 }}>{healthEnabled ? 'La note moyenne ne masque jamais les sites faibles : les sites prioritaires et le site le plus dégradé restent affichés séparément. L’indice ne remplace pas un avis technique ou réglementaire.' : 'Les barres comparent les sites entre eux. Aucun fichier Excel, photo ou trame complète n’est chargé pour cet écran : uniquement des agrégats SQLite indexés.'}</Text></View>
      <Text style={[styles.sectionLabel, { marginBottom: 9 }]}>État par site</Text>
    </View>}
    renderItem={({ item }) => {
      const r = item.stats?.reserves || {}, e = item.stats?.equipements || {}, health = healthBySite.get(item.id);
      return <TouchableOpacity style={[styles.card, { alignItems: 'stretch' }]} activeOpacity={0.75} onPress={() => navigation.navigate('SiteVisites', { siteId: item.id, nomSite: item.nom_site })}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom_site}</Text><Text style={styles.cardSub}>{r.ouvertes || 0} réserve(s) ouverte(s) · {r.levees || 0} levée(s)</Text></View>{healthEnabled ? <View style={{ alignItems: 'flex-end', marginRight: 8 }}><Text style={{ fontSize: 22, fontWeight: '900', color: scoreColor(health?.overall) }}>{scoreText(health?.overall)}</Text><Text style={{ fontSize: 8.5, color: COLORS.inkSoft }}>/100</Text></View> : null}<Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 18 }}>›</Text></View>
          {healthEnabled && health ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>{HEALTH_DIMENSIONS.map((dimension) => <View key={dimension.key} style={{ minWidth: 68, flex: 1 }}><Text style={{ fontSize: 8.5, color: COLORS.inkFaint }} numberOfLines={1}>{dimension.label.replace(' technique', '').replace('État des ', '')}</Text><Text style={{ fontSize: 11.5, fontWeight: '900', color: scoreColor(health.scores?.[dimension.key]) }}>{scoreText(health.scores?.[dimension.key])}</Text></View>)}</View> : <><Barre value={r.ouvertes || 0} max={maxReserves} label="Réserves à traiter" /><Barre value={e.aSurveiller || 0} max={maxVetustes} label="Équipements vétustes / à surveiller" /></>}
          <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 8 }}>{e.actifs || 0} équipement(s) actif(s) · {e.remplaces || 0} remplacé(s){healthEnabled && health?.source?.date ? ` · visite ${health.source.date}` : ''}</Text>
        </View>
      </TouchableOpacity>;
    }}
    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun site pour ce client.</Text></View>}
  />;
}
