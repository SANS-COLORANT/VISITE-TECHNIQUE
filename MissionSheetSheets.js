/**
 * Fiche Mission modulable — feuilles du bas : tous les outils, nouveau point,
 * listes complètes, galerie de blocs, portée d'enregistrement, déplacement.
 * Toutes passent par BottomSheet (VisitKit) : même geste, même fermeture.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { BottomSheet } from './VisitKit.js';
import { IconOrb } from './premiumChrome.js';
import {
  SHEET_BLOCKS,
  SHEET_BLOCK_BY_KEY,
  SHEET_MAX_PINNED,
  SHEET_POINT_STATUS,
  SHEET_POINT_TYPES,
  SHEET_PRESETS,
  SHEET_TOOL_BY_KEY,
  SHEET_TOOL_GROUPS,
  SHEET_TOOLS,
} from './missionSheetRegistry.js';
import { SHEET_TYPE, SheetButton, SheetChip, SheetIconButton, SheetRow, StatusPill, useSheetErgo } from './missionSheetUi.js';
import { isMissionModuleOn, missionModuleState } from './missionModules.js';
import { cleanActionLabel, isOverdue, pointMeta, POINT_TYPE_BY_KEY, VISIT_STATUS, visitMeta, visitTitle } from './MissionSheetBlocks.js';

const normalize = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tous les outils, groupés, avec recherche et étoile pour épingler. */
export function AllToolsSheet({ visible, onClose, availableTools, pinnedTools, onOpenTool, onTogglePin, onManageModules }) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);
  const available = useMemo(() => new Set(availableTools), [availableTools]);
  const q = normalize(query.trim());
  const tools = SHEET_TOOLS.filter((tool) => available.has(tool.key) && (!q || normalize(`${tool.title} ${tool.subtitle}`).includes(q)));
  const full = pinnedTools.length >= SHEET_MAX_PINNED;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Tous les outils" subtitle={`${availableTools.length} outils pour ce type de Mission · l’étoile épingle sur la fiche`}>
      <View style={s.search}>
        <CvcIcon name="search" size={19} color={COLORS.inkSoft} strokeWidth={2} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un outil" placeholderTextColor={COLORS.inkFaint} style={s.searchInput} accessibilityLabel="Rechercher un outil" returnKeyType="search" />
        {query ? <TouchableOpacity accessibilityLabel="Effacer la recherche" onPress={() => setQuery('')} style={s.clear}><CvcIcon name="close" size={16} color={COLORS.inkSoft} strokeWidth={2.2} /></TouchableOpacity> : null}
      </View>
      {onManageModules && !q ? <SheetRow icon="layout" title="Ajouter ou retirer des briques" meta="Prends un outil d’un autre type de Mission, ou retire ceux qui ne servent pas." onPress={onManageModules} last /> : null}
      {SHEET_TOOL_GROUPS.map((group) => {
        const items = tools.filter((tool) => tool.group === group.key);
        if (!items.length) return null;
        return (
          <View key={group.key} style={{ marginTop: 14 }}>
            <Text style={SHEET_TYPE.label}>{group.label}</Text>
            {items.map((tool, index) => {
              const pinned = pinnedTools.includes(tool.key);
              return (
                <SheetRow
                  key={tool.key}
                  icon={tool.icon}
                  title={tool.title}
                  meta={tool.subtitle}
                  onPress={() => onOpenTool(tool.key)}
                  accessibilityLabel={`Ouvrir ${tool.title}`}
                  last={index === items.length - 1}
                  right={(
                    <SheetIconButton
                      icon={pinned ? 'star-filled' : 'star'}
                      tone={pinned ? 'warning' : 'neutral'}
                      filled={pinned}
                      disabled={!pinned && full}
                      label={pinned ? `Désépingler ${tool.title}` : `Épingler ${tool.title}`}
                      onPress={() => onTogglePin(tool.key)}
                    />
                  )}
                />
              );
            })}
          </View>
        );
      })}
      {!tools.length ? <Text style={[SHEET_TYPE.meta, { marginTop: 16 }]}>Aucun outil ne correspond à « {query} ».</Text> : null}
      {full ? <Text style={[SHEET_TYPE.meta, { marginTop: 12 }]}>{SHEET_MAX_PINNED} outils épinglés au maximum : retire une étoile pour en ajouter une autre.</Text> : null}
    </BottomSheet>
  );
}

