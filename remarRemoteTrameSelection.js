/**
 * Vérifie avant le premier POST qu'une trame Symfony REMAR offre bien
 * les destinations de chaque point officiel METRA, sans inventer de
 * critère, sans confondre les homonymes et sans modifier le serveur.
 * Purement local : les réponses authentifiées GET sont passées en argument.
 */
import { obtenirTrame } from './trameRegistry.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';
import { inspectIntranetCriterionCandidate } from './intranetVisitPayload.js';
import { remarMappingsForRemote } from './remarSymfonyCompleteContract.js';

const mappingsForRemarRemote = (definition, remote) =>
  typeof remarMappingsForRemote === 'function'
    ? remarMappingsForRemote(definition,remote)
    : (definition?.excel?.fieldMappings||[]);
const text = value => String(value ?? '').trim();
const identity = field => [field.panelId,field.section,field.cle,field.type].join('||');
const numericId = value => {
  const raw=text(value);
  return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw)>0;
};

function metadataCovered(definition, mapping) {
  if (mapping.panelId !== 'p-infos' || mapping.type !== 'champ') return false;
  const matching=(definition.ui?.panels?.[mapping.panelId]?.[mapping.section]||[])
    .find(field=>field.cle===mapping.cle&&field.type===mapping.type);
  return ['client','site','local','type','dateVisite'].includes(matching?.meta);
}

function compatibleAvis(criterion, mapping) {
  if (mapping.type==='controle') return criterion.avisApplicable===true;
  if (criterion.avisApplicable!==true) return true;
  // Symfony CLASSIQUE attend un avis sur certains champs de mesure.
  // Le sérialiseur transporte la vraie valeur et un avis N.V par défaut.
  return mapping.panelId==='p-remar-releves' && mapping.type==='champ';
}

export function assessRemarRemoteTrame(remoteTrame, localTrameId='remar_v1') {
  const definition=obtenirTrame(localTrameId);
  const all=mappingsForRemarRemote(definition,remoteTrame).filter(m=>!metadataCovered(definition,m));
  const byIdentity=new Map(all.map(m=>[identity(m),m]));
  const mapped=new Map(), extra=[], collisions=[], invalid=[];
  const isRemar=(definition.familyId || definition.id)==='remar_v1';
  if(!isRemar || mapRemoteTrameToLocal(remoteTrame)!=='remar_v1'){
    return {complete:false,mappedCount:0,totalCount:all.length,
      missing:all.map(identity),extra:[],collisions:[],
      invalid:['Trame distante hors famille REMAR.']};
  }
  if(!numericId(remoteTrame?.id) || !Array.isArray(remoteTrame?.categories))
    invalid.push('Trame distante sans identifiant ou catégories valides.');
  const seenRemote=new Set();
  for(const cat of remoteTrame?.categories||[]) {
    for(const sub of cat?.sousCategories||[]) {
      for(const criterion of sub?.criteres||[]){
        const path=[cat.id,sub.id,criterion.id].map(text).join(':');
        if(!numericId(cat.id)||!numericId(sub.id)||!numericId(criterion.id)||
           seenRemote.has(path)){invalid.push('Triplet de critère distant absent ou répété : '+path);continue;}
        seenRemote.add(path);
        const resolved=inspectIntranetCriterionCandidate(localTrameId,
          criterion,cat.nom,sub.nom,remoteTrame).resolved;
        if(!resolved){
          extra.push([path,cat.nom,sub.nom,criterion.nom].map(text).join(' / '));
          continue;
        }
        const localKey=identity(resolved);
        const expected=byIdentity.get(localKey);
        if(!expected){
          if(!metadataCovered(definition,resolved))
            extra.push(path+' : '+text(criterion.nom)+' (champ non officiel METRA)');
          continue;
        }
        if(!compatibleAvis(criterion,expected)){
          invalid.push('Type/avis incompatible : '+localKey+' → '+path);
          continue;
        }
        if(mapped.has(localKey)){
          collisions.push(localKey+' → '+mapped.get(localKey)+' / '+path);
          continue;
        }
        mapped.set(localKey,path);
      }
    }
  }
  const missing=all.filter(m=>!mapped.has(identity(m))).map(identity);
  return {complete:missing.length===0&&extra.length===0&&collisions.length===0&&invalid.length===0,
    mappedCount:mapped.size,totalCount:all.length,missing,extra,collisions,invalid};
}

export function chooseUniqueRemarRemoteTrame(candidates, localTrameId='remar_v1'){
  const evaluated=(Array.isArray(candidates)?candidates:[]).map(candidate=>({
    ...candidate,coverage:assessRemarRemoteTrame(candidate.reference?.trame,localTrameId),
  }));
  const complete=evaluated.filter(c=>c.coverage.complete);
  return {selected:complete.length===1?complete[0]:null,ambiguous:complete.length>1,
    evaluated:evaluated.map(x=>({id:text(x.reference?.trame?.id),name:text(x.reference?.trame?.nom),
      mappedCount:x.coverage.mappedCount,totalCount:x.coverage.totalCount,
      complete:x.coverage.complete,missing:x.coverage.missing,invalid:x.coverage.invalid,
      extra:x.coverage.extra,collisions:x.coverage.collisions})),
  };
}
