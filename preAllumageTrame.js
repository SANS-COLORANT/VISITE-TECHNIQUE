/** Trame Pré-allumage v1 — interface, modèle Excel et présélections métier. */
import * as XLSX from 'xlsx';

const p = (label, commentaire, reserve = null, poste = 'Pré-allumage') => ({ label, commentaire, reserve, poste });
const NR = [
  p('Non testable', "Ce contrôle n'a pas pu être réalisé lors de la visite."),
  p('Alternance impossible', "Le contrôle n'a pas pu être réalisé car la permutation ou l'alternance forcée est impossible.", "Rétablir la possibilité de permutation ou d’alternance afin de permettre le contrôle de l’équipement."),
  p('Commande verrouillée', "Le contrôle n'a pas pu être réalisé car les commandes nécessaires sont verrouillées ou condamnées.", "Rendre les commandes nécessaires accessibles et fonctionnelles afin de permettre les essais."),
  p('Installation à l’arrêt', "Le contrôle n'a pas été réalisé car l'installation est à l'arrêt."),
  p('Absence d’alimentation', "Le contrôle n'a pas pu être réalisé en raison d'une absence d'alimentation.", "Contrôler et rétablir l’alimentation nécessaire à l’essai."),
  p('Accès impossible', "Le contrôle n'a pas pu être réalisé dans les conditions d'accès de la visite."),
];
const SO = [p('Non présent', "Cet équipement ou ce contrôle n'est pas présent sur l'installation concernée.")];
const NV = [p('Non visible / inaccessible', "Cet équipement n'a pas pu être contrôlé visuellement dans les conditions de la visite.")];

