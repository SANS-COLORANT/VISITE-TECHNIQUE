/**
 * Full latest-visit clone when duplicating a local/site in METRA.
 * The new site, installation, equipment, visit and snapshot rows receive NEW
 * local identities. Never copy remote Symfony links, queued POSTs, provenance
 * of an imported local or physical photo files. Photos are dated evidence and
 * cannot safely be duplicated by reusing their URI (deletion would affect
 * source files).
 *
 * Runs INSIDE siteOrganizationDb's BEGIN IMMEDIATE transaction.
 */
const value = text => String(text ?? '').trim();
function todayIso() {
  const d=new Date();
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
const remembered = (map,id) => id == null ? null : map.get(String(id)) || null;
function replaceLocalIds(code, map) {
  if (!code) return code;
  let text=String(code);
  for (const [from,to] of map) text=text.split(String(from)).join(String(to));
  return text;
}
async function rows(db,table,field,id) {
  return db.getAllAsync('SELECT * FROM '+table+' WHERE '+field+'=?',[id]);
}
async function mapVisitRows(db,table,sourceId,newId,copy,transform=()=>({})) {
  for (const r of await rows(db,table,'visite_id',sourceId))
    await copy(db,table,r,{...transform(r),visite_id:newId});
}
async function cloneVisit(db, source, targetSiteId, maps, copy, attrs, makeId, date) {
  const sourceInstallation=value(source.installation_id)||null;
  const newInstallation=sourceInstallation?remembered(maps.installations,sourceInstallation):null;
  if(sourceInstallation && !newInstallation)
    throw new Error('Duplication arrêtée : installation source sans nouvel identifiant');
  const newVisit=makeId();
  await copy(db,'visites',source,{
    id:newVisit,site_id:targetSiteId,installation_id:newInstallation,
    statut:'en_cours',date_visite:date,progression_pct:source.progression_pct,
    api_is_historical:0,
  },['cree_le','modifie_le']);
  await attrs(db,'visite',source.id,newVisit);

  // PA local/rubrique IDs are embedded in visit field section codes.
  const paLocalMap=new Map(),paSectionMap=new Map(),paRubricMap=new Map();
  const paLocals=await rows(db,'pre_allumage_locaux','visite_id',source.id);
  for(const old of paLocals){
    const id=makeId();paLocalMap.set(String(old.id),id);
    await copy(db,'pre_allumage_locaux',old,{id,visite_id:newVisit},['cree_le','modifie_le']);
  }
  for(const old of await rows(db,'pre_allumage_rubriques','visite_id',source.id)){
    const id=makeId(),newLocal=old.local_id?remembered(paLocalMap,old.local_id):null;
    if(old.local_id&&!newLocal)throw new Error('Rubrique PA sans local lors de la duplication');
    const newCode=replaceLocalIds(old.section_code,paLocalMap);
    paSectionMap.set(String(old.section_code),String(newCode));
    paRubricMap.set(String(old.id),id);
    await copy(db,'pre_allumage_rubriques',old,{
      id,visite_id:newVisit,local_id:newLocal,section_code:newCode,
    },['cree_le','modifie_le']);
  }
  for(const [oldId,newId] of paRubricMap)
    for(const f of await rows(db,'pre_allumage_champs','rubrique_id',oldId))
      await copy(db,'pre_allumage_champs',f,{id:makeId(),rubrique_id:newId},['cree_le','modifie_le']);

  await mapVisitRows(db,'champs_visite',source.id,newVisit,copy,r=>{
    const key=String(r.cle||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const nouvelleValeur=['nom du site','site'].includes(key) && /infos|general/i.test(r.section_code||'')
      ? maps.targetName:r.valeur;
    return {section_code:paSectionMap.get(String(r.section_code))||r.section_code,valeur:nouvelleValeur};
  });
  await mapVisitRows(db,'controles_visite',source.id,newVisit,copy,r=>({
    section_code:paSectionMap.get(String(r.section_code))||r.section_code,
  }));
  await mapVisitRows(db,'notes',source.id,newVisit,copy);

  const identity=new Map(),networkVisits=new Map(),counterVisits=new Map(),materialVisits=new Map();
  for(const r of await rows(db,'reseaux','visite_id',source.id)){
    const id=makeId();
    networkVisits.set(String(r.id),id);
    await copy(db,'reseaux',r,{id,visite_id:newVisit,
      reseau_site_id:r.reseau_site_id?remembered(maps.networks,r.reseau_site_id):null});
    await attrs(db,'reseau',r.id,id);
  }
  for(const r of await rows(db,'compteurs','visite_id',source.id)){
    const id=makeId();
    counterVisits.set(String(r.id),id);
    await copy(db,'compteurs',r,{id,visite_id:newVisit,
      compteur_site_id:r.compteur_site_id?remembered(maps.counters,r.compteur_site_id):null});
    await attrs(db,'compteur',r.id,id);
  }
  for(const r of await rows(db,'materiel','visite_id',source.id)){
    const id=makeId();
    materialVisits.set(String(r.id),id);
    const link=r.equipement_id?remembered(maps.equipment,r.equipement_id):null;
    if(r.equipement_id&&!link)throw new Error('Matériel de visite sans équipement dans le nouveau site');
    await copy(db,'materiel',r,{id,visite_id:newVisit,equipement_id:link});
    await attrs(db,'materiel',r.id,id);
  }
  // Observations of the day are copied with the correct equipment and visit.
  // No observation is linked to a source-site equipment.
  for(const r of await rows(db,'observations_equipement','visite_id',source.id)){
    const equip=remembered(maps.equipment,r.equipement_id);
    if(!equip)throw new Error('Observation sans équipement cloné');
    await copy(db,'observations_equipement',r,{
      id:makeId(),visite_id:newVisit,equipement_id:equip,
    },['observe_le']);
  }
  // A remark can refer to permanent equipment, a visit material, a network or
  // a meter. Do not allow a cross-site reference_id to survive a copy.
  const remarkIdMap=new Map();
  for(const r of await rows(db,'remarques','visite_id',source.id)){
    const id=makeId();
    remarkIdMap.set(String(r.id),id);
    const oldRef=value(r.reference_id);
    const target=remembered(maps.equipment,oldRef)||
      remembered(materialVisits,oldRef)||
      remembered(maps.networks,oldRef)||
      remembered(networkVisits,oldRef)||
      remembered(maps.counters,oldRef)||
      remembered(counterVisits,oldRef);
    const ref=oldRef && target ? target : oldRef;
    // Global reference text and official control keys do not encode mutable
    // entity IDs, but old physical references MUST resolve to the new local.
    if(oldRef && !target && ['equipement','materiel','reseau','compteur'].includes(r.reference_type))
      throw new Error('Remarque liée à un objet introuvable dans le site dupliqué');
    await copy(db,'remarques',r,{
      id,visite_id:newVisit,reference_id:ref,
      intranet_date_reserve:null,intranet_delai:null,
      intranet_etat_avancement:null,
    },['cree_le']);
    await attrs(db,'remarque',r.id,id);
  }

  // REMAR dynamic items hold the visit-to-equipment associations. All owned
  // values, opinions (S/N.S/S.O/N.V) and comments retain their meaning.
  const itemMap=new Map();
  for(const r of await db.getAllAsync(
    'SELECT i.* FROM remar_items i JOIN remar_item_visits piv ON piv.item_id=i.id WHERE piv.visite_id=?',[source.id])){
    const id=makeId(); itemMap.set(String(r.id),id);
    const parentEquip=r.parent_equipement_id?remembered(maps.equipment,r.parent_equipement_id):null;
    const parentNet=r.parent_reseau_id?remembered(maps.networks,r.parent_reseau_id):null;
    if((r.parent_equipement_id&&!parentEquip)||(r.parent_reseau_id&&!parentNet))
      throw new Error('Enfant REMAR sans parent cloné');
    await copy(db,'remar_items',r,{id,installation_id:newInstallation,
      parent_equipement_id:parentEquip,parent_reseau_id:parentNet},
      ['cree_le','modifie_le']);
    await attrs(db,'remar_item',r.id,id);
    await copy(db,'remar_item_visits',{visite_id:source.id,item_id:r.id},{
      visite_id:newVisit,item_id:id});
  }
  for(const r of await rows(db,'remar_values','visite_id',source.id)){
    const owner=r.owner_type==='equipement'?remembered(maps.equipment,r.owner_id):
      remembered(itemMap,r.owner_id);
    if(!owner)throw new Error('Valeur REMAR sans propriétaire cloné');
    await copy(db,'remar_values',r,{
      visite_id:newVisit,owner_id:owner,
      source_visite_id:'copie_locale:'+String(source.id),
    },['modifie_le']);
  }
  for(const r of await rows(db,'remar_report_focus','visite_id',source.id)){
    const equip=remembered(maps.equipment,r.equipement_id);
    if(!equip)throw new Error('CTA/VMC de référence sans nouvel équipement');
    await copy(db,'remar_report_focus',r,{visite_id:newVisit,equipement_id:equip});
  }
  // Raw photos and remote upload/visit outboxes are deliberately excluded.
  // A user may add NEW photo evidence in the new visit.
  return {sourceVisitId:source.id,visitId:newVisit,installationId:newInstallation};
}
export async function copyLatestVisitsForClonedSite(db,sourceSiteId,targetSiteId,maps,
  copy,attrs,makeId) {
  const sourceRows=await db.getAllAsync(
    'SELECT * FROM visites WHERE site_id=? ORDER BY COALESCE(date_visite,\'\') DESC,rowid DESC',
    [sourceSiteId]);
  const seen=new Set(),cloned=[];
  for(const source of sourceRows){
    const key=value(source.installation_id)||'__site_only';
    if(seen.has(key))continue;
    seen.add(key);
    // No source installed local should be reassigned to an unrelated one.
    if(source.installation_id&&!remembered(maps.installations,source.installation_id))
      throw new Error('Installation impossible à cloner : '+source.installation_id);
    cloned.push(await cloneVisit(db,source,targetSiteId,maps,copy,attrs,makeId,todayIso()));
  }
  return cloned;
}
