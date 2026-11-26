/**
 * Fiche Mission modulable — rendu des blocs.
 *
 * Chaque bloc reçoit l'objet `sheet` préparé par MissionScreen (données +
 * actions) et sa taille (`compact` ou `detailed`). Un bloc sans contenu se
 * replie en une ligne fine qui propose l'action pour le remplir.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { GlassCard, IconOrb, ProgressRing } from './premiumChrome.js';
import {
  SHEET_INDICATORS,
  SHEET_POINT_STATUS,
  SHEET_POINT_TYPES,
  SHEET_TOOL_BY_KEY,
} from './missionSheetRegistry.js';
import {
  formatSheetAgo,
  formatSheetDate,
  plural,
  ProgressBar,
  SHEET_TYPE,
  SheetButton,
  SheetCard,
  SheetChip,
  SheetEmptyLine,
  SheetIconButton,
  SheetRow,
  StatusPill,
  useSheetErgo,
} from './missionSheetUi.js';

const MISSION_STATUS = { draft: ['Brouillon', 'neutral'], active: ['En cours', 'accent'], closed: ['Clôturée', 'info'], cancelled: ['Annulée', 'neutral'] };
const VISIT_STATUS = { draft: ['Brouillon', 'warning'], in_progress: ['En cours', 'accent'], completed: ['Terminée', 'info'] };
const POINT_TYPE_BY_KEY = Object.fromEntries(SHEET_POINT_TYPES.map((item) => [item.key, item]));
const POINT_TONE = { open: 'warning', in_progress: 'accent', waiting: 'neutral', to_check: 'info', closed: 'neutral', no_follow_up: 'neutral' };

export const cleanActionLabel = (label) => String(label || '').replace(/^[＋+]\s*/, '').trim();

function isOverdue(point, today) {
  const due = String(point?.due_date || '').slice(0, 10);
  return Boolean(due) && due < today;
}

function pointMeta(point, today) {
  const parts = [POINT_TYPE_BY_KEY[point.type]?.label || 'Point', SHEET_POINT_STATUS[point.status] || point.status];
  if (point.due_date) parts.push(`${isOverdue(point, today) ? 'en retard · ' : 'échéance '}${formatSheetDate(point.due_date)}`);
  else if (point.due_text) parts.push(point.due_text);
  return parts.filter(Boolean).join(' · ');
}

function visitTitle(visit) {
  const type = visit.visit_type ? visit.visit_type.charAt(0).toUpperCase() + visit.visit_type.slice(1) : 'Visite';
  return type;
}

function visitMeta(visit, sitesById) {
  const site = sitesById[visit.site_id]?.name;
  const date = formatSheetDate(visit.visit_date || visit.updated_at || visit.created_at);
  return [site, date].filter(Boolean).join(' · ');
}

function measureValue(row) {
  if (row.value_number != null && row.value_number !== '') {
    const n = Number(row.value_number);
    const text = Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : String(row.value_number);
    return `${text}${row.unit ? ` ${row.unit}` : ''}`;
  }
  return row.value_text || '—';
}

// ---------------------------------------------------------------------------
// Blocs verrouillés
// ---------------------------------------------------------------------------

