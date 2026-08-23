import { createId } from './ids.js';

export const EQUIPMENT_CATEGORIES = [
  ['Pompe','💧'],['Circulateur','🔄'],['Chaudière','🔥'],['Échangeur','♨️'],['Ballon ECS','🛢️'],
  ['Vase d’expansion','🔴'],['Désemboueur','🧲'],['Séparateur d’air','💨'],['Vanne 2 voies','◐'],['Vanne 3 voies','◒'],
  ['Servomoteur','⚙️'],['Régulation','🎛️'],['Compteur','🔢'],['Sonde','🌡️'],['Manomètre','🧭'],
  ['Filtre','🧰'],['Soupape','🛡️'],['Détendeur','↘️'],['Adoucisseur','💎'],['Robinetterie','🔧'],['Armoire électrique','⚡'],
];

export const EQUIPMENT_BRANDS = [
  'Grundfos','Wilo','Lowara','KSB','Salmson','De Dietrich','Viessmann','Atlantic','Chappée','Bosch','Vaillant','Weishaupt',
  'Alfa Laval','SWEP','Reflex','Zilmet','BWT','Culligan','Fernox','Spirotech','Caleffi','Siemens','Schneider Electric',
  'WIT','SOFREL','Kamstrup','Itron','Danfoss','Sauter','Belimo','WIKA','Honeywell',
];

