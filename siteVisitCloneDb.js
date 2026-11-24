/**
 * Clone the latest visit per (installation, trame) into a copied site.
 * All copied observations, controls, REMAR children and equipment receive
 * NEW local identities; no Symfony destination or sent/outbox state follows.
 * This does NOT clone binary photo files or signatures: those are individual
 * visit evidence, and reusing file URIs can cause cross-site data loss.
 */
export async function cloneLatestVisitsForSite(db,sourceSiteId,targetSiteId,maps,clone,cloneAttributes,makeId) {
  const {installationMap,equipmentMap,networkMap,meterMap,itemMap}=maps;
  const mapped=(map,id,field)=>{
    if(!id)return null;
    const result=map.get(id);
    if(!result)throw new Error('Duplication interrompue : '+field+' ne fait pas partie du patrimoine copié.');
    return result;
  };
  const rewriteKey=value=>{
    let str=String(value||'');
    for(const [oldId,newId] of [...equipmentMap,...networkMap,...meterMap,...itemMap]){
      str=str.split(oldId).join(newId);
    }
    return str||null;
  };
  const visits=await db.getAllAsync(
    `SELECT * FROM visites WHERE site_id=? ORDER BY COALESCE(date_visite,'') DESC,cree_le DESC,id DESC`,
    [sourceSiteId]);
  const latest=[],seen=new Set();
  for(const v of visits){
    const key=[v.installation_id||v.api_remote_local_id||'non_rattache',v.trame_id||''].join('||');
    if(seen.has(key))continue;
    seen.add(key);latest.push(v);
  }
  const visitMap=new Map(),materialMap=new Map(),remarkMap=new Map(),localNetworkMap=new Map();
  for(const visit of latest) {
    const id=makeId();
    const visitOverrides={
      id,site_id:targetSiteId,
      installation_id:mapped(installationMap,visit.installation_id,'installation'),
      statut:'a_completer',progression_pct:visit.progression_pct||0,
    };
    for(const key of Object.keys(visit))
      if(/^api_|^signature|^synchro|^intranet_/.test(key))
        visitOverrides[key]=null;
    if(Object.prototype.hasOwnProperty.call(visit,'api_is_historical'))visitOverrides.api_is_historical=0;
    await clone(db,'visites',visit,visitOverrides,['cree_le','modifie_le']);
    visitMap.set(visit.id,id);
    await cloneAttributes(db,'visite',visit.id,id);
  }
  // First copy the referential REMAR items; only afterward write per-visit
  // associations and values that reference these new item IDs.
  const sourceInstallations=[...installationMap.keys()];
  for(const sourceInstallation of sourceInstallations){
    const items=await db.getAllAsync(
      'SELECT * FROM remar_items WHERE installation_id=? ORDER BY ordre,id',
      [sourceInstallation]);
    for(const item of items){
      const newId=makeId();itemMap.set(item.id,newId);
      await clone(db,'remar_items',item,{
        id:newId,installation_id:installationMap.get(sourceInstallation),
        parent_equipement_id:mapped(equipmentMap,item.parent_equipement_id,'parent CTA/VMC'),
        parent_reseau_id:mapped(networkMap,item.parent_reseau_id,'parent network'),
      },['cree_le','modifie_le']);
    }
  }
  const copyRows=async(table,sourceVisitId,targetVisitId,transform)=>{
    const rows=await db.getAllAsync(`SELECT * FROM ${table} WHERE visite_id=?`,[sourceVisitId]);
    for(const row of rows){
      const patch={visite_id:targetVisitId,...(transform?transform(row):{})};
      if(Object.prototype.hasOwnProperty.call(row,'id')&&!Object.prototype.hasOwnProperty.call(patch,'id'))
        patch.id=makeId();
      await clone(db,table,row,patch,['cree_le','modifie_le']);
    }
  };
  for(const visit of latest){
    const target=visitMap.get(visit.id);
    await copyRows('champs_visite',visit.id,target,row=>({
      valeur:row.cle==='Nom du site'?null:row.valeur,
    }));
    // Site identity cells are written explicitly after copying; leaving
    // them as null avoids retaining the source site's name in the clone.
    const dest=await db.getFirstAsync('SELECT nom_site FROM sites WHERE id=?',[targetSiteId]);
    await db.runAsync("UPDATE champs_visite SET valeur=? WHERE visite_id=? AND cle='Nom du site'",
      [dest?.nom_site||'',target]);
    await copyRows('controles_visite',visit.id,target);
    await copyRows('notes',visit.id,target);
    await copyRows('materiel',visit.id,target,row=>{
      const id=makeId();materialMap.set(row.id,id);
      return {id,equipement_id:mapped(equipmentMap,row.equipement_id,'matériel'),
        confirme_le:null};
    });
    await copyRows('observations_equipement',visit.id,target,row=>({
      equipement_id:mapped(equipmentMap,row.equipement_id,'observation équipement'),
    }));
    await copyRows('reseaux',visit.id,target,row=>{
      const id=makeId();localNetworkMap.set(row.id,id);
      return {id,reseau_site_id:mapped(networkMap,row.reseau_site_id,'réseau de visite')};
    });
    await copyRows('compteurs',visit.id,target,row=>({
      compteur_site_id:mapped(meterMap,row.compteur_site_id,'compteur de visite'),
    }));
    await copyRows('observations_reseau',visit.id,target,row=>({
      reseau_site_id:mapped(networkMap,row.reseau_site_id,'relevé réseau'),
    }));
    await copyRows('releves_compteur',visit.id,target,row=>({
      compteur_site_id:mapped(meterMap,row.compteur_site_id,'index compteur'),
    }));
    await copyRows('points_mesure_visite',visit.id,target);
    await copyRows('mesures',visit.id,target,row=>({
      equipement_id:mapped(equipmentMap,row.equipement_id,'mesure équipement'),
      reseau_id:mapped(networkMap,row.reseau_id,'mesure réseau'),
      compteur_id:mapped(meterMap,row.compteur_id,'mesure compteur'),
    }));
    await copyRows('controles',visit.id,target,row=>({
      equipement_id:mapped(equipmentMap,row.equipement_id,'contrôle équipement'),
      reseau_id:mapped(networkMap,row.reseau_id,'contrôle réseau'),
    }));
    await copyRows('remarques',visit.id,target,row=>{
      const id=makeId();remarkMap.set(row.id,id);
      let referenceId=row.reference_id;
      if(row.reference_type==='equipement'&&referenceId)
        referenceId=mapped(equipmentMap,referenceId,'réserve équipement');
      else if(row.reference_type==='reseau'&&referenceId)
        referenceId=mapped(networkMap,referenceId,'réserve réseau');
      // An imported reservation must never retain a reference to the
      // original server reservation. Keep the descriptive content only.
      const remoteReference=row.reference_type==='api_symfony'||row.origine==='Intranet';
      return {id,controle_key:rewriteKey(row.controle_key),
        reference_type:remoteReference?null:row.reference_type,
        reference_id:remoteReference?null:referenceId,
        origine:remoteReference?'Copie locale':row.origine,
        intranet_etat_avancement:null};
    });
    await copyRows('remar_values',visit.id,target,row=>({
      owner_id:row.owner_type==='equipement'
        ?mapped(equipmentMap,row.owner_id,'observation CTA/VMC')
        :mapped(itemMap,row.owner_id,'observation REMAR'),
      source_visite_id:'copie_locale:'+visit.id,
    }));
    const membership=await db.getAllAsync(
      'SELECT * FROM remar_item_visits WHERE visite_id=?',[visit.id]);
    for(const row of membership)await clone(db,'remar_item_visits',row,{
      visite_id:target,item_id:mapped(itemMap,row.item_id,'association REMAR')});
    const focus=await db.getAllAsync(
      'SELECT * FROM remar_report_focus WHERE visite_id=?',[visit.id]);
    for(const row of focus)await clone(db,'remar_report_focus',row,{
      visite_id:target,equipement_id:mapped(equipmentMap,row.equipement_id,'CTA principale')});
  }
  for(const [oldId,newId] of localNetworkMap)
    await cloneAttributes(db,'reseau',oldId,newId);

  return {visites:latest.length,visitMap,remarkMap,materialMap};
}