/** Nouveau point : type en un geste, intitulé, détail et échéance facultatifs. */
export function PointSheet({ visible, onClose, preset, presets = [], saving, onSave }) {
  const ergo = useSheetErgo();
  const [type, setType] = useState('information');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [dueText, setDueText] = useState('');
  useEffect(() => {
    if (!visible) return;
    setType(preset?.pointType || 'information');
    setLabel(preset?.label || '');
    setDescription(preset?.description || preset?.requestedAction || '');
    setDueText(preset?.due || '');
  }, [visible, preset]);
  const applyPreset = (item) => {
    setType(item.pointType || 'information');
    setLabel(item.label || '');
    if (item.description || item.requestedAction) setDescription(item.description || item.requestedAction);
  };
  const canSave = label.trim().length > 0 && !saving;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Nouveau point"
      subtitle="Réserve, action, demande… il rejoint « À traiter » et les exports."
      footer={(
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => onSave({ type, label: label.trim(), description: description.trim(), dueText: dueText.trim() })} style={[s.save, { minHeight: ergo.target + 4, opacity: canSave ? 1 : 0.45 }]}>
          <CvcIcon name="tick" size={20} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={s.saveText}>{saving ? 'Enregistrement…' : 'Ajouter le point'}</Text>
        </TouchableOpacity>
      )}
    >
      <View style={s.wrap}>
        {SHEET_POINT_TYPES.map((item) => <SheetChip key={item.key} icon={item.icon} label={item.label} active={type === item.key} onPress={() => setType(item.key)} />)}
      </View>
      {presets.length ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={SHEET_TYPE.label}>Suggestions du parcours</Text>
          <View style={s.wrap}>{presets.slice(0, 6).map((item) => <SheetChip key={item.label} label={cleanActionLabel(item.label)} tone="neutral" onPress={() => applyPreset(item)} />)}</View>
        </View>
      ) : null}
      <Text style={[SHEET_TYPE.label, { marginTop: 16 }]}>Intitulé</Text>
      <TextInput value={label} onChangeText={setLabel} placeholder="Ex. calorifuge dégradé en chaufferie" placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: ergo.target + 4 }]} accessibilityLabel="Intitulé du point" />
      <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Détail (facultatif)</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="Constat, localisation, action demandée" placeholderTextColor={COLORS.inkFaint} multiline style={[s.input, { minHeight: 88, textAlignVertical: 'top' }]} accessibilityLabel="Détail du point" />
      <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Échéance (facultatif)</Text>
      <TextInput value={dueText} onChangeText={setDueText} placeholder="Ex. avant réception, sous 15 jours" placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: ergo.target + 4 }]} accessibilityLabel="Échéance du point" />
    </BottomSheet>
  );
}

/** Tous les points, ouverts d'abord, avec filtre. */
export function PointsListSheet({ visible, onClose, points, today, onClosePoint, onReopenPoint }) {
  const [filter, setFilter] = useState('open');
  const closed = (point) => ['closed', 'no_follow_up'].includes(point.status);
  const list = points.filter((point) => (filter === 'open' ? !closed(point) : filter === 'closed' ? closed(point) : true));
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Points de la Mission" subtitle={`${points.filter((p) => !closed(p)).length} ouverts · ${points.filter(closed).length} clôturés`}>
      <View style={s.wrap}>
        <SheetChip label="Ouverts" active={filter === 'open'} onPress={() => setFilter('open')} />
        <SheetChip label="Clôturés" active={filter === 'closed'} onPress={() => setFilter('closed')} />
        <SheetChip label="Tous" active={filter === 'all'} onPress={() => setFilter('all')} />
      </View>
      <View style={{ marginTop: 8 }}>
        {list.map((point, index) => (
          <SheetRow
            key={point.id}
            icon={POINT_TYPE_BY_KEY[point.type]?.icon || 'remark'}
            iconTone={closed(point) ? 'neutral' : isOverdue(point, today) ? 'danger' : 'warning'}
            title={point.label || 'Point sans titre'}
            meta={pointMeta(point, today)}
            last={index === list.length - 1}
            right={closed(point)
              ? <SheetIconButton icon="undo" tone="neutral" label={`Rouvrir « ${point.label || 'point'} »`} onPress={() => onReopenPoint(point)} />
              : <SheetIconButton icon="tick" label={`Clôturer « ${point.label || 'point'} »`} onPress={() => onClosePoint(point)} />}
          />
        ))}
        {!list.length ? <Text style={[SHEET_TYPE.meta, { marginTop: 12 }]}>{filter === 'closed' ? 'Aucun point clôturé.' : 'Aucun point ouvert.'}</Text> : null}
      </View>
    </BottomSheet>
  );
}