const MODELS = [
  ['Circulateur','Grundfos','MAGNA3','Circulateur électronique haut rendement','https://api.grundfos.com/literature/Grundfosliterature-5991455.pdf','verified'],
  ['Circulateur','Grundfos','ALPHA2','Circulateur haut rendement',null,'catalogue'],
  ['Pompe','Grundfos','TPE3','Pompe en ligne à vitesse variable',null,'verified_range'],
  ['Pompe','Grundfos','CR','Pompe multicellulaire verticale',null,'catalogue'],
  ['Circulateur','Wilo','Stratos MAXO','Circulateur intelligent haut rendement','https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171','verified'],
  ['Circulateur','Wilo','Yonos MAXO','Circulateur haut rendement',null,'catalogue'],
  ['Circulateur','Wilo','TOP-S','Circulateur à rotor noyé',null,'catalogue'],
  ['Pompe','Wilo','CronoLine IL-E','Pompe en ligne électronique',null,'catalogue'],
  ['Circulateur','Lowara','ecocirc XL','Circulateur électronique',null,'catalogue'],
  ['Pompe','Lowara','e-LNE','Pompe en ligne',null,'catalogue'],
  ['Pompe','KSB','Etaline','Pompe en ligne monocellulaire',null,'catalogue'],
  ['Pompe','KSB','Etanorm','Pompe normalisée monocellulaire',null,'catalogue'],
  ['Circulateur','Salmson','Priux master','Circulateur électronique',null,'catalogue'],

  ['Chaudière','Viessmann','Vitocrossal 300 CI3','Chaudière gaz condensation tertiaire 81 à 634 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300-ci3.html','verified'],
  ['Chaudière','Bosch','Condens 7000 F','Chaudière gaz condensation au sol 75 à 300 kW','https://www.bosch-industrial.com/gb/media/country_pool/documents/condens_7000_f_fp_installer_brochure_8716119919_c_04.25.pdf','verified'],
  ['Chaudière','De Dietrich','C310 ECO','Chaudière gaz condensation au sol',null,'catalogue'],
  ['Chaudière','De Dietrich','C230 EVO','Chaudière gaz condensation au sol',null,'catalogue'],
  ['Chaudière','Atlantic','Varfree EVO','Chaudière gaz condensation',null,'catalogue'],
  ['Chaudière','Weishaupt','Thermo Condens WTC-GB','Chaudière gaz condensation',null,'catalogue'],

  ['Échangeur','Alfa Laval','M6','Échangeur à plaques démontables','https://assets.alfalaval.com/documents/pbe3eff2f/alfa-laval-semi-welded-m6-product-leaflet-en.pdf','verified'],
  ['Échangeur','Alfa Laval','M10','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','SWEP','B25T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B80T','Échangeur à plaques brasées',null,'catalogue'],

  ['Vanne 2 voies','Danfoss','VRB2','Vanne de régulation 2 voies PN16','https://assets.danfoss.com/documents/latest/77221/AI157486475794ru-RU0102.pdf','verified'],
  ['Vanne 3 voies','Danfoss','VRB3','Vanne de régulation 3 voies PN16','https://assets.danfoss.com/documents/latest/77221/AI157486475794ru-RU0102.pdf','verified'],
  ['Vanne 2 voies','Danfoss','AVDO','Vanne de bypass différentiel automatique','https://assets.danfoss.com/documents/latest/107450/AI008986402751en-US0602.pdf','verified'],
  ['Servomoteur','Danfoss','AME 435','Servomoteur modulant 24 V','https://assets.danfoss.com/documents/latest/99887/AF168586478742en-GB0401.pdf','verified'],
  ['Vanne 2 voies','Belimo','H6.. globe 2 voies','Vanne à soupape 2 voies à brides','https://www.belimo.com/fr/shop/en_GB/Valves/Globe-Valves','verified'],
  ['Vanne 3 voies','Belimo','H3..S globe 3 voies','Vanne à soupape 3 voies', 'https://www.belimo.com/fr/shop/en_GB/p?code=H325S-L','verified'],
  ['Servomoteur','Belimo','NV24A-MP','Servomoteur vanne à soupape 24 V MP-Bus/0-10 V',null,'verified_range'],
  ['Servomoteur','Belimo','LV24A-MP','Servomoteur vanne à soupape 24 V MP-Bus/0-10 V','https://www.belimo.com/fr/shop/en_GB/p?code=H325S-L','verified'],
  ['Vanne 2 voies','Siemens','VVF42','Vanne 2 voies à brides PN16','https://cache.industry.siemens.com/dl/files/888/109789888/att_1046647/v6/A6V10424583.pdf?download=true','verified'],
  ['Vanne 3 voies','Siemens','VXF42','Vanne 3 voies à brides PN16','https://cache.industry.siemens.com/dl/files/888/109789888/att_1046647/v6/A6V10424583.pdf?download=true','verified'],
  ['Servomoteur','Siemens','SAX','Servomoteurs électromécaniques pour Acvatix','https://cache.industry.siemens.com/dl/files/888/109789888/att_1046647/v6/A6V10424583.pdf?download=true','verified'],

  ['Vase d’expansion','Reflex','N','Vase d’expansion chauffage à membrane','https://reflex-winkelmann.com/en-gb/products/8216300','verified'],
  ['Vase d’expansion','Reflex','NG','Vase d’expansion chauffage à membrane soudé','https://reflex-winkelmann.com/fr/produits/7001500','verified'],
  ['Vase d’expansion','Zilmet','Cal-Pro','Vase d’expansion chauffage',null,'catalogue'],
  ['Désemboueur','Spirotech','SpiroTrap Magnet','Séparateur de boues magnétique acier','https://www.spirotech.com/-/odsassets/resource/2129?culture=en&r=F','verified'],
  ['Désemboueur','Fernox','TF1 Omega','Filtre magnétique',null,'catalogue'],
  ['Désemboueur','Caleffi','DIRTMAG','Désemboueur magnétique',null,'catalogue'],

  ['Compteur','Kamstrup','MULTICAL 603','Calculateur d’énergie thermique', 'https://www.kamstrup.com/en-en/heat-solutions/meters-devices/meters/multical-603','catalogue'],
  ['Compteur','Itron','CF Echo II','Compteur d’énergie thermique',null,'catalogue'],
  ['Régulation','Siemens','RVL480','Régulateur chauffage',null,'catalogue'],
  ['Régulation','Schneider Electric','SmartX','Automate/régulation CVC',null,'catalogue'],
  ['Régulation','WIT','Easy','Télégestion CVC',null,'catalogue'],
  ['Régulation','SOFREL','S550','Télégestion',null,'catalogue'],
  ['Manomètre','WIKA','111.10','Manomètre à tube de Bourdon',null,'catalogue'],
  ['Filtre','Honeywell','FF06','Filtre à tamis',null,'catalogue'],
  ['Adoucisseur','BWT','AQA perla','Adoucisseur volumétrique',null,'catalogue'],
  ['Adoucisseur','Culligan','HE','Adoucisseur volumétrique',null,'catalogue'],
];

