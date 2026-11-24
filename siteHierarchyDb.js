// Local and remote hierarchy identity checks; never match by display name.
const clean=v=>String(v??'').trim();
export async function assertVisitParent(db,siteId,installationId){
  if(!installationId)return null;
  const installation=await db.getFirstAsync('SELECT id,site_id FROM installations WHERE id=?',[String(installationId)]);
  if(!installation||clean(installation.site_id)!==clean(siteId))
    throw Object.assign(new Error('Le local de la visite ne fait pas partie de ce site. Aucun rattachement automatique effectué.'),{code:'local_ownership'});
  return installation;
}
export async function assertRemoteLocalParent(db,siteId,remoteLocalId,reference=null){
  const row=await db.getFirstAsync(
    'SELECT l.remote_local_id,l.remote_site_id,l.local_installation_id FROM api_local_links l WHERE l.remote_local_id=?',
    [String(remoteLocalId)]);
  if(!row|| (reference?.site?.id!=null&&clean(reference.site.id)!==clean(row.remote_site_id)))
    throw Object.assign(new Error('Le local Intranet ne correspond pas à la référence sélectionnée.'),{code:'remote_local_ownership'});
  const matches=await db.getAllAsync(
    'SELECT DISTINCT sl.remote_site_id FROM sites s JOIN api_client_links c ON c.local_client_id=s.client_id AND c.autorise=1 JOIN api_client_site_links cs ON cs.remote_client_id=c.remote_client_id AND cs.remote_present=1 JOIN api_site_links sl ON sl.remote_site_id=cs.remote_site_id AND sl.remote_present=1 WHERE s.id=? AND COALESCE(sl.local_site_id,cs.local_site_id)=s.id AND sl.remote_site_id=?',
    [String(siteId),String(row.remote_site_id)]);
  if(matches.length!==1)
    throw Object.assign(new Error('Ce local Intranet appartient à un autre site. Aucun rattachement ni import effectué.'),{code:'remote_local_ownership'});
  if(row.local_installation_id)await assertVisitParent(db,siteId,row.local_installation_id);
  return row;
}
export function siteCreationTemplate(source={}){
  const text=v=>clean(v)||null;
  return {lotId:source.lotId??source.lot_id??source.lot?.id??null,
    adresse:text(source.adresse),codePostal:text(source.codePostal??source.code_postal),ville:text(source.ville),
    energie:text(source.energie),typeBatiment:text(source.typeBatiment??source.type_batiment),sitePrincipal:'Non'};
}
export function localCreationTemplate(source={},trameId=null){
  const text=v=>clean(v)||null;
  return {type:text(source.type),situation:text(source.situation),trameId:trameId??source.trameId??source.trame_id??null,
    periodiciteVisite:source.periodiciteVisite??source.periodicite_visite??null};
}
export const COPY_TEMPLATE_KEY='metra.copy.creation_template.v1';
export const COPY_ORIGIN_KEY='metra.copy.origin.v1';
export function parseCopyJson(value){try{return JSON.parse(value||'null');}catch{return null;}}
