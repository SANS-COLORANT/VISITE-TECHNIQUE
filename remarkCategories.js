/**
 * Four user-approved categories, 16 November 2026. The stored "poste" of an
 * older P3 remark must NOT be silently converted into a different contract.
 * Existing data remains unchanged until a technician explicitly classifies it.
 */
export const REMARK_CATEGORIES=Object.freeze([
  'Remarques générales',
  'Entretien P2',
  'Travaux de conformité',
  'Travaux d’amélioration',
]);

const normalized=value=>String(value??'').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function remarkCategory(value) {
  const text=normalized(value);
  if(!text||/^(observation|remarque(s)? generale(s)?|vmc|divers?)$/.test(text))
    return REMARK_CATEGORIES[0];
  if(/^(entretien|travaux)\s*p2$/.test(text)||text==='p2')
    return REMARK_CATEGORIES[1];
  if(text.includes('conformite')||text.includes('securite'))
    return REMARK_CATEGORIES[2];
  if(text.includes('amelioration'))
    return REMARK_CATEGORIES[3];
  // No guess that replacing an equipment (historical P3) is automatically
  // a compliance or improvement project. Keep the raw P3 label in SQLite.
  return REMARK_CATEGORIES[0];
}
export function remarkCategoryOrder(value) {
  return REMARK_CATEGORIES.indexOf(remarkCategory(value));
}
export function remarkLegacyP3(value) {
  return /\bp3\b/i.test(normalized(value));
}
export function normalizedRemarkPoste(value) {
  const source=String(value??'').trim();
  const category=remarkCategory(source);
  if(remarkLegacyP3(source))return source;
  return category;
}

/** An equipment name is a stable label, not a raw field inserted in notes. */
export function remarkEquipmentName(remark={}) {
  const sources=[remark.reference_libelle,remark.origine,remark.poste].filter(Boolean);
  for(const source of sources){
    const value=String(source).trim();
    // The control title can include "CTA 1 — soufflage · GTB".
    const hit=value.match(/(?:^|\b)(CTA(?:\s*\d+)?[^·:,;]*|(?:caisson\s*(?:VMC)?(?:\s*n[°o]?\s*\d+)?)|VMC(?:\s*\d+)?[^·:,;]*)/i);
    if(hit)return hit[1].trim().replace(/[\s—–-]+$/,'');
  }
  return '';
}
export function remarkTextWithEquipment(remark={}) {
  const text=String(remark.prestation??'').trim();
  const equip=remarkEquipmentName(remark);
  if(!equip)return text;
  const normal=normalized(text),name=normalized(equip);
  if(normal.startsWith(name+' :')||normal.startsWith(name+' -')||normal.startsWith(name+' —'))
    return text;
  return text?equip+' : '+text:equip;
}