const VARIANTS = [
  ...[81,115,159,242,320,479,563,634].map(p=>({brand:'Viessmann',model:'Vitocrossal 300 CI3',name:`Vitocrossal 300 CI3 ${p}`,desc:'Chaudière gaz condensation',source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300-ci3.html',quality:'verified',specs:[['Puissance nominale 50/30°C',String(p),'kW'],['Pression service max','6','bar'],['Température départ max','95','°C'],['Température sécurité max','110','°C'],['Compatibilité hydrogène','jusqu’à 20','% H₂'],['Plage de modulation','jusqu’à 1:10','']]})),
  ...[75,100,150,200,250,300].map(p=>({brand:'Bosch',model:'Condens 7000 F',name:`Condens 7000 F ${p}`,desc:'Chaudière gaz condensation',source:'https://www.bosch-industrial.com/gb/media/country_pool/documents/condens_7000_f_fp_installer_brochure_8716119919_c_04.25.pdf',quality:'verified',specs:[['Puissance nominale 50/30°C',String(p),'kW'],['Pression service max','6','bar'],['Température départ max','95','°C']]})),

  {brand:'Wilo',model:'Stratos MAXO',name:'Stratos MAXO 32/0,5-8 PN6/10',ref:'2164578',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171',quality:'verified',specs:[['DN','32',''],['PN','10','bar'],['Alimentation','1~230 V',''],['IEE','≤ 0,18',''],['Entraxe','220','mm'],['Poids','14,2','kg']]},
  {brand:'Wilo',model:'Stratos MAXO',name:'Stratos MAXO 32/0,5-10 PN6/10',ref:'2164579',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171',quality:'verified',specs:[['DN','32',''],['PN','10','bar'],['Alimentation','1~230 V',''],['IEE','≤ 0,18',''],['Entraxe','220','mm'],['Poids','14,5','kg']]},
  {brand:'Wilo',model:'Stratos MAXO',name:'Stratos MAXO 32/0,5-12 PN6/10',ref:'2164580',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171',quality:'verified',specs:[['DN','32',''],['PN','10','bar'],['Alimentation','1~230 V',''],['IEE','≤ 0,18',''],['Entraxe','220','mm'],['Poids','14,5','kg']]},
  {brand:'Wilo',model:'Stratos MAXO',name:'Stratos MAXO 40/0,5-12 PN6/10',ref:'2164584',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171',quality:'verified',specs:[['DN','40',''],['PN','10','bar'],['Alimentation','1~230 V',''],['IEE','≤ 0,17',''],['Entraxe','250','mm'],['Poids','19,9','kg']]},
  {brand:'Wilo',model:'Stratos MAXO',name:'Stratos MAXO 50/0,5-12 PN6/10',ref:'2164589',source:'https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171/2164589',quality:'verified',specs:[['DN','50',''],['PN','10','bar'],['Débit max','35,3','m³/h'],['HMT max','13,1','m'],['Température fluide min','-10','°C'],['Température fluide max','110','°C'],['Alimentation','1~230 V 50/60 Hz',''],['P1 min','10','W'],['P1 max','560','W'],['Vitesse min','650','tr/min'],['Vitesse max','3350','tr/min'],['Entraxe','280','mm'],['Poids net','18,8','kg']],docs:[['Page produit','https://wilo.com/fr/fr/Produits-Applications/fr/produits/stratos-maxo_id171/2164589']]},

  ...['25-40','25-60','25-80','25-100','25-120','32-40','32-60','32-80','32-100','32-120','40-40','40-60','40-80','40-100','40-120','40-150','40-180','50-40','50-60','50-80','50-100','50-120','50-150','50-180','65-40','65-60','65-80','65-100','65-120','65-150','80-40','80-60','80-80','80-100','80-120','100-40','100-60','100-80','100-100','100-120'].map(n=>({brand:'Grundfos',model:'MAGNA3',name:`MAGNA3 ${n}${Number(n.split('-')[0])>=40?' F':''}`,desc:'Référence de la gamme MAGNA3 fonte',source:'https://api.grundfos.com/literature/Grundfosliterature-5991455.pdf',quality:'verified_range',specs:[['DN',n.split('-')[0],''],['Classe HMT',`${Number(n.split('-')[1])/10}`,'m']]})),

  ...[[15,.63,'065Z0171','065Z0151'],[15,1,'065Z0172','065Z0152'],[15,1.6,'065Z0173','065Z0153'],[15,2.5,'065Z0174','065Z0154'],[15,4,'065Z0175','065Z0155'],[20,6.3,'065Z0176','065Z0156'],[25,10,'065Z0177','065Z0157'],[32,16,'065Z0178','065Z0158'],[40,25,'065Z0179','065Z0159'],[50,40,'065Z0180','065Z0160']].flatMap(([dn,kvs,ref2,ref3])=>[
    {brand:'Danfoss',model:'VRB2',name:`VRB2 DN${dn} Kvs ${kvs}`,ref:ref2,source:'https://assets.danfoss.com/documents/latest/77221/AI157486475794ru-RU0102.pdf',quality:'verified',specs:[['Voies','2',''],['DN',String(dn),''],['Kvs',String(kvs),'m³/h'],['PN','16','bar'],['Température max','130','°C']]},
    {brand:'Danfoss',model:'VRB3',name:`VRB3 DN${dn} Kvs ${kvs}`,ref:ref3,source:'https://assets.danfoss.com/documents/latest/77221/AI157486475794ru-RU0102.pdf',quality:'verified',specs:[['Voies','3',''],['DN',String(dn),''],['Kvs',String(kvs),'m³/h'],['PN','16','bar'],['Température max','130','°C']]},
  ]),
  ...[15,20,25].map(dn=>({brand:'Danfoss',model:'AVDO',name:`AVDO ${dn}`,source:'https://assets.danfoss.com/documents/latest/107450/AI008986402751en-US0602.pdf',quality:'verified',specs:[['DN',String(dn),''],['Plage réglage Δp','0,05–0,5','bar'],['Δp max','0,5','bar'],['PN','10','bar'],['Température max','120','°C']]})),
  {brand:'Danfoss',model:'AME 435',name:'AME 435',ref:'082H016100',source:'https://assets.danfoss.com/documents/latest/99887/AF168586478742en-GB0401.pdf',quality:'verified',specs:[['Alimentation','24 V AC/DC',''],['Commande','modulante',''],['Compatibilité vannes','VRB/VRG/VF/VL DN15-50','']]},

  {brand:'Belimo',model:'H6.. globe 2 voies',name:'H6050X25-S2 + SV24A-SR-TPC',source:'https://www.belimo.com/fr/shop/en_GB/Valves/Globe-Valves/H6050X25-S2%2BSV24A-SR-TPC/p?code=H6050X25-S2%2BSV24A-SR-TPC',quality:'verified',specs:[['Voies','2',''],['Kvs','25','m³/h'],['Température fluide','5–150','°C'],['Pression fermeture','500','kPa'],['Signal','2–10 V',''],['Alimentation','24 V AC/DC',''],['Protection','IP54','']]},
  {brand:'Belimo',model:'H6.. globe 2 voies',name:'H6080X90-SP2 + NV24A-MP-TPC',source:'https://www.belimo.com/fr/shop/en_GB/Valves/Globe-Valves/H6080X90-SP2%2BNV24A-MP-TPC/p?code=H6080X90-SP2%2BNV24A-MP-TPC',quality:'verified',specs:[['Voies','2',''],['Kvs','90','m³/h'],['Température fluide','5–150','°C'],['Pression fermeture','1600','kPa'],['Commande','MP-Bus / 2–10 V',''],['Alimentation','24 V AC/DC',''],['Protection','IP54','']]},
  {brand:'Belimo',model:'H6.. globe 2 voies',name:'H6100X125-SP2 + NVC24A-MP-TPC',source:'https://www.belimo.com/fr/shop/en_GB/Valves/Globe-Valves/H6100X125-SP2%2BNVC24A-MP-TPC/p?code=H6100X125-SP2%2BNVC24A-MP-TPC',quality:'verified',specs:[['Voies','2',''],['Kvs','125','m³/h'],['Température fluide','5–150','°C'],['Pression fermeture','1000','kPa'],['Commande','MP-Bus / 2–10 V',''],['Alimentation','24 V AC/DC',''],['Protection','IP54','']]},
  {brand:'Belimo',model:'H3..S globe 3 voies',name:'H325S-L',source:'https://www.belimo.com/fr/shop/en_GB/p?code=H325S-L',quality:'verified',specs:[['Voies','3',''],['Actionneur compatible','LV24A-MP / LV24A-SR / LV24A',''],['Force actionneur','500','N'],['Course actionneur','15','mm'],['Protection actionneur','IP54','']]},
  {brand:'Belimo',model:'LV24A-MP',name:'LV24A-MP-TPC',source:'https://www.belimo.com/fr/shop/en_GB/p?code=H325S-L',quality:'verified',specs:[['Alimentation','24 V AC/DC',''],['Commande','MP-Bus / 2–10 V',''],['Force','500','N'],['Course','15','mm'],['Temps course','150','s'],['Protection','IP54','']]},

  {brand:'Siemens',model:'SAX',name:'SAX61.03',ref:'S55150-A100',source:'https://cache.industry.siemens.com/dl/files/888/109789888/att_1046647/v6/A6V10424583.pdf?download=true',quality:'verified',specs:[['Course','20','mm'],['Force','800','N'],['Alimentation','24 V AC/DC',''],['Signal','0–10 V / 4–20 mA',''],['Temps course','30','s']]},
  {brand:'Siemens',model:'SAX',name:'SAX31.03',ref:'S55150-A106',source:'https://cache.industry.siemens.com/dl/files/888/109789888/att_1046647/v6/A6V10424583.pdf?download=true',quality:'verified',specs:[['Course','20','mm'],['Force','800','N'],['Alimentation','230 V AC',''],['Commande','3 points',''],['Temps course','30','s']]},

  {brand:'Reflex',model:'N',name:'Reflex N 100',ref:'8216300',source:'https://reflex-winkelmann.com/en-gb/products/8216300',quality:'verified',specs:[['Volume nominal','100','L'],['Volume utile max','90','L'],['Pression max','6','bar'],['Pré-gonflage usine','1,5','bar'],['Température système max','120','°C'],['Température service max','70','°C'],['Raccord','R 1"',''],['Diamètre','512','mm'],['Hauteur','669','mm'],['Poids','15,84','kg']]},
  {brand:'Reflex',model:'N',name:'Reflex N 200',ref:'8213300',source:'https://reflex-winkelmann.com/en/products/8213300',quality:'verified',specs:[['Volume nominal','200','L'],['Volume utile max','180','L'],['Pression max','6','bar'],['Pré-gonflage usine','1,5','bar'],['Température système max','120','°C'],['Raccord','R 1"',''],['Diamètre','634','mm'],['Hauteur','767','mm'],['Poids','23,8','kg']]},
  {brand:'Reflex',model:'N',name:'Reflex N 300',ref:'8215300',source:'https://reflex-winkelmann.com/en/products/8215300',quality:'verified',specs:[['Volume nominal','300','L'],['Volume utile max','270','L'],['Pression max','6','bar'],['Pré-gonflage usine','1,5','bar'],['Température système max','120','°C'],['Raccord','R 1"',''],['Diamètre','634','mm'],['Poids','30','kg']]},
  {brand:'Reflex',model:'NG',name:'Reflex NG 100',ref:'7001500',source:'https://reflex-winkelmann.com/fr/produits/7001500',quality:'verified',specs:[['Volume nominal','100','L'],['Volume utile max','88','L'],['Pression max','6','bar'],['Pré-gonflage usine','1,5','bar'],['Température système max','120','°C'],['Diamètre','480','mm'],['Hauteur','675','mm'],['Poids','11,5','kg']]},

  ...[[50,12.5,3,5],[65,20,2.9,5],[80,27,3.1,17],[100,47,3.7,17],[125,72,4.2,50],[150,108,4.9,50],[200,180,5.8,105],[250,288,7,210],[300,405,7.8,350]].map(([dn,q,dp,vol])=>({brand:'Spirotech',model:'SpiroTrap Magnet',name:`SpiroTrap Magnet DN${dn}`,source:'https://www.spirotech.com/-/odsassets/resource/2129?culture=en&r=F',quality:'verified',specs:[['DN',String(dn),''],['Débit nominal',String(q),'m³/h'],['ΔP au débit nominal',String(dp),'kPa'],['Volume corps',String(vol),'L'],['Pression max','10','bar'],['Température fluide','0–110','°C'],['Vitesse nominale','1,5','m/s']]})),
];

async function ensureCategory(db, ids, nom, icone, ordre){
  const row=await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('cat');
  if(!row) await db.runAsync('INSERT INTO categories_equipement(id,nom,icone,ordre) VALUES(?,?,?,?)',[id,nom,icone,ordre]);
  else await db.runAsync('UPDATE categories_equipement SET actif=1,icone=? WHERE id=?',[icone,id]);
  ids.set(nom,id);
}
async function ensureBrand(db, ids, nom){
  const row=await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]);
  const id=row?.id||createId('brand');
  if(!row) await db.runAsync('INSERT INTO marques_equipement(id,nom) VALUES(?,?)',[id,nom]); else await db.runAsync('UPDATE marques_equipement SET actif=1 WHERE id=?',[id]);
  ids.set(nom,id);
}
async function ensureModel(db, categoryIds, brandIds, [categorie,marque,nom,desc,source,quality]){
  let row=await db.getFirstAsync(`SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE`,[categoryIds.get(categorie),brandIds.get(marque),nom]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?)`,[id,categoryIds.get(categorie),brandIds.get(marque),nom,desc,`${categorie} ${marque} ${nom}`,source||null,quality||'catalogue',quality?.startsWith('verified')?'2026-08-23':null]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=COALESCE(?,caracteristiques),source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=? WHERE id=?`,[desc||null,source||null,quality||'catalogue',quality?.startsWith('verified')?'2026-08-23':null,id]);
  return id;
}
async function seedRichVariants(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_rich_v2'`); if(done)return;
  for(const v of VARIANTS){
    const model=await db.getFirstAsync(`SELECT m.id FROM modeles_equipement m JOIN marques_equipement b ON b.id=m.marque_id WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE`,[v.brand,v.model]);
    if(!model) continue;
    let row=await db.getFirstAsync(`SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE`,[model.id,v.name]);
    const id=row?.id||createId('variant');
    if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[id,model.id,v.name,v.ref||null,v.desc||null,v.source||null,v.quality||'catalogue',v.quality?.startsWith('verified')?'2026-08-23':null]);
    else await db.runAsync(`UPDATE variantes_equipement SET reference=COALESCE(?,reference),description=COALESCE(?,description),source_uri=COALESCE(?,source_uri),data_quality=?,verified_at=? WHERE id=?`,[v.ref||null,v.desc||null,v.source||null,v.quality||'catalogue',v.quality?.startsWith('verified')?'2026-08-23':null,id]);
    const n=await db.getFirstAsync('SELECT COUNT(*) n FROM caracteristiques_equipement WHERE variante_id=?',[id]);
    if(!n?.n && v.specs){let order=0;for(const [cle,valeur,unite] of v.specs) await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,cle,valeur,unite||null,order++]);}
    if(v.docs) for(const [nom,uri] of v.docs){const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,uri]);if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur',nom,uri]);}
  }
  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_rich_v2','1')`);
}

export async function seedEquipmentCatalog(db){
  const categoryIds=new Map(),brandIds=new Map();
  for(let i=0;i<EQUIPMENT_CATEGORIES.length;i++){const[nom,icone]=EQUIPMENT_CATEGORIES[i];await ensureCategory(db,categoryIds,nom,icone,i);}
  for(const nom of EQUIPMENT_BRANDS) await ensureBrand(db,brandIds,nom);
  for(const model of MODELS) await ensureModel(db,categoryIds,brandIds,model);
  await seedRichVariants(db);
}
