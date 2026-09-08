import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { getCachedLocalReference } from './symfonyApiCacheDb.js';

function normalize(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
export function mapRemoteTrameToLocal(remote) {
  const t = normalize(`${remote?.id || ''} ${remote?.nom || ''}`);
  if (t.includes('vmc')) return 'vmc';
  if (t.includes('pre') && t.includes('allum')) return 'pre_allumage';
  if (t.includes('chauffer') || t.includes('icpe')) return 'icpe_v1';
  return 'icpe_v1';
}
async function ensureInstallation(db, siteId, name) {
  let row = await db.getFirstAsync(`SELECT id FROM installations WHERE site_id=? AND actif=1 ORDER BY cree_le LIMIT 1`, [siteId]);
  if (row) return row.id; const id=createId(); await db.runAsync(`INSERT INTO installations(id,site_id,type_code,nom,actif) VALUES(?,?,?,?,1)`,[id,siteId,'installation_technique',name||'Installation technique']); return id;
}
export async function importApiReferenceForVisit(visiteId, remoteLocalId) {
  if (!remoteLocalId) return; const ref=await getCachedLocalReference(remoteLocalId); if(!ref) return;
  const db=await getDb(); const visit=await db.getFirstAsync(`SELECT id,site_id,trame_id FROM visites WHERE id=?`,[visiteId]); if(!visit)return;
  const installationId=await ensureInstallation(db,visit.site_id,ref?.local?.designation);
  for(const m of ref.materiels||[]){
    const ext=String(m.id??''); let eq=ext?await db.getFirstAsync(`SELECT entite_id FROM provenances WHERE entite_type='equipement' AND origine='api_symfony' AND reference_externe=? LIMIT 1`,[ext]):null; let equipmentId=eq?.entite_id;
    if(!equipmentId){equipmentId=createId();await db.runAsync(`INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,annee,statut) VALUES(?,?,?,?,?,?,?,'actif')`,[equipmentId,installationId,m.categorie||'equipement',m.designation||'Équipement',m.marque||null,m.modele||null,m.annee?Number(m.annee)||null:null]);if(ext)await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`,[createId(),'equipement',equipmentId,'api_symfony',ext,JSON.stringify(m)]);}
    await db.runAsync(`INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1) ON CONFLICT(equipement_id,trame_id) DO UPDATE SET actif=1`,[equipmentId,visit.trame_id]);
    const existing=await db.getFirstAsync(`SELECT id FROM materiel WHERE visite_id=? AND equipement_id=?`,[visiteId,equipmentId]); if(!existing)await db.runAsync(`INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat,equipement_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[createId(),visiteId,m.categorie||null,m.nombre||null,m.designation||null,m.numeroMateriel||null,m.reseauDesservi||null,m.marque||null,m.modele||null,m.caracteristiques||null,m.annee||null,m.etat||'Bon',equipmentId]);
  }
  // The API values are reference values only: never write them as today's controls or measurements.
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`,[createId(),'visite',visiteId,'api_symfony',String(ref?.derniereVisite?.id||remoteLocalId),JSON.stringify({local:ref.local,derniereVisite:ref.derniereVisite,trame:ref.trame,criteres:ref?.trame?.categories||[],remarques:ref.remarques||[],notes:ref.notes||[]})]);
}
