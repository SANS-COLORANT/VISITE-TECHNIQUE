import { TRAME_DATA } from './data.js';
import { TEMPLATE_RESEAU_CHALEUR_BASE64 } from './templateExcelReseauChaleur.js';

const RESEAU_CHALEUR_ID = 'reseau_chaleur_v1';

// Définition indépendante : ne jamais marquer stable les champs ICPE partagés.
function champsDurables(sections) {
  return Object.freeze(Object.fromEntries(Object.entries(sections).map(([section, fields]) => [section,
    Object.freeze(fields.map((field) => Object.freeze({ ...field,
      carryForward: field.type === 'champ' && !/^T°(?:ext|dép)/.test(field.cle) && field.cle !== 'Calorifuge (type / état)',
    }))),
  ])));
}

const RESEAU_CHALEUR_PANELS = Object.freeze({
  'p-infos': Object.freeze({
    'Informations générales': Object.freeze([
      { cle: 'Date de visite', type: 'champ' },
      { cle: 'Nom du site', type: 'champ' },
      { cle: 'Adresse', type: 'champ' },
      { cle: 'Nbr de bât / lgt', type: 'champ', carryForward: true },
      { cle: 'Energie - pression', type: 'champ', carryForward: true },
      { cle: 'Production primaire', type: 'champ', carryForward: true },
      { cle: 'Sous-Station(s) desservis', type: 'champ', carryForward: true },
      { cle: 'Exploitant - marché', type: 'champ', carryForward: true },
      { cle: 'Type de LT', type: 'champ', carryForward: true },
    ]),
    'Description des principaux équipements': champsDurables(TRAME_DATA['p-infos'])['Description des principaux équipements'],
  }),
  'p-distrib': champsDurables(TRAME_DATA['p-distrib']),
  'p-releves': TRAME_DATA['p-releves'],
  'p-regulation': champsDurables(TRAME_DATA['p-regulation']),
  'p-conf-chauffage': champsDurables(TRAME_DATA['p-conf-chauffage']),
  'p-conf-ecs': champsDurables(TRAME_DATA['p-conf-ecs']),
  'p-conf-adouc': champsDurables(TRAME_DATA['p-conf-adouc']),
  'p-conf-energie': champsDurables(TRAME_DATA['p-conf-energie']),
  'p-conf-local': champsDurables(TRAME_DATA['p-conf-local']),
});

const SECTION_RANGES = Object.freeze({
  'p-infos': Object.freeze({
    'Informations générales': [12, 20],
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

function genericSectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function runtimeSectionCode(panelId, section) {
  if (panelId === 'p-releves' && section === 'Relevés des compteurs et manomètres') return 'releves.compteurs';
  if (panelId === 'p-releves' && section === 'Températures et pH') return 'releves.temperatures';
  if (panelId === 'p-regulation' && section === 'Cascade chaudières') return 'regulation.cascade';
  if (panelId === 'p-regulation' && section === 'Réseau ECS') return 'regulation.reseau_ecs';
  return genericSectionCode(panelId, section);
}

function perimetreControleReseauChaleur(sectionCode, cle) {
  const section = String(sectionCode || '').toLowerCase();
  const key = String(cle || '').trim();

  if (section.startsWith('releves.temperatures')) {
    if (/^PRIMAIRE:/i.test(key) || /^EAU CHAUDE SANITAIRE:/i.test(key)) return 'Primaire';
    return 'Secondaire';
  }

  if (section.startsWith('conf-chauffage.')) {
    if (section.includes('conduits_de_fum') || section.includes('soupapes')) return 'Primaire';
    return 'Secondaire';
  }

  if (section.startsWith('conf-ecs.')) {
    if (
      key === "Trou d'homme sur ballon ECS" ||
      key === 'Vanne de vidange sur ballon' ||
      key === 'Soupape'
    ) return 'Primaire';
    return 'Secondaire';
  }

  if (section.startsWith('conf-energie.')) {
    if (
      (section.includes('coupure_ext') && section.includes('combustible')) ||
      section.includes('ligne_alimentation_gaz')
    ) return 'Primaire';
    return 'Secondaire';
  }

  if (section.startsWith('conf-adouc.') || section.startsWith('conf-local.')) return 'Secondaire';
  return 'Secondaire';
}

function construireMappings() {
  const mappings = [];
  for (const [panelId, sections] of Object.entries(RESEAU_CHALEUR_PANELS)) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const range = SECTION_RANGES?.[panelId]?.[section];
      if (!range) continue;
      const sectionCode = runtimeSectionCode(panelId, section);
      const [start, end] = range;
      if ((fields || []).length > end - start + 1) {
        throw new Error(`Mapping Réseau de chaleur trop court: ${panelId} / ${section}`);
      }
      (fields || []).forEach((field, index) => {
        const row = start + index;
        const controle = field.type === 'controle';
        mappings.push(Object.freeze({
          panelId,
          section,
          sectionCode,
          cle: field.cle,
          type: field.type,
          valueCell: `${controle ? 'B' : 'C'}${row}`,
          commentCell: controle ? `C${row}` : null,
          perimetre: controle ? perimetreControleReseauChaleur(sectionCode, field.cle) : null,
        }));
      });
    }
  }
  return Object.freeze(mappings);
}

const RESEAU_CHALEUR_FIELD_MAPPINGS = construireMappings();
const RESEAU_CHALEUR_RESEAU_BLOCS = Object.freeze([91, 101, 111, 121, 131, 141]);
const RESEAU_CHALEUR_RESUME_ROWS = Object.freeze({
  Primaire: Object.freeze({ P2: 362, P3: 363, Conformite: 364, Amelioration: 365, Remarque: 366 }),
  Secondaire: Object.freeze({ P2: 373, P3: 374, Conformite: 375, Amelioration: 376, Remarque: 377 }),
});

export {
  RESEAU_CHALEUR_ID,
  RESEAU_CHALEUR_PANELS,
  RESEAU_CHALEUR_FIELD_MAPPINGS,
  RESEAU_CHALEUR_RESEAU_BLOCS,
  RESEAU_CHALEUR_RESUME_ROWS,
  TEMPLATE_RESEAU_CHALEUR_BASE64,
  perimetreControleReseauChaleur,
};
