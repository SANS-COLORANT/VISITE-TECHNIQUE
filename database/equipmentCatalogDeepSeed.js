import { createId } from './ids.js';

const VERIFIED_AT = '2026-08-23';

async function brandId(db, nom){ return (await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]))?.id; }
async function categoryId(db, nom){ return (await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]))?.id; }
async function ensureModel(db,{brand,category,name,desc,source,quality='verified'}){
  const bid=await brandId(db,brand), cid=await categoryId(db,category); if(!bid||!cid)return null;
  let row=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE marque_id=? AND categorie_id=? AND nom=? COLLATE NOCASE',[bid,cid,name]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?)`,[id,cid,bid,name,desc||null,`${brand} ${category} ${name}`,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=COALESCE(?,caracteristiques),source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=? WHERE id=?`,[desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  return id;
}
async function ensureVariant(db,{modelId,name,ref,desc,source,quality='verified',specs=[]}){
  if(!modelId)return null;
  let row=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[id,modelId,name,ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=COALESCE(?,reference),description=COALESCE(?,description),source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=? WHERE id=?`,[ref||null,desc||null,source||null,quality,quality.startsWith('verified')?VERIFIED_AT:null,id]);
  await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);
  let order=0; for(const [cle,valeur,unite] of specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,cle,String(valeur),unite||null,order++]);
  if(source){ const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]); if(!d) await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Documentation / page constructeur',source]); }
  return id;
}

export async function seedEquipmentCatalogDeep(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_deep_v1'`); if(done)return;

  const wiloSource='https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171';
  const wilo=await ensureModel(db,{brand:'Wilo',category:'Circulateur',name:'Stratos MAXO',desc:'Circulateur intelligent premium à rotor noyé, moteur à aimant permanent, régulation électronique.',source:wiloSource});
  await ensureVariant(db,{modelId:wilo,name:'Stratos MAXO 65/0,5-12 PN6/10',ref:'2164594',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171/2164594',specs:[
    ['DN','65',''],['PN','10','bar'],['Débit max','48,3','m³/h'],['HMT max','14,1','m'],['Température fluide min','-10','°C'],['Température fluide max','110','°C'],['IEE','≤ 0,17',''],['Alimentation','1~230 V ±10%, 50/60 Hz',''],['Courant max','4,17','A'],['P2','826','W'],['P1 min','20','W'],['P1 max','950','W'],['Vitesse min','500','tr/min'],['Vitesse max','3000','tr/min'],['Classe isolation','F',''],['Protection','IPX4D',''],['Entraxe','340','mm'],['Corps','Fonte grise',''],['Roue','PPS-GF40',''],['Arbre','Acier inoxydable',''],['Poids net','30,5','kg']
  ]});
  await ensureVariant(db,{modelId:wilo,name:'Stratos MAXO 80/0,5-12 PN10',ref:'2164599',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171/2164599',specs:[
    ['DN','80',''],['PN','10','bar'],['Débit max','68,6','m³/h'],['HMT max','14,0','m'],['Température fluide min','-10','°C'],['Température fluide max','110','°C'],['IEE','≤ 0,17',''],['Alimentation','1~230 V ±10%, 50/60 Hz',''],['Courant max','6,13','A'],['P2','1212','W'],['P1 min','20','W'],['P1 max','1410','W'],['Vitesse min','500','tr/min'],['Vitesse max','3050','tr/min'],['Classe isolation','F',''],['Protection','IPX4D',''],['Entraxe','360','mm'],['Poids net','32,9','kg']
  ]});
  await ensureVariant(db,{modelId:wilo,name:'Stratos MAXO 80/0,5-12 PN16',ref:'2186285',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171/2186285',specs:[
    ['DN','80',''],['PN','16','bar'],['Débit max','68,6','m³/h'],['HMT max','14,0','m'],['Température fluide min','-10','°C'],['Température fluide max','110','°C'],['IEE','≤ 0,17',''],['Alimentation','1~230 V ±10%, 50/60 Hz',''],['Courant max','6,13','A'],['P2','1212','W'],['P1 min','20','W'],['P1 max','1410','W'],['Vitesse min','500','tr/min'],['Vitesse max','3050','tr/min'],['Protection','IPX4D',''],['Entraxe','360','mm'],['Poids net','32,9','kg']
  ]});

  const viessSource='https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300-ci3.html';
  const viessPdf='https://www.viessmann.fr/content/dam/public-brands/fr/produits/chauffage-gaz/KP_Vitocrossal%20300_Typ%20CI3%2003-2025_FR.pdf/_jcr_content/renditions/original./KP_Vitocrossal%20300_Typ%20CI3%2003-2025_FR.pdf';
  const viess=await ensureModel(db,{brand:'Viessmann',category:'Chaudière',name:'Vitocrossal 300 CI3',desc:'Chaudière gaz à condensation pour collectif, tertiaire et bâtiments publics, 81 à 634 kW.',source:viessSource});
  for(const p of [81,115,159,242,320,479,563,634]) await ensureVariant(db,{modelId:viess,name:`Vitocrossal 300 CI3 ${p}`,source:viessPdf,specs:[
    ['Puissance nominale 50/30°C',p,'kW'],['Pression service max','6','bar'],['Température départ max','95','°C'],['Température sécurité max','110','°C'],['Rendement normalisé','jusqu’à 97,7','% PCS'],['Plage modulation','jusqu’à 1:10',''],['Compatibilité H₂','jusqu’à 20','%'],['Échangeur','Inox-Crossal acier inoxydable',''],['Brûleur','MatriX avec sonde O₂ auto-étalonnage',''],['Cascade max','8 appareils / 5072','kW']
  ]});

  const swepSource='https://www.swepgroup.com/content/dam/swep/product-datasheets/SWEP-B25T-fr.pdf';
  const swep=await ensureModel(db,{brand:'SWEP',category:'Échangeur',name:'B25T',desc:'Échangeur à plaques brasées pour applications eau/eau et condensation.',source:swepSource});
  await ensureVariant(db,{modelId:swep,name:'B25T standard',source:swepSource,specs:[
    ['Nombre de plaques max','140',''],['Débit volumétrique max','9','m³/h'],['Volume canal côté 1','0,111','dm³'],['Volume canal côté 2','0,111','dm³'],['Plaques','Acier inoxydable 304',''],['Brasage','Cuivre',''],['Largeur B','119','mm'],['Hauteur A','526','mm'],['Entraxe vertical C','479','mm'],['Entraxe horizontal D','72','mm']
  ]});

  const spiroSource='https://www.spirotech.com/-/odsassets/resource/14829?culture=en&r=F&v=2026-03-10t09-35-46-773';
  const spiro=await ensureModel(db,{brand:'Spirotech',category:'Désemboueur',name:'SpiroTrap Magnet',desc:'Séparateur de boues magnétique acier pour installations hydrauliques.',source:spiroSource});
  await ensureVariant(db,{modelId:spiro,name:'SpiroTrap Magnet DN100 PN16',ref:'BE100FM',source:spiroSource,specs:[
    ['DN','100',''],['Raccord','Bride',''],['PN','16','bar'],['Vitesse nominale','1,5','m/s'],['Séparation particules','à partir de 5','µm'],['Aimant intégré','Oui',''],['Compatibilité glycol','50/50 éthylène glycol / eau',''],['Vidange en service','Oui','']
  ]});

  const kamSource='https://www.kamstrup.com/fr-fr/product-centre/multical-603';
  const kam=await ensureModel(db,{brand:'Kamstrup',category:'Compteur',name:'MULTICAL 603',desc:'Calculateur d’énergie thermique modulaire avec enregistreur de données intégré.',source:kamSource});
  await ensureVariant(db,{modelId:kam,name:'MULTICAL 603',source:kamSource,specs:[
    ['Enregistreur de données','Année / mois / jour / heure / minute',''],['Mémoire','EEPROM permanente',''],['Usage','Chauffage / refroidissement / diagnostics',''],['Documentation constructeur','23 documents disponibles sur la page produit','']
  ]});

  const boschSource='https://www.bosch-industrial.com/fr/media/country_pool/industrial/service/documentation-technique-chaudieres-a-condensation/dtc_6720884532_01_pd_c7000f.pdf';
  const bosch=await ensureModel(db,{brand:'Bosch',category:'Chaudière',name:'Condens 7000 F',desc:'Chaudière gaz à condensation au sol GC7000F 75 à 300.',source:boschSource});
  for(const p of [75,100,150,200,250,300]) await ensureVariant(db,{modelId:bosch,name:`Condens 7000 F ${p}`,source:boschSource,quality:'verified_range',specs:[['Classe de puissance',p,'kW'],['Technologie','Gaz condensation au sol','']]});

  const danfSource='https://assets.danfoss.com/documents/latest/81412/AI176686475301en-010901.pdf';
  await ensureModel(db,{brand:'Danfoss',category:'Vanne 2 voies',name:'VF 2',desc:'Vanne à siège 2 voies PN16 pour réseaux hydrauliques.',source:danfSource,quality:'verified_range'});
  await ensureModel(db,{brand:'Danfoss',category:'Vanne 3 voies',name:'VF 3',desc:'Vanne à siège 3 voies PN16 pour réseaux hydrauliques.',source:danfSource,quality:'verified_range'});

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_deep_v1','1')`);
}