function presetsPour(cle) {
  const k = String(cle || '').toLowerCase();
  let s = [p('Satisfaisant', `Le contrôle « ${cle} » est satisfaisant lors de la visite et ne présente pas d’anomalie apparente.`)];
  let ns = [p('Non fonctionnel', `Le contrôle « ${cle} » n’est pas satisfaisant lors de la visite.`, `Diagnostiquer l’anomalie constatée sur « ${cle} » et procéder à la remise en état nécessaire.`)];
  if (k.includes('pompe') || k.includes('circulateur')) {
    s = [p('Fonctionnelle', `L’équipement « ${cle} » est fonctionnel lors de l’essai et ne présente pas d’anomalie apparente.`), p('Fonctionnement normal', `Le fonctionnement de « ${cle} » est normal lors de l’essai.`)];
    ns = [
      p('Hors service', `L’équipement « ${cle} » est hors service lors de l’essai.`, `Diagnostiquer la panne et procéder à la remise en service ou au remplacement de « ${cle} ».`),
      p('Ne démarre pas', `L’équipement « ${cle} » ne démarre pas lors de l’essai.`, `Contrôler l’alimentation, la commande et l’état de « ${cle} » puis rétablir son fonctionnement.`),
      p('Bruit anormal', `Un bruit anormal est constaté sur « ${cle} » pendant son fonctionnement.`, `Contrôler les organes mécaniques de « ${cle} » et procéder à la remise en état nécessaire.`),
      p('Grincement', `« ${cle} » est fonctionnel mais des grincements sont constatés lors de son fonctionnement.`, `Contrôler l’état mécanique de « ${cle} » et prévoir sa remise en état ou son remplacement si nécessaire.`),
      p('Vibrations', `Des vibrations anormales sont constatées sur « ${cle} ».`, `Contrôler la fixation, l’alignement et l’état mécanique de « ${cle} ».`),
      p('Fuite / dégât des eaux', `Des traces de fuite ou de dégât des eaux sont constatées au niveau de « ${cle} ».`, `Supprimer l’origine de l’écoulement et contrôler l’état de « ${cle} ».`),
      p('Voyant éteint', `« ${cle} » fonctionne mais son voyant d’état est éteint.`, `Contrôler le voyant et le circuit de signalisation de « ${cle} ».`),
      p('Fonctionnement simultané', `Un fonctionnement simultané anormal est constaté sur les équipements concernés.`, 'Contrôler la logique de commande et d’alternance des pompes.'),
      p('Variateur seul démarré', `La commande provoque uniquement le démarrage du variateur sans fonctionnement normal de « ${cle} ».`, 'Contrôler la commande, le variateur et la pompe afin de rétablir un fonctionnement normal.'),
    ];
  } else if (k.includes('vanne trois voies')) {
    s = [p('Ouverture / fermeture correctes', 'La vanne trois voies répond correctement aux commandes d’ouverture et de fermeture.')];
    ns = [p('Bloquée ouverte', 'La vanne trois voies reste bloquée en position ouverte.', 'Diagnostiquer et remettre en état la vanne trois voies.'), p('Bloquée fermée', 'La vanne trois voies reste bloquée en position fermée.', 'Diagnostiquer et remettre en état la vanne trois voies.'), p('Course incomplète', 'La course de la vanne trois voies est incomplète.', 'Contrôler la vanne trois voies et son entraînement afin de rétablir la course complète.'), p('Fuite', 'Une fuite est constatée au niveau de la vanne trois voies.', 'Remettre en état ou remplacer la vanne trois voies présentant une fuite.')];
  } else if (k.includes('servomoteur')) {
    s = [p('Fonctionnel', 'Le servomoteur est fonctionnel et assure correctement la manœuvre de la vanne.')];
    ns = [p('Ne répond pas', 'Le servomoteur ne répond pas aux commandes.', 'Diagnostiquer et remettre en état ou remplacer le servomoteur.'), p('Course incomplète', 'La course du servomoteur est incomplète.', 'Contrôler le servomoteur et son accouplement.'), p('Désaccouplé', 'Le servomoteur est désaccouplé de la vanne.', 'Réaccoupler le servomoteur et vérifier le fonctionnement de l’ensemble.'), p('Commande absente', 'Aucune commande du servomoteur n’est constatée.', 'Contrôler la régulation, le câblage et l’alimentation du servomoteur.')];
  } else if (k.includes('régulation')) {
    s = [p('Fonctionnelle', 'La régulation est fonctionnelle lors de l’essai.')];
    ns = [p('Hors service', 'La régulation est hors service lors de l’essai.', 'Diagnostiquer et remettre en service la régulation.'), p('Consigne incorrecte', 'La consigne de régulation constatée est incorrecte.', 'Corriger la consigne et vérifier le fonctionnement de la régulation.'), p('Régulation en manuel', 'La régulation est maintenue en mode manuel.', 'Rétablir le fonctionnement automatique de la régulation après vérification.'), p('Sonde incohérente', 'Une valeur de sonde incohérente est constatée sur la régulation.', 'Contrôler la sonde concernée, son câblage et son étalonnage.')];
  } else if (k.includes('test allumage')) {
    s = [p('Allumage réussi', 'L’allumage est réalisé correctement lors de l’essai.')];
    ns = [p('Échec à l’allumage', 'L’équipement ne démarre pas lors de l’essai d’allumage.', 'Diagnostiquer le défaut d’allumage et procéder à la remise en service.'), p('Plusieurs tentatives', 'L’allumage n’est obtenu qu’après plusieurs tentatives.', 'Contrôler la séquence d’allumage et les organes associés.'), p('Mise en sécurité', 'L’équipement se met en sécurité lors de l’essai d’allumage.', 'Rechercher l’origine de la mise en sécurité et remettre l’équipement en service.')];
  } else if (k.includes('présence des flammes')) {
    s = [p('Flamme présente et stable', 'La flamme est présente et stable pendant l’essai.')];
    ns = [p('Absence de flamme', 'Aucune flamme n’est constatée lors de l’essai.', 'Diagnostiquer la chaîne d’allumage et d’alimentation combustible.'), p('Flamme instable', 'La flamme est instable pendant le fonctionnement.', 'Contrôler le brûleur, l’alimentation combustible et les réglages de combustion.'), p('Extinction intempestive', 'Une extinction intempestive de la flamme est constatée.', 'Diagnostiquer l’origine de l’extinction et rétablir un fonctionnement stable.')];
  } else if (k.includes('augmentation de la température')) {
    s = [p('Montée en température correcte', 'La température d’eau en sortie de chaudière augmente correctement pendant l’essai.')];
    ns = [p('Montée insuffisante', 'La montée en température de l’eau est insuffisante pendant l’essai.', 'Contrôler le fonctionnement de la chaudière, du brûleur et de la circulation d’eau.'), p('Aucune montée en température', 'Aucune augmentation significative de la température d’eau n’est constatée.', 'Diagnostiquer la production de chaleur et la circulation d’eau.'), p('Montée anormalement lente', 'La montée en température est anormalement lente.', 'Contrôler la puissance délivrée, la combustion et le débit hydraulique.')];
  } else if (k.includes('électrovanne') || k.includes('alimentation gaz')) {
    s = [p('Fonctionnelle', 'L’électrovanne gaz fonctionne correctement lors de l’essai.')];
    ns = [p('Ne s’ouvre pas', 'L’électrovanne gaz ne s’ouvre pas lors de l’essai.', 'Contrôler l’électrovanne, sa commande et son alimentation.'), p('Ne se ferme pas', 'L’électrovanne gaz ne se ferme pas correctement.', 'Mettre l’installation en sécurité et contrôler l’électrovanne gaz.'), p('Commande absente', 'Aucune commande de l’électrovanne gaz n’est constatée.', 'Contrôler la chaîne de commande et les sécurités associées.')];
  } else if (k.includes('électrode')) {
    s = [p('Fonctionnelle', 'L’électrode d’allumage fonctionne correctement lors de l’essai.')];
    ns = [p('Absence d’étincelle', 'Aucune étincelle n’est constatée au niveau de l’électrode d’allumage.', 'Contrôler l’électrode, son câblage et le transformateur d’allumage.'), p('Étincelle irrégulière', 'L’étincelle d’allumage est irrégulière.', 'Contrôler et régler ou remplacer l’électrode d’allumage.'), p('Électrode dégradée', 'L’électrode d’allumage est dégradée.', 'Remplacer l’électrode d’allumage dégradée.')];
  } else if (k.includes('traitement d’eau') || k.includes('doseuse')) {
    s = [p('Fonctionnel', 'Le traitement d’eau et la pompe doseuse sont fonctionnels lors de l’essai.')];
    ns = [p('Pompe doseuse HS', 'La pompe doseuse est hors service.', 'Diagnostiquer et remettre en service ou remplacer la pompe doseuse.'), p('Absence d’injection', 'Aucune injection de produit n’est constatée.', 'Contrôler l’amorçage, la pompe doseuse et le circuit d’injection.'), p('Produit absent / niveau faible', 'Le produit de traitement est absent ou à un niveau insuffisant.', 'Compléter le produit de traitement et vérifier le fonctionnement du dosage.'), p('Fuite dosage', 'Une fuite est constatée sur le circuit de dosage.', 'Supprimer la fuite et contrôler le circuit de dosage.')];
  }
  return { S: s, 'N.S': ns, 'N.R': NR, 'S.O': SO, 'N.V': NV };
}

