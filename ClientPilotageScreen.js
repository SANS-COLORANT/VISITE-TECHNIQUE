import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { buildMatrixCells, getClientTechnicalMatrix, getMatrixCellPhotos, normAvis } from './clientTechnicalMatrix.js';
import { getStatsSitePatrimoine } from './patrimoineDb.js';
import { listerAppartenancesClient, listerGroupesClient } from './siteOrganizationDb.js';
import { reserveSeverityLabel } from './reserveSeverity.js';
import { exporterPilotageExcel, PILOTAGE_DEFAULT_COLUMNS, PILOTAGE_EXPORT_COLUMNS, PILOTAGE_EXPORT_PRESETS } from './clientTechnicalMatrixExport.js';

const STATE = {
  green: { bg: '#E8F5E9', border: '#2E7D32', text: '#1B5E20', symbol: '✓' },
  orange: { bg: '#FFF3E0', border: '#EF8B2C', text: '#9A4E00', symbol: '!' },
  red: { bg: '#FDECEC', border: '#B42318', text: '#B42318', symbol: '!' },
  unknown: { bg: '#F2F4F7', border: '#667085', text: '#475467', symbol: '?' },
  neutral: { bg: '#F7F7F7', border: '#98A2B3', text: '#667085', symbol: '·' },
  none: { bg: '#FAFAFA', border: '#D0D5DD', text: '#98A2B3', symbol: '—' },
};

const DEFAULT_FILTERS = { trame: 'all', status: 'all', minSeverity: 0, category: 'all', search: '' };
const STATUS_OPTIONS = [
  { id: 'all', label: 'Tous' }, { id: 'N.S', label: 'N.S' }, { id: 'S', label: 'S' },
  { id: 'N.R', label: 'N.R' }, { id: 'S.O', label: 'S.O' }, { id: 'N.V', label: 'N.V' },
  { id: 'attention', label: 'Attention' },
];

