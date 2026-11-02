/**
 * Deux caissons VMC ou CTA peuvent avoir le meme type, mais jamais le meme
 * identifiant ni le meme nom de patrimoine. Ne renomme aucun existant.
 * Le numero est commun a TOUTES les variantes d'une famille et ne repart pas
 * de 1 lorsque l'on change de type (soufflage/extraction).
 */
const clean = value => String(value??'').trim().replace(/\s+/g,' ');
const norm = value => clean(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
const PREFIX = Object.freeze({cta:'CTA',vmc:'Caisson VMC',froid:'Installation froid'});
const NUMBERS = Object.freeze({
  cta:/^CTA\s+(\d+)\b/i,
  vmc:/^Caisson(?:\s+VMC)?\s+(\d+)\b/i,
  froid:/^(?:Installation|Groupe)\s+(?:de\s+)?froid\s+(\d+)\b/i,
});
export function proposerNomUniqueRemar(family,choice,existingNames=[],presets=[]) {
  const desired=clean(choice);
  if(!desired||!PREFIX[family])return desired;
  // Un nom libre conserve son sens et son controle d'unicite en base.
  if(!presets.includes(choice))return desired;
  const existing=existingNames.map(clean).filter(Boolean);
  const used=new Set(existing.map(norm));
  let next=Math.max(1,existing.length+1);
  for(const name of existing){
    const match=name.match(NUMBERS[family]);
    if(match)next=Math.max(next,Number(match[1])+1);
  }
  const suffix=family==='cta'?desired.replace(/^CTA\s+/i,'')
    :family==='vmc'?desired.replace(/^Caisson(?:\s+VMC)?\s*/i,'')
    :desired.replace(/^(?:Installation|Groupe)\s+(?:de\s+)?froid\s*/i,'');
  let proposed='';
  do{
    proposed=`${PREFIX[family]} ${next++}${suffix?' — '+suffix:''}`;
  }while(used.has(norm(proposed)));
  return proposed;
}

/**
 * Affichage seulement. Répare visuellement les anciens « CTA 1 — CTA ... »
 * sans renommer les équipements ni déplacer leurs observations ou photos.
 * Le numéro affiché est calculé sur l'ordre stable de la liste du local.
 */
export function afficherNomEquipementRemar(family,nom,index) {
  const original=clean(nom);
  const nombre=Math.max(1,(Number(index)||0)+1);
  const prefix=family==='cta'?'CTA':family==='vmc'?'Caisson VMC':'Installation froid';
  let suffix=original;
  if(family==='cta')suffix=suffix.replace(/^CTA(?:\s+\d+)?\s*(?:[—–-]\s*)?(?:CTA\s+)?/i,'');
  if(family==='vmc')suffix=suffix.replace(/^Caisson(?:\s+VMC)?(?:\s+\d+)?\s*(?:[—–-]\s*)?(?:Caisson(?:\s+VMC)?\s+)?/i,'');
  if(family==='froid')suffix=suffix.replace(/^(?:Installation|Groupe)\s+(?:de\s+)?froid(?:\s+\d+)?\s*(?:[—–-]\s*)?/i,'');
  const titre=`${prefix} ${nombre}`;
  return suffix? `${titre} · ${suffix}` : titre;
}
