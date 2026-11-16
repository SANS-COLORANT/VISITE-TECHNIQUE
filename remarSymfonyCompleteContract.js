/**
 * Published Symfony REMAR COMPLÈTE worksheet contract (3 November 2026).
 * Only the REMAR remote serialization uses this schema. The older Excel
 * template and historical REMAR CLASSIQUE visits stay untouched.
 * Never infer remote numeric IDs from worksheet row numbers.
 */
const normal = v => String(v ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g,' ').trim();

export function isRemarCompleteTrame(remote) {
  return /(?:^|\s)remar complete(?:\s|$)/.test(normal(remote?.nom ?? remote?.trame?.nom));
}

const NEW_FIELDS = Object.freeze([
  ['p-remar-filtres','Filtre n°1','Pertes de charge (Pa)','C156'],
  ['p-remar-filtres','Filtre n°1',"Seuil d'alarme (Pa)",'C157'],
  ['p-remar-filtres','Filtre n°2','Pertes de charge (Pa)','C164'],
  ['p-remar-filtres','Filtre n°2',"Seuil d'alarme (Pa)",'C165'],
  ['p-remar-filtres','Filtre n°3','Pertes de charge (Pa)','C172'],
  ['p-remar-filtres','Filtre n°3',"Seuil d'alarme (Pa)",'C173'],
  ['p-remar-cta-mesures','Températures','Batterie chaude','C181'],
  ['p-remar-cta-mesures','Températures','Batterie froide','C182'],
  ['p-remar-cta-mesures','Températures','Batterie pré-chauffage','C183'],
  ['p-remar-cta-mesures','Températures','Commentaires','C188'],
  ['p-remar-froid','Réseaux','Réseau 4','C268'],
  ['p-remar-froid','Réseaux','Réseau 5','C269'],
]);

/** Each element preserves the same stable local storage key across versions.
 * cell refs exist for diagnostic only; never substitute for Symfony IDs. */
export function remarCompleteMappings(definition) {
  const base = definition?.excel?.fieldMappings || [];
  const removed = base.filter(m=>m.panelId==='p-remar-cta-energie');
  if(removed.length!==6 || base.length!==141) {
    throw new Error('REMAR COMPLÈTE: unexpected legacy mapping; inspect migration before selecting remote trame.');
  }
  const result = base.filter(m=>m.panelId!=='p-remar-cta-energie').map(m=>{
    if(m.panelId==='p-remar-cta-mesures'&&m.section==='Températures'&&m.cle==='Après récupération')
      return {...m,remoteCle:'Récupération',valueCell:'C185'};
    const address={
      'p-remar-filtres|Filtre n°1|Etat du filtre':'B158',
      'p-remar-filtres|Filtre n°2|Type de filtre':'C163',
      'p-remar-filtres|Filtre n°2|Etat du filtre':'B166',
      'p-remar-filtres|Filtre n°3|Type de filtre':'C171',
      'p-remar-filtres|Filtre n°3|Etat du filtre':'B174',
      'p-remar-cta-mesures|Températures|Air neuf':'C184',
      'p-remar-cta-mesures|Températures|Soufflage':'C186',
      'p-remar-cta-mesures|Températures|Extraction / Reprise':'C187',
      'p-remar-cta-mesures|Variation de vitesse|Soufflage':'C193',
      'p-remar-cta-mesures|Variation de vitesse|Extraction / Reprise':'C194',
      'p-remar-cta-mesures|Consignes|Soufflage':'C199',
      'p-remar-cta-mesures|Consignes|Extraction / Reprise':'C200',
      'p-remar-cta-mesures|Consignes|Pression':'C201',
    };
    const key=[m.panelId,m.section,m.cle].join('|');
    let valueCell=address[key];
    if(m.panelId==='p-remar-vmc'&&m.valueCell) {
      const n=Number(m.valueCell.slice(1));
      if(n>=210&&n<=249)valueCell=m.valueCell[0]+(n-2);
    }
    if(m.panelId==='p-remar-froid'&&m.valueCell){
      const n=Number(m.valueCell.slice(1));
      if(n>=256&&n<=269)valueCell=m.valueCell[0]+(n-2);
    }
    const commentCell=m.commentCell && valueCell?.startsWith('B')
      ?'C'+valueCell.slice(1):m.commentCell;
    return valueCell?{...m,valueCell,commentCell}:m;
  });
  for(const [panelId,section,cle,valueCell] of NEW_FIELDS) {
    result.push({panelId,section,sectionCode:base.find(m=>m.panelId===panelId&&m.section===section)?.sectionCode
      || panelId.replace(/^p-/,'')+'.'+normal(section).replace(/[^a-z0-9]+/g,'_'),
      cle,type:'champ',valueCell,commentCell:null,symfonyOnly:true});
  }
  if(result.length!==147 || new Set(result.map(m=>[m.panelId,m.section,m.cle].join('|'))).size!==147)
    throw new Error('REMAR COMPLÈTE: 147 unique destinations expected.');
  return result;
}
/**
 * Extensions optional to the frozen REMAR worksheets. The ONLY authority is a
 * criterion that Symfony actually published for this visit. In particular,
 * primary temperatures and general cold-water meters are NOT aliases of
 * heating temperatures, sanitary water or make-up water.
 *
 * These destinations have no Excel cell and never change the 141/147 official
 * worksheet mappings. A criterion that Symfony has not published remains
 * unsendable, rather than being silently diverted into another measurement.
 */