function issueKey(issue) { return issue?.remarque_id || `${issue?.visit_id || issue?.id}||${issue?.section_code || ''}||${issue?.cle || ''}`; }
function normalize(value = '') { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function Cell({ cell, onPress }) {
  const p = STATE[cell.state] || STATE.none;
  const count = cell.ns || cell.nr || cell.nv || cell.so || cell.s || 0;
  return <TouchableOpacity disabled={!cell.total} onPress={onPress} style={{ width: 92, minHeight: 58, margin: 3, borderRadius: 10, borderWidth: 1.5, borderColor: p.border, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18, fontWeight: '900', color: p.text }}>{p.symbol} {count || ''}</Text><Text style={{ fontSize: 8.5, color: p.text, marginTop: 2 }}>{cell.total ? `${cell.s} S · ${cell.ns} N.S` : 'Non concerné'}</Text></TouchableOpacity>;
}

function Stat({ value, label, sub }) {
  return <View style={{ flex: 1, minWidth: 130, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', padding: 12 }}><Text style={{ fontSize: 24, fontWeight: '900', color: COLORS.ink }}>{value}</Text><Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.inkSoft }}>{label}</Text>{sub ? <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 3 }}>{sub}</Text> : null}</View>;
}

function Chip({ label, active, onPress, danger = false }) {
  return <TouchableOpacity onPress={onPress} style={{ minHeight: 38, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: active ? (danger ? '#B42318' : COLORS.orange) : COLORS.line, backgroundColor: active ? (danger ? '#FDECEC' : '#FFF3E8') : '#fff', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10.5, fontWeight: '800', color: active ? (danger ? '#B42318' : COLORS.orange) : COLORS.inkSoft }}>{label}</Text></TouchableOpacity>;
}

function recordMatches(record, site, filters) {
  const avis = normAvis(record.avis);
  if (filters.trame !== 'all' && record.trame_id !== filters.trame) return false;
  if (filters.category !== 'all' && record.category_key !== filters.category) return false;
  if (filters.status === 'attention' && !['N.S', 'N.R', 'N.V'].includes(avis)) return false;
  if (filters.status !== 'all' && filters.status !== 'attention' && avis !== filters.status) return false;
  if (Number(filters.minSeverity || 0) > 0 && !(avis === 'N.S' && Number(record.criticite || 0) >= Number(filters.minSeverity))) return false;
  const q = normalize(filters.search).trim();
  if (q) {
    const haystack = normalize([site.nom_site, site.adresse, record.trame_label, record.category_label, record.section_code, record.cle, record.reference_libelle, record.commentaire, record.prestation, record.poste].filter(Boolean).join(' '));
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export function ClientPilotageScreen({ route, navigation }) {
  const { clientId, nomClient } = route?.params || {};
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState(null);
  const [stats, setStats] = useState(new Map());
  const [groupes, setGroupes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupeActif, setGroupeActif] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterVisible, setFilterVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportColumns, setExportColumns] = useState([...PILOTAGE_DEFAULT_COLUMNS]);
  const [exportPreset, setExportPreset] = useState('reserves');
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
    } catch (e) {
      Alert.alert('Pilotage', String(e?.message || e));
    } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { charger(); }, [charger]);

  const siteIdsGroupe = useMemo(() => {
    if (!groupeActif) return null;
    return new Set(memberships.filter((m) => m.groupe_id === groupeActif).map((m) => m.site_id));
  }, [groupeActif, memberships]);

  const scopedSites = useMemo(() => (matrix?.sites || []).filter((site) => !siteIdsGroupe || siteIdsGroupe.has(site.id)), [matrix, siteIdsGroupe]);

  const filteredRecordsBySite = useMemo(() => {
    const map = new Map();
    for (const site of scopedSites) map.set(site.id, (site.records || []).filter((record) => recordMatches(record, site, filters)));
    return map;
  }, [scopedSites, filters]);

  const visibleCategories = useMemo(() => {
    if (!matrix) return [];
    if (filters.category !== 'all') return matrix.categories.filter((c) => c.key === filters.category);
    const used = new Set();
    for (const records of filteredRecordsBySite.values()) for (const record of records) used.add(record.category_key);
    return matrix.categories.filter((c) => used.has(c.key));
  }, [matrix, filters.category, filteredRecordsBySite]);

  const sites = useMemo(() => scopedSites.map((site) => {
    const records = filteredRecordsBySite.get(site.id) || [];
    return { ...site, records, cells: buildMatrixCells(records, visibleCategories) };
  }).filter((site) => site.records.length > 0 || Object.values(filters).every((v) => v === 'all' || v === 0 || v === '')), [scopedSites, filteredRecordsBySite, visibleCategories, filters]);

  const filteredRecords = useMemo(() => sites.flatMap((site) => site.records || []), [sites]);

  const siteNames = useMemo(() => new Map((matrix?.sites || []).map((s) => [s.id, s.nom_site])), [matrix]);
  const siteAddresses = useMemo(() => new Map((matrix?.sites || []).map((s) => [s.id, s.adresse || ''])), [matrix]);
  const siteGroups = useMemo(() => {
    const map = new Map();
    for (const membership of memberships) {
      if (!map.has(membership.site_id)) map.set(membership.site_id, []);
      map.get(membership.site_id).push(membership.groupe_nom);
    }
    return map;
  }, [memberships]);

  const resume = useMemo(() => {
    let reservesOuvertes = 0, reservesLevees = 0, actifs = 0, aSurveiller = 0;
    for (const site of scopedSites) {
      const s = stats.get(site.id) || {};
      reservesOuvertes += Number(s.reserves?.ouvertes || 0);
      reservesLevees += Number(s.reserves?.levees || 0);
      actifs += Number(s.equipements?.actifs || 0);
      aSurveiller += Number(s.equipements?.aSurveiller || 0);
    }
    return { sites: scopedSites.length, reservesOuvertes, reservesLevees, actifs, aSurveiller };
  }, [scopedSites, stats]);

  const technicalSummary = useMemo(() => {
    const result = { total: filteredRecords.length, ns: 0, critical: 0, nr: 0 };
    for (const r of filteredRecords) {
      const avis = normAvis(r.avis);
      if (avis === 'N.S') { result.ns += 1; if (Number(r.criticite || 0) >= 4) result.critical += 1; }
      if (avis === 'N.R' || avis === 'N.V') result.nr += 1;
    }
    return result;
  }, [filteredRecords]);

  const openCell = async (site, category, cell) => {
    setSelected({ site, category, cell });
    const map = {};
    for (const issue of cell.issues || []) map[issueKey(issue)] = await getMatrixCellPhotos(issue);
    setPhotos(map);
  };

  const activeFilterCount = useMemo(() => [filters.trame !== 'all', filters.status !== 'all', filters.minSeverity > 0, filters.category !== 'all', !!filters.search.trim()].filter(Boolean).length, [filters]);
  const groupLabel = groupes.find((g) => g.id === groupeActif)?.nom || 'Tous les sites';
  const viewLabel = `${groupLabel} · ${filters.trame === 'all' ? 'Tous métiers' : matrix?.trames?.find((t) => t.id === filters.trame)?.label || filters.trame} · ${filters.status === 'all' ? 'Tous statuts' : filters.status}${filters.minSeverity ? ` · criticité ≥ ${filters.minSeverity}` : ''}${filters.category !== 'all' ? ` · ${matrix?.categories?.find((c) => c.key === filters.category)?.label || filters.category}` : ''}`;

  const faireExport = async ({ columns = PILOTAGE_DEFAULT_COLUMNS, presetStatuses = [], label = viewLabel } = {}) => {
    if (!filteredRecords.length) return Alert.alert('Extraction', 'Aucune ligne dans la vue actuelle.');
    try {
      setExportBusy(true);
      const result = await exporterPilotageExcel({ clientNom: nomClient, records: filteredRecords, siteNames, siteAddresses, siteGroups, columns, presetStatuses, viewLabel: label, partager: true });
      setExportVisible(false);
      if (!result.partageLance) Alert.alert('Extraction créée', `${result.lignes} ligne(s) · ${result.nomFichier}`);
    } catch (e) { Alert.alert('Extraction impossible', String(e?.message || e)); }
    finally { setExportBusy(false); }
  };

  const choisirPreset = (key) => {
    setExportPreset(key);
    if (key === 'view') setExportColumns([...PILOTAGE_DEFAULT_COLUMNS]);
    else setExportColumns([...(PILOTAGE_EXPORT_PRESETS[key]?.columns || PILOTAGE_DEFAULT_COLUMNS)]);
  };

  const toggleColumn = (key) => setExportColumns((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);

  if (loading || !matrix) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.orange}/><Text style={{ color: COLORS.muted, marginTop: 10 }}>Calcul du pilotage client…</Text></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
    <View style={{ padding: 14 }}>
      <Text style={styles.sectionTitle}>Pilotage patrimoine</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{nomClient || 'Client'} · calcul local et disponible hors connexion</Text>
      {groupes.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 7 }}>
        <Chip label="Tous les sites" active={!groupeActif} onPress={() => setGroupeActif(null)}/>
        {groupes.map((g) => <Chip key={g.id} label={`${g.nom} · ${g.nb_sites || 0}`} active={groupeActif === g.id} onPress={() => setGroupeActif(g.id)}/>)}
      </ScrollView> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setFilterVisible(true)}><Text style={styles.btnSecondaryText}>⚙ Filtres{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, filters.status === 'attention' && { borderColor: COLORS.orange, backgroundColor: '#FFF3E8' }]} onPress={() => setFilters((f) => ({ ...f, status: f.status === 'attention' ? 'all' : 'attention' }))}><Text style={styles.btnSecondaryText}>⚠ Attention</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} disabled={exportBusy || !filteredRecords.length} onPress={() => faireExport({})}><Text style={styles.btnPrimaryText}>↧ Exporter cette vue</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} disabled={exportBusy || !filteredRecords.length} onPress={() => setExportVisible(true)}><Text style={styles.btnSecondaryText}>▤ Extraction Excel</Text></TouchableOpacity>
      </View>
      <Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 8 }}>{viewLabel} · {filteredRecords.length} ligne(s)</Text>
    </View>

    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff' }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}><Text style={styles.sectionLabel}>Cartographie technique</Text><Text style={{ color: COLORS.muted, fontSize: 10.5, marginTop: 3 }}>Chaque constat est classé dans une seule catégorie. Rouge = criticité 4–5 · orange = N.S · gris = non relevé/non visible.</Text></View>
      {visibleCategories.length && sites.length ? <ScrollView horizontal contentContainerStyle={{ padding: 8 }}>
        <View>
          <View style={{ flexDirection: 'row' }}><View style={{ width: 180, padding: 8 }}><Text style={{ fontWeight: '900' }}>Sites</Text></View>{visibleCategories.map((c) => <View key={c.key} style={{ width: 98, padding: 6, justifyContent: 'center' }}><Text style={{ textAlign: 'center', fontSize: 10, fontWeight: '800' }}>{c.label}</Text></View>)}</View>
          {sites.map((site) => <View key={site.id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.line, alignItems: 'center' }}><TouchableOpacity onPress={() => navigation.navigate('SiteVisites', { siteId: site.id, nomSite: site.nom_site })} style={{ width: 180, padding: 9 }}><Text style={{ fontWeight: '800', color: COLORS.primary }}>{site.nom_site}</Text><Text style={{ fontSize: 9.5, color: COLORS.muted }} numberOfLines={2}>{site.adresse || 'Adresse non renseignée'}</Text></TouchableOpacity>{visibleCategories.map((c) => <Cell key={c.key} cell={site.cells[c.key] || { total: 0, state: 'none' }} onPress={() => openCell(site, c, site.cells[c.key])}/>)}</View>)}
        </View>
      </ScrollView> : <View style={{ padding: 20 }}><Text style={{ color: COLORS.muted, textAlign: 'center' }}>Aucun constat ne correspond aux filtres.</Text></View>}
    </View>

    <View style={{ padding: 14 }}>
      <Text style={styles.sectionLabel}>Synthèse de la vue</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 }}>
        <Stat value={technicalSummary.total} label="Points affichés" sub={`${technicalSummary.ns} N.S`} />
        <Stat value={technicalSummary.critical} label="Prioritaires / critiques" sub="criticité 4–5" />
        <Stat value={technicalSummary.nr} label="À compléter" sub="N.R + N.V" />
      </View>
      <Text style={[styles.sectionLabel, { marginTop: 18, marginBottom: 8 }]}>Patrimoine du périmètre</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Stat value={resume.sites} label="Sites"/><Stat value={resume.reservesOuvertes} label="Réserves ouvertes" sub={`${resume.reservesLevees} levée(s)`}/><Stat value={resume.actifs} label="Équipements actifs" sub={`${resume.aSurveiller} à surveiller`}/></View>
    </View>

    <Modal visible={filterVisible} transparent animationType="fade" onRequestClose={() => setFilterVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '94%', maxWidth: 720, maxHeight: '90%' }]}><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[styles.modalTitle, { flex: 1 }]}>Filtres cartographie</Text><TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)}><Text style={{ color: COLORS.primary, fontWeight: '800' }}>Réinitialiser</Text></TouchableOpacity></View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Recherche</Text><TextInput style={styles.input} value={filters.search} placeholder="Site, réserve, équipement, commentaire…" onChangeText={(v) => setFilters((f) => ({ ...f, search: v }))}/>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Métier</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Tous" active={filters.trame === 'all'} onPress={() => setFilters((f) => ({ ...f, trame: 'all' }))}/>{(matrix.trames || []).map((t) => <Chip key={t.id} label={t.label} active={filters.trame === t.id} onPress={() => setFilters((f) => ({ ...f, trame: t.id }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Avis</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{STATUS_OPTIONS.map((o) => <Chip key={o.id} label={o.label} active={filters.status === o.id} onPress={() => setFilters((f) => ({ ...f, status: o.id }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Criticité minimale</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{[0, 1, 2, 3, 4, 5].map((v) => <Chip key={v} label={v === 0 ? 'Toutes' : `≥ ${v}`} active={Number(filters.minSeverity) === v} danger={v >= 4} onPress={() => setFilters((f) => ({ ...f, minSeverity: v }))}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Catégorie</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Toutes" active={filters.category === 'all'} onPress={() => setFilters((f) => ({ ...f, category: 'all' }))}/>{matrix.categories.map((c) => <Chip key={c.key} label={c.label} active={filters.category === c.key} onPress={() => setFilters((f) => ({ ...f, category: c.key }))}/>)}</View>
      <TouchableOpacity style={[styles.btnPrimary, { marginTop: 16 }]} onPress={() => setFilterVisible(false)}><Text style={styles.btnPrimaryText}>Afficher la vue</Text></TouchableOpacity></ScrollView></View></View></Modal>

    <Modal visible={exportVisible} transparent animationType="fade" onRequestClose={() => setExportVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '95%', maxWidth: 760, maxHeight: '92%' }]}><ScrollView><Text style={styles.modalTitle}>Extraction Excel</Text><Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>L’extraction part de la vue filtrée actuelle. Feuille 1 = Synthèse · feuille 2 = Détail.</Text>
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Préréglage</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}><Chip label="Vue courante" active={exportPreset === 'view'} onPress={() => choisirPreset('view')}/>{Object.entries(PILOTAGE_EXPORT_PRESETS).map(([key, preset]) => <Chip key={key} label={preset.label} active={exportPreset === key} onPress={() => choisirPreset(key)}/>)}</View>
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Colonnes</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{PILOTAGE_EXPORT_COLUMNS.map((column) => <Chip key={column.key} label={column.label} active={exportColumns.includes(column.key)} onPress={() => toggleColumn(column.key)}/>)}</View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} disabled={exportBusy} onPress={() => setExportVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={exportBusy || !exportColumns.length} onPress={() => faireExport({ columns: exportColumns, presetStatuses: exportPreset === 'view' ? [] : (PILOTAGE_EXPORT_PRESETS[exportPreset]?.statuses || []), label: `${viewLabel} · ${exportPreset === 'view' ? 'Vue courante' : PILOTAGE_EXPORT_PRESETS[exportPreset]?.label || 'Extraction'}` })}><Text style={styles.btnPrimaryText}>{exportBusy ? 'Création…' : 'Créer et partager'}</Text></TouchableOpacity></View></ScrollView></View></View></Modal>

    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 720, width: '94%', maxHeight: '88%' }]}>{selected ? <ScrollView><Text style={styles.modalTitle}>{selected.site.nom_site} · {selected.category.label}</Text><Text style={{ color: COLORS.muted, marginTop: 3 }}>{selected.cell.s} S · {selected.cell.ns} N.S · {selected.cell.nr} N.R · {selected.cell.so} S.O · {selected.cell.nv} N.V</Text>{selected.cell.issues.length ? selected.cell.issues.map((issue, idx) => { const pics = photos[issueKey(issue)] || []; return <View key={`${issueKey(issue)}-${idx}`} style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 11 }}><Text style={{ fontWeight: '900', color: Number(issue.criticite || 0) >= 4 ? COLORS.red : COLORS.orange }}>{issue.reference_libelle || issue.cle} · {reserveSeverityLabel(issue.criticite)}</Text><Text style={{ marginTop: 5, color: COLORS.ink }}>{issue.prestation || issue.commentaire || 'Anomalie à préciser'}</Text>{pics.length ? <ScrollView horizontal style={{ marginTop: 8 }}>{pics.map((p) => <TouchableOpacity key={p.id} onPress={() => setPhotoZoom({ ...p, issue })}><Image source={{ uri: p.uri }} style={{ width: 105, height: 78, borderRadius: 8, marginRight: 7, backgroundColor: '#eee' }}/></TouchableOpacity>)}</ScrollView> : <Text style={{ marginTop: 7, fontSize: 10, color: COLORS.muted }}>Aucune photo liée à ce problème.</Text>}</View>; }) : <Text style={{ marginTop: 12, color: COLORS.muted }}>Aucune réserve N.S dans cette cellule.</Text>}<View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => { const s = selected.site; setSelected(null); navigation.navigate('SiteVisites', { siteId: s.id, nomSite: s.nom_site }); }}><Text style={styles.btnPrimaryText}>Ouvrir le site</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setSelected(null)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity></View></ScrollView> : null}</View></View></Modal>
    <Modal visible={!!photoZoom} transparent animationType="fade" onRequestClose={() => setPhotoZoom(null)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { width: '96%', maxWidth: 900 }]}>{photoZoom ? <><Image source={{ uri: photoZoom.uri }} resizeMode="contain" style={{ width: '100%', height: 430, backgroundColor: '#111', borderRadius: 10 }}/><Text style={{ marginTop: 9, fontWeight: '800' }}>{photoZoom.label || photoZoom.issue?.reference_libelle || photoZoom.issue?.cle}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 12 }]} onPress={() => setPhotoZoom(null)}><Text style={styles.btnPrimaryText}>Revenir au pilotage</Text></TouchableOpacity></> : null}</View></View></Modal>
  </ScrollView>;
}
