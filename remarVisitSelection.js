/** Published full Symfony REMAR is preferred over REMAR CLASSIQUE.
 * Never assume that the same business family means identical criteria.
 * Ambiguous or unpublished complete templates require manual selection.
 */
export function preferredRemarCompleteId(remotes=[]) {
  const list=(Array.isArray(remotes)?remotes:[]).filter(t=>
    /^[1-9]\d*$/.test(String(t?.id||'')) && /\bremar\b/.test(
      String(t?.nom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
  const complete=list.filter(t=>/\bcomplet(?:e)?\b/.test(
    String(t?.nom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())
    && !/\bclassique\b/.test(String(t?.nom||'').toLowerCase()));
  return complete.length===1?String(complete[0].id):null;
}
