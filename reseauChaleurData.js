import { TRAME_DATA } from './data.js';

const TRAME_RESEAU_CHALEUR = {
  ...TRAME_DATA,
  'p-infos': {
    'Général': TRAME_DATA['p-infos']['Général'],
    'Information générales réseau': [
      { cle: 'Date de visite', type: 'champ' },
      { cle: 'Nom du site', type: 'champ' },
      { cle: 'Adresse', type: 'champ' },
      { cle: 'Nbr de bât / lgt', type: 'champ' },
      { cle: 'Energie - pression', type: 'champ' },
      { cle: 'Production primaire', type: 'champ' },
      { cle: 'Sous-Station(s) desservis', type: 'champ' },
      { cle: 'Exploitant - marché', type: 'champ' },
      { cle: 'Type de LT', type: 'champ' },
    ],
    'Description des principaux équipements': TRAME_DATA['p-infos']['Description des principaux équipements'],
  },
};

const RESEAU_CHALEUR_SECTION_RANGES = Object.freeze({
  'p-infos': Object.freeze({
    'Général': [1, 5],
    'Information générales réseau': [12, 20],
    'Description des principaux équipements': [25, 31],
  }),
  'p-distrib': Object.freeze({
    'Distribution chauffage': [36, 43],
    'Distribution ECS': [48, 53],
  }),
  'p-releves': Object.freeze({
    'Relevés des compteurs et manomètres': [60, 65],
    'Températures et pH': [70, 77],
  }),
  'p-regulation': Object.freeze({
    'Cascade chaudières': [84, 86],
    'Réseau ECS': [151, 152],
  }),
  'p-conf-chauffage': Object.freeze({
    'Disconnection et alimentation eau froide': [159, 161],
    "Traitement d'eau": [166, 169],
    'Conduits de fumées': [174, 177],
    'Soupapes': [182, 184],
  }),
  'p-conf-ecs': Object.freeze({
    'Disconnection et alimentation eau froide': [191, 193],
    'Traitement': [198, 202],
    'Autres': [207, 214],
  }),
  'p-conf-adouc': Object.freeze({
    'Réseau(x) alimenté(s)': [221, 224],
  }),
  'p-conf-energie': Object.freeze({
    'Coupure extérieure combustible': [231, 235],
    'Coupure extérieure électrique': [240, 245],
    'Ligne alimentation gaz': [250, 254],
    'Armoire électrique': [259, 265],
    'BAES': [270, 274],
    'Autres': [279, 282],
  }),
  'p-conf-local': Object.freeze({
    'Partie local': [289, 291],
    "Portes d'accès": [296, 301],
    'Ventilation': [306, 309],
    "Lutte contre l'incendie": [314, 333],
    'Affichages réglementaires': [338, 340],
    'Evacuations des EU du local': [345, 348],
    'Autres': [353, 355],
  }),
});

const RESEAU_CHALEUR_RESEAU_BLOCS_DEBUT = Object.freeze([91, 101, 111, 121, 131, 141]);

const RESEAU_CHALEUR_RESUME_ROWS = Object.freeze({
  Primaire: Object.freeze({ P2: 362, P3: 363, Conformite: 364, Amelioration: 365, Remarque: 366 }),
  Secondaire: Object.freeze({ P2: 373, P3: 374, Conformite: 375, Amelioration: 376, Remarque: 377 }),
});

export {
  TRAME_RESEAU_CHALEUR,
  RESEAU_CHALEUR_SECTION_RANGES,
  RESEAU_CHALEUR_RESEAU_BLOCS_DEBUT,
  RESEAU_CHALEUR_RESUME_ROWS,
};