const PANELS = {};
const MAP = [];
const ROW_LABELS = new Map();
const HEADERS = new Set();
const TITLES = new Set([7,20,106,191,414,478,732]);
const panel = (id, section) => (PANELS[id] ||= {}, PANELS[id][section] ||= []);
const sectionCode = (id, section) => id.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
function addField(id, section, row, cle, type = 'champ', extra = {}) {
  const field = type === 'controle' ? { cle, type, preAllumage: true, poste: 'Pré-allumage', presets: presetsPour(cle), ...extra } : { cle, type, ...extra };
  panel(id, section).push(field); ROW_LABELS.set(row, cle);
  MAP.push({ panelId:id, section, sectionCode:sectionCode(id,section), cle, type, valueCell:`${type === 'controle' ? 'B' : 'C'}${row}`, commentCell:type === 'controle' ? `C${row}` : null });
}
function addBlock(id, section, startRow, labels, type='champ', extra={}) { HEADERS.add(startRow - 1); labels.forEach((cle,i)=>addField(id,section,startRow+i,cle,type,extra)); }
function addTitle(row, label) { ROW_LABELS.set(row,label); }

[['Nom du client',1,true],['Nom du site',2,true],['Nom du local / adresse',3,true],['Trame utilisée',4,true],['Date de la visite',5,false]].forEach(([cle,row,stable])=>{
  panel('p-pa-infos','Général').push({cle,type:'champ',stable}); ROW_LABELS.set(row,cle);
  MAP.push({panelId:'p-pa-infos',section:'Général',sectionCode:sectionCode('p-pa-infos','Général'),cle,type:'champ',valueCell:`B${row}`,commentCell:null});
});
addTitle(7,'INFORMATIONS GÉNÉRALES'); addTitle(9,'Informations générales');
addBlock('p-pa-infos','Informations générales',12,['Date de visite','Saison de chauffe','N° / référence du rapport','Exploitant','Chargé d’affaires / rédacteur','Nombre de sous-stations','Observations générales de préparation'],'champ');
panel('p-pa-infos','Informations générales').forEach(f=>{if(['Exploitant','Nombre de sous-stations'].includes(f.cle)) f.stable=true;});

