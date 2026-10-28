/** REMAR field-visit groups. Pure UI metadata: no data or Excel mappings. */
export const REMAR_JOURNEY_GROUPS = Object.freeze([
  { id: 'chaufferie', label: 'Chaufferie et distribution', ids: [
    'p-infos', 'p-remar-reseaux', 'p-conf-local', 'p-conf-chauffage',
    'p-conf-ecs', 'p-distrib', 'p-remar-releves', 'p-remar-energie',
  ] },
  { id: 'cta', label: 'Traitement d’air · CTA', ids: [
    'p-remar-cta', 'p-remar-filtres', 'p-remar-cta-mesures', 'p-remar-cta-energie',
  ] },
  { id: 'vmc', label: 'Ventilation · VMC', ids: ['p-remar-vmc'] },
  { id: 'froid', label: 'Production de froid', ids: ['p-remar-froid'] },
  { id: 'fin', label: 'Équipements et rapport', ids: ['p-equip', 'p-remarques', 'p-photos'] },
]);

export function buildRemarJourneyGroups(tabOrder = [], labels = {}, tabStates = {}) {
  const available = [...new Set((tabOrder || []).filter((id) => id && id !== 'SEP'))];
  const wanted = new Set(available);
  const assigned = new Set();
  const toTab = (id) => {
    const state = tabStates?.[id] || {};
    const total = Math.max(0, Number(state.total) || 0);
    const done = Math.min(total, Math.max(0, Number(state.done) || 0));
    const ns = Math.max(0, Number(state.ns) || 0);
    return { id, label: labels?.[id] || id, total, done, ns, complete: total > 0 && done === total };
  };
  const toGroup = (id, label, ids) => {
    const tabs = ids.map(toTab);
    return {
      id, label, tabs,
      total: tabs.reduce((n, t) => n + t.total, 0),
      done: tabs.reduce((n, t) => n + t.done, 0),
      ns: tabs.reduce((n, t) => n + t.ns, 0),
    };
  };
  const groups = [];
  for (const group of REMAR_JOURNEY_GROUPS) {
    const ids = group.ids.filter((id) => wanted.has(id) && !assigned.has(id));
    ids.forEach((id) => assigned.add(id));
    if (ids.length) groups.push(toGroup(group.id, group.label, ids));
  }
  // Versions personnalisées REMAR : tout nouvel onglet reste accessible.
  const extra = available.filter((id) => !assigned.has(id));
  if (extra.length) groups.push(toGroup('personnalise', 'Autres onglets', extra));
  return groups;
}

export function firstIncompleteRemarTab(groups = []) {
  return groups.flatMap((group) => group.tabs || [])
    .find((tab) => tab.total > 0 && tab.done < tab.total)?.id || null;
}