function HeaderBlock({ sheet }) {
  const { mission, phaseProgress, typeLabel, clientName, siteLine, layoutSource } = sheet;
  const [statusLabel, statusTone] = MISSION_STATUS[mission.status] || [mission.status || 'Brouillon', 'neutral'];
  const sourceLabel = layoutSource === 'mission' ? 'Disposition propre' : layoutSource === 'type' ? 'Disposition du type' : null;
  return (
    <View style={s.header}>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={s.headerPills}>
          <StatusPill label={statusLabel} tone={statusTone} />
          {typeLabel ? <StatusPill label={typeLabel} tone="accent" /> : null}
        </View>
        <Text style={SHEET_TYPE.title} numberOfLines={3} accessibilityRole="header">{mission.label || 'Mission sans titre'}</Text>
        {clientName || siteLine ? <Text style={SHEET_TYPE.meta} numberOfLines={2}>{[clientName, siteLine].filter(Boolean).join(' · ')}</Text> : null}
        <View style={s.headerTools}>
          <SheetChip icon="layout" label="Personnaliser" onPress={sheet.onCustomize} accessibilityLabel="Personnaliser la fiche Mission" />
          {sourceLabel ? <SheetChip icon={layoutSource === 'mission' ? 'pin' : 'list'} label={sourceLabel} onPress={sheet.onCustomize} tone="neutral" accessibilityLabel={`${sourceLabel} : ouvrir la personnalisation`} /> : null}
        </View>
      </View>
      {phaseProgress.total > 0 ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Phases : ${phaseProgress.done} sur ${phaseProgress.total} terminées`} onPress={sheet.openWorkflow} style={s.ring}>
          <ProgressRing pct={phaseProgress.pct * 100} size={64} strokeWidth={6} accent={MISSION_COLORS.accent} />
          <View style={s.ringCenter} pointerEvents="none"><Text style={s.ringText}>{phaseProgress.done}/{phaseProgress.total}</Text></View>
          <Text style={[SHEET_TYPE.meta, { textAlign: 'center' }]}>phases</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PrimaryBlock({ sheet }) {
  const ergo = useSheetErgo();
  const resume = sheet.resume;
  const counts = resume ? [
    resume.fields_count ? plural(resume.fields_count, 'champ') : null,
    resume.photos_count ? plural(resume.photos_count, 'photo') : null,
    resume.measures_count ? plural(resume.measures_count, 'mesure') : null,
    resume.points_count ? plural(resume.points_count, 'point') : null,
  ].filter(Boolean) : [];
  return (
    <GlassCard radius={22}>
      <View style={s.primary}>
      <View style={s.primaryHead}>
        <IconOrb accent={MISSION_COLORS.accent} light={MISSION_COLORS.accentLight} size={48}>
          <CvcIcon name={resume ? 'play' : 'camera'} size={24} color={MISSION_COLORS.accentDark} strokeWidth={2} />
        </IconOrb>
        <View style={{ flex: 1 }}>
          <Text style={SHEET_TYPE.blockTitle} numberOfLines={2}>{resume ? `Reprendre · ${visitTitle(resume)}` : 'Prêt pour le terrain'}</Text>
          <Text style={[SHEET_TYPE.meta, { marginTop: 2 }]} numberOfLines={2}>
            {resume
              ? [resume.site_name, `modifiée ${formatSheetAgo(resume.touched_at)}`, counts.join(' · ') || 'rien de saisi pour l’instant'].filter(Boolean).join(' · ')
              : 'Rien n’est obligatoire : quitte et reprends la visite quand tu veux, rien n’est perdu.'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={resume ? 'Reprendre la visite en cours' : 'Démarrer une visite'}
        onPress={resume ? () => sheet.resumeVisit(resume) : sheet.startVisit}
        disabled={sheet.busy.visit}
        style={[s.primaryBtn, { minHeight: ergo.target + 6 }]}
      >
        <ButtonGlow tone="mission" radius={17} />
        <CvcIcon name={resume ? 'play' : 'plus'} size={20} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={s.primaryBtnText}>{sheet.busy.visit ? 'Ouverture…' : resume ? 'Reprendre la visite' : 'Démarrer une visite'}</Text>
      </TouchableOpacity>
      <View style={s.primaryRow}>
        <SheetButton icon="plus" label="Point" onPress={() => sheet.openPointSheet(null)} style={{ flex: 1 }} />
        {resume ? <SheetButton icon="camera" label="Nouvelle visite" onPress={sheet.startVisit} style={{ flex: 1 }} /> : null}
        {!resume && sheet.capabilities.measurements !== false ? <SheetButton icon="gauge" label="Mesure" onPress={() => sheet.openTool('measurements')} style={{ flex: 1 }} /> : null}
      </View>
      </View>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Blocs déplaçables
// ---------------------------------------------------------------------------

function TodoBlock({ sheet, size }) {
  const { openPoints, today, extras } = sheet;
  const sorted = openPoints.slice().sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)));
  const shown = sorted.slice(0, size === 'detailed' ? 6 : 3);
  const lateDocs = extras.documents.late;
  return (
    <SheetCard
      title="À traiter"
      icon="warning"
      count={openPoints.length || null}
      countTone={sorted.some((p) => isOverdue(p, today)) ? 'danger' : 'warning'}
      action={(sheet.points.length > shown.length) ? { label: 'Tout voir', accessibilityLabel: 'Voir tous les points', onPress: sheet.openAllPoints } : null}
      onLongPressTitle={sheet.onLongPress}
    >
      {shown.length ? shown.map((point, index) => (
        <SheetRow
          key={point.id}
          icon={POINT_TYPE_BY_KEY[point.type]?.icon || 'remark'}
          iconTone={isOverdue(point, today) ? 'danger' : (POINT_TONE[point.status] || 'warning')}
          title={point.label || 'Point sans titre'}
          meta={pointMeta(point, today)}
          last={index === shown.length - 1 && !lateDocs}
          right={<SheetIconButton icon="tick" label={`Clôturer « ${point.label || 'point'} »`} onPress={() => sheet.closePoint(point)} />}
        />
      )) : <SheetEmptyLine icon="check" text="Aucun point ouvert." actionLabel="Ajouter" onAction={() => sheet.openPointSheet(null)} />}
      {lateDocs ? (
        <SheetRow icon="document" iconTone="danger" title={plural(lateDocs, 'document attendu en retard', 'documents attendus en retard')} meta="Relancer ou marquer reçu" onPress={() => sheet.openTool('documents')} last />
      ) : null}
    </SheetCard>
  );
}

function VisitsBlock({ sheet, size }) {
  const visits = sheet.visits.slice().sort((a, b) => {
    const rank = (v) => (v.status === 'completed' ? 1 : 0);
    return rank(a) - rank(b);
  });
  const shown = visits.slice(0, size === 'detailed' ? 5 : 2);
  return (
    <SheetCard
      title="Visites"
      icon="clock"
      count={visits.length || null}
      action={visits.length > shown.length ? { label: 'Toutes', accessibilityLabel: 'Voir toutes les visites', onPress: sheet.openAllVisits } : null}
      onLongPressTitle={sheet.onLongPress}
    >
      {shown.length ? shown.map((visit, index) => {
        const [label, tone] = VISIT_STATUS[visit.status] || [visit.status, 'neutral'];
        return (
          <SheetRow
            key={visit.id}
            icon={visit.status === 'completed' ? 'check' : 'play'}
            iconTone={visit.status === 'completed' ? 'info' : 'accent'}
            title={visitTitle(visit)}
            meta={visitMeta(visit, sheet.sitesById)}
            onPress={() => sheet.openVisit(visit)}
            accessibilityLabel={`Ouvrir la visite ${visitTitle(visit)}, ${label}`}
            right={<StatusPill label={label} tone={tone} />}
            last={index === shown.length - 1}
          />
        );
      }) : <SheetEmptyLine icon="camera" text="Aucune visite. Démarre la première depuis l’action principale." />}
    </SheetCard>
  );
}

const TARGET_LABELS = { mission: 'Mission', site: 'par site', location: 'par local', equipment: 'par équipement', free: 'fiches libres' };

function FormsBlock({ sheet, size }) {
  const forms = sheet.extras.forms || [];
  const shown = forms.slice(0, size === 'detailed' ? 6 : 3);
  return (
    <SheetCard title="Trames" icon="control" count={forms.length || null} onLongPressTitle={sheet.onLongPress} action={{ label: 'Gérer', accessibilityLabel: 'Gérer les trames de la Mission', onPress: () => sheet.openTool('forms') }}>
      {shown.map((form, index) => {
        const total = Number(form.entry_count || 0);
        const done = Number(form.done_count || 0);
        return (
          <SheetRow
            key={form.id}
            icon="control"
            title={form.label}
            meta={[TARGET_LABELS[form.target_type] || '', total ? `${done}/${total} fiche${total > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''}` : 'aucune fiche'].filter(Boolean).join(' · ')}
            onPress={() => sheet.openForm(form)}
            accessibilityLabel={form.draft_entry_id ? `Reprendre la fiche ${form.label}` : `Nouvelle fiche ${form.label}`}
            right={<StatusPill label={form.draft_entry_id ? 'Reprendre' : 'Remplir'} tone={form.draft_entry_id ? 'warning' : 'accent'} />}
            last={index === shown.length - 1}
          />
        );
      })}
    </SheetCard>
  );
}

function ProgressBlock({ sheet, size }) {
  const { phases, phaseProgress, playbook } = sheet;
  const current = phases.find((phase) => phase.status === 'active') || phases.find((phase) => phase.status === 'planned');
  const pointPresets = (playbook.quickActions || []).filter((item) => item.kind === 'point');
  return (
    <SheetCard title="Progression" icon="route" onLongPressTitle={sheet.onLongPress} action={sheet.capabilities.workflow !== false ? { label: 'Workflow', onPress: sheet.openWorkflow } : null}>
      {phases.length ? (
        <View style={{ gap: 8 }}>
          <View style={s.phaseLine}>
            <Text style={[SHEET_TYPE.bodyStrong, { flex: 1 }]} numberOfLines={2}>{current ? `Phase en cours : ${current.label}` : 'Toutes les phases sont traitées'}</Text>
            <Text style={SHEET_TYPE.meta}>{phaseProgress.done}/{phaseProgress.total}</Text>
          </View>
          <ProgressBar pct={phaseProgress.pct} />
          {size === 'detailed' ? (
            <View style={s.wrap}>
              {phases.map((phase) => (
                <StatusPill key={phase.id} label={phase.label} tone={phase.status === 'done' ? 'accent' : phase.status === 'active' ? 'info' : 'neutral'} />
              ))}
            </View>
          ) : null}
        </View>
      ) : <SheetEmptyLine icon="route" text="Aucune phase imposée : la Mission reste libre." />}
      <View style={s.divider} />
      <Text style={SHEET_TYPE.label} numberOfLines={2}>Parcours recommandé · {playbook.label}</Text>
      {size === 'detailed' && playbook.objective ? <Text style={SHEET_TYPE.meta}>{playbook.objective}</Text> : null}
      <View style={s.steps}>
        {(playbook.steps || []).map((step, index) => (
          <View key={step} style={s.step}>
            <View style={s.stepDot}><Text style={s.stepNum}>{index + 1}</Text></View>
            <Text style={s.stepText} numberOfLines={1}>{step}</Text>
          </View>
        ))}
      </View>
      {size === 'detailed' && pointPresets.length ? (
        <View style={s.wrap}>
          {pointPresets.map((item) => <SheetChip key={item.key} icon="plus" label={cleanActionLabel(item.label)} onPress={() => sheet.openPointSheet(item.preset)} />)}
        </View>
      ) : null}
    </SheetCard>
  );
}

function ReservesBlock({ sheet, size }) {
  const reserves = sheet.points.filter((point) => point.type === 'reserve');
  const open = reserves.filter((point) => ['open', 'in_progress', 'waiting'].includes(point.status));
  const toCheck = reserves.filter((point) => point.status === 'to_check');
  const lifted = reserves.filter((point) => ['closed', 'no_follow_up'].includes(point.status));
  const tool = sheet.capabilities.reserveClearance !== false ? 'reserveClearance' : 'receptionBoard';
  return (
    <SheetCard title="Réserves" icon="flag" count={open.length + toCheck.length || null} onLongPressTitle={sheet.onLongPress} action={reserves.length ? { label: 'Lever', accessibilityLabel: 'Ouvrir la levée de réserves', onPress: () => sheet.openTool(tool) } : null}>
      {reserves.length ? (
        <>
          <View style={s.stats}>
            <Stat value={open.length} label="ouvertes" tone="warning" />
            <Stat value={toCheck.length} label="à contrôler" tone="info" />
            <Stat value={lifted.length} label="levées" tone="accent" />
          </View>
          <ProgressBar pct={reserves.length ? lifted.length / reserves.length : 0} />
          {size === 'detailed' ? open.slice(0, 3).map((point, index, list) => (
            <SheetRow key={point.id} icon="flag" iconTone="warning" title={point.label || 'Réserve'} meta={pointMeta(point, sheet.today)} last={index === list.length - 1} />
          )) : null}
        </>
      ) : <SheetEmptyLine icon="flag" text="Aucune réserve émise." actionLabel="Émettre" onAction={() => sheet.openPointSheet({ pointType: 'reserve', label: '' })} />}
    </SheetCard>
  );
}

function SitesBlock({ sheet }) {
  const sites = sheet.extras.sites;
  const tool = sheet.capabilities.campaignDashboard !== false ? 'campaignDashboard' : 'map';
  return (
    <SheetCard title="Avancement multi-sites" icon="location" count={sites.total || null} onLongPressTitle={sheet.onLongPress} action={{ label: 'Cockpit', accessibilityLabel: 'Ouvrir le cockpit multi-sites', onPress: () => sheet.openTool(tool) }}>
      {sites.total ? (
        <>
          <View style={s.stats}>
            <Stat value={sites.todo} label="à faire" tone="neutral" />
            <Stat value={sites.progress} label="en cours" tone="info" />
            <Stat value={sites.done} label="terminés" tone="accent" />
          </View>
          <ProgressBar pct={sites.done / sites.total} />
        </>
      ) : <SheetEmptyLine icon="location" text="Aucun site rattaché." actionLabel="Patrimoine" onAction={() => sheet.openTool('structure')} />}
    </SheetCard>
  );
}

function Stat({ value, label, tone }) {
  const color = tone === 'warning' ? '#8A5B14' : tone === 'info' ? '#1F5D7A' : tone === 'danger' ? '#A23B2A' : tone === 'neutral' ? COLORS.inkSoft : MISSION_COLORS.accentStrong;
  return (
    <View style={s.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={[SHEET_TYPE.number, { color }]}>{value}</Text>
      <Text style={SHEET_TYPE.meta} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ToolsBlock({ sheet, size }) {
  const ergo = useSheetErgo();
  const detailed = size === 'detailed';
  const columns = sheet.wide ? (detailed ? 3 : 4) : (detailed ? 2 : 3);
  const tiles = sheet.pinnedTools.map((key) => SHEET_TOOL_BY_KEY[key]).filter(Boolean);
  const basis = `${(100 / columns).toFixed(4)}%`;
  const suggestion = sheet.suggestion ? SHEET_TOOL_BY_KEY[sheet.suggestion.toolKey] : null;
  return (
    <SheetCard title="Outils épinglés" icon="tools" onLongPressTitle={sheet.onLongPress} action={{ label: 'Tous', accessibilityLabel: 'Voir tous les outils', onPress: sheet.openAllTools }}>
      {suggestion ? (
        <View style={s.suggest}>
          <CvcIcon name="star" size={20} color="#8A5B14" strokeWidth={2} />
          <Text style={[SHEET_TYPE.body, { flex: 1 }]}>Tu ouvres souvent « {suggestion.title} ». L’épingler ici ?</Text>
          <View style={s.suggestActions}>
            <SheetButton label="Épingler" onPress={() => sheet.onSuggestion('accept')} />
            <SheetButton label="Plus tard" tone="neutral" onPress={() => sheet.onSuggestion('later')} />
            <SheetButton label="Ne plus proposer" tone="neutral" onPress={() => sheet.onSuggestion('never')} />
          </View>
        </View>
      ) : null}
      <View style={s.grid}>
        {tiles.map((tool) => (
          <View key={tool.key} style={{ width: basis, padding: 4 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${tool.title}. ${tool.subtitle}`} onPress={() => sheet.openTool(tool.key)} style={[s.tile, { minHeight: detailed ? 96 : ergo.target + 34 }]}>
              <IconOrb accent={MISSION_COLORS.accent} light={MISSION_COLORS.accentLight} size={detailed ? 40 : 36}>
                <CvcIcon name={tool.icon} size={detailed ? 21 : 19} color={MISSION_COLORS.accentDark} strokeWidth={2} />
              </IconOrb>
              <Text style={s.tileTitle} numberOfLines={2}>{tool.title}</Text>
              {detailed ? <Text style={s.tileSub} numberOfLines={2}>{tool.subtitle}</Text> : null}
            </TouchableOpacity>
          </View>
        ))}
        <View style={{ width: basis, padding: 4 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tous les outils, ${sheet.availableToolCount} disponibles`} onPress={sheet.openAllTools} style={[s.tile, s.tileAll, { minHeight: detailed ? 96 : ergo.target + 34 }]}>
            <View style={s.allOrb}><CvcIcon name="grid" size={detailed ? 21 : 19} color={MISSION_COLORS.accent} strokeWidth={2} /></View>
            <Text style={[s.tileTitle, { color: MISSION_COLORS.accentDark }]} numberOfLines={2}>Tous les outils</Text>
            {detailed ? <Text style={s.tileSub} numberOfLines={1}>{sheet.availableToolCount} disponibles</Text> : null}
          </TouchableOpacity>
        </View>
      </View>
    </SheetCard>
  );
}

function MeasuresBlock({ sheet, size }) {
  const rows = sheet.extras.measures.slice(0, size === 'detailed' ? 6 : 3);
  return (
    <SheetCard title="Mesures récentes" icon="gauge" onLongPressTitle={sheet.onLongPress} action={rows.length ? { label: 'Mesures', onPress: () => sheet.openTool('measurements') } : null}>
      {rows.length ? rows.map((row, index) => (
        <SheetRow
          key={row.id}
          icon="gauge"
          iconTone={row.anomaly_status === 'to_check' ? 'warning' : 'accent'}
          title={row.type || 'Mesure'}
          meta={[formatSheetDate(row.measured_at), row.anomaly_status === 'to_check' ? 'à contrôler' : null].filter(Boolean).join(' · ')}
          right={<Text style={s.value}>{measureValue(row)}</Text>}
          last={index === rows.length - 1}
        />
      )) : <SheetEmptyLine icon="gauge" text="Aucune mesure relevée." actionLabel="Mesurer" onAction={() => sheet.openTool('measurements')} />}
    </SheetCard>
  );
}

function ExpectedDocumentsBlock({ sheet, size }) {
  const docs = sheet.extras.documents;
  const next = docs.next.slice(0, size === 'detailed' ? 4 : 2);
  return (
    <SheetCard title="Documents attendus" icon="document" count={docs.pending || null} countTone={docs.late ? 'danger' : 'accent'} onLongPressTitle={sheet.onLongPress} action={{ label: 'Documents', onPress: () => sheet.openTool('documents') }}>
      {docs.total ? (
        <>
          <View style={s.stats}>
            <Stat value={docs.pending} label="attendus" tone="warning" />
            <Stat value={docs.late} label="en retard" tone={docs.late ? 'danger' : 'neutral'} />
            <Stat value={docs.done} label="reçus" tone="accent" />
          </View>
          {next.map((doc, index) => (
            <SheetRow key={doc.id} icon="document" iconTone={doc.is_late ? 'danger' : 'accent'} title={doc.label || 'Document'} meta={doc.due_date ? `${doc.is_late ? 'en retard depuis le' : 'attendu le'} ${formatSheetDate(doc.due_date)}` : doc.due_text || 'sans échéance'} last={index === next.length - 1} />
          ))}
        </>
      ) : <SheetEmptyLine icon="document" text="Aucun document attendu." actionLabel="Préparer" onAction={() => sheet.openTool('documents')} />}
    </SheetCard>
  );
}

function IndicatorsBlock({ sheet }) {
  const items = SHEET_INDICATORS
    .map((item) => ({ ...item, value: Number(sheet.summary?.[item.key] || 0) }))
    .filter((item) => item.value > 0 && sheet.capabilities[item.tool] !== false);
  return (
    <SheetCard title="Indicateurs" icon="chart" onLongPressTitle={sheet.onLongPress}>
      {items.length ? (
        <View style={s.wrap}>
          {items.map((item) => (
            <TouchableOpacity key={item.key} accessibilityRole="button" accessibilityLabel={`${item.value} ${item.value > 1 ? item.label : item.singular}`} onPress={() => sheet.openTool(item.tool)} style={s.indicator}>
              <Text style={SHEET_TYPE.number}>{item.value}</Text>
              <Text style={SHEET_TYPE.meta} numberOfLines={2}>{item.value > 1 ? item.label : item.singular}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : <SheetEmptyLine icon="chart" text="Rien à signaler : les indicateurs apparaissent dès qu’il y a des actions, constats, essais ou calculs." />}
    </SheetCard>
  );
}

function DeliverablesBlock({ sheet, size }) {
  const items = [
    { key: 'report', icon: 'document', title: 'Rapport', sub: 'Word / PDF', onPress: sheet.openReport },
    { key: 'client', icon: 'export', title: 'Excel client simplifié', sub: 'Lecture directe', onPress: sheet.exportClientExcel, busy: sheet.busy.client },
    sheet.capabilities.package !== false ? { key: 'zip', icon: 'storage', title: 'Dossier complet', sub: 'ZIP configurable', onPress: () => sheet.openTool('package') } : null,
  ].filter(Boolean);
  return (
    <SheetCard title="Livrables" icon="export" onLongPressTitle={sheet.onLongPress} action={{ label: 'Plus', accessibilityLabel: 'Autres exports et imports', onPress: sheet.openDeliverablesMenu }}>
      <View style={s.deliverables}>
        {items.map((item) => (
          <TouchableOpacity key={item.key} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.sub}`} disabled={item.busy} onPress={item.onPress} style={[s.deliverable, item.busy && { opacity: 0.55 }]}>
            <CvcIcon name={item.icon} size={22} color={MISSION_COLORS.accentDark} strokeWidth={2} />
            <Text style={s.tileTitle} numberOfLines={2}>{item.busy ? 'Export…' : item.title}</Text>
            <Text style={s.tileSub} numberOfLines={1}>{item.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {size === 'detailed' ? <Text style={SHEET_TYPE.meta}>L’Excel complet se réimporte dans METRA sans perte ; l’Excel client simplifié se lit directement, feuille par feuille.</Text> : null}
    </SheetCard>
  );
}