addTitle(20,'PLAN ET INFORMATIONS BÂTIMENTS');
['SST 1','SST 2','SST 3','SST 4','SST 5','SST 6','SST 7','SST 8','SST 9','SST 10','Centre commercial','Église'].forEach((name,i)=>{const h=22+i*7;addTitle(h,name);addBlock('p-pa-batiments',name,h+3,['Nombre de logements desservis','Bâtiments desservis','Situation / localisation'],'champ',{stable:true});});

addTitle(106,'RELEVÉ DES COMPTEURS');
const counterGroups=[['Compteurs généraux',108,['Index compteur gaz général (m³)','Index compteur énergie général (MWh)']],...Array.from({length:10},(_,i)=>[`SST ${i+1}`,114+i*6,[`SST ${i+1} — Énergie (MWh)`,`SST ${i+1} — ECS (m³)`]]),['Commerces / bureaux',174,['Commerces / bureaux — Énergie (MWh)','Commerces / bureaux — ECS (m³)']],['Église',180,['Église — Énergie (MWh)','Église — ECS (m³)']],['Piscine',186,['Piscine — Énergie (MWh)']]];
counterGroups.forEach(([name,h,labels])=>{addTitle(h,name);addBlock('p-pa-compteurs',name,h+3,labels,'champ',{numericIndex:true,renamable:true});});

addTitle(191,'PARAMÈTRES DE RÉGULATION ET TEMPÉRATURES');
const regLabels=['Courbe de chauffe — Pour -7°C (°C)','Courbe de chauffe — Pour 12°C (°C)','Courbe de chauffe — Pour 19°C (°C)','Température de non chauffe (°C)','Réduit de jour (°C d’eau)','Horaires','Température extérieure (°C)','Départ chauffage (°C)','Retour chauffage (°C)','Départ ECS (°C)','Retour ECS (°C)','Arrivée primaire ECS (°C)','Retour primaire ECS (°C)'];
['SST 1','SST 2','SST 3','SST 4','SST 5','SST 6','SST 7','SST 8','SST 9','SST 10','Commerces','Bureaux','Église'].forEach((name,i)=>{const h=193+i*17;addTitle(h,name);addBlock('p-pa-regulation',name,h+3,regLabels,'champ',{carryForward:true});});

addTitle(414,'TESTS DE PRÉ-ALLUMAGE — CHAUFFERIE');
const boiler=['Test allumage','Présence des flammes','Augmentation de la température de l’eau en sortie de chaudière','Fonctionnement de la pompe de charge'];
const burner=['Test allumage','Ouverture de l’électrovanne gaz / alimentation gaz','Fonctionnement de l’électrode d’allumage'];
[[416,'Chaudière n°1',boiler],[424,'Brûleur n°1',burner],[431,'Chaudière n°2',boiler],[439,'Brûleur n°2',burner],[446,'Chaudière n°3',boiler],[454,'Brûleur n°3',burner],[461,'Pompes primaires',['Fonctionnement pompe n°1','Fonctionnement pompe n°2']],[467,'Vanne trois voies avec servomoteur',['Ouverture / fermeture vanne trois voies','Fonctionnement servomoteur']],[473,'Régulation',['Fonctionnement de la régulation']]].forEach(([h,name,labels])=>{addTitle(h,name);addBlock('p-pa-chaufferie',name,h+3,labels,'controle');});

