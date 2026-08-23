import { createId } from './ids.js';

const VERIFIED_AT='2026-08-23';
async function cat(db,n){return (await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[n]))?.id;}
async function brand(db,n){return (await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[n]))?.id;}
async function model(db,{category,brandName,name,desc,source,quality='verified'}){
  const c=await cat(db,category),b=await brand(db,brandName); if(!c||!b)return null;
  let r=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[c,b,name]);
  const id=r?.id||createId('model');
  if(!r) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?)`,[id,c,b,name,desc,`${category} ${brandName} ${name}`,source||null,quality,VERIFIED_AT]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=?,source_uri=?,data_quality=?,verified_at=? WHERE id=?`,[desc,source||null,quality,VERIFIED_AT,id]);
  return id;
}
async function variant(db,{modelId,name,ref,desc,source,specs=[]}){
  let r=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=r?.id||createId('variant');
  if(!r) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[id,modelId,name,ref||null,desc||null,source||null,'verified',VERIFIED_AT]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=COALESCE(?,reference),description=COALESCE(?,description),source_uri=COALESCE(?,source_uri),data_quality='verified',verified_at=? WHERE id=?`,[ref||null,desc||null,source||null,VERIFIED_AT,id]);
  await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);
  let o=0; for(const [k,v,u] of specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,k,String(v),u||null,o++]);
  if(source){const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]); if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Documentation / page constructeur',source]);}
}

export async function seedEquipmentCatalogDeep4(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_deep_v4'`); if(done)return;

  const ksbEtaline=await model(db,{category:'Pompe',brandName:'KSB',name:'Etaline / Etaline Pro / MyFlow',desc:'Pompe en ligne monocellulaire pour chauffage/climatisation, jusqu’à 850 m³/h, 140 m HMT, 16 bar et 140 °C.',source:'https://www.ksb.com/fr-ma/lc/products/pompe/pompe-a-installation-seche/etaline/E03B'});
  if(ksbEtaline) await variant(db,{modelId:ksbEtaline,name:'Etaline gamme HVAC',source:'https://www.ksb.com/fr-ma/lc/products/pompe/pompe-a-installation-seche/etaline/E03B',specs:[['Débit max','850','m³/h'],['HMT max','140','m'],['Pression service max','16','bar'],['Température fluide max','140','°C'],['Construction','In-line monocellulaire',''],['Variation de vitesse','PumpDrive 2/3 selon version',''],['Classe moteur','IE4/IE5 selon version','']]});

  const calioZ=await model(db,{category:'Circulateur',brandName:'KSB',name:'Calio Z',desc:'Circulateur double à rotor noyé haut rendement pour chauffage, climatisation, froid et circuits primaires.',source:'https://www.ksb.com/fr-fr/lc/products/pompe/pompe-%25c3%25a0-installation-s%25c3%25a8che/calio-z/C09B'});
  if(calioZ) await variant(db,{modelId:calioZ,name:'Calio Z gamme',source:'https://www.ksb.com/fr-fr/lc/products/pompe/pompe-%25c3%25a0-installation-s%25c3%25a8che/calio-z/C09B',specs:[['Débit max','52','m³/h'],['HMT max','18','m'],['Pression service max','16','bar'],['Température fluide max','110','°C'],['Configuration','Pompe double',''],['Régulation','Pression différentielle continue','']]});

  const topS=await model(db,{category:'Circulateur',brandName:'Wilo',name:'TOP-S',desc:'Circulateur à rotor noyé standard, gamme très présente sur installations existantes.',source:'https://wilo.com/fr/fr/Support/S%C3%A9lection-et-Configuration/Guide-d%27%C3%A9quivalence-pour-chauffage/fr/wilo/top-s_id60006/2006931'});
  if(topS) await variant(db,{modelId:topS,name:'TOP-S 25/7 (3~400 V, PN10)',ref:'2006931 / 2048321',source:'https://wilo.com/fr/fr/Support/S%C3%A9lection-et-Configuration/Guide-d%27%C3%A9quivalence-pour-chauffage/fr/wilo/top-s_id60006/2006931',specs:[['Raccord entrée','G 1½',''],['Raccord sortie','G 1½',''],['PN','10','bar'],['Alimentation','3~400 V, 50 Hz',''],['Entraxe','180','mm'],['Poids net','4.5','kg']]});

  const bosch=await model(db,{category:'Chaudière',brandName:'Bosch',name:'Condens 7000 F',desc:'Chaudière sol gaz à condensation 75 à 300 kW.',source:'https://www.bosch-industrial.com/fr/media/country_pool/industrial/service/documentation-technique-chaudieres-a-condensation/dtc_6720884532_01_pd_c7000f.pdf'});
  if(bosch){const vals=[[75,69,41],[100,93,49],[150,140,34],[200,186,36],[250,233,32],[300,280,36]];for(const [nom,pRated,nox] of vals)await variant(db,{modelId:bosch,name:`Condens 7000 F-${nom}`,source:'https://www.bosch-industrial.com/gb/media/country_pool/service/manuals/heating_boilers/condens_7000f_operating_instructions.pdf',specs:[['Puissance thermique nominale Prated',pRated,'kW'],['Type','Chaudière sol condensation',''],['NOx',nox,'mg/kWh'],['Mode haute température','80/60 °C',''],['Documentation conception','GC7000F 75…300','']]});}

  const alfa=await model(db,{category:'Échangeur',brandName:'Alfa Laval',name:'T10',desc:'Échangeur à plaques et joints à haut débit, configurable, maintenance et nettoyage CIP.',source:'https://www.alfalaval.com/globalassets/documents/products/heat-transfer/plate-heat-exchangers/gasketed-plate-and-frame-heat-exchangers/industrial/t10_product-leaflet_en.pdf'});
  if(alfa) await variant(db,{modelId:alfa,name:'Alfa Laval T10',source:'https://www.alfalaval.com/globalassets/documents/products/heat-transfer/plate-heat-exchangers/gasketed-plate-and-frame-heat-exchangers/industrial/t10_product-leaflet_en.pdf',specs:[['Type','Plaques et joints',''],['Applications','HVAC, énergie, industrie',''],['Distribution','CurveFlow',''],['Joints','ClipGrip',''],['Nettoyage','Ouverture / CIP',''],['Surface échange','Modifiable par ajout/retrait de plaques','']]});

  const itron=await model(db,{category:'Compteur',brandName:'Itron',name:'CF Echo II',desc:'Compteur d’énergie thermique ultrason DN15 à DN50 avec sondes appairées et télérelève.',source:'https://na.itron.com/documents/44647/3815900/cf%2Becho%2BII_pb_FR_09.13.pdf/361b4275-e334-b6ab-91ab-544fa2f31d64?t=1711248939569&version=1.1'});
  if(itron) await variant(db,{modelId:itron,name:'CF Echo II DN15-50',source:'https://emea.itron.com/o/commerce-media/accounts/-1/attachments/3816104',specs:[['DN','15–50','mm'],['Technologie','Ultrason',''],['Température fluide','0–90','°C'],['ΔT','3–90','K'],['Protection','IP54',''],['Température ambiante','5–55','°C'],['Autonomie batterie','>10','ans'],['Communication','M-Bus / radio / impulsions',''],['Longueurs droites usuelles','Non requises selon EN1434 conditions normales','']]});

  const discal=await model(db,{category:'Séparateur d’air',brandName:'Caleffi',name:'DISCAL DIRTMAG',desc:'Séparateur combiné air, boues et particules ferreuses pour réseaux hydroniques.',source:'https://www.caleffi.com/sites/default/files/media/external-file/02920-5_NA.pdf'});
  if(discal) await variant(db,{modelId:discal,name:'DISCAL DIRTMAG série acier',source:'https://www.caleffi.com/sites/default/files/media/external-file/02920-5_NA.pdf',specs:[['Fonctions','Séparation air + boues + magnétite',''],['Séparation particules','jusqu’à 5','µm'],['Fluide','Eau / glycol',''],['Glycol max','50','%'],['Aimants','Néodyme terres rares',''],['Température max gamme ASME','132','°C']]});

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_deep_v4','1')`);
}
