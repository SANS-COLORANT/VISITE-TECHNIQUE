/** Touch-first REMAR navigation, scoped to REMAR visits only. */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { BottomSheet, KIT } from './VisitKit.js';
import { buildRemarJourneyGroups, firstIncompleteRemarTab } from './remarJourneyPlan.js';

export function RemarJourneySheet({ tabOrder, labels, tabStates, activeTab, onClose, onSelect }) {
  const groups = useMemo(() => buildRemarJourneyGroups(tabOrder, labels, tabStates), [tabOrder, labels, tabStates]);
  const activeGroup = groups.find((group) => group.tabs.some((tab) => tab.id === activeTab));
  const [expanded, setExpanded] = useState(activeGroup?.id || groups[0]?.id || null);
  const next = firstIncompleteRemarTab(groups);
  const nextTab = next ? groups.flatMap((group) => group.tabs).find((tab) => tab.id === next) : null;
  const jump = (id) => {
    onClose?.();
    if (id && id !== activeTab) onSelect?.(id);
  };
  return (
    <BottomSheet visible onClose={onClose} title="Parcours REMAR"
      subtitle="Accès rapide par métier · les constats et l’Excel restent inchangés"
      maxHeight="88%">
      <View style={s.body}>
        {nextTab ? (
          <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={`Reprendre la visite à ${nextTab.label}`}
            onPress={() => jump(nextTab.id)} style={s.next}>
            <CvcIcon name="check" color={COLORS.orangeDark} size={19} />
            <View style={s.textGrow}>
              <Text style={s.nextTitle}>Reprendre les points à faire</Text>
              <Text numberOfLines={1} style={s.nextSubtitle}>{nextTab.label} · {nextTab.done}/{nextTab.total}</Text>
            </View>
            <CvcIcon name="chevron-right" color={COLORS.orangeDark} size={20} />
          </TouchableOpacity>
        ) : null}
        {groups.map((group) => {
          const open = group.id === expanded;
          const here = group.tabs.some((tab) => tab.id === activeTab);
          return <View key={group.id} style={s.group}>
            <TouchableOpacity accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${group.label}, ${group.done} sur ${group.total}, ${group.ns} anomalies`}
              onPress={() => setExpanded(open ? null : group.id)}
              style={[s.groupHeader, here && s.groupHeaderActive]}>
              <View style={s.textGrow}>
                <Text style={[s.groupTitle, here && s.activeText]}>{group.label}</Text>
                <Text style={s.groupSubtitle}>
                  {group.tabs.length} onglet{group.tabs.length > 1 ? 's' : ''} · {group.total ? `${group.done}/${group.total} renseignés` : 'À renseigner'}{group.ns ? ` · ${group.ns} N.S` : ''}
                </Text>
              </View>
              <CvcIcon name={open ? 'chevron-up' : 'chevron-down'} size={19} color={here ? COLORS.orangeDark : COLORS.inkSoft} />
            </TouchableOpacity>
            {open ? group.tabs.map((tab) => (
              <TouchableOpacity key={tab.id} accessibilityRole="button"
                accessibilityState={{ selected: activeTab === tab.id }}
                accessibilityLabel={`Ouvrir ${tab.label}, ${tab.done} sur ${tab.total}`}
                onPress={() => jump(tab.id)}
                style={[s.tab, activeTab === tab.id && s.selectedTab]}>
                <View style={s.textGrow}>
                  <Text numberOfLines={2} style={[s.tabText, activeTab === tab.id && s.activeText]}>{tab.label}</Text>
                  <Text style={s.tabCount}>{tab.total ? `${tab.done}/${tab.total}` : '—'}{tab.ns ? ` · ${tab.ns} N.S` : ''}</Text>
                </View>
                {tab.complete ? <CvcIcon name="check" size={17} color={KIT.green} />
                  : activeTab === tab.id ? <CvcIcon name="check" size={17} color={COLORS.orangeDark} />
                  : <CvcIcon name="chevron-right" size={17} color={COLORS.inkFaint} />}
              </TouchableOpacity>
            )) : null}
          </View>;
        })}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 8, paddingBottom: 8 },
  textGrow: { flex: 1, minWidth: 0 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, borderRadius: 14, padding: 12, marginBottom: 4, backgroundColor: COLORS.orangeLight, borderWidth: 1, borderColor: COLORS.orange + '44' },
  nextTitle: { fontSize: 13, color: COLORS.orangeDark, fontFamily: FONTS.bold },
  nextSubtitle: { fontSize: 11, color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium, marginTop: 3 },
  group: { borderWidth: 1, borderColor: KIT.border, borderRadius: 15, backgroundColor: KIT.card, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 13, paddingVertical: 9 },
  groupHeaderActive: { backgroundColor: COLORS.orangeLight },
  groupTitle: { fontSize: 13.5, color: COLORS.ink, fontFamily: FONTS.bold },
  groupSubtitle: { fontSize: 10.5, color: COLORS.inkSoft, fontFamily: FONTS.bodyMedium, marginTop: 3 },
  activeText: { color: COLORS.orangeDark },
  tab: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingLeft: 23, paddingRight: 13, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  selectedTab: { backgroundColor: '#FFF6ED' },
  tabText: { fontSize: 12.5, color: COLORS.ink, fontFamily: FONTS.bodySemi },
  tabCount: { fontSize: 10.5, color: COLORS.inkFaint, fontFamily: FONTS.bodyMedium, marginTop: 3 },
});
