/**
 * Raccourcis terrain REMAR : ce sont des choix d'affichage, pas des valeurs
 * d'observation. Jamais de compteur, temperature ou avis valide par defaut.
 */
export const COMPTEURS_REMAR_USUELS = Object.freeze([
  Object.freeze({ nom: 'Compteur Gaz (m³)', destination: 'Compteur Gaz (m³)' }),
  Object.freeze({ nom: "Compteur d'énergie (MWh)", destination: "Compteur d'énergie (MWh)" }),
  Object.freeze({ nom: 'Compteur ECS (m³)', destination: 'Compteur ECS (m³)' }),
  Object.freeze({ nom: 'Compteur appoint (m³)', destination: 'Compteur appoint (m³)' }),
]);

export const TEMPERATURES_REMAR_USUELLES = Object.freeze([
  'Primaire aller', 'Primaire retour',
  'Chauffage aller', 'Chauffage retour',
  'ECS départ', 'ECS bouclage', 'ECS stockage',
]);

export const MESURES_CTA_REMAR_USUELLES = Object.freeze([
  'Air neuf', 'Après récupération', 'Soufflage', 'Extraction / Reprise',
  'Vitesse soufflage', 'Vitesse extraction',
  'Consigne soufflage', 'Consigne extraction', 'Pression',
]);

export const CLASSES_FILTRES_REMAR = Object.freeze([
  'G4', 'M5', 'F7', 'F9', 'HEPA', 'ePM1', 'ePM2,5', 'ePM10',
]);

export const AVIS_REMAR = Object.freeze([
  Object.freeze({code:'S',label:'Satisfaisant'}),
  Object.freeze({code:'N.S',label:'Non satisfaisant'}),
  Object.freeze({code:'N.R',label:'Non réalisé / non vérifié'}),
  Object.freeze({code:'S.O',label:'Sans objet'}),
  Object.freeze({code:'N.V',label:'Non visible'}),
]);

export const ETATS_MESURE_REMAR = Object.freeze([
  Object.freeze({code:'N.R',label:'Pas vérifié'}),
  Object.freeze({code:'S.O',label:'Sans objet'}),
  Object.freeze({code:'N.V',label:'Non visible'}),
]);

export const NOMS_ETAPES_CTA = Object.freeze([
  Object.freeze({id:'p-remar-cta',nom:'CTA'}),
  Object.freeze({id:'p-remar-filtres',nom:'Filtration'}),
  Object.freeze({id:'p-remar-cta-mesures',nom:'Mesures'}),
  Object.freeze({id:'p-remar-cta-energie',nom:'Améliorations'}),
  Object.freeze({id:'validation',nom:'Validation'}),
]);

const norm = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function classificationFiltre(nom) {
  const n = norm(nom);
  return CLASSES_FILTRES_REMAR.find(c=>norm(c)===n || n.endsWith(' '+norm(c))) || '';
}

export function destinationMesureCTA(nom) {
  const n=norm(nom);
  const exact={
    'air neuf':['Températures','Air neuf'],
    'apres recuperation':['Températures','Après récupération'],
    'soufflage':['Températures','Soufflage'],
    'extraction reprise':['Températures','Extraction / Reprise'],
    'vitesse soufflage':['Variation de vitesse','Soufflage'],
    'vitesse extraction':['Variation de vitesse','Extraction / Reprise'],
    'consigne soufflage':['Consignes','Soufflage'],
    'consigne extraction':['Consignes','Extraction / Reprise'],
    'pression':['Consignes','Pression'],
  };
  return exact[n] || null;
}

export function uniteMesureCTA(nom) {
  const n=norm(nom);
  return n.startsWith('vitesse ')?'%':n==='pression'?'Pa':'°C';
}

export function commentaireRemarPropose(field, avis, titreEquipement='') {
  const libelle=String(field?.cle || 'Contrôle').trim();
  // L'identité de CTA/caisson est déjà portée par l'équipement et par
  // les légendes du rapport. Ne pas la répéter dans chaque observation.
  const origine=field?.presets?.[avis]?.[0]?.commentaire;
  if (origine && avis!=='N.S') return origine;
  if (avis==='S') return libelle+' : contrôle satisfaisant au point examiné.';
  // Une anomalie N.S doit être caractérisée par l'agent : aucune panne
  // précise n'est déduite de la seule sélection N.S.
  if (avis==='N.S') return '';
  if (avis==='N.R') return 'Ce point n’a pas été vérifié pendant la visite ; motif à préciser.';
  if (avis==='S.O') return 'Point non applicable à cette installation.';
  if (avis==='N.V') return 'Point inaccessible ou non visible pendant la visite.';
  return '';
}

export function valeursRapidesRemar(field) {
  // Reutilise les propositions de la trame officielle, sans inventer
  // d'etat mesure ni convertir un exemple en valeur observee.
  return Array.isArray(field?.options) ? field.options.filter(v=>String(v??'').trim()).slice(0,10) : [];
}

export function valeurOfficielleRemar(row) {
  if(!row) return '';
  const value=String(row.valeur??'').trim();
  if(value) return value;
  const code=String(row.avis||'').trim();
  return ETATS_MESURE_REMAR.some(a=>a.code===code) ? code : '';
}
