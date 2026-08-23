import { createId } from './ids.js';

const VERIFIED_AT='2026-08-23';

async function ensureCategory(db,nom,icone,ordre){
  let row=await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('cat');
  if(!row) await db.runAsync('INSERT INTO categories_equipement(id,nom,icone,ordre) VALUES(?,?,?,?)',[id,nom,icone,ordre]);
  else await db.runAsync('UPDATE categories_equipement SET actif=1,icone=?,ordre=? WHERE id=?',[icone,ordre,id]);
  return id;
}
async function ensureBrand(db,nom){
  let row=await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('brand');
  if(!row) await db.runAsync('INSERT INTO marques_equipement(id,nom) VALUES(?,?)',[id,nom]);
  else await db.runAsync('UPDATE marques_equipement SET actif=1 WHERE id=?',[id]);
  return id;
}
async function ensureModel(db,{category,brand,name,desc,source,image,quality='verified'}){
  const cfg={
    'Groupe eau glacée':['❄️',83],
    'PAC':['♨️',82],
    'Aéroréfrigérant':['🌬️',84],
    'Ventilo-convecteur':['💨',85],
  }[category]||['⚙️',90];
  const cid=await ensureCategory(db,category,cfg[0],cfg[1]);
  const bid=await ensureBrand(db,brand);
  let row=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[cid,bid,name]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,image_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,[id,cid,bid,name,desc,`${category} ${brand} ${name} eau glacée chiller groupe froid hydronique`,source||null,image||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=?,source_uri=COALESCE(?,source_uri),image_uri=COALESCE(?,image_uri),data_quality=?,verified_at=? WHERE id=?`,[desc,source||null,image||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  return id;
}
async function ensureVariant(db,{modelId,name,source,image,quality='verified',specs=[]}){
  let row=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,source_uri,image_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?)`,[id,modelId,name,source||null,image||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,source_uri=COALESCE(?,source_uri),image_uri=COALESCE(?,image_uri),data_quality=?,verified_at=? WHERE id=?`,[source||null,image||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  if(specs.length){
    await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);
    let ordre=0; for(const [k,v,u] of specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,k,String(v),u||null,ordre++]);
  }
  if(source){
    const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]);
    if(!d) await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Page / documentation constructeur',source]);
  }
  return id;
}

export async function seedEquipmentCatalogHydronics(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_hydronics_v1'`); if(done)return;

  // --- TRANE ---
  const rtafSrc='https://www.trane.com/Resources/Partners/a41a3b61-a631-48b1-a8d8-3f25d0783c05/documents/RTAF-SLB003-GB_1020.pdf';
  const rtaf=await ensureModel(db,{category:'Groupe eau glacée',brand:'Trane',name:'Sintesis Prime RTAF',desc:'Groupe d’eau glacée air/eau à compresseurs à vis, grande plage de puissance, options récupération et free-cooling.',source:rtafSrc});
  await ensureVariant(db,{modelId:rtaf,name:'RTAF - gamme EMEA',source:rtafSrc,specs:[['Puissance frigorifique min','300','kW'],['Puissance frigorifique max','2090','kW'],['Compresseur','Vis',''],['Température eau départ standard','5 à 27','°C'],['Température eau glycolée basse','jusqu’à -12','°C'],['Température extérieure standard','-10 à 46','°C'],['Option haute température extérieure','jusqu’à 55','°C'],['Option basse température extérieure','jusqu’à -18','°C'],['Options hydrauliques','Kit double pompe / Smart Flow',''],['Récupération de chaleur','Partielle ou totale',''],['Free cooling','Disponible','']]});

  const cxafSrc='https://trane.eu/fr/equipment/product-details.html?prodId=216';
  const cxaf=await ensureModel(db,{category:'PAC',brand:'Trane',name:'Sintesis Advantage CXAF',desc:'PAC air/eau réversible à compresseurs Scroll, plateforme Sintesis et régulation Tracer Symbio 800.',source:cxafSrc});
  await ensureVariant(db,{modelId:cxaf,name:'CXAF - gamme EMEA',source:cxafSrc,specs:[['Puissance frigorifique min','128','kW'],['Puissance frigorifique max','680','kW'],['Puissance calorifique min','127','kW'],['Puissance calorifique max','700','kW'],['Compresseur','Scroll',''],['Fluides','R454B / R410A selon version',''],['Régulation','Tracer Symbio 800',''],['Protocoles','BACnet / Modbus / LonMark',''],['Versions rendement','SE / HE',''],['Versions acoustiques','SN / LN / XLN','']]});

  const cmafSrc='https://trane.eu/fr/about-trane/story-details.html?storyId=41';
  const cmaf=await ensureModel(db,{category:'PAC',brand:'Trane',name:'Sintesis Balance CMAF',desc:'Unité multi-tubes pour production simultanée de chaud et froid avec récupération de chaleur.',source:cmafSrc,quality:'verified_range'});
  await ensureVariant(db,{modelId:cmaf,name:'CMAF - gamme',source:cmafSrc,quality:'verified_range',specs:[['Type','Unité multi-tubes',''],['Fonction','Chauffage et refroidissement simultanés',''],['Récupération de chaleur','Intégrée',''],['Application','Boucles hydroniques chaud/froid','']]});

  const traneWater=['RTWF XStream','RTWD / RTUD','RTWL','RTSF City','GVWF XStream eXcellent'];
  for(const name of traneWater){
    const mid=await ensureModel(db,{category:'Groupe eau glacée',brand:'Trane',name,desc:'Groupe d’eau glacée à condensation par eau / source eau de la gamme Trane EMEA.',source:'https://www.trane.com/commercial/north-america/us/en/products-systems/smart-building-technology/building-controls-solutions/trane-controls-software-downloads.html',quality:'verified_range'});
    await ensureVariant(db,{modelId:mid,name:`${name} - gamme`,source:'https://www.trane.com/commercial/north-america/us/en/products-systems/smart-building-technology/building-controls-solutions/trane-controls-software-downloads.html',quality:'verified_range',specs:[['Condensation','Par eau',''],['Application','Eau glacée tertiaire / industrie','']]});
  }

  // --- CIAT : groupes froids / PAC eau-eau ---
  const aquaciatImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108465/ciat/products/heat-pumps-and-chillers/ciat-aquaciat-power-heat-pump-air-cooled-water-chiller-1.png';
  const ldSrc='https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-air/aquaciat-power-ld-r-32/';
  const ld=await ensureModel(db,{category:'Groupe eau glacée',brand:'CIAT',name:'AQUACIAT POWER LD R32',desc:'Groupe d’eau glacée air/eau R32 à compresseurs Scroll, 19 tailles, free cooling et récupération de chaleur en option.',source:ldSrc,image:aquaciatImg});
  await ensureVariant(db,{modelId:ld,name:'AQUACIAT POWER LD R32 - gamme',source:ldSrc,image:aquaciatImg,specs:[['Puissance frigorifique min','170','kW'],['Puissance frigorifique max','940','kW'],['Tailles','602R à 3500R',''],['Fluide frigorigène','R32',''],['Compresseur','Scroll',''],['Évaporateur','Plaques brasées',''],['Température eau glacée option glycol','jusqu’à -8','°C'],['Température extérieure','-20 à +52','°C'],['Free cooling','Partiel / total en option',''],['Récupération partielle','Eau chaude jusqu’à 80','°C'],['Récupération totale','Eau chaude jusqu’à 65','°C'],['Régulation','CONNECT TOUCH',''],['Communication GTC','Modbus/JBus ; LON/BACnet en option','']]});

  const powerImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108553/ciat/products/heat-pumps-and-chillers/ciat-powerciat-air-cooled-water-chiller.png';
  const powerSrc='https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-air/powerciat-lx-he-xe/';
  const power=await ensureModel(db,{category:'Groupe eau glacée',brand:'CIAT',name:'POWERCIAT LX HE / XE',desc:'Groupe d’eau glacée air/eau à vis R134a, forte puissance, récupération totale et eau glycolée basse température.',source:powerSrc,image:powerImg});
  await ensureVariant(db,{modelId:power,name:'POWERCIAT LX HE/XE - gamme',source:powerSrc,image:powerImg,specs:[['Puissance frigorifique min','273','kW'],['Puissance frigorifique max','1493','kW'],['Fluide frigorigène','R134a',''],['Compresseur','Vis semi-hermétique',''],['Évaporateur','Multitubulaire',''],['Eau glacée basse température','jusqu’à -15','°C'],['Température extérieure','-20 à +55','°C'],['Récupération totale','Eau chaude jusqu’à 60','°C'],['SEER','jusqu’à 4.7',''],['SEPR','jusqu’à 6.2',''],['Régulation','CONNECT TOUCH','']]});

  const hydroImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108601/ciat/products/heat-pumps-and-chillers/ciat-hydrociat-lw-heat-pump-water-cooled-chiller-1.png';
  const hydroSrc='https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-eau/hydrociat-lw-st-he/';
  const hydro=await ensureModel(db,{category:'Groupe eau glacée',brand:'CIAT',name:'HYDROCIAT LW ST / HE',desc:'Groupe d’eau glacée / PAC eau-eau à vis R134a, 31 tailles.',source:hydroSrc,image:hydroImg});
  await ensureVariant(db,{modelId:hydro,name:'HYDROCIAT LW ST/HE - gamme',source:hydroSrc,image:hydroImg,specs:[['Puissance frigorifique min','273','kW'],['Puissance frigorifique max','1756','kW'],['Puissance calorifique min','317','kW'],['Puissance calorifique max','1989','kW'],['Fluide frigorigène','R134a',''],['Compresseur','Vis',''],['Tailles','708 à 4628',''],['Versions','ST / HE',''],['Fonction','Froid ou chaud avec réversibilité hydraulique','']]});

  const waterRanges=[
    ['DYNACIAT LG','25','190','29','230','R410A','Scroll','https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-eau/dynaciat-lg/','https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1687772629/ciat/products/heat-pumps-and-chillers/ciat-dynaciat-lg-heat-pump-air-cooled-water-chiller-3.png'],
    ['DYNACIAT POWER LG','200','700','230','800','R410A','Scroll','https://www.ciat.com/fr/fr/produits-et-systemes/pompes-a-chaleur-et-groupes-d-eau-glacee/unites-a-condensation-par-eau/dynaciatpower-lg/','https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108572/ciat/products/heat-pumps-and-chillers/ciat-dynaciat-power-heat-pump-water-cooled-chiller-1.png']
  ];
  for(const [name,cmin,cmax,hmin,hmax,fluid,comp,src,img] of waterRanges){
    const mid=await ensureModel(db,{category:'Groupe eau glacée',brand:'CIAT',name,desc:'Groupe d’eau glacée / PAC eau-eau pour applications tertiaires et industrielles.',source:src,image:img});
    await ensureVariant(db,{modelId:mid,name:`${name} - gamme`,source:src,image:img,specs:[['Puissance frigorifique min',cmin,'kW'],['Puissance frigorifique max',cmax,'kW'],['Puissance calorifique min',hmin,'kW'],['Puissance calorifique max',hmax,'kW'],['Fluide frigorigène',fluid,''],['Compresseur',comp,''],['Condensation','Par eau','']]});
  }

  // CIAT dry coolers and hydronic terminals
  const operaImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685954841/ciat/products/drycoolers-condensers/ciat-opera-drycooler-air-cooled-condenser-1.png';
  const operaSrc='https://www.ciat.com/fr/fr/produits-et-systemes/aerorefrigerants/aerorefrigerants/opera/';
  const opera=await ensureModel(db,{category:'Aéroréfrigérant',brand:'CIAT',name:'OPERA',desc:'Aéroréfrigérant / condenseur à air modulaire jusqu’à 1100 kW, 1 à 14 ventilateurs.',source:operaSrc,image:operaImg});
  await ensureVariant(db,{modelId:opera,name:'OPERA - gamme',source:operaSrc,image:operaImg,specs:[['Puissance max','1100','kW'],['Nombre ventilateurs','1 à 14',''],['Moteurs','AC ou EC',''],['Diamètre hélice','800 ou 910','mm'],['Batterie','Tubes cuivre / ailettes aluminium',''],['Raccordements','Brides inox',''],['Applications','Free cooling / eau glycolée / condensation',''],['Installation','Extérieure','']]});

  const vextraSrc='https://www.ciat.com/fr/fr/produits-et-systemes/aerorefrigerants/aerorefrigerants/';
  const vextraImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1683792179/ciat/products/drycoolers-condensers/ciat-vextra-drycooler-1.png';
  const vextra=await ensureModel(db,{category:'Aéroréfrigérant',brand:'CIAT',name:'VEXTRA',desc:'Aéroréfrigérant CIAT grande puissance pour circuits eau/eau glycolée.',source:vextraSrc,image:vextraImg});
  await ensureVariant(db,{modelId:vextra,name:'VEXTRA - gamme',source:vextraSrc,image:vextraImg,specs:[['Puissance min','100','kW'],['Puissance max','2000','kW'],['Application','Refroidissement eau / eau glycolée','']]});

  const coadisSrc='https://www.ciat.com/fr/fr/produits-et-systemes/unites-de-confort/unites-de-confort/coadis-line-600/';
  const coadisImg='https://images.carriercms.com/image/upload/w_auto,c_lfill,q_auto,f_auto/v1685108697/ciat/products/comfort-units-hysys-system/ciat-coadis-line-600-1-way-cassette.png';
  const coadis=await ensureModel(db,{category:'Ventilo-convecteur',brand:'CIAT',name:'COADIS LINE 600',desc:'Cassette hydraulique à effet Coanda pour réseaux 2 ou 4 tubes.',source:coadisSrc,image:coadisImg});
  await ensureVariant(db,{modelId:coadis,name:'COADIS LINE 600 - gamme',source:coadisSrc,image:coadisImg,specs:[['Puissance frigorifique','1 à 5','kW'],['Puissance calorifique','1,7 à 6','kW'],['Nombre de tailles','7',''],['Réseaux hydrauliques','2 tubes / 2 tubes + électrique / 4 tubes',''],['Filtration','EPURE',''],['Moteurs','HEE 2-10V / HEE TOR / AC','']]});

  // --- CARRIER ---
  const carrierAir=[
    ['AquaForce 30KAV','490','1100','R134a','Vis vitesse variable','https://www.carrier.com/commercial/en/eu/products/air-conditioning/air-cooled-chillers/30kav/'],
    ['AquaForce 30KAVZE','370','1350','R1234ze','Vis vitesse variable','https://www.carrier.com/commercial/en/eu/products/air-conditioning/air-cooled-chillers/30kavze/'],
    ['AquaForce Vision 30KAVIZE','530','1300','R1234ze','Vis vitesse variable','https://www.carrier.com/commercial/en/eu/products/air-conditioning/air-cooled-chillers/30kavize/']
  ];
  for(const [name,min,max,fluid,comp,src] of carrierAir){
    const mid=await ensureModel(db,{category:'Groupe eau glacée',brand:'Carrier',name,desc:'Groupe d’eau glacée air/eau AquaForce pour applications tertiaires et industrielles.',source:src});
    await ensureVariant(db,{modelId:mid,name:`${name} - gamme`,source:src,specs:[['Puissance frigorifique min',min,'kW'],['Puissance frigorifique max',max,'kW'],['Fluide frigorigène',fluid,''],['Compresseur',comp,''],['Condensation','Air',''],['Récupération de chaleur','Options disponibles',''],['Gestion énergie','Intégrée selon version','']]});
  }

  const carrierWater=[
    ['AquaForce 30XW / 30XW-P','270','1760','R134a','Vis vitesse fixe','https://www.carrier.com/commercial/en/eu/products/air-conditioning/water-cooled-chillers/30xw-30xw-p/'],
    ['AquaForce 30XW-PZE','275','1125','R1234ze / R515B','Vis vitesse fixe','https://www.carrier.com/commercial/en/eu/products/air-conditioning/water-cooled-chillers/30xw-pze/'],
    ['AquaForce 30XW-V','590','1740','R134a','Vis vitesse variable','https://www.carrier.com/commercial/en/eu/products/air-conditioning/water-cooled-chillers/30xw-v/'],
    ['AquaForce 30XW-VZE','450','1635','R1234ze / R515B','Vis vitesse variable','https://www.carrier.com/commercial/en/eu/products/air-conditioning/water-cooled-chillers/30xw-vze/']
  ];
  for(const [name,min,max,fluid,comp,src] of carrierWater){
    const mid=await ensureModel(db,{category:'Groupe eau glacée',brand:'Carrier',name,desc:'Groupe d’eau glacée à condensation par eau AquaForce.',source:src});
    await ensureVariant(db,{modelId:mid,name:`${name} - gamme`,source:src,specs:[['Puissance frigorifique min',min,'kW'],['Puissance frigorifique max',max,'kW'],['Fluide frigorigène',fluid,''],['Compresseur',comp,''],['Condensation','Par eau',''],['Application','Tertiaire / industrie / data center','']]});
  }

  const idroSrc='https://www.carrier.com/commercial/en/eu/products/air-treatment/hydraulic-terminal-units/cassette/42gw/';
  const idro=await ensureModel(db,{category:'Ventilo-convecteur',brand:'Carrier',name:'Idrofan 42GW',desc:'Cassette hydraulique 4 voies pour réseaux eau glacée/eau chaude.',source:idroSrc});
  await ensureVariant(db,{modelId:idro,name:'42GW - gamme',source:idroSrc,specs:[['Puissance frigorifique min','1.5','kW'],['Puissance frigorifique max','8.5','kW'],['Puissance calorifique min','1.9','kW'],['Puissance calorifique max','10.3','kW'],['Configurations','2 tubes / 2 tubes + résistance / 4 tubes',''],['Moteurs','AC 3 vitesses / LEC',''],['Formats','600x600 et 900x900','']]});

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_hydronics_v1','1')`);
}
