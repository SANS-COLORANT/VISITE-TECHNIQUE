import { createId } from './ids.js';

const VERIFIED_AT = '2026-08-23';

async function modelId(db, brand, model){
  return (await db.getFirstAsync(`SELECT m.id FROM modeles_equipement m JOIN marques_equipement b ON b.id=m.marque_id WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE`,[brand,model]))?.id;
}
async function ensureModel(db,{category,brand,name,desc,source}){
  const c=await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE',[category]);
  const b=await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE',[brand]);
  if(!c||!b)return null;
  let row=await db.getFirstAsync('SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',[c.id,b.id,name]);
  const id=row?.id||createId('model');
  if(!row) await db.runAsync(`INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?,?)`,[id,c.id,b.id,name,desc,`${category} ${brand} ${name}`,source,'verified',VERIFIED_AT]);
  else await db.runAsync(`UPDATE modeles_equipement SET actif=1,caracteristiques=?,source_uri=?,data_quality='verified',verified_at=? WHERE id=?`,[desc,source,VERIFIED_AT,id]);
  return id;
}
async function ensureVariant(db,{modelId,name,ref,desc,source,specs=[]}){
  let row=await db.getFirstAsync('SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE',[modelId,name]);
  const id=row?.id||createId('variant');
  if(!row) await db.runAsync(`INSERT INTO variantes_equipement(id,modele_id,nom,reference,description,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?,?,?)`,[id,modelId,name,ref||null,desc||null,source||null,'verified',VERIFIED_AT]);
  else await db.runAsync(`UPDATE variantes_equipement SET actif=1,reference=?,description=?,source_uri=?,data_quality='verified',verified_at=? WHERE id=?`,[ref||null,desc||null,source||null,VERIFIED_AT,id]);
  if(specs.length){await db.runAsync('DELETE FROM caracteristiques_equipement WHERE variante_id=?',[id]);let o=0;for(const [k,v,u] of specs)await db.runAsync(`INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,[createId('spec'),id,k,String(v),u||null,o++]);}
  if(source){const d=await db.getFirstAsync('SELECT id FROM documents_equipement WHERE variante_id=? AND uri=?',[id,source]);if(!d)await db.runAsync(`INSERT INTO documents_equipement(id,variante_id,type,nom,uri) VALUES(?,?,?,?,?)`,[createId('doc'),id,'Source constructeur','Documentation constructeur',source]);}
}

export async function seedEquipmentCatalogDeep3(db){
  const done=await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_deep_3'`); if(done)return;

  const yonos=await modelId(db,'Wilo','Yonos MAXO');
  if(yonos){
    const src='https://wilo.com/fr/fr/Produits-Applications/fr/produits/yonos-maxo_id155';
    await db.runAsync(`UPDATE modeles_equipement SET source_uri=?,data_quality='verified',verified_at=?,caracteristiques=? WHERE id=?`,[src,VERIFIED_AT,'Circulateur haut rendement pour chauffage, climatisation, refroidissement et applications industrielles fermées. Modes Δp-v, Δp-c et vitesses fixes.',yonos]);
    const refs=[
      ['Yonos MAXO 25/0,5-7 PN10','2120639','G 1½','180','≤ 0,20','10'],
      ['Yonos MAXO 30/0,5-7 PN10',null,'G 2','180','≤ 0,20','10'],
      ['Yonos MAXO 30/0,5-10 PN10',null,'G 2','180','≤ 0,20','10'],
      ['Yonos MAXO 30/0,5-12 PN10',null,'G 2','180','≤ 0,20','10'],
      ['Yonos MAXO 32/0,5-7 PN6/10',null,'DN 32','220','≤ 0,20','10'],
      ['Yonos MAXO 32/0,5-10 PN6/10',null,'DN 32','220','≤ 0,20','10'],
      ['Yonos MAXO 40/0,5-8 PN6/10',null,'DN 40','250','≤ 0,20','10'],
      ['Yonos MAXO 40/0,5-12 PN6/10',null,'DN 40','250','≤ 0,20','10'],
      ['Yonos MAXO 50/0,5-8 PN6/10',null,'DN 50','280','≤ 0,20','10'],
      ['Yonos MAXO 50/0,5-12 PN6/10',null,'DN 50','280','≤ 0,20','10'],
      ['Yonos MAXO 65/0,5-12 PN6/10',null,'DN 65','340','≤ 0,20','10'],
      ['Yonos MAXO 80/0,5-12 PN6',null,'DN 80','360','≤ 0,20','6'],
      ['Yonos MAXO 100/0,5-12 PN6',null,'DN 100','360','≤ 0,20','6'],
    ];
    for(const [name,ref,connection,length,iee,pn] of refs) await ensureVariant(db,{modelId:yonos,name,ref,source:src,specs:[['Raccordement',connection,''],['Entraxe',length,'mm'],['IEE',iee,''],['Pression service max',pn,'bar'],['Alimentation','1~230 V 50/60 Hz',''],['Température fluide','-20 à +110','°C'],['Protection','IP X4D',''],['Corps de pompe','Fonte grise avec revêtement cataphorèse',''],['Arbre','Acier inoxydable',''],['Roue','Matière plastique','']]});
  }

  const spiro=await modelId(db,'Spirotech','SpiroTrap Magnet');
  if(spiro){
    const src='https://www.spirotech.com/-/odsassets/resource/2129?culture=en&r=F';
    const rows=[[50,'BE050',12.5,3.0,5,405,465,159,350,13,8],[65,'BE065',20,2.9,5,405,465,159,350,14,8],[80,'BE080',27,3.1,17,525,590,219,470,24,16],[100,'BE100',47,3.7,17,525,590,219,475,25,16],[125,'BE125',72,4.2,50,745,815,324,635,58,47],[150,'BE150',108,4.9,50,745,815,324,635,61,48],[200,'BE200',180,5.8,105,1015,1080,406,775,107,101],[250,'BE250',288,7.0,210,1210,1280,508,890,162,139],[300,'BE300',405,7.8,350,1435,1500,610,1005,261,219]];
    for(const [dn,base,q,dp,vol,h,h1,d,l,wfm,wlm] of rows) await ensureVariant(db,{modelId:spiro,name:`SpiroTrap Magnet DN${dn}`,ref:`${base}FM`,source:src,specs:[['DN',dn,'mm'],['Référence brides',`${base}FM`,''],['Référence embouts à souder',`${base}LM`,''],['Débit nominal',q,'m³/h'],['Perte de charge au débit nominal',dp,'kPa'],['Volume',vol,'L'],['Hauteur H',h,'mm'],['Hauteur H1',h1,'mm'],['Diamètre corps D',d,'mm'],['Longueur face-à-face',l,'mm'],['Poids version brides',wfm,'kg'],['Poids version soudée',wlm,'kg'],['Pression service max','10','bar'],['Température fluide','0 à 110','°C'],['Vitesse nominale','1,5','m/s'],['Bride','PN16',''],['Séparation particules','dès 5','µm']]});
  }

  const cu3a=await ensureModel(db,{category:'Chaudière',brand:'Viessmann',name:'Vitocrossal 300 CU3A',desc:'Chaudière gaz condensation compacte pour petites puissances, surfaces Inox-Crossal, brûleur MatriX.',source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300-cu3a.html'});
  if(cu3a) await ensureVariant(db,{modelId:cu3a,name:'Vitocrossal 300 CU3A',source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300-cu3a.html',specs:[['Plage de puissance','2,6 à 60','kW'],['Rendement saisonnier','98','% PCS'],['Classe énergétique','A',''],['Compatibilité hydrogène','jusqu’à 20','% H₂'],['Échangeur','Inox-Crossal acier inoxydable',''],['Brûleur','MatriX / Lambda Pro',''],['Régulation','Vitotronic 200','']]});

  const cr3b=await ensureModel(db,{category:'Chaudière',brand:'Viessmann',name:'Vitocrossal 300 CR3B',desc:'Chaudière gaz condensation très grande puissance, échangeur Inox-Crossal.',source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300.html'});
  if(cr3b) for(const p of [787,978,1100,1400]) await ensureVariant(db,{modelId:cr3b,name:`Vitocrossal 300 CR3B ${p}`,source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/vitocrossal-300.html',specs:[['Puissance nominale',p,'kW'],['Rendement saisonnier','jusqu’à 98','% PCS'],['Échangeur','Inox-Crossal',''],['Combustible','Gaz naturel H et L',''],['Brûleur','À jet sous pression, non fourni',''],['Régulation','Vitotronic avec écran tactile','']]});

  const ame=await modelId(db,'Danfoss','AME 435');
  if(ame){
    const src='https://assets.danfoss.com/documents/latest/74406/AI142686475217fr-000401.pdf';
    await db.runAsync(`UPDATE modeles_equipement SET source_uri=?,data_quality='verified',verified_at=?,caracteristiques=? WHERE id=?`,[src,VERIFIED_AT,'Actionneur pour régulation modulante, compatible notamment avec VRB2/VRB3, VRG2/VRG3, VF2/VF3 et VL2/VL3.',ame]);
  }

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_deep_3','1')`);
}
