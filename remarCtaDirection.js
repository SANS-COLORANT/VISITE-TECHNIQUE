/** Visibility of CTA fields is strictly derived from the named air path.
 * No hidden field is written as N.V or S.O: an empty observation stays empty.
 * Mixed/double-flow CTA and ambiguous names retain both directions.
 */
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function isSupplyOnlyCta(name) {
  const n=norm(name);
  return /\bsoufflage\b/.test(n)&&
    !/\b(extraction|reprise|double flux|double-flux|mixte)\b/.test(n);
}
export function shouldShowCtaField(name, section, key) {
  if(!isSupplyOnlyCta(name))return true;
  const label=norm([section,key].filter(Boolean).join(' '));
  return !/\b(extraction|reprise)\b/.test(label);
}
