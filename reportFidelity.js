// Read-only report projection. Never infer a physical asset identity from a
// name/model or change SQLite to generate a document.
const norm=v=>String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr-FR');
const MATERIAL_FIELDS=['categorie','nombre','designation','numero_materiel','reseau_desservi','marque','modele','caracteristiques','annee','etat','perimetre'];
function explicitRemoteId(provenance){
  try{
    const d=JSON.parse(provenance.details_json||'null');
    if(!['listing_materiel','current_remote_local_patrimoine'].includes(d?.sourceType))return null;
    const id=String(d.remoteMaterialId??d.payload?.id??'').trim();
    return id&&id===String(provenance.reference_externe??'').trim()?id:null;
  }catch{return null;}
}
export function projectReportMaterials(rows=[],provenances=[]){
  const byEquipment=new Map(),seen=new Map(),groups=new Map(),kept=[];
  let removed=0;
  for(const p of provenances){
    const id=explicitRemoteId(p);
    if(!id||!p.entite_id)continue;
    const key=String(p.entite_id);
    if(!byEquipment.has(key))byEquipment.set(key,new Set());
    byEquipment.get(key).add(id);
  }
  for(const row of rows){
    const ids=byEquipment.get(String(row.equipement_id??''));
    const identity=ids?.size===1?'remote:'+Array.from(ids)[0]:
      row.equipement_id?'equipment:'+row.equipement_id:null;
    if(!identity){kept.push(row);continue;}
    const scope=String(row.visite_id??'')+'|'+identity;
    const signature=JSON.stringify(MATERIAL_FIELDS.map(k=>norm(row[k])));
    if(!groups.has(scope))groups.set(scope,new Set());
    groups.get(scope).add(signature);
    if(!seen.has(scope))seen.set(scope,new Set());
    if(seen.get(scope).has(signature)){removed++;continue;}
    seen.get(scope).add(signature);
    kept.push(row);
  }
  return {rows:kept,removed,conflicts:Array.from(groups.values()).filter(g=>g.size>1).length};
}
export function fullReportLabel(value,fallback=''){
  return String(value??'').replace(/\s+/g,' ').trim()||fallback;
}
const unitRules=[
  ['m³','m(?:3|³)'],['MWh','MWh'],['kWh','kWh'],['Wh','Wh'],
  ['°C','°\\s*C'],['bar','bar'],['kW','kW'],['MW','MW'],
  ['L','(?:L|litres?)'],['Pa','Pa'],['%','%'],
];
export function formatReportMeasurement(value,unit=''){
  const raw=String(value??'').trim(),u=String(unit??'').trim();
  if(!raw)return '';
  const rule=unitRules.find(([,pattern])=>new RegExp('^(?:'+pattern+')$','i').test(u));
  return raw.split(/\r\n|\n|\r/).map(line=>{
    let s=line.trim();
    if(!s)return '';
    // Never give a unit to S.O., N.V., a slash or other textual status.
    const status=/(?:^|:\s*)(?:s\s*\.?\s*o\.?|n\s*\.?\s*[rv]\.?|sans objet|non visible|non relev[ée]|n\s*\.?\s*c\.?|\/)\s*$/i;
    if(status.test(s))return s;
    for(const [canonical,pattern] of unitRules){
      const trailing=new RegExp('(?:\\s*(?:'+pattern+'))+\\s*$','i');
      const match=trailing.exec(s);
      if(match&&/\d\s*$/.test(s.slice(0,match.index))){
        // Only normalize an actual measurement suffix, not free text.
        return s.slice(0,match.index).trimEnd()+' '+canonical;
      }
      if(match&&status.test(s.slice(0,match.index).trim()))return s.slice(0,match.index).trim();
    }
    const numeric=/(?:^|:\s*)[-+]?\d[\d \u00a0\u202f]*(?:[.,]\d+)?\s*$/;
    if(u&&numeric.test(s))return s+' '+(rule?.[0]||u);
    return s;
  }).join('\n');
}
export function reportPhotoIds(html){
  return Array.from(String(html).matchAll(/data-photo-id="([^"]+)"/g),m=>m[1]);
}
const escapedId=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function assertReportPhotoIds(html,expected){
  const a=reportPhotoIds(html),b=expected.map(escapedId);
  if(new Set(b).size!==b.length||a.length!==b.length||a.some((id,i)=>id!==b[i]))
    throw Error('Rapport incomplet : incohérence entre photographies sélectionnées et rendues ('+a.length+'/'+b.length+'). Aucun PDF final enregistré.');
  return a.length;
}
export const A4_REPORT_POINTS=Object.freeze({width:595,height:842});
export function ensureReportA4(page){
  const {width,height}=page.getSize();
  if(Math.abs(width-A4_REPORT_POINTS.width)>2||Math.abs(height-A4_REPORT_POINTS.height)>2)
    throw Error('Le moteur Android a produit un format incorrect ('+Math.round(width)+' × '+Math.round(height)+' pt), attendu A4.');
}
