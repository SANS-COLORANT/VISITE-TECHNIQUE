/** Compare one frozen V1 Intranet preparation with a later GET; pure, read-only.
 * This is NOT yet wired before POST: filtered GET semantics need real confirmation.
 */
const FIELDS=['id','categorie','nombre','designation','numeroMateriel','reseauDesservi',
  'marque','modele','caracteristiques','annee','etat'];
const ALT={numeroMateriel:'numero_materiel',reseauDesservi:'reseau_desservi'};
function txt(v){return String(v??'').trim().normalize('NFC');}
function value(row,key){return row?.[key]??row?.[ALT[key]]??null;}
function sameId(a,b){return txt(a)===txt(b);}
function multi(rows){
  if(!Array.isArray(rows))return null;
  const map=new Map();
  for(const item of rows){
    const key=JSON.stringify(FIELDS.map(k=>txt(value(item,k))));
    map.set(key,(map.get(key)||0)+1);
  }
  return map;
}
function sameMulti(a,b){
  if(!a||!b||a.size!==b.size)return false;
  for(const [k,v] of a)if(b.get(k)!==v)return false;
  return true;
}
function graph(trame){
  if(!Array.isArray(trame?.categories))return null;
  const paths=[];
  for(const c of trame.categories){
    if(!c?.id||!Array.isArray(c.sousCategories))return null;
    for(const s of c.sousCategories){
      if(!s?.id||!Array.isArray(s.criteres))return null;
      for(const k of s.criteres){
        if(!k?.id)return null;
        paths.push(JSON.stringify([txt(c.id),txt(c.nom),txt(s.id),txt(s.nom),
          txt(k.id),txt(k.nom),k.avisApplicable===true]));
      }
    }
  }
  return paths.length&&new Set(paths).size===paths.length?paths.sort():null;
}
export function inspectV1PreparationFreshness(frozen, currentPayload, wire){
  const issues=[];
  if(!frozen?.local?.id||!frozen?.site?.id||!frozen?.trame?.id)
    issues.push('Référence figée local/site/trame incomplète.');
  if(!wire?.localId||!wire?.trameId||!sameId(frozen?.local?.id,wire?.localId)||
    !sameId(frozen?.trame?.id,wire?.trameId))
    issues.push('Le JSON ne cible pas le même local/trame que sa référence figée.');
  const visits=Array.isArray(currentPayload?.visites)?currentPayload.visites:null;
  if(!visits)issues.push('Réponse GET Intranet sans visites[].');
  const matching=(visits||[]).filter(row=>sameId(row?.local?.id,wire?.localId)&&sameId(row?.trame?.id,wire?.trameId));
  if(matching.length!==1)issues.push('Local/trame absent ou ambigu dans le GET, pas de rapprochement par nom.');
  const live=matching.length===1?matching[0]:null;
  if(live){
    if(!sameId(live?.site?.id,frozen?.site?.id))issues.push('Le local appartient à un autre site.');
    if(!sameId(live?.derniereVisite?.id,frozen?.derniereVisite?.id)||
      !sameId(live?.derniereVisite?.id,wire?.derniereVisiteIdSource))
      issues.push('Une autre visite a modifié le local depuis la préparation.');
    const before=graph(frozen.trame),after=graph(live.trame);
    if(!before||!after||JSON.stringify(before)!==JSON.stringify(after))
      issues.push('Identifiants ou libellés de critères modifiés : remapping nécessaire.');
    if(!sameMulti(multi(frozen.materiels),multi(live.materiels)))
      issues.push('Listing matériel modifié, y compris ID ou attribut à quantité constante.');
  }
  return {compatible:issues.length===0,issues,current:live};
}