addTitle(478,'TESTS DE PRÉ-ALLUMAGE — SOUS-STATIONS');
const heat=['Pompe chauffage n°1','Pompe chauffage n°2','Vanne trois voies chauffage — ouverture / fermeture','Servomoteur chauffage','Régulation chauffage'];
const ecs=['Pompe bouclage ECS n°1','Pompe bouclage ECS n°2','Pompe primaire ECS n°1','Pompe primaire ECS n°2','Vanne trois voies ECS — ouverture / fermeture','Servomoteur ECS','Régulation ECS','Traitement d’eau / pompe(s) doseuse(s)'];
['SST 1','SST 2','SST 3','SST 4','SST 5','SST 6','SST 7','SST 8','SST 9','SST 10','Centre commercial','Église'].forEach((name,i)=>{const h=480+i*21;addTitle(h,`${name} — Chauffage`);addBlock('p-pa-sst',`${name} — Chauffage`,h+3,heat,'controle');addTitle(h+9,`${name} — ECS / traitement d’eau`);addBlock('p-pa-sst',`${name} — ECS / traitement d’eau`,h+12,ecs,'controle');});

addTitle(732,'OBSERVATIONS ET CONCLUSION'); addTitle(734,'Conclusion de pré-allumage');
addBlock('p-pa-conclusion','Conclusion de pré-allumage',737,['Contrôles supplémentaires nécessaires','Équipements à remplacer / contrôler','Conclusion libre du chargé d’affaires','Installations prêtes pour le début de la saison de chauffe']);

export const PREALLUMAGE_PANELS = Object.freeze(PANELS);
export const PREALLUMAGE_FIELD_MAPPINGS = Object.freeze(MAP);
export const PREALLUMAGE_EQUIPMENT_TYPES = Object.freeze(['Chaudière','Brûleur','Pompe','Circulateur','Vanne','Servomoteur','Régulateur','Régulation','Échangeur','Ballon ECS','Adoucisseur','Pompe doseuse','Traitement d’eau']);

function construireTemplate() {
  const aoa = Array.from({length:740},()=>Array(5).fill(null));
  ROW_LABELS.forEach((label,row)=>{aoa[row-1][0]=label;});
  TITLES.forEach((row)=>{ if (!aoa[row-1][0]) aoa[row-1][0]=''; });
  HEADERS.forEach((row)=>{aoa[row-1]=['Intitulé','Avis','Commentaire','Avis','Commentaire'];});
  aoa[3][1]='PRE-ALLUMAGE v1';
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:54},{wch:11},{wch:75},{wch:11},{wch:45}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'TRAME PRE-ALLUMAGE');
  const rem=XLSX.utils.aoa_to_sheet([['REMARQUES PARTICULIERES'],[],['Poste','Prestation','Date de la réserve','Délai','Etat d’avancement','Estimatif']]); rem['!cols']=[{wch:24},{wch:70},{wch:18},{wch:12},{wch:20},{wch:15}]; XLSX.utils.book_append_sheet(wb,rem,'REMARQUES');
  const mat=XLSX.utils.aoa_to_sheet([['LISTING MATERIEL'],[],['Catégorie','Nombre','Désignation','N°matériel','Réseau desservi','Marque','Modèle','Caractéristiques','Année','Etat']]); mat['!cols']=[{wch:20},{wch:10},{wch:35},{wch:16},{wch:28},{wch:20},{wch:24},{wch:35},{wch:12},{wch:18}]; XLSX.utils.book_append_sheet(wb,mat,'MATERIEL');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['NOTES'],['']]),'NOTE');
  return XLSX.write(wb,{type:'base64',bookType:'xlsx'});
}
export const PREALLUMAGE_TEMPLATE_BASE64 = construireTemplate();
