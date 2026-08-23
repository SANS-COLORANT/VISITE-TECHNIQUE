import { createId } from './ids.js';

export const EQUIPMENT_CATEGORIES = [
  ['Pompe','💧'],['Circulateur','🔄'],['Chaudière','🔥'],['Échangeur','♨️'],['Ballon ECS','🛢️'],['Vase d’expansion','🔴'],['Adoucisseur','💎'],['Désemboueur','🧲'],['Régulation','🎛️'],['Compteur','🔢'],['Robinetterie','🔧'],['Armoire électrique','⚡'],
];
export const EQUIPMENT_BRANDS = ['Grundfos','Wilo','Lowara','KSB','Salmson','De Dietrich','Viessmann','Atlantic','Chappée','Bosch','Vaillant','Alfa Laval','SWEP','Reflex','Zilmet','BWT','Culligan','Fernox','Spirotech','Siemens','Schneider Electric','WIT','SOFREL','Kamstrup','Itron','Danfoss','Sauter','Weishaupt'];
export const EQUIPMENT_MODELS = [
 ['Circulateur','Grundfos','MAGNA3','Circulateur électronique'],['Circulateur','Grundfos','ALPHA2','Circulateur haut rendement'],['Pompe','Grundfos','TPE3','Pompe en ligne'],['Pompe','Grundfos','CR','Pompe multicellulaire verticale'],
 ['Circulateur','Wilo','Stratos MAXO','Circulateur intelligent'],['Circulateur','Wilo','Yonos MAXO','Circulateur haut rendement'],['Circulateur','Wilo','TOP-S','Circulateur à rotor noyé'],['Pompe','Wilo','CronoLine IL-E','Pompe en ligne électronique'],
 ['Circulateur','Lowara','ecocirc XL','Circulateur électronique'],['Pompe','Lowara','e-LNE','Pompe en ligne'],['Pompe','KSB','Etaline','Pompe en ligne'],['Pompe','KSB','Etanorm','Pompe monocellulaire'],['Circulateur','Salmson','Priux master','Circulateur électronique'],
 ['Chaudière','De Dietrich','C310 ECO','Chaudière gaz condensation'],['Chaudière','De Dietrich','C230 EVO','Chaudière gaz condensation'],['Chaudière','Viessmann','Vitocrossal 300','Chaudière gaz condensation'],['Chaudière','Viessmann','Vitodens 200-W','Chaudière murale condensation'],['Chaudière','Atlantic','Varfree EVO','Chaudière gaz condensation'],
 ['Échangeur','Alfa Laval','M6','Échangeur à plaques démontables'],['Échangeur','Alfa Laval','M10','Échangeur à plaques démontables'],['Échangeur','SWEP','B25T','Échangeur à plaques brasées'],
 ['Régulation','Siemens','RVL480','Régulateur de chauffage'],['Régulation','Schneider Electric','SmartX','Automate de régulation'],['Régulation','WIT','Easy','Télégestion'],['Régulation','SOFREL','S550','Télégestion'],['Compteur','Kamstrup','MULTICAL 603','Compteur d’énergie thermique'],['Compteur','Itron','CF Echo II','Compteur d’énergie thermique'],
];

