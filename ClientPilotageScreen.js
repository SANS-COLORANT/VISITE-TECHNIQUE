import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getClientTechnicalMatrix, getMatrixCellPhotos } from './clientTechnicalMatrix.js';
import { getStatsSitePatrimoine } from './patrimoineDb.js';
import { listerAppartenancesClient, listerGroupesClient } from './siteOrganizationDb.js';
import { reserveSeverityLabel } from './reserveSeverity.js';

const STATE = {
  green: { bg: '#E8F5E9', border: '#2E7D32', text: '#1B5E20', symbol: '✓' },
  orange: { bg: '#FFF3E0', border: '#EF8B2C', text: '#9A4E00', symbol: '!' },
  red: { bg: '#FDECEC', border: '#B42318', text: '#B42318', symbol: '!' },
  unknown: { bg: '#F2F4F7', border: '#667085', text: '#475467', symbol: '?' },
  neutral: { bg: '#F7F7F7', border: '#98A2B3', text: '#667085', symbol: '·' },
  none: { bg: '#FAFAFA', border: '#D0D5DD', text: '#98A2B3', symbol: '—' },
};

function Cell({ cell, onPress }) {
  const p = STATE[cell.state] || STATE.none;
  const count = cell.ns || cell.nr || cell.nv || cell.s || 0;
  return <TouchableOpacity disabled={!cell.total} onPress={onPress} style={{ width: 92, minHeight: 58, margin: 3, borderRadius: 10, borderWidth: 1.5, borderColor: p.border, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18, fontWeight: '900', color: p.text }}>{p.symbol} {count || ''}</Text><Text style={{ fontSize: 8.5, color: p.text, marginTop: 2 }}>{cell.total ? `${cell.s} S · ${cell.ns} N.S` : 'Non concerné'}</Text></TouchableOpacity>;
}

