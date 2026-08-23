import { createId } from './ids.js';

const VERIFIED_AT = '2026-08-23';

const EXTRA_MODELS = [
  // Grundfos
  ['Pompe','Grundfos','TPE2','Pompe en ligne électronique simple','verified_range'],
  ['Pompe','Grundfos','TP','Pompe en ligne monocellulaire','catalogue'],
  ['Pompe','Grundfos','TPED','Pompe double en ligne','catalogue'],
  ['Pompe','Grundfos','NB','Pompe normalisée monocellulaire','catalogue'],
  ['Pompe','Grundfos','NBG','Pompe normalisée monocellulaire grande plage','catalogue'],
  ['Pompe','Grundfos','NBE','Pompe normalisée à vitesse variable','catalogue'],
  ['Pompe','Grundfos','NBGE','Pompe normalisée à vitesse variable','catalogue'],
  ['Pompe','Grundfos','NK','Pompe à aspiration axiale','catalogue'],
  ['Pompe','Grundfos','NKG','Pompe à aspiration axiale grande plage','catalogue'],
  ['Pompe','Grundfos','CRE','Pompe multicellulaire verticale électronique','catalogue'],
  ['Circulateur','Grundfos','MAGNA1','Circulateur électronique haut rendement','verified_range'],
  ['Circulateur','Grundfos','UPS2','Circulateur de remplacement haut rendement','catalogue'],

  // Wilo
  ['Circulateur','Wilo','Stratos MAXO-D','Circulateur double intelligent','verified_range'],
  ['Circulateur','Wilo','Stratos MAXO-Z','Circulateur ECS intelligent','verified_range'],
  ['Circulateur','Wilo','Stratos PICO','Circulateur haut rendement résidentiel','catalogue'],
  ['Circulateur','Wilo','Yonos MAXO-D','Circulateur double haut rendement','catalogue'],
  ['Circulateur','Wilo','TOP-Z','Circulateur eau potable','catalogue'],
  ['Pompe','Wilo','Stratos GIGA2.0-I','Pompe en ligne électronique haut rendement','verified_range'],
  ['Pompe','Wilo','Yonos GIGA-N','Pompe normalisée électronique','catalogue'],
  ['Pompe','Wilo','VeroLine-IPL','Pompe en ligne monocellulaire','catalogue'],
  ['Pompe','Wilo','VeroTwin-DPL','Pompe double en ligne','catalogue'],
  ['Pompe','Wilo','CronoLine-IL','Pompe en ligne','catalogue'],
  ['Pompe','Wilo','CronoBloc-BL','Pompe monobloc','catalogue'],

  // Lowara
  ['Pompe','Lowara','e-SV','Pompe multicellulaire verticale','catalogue'],
  ['Pompe','Lowara','e-NSC','Pompe normalisée monocellulaire','catalogue'],
  ['Pompe','Lowara','e-LNT','Pompe double en ligne','catalogue'],
  ['Pompe','Lowara','e-HM','Pompe multicellulaire horizontale','catalogue'],
  ['Circulateur','Lowara','ecocirc PRO','Circulateur ECS','catalogue'],
  ['Circulateur','Lowara','ecocirc XLplus','Circulateur électronique communicant','catalogue'],

  // KSB
  ['Pompe','KSB','Etabloc','Pompe monobloc normalisée','catalogue'],
  ['Pompe','KSB','Etaline-R','Pompe en ligne à moteur synchrone','catalogue'],
  ['Pompe','KSB','Etaline Z','Pompe en ligne pour eau potable','catalogue'],
  ['Pompe','KSB','MegaCPK','Pompe normalisée process','catalogue'],
  ['Circulateur','KSB','Calio','Circulateur haut rendement','catalogue'],
  ['Circulateur','KSB','Calio S','Circulateur compact haut rendement','catalogue'],
  ['Circulateur','KSB','Rio-Eco N','Circulateur électronique','catalogue'],

  // Salmson
  ['Circulateur','Salmson','Priux home','Circulateur haut rendement','catalogue'],
  ['Circulateur','Salmson','Siriux master','Circulateur électronique collectif','catalogue'],
  ['Pompe','Salmson','NXL','Pompe en ligne','catalogue'],
  ['Pompe','Salmson','JRL','Pompe en ligne double','catalogue'],

  // Chaudières
  ['Chaudière','De Dietrich','Evodens Pro AMC','Chaudière murale gaz à condensation','catalogue'],
  ['Chaudière','De Dietrich','Innovens Pro MCA','Chaudière murale gaz à condensation','catalogue'],
  ['Chaudière','De Dietrich','C340','Chaudière gaz condensation grande puissance','catalogue'],
  ['Chaudière','De Dietrich','C640','Cascade/chaudière condensation grande puissance','catalogue'],
  ['Chaudière','Viessmann','Vitocrossal 100 CIB','Chaudière gaz condensation compacte','verified_range'],
  ['Chaudière','Viessmann','Vitocrossal 200 CRU','Chaudière gaz condensation au sol','verified_range'],
  ['Chaudière','Viessmann','Vitocrossal 300 CR3B','Chaudière gaz condensation grande puissance','verified_range'],
  ['Chaudière','Viessmann','Vitodens 200-W','Chaudière murale gaz condensation','verified_range'],
  ['Chaudière','Viessmann','Vitodens 222-F','Chaudière compacte gaz condensation','catalogue'],
  ['Chaudière','Viessmann','Vitoplex 200','Chaudière basse température','catalogue'],
  ['Chaudière','Atlantic','Varbloc','Chaudière gaz collective','catalogue'],
  ['Chaudière','Chappée','Power HT+','Chaudière gaz condensation collective','catalogue'],
  ['Chaudière','Chappée','Power HT-A','Chaudière gaz condensation au sol','catalogue'],
  ['Chaudière','Chappée','Luna Platinum+','Chaudière murale gaz condensation','catalogue'],
  ['Chaudière','Bosch','Condens 5000 W','Chaudière murale gaz condensation','catalogue'],
  ['Chaudière','Bosch','Uni Condens 8000 F','Chaudière gaz condensation grande puissance','catalogue'],
  ['Chaudière','Bosch','Condens 9000i W','Chaudière murale gaz condensation','catalogue'],
  ['Chaudière','Vaillant','ecoTEC plus','Chaudière murale gaz condensation','catalogue'],
  ['Chaudière','Vaillant','ecoTEC exclusive','Chaudière murale gaz condensation premium','catalogue'],
  ['Chaudière','Vaillant','ecoCRAFT exclusiv','Chaudière gaz condensation grande puissance','catalogue'],
  ['Chaudière','Weishaupt','WTC-GW','Chaudière murale gaz condensation','catalogue'],
  ['Chaudière','Weishaupt','WTC-GB','Chaudière sol gaz condensation','catalogue'],
  ['Chaudière','Weishaupt','Thermo Condens-A','Chaudière gaz condensation','catalogue'],

  // Échangeurs
  ['Échangeur','Alfa Laval','M3','Échangeur à plaques démontables compact','catalogue'],
  ['Échangeur','Alfa Laval','M15','Échangeur à plaques démontables','catalogue'],
  ['Échangeur','Alfa Laval','T5','Échangeur à plaques démontables','catalogue'],
  ['Échangeur','Alfa Laval','T10','Échangeur à plaques démontables','catalogue'],
  ['Échangeur','Alfa Laval','TL10','Échangeur à plaques haute efficacité','catalogue'],
  ['Échangeur','Alfa Laval','TS6','Échangeur à plaques sanitaire/thermique','catalogue'],
  ['Échangeur','SWEP','B5T','Échangeur à plaques brasées','catalogue'],
  ['Échangeur','SWEP','B8T','Échangeur à plaques brasées','catalogue'],
  ['Échangeur','SWEP','B10T','Échangeur à plaques brasées','catalogue'],
  ['Échangeur','SWEP','B35T','Échangeur à plaques brasées','catalogue'],
  ['Échangeur','SWEP','B60','Échangeur à plaques brasées','catalogue'],

  // Expansion / hydraulique
  ['Vase d’expansion','Reflex','G','Vase d’expansion à membrane remplaçable','catalogue'],
  ['Vase d’expansion','Reflex','S','Vase d’expansion solaire','catalogue'],
  ['Vase d’expansion','Zilmet','Hydro-Pro','Vase à membrane eau sanitaire','catalogue'],
  ['Vase d’expansion','Zilmet','Ultra-Pro','Vase à membrane','catalogue'],
  ['Désemboueur','Spirotech','SpiroTrap','Séparateur de boues','catalogue'],
  ['Séparateur d’air','Spirotech','SpiroVent','Séparateur de microbulles','catalogue'],
  ['Désemboueur','Spirotech','SpiroCross','Séparateur hydraulique combiné','catalogue'],
  ['Désemboueur','Fernox','TF1 Total Filter','Filtre magnétique','catalogue'],
  ['Désemboueur','Fernox','TF1 Sigma','Filtre magnétique compact','catalogue'],
  ['Séparateur d’air','Caleffi','DISCAL','Séparateur d’air','catalogue'],
  ['Désemboueur','Caleffi','DISCALDIRTMAG','Séparateur air/boues magnétique','catalogue'],
  ['Désemboueur','Caleffi','SEP4','Séparateur hydraulique multifonction','catalogue'],

  // Traitement d'eau
  ['Adoucisseur','BWT','Perla','Adoucisseur domestique/collectif','catalogue'],
  ['Adoucisseur','BWT','Rondomat Duo','Adoucisseur duplex collectif','catalogue'],
  ['Adoucisseur','BWT','Bewamat','Adoucisseur collectif','catalogue'],
  ['Adoucisseur','Culligan','Medallist','Adoucisseur volumétrique','catalogue'],
  ['Adoucisseur','Culligan','Global Cabinet','Adoucisseur compact','catalogue'],

  // Vannes / servomoteurs Danfoss
  ['Vanne 2 voies','Danfoss','VF2','Vanne 2 voies à brides','catalogue'],
  ['Vanne 3 voies','Danfoss','VF3','Vanne 3 voies à brides','catalogue'],
  ['Vanne 2 voies','Danfoss','AB-QM','Vanne d’équilibrage et régulation indépendante de la pression','catalogue'],
  ['Servomoteur','Danfoss','AME 55','Servomoteur modulant','catalogue'],
  ['Servomoteur','Danfoss','AME 655','Servomoteur modulant forte poussée','catalogue'],
  ['Servomoteur','Danfoss','AMV 435','Servomoteur 3 points','catalogue'],

  // Siemens
  ['Vanne 2 voies','Siemens','VVF53','Vanne 2 voies à brides PN25','catalogue'],
  ['Vanne 3 voies','Siemens','VXF53','Vanne 3 voies à brides PN25','catalogue'],
  ['Servomoteur','Siemens','SKD','Servomoteur électrohydraulique','catalogue'],
  ['Servomoteur','Siemens','SKB','Servomoteur électrohydraulique forte poussée','catalogue'],
  ['Servomoteur','Siemens','SSA','Servomoteur compact pour petites vannes','catalogue'],
  ['Régulation','Siemens','RVD','Régulateur chauffage urbain / ECS','catalogue'],
  ['Régulation','Siemens','Climatix','Automate CVC programmable','catalogue'],

  // Belimo
  ['Vanne 2 voies','Belimo','Energy Valve','Vanne de régulation énergétique communicante','catalogue'],
  ['Vanne 2 voies','Belimo','EPIV','Vanne indépendante de la pression électronique','catalogue'],
  ['Vanne 2 voies','Belimo','R2..','Vanne à boisseau sphérique 2 voies','catalogue'],
  ['Vanne 3 voies','Belimo','R3..','Vanne à boisseau sphérique 3 voies','catalogue'],
  ['Servomoteur','Belimo','LR24A-SR','Servomoteur rotatif 24 V modulant','catalogue'],
  ['Servomoteur','Belimo','NR24A-SR','Servomoteur rotatif 24 V modulant','catalogue'],
  ['Servomoteur','Belimo','SR24A-SR','Servomoteur rotatif 24 V modulant forte puissance','catalogue'],

  // Sauter
  ['Vanne 2 voies','Sauter','VUN','Vanne 2 voies de régulation','catalogue'],
  ['Vanne 3 voies','Sauter','VUP','Vanne 3 voies de régulation','catalogue'],
  ['Servomoteur','Sauter','AVM105','Servomoteur de vanne','catalogue'],
  ['Servomoteur','Sauter','AVM115','Servomoteur de vanne','catalogue'],
  ['Servomoteur','Sauter','AVM234','Servomoteur de vanne grande course','catalogue'],
  ['Régulation','Sauter','modu680-AS','Automate d’automatisation de bâtiment','catalogue'],

  // Schneider
  ['Régulation','Schneider Electric','SpaceLogic AS-P','Serveur d’automatisation bâtiment','catalogue'],
  ['Régulation','Schneider Electric','SpaceLogic MP-C','Contrôleur programmable CVC','catalogue'],
  ['Régulation','Schneider Electric','SpaceLogic RP-C','Contrôleur terminal communicant','catalogue'],
  ['Régulation','Schneider Electric','TAC Xenta 401','Automate GTB','catalogue'],

  // WIT / SOFREL
  ['Régulation','WIT','WITbox','Passerelle / télégestion','catalogue'],
  ['Régulation','WIT','REDY','Automate / télégestion énergétique','catalogue'],
  ['Régulation','SOFREL','S4W','Télégestion eau/énergie','catalogue'],
  ['Régulation','SOFREL','LS42','Télégestion compacte','catalogue'],
  ['Régulation','SOFREL','LT-US','Télérelève / transmission','catalogue'],

  // Comptage
  ['Compteur','Kamstrup','MULTICAL 403','Compteur d’énergie thermique compact','catalogue'],
  ['Compteur','Kamstrup','MULTICAL 803','Compteur d’énergie thermique multi-circuit','catalogue'],
  ['Compteur','Kamstrup','ULTRAFLOW 54','Capteur de débit ultrasonique','catalogue'],
  ['Compteur','Itron','CF 51','Calculateur d’énergie thermique','catalogue'],
  ['Compteur','Itron','Integral-V MaXX','Compteur d’énergie compact','catalogue'],

  // Instrumentation / Honeywell / WIKA
  ['Manomètre','WIKA','213.53','Manomètre à tube de Bourdon rempli liquide','catalogue'],
  ['Sonde','WIKA','A-10','Transmetteur de pression','catalogue'],
  ['Sonde','WIKA','S-20','Transmetteur de pression industriel','catalogue'],
  ['Sonde','WIKA','TR10','Sonde de température à résistance','catalogue'],
  ['Vanne 2 voies','Honeywell','V5011','Vanne de régulation 2 voies','catalogue'],
  ['Vanne 3 voies','Honeywell','V5013','Vanne de régulation 3 voies','catalogue'],
  ['Servomoteur','Honeywell','ML7420','Servomoteur modulant','catalogue'],
  ['Servomoteur','Honeywell','ML7421','Servomoteur modulant','catalogue'],
  ['Détendeur','Honeywell','D06F','Réducteur de pression','catalogue'],
];

