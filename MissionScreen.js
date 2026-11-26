/**
 * Fiche Mission — écran modulable.
 *
 * La fiche est une pile de blocs (missionSheetRegistry.js) dont l'ordre, la
 * taille, la visibilité et les outils épinglés se règlent en mode
 * « Personnaliser » : boutons monter / descendre / masquer / compact-détaillé
 * et « Déplacer vers… » (aucun glisser-déposer obligatoire). La disposition
 * s'enregistre pour cette Mission ou pour toutes celles du même type, avec
 * « Annuler » pendant 6 s. En-tête et action principale restent toujours en
 * tête : reprendre la visite en cours se fait en un geste.
 *
 * Indépendant de l'Intranet (règle 9) : seules les tables Missions sont lues.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Platform, RefreshControl, ScrollView, StyleSheet, Text, UIManager, View, useWindowDimensions } from 'react-native';
import { styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { creerPointMission, creerVisiteMission, getMissionDashboard, MISSION_FAMILIES, mettreAJourMission, mettreAJourStatutPoint } from './missionsDb.js';
import { exporterMissionExcel } from './missionExcelExport.js';
import { exporterMissionExcelClient } from './missionClientExcelExport.js';
import { choisirEtImporterMissionExcel } from './missionExcelImport.js';
import { getMissionDomainSummary } from './missionDomainDb.js';
import { getMissionCapabilities } from './missionRecipes.js';
import { getMissionFieldPlaybook } from './missionFieldPlaybooks.js';
import { chargerExtrasFicheMission, listerReprisesMissions } from './missionSheetDb.js';
import { missionSheetStore } from './missionSheetStore.js';
import { SHEET_TOOL_BY_KEY } from './missionSheetRegistry.js';
import { describeMissionModules, parseMissionModules, resolveMissionCapabilities, setMissionModule } from './missionModules.js';
import { creerModeleMission, enregistrerBriquesMission, restaurerBriquesMission } from './missionModelsDb.js';
import {
  applySheetPreset,
  availableSheetTools,
  buildSheetContext,
  defaultSheetLayout,
  hideSheetBlock,
  moveSheetBlock,
  moveSheetBlockTo,
  pickSheetToolSuggestion,
  resolveSheetLayout,
  serializeSheetLayout,
  sheetLayoutsEqual,
  showSheetBlock,
  splitSheetColumns,
  toggleSheetBlockSize,
  togglePinnedSheetTool,
} from './missionSheetLayout.js';
import { SHEET_BLOCK_RENDERERS } from './MissionSheetBlocks.js';
import { AllToolsSheet, CustomizeSheet, DeliverablesSheet, EditBlockBar, EditTopBar, ModulesSheet, MoveSheet, PointSheet, PointsListSheet, SaveModelSheet, ScopeSheet, VisitsListSheet } from './MissionSheetSheets.js';
import { SheetErgoProvider, sheetStyles, SHEET_TYPE } from './missionSheetUi.js';
import { FadeUp } from './premiumChrome.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { SkeletonList } from './Skeleton.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess, hapticTick } from './fieldFeedback.js';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

const EMPTY_EXTRAS = Object.freeze({ measures: [], documents: { pending: 0, late: 0, done: 0, total: 0, next: [] }, sites: { todo: 0, progress: 0, done: 0, total: 0 } });
const UNDO_MS = 6000;
// Dernière fiche affichée par Mission : le retour depuis un outil est instantané, la base est relue en arrière-plan.
const SHEET_CACHE = new Map();

const TYPE_LABELS = new Map(MISSION_FAMILIES.flatMap((family) => family.types.map(([key, label]) => [key, label])));

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
const errorText = (e) => String(e?.message || e || 'Erreur inconnue');

export function MissionScreen({ navigation, route }) {
  const missionId = route?.params?.missionId;
  const cached = SHEET_CACHE.get(missionId);
  const { width } = useWindowDimensions();
  const wide = width >= 600;

  const [data, setData] = useState(cached?.data || null);
  const [summary, setSummary] = useState(cached?.summary || {});
  const [extras, setExtras] = useState(cached?.extras || EMPTY_EXTRAS);
  const [resume, setResume] = useState(cached?.resume || null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [prefsTick, setPrefsTick] = useState(0);
  const [gloves, setGloves] = useState(() => missionSheetStore.getGloves());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState({ visit: false, client: false, full: false, import: false });
  const [sheet, setSheet] = useState(null); // 'tools' | 'point' | 'points' | 'visits' | 'customize' | 'scope' | 'move' | 'deliverables'
  const [pointPreset, setPointPreset] = useState(null);
  const [moveKey, setMoveKey] = useState(null);
  const [savingPoint, setSavingPoint] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const reload = useCallback(async () => {
    if (!missionId) return;
    try {
      const [dashboard, domain, more, resumes] = await Promise.all([
        getMissionDashboard(missionId),
        getMissionDomainSummary(missionId).catch(() => ({})),
        chargerExtrasFicheMission(missionId).catch(() => EMPTY_EXTRAS),
        listerReprisesMissions({ missionId, limit: 1 }).catch(() => []),
      ]);
      if (!mounted.current) return;
      const next = { data: dashboard, summary: domain || {}, extras: more || EMPTY_EXTRAS, resume: resumes?.[0] || null };
      SHEET_CACHE.set(missionId, next);
      setData(next.data);
      setSummary(next.summary);
      setExtras(next.extras);
      setResume(next.resume);
    } catch (e) {
      if (mounted.current && !SHEET_CACHE.get(missionId)) Alert.alert('Fiche Mission indisponible', errorText(e));
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [missionId]);

  useEffect(() => { reload(); }, [reload]);

  const mission = data?.mission || null;
  // Briques : celles du type (getMissionCapabilities), plus les ajouts, moins les retraits propres à cette Mission.
  const baseCapabilities = useMemo(() => getMissionCapabilities(mission?.family, mission?.type), [mission?.family, mission?.type]);
  const modules = useMemo(() => parseMissionModules(mission?.modules_json), [mission?.modules_json]);
  const capabilities = useMemo(() => resolveMissionCapabilities(baseCapabilities, modules), [baseCapabilities, modules]);
  const playbook = useMemo(() => getMissionFieldPlaybook(mission?.type), [mission?.type]);
  const ctx = useMemo(() => buildSheetContext({ family: mission?.family, type: mission?.type, capabilities, playbook }), [mission?.family, mission?.type, capabilities, playbook]);
  const ids = useMemo(() => ({ missionId, type: mission?.type || null, family: mission?.family || null }), [missionId, mission?.type, mission?.family]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stored = useMemo(() => missionSheetStore.readStoredLayouts(ids), [ids, prefsTick]);
  const resolved = useMemo(() => resolveSheetLayout({ stored, ctx }), [stored, ctx]);
  const layout = editing && draft ? draft : resolved.layout;
  const toolsAvailable = useMemo(() => availableSheetTools(capabilities), [capabilities]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const suggestion = useMemo(() => (editing ? null : pickSheetToolSuggestion({ usage: missionSheetStore.readUsage(missionId), pinnedTools: layout.pinnedTools, capabilities })), [missionId, layout.pinnedTools, capabilities, editing, prefsTick]);

  const firstSiteId = data?.sites?.[0]?.id || null;
  const today = new Date().toISOString().slice(0, 10);

  // ------------------------------------------------------------------ actions
  const openTool = useCallback((toolKey) => {
    const tool = SHEET_TOOL_BY_KEY[toolKey];
    if (!tool) return;
    setSheet(null);
    missionSheetStore.recordToolOpen(missionId, toolKey);
    navigation.navigate(tool.route, { missionId, siteId: firstSiteId });
  }, [missionId, firstSiteId, navigation]);

  const startVisit = async () => {
    if (busy.visit) return;
    setBusy((b) => ({ ...b, visit: true }));
    try {
      const visitId = await creerVisiteMission({ missionId, siteId: firstSiteId, visitType: playbook.defaultVisitType || 'visite terrain' });
      if (mission?.status !== 'active') await mettreAJourMission(missionId, { status: 'active' });
      SHEET_CACHE.delete(missionId);
      navigation.navigate('MissionVisit', { missionId, visitId });
    } catch (e) {
      Alert.alert('Visite non créée', errorText(e));
    } finally {
      if (mounted.current) setBusy((b) => ({ ...b, visit: false }));
    }
  };

  const openPointSheet = (preset) => { setPointPreset(preset || null); setSheet('point'); };

  const savePoint = async ({ type, label, description, dueText }) => {
    if (savingPoint) return;
    setSavingPoint(true);
    try {
      await creerPointMission({ missionId, siteId: firstSiteId, type, label, description, dueText });
      setSheet(null);
      hapticSuccess();
      showToast(label, { title: 'Point ajouté', tone: 'success' });
      await reload();
    } catch (e) {
      Alert.alert('Point non créé', errorText(e));
    } finally {
      if (mounted.current) setSavingPoint(false);
    }
  };

  const setPointStatus = async (point, status, comment) => {
    await mettreAJourStatutPoint(point.id, status, { comment });
    await reload();
  };

  const closePoint = async (point) => {
    const previous = point.status;
    try {
      animate();
      await setPointStatus(point, 'closed', 'Clôture depuis la fiche Mission');
      hapticSuccess();
      showToast(point.label || 'Point', {
        title: 'Point clôturé',
        tone: 'success',
        duration: UNDO_MS,
        action: { label: 'Annuler', onPress: () => setPointStatus(point, previous, 'Clôture annulée depuis la fiche Mission').catch((e) => Alert.alert('Point non modifié', errorText(e))) },
      });
    } catch (e) {
      Alert.alert('Point non modifié', errorText(e));
    }
  };

  const reopenPoint = (point) => setPointStatus(point, 'open', 'Réouvert depuis la fiche Mission').then(() => showToast(point.label || 'Point', { title: 'Point rouvert' })).catch((e) => Alert.alert('Point non modifié', errorText(e)));

  const exportClientExcel = async () => {
    if (busy.client) return;
    setBusy((b) => ({ ...b, client: true }));
    try {
      const result = await exporterMissionExcelClient(missionId);
      Alert.alert('Excel client créé', `${result.name}\n\nSynthèse, sites, actions, réserves, inventaire, mesures, visites, photos, documents et scénarios sont présentés dans des feuilles directement exploitables.`);
    } catch (e) {
      Alert.alert('Export client impossible', errorText(e));
    } finally {
      if (mounted.current) setBusy((b) => ({ ...b, client: false }));
    }
  };

  const exportFullExcel = async () => {
    if (busy.full) return;
    setSheet(null);
    setBusy((b) => ({ ...b, full: true }));
    try {
      const result = await exporterMissionExcel(missionId);
      Alert.alert('Export Mission créé', `${result.name}\n\nLes données sont structurées par feuilles et les médias restent référencés séparément.`);
    } catch (e) {
      Alert.alert('Export impossible', errorText(e));
    } finally {
      if (mounted.current) setBusy((b) => ({ ...b, full: false }));
    }
  };

  const importExcel = async () => {
    if (busy.import) return;
    setSheet(null);
    setBusy((b) => ({ ...b, import: true }));
    try {
      const result = await choisirEtImporterMissionExcel({ targetMissionId: missionId });
      if (!result) return;
      await reload();
      Alert.alert(
        result.canonical ? 'Classeur METRA réimporté' : 'Classeur externe importé',
        result.canonical
          ? 'Les données structurées du classeur ont été fusionnées à partir de leurs identifiants stables.'
          : `${result.rows || 0} ligne(s) ont été conservées intégralement comme source Excel de cette Mission.`
      );
    } catch (e) {
      Alert.alert('Import impossible', errorText(e));
    } finally {
      if (mounted.current) setBusy((b) => ({ ...b, import: false }));
    }
  };

  // ------------------------------------------------------- disposition (prefs)
  const pinScope = resolved.source === 'mission' ? 'mission' : 'type';

  /** Enregistre `next` dans `scope` et propose « Annuler » ; un enregistrement « type » libère la Mission. */
  const persistLayout = (next, scope, title, message) => {
    const undo = [];
    const saved = missionSheetStore.saveLayout(scope, ids, next);
    undo.push(saved);
    if (scope === 'type' && stored.mission) undo.push(missionSheetStore.clearLayout('mission', ids));
    setPrefsTick((t) => t + 1);
    showToast(message, {
      title,
      tone: 'success',
      duration: UNDO_MS,
      action: {
        label: 'Annuler',
        onPress: () => {
          for (const entry of undo.reverse()) missionSheetStore.restoreRaw(entry.key, entry.previous);
          animate();
          setPrefsTick((t) => t + 1);
        },
      },
    });
  };

  const togglePin = (toolKey) => {
    const tool = SHEET_TOOL_BY_KEY[toolKey];
    if (editing) {
      setDraft((current) => togglePinnedSheetTool(current, toolKey, capabilities));
      return;
    }
    const next = togglePinnedSheetTool(resolved.layout, toolKey, capabilities);
    if (next === resolved.layout) return;
    hapticTick();
    animate();
    const pinned = next.pinnedTools.includes(toolKey);
    persistLayout(next, pinScope, pinned ? 'Outil épinglé' : 'Outil retiré', `${tool?.title || 'Outil'} · ${pinScope === 'mission' ? 'cette Mission' : 'toutes les Missions de ce type'}`);
  };

  const onSuggestion = (choice) => {
    if (!suggestion) return;
    if (choice === 'accept') {
      missionSheetStore.setSuggestionState(missionId, suggestion.toolKey, 'later');
      togglePin(suggestion.toolKey);
      return;
    }
    missionSheetStore.setSuggestionState(missionId, suggestion.toolKey, choice === 'never' ? 'never' : 'later');
    animate();
    setPrefsTick((t) => t + 1);
  };

  const enterEdit = () => {
    if (editing) return;
    hapticTick();
    animate();
    setDraft(resolved.layout);
    setEditing(true);
    if (!missionSheetStore.customizeHintSeen()) {
      missionSheetStore.markCustomizeHintSeen();
      showToast('Monte, descends, masque ou agrandis chaque bloc. Rien n’est supprimé.', { title: 'Personnaliser la fiche', duration: 4200 });
    }
  };

  const editDraft = (fn) => {
    hapticTick();
    animate();
    setDraft((current) => fn(current || resolved.layout));
  };

  const dirty = editing && draft ? !sheetLayoutsEqual(draft, resolved.layout) : false;

  const cancelEdit = () => { animate(); setEditing(false); setDraft(null); setSheet(null); };

  const finishEdit = () => {
    if (!dirty) { cancelEdit(); return; }
    setSheet('scope');
  };

  const saveDraft = (scope) => {
    const next = draft;
    setSheet(null);
    animate();
    setEditing(false);
    setDraft(null);
    hapticSuccess();
    persistLayout(next, scope, 'Disposition enregistrée', scope === 'mission' ? 'Pour cette Mission uniquement' : `Pour toutes les Missions « ${TYPE_LABELS.get(mission?.type) || 'de ce type'} »`);
  };

  const forget = (scope) => {
    const entry = missionSheetStore.clearLayout(scope, ids);
    setSheet(null);
    cancelEdit();
    setPrefsTick((t) => t + 1);
    showToast(scope === 'mission' ? 'La Mission reprend la disposition de son type.' : 'Le type reprend le réglage d’usine.', {
      title: 'Disposition oubliée',
      duration: UNDO_MS,
      action: { label: 'Annuler', onPress: () => { missionSheetStore.restoreRaw(entry.key, entry.previous); setPrefsTick((t) => t + 1); } },
    });
  };

  const toggleModule = async (toolKey, enabled) => {
    const tool = SHEET_TOOL_BY_KEY[toolKey];
    try {
      hapticTick();
      const previous = await enregistrerBriquesMission(missionId, setMissionModule(modules, toolKey, enabled, baseCapabilities));
      await reload();
      showToast(tool?.title || 'Brique', {
        title: enabled ? 'Brique ajoutée' : 'Brique retirée',
        tone: 'success',
        duration: UNDO_MS,
        action: { label: 'Annuler', onPress: () => restaurerBriquesMission(missionId, previous).then(reload).catch((e) => Alert.alert('Briques non modifiées', errorText(e))) },
      });
    } catch (e) {
      Alert.alert('Briques non modifiées', errorText(e));
    }
  };

  const saveModel = async ({ label, description }) => {
    if (savingModel) return;
    setSavingModel(true);
    try {
      await creerModeleMission({ label, description, family: mission?.family, type: mission?.type, modules, layoutJson: serializeSheetLayout(resolved.layout) });
      setSheet(null);
      hapticSuccess();
      showToast('Disponible à la création d’une Mission.', { title: `Modèle « ${label} » enregistré`, tone: 'success' });
    } catch (e) {
      Alert.alert('Modèle non enregistré', errorText(e));
    } finally {
      if (mounted.current) setSavingModel(false);
    }
  };

  const toggleGloves = () => {
    const next = !gloves;
    missionSheetStore.setGloves(next);
    hapticTick();
    animate();
    setGloves(next);
  };

  // ------------------------------------------------------------------- rendu
  if (loading && !data) {
    return <View style={[st.root, missionStyles.screen]}><View style={{ padding: 16 }}><SkeletonList count={5} /></View></View>;
  }
  if (!mission) return <View style={styles.center}><Text style={styles.errorTitle}>Mission introuvable</Text></View>;

  const phases = data.phases || [];
  const counted = phases.filter((phase) => phase.status !== 'skipped');
  const done = counted.filter((phase) => phase.status === 'done').length;
  const sitesById = Object.fromEntries((data.sites || []).map((site) => [site.id, site]));
  const points = data.points || [];
  const sheetModel = {
    mission,
    phases,
    phaseProgress: { done, total: counted.length, pct: counted.length ? done / counted.length : 0 },
    typeLabel: TYPE_LABELS.get(mission.type) || null,
    clientName: mission.client_name || null,
    siteLine: data.sites?.length > 1 ? `${data.sites.length} sites` : data.sites?.[0]?.name || null,
    sitesById,
    visits: data.visits || [],
    points,
    openPoints: points.filter((point) => !['closed', 'no_follow_up'].includes(point.status)),
    summary,
    extras,
    resume,
    today,
    playbook,
    capabilities,
    wide,
    busy,
    layoutSource: resolved.source,
    pinnedTools: layout.pinnedTools,
    availableToolCount: toolsAvailable.length,
    suggestion,
    onCustomize: editing ? () => setSheet('customize') : enterEdit,
    onLongPress: enterEdit,
    startVisit,
    resumeVisit: (row) => navigation.navigate('MissionVisit', { missionId, visitId: row.visit_id }),
    openVisit: (visit) => { setSheet(null); navigation.navigate('MissionVisit', { missionId, visitId: visit.id }); },
    openPointSheet,
    closePoint,
    openAllPoints: () => setSheet('points'),
    openAllVisits: () => setSheet('visits'),
    openTool,
    openAllTools: () => setSheet('tools'),
    onSuggestion,
    openWorkflow: () => (capabilities.workflow !== false ? openTool('workflow') : null),
    openReport: () => { setSheet(null); navigation.navigate('MissionReport', { missionId }); },
    exportClientExcel,
    openDeliverablesMenu: () => setSheet('deliverables'),
  };

  const renderBlock = (key, size) => {
    const Block = SHEET_BLOCK_RENDERERS[key];
    return Block ? <Block sheet={sheetModel} size={size} /> : null;
  };

  const blocks = layout.blocks;
  const columns = !editing && wide ? splitSheetColumns(blocks) : null;

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[st.root, missionStyles.screen]}>
        {editing ? <EditTopBar dirty={dirty} onCancel={cancelEdit} onDone={finishEdit} onAdd={() => setSheet('customize')} /> : null}
        <ScrollView
          contentContainerStyle={[st.content, wide && st.contentWide, { gap: gloves ? 16 : 12 }]}
          refreshControl={editing ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} colors={[MISSION_COLORS.accent]} tintColor={MISSION_COLORS.accent} />}
          keyboardShouldPersistTaps="handled"
        >
          {editing ? (
            <View style={st.lockStrip} accessible accessibilityLabel="En-tête et action principale : toujours en tête de la fiche">
              <CvcIcon name="lock" size={20} color={MISSION_COLORS.accentDark} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={SHEET_TYPE.bodyStrong}>En-tête et action principale</Text>
                <Text style={SHEET_TYPE.meta}>Toujours en tête : reprendre la visite reste à un geste.</Text>
              </View>
            </View>
          ) : (
            <>
              {renderBlock('header', 'detailed')}
              <FadeUp delay={40}>{renderBlock('primary', 'detailed')}</FadeUp>
            </>
          )}

          {editing ? blocks.map((block, index) => (
            <View key={block.key} style={st.editCard}>
              <EditBlockBar
                blockKey={block.key}
                index={index}
                count={blocks.length}
                size={block.size}
                onMove={(delta) => editDraft((current) => moveSheetBlock(current, block.key, delta))}
                onToggleSize={() => editDraft((current) => toggleSheetBlockSize(current, block.key))}
                onHide={() => editDraft((current) => hideSheetBlock(current, block.key))}
                onMoveTo={() => { setMoveKey(block.key); setSheet('move'); }}
              />
              <View pointerEvents="none" style={st.preview}>{renderBlock(block.key, block.size)}</View>
            </View>
          )) : columns ? (
            <View style={st.columns}>
              <View style={st.column}>{columns.left.map((block) => <View key={block.key}>{renderBlock(block.key, block.size)}</View>)}</View>
              <View style={st.column}>{columns.right.map((block) => <View key={block.key}>{renderBlock(block.key, block.size)}</View>)}</View>
            </View>
          ) : blocks.map((block, index) => (
            <FadeUp key={block.key} delay={80 + Math.min(index, 6) * 35}>{renderBlock(block.key, block.size)}</FadeUp>
          ))}

          {editing && layout.hidden.length ? (
            <View style={st.hiddenTray}>
              <Text style={SHEET_TYPE.label}>{layout.hidden.length} bloc(s) masqué(s)</Text>
              <Text style={SHEET_TYPE.meta}>Touche « + » en haut pour les remettre, ou choisir une disposition prête.</Text>
            </View>
          ) : null}
        </ScrollView>

        <AllToolsSheet visible={sheet === 'tools'} onClose={() => setSheet(null)} availableTools={toolsAvailable} pinnedTools={layout.pinnedTools} onOpenTool={openTool} onTogglePin={togglePin} onManageModules={() => setSheet('modules')} />
        <ModulesSheet visible={sheet === 'modules'} onClose={() => setSheet(null)} baseCapabilities={baseCapabilities} modules={modules} onToggle={toggleModule} typeLabel={TYPE_LABELS.get(mission.type) || null} />
        <SaveModelSheet visible={sheet === 'model'} onClose={() => setSheet(null)} defaultLabel={TYPE_LABELS.get(mission.type) || mission.label || ''} summary={describeMissionModules(baseCapabilities, modules)} saving={savingModel} onSave={saveModel} />
        <PointSheet visible={sheet === 'point'} onClose={() => setSheet(null)} preset={pointPreset} presets={playbook.pointPresets || []} saving={savingPoint} onSave={savePoint} />
        <PointsListSheet visible={sheet === 'points'} onClose={() => setSheet(null)} points={points} today={today} onClosePoint={closePoint} onReopenPoint={reopenPoint} />
        <VisitsListSheet visible={sheet === 'visits'} onClose={() => setSheet(null)} visits={data.visits || []} sitesById={sitesById} onOpenVisit={sheetModel.openVisit} />
        <DeliverablesSheet visible={sheet === 'deliverables'} onClose={() => setSheet(null)} onExportFull={exportFullExcel} onImport={importExcel} onReport={sheetModel.openReport} busy={busy} />
        <CustomizeSheet
          visible={sheet === 'customize'}
          onClose={() => setSheet(null)}
          modulesSummary={describeMissionModules(baseCapabilities, modules)}
          onManageModules={() => setSheet('modules')}
          onSaveModel={() => setSheet('model')}
          hidden={layout.hidden}
          onShowBlock={(key) => { if (!editing) enterEdit(); editDraft((current) => showSheetBlock(current, key, ctx)); }}
          onApplyPreset={(key) => { if (!editing) enterEdit(); editDraft((current) => applySheetPreset(current, key, ctx)); setSheet(null); }}
          onFactory={() => { if (!editing) enterEdit(); editDraft(() => defaultSheetLayout(ctx)); setSheet(null); }}
          hasMissionLayout={Boolean(stored.mission)}
          hasTypeLayout={Boolean(stored.type)}
          onForgetMission={() => forget('mission')}
          onForgetType={() => forget('type')}
          typeLabel={TYPE_LABELS.get(mission.type) || null}
          gloves={gloves}
          onToggleGloves={toggleGloves}
        />
        <ScopeSheet visible={sheet === 'scope'} onClose={() => setSheet(null)} typeLabel={TYPE_LABELS.get(mission.type) || null} defaultScope={pinScope} onChoose={saveDraft} />
        <MoveSheet
          visible={sheet === 'move'}
          onClose={() => setSheet(null)}
          blockKey={moveKey}
          blocks={blocks}
          onMove={(target) => { setSheet(null); editDraft((current) => moveSheetBlockTo(current, moveKey, target)); }}
        />
      </View>
    </SheetErgoProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 132 },
  contentWide: { paddingHorizontal: 24, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  columns: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  column: { flex: 1, gap: 12 },
  lockStrip: { ...sheetStyles.surface, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: MISSION_COLORS.accentSoft },
  editCard: { ...sheetStyles.surface, padding: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: MISSION_COLORS.accentLineStrong },
  preview: { opacity: 0.55, maxHeight: 150, overflow: 'hidden' },
  hiddenTray: { ...sheetStyles.surface, padding: 14, gap: 4, backgroundColor: MISSION_COLORS.accentSoft },
});