const VARIANT_SEED = [
  { brand:'Atlantic', model:'Varfree EVO', variants:[
    ['Varfree EVO 150','150 kW',[['Puissance nominale','150','kW'],['Puissance mini','30','kW'],['Température départ max','90','°C'],['Pression service max','6','bar']]],
    ['Varfree EVO 250','250 kW',[['Puissance nominale','250','kW'],['Puissance mini','50','kW'],['Température départ max','90','°C'],['Pression service max','6','bar']]],
    ['Varfree EVO 350','350 kW',[['Puissance nominale','350','kW'],['Puissance mini','70','kW'],['Température départ max','90','°C'],['Pression service max','6','bar']]],
  ]},
  { brand:'Grundfos', model:'TPE3', variants:[
    ['TPE3 40-120','Pompe en ligne variable',[['DN','40','mm'],['HMT max','12','mCE'],['Variation de vitesse','Oui',''],['Alimentation','3~400','V']]],
    ['TPE3 50-120','Pompe en ligne variable',[['DN','50','mm'],['HMT max','12','mCE'],['Variation de vitesse','Oui',''],['Alimentation','3~400','V']]],
    ['TPE3 65-120','Pompe en ligne variable',[['DN','65','mm'],['HMT max','12','mCE'],['Variation de vitesse','Oui',''],['Alimentation','3~400','V']]],
  ]},
  { brand:'Grundfos', model:'MAGNA3', variants:[
    ['MAGNA3 50-120 F','Circulateur électronique',[['DN','50','mm'],['HMT max','12','mCE'],['Régulation','AUTOADAPT','']]],
  ]},
  { brand:'KSB', model:'Etaline', variants:[['Etaline 50-250','Pompe en ligne',[['DN aspiration','50','mm'],['Type','Monocellulaire','']]]]},
];

async function seedVariants(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_variants_seeded_v1'`); if(done)return;
  for(const entry of VARIANT_SEED){
    const model=await db.getFirstAsync(`SELECT m.id FROM modeles_equipement m JOIN marques_equipement b ON b.id=m.marque_id WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE`,[entry.brand,entry.model]);
    if(!model)continue;
    for(const [name,desc,specs] of entry.variants){
      let v=await db.getFirstAsync(`SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE`,[model.id,name]);
      const vid=v?.id||createId('variant');
      if(!v)await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,description) VALUES(?,?,?,?)`,[vid,model.id,name,desc]);
      const count=await db.getFirstAsync(`SELECT COUNT(*) n FROM caracteristiques_equipement WHERE variante_id=?`,[vid]);
      if(!count?.n){let order=0;for(const [k,val,u] of specs)await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),vid,k,val,u||null,order++]);}
      if(entry.brand==='Grundfos'&&entry.model==='TPE3'){
        const c=await db.getFirstAsync(`SELECT id FROM courbes_equipement WHERE variante_id=?`,[vid]);
        if(!c)await db.runAsync(`INSERT INTO courbes_equipement(id,variante_id,nom,axe_x,unite_x,axe_y,unite_y,serie) VALUES(?,?,?,?,?,?,?,?)`,[createId('curve'),vid,'Courbe H/Q à 100 %','Débit','m³/h','HMT','mCE',JSON.stringify([{x:0,y:12},{x:5,y:11.6},{x:10,y:10.5},{x:15,y:8.6},{x:20,y:5.5},{x:23,y:2.5}])]);
      }
    }
  }
  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_variants_seeded_v1','1')`);
}

export async function seedEquipmentCatalog(db){
  const categoryIds=new Map(),brandIds=new Map();
  for(let i=0;i<EQUIPMENT_CATEGORIES.length;i++){const[nom,icone]=EQUIPMENT_CATEGORIES[i];const e=await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[nom]);const id=e?.id||createId('cat');if(!e)await db.runAsync('INSERT INTO categories_equipement(id,nom,icone,ordre) VALUES(?,?,?,?)',[id,nom,icone,i]);categoryIds.set(nom,id);}
  for(const nom of EQUIPMENT_BRANDS){const e=await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[nom]);const id=e?.id||createId('brand');if(!e)await db.runAsync('INSERT INTO marques_equipement(id,nom) VALUES(?,?)',[id,nom]);brandIds.set(nom,id);}
  for(const[categorie,marque,nom,caracteristiques]of EQUIPMENT_MODELS)await db.runAsync(`INSERT OR IGNORE INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles) VALUES(?,?,?,?,?,?)`,[createId('model'),categoryIds.get(categorie),brandIds.get(marque),nom,caracteristiques,`${categorie} ${marque} ${nom}`]);
  await seedVariants(db);
}
