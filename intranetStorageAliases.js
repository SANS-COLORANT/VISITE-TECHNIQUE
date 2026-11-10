/**
 * Identité de stockage durable des sections spécialisées METRA.
 * Le découpage historique des caractères accentués (Réseau -> r_seau)
 * a créé des doublons avec les clés canoniques utilisées par les écrans.
 * Pour les sections non reconnues, ne jamais renommer les clés SQLite.
 */
const SPECIAL = Object.freeze([
  ['p-regulation', 'Cascade chaudières', 'regulation.cascade'],
  ['p-regulation', 'Réseau ECS', 'regulation.reseau_ecs'],
  ['p-releves', 'Relevés des compteurs et manomètres', 'releves.compteurs'],
  ['p-releves', 'Températures et pH', 'releves.temperatures'],
]);
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function legacySectionCode(panel, section) {
  return String(panel || '').replace('p-', '') + '.' +
    String(section || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
export function canonicalSectionCode(panel, section) {
  const entry = SPECIAL.find(([id, title]) => id === panel && norm(title) === norm(section));
  return entry ? entry[2] : legacySectionCode(panel, section);
}
const LEGACY_TO_CANONICAL = new Map(SPECIAL.map(([p,s,c]) => [legacySectionCode(p,s),c]));
export function canonicalKnownCode(code) {
  return LEGACY_TO_CANONICAL.get(code) || code;
}
export function candidateSectionCodes(definition, panel, section, field) {
  const canonical = canonicalSectionCode(panel, section);
  const old = legacySectionCode(panel, section);
  const declared = (definition?.excel?.fieldMappings || [])
    .filter(m => m.panelId === panel && m.section === section &&
      m.cle === field.cle && m.type === (field.type || 'champ'))
    .map(m => m.sectionCode).filter(Boolean);
  // Pour les panneaux standards, un code explicite de trame reste prioritaire.
  return [...new Set(canonical === old ? [...declared,canonical] : [canonical,...declared,old])];
}
const meaningful = v => v != null && (typeof v === 'object'
  ? Boolean(String(v.avis ?? '').trim() || (String(v.commentaire ?? '').trim() &&
      String(v.commentaire ?? '').trim() !== '/'))
  : Boolean(String(v).trim() && String(v).trim() !== '/'));
const signature = v => v && typeof v === 'object'
  ? JSON.stringify([String(v.avis ?? '').trim(),String(v.commentaire ?? '').trim()])
  : String(v ?? '').trim();

/**
 * Les anciennes variantes contradictoires ne sont jamais détruites.
 * Envoi : priorité à la clé de l'interface et conservation exacte de toutes
 * les variantes dans les notes Intranet. Sans archivage de sauvegarde,
 * refuser l'arbitrage et garder le blocage préexistant.
 */
export function resolveAliasValue(store, candidate, issues, path) {
  const codes = [...new Set(candidate?.storageCodes || [candidate?.sectionCode])];
  const present = codes.map(code => ({code,value:store.get(code + '||' + candidate?.cle)}))
    .filter(row => row.value != null);
  const significant = present.filter(row => meaningful(row.value));
  if (new Set(significant.map(row => signature(row.value))).size > 1) {
    if (!Array.isArray(issues?.freeTextFallbacks)) {
      issues?.push(path + ' : anciennes valeurs divergentes sans sauvegarde possible.');
      return null;
    }
    const preferred = significant[0];
    const variants = significant.map(({code,value}) =>
      code + ' : ' + (typeof value === 'object'
        ? JSON.stringify({avis:value.avis ?? null,commentaire:value.commentaire ?? null})
        : String(value))).join('\n');
    issues.freeTextFallbacks.push({
      path: String(path) + ' / conflit historique (' + String(candidate.cle) +
        ', valeur transmise depuis ' + preferred.code + ')',
      value: variants,
    });
  }
  return significant[0]?.value ?? present[0]?.value ?? null;
}