const OPTIONAL_REMOTE_MEASUREMENTS = Object.freeze([
  { section: 'Température chaufferie', cle: 'Primaire aller (°C)', labels: [
    'Primaire aller', 'Primaire aller (°C)',
    'Température primaire aller', 'Température primaire aller (°C)',
  ] },
  { section: 'Température chaufferie', cle: 'Primaire retour (°C)', labels: [
    'Primaire retour', 'Primaire retour (°C)',
    'Température primaire retour', 'Température primaire retour (°C)',
  ] },
  { section: 'Compteur', cle: 'Compteur eau froide générale (m³)', labels: [
    'Compteur eau froide générale', 'Compteur eau froide générale (m³)',
    "Compteur d'eau froide générale", "Compteur d'eau froide générale (m³)",
  ] },
]);

export function remarOptionalMappingsForRemote(definition, remoteTrame) {
  if ((definition?.familyId || definition?.id) !== 'remar_v1') return [];
  const base = definition?.excel?.fieldMappings || [];
  const rows = [];
  const matched = new Map();
  // The category must explicitly be about readings. A namesake in CTA,
  // cold production or an unrelated category is not a valid destination.
  for (const category of remoteTrame?.categories || []) {
    const context = normal(category?.nom);
    if (!/(compteur|temperature|releve)/.test(context) ||
        /(production froid|frigorifique|\bcta\b|\bvmc\b)/.test(context)) continue;
    for (const sub of category?.sousCategories || []) {
      for (const criterion of sub?.criteres || []) {
        const rule = OPTIONAL_REMOTE_MEASUREMENTS.find(entry =>
          normal(entry.section) === normal(sub?.nom) &&
          entry.labels.some(label => normal(label) === normal(criterion?.nom)));
        if (!rule) continue;
        if (!matched.has(rule.cle)) matched.set(rule.cle, []);
        matched.get(rule.cle).push({rule, criterion});

      }
    }
  }
  // Duplicate server destinations are not silently collapsed: no optional
  // mapping is authorized until the Symfony category is unambiguous.
  for (const choices of matched.values()) {
    if (choices.length !== 1) continue;
    const {rule,criterion} = choices[0];
    const sameSection=base.find(m=>m.panelId==='p-remar-releves' && m.section===rule.section);
    if (!sameSection) continue;
    rows.push({panelId:'p-remar-releves',section:rule.section,
      sectionCode:sameSection.sectionCode,cle:rule.cle,remoteCle:criterion.nom,
      type:'champ',symfonyOnly:true,remarOptional:true});
  }
  return rows;
}

export function remarMappingsForRemote(definition,remoteTrame) {
  const base = isRemarCompleteTrame(remoteTrame) ? remarCompleteMappings(definition)
    : (definition?.excel?.fieldMappings || []);
  return [...base, ...remarOptionalMappingsForRemote(definition, remoteTrame)];
}