export const SHEET_BLOCK_RENDERERS = Object.freeze({
  header: HeaderBlock,
  primary: PrimaryBlock,
  todo: TodoBlock,
  visits: VisitsBlock,
  forms: FormsBlock,
  progress: ProgressBlock,
  reserves: ReservesBlock,
  sites: SitesBlock,
  tools: ToolsBlock,
  measures: MeasuresBlock,
  expectedDocuments: ExpectedDocumentsBlock,
  indicators: IndicatorsBlock,
  deliverables: DeliverablesBlock,
});

export { pointMeta, isOverdue, visitTitle, visitMeta, VISIT_STATUS, POINT_TYPE_BY_KEY };

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4 },
  headerPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  headerTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  ring: { alignItems: 'center', gap: 2, minWidth: 64 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, height: 64, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: FONTS.black, fontSize: 15, color: MISSION_COLORS.accentStrong },
  primary: { padding: 16, gap: 12 },
  primaryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 17, overflow: 'hidden', paddingHorizontal: 18 },
  primaryBtnText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 },
  primaryRow: { flexDirection: 'row', gap: 8 },
  phaseLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: MISSION_COLORS.accentLine },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: MISSION_COLORS.accentLight, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: FONTS.bold, fontSize: 12, color: MISSION_COLORS.accentDark },
  stepText: { fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.ink },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: MISSION_COLORS.accentLine, paddingVertical: 10, paddingHorizontal: 10 },
  suggest: { borderRadius: 16, backgroundColor: '#FFF8EA', borderWidth: 1, borderColor: '#F1D9A8', padding: 12, gap: 8 },
  suggestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  tile: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: StyleSheet.hairlineWidth, borderColor: MISSION_COLORS.accentLine, padding: 10, gap: 6 },
  tileAll: { borderStyle: 'dashed', borderWidth: 1, borderColor: MISSION_COLORS.accentLineStrong, backgroundColor: MISSION_COLORS.accentSoft },
  allOrb: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  tileTitle: { fontFamily: FONTS.bodyBold, fontSize: 13.5, lineHeight: 17, color: COLORS.ink },
  tileSub: { fontFamily: FONTS.bodyMedium, fontSize: 12, lineHeight: 16, color: COLORS.inkSoft },
  value: { fontFamily: FONTS.black, fontSize: 16, color: MISSION_COLORS.accentStrong },
  indicator: { minWidth: 96, flexGrow: 1, flexBasis: 96, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: MISSION_COLORS.accentLine, padding: 10, minHeight: 64 },
  deliverables: { flexDirection: 'row', gap: 8 },
  deliverable: { flex: 1, minHeight: 92, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: StyleSheet.hairlineWidth, borderColor: MISSION_COLORS.accentLine, padding: 10, gap: 4 },
});