function Stat({ value, label, sub }) {
  return <View style={{ flex: 1, minWidth: 130, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', padding: 12 }}><Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.ink }}>{value}</Text><Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.inkSoft }}>{label}</Text>{sub ? <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 3 }}>{sub}</Text> : null}</View>;
}

export function ClientPilotageScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState(null);
  const [stats, setStats] = useState(new Map());
  const [groupes, setGroupes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupeActif, setGroupeActif] = useState(null);
  const [selected, setSelected] = useState(null);
  const [photos, setPhotos] = useState({});
  const [photoZoom, setPhotoZoom] = useState(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [m, gs, ms] = await Promise.all([
        getClientTechnicalMatrix(clientId),
        listerGroupesClient(clientId),
        listerAppartenancesClient(clientId),
      ]);
      const nextStats = new Map();
      for (const site of m?.sites || []) nextStats.set(site.id, await getStatsSitePatrimoine(site.id));
      setMatrix(m);
      setGroupes(gs || []);
      setMemberships(ms || []);
      setStats(nextStats);
    } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { charger(); }, [charger]);

  const siteIdsGroupe = useMemo(() => {
    if (!groupeActif) return null;
    return new Set(memberships.filter((m) => m.groupe_id === groupeActif).map((m) => m.site_id));
  }, [groupeActif, memberships]);

  const sites = useMemo(() => (matrix?.sites || []).filter((site) => !siteIdsGroupe || siteIdsGroupe.has(site.id)), [matrix, siteIdsGroupe]);

  const resume = useMemo(() => {
    let reservesOuvertes = 0, reservesLevees = 0, actifs = 0, aSurveiller = 0;
    for (const site of sites) {
      const s = stats.get(site.id) || {};
      reservesOuvertes += Number(s.reserves?.ouvertes || 0);
      reservesLevees += Number(s.reserves?.levees || 0);
      actifs += Number(s.equipements?.actifs || 0);
      aSurveiller += Number(s.equipements?.aSurveiller || 0);
    }
    return { sites: sites.length, reservesOuvertes, reservesLevees, actifs, aSurveiller };
  }, [sites, stats]);

  const openCell = async (site, category, cell) => {
    setSelected({ site, category, cell });
    const map = {};
    for (const issue of cell.issues || []) map[`${issue.id}-${issue.cle}`] = await getMatrixCellPhotos(issue);
    setPhotos(map);
  };

  if (loading || !matrix) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange}/><Text style={{ color: COLORS.muted, marginTop: 10 }}>Calcul du pilotage client…</Text></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingBottom: 28 }}>
    <View style={{ padding: 14 }}>
      <Text style={styles.sectionTitle}>Pilotage patrimoine</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{nomClient || 'Client'} · cartographie puis synthèse, calculées localement</Text>
      {groupes.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 7 }}>
        <TouchableOpacity onPress={() => setGroupeActif(null)} style={[styles.btnSecondary, !groupeActif && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]}><Text style={styles.btnSecondaryText}>Tous les sites</Text></TouchableOpacity>
        {groupes.map((g) => <TouchableOpacity key={g.id} onPress={() => setGroupeActif(g.id)} style={[styles.btnSecondary, groupeActif === g.id && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]}><Text style={styles.btnSecondaryText}>{g.nom} · {g.nb_sites || 0}</Text></TouchableOpacity>)}
      </ScrollView> : null}
    </View>

    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff' }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}><Text style={styles.sectionLabel}>Cartographie technique</Text><Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 3 }}>Vert = satisfaisant · orange = à traiter · rouge = prioritaire/critique · gris = information incomplète.</Text></View>
      <ScrollView horizontal contentContainerStyle={{ padding: 8 }}>
        <View>
          <View style={{ flexDirection: 'row' }}><View style={{ width: 180, padding: 8 }}><Text style={{ fontWeight: '900' }}>Sites</Text></View>{matrix.categories.map((c) => <View key={c.key} style={{ width: 98, padding: 6, justifyContent: 'center' }}><Text style={{ textAlign: 'center', fontSize: 10, fontWeight: '800' }}>{c.label}</Text></View>)}</View>
          {sites.map((site) => <View key={site.id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.line, alignItems: 'center' }}><TouchableOpacity onPress={() => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site })} style={{ width: 180, padding: 9 }}><Text style={{ fontWeight: '800', color: COLORS.primary }}>{site.nom_site}</Text><Text style={{ fontSize: 9.5, color: COLORS.muted }} numberOfLines={2}>{site.adresse || 'Adresse non renseignée'}</Text></TouchableOpacity>{matrix.categories.map((c) => <Cell key={c.key} cell={site.cells[c.key]} onPress={() => openCell(site, c, site.cells[c.key])}/>)}</View>)}
        </View>
      </ScrollView>
    </View>

    <View style={{ padding: 14 }}>
      <Text style={styles.sectionLabel}>Synthèse</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
        <Stat value={resume.sites} label="Sites dans la vue" />
        <Stat value={resume.reservesOuvertes} label="Réserves à traiter" sub={`${resume.reservesLevees} levée(s)`} />
        <Stat value={resume.actifs} label="Équipements actifs" sub={`${resume.aSurveiller} à surveiller`} />
      </View>
      <Text style={[styles.sectionLabel, { marginTop: 18, marginBottom: 8 }]}>État par site</Text>
      {sites.map((site) => {
        const s = stats.get(site.id) || {};
        return <TouchableOpacity key={site.id} style={[styles.card, { marginBottom: 8 }]} onPress={() => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site })}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{site.nom_site}</Text><Text style={styles.cardSub}>{s.reserves?.ouvertes || 0} réserve(s) ouverte(s) · {s.reserves?.levees || 0} levée(s)</Text><Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 5 }}>{s.equipements?.actifs || 0} équipement(s) actif(s) · {s.equipements?.aSurveiller || 0} à surveiller</Text></View><Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 18 }}>›</Text></TouchableOpacity>;
      })}
    </View>

    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 720, width: '94%', maxHeight: '88%' }]}>{selected ? <ScrollView><Text style={styles.modalTitle}>{selected.site.nom_site} · {selected.category.label}</Text><Text style={{ color: COLORS.muted, marginTop: 3 }}>{selected.cell.s} satisfaisant(s) · {selected.cell.ns} N.S · {selected.cell.nr} N.R · {selected.cell.nv} N.V</Text>{selected.cell.issues.map((issue, idx) => { const pics = photos[`${issue.id}-${issue.cle}`] || []; return <View key={`${issue.id}-${issue.cle}-${idx}`} style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 11 }}><Text style={{ fontWeight: '900', color: COLORS.red }}>{issue.reference_libelle || issue.cle} · {reserveSeverityLabel(issue.criticite)}</Text><Text style={{ marginTop: 5, color: COLORS.ink }}>{issue.prestation || issue.commentaire || 'Anomalie à préciser'}</Text>{pics.length ? <ScrollView horizontal style={{ marginTop: 8 }}>{pics.map((p) => <TouchableOpacity key={p.id} onPress={() => setPhotoZoom({ ...p, issue })}><Image source={{ uri: p.uri }} style={{ width: 105, height: 78, borderRadius: 8, marginRight: 7, backgroundColor: '#eee' }}/></TouchableOpacity>)}</ScrollView> : null}</View>; })}<View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => { const s = selected.site; setSelected(null); navigation.navigate('SiteVisites', { siteId: s.id, nomSite: s.nom_site }); }}><Text style={styles.btnPrimaryText}>Ouvrir le site</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setSelected(null)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity></View></ScrollView> : null}</View></View></Modal>
    <Modal visible={!!photoZoom} transparent animationType="fade" onRequestClose={() => setPhotoZoom(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '96%', maxWidth: 900 }]}>{photoZoom ? <><Image source={{ uri: photoZoom.uri }} resizeMode="contain" style={{ width: '100%', height: 430, backgroundColor: '#111', borderRadius: 10 }}/><Text style={{ marginTop: 9, fontWeight: '800' }}>{photoZoom.label || photoZoom.issue?.reference_libelle || photoZoom.issue?.cle}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 12 }]} onPress={() => setPhotoZoom(null)}><Text style={styles.btnPrimaryText}>Revenir au pilotage</Text></TouchableOpacity></> : null}</View></View></Modal>
  </ScrollView>;
}
