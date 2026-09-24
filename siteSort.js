const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export const SITE_SORT_OPTIONS = Object.freeze([
  { id: 'alpha', label: 'A → Z' },
  { id: 'alpha_desc', label: 'Z → A' },
  { id: 'number', label: 'N° / chiffre' },
  { id: 'group', label: 'Lot / groupe' },
  { id: 'address', label: 'Adresse' },
]);

function text(value) {
  return String(value || '').trim();
}

function firstNumber(value) {
  const match = text(value).replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function buildSiteGroupMap(memberships = []) {
  const map = new Map();
  for (const row of memberships || []) {
    const siteId = String(row?.site_id || '');
    const group = text(row?.groupe_nom);
    if (!siteId || !group) continue;
    const list = map.get(siteId) || [];
    if (!list.includes(group)) list.push(group);
    map.set(siteId, list);
  }
  for (const [siteId, groups] of map.entries()) {
    map.set(siteId, [...groups].sort((a, b) => collator.compare(a, b)));
  }
  return map;
}

export function siteGroupLabel(siteId, groupMap) {
  return (groupMap?.get(String(siteId || '')) || []).join(' · ');
}

export function sortSites(sites = [], mode = 'alpha', groupMap = new Map()) {
  const rows = [...(sites || [])];
  rows.sort((a, b) => {
    const an = text(a?.nom_site);
    const bn = text(b?.nom_site);

    if (mode === 'alpha_desc') return collator.compare(bn, an);

    if (mode === 'number') {
      const av = firstNumber(an);
      const bv = firstNumber(bn);
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      if (av != null && bv != null && av !== bv) return av - bv;
      return collator.compare(an, bn);
    }

    if (mode === 'group') {
      const ag = siteGroupLabel(a?.id, groupMap);
      const bg = siteGroupLabel(b?.id, groupMap);
      if (!ag && bg) return 1;
      if (ag && !bg) return -1;
      const byGroup = collator.compare(ag, bg);
      return byGroup || collator.compare(an, bn);
    }

    if (mode === 'address') {
      const aa = text(a?.adresse);
      const ba = text(b?.adresse);
      if (!aa && ba) return 1;
      if (aa && !ba) return -1;
      const byAddress = collator.compare(aa, ba);
      return byAddress || collator.compare(an, bn);
    }

    return collator.compare(an, bn);
  });
  return rows;
}
