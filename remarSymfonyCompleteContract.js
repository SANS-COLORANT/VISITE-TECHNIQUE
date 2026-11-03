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
export function remarMappingsForRemote(definition,remoteTrame) {
  return isRemarCompleteTrame(remoteTrame) ? remarCompleteMappings(definition)
    : (definition?.excel?.fieldMappings || []);
}