async function getCategoryId(db, name){return (await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[name]))?.id;}
async function getBrandId(db, name){return (await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[name]))?.id;}

async function ensureModel(db,[category,brand,name,desc,quality]){
  const categoryId=await getCategoryId(db,category), brandId=await getBrandId(db,brand);
  if(!categoryId||!brandId)return;
  const existing=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[categoryId,brandId,name]);
  if(existing){
    await db.runAsync('UPDATE modeles_equipement SET actif=1, caracteristiques=COALESCE(caracteristiques,?), data_quality=CASE WHEN data_quality IS NULL OR data_quality=\'catalogue\' THEN ? ELSE data_quality END, verified_at=CASE WHEN ? LIKE \'verified%\' THEN COALESCE(verified_at,?) ELSE verified_at END WHERE id=?',[desc,quality,quality,VERIFIED_AT,existing.id]);
    return;
  }
  await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[createId('model'),categoryId,brandId,name,desc,`${category} ${brand} ${name}`,quality,quality.startsWith('verified')?VERIFIED_AT:null]);
}

export async function seedEquipmentCatalogBreadth(db){
  const done=await db.getFirstAsync("SELECT value FROM _meta WHERE key='equipment_catalog_breadth_v1'");
  if(done)return;
  for(const model of EXTRA_MODELS) await ensureModel(db,model);
  await db.runAsync("INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_breadth_v1','1')");
}
