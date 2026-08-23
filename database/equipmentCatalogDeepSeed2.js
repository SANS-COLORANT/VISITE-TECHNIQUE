import { createId } from './ids.js';

const VERIFIED_AT='2026-08-23';
async function findModel(db,brand,name){return db.getFirstAsync(`SELECT m.id FROM modeles_equipement m JOIN marques_equipement b ON b.id=m.marque_id WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE`,[brand,name]);}
async function ensureVariant(db,{modelId,name,ref,source,specs=[]}){
  if(!modelId)return;
  let row=await db.getFirstAsync(`SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE`,[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row)await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,'verified',?)`,[id,modelId,name,ref||null,source||null,VERIFIED_AT]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=COALESCE(?,reference),source_uri=COALESCE(?,source_uri),data_quality='verified',verified_at=? WHERE id=?`,[ref||null,source||null,VERIFIED_AT,id]);
  await db.runAsync(`DELETE FROM caracteristiques_equipement WHERE variante_id=?`,[id]);
  let order=0;for(const[s,v,u]of specs)await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,s,String(v),u||null,order++]);
  if(source){const d=await db.getFirstAsync(`SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?`,[id,source]);if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Fiche constructeur','Documentation constructeur',source]);}
}

export async function seedEquipmentCatalogDeep2(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_deep_v2'`);if(done)return;

  const caleffiSource='https://www.caleffi.com/fr-fr/pot-de-d%C3%A9cantation-avec-aimants-5463-caleffi-546305';
  const dirt=await findModel(db,'Caleffi','DIRTMAG 5463')||await findModel(db,'Caleffi','DIRTMAG');
  if(dirt){
    for(const [ref,raccord] of [['546305','G 3/4 F'],['546306','G 1 F'],['546309','G 2 F']]) await ensureVariant(db,{modelId:dirt.id,name:`DIRTMAG ${ref}`,ref,source:caleffiSource,specs:[['Raccord',raccord,''],['Matériau','Laiton',''],['Pression max','10','bar'],['Température fluide','0–110','°C'],['Séparation particules','jusqu’à 5','µm'],['Aimants','Oui',''],['Vidange en service','Oui','']]});
  }

  const siemensSource='https://sid.siemens.com/api/khub/documents/gVgUMTaxhKz0sNcZsfnSJA/content';
  const weights2={25:5.0,32:7.4,40:8.9,50:11.9,65:16.7,80:26.6,100:36.5,125:45.7,150:63.6};
  const weights3={25:4.1,32:6.1,40:7.1,50:9.5,65:13.9,80:21.5,100:31.1,125:38.4,150:53.6};
  const vvf=await findModel(db,'Siemens','VVF42');
  const vxf=await findModel(db,'Siemens','VXF42');
  for(const dn of [25,32,40,50,65,80,100,125,150]){
    if(vvf)await ensureVariant(db,{modelId:vvf.id,name:`VVF42 DN${dn}`,source:siemensSource,specs:[['Voies','2',''],['DN',dn,''],['PN','16','bar'],['Eau glacée','1–25','°C'],['Eau chaude','1–130','°C'],['Eau surchauffée','130–150','°C'],['Eau/antigel','-5–150','°C'],['Poids',weights2[dn],'kg'],['Brides','ISO 7005',''],['Caractéristique vanne','VDI 2173','']]});
    if(vxf)await ensureVariant(db,{modelId:vxf.id,name:`VXF42 DN${dn}`,source:siemensSource,specs:[['Voies','3',''],['DN',dn,''],['PN','16','bar'],['Eau glacée','1–25','°C'],['Eau chaude','1–130','°C'],['Eau surchauffée','130–150','°C'],['Eau/antigel','-5–150','°C'],['Poids',weights3[dn],'kg'],['Brides','ISO 7005',''],['Caractéristique vanne','VDI 2173','']]});
  }

  const alfaSource='https://www.alfalaval.com/globalassets/documents/microsites/heating-and-cooling-hub/pd-leaflets---gasketed/m10.pdf';
  const m10=await findModel(db,'Alfa Laval','M10');
  if(m10){
    await db.runAsync(`UPDATE modeles_equipement SET source_uri=?,data_quality='verified',verified_at=?,caracteristiques=? WHERE id=?`,[alfaSource,VERIFIED_AT,'Échangeur à plaques et joints, configuration flexible, adapté HVAC, énergie/utilités et nombreux procédés industriels.',m10.id]);
    await ensureVariant(db,{modelId:m10.id,name:'M10 plaques et joints',source:alfaSource,specs:[['Construction','Plaques et joints démontables',''],['Configuration','Simple plaque ou double paroi selon version',''],['Maintenance','Ouverture pour inspection/nettoyage, CIP possible',''],['Applications','HVAC, réfrigération, énergie/utilités, industrie','']]});
  }

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_deep_v2','1')`);
}
