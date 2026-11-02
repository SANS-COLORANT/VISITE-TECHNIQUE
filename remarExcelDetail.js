/**
 * REMAR_DETAIL Excel extension: reversible import of multi-CTA/VMC/cold,
 * child filters and measurements. The official 141-cell workbook is unchanged.
 *
 * This module does not guess identities. A partial, contradictory or damaged
 * annex fails the whole Excel import transaction before data can be lost.
 */
const HEADER = Object.freeze([
  'Famille','Parent','Parent ID','Element','Element ID','Type','Onglet',
  'Rubrique','Champ','Valeur','Avis','Commentaire','Source visite','Statut',
]);
const FAMILIES = Object.freeze({cta:'CTA',vmc:'VMC',froid:'Froid'});
const CHILD_FAMILIES = Object.freeze({
  filtre_cta:'cta',mesure_cta:'cta',reseau_froid:'froid',
  temperature_chaufferie:'chaufferie',
});
const PANELS = Object.freeze({
  cta:['p-remar-cta','p-remar-filtres','p-remar-cta-mesures','p-remar-cta-energie'],
  vmc:['p-remar-vmc'],froid:['p-remar-froid'],
});
const normalize = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim();
const str = value => String(value ?? '').trim();
const recordKey = row => [row.type,row.elementId,row.panel,row.section,row.cle].join('||');

export function analyserRemarDetailExcel(wb, definition, XLSX) {
  const sheet=wb?.Sheets?.REMAR_DETAIL;
  if (!sheet) return [];
  if ((definition?.familyId || definition?.id)!=='remar_v1')
    throw new Error('Annexe REMAR_DETAIL présente dans une trame non REMAR.');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
  if (!matrix.length) throw new Error('REMAR_DETAIL : en-tête absent.');
  HEADER.forEach((name,index)=>{
    if(str(matrix[0][index])!==name)
      throw new Error('REMAR_DETAIL : colonne '+(index+1)+' attendue « '+name+' ».');
  });
  if(str(matrix[0][14]) && str(matrix[0][14])!=='Unité')
    throw new Error('REMAR_DETAIL : colonne Unité invalide.');
  const data=[], seen=new Map(), owners=new Map();
  matrix.slice(1).forEach((line,index)=>{
    if(!line.some(cell=>str(cell)))return;
    const row={
      famille:str(line[0]).toLowerCase(), parent:str(line[1]),parentId:str(line[2]),
      nom:str(line[3]),elementId:str(line[4]),type:str(line[5]),
      panel:str(line[6]),section:str(line[7]),cle:str(line[8]),
      valeur:str(line[9]),avis:str(line[10]),commentaire:str(line[11]),
      sourceVisite:str(line[12]),statut:str(line[13]),unite:str(line[14]),
    };
    const label='REMAR_DETAIL ligne '+(index+2);
    if(!row.nom || !row.elementId || !row.type || !row.panel || !row.section || !row.cle)
      throw new Error(label+' : identité de mesure ou équipement incomplète.');
    const equipment=row.type==='equipement';
    const expectedFamily=equipment ? row.famille : CHILD_FAMILIES[row.type];
    if(!expectedFamily || expectedFamily!==row.famille)
      throw new Error(label+' : famille et type incompatibles.');
    // Les annexes REMAR antérieures portaient parfois l'ID de l'équipement
    // dans sa propre colonne Parent ID. C'est une référence à soi-même
    // historique, et non un rattachement à un autre équipement.
    if(equipment && row.parentId===row.elementId)row.parentId='';
    if(equipment && (!FAMILIES[row.famille] || row.parentId))
      throw new Error(label+' : identité parent invalide.');
    if(!equipment && row.type!=='temperature_chaufferie' && !row.parentId)
      throw new Error(label+' : équipement parent absent.');
    if(row.type==='temperature_chaufferie' && row.parentId)
      throw new Error(label+' : température de chaufferie ne doit pas avoir de parent CTA.');
    const allowedPanel=equipment ? PANELS[row.famille]?.includes(row.panel) :
      row.type==='filtre_cta' ? row.panel==='p-remar-filtres' :
      row.type==='mesure_cta' ? row.panel==='p-remar-cta-mesures' :
      row.type==='reseau_froid' ? row.panel==='p-remar-froid' :
      row.panel==='p-remar-releves';
    if(!allowedPanel) throw new Error(label+' : onglet non compatible avec le type de donnée.');
    if(row.avis && !['S','N.S','N.R','S.O','N.V'].includes(row.avis))
      throw new Error(label+' : avis technique inconnu.');
    if(row.statut && !['Visite courante','Historique à confirmer'].includes(row.statut))
      throw new Error(label+' : provenance du constat inconnue.');
    if(equipment && row.cle!=='Identité patrimoine' &&
       !(definition.ui?.panels?.[row.panel]?.[row.section]||[]).some(field=>field.cle===row.cle))
      throw new Error(label+' : champ équipement hors définition de cette trame.');
    const previous=seen.get(recordKey(row));
    if(previous){
      if(JSON.stringify(previous)!==JSON.stringify(row))
        throw new Error(label+' : doublon contradictoire, import arrêté sans écrasement.');
      return;
    }
    seen.set(recordKey(row),row);
    const owner=owners.get(row.type+'||'+row.elementId);
    if(owner && (owner.nom!==row.nom || owner.parentId!==row.parentId ||
        owner.famille!==row.famille || (owner.unite && row.unite && owner.unite!==row.unite)))
      throw new Error(label+' : identité d’objet change entre deux lignes.');
    if(!owner)owners.set(row.type+'||'+row.elementId,row);
    data.push(row);
  });
  const equipments=new Set(data.filter(r=>r.type==='equipement').map(r=>r.elementId));
  for(const row of data){
    if(row.type!=='equipement' && row.type!=='temperature_chaufferie' &&
       !equipments.has(row.parentId))
      throw new Error('REMAR_DETAIL : parent '+row.parentId+' absent pour '+row.nom+'.');
  }
  return data;
}