export function VisitsListSheet({ visible, onClose, visits, sitesById, onOpenVisit }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Visites de la Mission" subtitle={`${visits.length} visite(s) · touche pour reprendre ou relire`}>
      {visits.map((visit, index) => {
        const [label, tone] = VISIT_STATUS[visit.status] || [visit.status, 'neutral'];
        return <SheetRow key={visit.id} icon={visit.status === 'completed' ? 'check' : 'play'} iconTone={visit.status === 'completed' ? 'info' : 'accent'} title={visitTitle(visit)} meta={visitMeta(visit, sitesById)} onPress={() => onOpenVisit(visit)} right={<StatusPill label={label} tone={tone} />} last={index === visits.length - 1} />;
      })}
    </BottomSheet>
  );
}

/** Galerie : blocs masqués à remettre, dispositions prêtes, mode gants, réglages. */
export function CustomizeSheet({ visible, onClose, modulesSummary, onManageModules, onSaveModel, hidden, onShowBlock, onApplyPreset, onFactory, onForgetMission, hasMissionLayout, hasTypeLayout, onForgetType, typeLabel, gloves, onToggleGloves }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ajouter et régler" subtitle="Rien n’est supprimé : un bloc masqué se remet en un geste.">
      <Text style={SHEET_TYPE.label}>Mission à la carte</Text>
      <SheetRow icon="tools" title="Briques de la Mission" meta={modulesSummary} onPress={onManageModules} />
      <SheetRow icon="copy" title="Enregistrer comme modèle" meta="Type, briques et disposition : pour créer les prochaines Missions en un geste." onPress={onSaveModel} last />

      <Text style={[SHEET_TYPE.label, { marginTop: 18 }]}>Blocs masqués</Text>
      {hidden.length ? hidden.map((key, index) => {
        const block = SHEET_BLOCK_BY_KEY[key];
        if (!block) return null;
        return <SheetRow key={key} icon={block.icon} title={block.label} meta={block.description} onPress={() => onShowBlock(key)} accessibilityLabel={`Ajouter le bloc ${block.label}`} last={index === hidden.length - 1} right={<SheetIconButton icon="plus" label={`Ajouter ${block.label}`} onPress={() => onShowBlock(key)} />} />;
      }) : <Text style={[SHEET_TYPE.meta, { marginTop: 6 }]}>Tous les blocs disponibles sont déjà sur la fiche.</Text>}

      <Text style={[SHEET_TYPE.label, { marginTop: 18 }]}>Dispositions prêtes</Text>
      {SHEET_PRESETS.map((preset, index) => (
        <SheetRow key={preset.key} icon={preset.icon} title={preset.label} meta={preset.description} onPress={() => onApplyPreset(preset.key)} accessibilityLabel={`Appliquer la disposition ${preset.label}`} last={index === SHEET_PRESETS.length - 1} />
      ))}

      <Text style={[SHEET_TYPE.label, { marginTop: 18 }]}>Ergonomie</Text>
      <SheetRow
        icon="tools"
        title="Mode gants"
        meta="Boutons de 56 dp et espacements plus larges, pour les gants ou le plein soleil."
        onPress={onToggleGloves}
        accessibilityLabel={`Mode gants ${gloves ? 'activé' : 'désactivé'}`}
        right={<StatusPill label={gloves ? 'Activé' : 'Désactivé'} tone={gloves ? 'accent' : 'neutral'} />}
        last
      />

      <Text style={[SHEET_TYPE.label, { marginTop: 18 }]}>Revenir en arrière</Text>
      <SheetRow icon="refresh" title="Réglage d’usine" meta="Reprend la disposition conseillée pour ce type de Mission." onPress={onFactory} last={!hasMissionLayout && !hasTypeLayout} />
      {hasMissionLayout ? <SheetRow icon="undo" title="Oublier la disposition de cette Mission" meta="Elle reprend celle de son type." onPress={onForgetMission} last={!hasTypeLayout} /> : null}
      {hasTypeLayout ? <SheetRow icon="undo" title={`Oublier la disposition du type${typeLabel ? ` « ${typeLabel} »` : ''}`} meta="Les Missions de ce type reprennent le réglage d’usine." onPress={onForgetType} last /> : null}
    </BottomSheet>
  );
}

