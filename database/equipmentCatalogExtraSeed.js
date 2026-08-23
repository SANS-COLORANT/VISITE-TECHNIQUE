import { createId } from './ids.js';

const VERIFIED_AT = '2026-08-23';

async function categoryId(db, nom){ return (await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]))?.id; }
async function brandId(db, nom){ return (await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]))?.id; }
async function ensureModel(db,{category,brand,name,desc,source,quality='verified'}){
  const cid=await categoryId(db,category), bid=await brandId(db,brand); if(!cid||!bid)return null;
  let row=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[cid,bid,name]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?)`,[id,cid,bid,name,desc,`${category} ${brand} ${name}`,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=?,source_uri=?,data_quality=?,verified_at=? WHERE id=?`,[desc,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  return id;
}
async function ensureVariant(db,{modelId,name,ref,desc,source,quality='verified',specs=[]}){
  let row=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[id,modelId,name,ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=?,description=?,source_uri=?,data_quality=?,verified_at=? WHERE id=?`,[ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);
  let order=0; for(const [k,v,u] of specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,k,String(v),u||null,order++]);
  if(source){const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]);if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Documentation / page constructeur',source]);}
  return id;
}

export async function seedEquipmentCatalogExtra(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_verified_batch_2'`); if(done)return;

  // Correction des anciennes variantes de démonstration Atlantic qui mélangeaient Varfree et Varmax.
  const atlantic=await brandId(db,'Atlantic');
  if(atlantic){
    const vf=await db.getFirstAsync(`SELECT id FROM modeles_equipement WHERE marque_id=? AND nom='Varfree EVO' COLLATE NOCASE`,[atlantic]);
    if(vf){
      const bad=await db.getAllAsync(`SELECT id FROM variantes_equipement WHERE modele_id=? AND nom IN ('Varfree EVO 150','Varfree EVO 250','Varfree EVO 350')`,[vf.id]);
      for(const r of bad) await db.runAsync('DELETE FROM variantes_equipement WHERE id=?',[r.id]);
      await db.runAsync(`UPDATE modeles_equipement SET caracteristiques=?,source_uri=?,data_quality='verified_range',verified_at=? WHERE id=?`,['Chaudière murale gaz à condensation inox — gamme actuelle 8 modèles de 35 à 150 kW','https://www.atlantic-pros.fr/Produits/Chaudieres/Chaudieres-collectives',VERIFIED_AT,vf.id]);
      for(const p of [35,80,100,120,150]) await ensureVariant(db,{modelId:vf.id,name:`Varfree EVO ${p}`,desc:'Puissance explicitement référencée par Atlantic',source:'https://www.atlantic-pros.fr/Produits/Chaudieres/Chaudieres-collectives',quality:'verified_range',specs:[['Puissance de gamme',p,'kW'],...(p>=80?[['Pression de service max annoncée','6','bar']]:[])]});
    }
  }

  const varmax=await ensureModel(db,{category:'Chaudière',brand:'Atlantic',name:'Varmax 2',desc:'Chaudière sol gaz à condensation inox — 12 modèles de 120 à 600 kW',source:'https://www.atlantic-pros.fr/Produits/Chaudieres/Chaudieres-collectives',quality:'verified_range'});
  if(varmax) await ensureVariant(db,{modelId:varmax,name:'Varmax 2 450',desc:'Référence installée sur plusieurs opérations Atlantic documentées',source:'https://www.atlantic-pros.fr/Nos-references-chantiers/References-chantiers/RESIDENCE-JEAN-SICARD',specs:[['Puissance nominale','450','kW'],['Construction','Sol inox',''],['Technologie','Gaz condensation','']]});

  const condensinox=await ensureModel(db,{category:'Chaudière',brand:'Atlantic',name:'Condensinox',desc:'Chaudière sol gaz à condensation inox — 5 modèles 40 à 100 kW',source:'https://www.atlantic-pros.fr/Produits/Chaudieres/Chaudieres-collectives',quality:'verified_range'});
  if(condensinox) for(const p of [40,60,70,80,100]) await ensureVariant(db,{modelId:condensinox,name:`Condensinox ${p}`,source:'https://www.atlantic-pros.fr/Produits/Chaudieres/Chaudieres-collectives',quality:'verified_range',specs:[['Puissance de gamme',p,'kW'],['Construction','Sol inox',''],['Technologie','Gaz condensation','']]});

  const c330=await ensureModel(db,{category:'Chaudière',brand:'De Dietrich',name:'C330 ECO',desc:'Chaudière gaz condensation grande puissance',source:'https://www.dedietrich-thermique.fr/content/download/12807/108160/version/1/file/NOT-125470-11.pdf',quality:'verified_range'});
  if(c330) for(const p of [280,350,430,500,570,650]) await ensureVariant(db,{modelId:c330,name:`C330 ECO ${p}`,source:'https://www.dedietrich-thermique.fr/content/download/12807/108160/version/1/file/NOT-125470-11.pdf',quality:'verified_range',specs:[['Classe de puissance',p,'kW'],['Technologie','Gaz condensation','']]});

  const dirtmag=await ensureModel(db,{category:'Désemboueur',brand:'Caleffi',name:'DIRTMAG 5463',desc:'Pot de décantation magnétique laiton, série 5463',source:'https://www.caleffi.com/fr-fr/pot-de-d%C3%A9cantation-avec-aimants-5463-caleffi-546305'});
  if(dirtmag){
    for(const [ref,raccord] of [['546305','G 3/4 F'],['546306','G 1 F'],['546309','G 2 F']]) await ensureVariant(db,{modelId:dirtmag,name:`DIRTMAG ${ref}`,ref,source:'https://www.caleffi.com/fr-fr/pot-de-d%C3%A9cantation-avec-aimants-5463-caleffi-546305',specs:[['Raccord',raccord,''],['Pression max','10','bar'],['Température fluide','0–110','°C'],['Matériau','Laiton','']]});
  }

  const itron=await ensureModel(db,{category:'Compteur',brand:'Itron',name:'CF Echo II',desc:'Compteur d’énergie thermique à mesure ultrason',source:'https://na.itron.com/documents/44647/3815900/cf%2Becho%2BII_pb_FR_09.13.pdf/361b4275-e334-b6ab-91ab-544fa2f31d64?t=1711248939569&version=1.1'});
  if(itron) await ensureVariant(db,{modelId:itron,name:'CF Echo II DN15-50',source:'https://emea.itron.com/o/commerce-media/accounts/-1/attachments/3816104',specs:[['Plage DN','15–50','mm'],['Température eau','0–90','°C'],['ΔT mesurable','3–90','K'],['Protection calculateur','IP54',''],['Température ambiante','5–55','°C'],['Alimentation option secteur','230 V / 50 Hz',''],['Communication','M-Bus / radio / sorties impulsions','']]});

  const wika=await ensureModel(db,{category:'Manomètre',brand:'WIKA',name:'111.10',desc:'Manomètre à tube de Bourdon série standard',source:'https://www.wika.com/media/Data-sheets/Pressure/Pressure-gauges/ds_111.10_en_us.pdf'});
  if(wika) for(const range of ['0–4','0–6','0–10']) await ensureVariant(db,{modelId:wika,name:`111.10 ${range} bar`,source:'https://www.wika.com/media/Data-sheets/Pressure/Pressure-gauges/ds_111.10_en_us.pdf',quality:'verified_range',specs:[['Plage',range,'bar'],['Norme','EN 837-1 / ASME B40.100',''],['Élément','Tube de Bourdon',''],['Matériaux en contact','Alliage cuivre',''],['Température fluide max','60','°C']]});

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_verified_batch_2','1')`);
}
