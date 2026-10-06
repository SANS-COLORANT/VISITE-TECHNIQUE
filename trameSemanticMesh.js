/**
 * Maillage sémantique inter-trames.
 *
 * Les trames restent des vues métier distinctes, mais une information possède
 * une identité canonique indépendante de la trame qui l'a saisie. Cette couche
 * permet de retrouver la dernière valeur connue du même concept dans une autre
 * trame sans fusionner arbitrairement les observations.
 */

const norm = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const GLOBAL_ALIASES = Object.freeze({
  'nbr de bat lgt': 'patrimoine.batiments_logements_resume',
  'nombre de logements': 'patrimoine.nombre_logements',
  'exploitant marche': 'patrimoine.exploitant',
  'exploitant': 'patrimoine.exploitant',
  'type de lt': 'patrimoine.type_local_technique',
  'situation': 'patrimoine.situation_local',
  'production primaire': 'production.primaire.type',
  'production ecs': 'production.ecs.type',
  'type de regulation': 'regulation.type',
  'courbe de chauffe': 'regulation.courbe_chauffe',
  'ph': 'mesure.eau.ph',
  'pression reseau de chauffage bar': 'mesure.chauffage.pression',
  'pression reseau d ecs bar': 'mesure.ecs.pression',
  'index compteur energie mwh': 'compteur.energie.index',
  'index compteur energie general mwh': 'compteur.energie.index',
  'index compteur alimentation ef ecs m3': 'compteur.ecs.ef.index',
  'index compteur d appoint eau chauffage m3': 'compteur.chauffage.appoint.index',
});

const SCOPED_ALIASES = Object.freeze({
  'tnc': 'regulation.temperature_non_chauffe',
  'temperature de non chauffe c': 'regulation.temperature_non_chauffe',
  't ext c': 'mesure.temperature_exterieure',
  'temperature exterieure c': 'mesure.temperature_exterieure',
  't dep c': 'mesure.chauffage.depart',
  'chauffage t depart c': 'mesure.chauffage.depart',
  'depart chauffage c': 'mesure.chauffage.depart',
  'chauffage t retour c': 'mesure.chauffage.retour',
  'retour chauffage c': 'mesure.chauffage.retour',
  'eau chaude sanitaire t depart c': 'mesure.ecs.depart',
  'depart ecs c': 'mesure.ecs.depart',
  'eau chaude sanitaire t retour c': 'mesure.ecs.retour',
  'retour ecs c': 'mesure.ecs.retour',
  'eau chaude sanitaire t stockage c': 'mesure.ecs.stockage',
});

function contextKey(panelId, section) {
  return `${norm(panelId).replace(/^p /, '')}.${norm(section)}`;
}

function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function semanticKey(label, panelId, section, duplicateCount = 1, explicit = null) {
  if (explicit) return String(explicit);
  const labelKey = norm(label);
  if (!labelKey) return null;
  if (GLOBAL_ALIASES[labelKey]) return GLOBAL_ALIASES[labelKey];
  if (SCOPED_ALIASES[labelKey]) {
    // Une mesure répétée par SST/caisson ne peut pas être rabattue sur une
    // valeur unique du local sans perdre son contexte.
    return duplicateCount > 1
      ? `${SCOPED_ALIASES[labelKey]}.${contextKey(panelId, section)}`
      : SCOPED_ALIASES[labelKey];
  }
  // Tous les champs obtiennent une identité. Les libellés répétés sont
  // contextualisés avec le panneau ET la section : les six caissons VMC, par
  // exemple, ne doivent jamais se recopier les uns sur les autres.
  if (duplicateCount > 1) return `champ.${contextKey(panelId, section)}.${labelKey}`;
  return `champ.${labelKey}`;
}

export function construireIndexSemantiqueTrame(trame) {
  const definitions = [];
  const counts = new Map();
  for (const [panelId, sections] of Object.entries(trame?.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (!field?.cle || field.hiddenInApp === true) continue;
        const labelKey = norm(field.cle);
        counts.set(labelKey, Number(counts.get(labelKey) || 0) + 1);
        definitions.push({ panelId, section, field });
      }
    }
  }

  const byStorage = new Map();
  const bySemantic = new Map();
  for (const definition of definitions) {
    const { panelId, section, field } = definition;
    const mapped = (trame?.excel?.fieldMappings || []).find((m) =>
      m.panelId === panelId && m.section === section && m.cle === field.cle
    );
    const code = mapped?.sectionCode || sectionCode(panelId, section);
    const key = semanticKey(field.cle, panelId, section, counts.get(norm(field.cle)), field.semanticKey);
    if (!key) continue;
    const row = { ...definition, sectionCode: code, semanticKey: key, type: field.type || mapped?.type || 'champ' };
    byStorage.set(`${code}||${field.cle}`, row);
    if (!bySemantic.has(key)) bySemantic.set(key, []);
    bySemantic.get(key).push(row);
  }
  return { byStorage, bySemantic };
}

export function cleSemantiqueStockee(trame, sectionCodeValue, cle) {
  return construireIndexSemantiqueTrame(trame).byStorage.get(`${sectionCodeValue}||${cle}`)?.semanticKey || null;
}
