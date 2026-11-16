/** A looped sanitary-water circuit is a fixed-temperature ECS network,
 * not an outdoor-compensated heating circuit. No automatic inference of
 * return temperature from an old t_ext_c value is allowed.
 */
const normalize=value=>String(value??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function isEcsLoopNetwork(name) {
  const value=normalize(name);
  return /\becs\b/.test(value) &&
    /\b(boucle|bouclage|retour|distribution)\b/.test(value);
}
export function ecsTemperatureSummary(row={}) {
  const value=key=>{
    const v=String(row[key]??'').trim();
    return v?v+' °C':'—';
  };
  return 'Départ '+value('t_dep_c')+' · Retour bouclage '+value('t_retour_ecs_c');
}
