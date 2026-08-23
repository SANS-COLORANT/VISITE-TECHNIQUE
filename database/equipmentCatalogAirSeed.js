import { createId } from './ids.js';

const VERIFIED_AT = '2026-08-23';

async function ensureCategory(db, nom, icone, ordre=80){
  let row=await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('cat');
  if(!row) await db.runAsync('INSERT INTO categories_equipement(id,nom,icone,ordre) VALUES(?,?,?,?)',[id,nom,icone,ordre]);
  else await db.runAsync('UPDATE categories_equipement SET actif=1,icone=? WHERE id=?',[icone,id]);
  return id;
}
async function ensureBrand(db, nom){
  let row=await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('brand');
  if(!row) await db.runAsync('INSERT INTO marques_equipement(id,nom) VALUES(?,?)',[id,nom]);
  else await db.runAsync('UPDATE marques_equipement SET actif=1 WHERE id=?',[id]);
  return id;
}
async function ensureModel(db,{category,brand,name,desc,source,quality='verified_range',image}){
  const cid=await ensureCategory(db,category,category==='CTA'?'🌬️':category==='VMC'?'🌀':'♨️',category==='CTA'?80:category==='VMC'?81:82);
  const bid=await ensureBrand(db,brand);
  let row=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[cid,bid,name]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at,image_uri) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,cid,bid,name,desc,`${category} ${brand} ${name}`,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,image||null]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=?,source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=?,image_uri=COALESCE(?,image_uri) WHERE id=?`,[desc,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,image||null,id]);
  return id;
}
async function ensureVariant(db,{modelId,name,ref,desc,source,quality='verified_range',specs=[],image}){
  let row=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at,image_uri) VALUES(?,?,?,?,?,?,?,?,?)`,[id,modelId,name,ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,image||null]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=COALESCE(?,reference),description=COALESCE(?,description),source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=?,image_uri=COALESCE(?,image_uri) WHERE id=?`,[ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,image||null,id]);
  if(specs.length){await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);let ordre=0;for(const [k,v,u] of specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,k,String(v),u||null,ordre++]);}
  if(source){const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]);if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Page / documentation constructeur',source]);}
  return id;
}

export async function seedEquipmentCatalogAir(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_air_v1'`); if(done)return;

  // CTA DAIKIN
  const daikinProfessional=await ensureModel(db,{category:'CTA',brand:'Daikin',name:'D-AHU Professional',desc:'CTA personnalisable, débit jusqu’à 144 000 m³/h, régulation Plug & Play, capteurs température/humidité/CO₂, batteries eau/DX.',source:'https://www.daikin.fr/fr_fr/famille-produits/centrales-traitement-air/professional.html',quality:'verified'});
  if(daikinProfessional) await ensureVariant(db,{modelId:daikinProfessional,name:'D-AHU Professional',source:'https://www.daikin.fr/fr_fr/famille-produits/centrales-traitement-air/professional.html',quality:'verified',specs:[['Débit d’air max','144000','m³/h'],['Régulation','Plug & Play',''],['Capteurs intégrés','Température / humidité / CO₂',''],['Batteries compatibles','Eau chaude / eau glacée / électrique / DX',''],['Circuits réfrigérant DX','jusqu’à 4 par batterie','']]});

  const compactT=await ensureModel(db,{category:'CTA',brand:'Daikin',name:'Compact T',desc:'CTA compacte Daikin avec intégration capteur QAI et catalogue produit 2026.',source:'https://www.daikin.fr/fr_fr/famille-produits/centrales-traitement-air/compact-t.html',quality:'verified_range'});
  if(compactT) await ensureVariant(db,{modelId:compactT,name:'Compact T',source:'https://www.daikin.fr/fr_fr/famille-produits/centrales-traitement-air/compact-t.html',quality:'verified_range',specs:[['Type','CTA compacte',''],['Capteur QAI','CO₂ / humidité / température / PM10 / PM2.5 / COV','']]});

  const compactR=await ensureModel(db,{category:'CTA',brand:'Daikin',name:'Compact R',desc:'CTA compacte à récupération rotative, lancée en 2026 pour bâtiments commerciaux.',source:'https://www.daikin.fr/fr_fr/communiques-de-presse/communique-de-presse-2026-CTA-Compact-R.html',quality:'verified'});
  if(compactR) await ensureVariant(db,{modelId:compactR,name:'Compact R',source:'https://www.daikin.fr/fr_fr/communiques-de-presse/communique-de-presse-2026-CTA-Compact-R.html',quality:'verified',specs:[['Récupération','Échangeur rotatif',''],['Raccordements aérauliques','Latéraux',''],['Application','Bâtiments commerciaux','']]});

  // CTA SYSTEMAIR
  const geniox=await ensureModel(db,{category:'CTA',brand:'Systemair',name:'Geniox',desc:'CTA modulaire configurable, 750 à 110 000 m³/h, régulation Systemair Access, Eurovent.',source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/geniox',quality:'verified'});
  if(geniox) await ensureVariant(db,{modelId:geniox,name:'Geniox',source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/geniox',quality:'verified',specs:[['Débit d’air min','750','m³/h'],['Débit d’air max','110000','m³/h'],['Régulation','Systemair Access',''],['Certification','Eurovent',''],['Option hygiène','#HygienicByDesign','']]});

  const topvexModels=[
    ['Topvex TC','Plaques contre-courant, vertical','6600'],['Topvex TR','Rotatif, vertical','6900'],['Topvex SC','Plaques contre-courant, horizontal','6850'],['Topvex SR','Rotatif, horizontal','7500'],['Topvex FC','Plaques contre-courant, faux plafond','3150'],['Topvex FR','Double échangeur rotatif, compact','4800']
  ];
  for(const [name,type,max] of topvexModels){
    const mid=await ensureModel(db,{category:'CTA',brand:'Systemair',name,desc:`CTA compacte ${type}.`,source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/topvex',quality:'verified'});
    if(mid) await ensureVariant(db,{modelId:mid,name,source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/topvex',quality:'verified',specs:[['Débit d’air max',max,'m³/h'],['Régulation','Systemair Access',''],['Commande','CAV / VAV',''],['Récupération','>80 % selon configuration',''],['Installation','Intérieur / extérieur selon version','']]});
  }
  for(const name of ['Topvex SRHP','Topvex TRHP']){
    const mid=await ensureModel(db,{category:'CTA',brand:'Systemair',name,desc:'CTA double flux avec pompe à chaleur réversible intégrée.',source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/topvex',quality:'verified_range'});
    if(mid) await ensureVariant(db,{modelId:mid,name,source:'https://www.systemair.com/fr-fr/produits/centrales-de-traitement-d-air/topvex',quality:'verified_range',specs:[['Type','Double flux + PAC réversible intégrée',''],['Régulation','Systemair Access','']]});
  }

  // VMC ATLANTIC COLLECTIVE
  const comete=await ensureModel(db,{category:'VMC',brand:'Atlantic',name:'Comète',desc:'Caisson d’extraction simple flux C4 ultra basse consommation, logement collectif neuf, 400 à 11 000 m³/h.',source:'https://www.atlantic-pros.fr/Produits/Ventilation-traitement-de-l-air/VMC-collective',quality:'verified'});
  if(comete) await ensureVariant(db,{modelId:comete,name:'Comète - gamme collective',source:'https://www.atlantic-pros.fr/Produits/Ventilation-traitement-de-l-air/VMC-collective',quality:'verified',specs:[['Débit min','400','m³/h'],['Débit max','11000','m³/h'],['Type','Simple flux C4',''],['Consommation','Ultra basse consommation',''],['Application','Logement collectif neuf',''],['Régulation','Pression ajustée disponible','']]});
  const copernic=await ensureModel(db,{category:'VMC',brand:'Atlantic',name:'Copernic V',desc:'Caisson d’extraction simple flux C4, 400 à 2 500 m³/h, rénovation collective ou tertiaire.',source:'https://www.atlantic-pros.fr/Produits/Ventilation-traitement-de-l-air/VMC-collective',quality:'verified'});
  if(copernic) await ensureVariant(db,{modelId:copernic,name:'Copernic V - gamme',source:'https://www.atlantic-pros.fr/Produits/Ventilation-traitement-de-l-air/VMC-collective',quality:'verified',specs:[['Débit min','400','m³/h'],['Débit max','2500','m³/h'],['Type','Simple flux C4',''],['Application','Rénovation collective / tertiaire',''],['Régulation','Non électronique','']]});

  // PAC ATLANTIC
  const atlanticPacs=[
    ['Alfea Excellia S','PAC air/eau split chauffage seul R32','9–14','R32'],
    ['Alfea Excellia S Duo','PAC air/eau split avec ECS intégrée R32','9–14','R32'],
    ['Alfea Extensa S','PAC air/eau split chauffage seul R32','5–10','R32'],
    ['Alfea Extensa S Duo','PAC air/eau split avec ECS intégrée R32','3–10','R32'],
    ['Synea','PAC air/eau split murale avec ECS intégrée R32','3–10','R32'],
    ['Alfea M','PAC air/eau monobloc haute température','3–12',''],
    ['Alfea M Duo','PAC air/eau monobloc haute température avec ECS','3–12',''],
    ['Alfea Excellia M','PAC air/eau monobloc chauffage seul R32','6–11','R32'],
    ['Alfea Excellia Duo M','PAC air/eau monobloc avec ECS R32','6–11','R32'],
    ['Ixtra M','PAC air/eau monobloc chauffage seul','9–17','R452b'],
    ['Ixtra M Compact','PAC air/eau monobloc compacte chauffage seul','9–17','R452b']
  ];
  for(const [name,desc,range,fluid] of atlanticPacs){
    const split=name.includes(' S')||name==='Synea';
    const source=split?'https://www.atlantic-pros.fr/Produits/Pompes-a-chaleur/Pompes-a-chaleur-domestiques/Aerothermie-Split':'https://www.atlantic-pros.fr/Produits/Pompes-a-chaleur/Pompes-a-chaleur-domestiques/Aerothermie-Monobloc';
    const mid=await ensureModel(db,{category:'PAC',brand:'Atlantic',name,desc,source,quality:'verified_range'});
    if(mid) await ensureVariant(db,{modelId:mid,name:`${name} - gamme`,source,quality:'verified_range',specs:[['Plage de puissance',range,'kW'],['Architecture',split?'Split':'Monobloc',''],...(fluid?[['Fluide frigorigène',fluid,'']]:[])]});
  }

  // PAC CIAT - performances détaillées constructeur
  const ciatImage='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108465/ciat/products/heat-pumps-and-chillers/ciat-aquaciat-power-heat-pump-air-cooled-water-chiller-1.png';
  const ciatSource='https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-air/aquaciatpower-ild-r-32/';
  const aquaciat=await ensureModel(db,{category:'PAC',brand:'CIAT',name:'AQUACIAT POWER ILD R32',desc:'PAC air/eau réversible tertiaire R32 à compresseurs Scroll, puissance calorifique de gamme jusqu’à 1 040 kW.',source:ciatSource,quality:'verified',image:ciatImage});
  const perf=[[602,173,3.44,155,4.17],[700,192,3.45,171,4.01],[800,231,3.39,204,4.18],[900,250,3.47,223,4.08],[1000,269,3.48,239,4.04],[1150,310,3.57,285,4.48],[1250,329,3.58,305,4.50],[1400,378,3.55,341,4.46],[1500,397,3.57,358,4.33],[1600,431,3.54,389,4.44],[1750,458,3.53,414,4.38],[2000,523,3.57,470,4.32]];
  if(aquaciat) for(const [size,heat,scop,cool,seer] of perf) await ensureVariant(db,{modelId:aquaciat,name:`AQUACIAT POWER ILD R32 ${size}R`,source:'https://intranet.ciat.com/fichiers/customtelechargement.php?f=ciatbrochureaquaciatpowerr32en.pdf',quality:'verified',image:ciatImage,specs:[['Puissance chauffage nominale',heat,'kW'],['SCOP 30/35°C',scop,''],['Puissance froid nominale',cool,'kW'],['SEER 12/7°C',seer,''],['Fluide frigorigène','R32',''],['Compresseur','Scroll',''],['Installation','Extérieure','']]});

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_air_v1','1')`);
}