/** Où enregistrer la disposition : cette Mission ou toutes celles du type. */
export function ScopeSheet({ visible, onClose, typeLabel, defaultScope, onChoose }) {
  const options = [
    { key: 'mission', icon: 'pin', title: 'Cette Mission uniquement', meta: 'Les autres Missions gardent leur disposition.' },
    { key: 'type', icon: 'list', title: `Toutes les Missions${typeLabel ? ` « ${typeLabel} »` : ' de ce type'}`, meta: 'Les nouvelles Missions de ce type démarreront ainsi.' },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Enregistrer la disposition" subtitle="Tu pourras toujours revenir en arrière.">
      {options.map((option, index) => (
        <SheetRow
          key={option.key}
          icon={option.icon}
          title={option.title}
          meta={option.meta}
          onPress={() => onChoose(option.key)}
          accessibilityLabel={option.title}
          right={defaultScope === option.key ? <StatusPill label="Conseillé" tone="accent" /> : null}
          last={index === options.length - 1}
        />
      ))}
    </BottomSheet>
  );
}

/** « Déplacer vers… » : alternative au glisser-déposer (WCAG 2.5.7). */
export function MoveSheet({ visible, onClose, blockKey, blocks, onMove }) {
  const block = SHEET_BLOCK_BY_KEY[blockKey];
  const others = blocks.filter((item) => item.key !== blockKey);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={block ? `Déplacer « ${block.label} »` : 'Déplacer'} subtitle="Choisis sa nouvelle place.">
      <SheetRow icon="chevron-up" title="Tout en haut" onPress={() => onMove('top')} />
      {others.map((item) => {
        const other = SHEET_BLOCK_BY_KEY[item.key];
        return <SheetRow key={item.key} icon={other?.icon || 'list'} title={`Après « ${other?.label || item.key} »`} onPress={() => onMove({ after: item.key })} />;
      })}
      <SheetRow icon="chevron-down" title="Tout en bas" onPress={() => onMove('bottom')} last />
    </BottomSheet>
  );
}

/** Menu des livrables secondaires. */
export function DeliverablesSheet({ visible, onClose, onExportFull, onImport, onReport, busy }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Exports et imports" subtitle="Les fichiers restent sur la tablette tant que tu ne les partages pas.">
      <SheetRow icon="document" title="Rapport Word / PDF" meta="Éditer puis générer le rapport" onPress={onReport} />
      <SheetRow icon="export" title={busy.full ? 'Export en cours…' : 'Excel complet'} meta="Toutes les feuilles, réimportable dans METRA" onPress={busy.full ? null : onExportFull} />
      <SheetRow icon="upload" title={busy.import ? 'Import en cours…' : 'Importer un Excel'} meta="Classeur METRA ou classeur externe" onPress={busy.import ? null : onImport} last />
    </BottomSheet>
  );
}

/** Briques de la Mission : prendre un outil ailleurs, retirer ceux qui ne servent pas. */
export function ModulesSheet({ visible, onClose, baseCapabilities, modules, onToggle, typeLabel }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Briques de la Mission" subtitle={`Base : ${typeLabel || 'type de Mission'}. Une brique retirée garde ses données.`}>
      {SHEET_TOOL_GROUPS.map((group) => {
        const items = SHEET_TOOLS.filter((tool) => tool.group === group.key);
        return (
          <View key={group.key} style={{ marginTop: 10 }}>
            <Text style={SHEET_TYPE.label}>{group.label}</Text>
            {items.map((tool, index) => {
              const state = missionModuleState(tool.key, baseCapabilities, modules);
              const on = isMissionModuleOn(state);
              const pill = state === 'added' ? ['Ajoutée', 'accent'] : state === 'removed' ? ['Retirée', 'warning'] : state === 'type' ? ['Du type', 'neutral'] : null;
              return (
                <SheetRow
                  key={tool.key}
                  icon={tool.icon}
                  iconTone={on ? 'accent' : 'neutral'}
                  title={tool.title}
                  meta={tool.subtitle}
                  last={index === items.length - 1}
                  right={(
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {pill ? <StatusPill label={pill[0]} tone={pill[1]} /> : null}
                      <SheetIconButton icon={on ? 'tick' : 'plus'} filled={on} tone={on ? 'accent' : 'neutral'} label={on ? `Retirer la brique ${tool.title}` : `Ajouter la brique ${tool.title}`} onPress={() => onToggle(tool.key, !on)} />
                    </View>
                  )}
                />
              );
            })}
          </View>
        );
      })}
    </BottomSheet>
  );
}