export async function importerRemarDetailExcel(db,visiteId,installationId,trameId,details,makeId) {
  if(!Array.isArray(details)||!details.length)return 0;
  const owners=[...new Map(details.map(row=>[row.type+'||'+row.elementId,row])).values()];
  const parentMap=new Map(), itemMap=new Map();
  const currentEquipment=await db.getAllAsync(
    "SELECT id,type_code,designation,statut FROM equipements WHERE installation_id=? AND statut='actif'",
    [installationId]
  );
  for(const owner of owners.filter(row=>row.type==='equipement')) {
    const expected=FAMILIES[owner.famille];
    const matches=currentEquipment.filter(e=>
      normalize(e.type_code)===normalize(expected) &&
      normalize(e.designation)===normalize(owner.nom)
    );
    if(matches.length>1)
      throw new Error('REMAR_DETAIL : matériel ambigu '+owner.nom+' ; aucun rattachement automatique.');
    let id=matches[0]?.id;
    if(!id){
      id=makeId();
      await db.runAsync("INSERT INTO equipements(id,installation_id,type_code,designation,statut) VALUES(?,?,?,?,'actif')",
        [id,installationId,expected,owner.nom]);
      currentEquipment.push({id,type_code:expected,designation:owner.nom,statut:'actif'});
    }
    await db.runAsync(
      'INSERT OR IGNORE INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1)',
      [id,trameId]);
    const material=await db.getFirstAsync(
      'SELECT id FROM materiel WHERE visite_id=? AND equipement_id=? LIMIT 1',
      [visiteId,id]);
    if(!material){
      await db.runAsync(
        'INSERT INTO materiel(id,visite_id,equipement_id,categorie,nombre,designation,etat,ajoute_pendant_visite) VALUES(?,?,?,?,?,?,NULL,1)',
        [makeId(),visiteId,id,expected,'1',owner.nom]);
    }
    parentMap.set(owner.elementId,id);
  }

  const currentItems=await db.getAllAsync(
    'SELECT id,type_code,nom,parent_equipement_id,unite,ordre FROM remar_items WHERE installation_id=? AND actif=1',
    [installationId]
  );
  for(const owner of owners.filter(row=>row.type!=='equipement')){
    const parentId=owner.parentId?parentMap.get(owner.parentId):null;
    if(owner.parentId && !parentId)
      throw new Error('REMAR_DETAIL : parent matériel non résolu '+owner.parentId+'.');
    const matches=currentItems.filter(row=>row.type_code===owner.type &&
      str(row.parent_equipement_id)===str(parentId) &&
      normalize(row.nom)===normalize(owner.nom));
    if(matches.length>1)
      throw new Error('REMAR_DETAIL : élément ambigu '+owner.nom+'.');
    if(matches[0]?.unite && owner.unite && matches[0].unite!==owner.unite)
      throw new Error('REMAR_DETAIL : unité différente pour '+owner.nom+' ; import interrompu.');
    let id=matches[0]?.id;
    if(!id){
      id=makeId();
      const maxOrder=currentItems.filter(row=>row.type_code===owner.type &&
        str(row.parent_equipement_id)===str(parentId))
        .reduce((max,row)=>Math.max(max,Number(row.ordre||0)),0);
      const unit=owner.unite||null;
      await db.runAsync(
        'INSERT INTO remar_items(id,installation_id,parent_equipement_id,type_code,nom,unite,ordre) VALUES(?,?,?,?,?,?,?)',
        [id,installationId,parentId,owner.type,owner.nom,unit,maxOrder+1]);
      currentItems.push({id,type_code:owner.type,nom:owner.nom,parent_equipement_id:parentId,unite:unit,ordre:maxOrder+1});
    }
    await db.runAsync('INSERT OR IGNORE INTO remar_item_visits(visite_id,item_id) VALUES(?,?)',
      [visiteId,id]);
    itemMap.set(owner.type+'||'+owner.elementId,id);
  }

  let imported=0;
  for(const row of details){
    if(row.cle==='Identité patrimoine' && row.type==='equipement')continue;
    if(row.cle==='Type / presence' && row.type!=='equipement')continue;
    const id=row.type==='equipement'
      ?parentMap.get(row.elementId):itemMap.get(row.type+'||'+row.elementId);
    if(!id)throw new Error('REMAR_DETAIL : propriétaire de constat perdu '+row.elementId+'.');
    const section=row.type==='temperature_chaufferie'?'temperature_chaufferie':row.section;
    const inherited=row.statut==='Historique à confirmer';
    const source=inherited?row.sourceVisite||null:null;
    await db.runAsync(
      'INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,valeur,avis,commentaire,source_visite_id,confirme_le) '+
      "VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ?=1 THEN NULL ELSE datetime('now') END)",
      [visiteId,row.type==='equipement'?'equipement':'item',id,row.panel,section,row.cle,
        row.valeur||null,row.avis||null,row.commentaire||null,source,inherited?1:0]
    );
    imported++;
  }
  return imported;
}
