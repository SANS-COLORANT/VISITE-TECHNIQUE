import { createId } from './ids.js';

const EXTRA_MODELS = [
  // Grundfos
  ['Circulateur','Grundfos','MAGNA1','Circulateur électronique haut rendement','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Circulateur','Grundfos','ALPHA3','Circulateur domestique communicant','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Circulateur','Grundfos','UPS2','Circulateur haut rendement de remplacement','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','TPE2','Pompe in-line à vitesse variable','https://www.grundfos.com/fr/campaign/new-tpe3','verified_range'],
  ['Pompe','Grundfos','TP','Pompe in-line monocellulaire','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','NBE / NBGE','Pompe normalisée à moteur IE5 / vitesse variable','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','NB / NBG','Pompe normalisée monocellulaire','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','NK / NKG','Pompe à aspiration axiale','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','CM / CME','Pompe horizontale multicellulaire','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],
  ['Pompe','Grundfos','CRN','Pompe multicellulaire verticale inox','https://api.grundfos.com/literature/Grundfosliterature-1322.pdf','verified_range'],

  // Wilo
  ['Circulateur','Wilo','Stratos MAXO-D','Circulateur double intelligent','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Circulateur','Wilo','Stratos MAXO-Z','Circulateur ECS intelligent','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Circulateur','Wilo','Yonos MAXO-D','Circulateur double haut rendement','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Circulateur','Wilo','Yonos MAXO-Z','Circulateur ECS haut rendement','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Circulateur','Wilo','TOP-Z','Circulateur ECS sanitaire','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','Stratos GIGA2.0-I','Pompe en ligne intelligente','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','Stratos GIGA2.0-D','Pompe double en ligne intelligente','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','Yonos GIGA2.0-I','Pompe en ligne haut rendement','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','Yonos GIGA-N','Pompe normalisée à vitesse variable','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','VeroLine-IPL','Pompe en ligne à rotor sec','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','VeroTwin-DPL','Pompe double en ligne','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],
  ['Pompe','Wilo','CronoBloc-BL-E','Pompe monobloc à vitesse variable','https://wilo.com/fr/fr/Produits-Applications/fr/produits','verified_range'],

  // Lowara
  ['Circulateur','Lowara','ecocirc XLplus','Circulateur électronique communicant',null,'catalogue'],
  ['Circulateur','Lowara','ecocirc PRO','Circulateur ECS',null,'catalogue'],
  ['Pompe','Lowara','e-LNS','Pompe en ligne simple',null,'catalogue'],
  ['Pompe','Lowara','e-LNT','Pompe en ligne double',null,'catalogue'],
  ['Pompe','Lowara','e-SH','Pompe centrifuge horizontale inox',null,'catalogue'],
  ['Pompe','Lowara','e-NSC','Pompe normalisée monocellulaire',null,'catalogue'],
  ['Pompe','Lowara','e-SV','Pompe multicellulaire verticale inox',null,'catalogue'],

  // KSB
  ['Pompe','KSB','Etaline-R','Pompe en ligne avec moteur synchrone',null,'catalogue'],
  ['Pompe','KSB','Etaline Z','Pompe en ligne double',null,'catalogue'],
  ['Pompe','KSB','Etanorm SYT','Pompe normalisée pour fluides chauds',null,'catalogue'],
  ['Pompe','KSB','MegaCPK','Pompe process normalisée',null,'catalogue'],
  ['Circulateur','KSB','Calio','Circulateur haut rendement',null,'catalogue'],
  ['Circulateur','KSB','Calio S','Circulateur compact haut rendement',null,'catalogue'],

  // Salmson
  ['Circulateur','Salmson','Priux home','Circulateur haut rendement',null,'catalogue'],
  ['Circulateur','Salmson','Priux master D','Circulateur double électronique',null,'catalogue'],
  ['Pompe','Salmson','Siriux master','Pompe/circulateur électronique',null,'catalogue'],
  ['Pompe','Salmson','SCX','Pompe centrifuge en ligne',null,'catalogue'],

  // Chaudières De Dietrich
  ['Chaudière','De Dietrich','C330 ECO','Chaudière gaz condensation forte puissance',null,'catalogue'],
  ['Chaudière','De Dietrich','C340 ECO','Chaudière gaz condensation double corps',null,'catalogue'],
  ['Chaudière','De Dietrich','Innovens Pro MCA','Chaudière murale gaz condensation tertiaire',null,'catalogue'],
  ['Chaudière','De Dietrich','Evomod','Chaudière gaz condensation modulaire',null,'catalogue'],

  // Viessmann
  ['Chaudière','Viessmann','Vitocrossal 100 CIB','Chaudière gaz condensation 80 à 318 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitocrossal.html','verified'],
  ['Chaudière','Viessmann','Vitocrossal 300 CR3B','Chaudière gaz condensation 787 à 1400 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitocrossal.html','verified'],
  ['Chaudière','Viessmann','Vitocrossal 200 CRU','Chaudière gaz condensation 800 à 1000 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitocrossal.html','verified'],
  ['Chaudière','Viessmann','Vitodens 200-W','Chaudière murale gaz condensation 1,9 à 32 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitodens.html','verified'],
  ['Chaudière','Viessmann','Vitodens 100-W','Chaudière murale gaz condensation 3,2 à 32 kW','https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitodens.html','verified'],
  ['Chaudière','Viessmann','Vitoplex 200','Chaudière basse température grande puissance','https://www.viessmann.fr/fr/services-et-assistance/archives-produits/vitola.html','verified_range'],
  ['Chaudière','Viessmann','Vitoplex 300','Chaudière basse température grande puissance','https://www.viessmann.fr/fr/services-et-assistance/archives-produits/vitola.html','verified_range'],

  // Atlantic
  ['Chaudière','Atlantic','Varmax 2','Chaudière gaz condensation forte puissance',null,'catalogue'],
  ['Chaudière','Atlantic','Condensinox','Chaudière gaz condensation inox',null,'catalogue'],
  ['Chaudière','Atlantic','Effinox Condens','Chaudière gaz condensation',null,'catalogue'],
  ['Ballon ECS','Atlantic','Corflow','Préparateur ECS collectif',null,'catalogue'],
  ['Ballon ECS','Atlantic','Corhydro','Ballon ECS collectif',null,'catalogue'],

  // Chappée
  ['Chaudière','Chappée','Power HT+','Chaudière gaz condensation au sol',null,'catalogue'],
  ['Chaudière','Chappée','Power HT-A','Chaudière gaz condensation tertiaire',null,'catalogue'],
  ['Chaudière','Chappée','Luna Platinum+','Chaudière murale condensation',null,'catalogue'],

  // Bosch
  ['Chaudière','Bosch','Condens 5000 W','Chaudière murale gaz condensation',null,'catalogue'],
  ['Chaudière','Bosch','Uni Condens 8000 F','Chaudière condensation grande puissance',null,'catalogue'],
  ['Chaudière','Bosch','Uni 3000 F','Chaudière acier basse température',null,'catalogue'],

  // Vaillant
  ['Chaudière','Vaillant','ecoTEC plus','Chaudière murale gaz condensation',null,'catalogue'],
  ['Chaudière','Vaillant','ecoTEC exclusive','Chaudière murale condensation premium',null,'catalogue'],
  ['Chaudière','Vaillant','ecoCRAFT exclusiv','Chaudière gaz condensation forte puissance',null,'catalogue'],

  // Weishaupt
  ['Chaudière','Weishaupt','Thermo Condens WTC-GW','Chaudière murale gaz condensation',null,'catalogue'],
  ['Chaudière','Weishaupt','Thermo Condens WTC-GB','Chaudière gaz condensation au sol',null,'catalogue'],
  ['Chaudière','Weishaupt','Thermo Condens WTC-OB','Chaudière fioul condensation',null,'catalogue'],

  // Alfa Laval
  ['Échangeur','Alfa Laval','T5','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','Alfa Laval','T6','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','Alfa Laval','T10','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','Alfa Laval','M15','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','Alfa Laval','M20','Échangeur à plaques démontables',null,'catalogue'],
  ['Échangeur','Alfa Laval','TS6','Échangeur à plaques haute performance',null,'catalogue'],

  // SWEP
  ['Échangeur','SWEP','B8T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B15T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B35T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B50T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B65T','Échangeur à plaques brasées',null,'catalogue'],
  ['Échangeur','SWEP','B120T','Échangeur à plaques brasées forte capacité',null,'catalogue'],

  // Reflex
  ['Vase d’expansion','Reflex','G','Vase d’expansion à membrane grande capacité',null,'catalogue'],
  ['Vase d’expansion','Reflex','Refix DE','Vase sanitaire à membrane',null,'catalogue'],
  ['Vase d’expansion','Reflex','Refix DD','Vase sanitaire compact',null,'catalogue'],
  ['Désemboueur','Reflex','Exdirt','Séparateur de boues',null,'catalogue'],
  ['Séparateur d’air','Reflex','Exvoid','Séparateur de microbulles',null,'catalogue'],
  ['Désemboueur','Reflex','Extwin','Séparateur combiné air/boues',null,'catalogue'],

  // Zilmet
  ['Vase d’expansion','Zilmet','OEM-Pro','Vase chauffage à membrane',null,'catalogue'],
  ['Vase d’expansion','Zilmet','Hydro-Pro','Vase pour eau sanitaire/surpresseur',null,'catalogue'],
  ['Vase d’expansion','Zilmet','Ultra-Pro','Vase à membrane interchangeable',null,'catalogue'],

  // BWT / Culligan
  ['Adoucisseur','BWT','Perla Silk','Adoucisseur résidentiel/tertiaire',null,'catalogue'],
  ['Adoucisseur','BWT','Rondomat Duo','Adoucisseur duplex collectif',null,'catalogue'],
  ['Filtre','BWT','Infinity','Filtre automatique',null,'catalogue'],
  ['Adoucisseur','Culligan','Global Cabinet','Adoucisseur compact',null,'catalogue'],
  ['Adoucisseur','Culligan','Medallist','Adoucisseur volumétrique',null,'catalogue'],
  ['Adoucisseur','Culligan','Hi-Flo 3e','Adoucisseur collectif fort débit',null,'catalogue'],

  // Fernox / Spirotech / Caleffi
  ['Désemboueur','Fernox','TF1 Sigma','Filtre magnétique compact',null,'catalogue'],
  ['Désemboueur','Fernox','TF1 Delta','Filtre magnétique chauffage',null,'catalogue'],
  ['Désemboueur','Fernox','TF1 Total Filter','Filtre magnétique avec séparateur',null,'catalogue'],
  ['Séparateur d’air','Spirotech','SpiroVent','Séparateur de microbulles','https://www.spirotech.com','verified_range'],
  ['Désemboueur','Spirotech','SpiroTrap','Séparateur de boues','https://www.spirotech.com','verified_range'],
  ['Désemboueur','Spirotech','SpiroCross','Séparateur hydraulique combiné air/boues','https://www.spirotech.com','verified_range'],
  ['Désemboueur','Caleffi','DISCALDIRTMAG','Séparateur combiné air/boues magnétique',null,'catalogue'],
  ['Séparateur d’air','Caleffi','DISCAL','Séparateur de microbulles',null,'catalogue'],
  ['Robinetterie','Caleffi','HydroControl','Vanne d’équilibrage',null,'catalogue'],

  // Siemens
  ['Vanne 2 voies','Siemens','VVF43','Vanne 2 voies à brides PN16',null,'catalogue'],
  ['Vanne 3 voies','Siemens','VXF43','Vanne 3 voies à brides PN16',null,'catalogue'],
  ['Servomoteur','Siemens','SKD','Servomoteur électrohydraulique Acvatix',null,'catalogue'],
  ['Servomoteur','Siemens','SKB','Servomoteur électrohydraulique forte poussée',null,'catalogue'],
  ['Servomoteur','Siemens','SKC','Servomoteur électrohydraulique grande vanne',null,'catalogue'],
  ['Régulation','Siemens','RVD','Régulateur chauffage urbain / sous-station',null,'catalogue'],
  ['Régulation','Siemens','Climatix','Automate CVC',null,'catalogue'],
  ['Sonde','Siemens','QAC34','Sonde extérieure',null,'catalogue'],
  ['Sonde','Siemens','QAD22','Sonde applique',null,'catalogue'],

  // Schneider
  ['Régulation','Schneider Electric','SpaceLogic AS-P','Automate serveur BMS',null,'catalogue'],
  ['Régulation','Schneider Electric','SpaceLogic MP-C','Contrôleur programmable CVC',null,'catalogue'],
  ['Régulation','Schneider Electric','SpaceLogic RP-C','Contrôleur terminal',null,'catalogue'],
  ['Armoire électrique','Schneider Electric','PrismaSeT','Système d’armoire électrique',null,'catalogue'],

  // WIT / SOFREL
  ['Régulation','WIT','Easy 4','Automate de télégestion CVC',null,'catalogue'],
  ['Régulation','WIT','Climbox','Télégestion et régulation énergétique',null,'catalogue'],
  ['Régulation','SOFREL','S4W','Télégestion nouvelle génération',null,'catalogue'],
  ['Régulation','SOFREL','S500','Automate de télégestion',null,'catalogue'],

  // Kamstrup / Itron
  ['Compteur','Kamstrup','MULTICAL 403','Compteur d’énergie thermique compact',null,'catalogue'],
  ['Compteur','Kamstrup','MULTICAL 803','Calculateur d’énergie multifonction',null,'catalogue'],
  ['Compteur','Kamstrup','ULTRAFLOW 54','Capteur de débit ultrasonique',null,'catalogue'],
  ['Compteur','Itron','CF UltraMaXX V','Compteur d’énergie thermique ultrasonique',null,'catalogue'],
  ['Compteur','Itron','CF 51','Calculateur d’énergie thermique',null,'catalogue'],

  // Danfoss
  ['Vanne 2 voies','Danfoss','VF2','Vanne à brides 2 voies',null,'catalogue'],
  ['Vanne 3 voies','Danfoss','VF3','Vanne à brides 3 voies',null,'catalogue'],
  ['Vanne 2 voies','Danfoss','VFM2','Vanne de régulation 2 voies forte capacité',null,'catalogue'],
  ['Servomoteur','Danfoss','AME 55','Servomoteur modulant',null,'catalogue'],
  ['Servomoteur','Danfoss','AME 85','Servomoteur modulant forte poussée',null,'catalogue'],
  ['Régulation','Danfoss','ECL Comfort 310','Régulateur chauffage / réseau de chaleur',null,'catalogue'],

  // Sauter
  ['Vanne 2 voies','Sauter','VUD','Vanne 2 voies de régulation',null,'catalogue'],
  ['Vanne 3 voies','Sauter','VUE','Vanne 3 voies de régulation',null,'catalogue'],
  ['Servomoteur','Sauter','AVM 234S','Servomoteur de vanne',null,'catalogue'],
  ['Régulation','Sauter','EY-modulo 5','Automate de régulation bâtiment',null,'catalogue'],

  // Belimo
  ['Vanne 2 voies','Belimo','EPIV','Vanne indépendante de la pression avec mesure débit',null,'catalogue'],
  ['Vanne 2 voies','Belimo','Energy Valve','Vanne de régulation énergétique communicante',null,'catalogue'],
  ['Vanne 2 voies','Belimo','R2..','Vanne à boisseau sphérique 2 voies',null,'catalogue'],
  ['Vanne 3 voies','Belimo','R3..','Vanne à boisseau sphérique 3 voies',null,'catalogue'],
  ['Servomoteur','Belimo','LR24A-SR','Servomoteur rotatif modulant',null,'catalogue'],
  ['Servomoteur','Belimo','NR24A-SR','Servomoteur rotatif forte puissance',null,'catalogue'],

  // WIKA / Honeywell
  ['Manomètre','WIKA','232.50','Manomètre sécurité inox',null,'catalogue'],
  ['Manomètre','WIKA','213.53','Manomètre glycérine',null,'catalogue'],
  ['Sonde','WIKA','TR10','Sonde de température résistive',null,'catalogue'],
  ['Filtre','Honeywell','F76S','Filtre fin à rinçage',null,'catalogue'],
  ['Détendeur','Honeywell','D06F','Réducteur de pression',null,'catalogue'],
  ['Vanne 2 voies','Honeywell','V5011','Vanne de régulation 2 voies',null,'catalogue'],
  ['Vanne 3 voies','Honeywell','V5013','Vanne de régulation 3 voies',null,'catalogue'],
];

const EXTRA_VARIANTS = [
  // TPE3 tailles vérifiées par la documentation Grundfos
  ...['32-80','32-120','32-150','32-180','32-200','40-80','40-120','40-150','40-180','40-200','40-240','50-60','50-80','50-120','50-150','50-180','50-200','50-240','65-60','65-80','65-120','65-150','65-180','65-200','80-40','80-120','80-150','80-180','100-40','100-120','100-150','100-180'].map(n=>({brand:'Grundfos',model:'TPE3',name:`TPE3 ${n}`,source:'https://www.grundfos.com/fr/support/how-to-guides/get-verified-data-for-sustainable-building-design',quality:'verified_range',specs:[['DN',n.split('-')[0],''],['Classe hauteur',n.split('-')[1],'dm']]})),
  // Viessmann Vitocrossal 100 CIB - puissances de gamme documentées 80-318 kW, variantes représentatives
  ...[80,120,160,200,240,280,318].map(p=>({brand:'Viessmann',model:'Vitocrossal 100 CIB',name:`Vitocrossal 100 CIB ${p}`,source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitocrossal.html',quality:'verified_range',specs:[['Puissance classe',String(p),'kW'],['Technologie','Condensation gaz','']]})),
  // Vitodens common power classes
  ...[19,25,32].map(p=>({brand:'Viessmann',model:'Vitodens 200-W',name:`Vitodens 200-W ${p} kW`,source:'https://www.viessmann.fr/fr/produits/chauffage-gaz/gamme-vitodens.html',quality:'verified_range',specs:[['Puissance max',String(p),'kW'],['Type','Murale condensation','']]})),
];

async function getCategoryId(db, name) {
  return (await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE', [name]))?.id;
}
async function getBrandId(db, name) {
  return (await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE', [name]))?.id;
}

export async function seedExtraEquipmentCatalog(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_extra_v3'`);
  if (done) return;

  for (const [categorie, marque, nom, description, source, quality] of EXTRA_MODELS) {
    const categoryId = await getCategoryId(db, categorie);
    const brandId = await getBrandId(db, marque);
    if (!categoryId || !brandId) continue;
    const existing = await db.getFirstAsync(
      `SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE`,
      [categoryId, brandId, nom]
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO modeles_equipement
         (id,categorie_id,marque_id,nom,caracteristiques,mots_cles,source_uri,data_quality,verified_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [createId('model'), categoryId, brandId, nom, description, `${categorie} ${marque} ${nom} ${description}`, source || null, quality || 'catalogue', quality?.startsWith('verified') ? '2026-08-23' : null]
      );
    }
  }

  for (const v of EXTRA_VARIANTS) {
    const model = await db.getFirstAsync(
      `SELECT m.id FROM modeles_equipement m JOIN marques_equipement b ON b.id=m.marque_id
       WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE`,
      [v.brand, v.model]
    );
    if (!model) continue;
    let row = await db.getFirstAsync(`SELECT id FROM variantes_equipement WHERE modele_id=? AND nom=? COLLATE NOCASE`, [model.id, v.name]);
    const id = row?.id || createId('variant');
    if (!row) {
      await db.runAsync(
        `INSERT INTO variantes_equipement(id,modele_id,nom,source_uri,data_quality,verified_at) VALUES(?,?,?,?,?,?)`,
        [id, model.id, v.name, v.source || null, v.quality || 'catalogue', v.quality?.startsWith('verified') ? '2026-08-23' : null]
      );
      let order = 0;
      for (const [cle, valeur, unite] of v.specs || []) {
        await db.runAsync(
          `INSERT INTO caracteristiques_equipement(id,variante_id,cle,valeur,unite,ordre) VALUES(?,?,?,?,?,?)`,
          [createId('spec'), id, cle, valeur, unite || null, order++]
        );
      }
    }
  }

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_extra_v3','1')`);
}