/** Enregistrer la Mission comme modèle réutilisable. */
export function SaveModelSheet({ visible, onClose, defaultLabel, summary, saving, onSave }) {
  const ergo = useSheetErgo();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => { if (visible) { setLabel(defaultLabel || ''); setDescription(''); } }, [visible, defaultLabel]);
  const canSave = label.trim().length > 0 && !saving;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Enregistrer comme modèle"
      subtitle={summary}
      footer={(
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => onSave({ label: label.trim(), description: description.trim() })} style={[s.save, { minHeight: ergo.target + 4, opacity: canSave ? 1 : 0.45 }]}>
          <CvcIcon name="tick" size={20} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={s.saveText}>{saving ? 'Enregistrement…' : 'Enregistrer le modèle'}</Text>
        </TouchableOpacity>
      )}
    >
      <Text style={SHEET_TYPE.label}>Nom du modèle</Text>
      <TextInput value={label} onChangeText={setLabel} placeholder="Ex. Prise en charge P2 chaufferie" placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: ergo.target + 4 }]} accessibilityLabel="Nom du modèle" />
      <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Description (facultatif)</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="Quand l’utiliser, ce qu’il contient" placeholderTextColor={COLORS.inkFaint} multiline style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} accessibilityLabel="Description du modèle" />
      <Text style={[SHEET_TYPE.meta, { marginTop: 12 }]}>Le modèle reprend le type, les briques et la disposition de la fiche. Les données de la Mission (points, photos, mesures) ne sont pas copiées.</Text>
    </BottomSheet>
  );
}

export function EditBlockBar({ blockKey, index, count, size, onMove, onToggleSize, onHide, onMoveTo }) {
  const block = SHEET_BLOCK_BY_KEY[blockKey];
  const label = block?.label || blockKey;
  return (
    <View style={s.editBar}>
      <View style={s.editTitle}>
        <IconOrb accent={MISSION_COLORS.accent} light={MISSION_COLORS.accentLight} size={34}>
          <CvcIcon name={block?.icon || 'list'} size={18} color={MISSION_COLORS.accentDark} strokeWidth={2} />
        </IconOrb>
        <View style={{ flex: 1 }}>
          <Text style={SHEET_TYPE.bodyStrong} numberOfLines={1}>{label}</Text>
          <Text style={SHEET_TYPE.meta} numberOfLines={1}>{size === 'detailed' ? 'Détaillé' : 'Compact'} · position {index + 1}/{count}</Text>
        </View>
      </View>
      <View style={s.editActions}>
        <SheetIconButton icon="chevron-up" label={`Monter « ${label} »`} disabled={index === 0} onPress={() => onMove(-1)} />
        <SheetIconButton icon="chevron-down" label={`Descendre « ${label} »`} disabled={index === count - 1} onPress={() => onMove(1)} />
        <SheetIconButton icon={size === 'detailed' ? 'compact' : 'expand'} label={size === 'detailed' ? `Passer « ${label} » en compact` : `Passer « ${label} » en détaillé`} onPress={onToggleSize} />
        <SheetIconButton icon="more" label={`Déplacer « ${label} » vers…`} onPress={onMoveTo} />
        {block?.hideable !== false
          ? <SheetIconButton icon="eye-off" tone="danger" label={`Masquer « ${label} »`} onPress={onHide} />
          : <SheetIconButton icon="lock" tone="neutral" label={`« ${label} » reste toujours sur la fiche`} disabled onPress={() => {}} />}
      </View>
    </View>
  );
}

export function EditTopBar({ dirty, onCancel, onDone, onAdd }) {
  const ergo = useSheetErgo();
  return (
    <View style={s.topBar} accessibilityRole="toolbar">
      <View style={s.topTitle}>
        <Text style={SHEET_TYPE.blockTitle} numberOfLines={1}>Personnaliser la fiche</Text>
        <Text style={SHEET_TYPE.meta} numberOfLines={1}>{dirty ? 'Modifications non enregistrées' : 'Monte, descends, masque, agrandis'}</Text>
      </View>
      <View style={s.topActions}>
        <SheetButton icon="plus" label="Ajouter" onPress={onAdd} style={{ flex: 1 }} />
        <SheetButton label="Annuler" tone="neutral" onPress={onCancel} style={{ flex: 1 }} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Terminer la personnalisation" onPress={onDone} style={[s.done, { minHeight: ergo.target, flex: 1 }]}>
          <Text style={s.saveText}>Terminer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export { SHEET_BLOCKS };

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', paddingHorizontal: 12, minHeight: 50 },
  searchInput: { flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink, paddingVertical: 10 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: MISSION_COLORS.accent },
  saveText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 15 },
  editBar: { gap: 10, paddingBottom: 10, marginBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine },
  editTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topBar: { gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FDFCFA', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine, elevation: 3 },
  topTitle: { paddingHorizontal: 2 },
  topActions: { flexDirection: 'row', gap: 8 },
  done: { borderRadius: 16, backgroundColor: MISSION_COLORS.accent, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});
