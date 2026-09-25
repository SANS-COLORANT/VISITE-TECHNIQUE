const LEVEL_RANK = Object.freeze({ rapide: 0, standard: 1, expert: 2 });

function f(key, label, type = 'text', level = 'standard', unit = null, options = null) {
  return { key, label, type, level, ...(unit ? { unit } : {}), ...(options ? { options } : {}) };
}

const COMMON_FIELDS = Object.freeze([
  f('function', 'Fonction / usage', 'text', 'rapide'),
  f('quantity', 'Quantité', 'number', 'rapide'),
  f('nominalPowerKw', 'Puissance nominale', 'number', 'standard', 'kW'),
  f('voltageV', 'Tension', 'number', 'standard', 'V'),
  f('currentA', 'Intensité', 'number', 'expert', 'A'),
  f('dimensions', 'Dimensions / encombrement', 'text', 'expert'),
  f('weightKg', 'Poids', 'number', 'expert', 'kg'),
  f('accessibility', 'Accessibilité / manutention', 'text', 'standard'),
  f('maintainability', 'Maintenabilité / disponibilité pièces', 'text', 'expert')
]);

export const EQUIPMENT_CATEGORIES = Object.freeze([
  {
    key: 'boiler',
    label: 'Chaudière',
    group: 'Chauffage',
    aliases: ['chaudiere', 'chaudière', 'generator', 'generateur'],
    fields: [
      f('fuel', 'Énergie / combustible', 'choice', 'rapide', null, [
        'Gaz',
        'Fioul',
        'Électricité',
        'Biomasse',
        'Autre'
      ]),
      f('heatingPowerKw', 'Puissance chauffage', 'number', 'rapide', 'kW'),
      f('efficiencyPct', 'Rendement documentaire', 'number', 'standard', '%'),
      f('waterContentL', 'Contenance en eau', 'number', 'expert', 'L'),
      f('maxPressureBar', 'Pression maximale', 'number', 'expert', 'bar')
    ]
  },
  {
    key: 'burner',
    label: 'Brûleur',
    group: 'Chauffage',
    aliases: ['bruleur', 'brûleur', 'burner'],
    fields: [
      f('fuel', 'Combustible', 'choice', 'rapide', null, ['Gaz', 'Fioul', 'Mixte', 'Autre']),
      f('minPowerKw', 'Puissance mini', 'number', 'standard', 'kW'),
      f('maxPowerKw', 'Puissance maxi', 'number', 'rapide', 'kW'),
      f('modulation', 'Modulation / allure', 'text', 'standard')
    ]
  },
  {
    key: 'pump',
    label: 'Pompe / circulateur',
    group: 'Hydraulique',
    aliases: ['pompe', 'circulateur', 'pump'],
    fields: [
      f('flowM3h', 'Débit nominal', 'number', 'rapide', 'm³/h'),
      f('headMce', 'HMT / hauteur manométrique', 'number', 'standard', 'mCE'),
      f('motorPowerKw', 'Puissance moteur', 'number', 'standard', 'kW'),
      f('frequencyHz', 'Fréquence / variateur', 'number', 'expert', 'Hz'),
      f('connection', 'Raccordement / DN', 'text', 'expert')
    ]
  },
  {
    key: 'heat_exchanger',
    label: 'Échangeur',
    group: 'Hydraulique',
    aliases: ['echangeur', 'échangeur', 'exchanger'],
    fields: [
      f('thermalPowerKw', 'Puissance échange', 'number', 'rapide', 'kW'),
      f('primaryTemperatures', 'Régime primaire', 'text', 'standard'),
      f('secondaryTemperatures', 'Régime secondaire', 'text', 'standard'),
      f('connection', 'Raccordements / DN', 'text', 'expert'),
      f('plateCount', 'Nombre de plaques', 'number', 'expert')
    ]
  },
  {
    key: 'valve',
    label: 'Vanne / organe hydraulique',
    group: 'Hydraulique',
    aliases: ['vanne', 'valve', 'clapet', 'robinet'],
    fields: [
      f('valveType', 'Type', 'choice', 'rapide', null, [
        'Isolement',
        'Équilibrage',
        'Régulation',
        'Clapet',
        'Mélangeuse',
        'Autre'
      ]),
      f('dn', 'DN / dimension', 'text', 'rapide'),
      f('kv', 'Kv / Kvs', 'number', 'expert'),
      f('actuated', 'Motorisée', 'choice', 'standard', null, ['Oui', 'Non', 'Non vérifié'])
    ]
  },
  {
    key: 'expansion',
    label: 'Expansion / maintien pression',
    group: 'Hydraulique',
    aliases: ['vase', 'expansion', 'maintien pression'],
    fields: [
      f('volumeL', 'Volume', 'number', 'rapide', 'L'),
      f('prechargeBar', 'Précharge', 'number', 'standard', 'bar'),
      f('servicePressureBar', 'Pression service', 'number', 'standard', 'bar'),
      f('systemType', 'Type de maintien', 'text', 'expert')
    ]
  },
  {
    key: 'hydraulic_accessory',
    label: 'Organe hydraulique',
    group: 'Hydraulique',
    aliases: [
      'bouteille',
      'separateur',
      'séparateur',
      'pot a boues',
      'pot à boues',
      'degazeur',
      'dégazeur',
      'disconnecteur'
    ],
    fields: [
      f('accessoryType', 'Type d’organe', 'text', 'rapide'),
      f('dn', 'DN / dimension', 'text', 'standard'),
      f('volumeL', 'Volume', 'number', 'expert', 'L')
    ]
  },
  {
    key: 'ecs_tank',
    label: 'Ballon / préparateur ECS',
    group: 'ECS',
    aliases: ['ballon', 'preparateur', 'préparateur', 'stockage ecs'],
    fields: [
      f('volumeL', 'Volume utile', 'number', 'rapide', 'L'),
      f('thermalPowerKw', 'Puissance échange / appoint', 'number', 'standard', 'kW'),
      f('setpointC', 'Consigne', 'number', 'rapide', '°C'),
      f('material', 'Matériau / revêtement', 'text', 'standard'),
      f('electricBackupKw', 'Appoint électrique', 'number', 'expert', 'kW')
    ]
  },
  {
    key: 'mixing_valve',
    label: 'Mitigeur / régulation ECS',
    group: 'ECS',
    aliases: ['mitigeur', 'melangeur ecs', 'mélangeur ecs'],
    fields: [
      f('dn', 'DN', 'text', 'rapide'),
      f('setpointC', 'Consigne mélange', 'number', 'rapide', '°C'),
      f('rangeC', 'Plage de réglage', 'text', 'standard')
    ]
  },
  {
    key: 'vmc_box',
    label: 'Caisson VMC',
    group: 'Ventilation',
    aliases: ['caisson vmc', 'vmc', 'extracteur', 'tourelle'],
    fields: [
      f('ventilationType', 'Type de ventilation', 'choice', 'rapide', null, [
        'Simple flux',
        'Double flux',
        'Extraction',
        'Insufflation',
        'Spécifique'
      ]),
      f('airFlowM3h', 'Débit nominal', 'number', 'rapide', 'm³/h'),
      f('fanCount', 'Nombre de ventilateurs', 'number', 'standard'),
      f('motorPowerKw', 'Puissance moteur', 'number', 'standard', 'kW'),
      f('beltDrive', 'Transmission', 'choice', 'expert', null, ['Directe', 'Courroie', 'Autre'])
    ]
  },
  {
    key: 'cta',
    label: 'CTA',
    group: 'Ventilation',
    aliases: ['cta', 'centrale traitement air', 'centrale de traitement d air'],
    fields: [
      f('ctaType', 'Type CTA', 'choice', 'rapide', null, [
        'Simple flux',
        'Double flux',
        'Tout air neuf',
        'Recyclage',
        'Autre'
      ]),
      f('supplyFlowM3h', 'Débit soufflage', 'number', 'rapide', 'm³/h'),
      f('extractFlowM3h', 'Débit reprise / extraction', 'number', 'rapide', 'm³/h'),
      f('recoveryType', 'Récupération', 'text', 'standard'),
      f('heatingCoilKw', 'Batterie chaude', 'number', 'standard', 'kW'),
      f('coolingCoilKw', 'Batterie froide', 'number', 'standard', 'kW'),
      f('filterStages', 'Étages filtration', 'text', 'standard'),
      f('condensate', 'Condensats / siphon', 'text', 'expert')
    ]
  },
  {
    key: 'fan',
    label: 'Ventilateur',
    group: 'Ventilation',
    aliases: ['ventilateur', 'fan'],
    fields: [
      f('airFlowM3h', 'Débit nominal', 'number', 'rapide', 'm³/h'),
      f('pressurePa', 'Pression disponible', 'number', 'standard', 'Pa'),
      f('motorPowerKw', 'Puissance moteur', 'number', 'standard', 'kW'),
      f('frequencyHz', 'Fréquence', 'number', 'expert', 'Hz')
    ]
  },
  {
    key: 'filter',
    label: 'Filtre',
    group: 'Ventilation',
    aliases: ['filtre', 'filter'],
    fields: [
      f('filterClass', 'Classe filtre', 'text', 'rapide'),
      f('filterDimensions', 'Dimensions', 'text', 'rapide'),
      f('reference', 'Référence consommable', 'text', 'standard'),
      f('pressureDropPa', 'Perte de charge', 'number', 'standard', 'Pa'),
      f('replacementDate', 'Dernier remplacement', 'text', 'expert')
    ]
  },
  {
    key: 'duct',
    label: 'Réseau aéraulique',
    group: 'Ventilation',
    aliases: ['gaine', 'conduit', 'duct'],
    fields: [
      f('section', 'Section / diamètre', 'text', 'rapide'),
      f('material', 'Matériau', 'text', 'standard'),
      f('insulation', 'Isolation', 'text', 'standard'),
      f('airFlowM3h', 'Débit', 'number', 'expert', 'm³/h')
    ]
  },
  {
    key: 'air_terminal',
    label: 'Bouche / diffuseur',
    group: 'Ventilation',
    aliases: ['bouche', 'diffuseur', 'grille', 'terminal air'],
    fields: [
      f('terminalType', 'Type terminal', 'text', 'rapide'),
      f('expectedFlowM3h', 'Débit attendu', 'number', 'rapide', 'm³/h'),
      f('measuredFlowM3h', 'Débit mesuré', 'number', 'standard', 'm³/h'),
      f('dimension', 'Dimension', 'text', 'standard')
    ]
  },
  {
    key: 'heat_pump',
    label: 'PAC',
    group: 'Froid / Climatisation',
    aliases: ['pac', 'pompe a chaleur', 'pompe à chaleur'],
    fields: [
      f('systemType', 'Type PAC', 'choice', 'rapide', null, ['Air/Air', 'Air/Eau', 'Eau/Eau', 'Sol/Eau', 'Autre']),
      f('heatingPowerKw', 'Puissance chaud', 'number', 'rapide', 'kW'),
      f('coolingPowerKw', 'Puissance froid', 'number', 'standard', 'kW'),
      f('refrigerant', 'Fluide frigorigène', 'text', 'rapide'),
      f('refrigerantChargeKg', 'Charge fluide', 'number', 'standard', 'kg'),
      f('cop', 'COP documentaire', 'number', 'expert'),
      f('eer', 'EER documentaire', 'number', 'expert')
    ]
  },
  {
    key: 'chiller',
    label: 'Groupe froid',
    group: 'Froid / Climatisation',
    aliases: ['groupe froid', 'chiller', 'groupe frigorifique'],
    fields: [
      f('coolingPowerKw', 'Puissance froid', 'number', 'rapide', 'kW'),
      f('refrigerant', 'Fluide frigorigène', 'text', 'rapide'),
      f('refrigerantChargeKg', 'Charge fluide', 'number', 'standard', 'kg'),
      f('compressorCount', 'Nombre compresseurs', 'number', 'standard'),
      f('eer', 'EER documentaire', 'number', 'expert')
    ]
  },
  {
    key: 'outdoor_unit',
    label: 'Unité extérieure',
    group: 'Froid / Climatisation',
    aliases: ['ue', 'unite exterieure', 'unité extérieure', 'outdoor unit'],
    fields: [
      f('systemType', 'Système', 'choice', 'rapide', null, ['Split', 'Multi-split', 'DRV/VRF', 'PAC air/air', 'Autre']),
      f('heatingPowerKw', 'Puissance chaud', 'number', 'standard', 'kW'),
      f('coolingPowerKw', 'Puissance froid', 'number', 'rapide', 'kW'),
      f('refrigerant', 'Fluide', 'text', 'rapide'),
      f('refrigerantChargeKg', 'Charge', 'number', 'standard', 'kg'),
      f('maxIndoorUnits', 'Nombre UI raccordables', 'number', 'expert')
    ]
  },
  {
    key: 'indoor_unit',
    label: 'Unité intérieure',
    group: 'Froid / Climatisation',
    aliases: ['ui', 'unite interieure', 'unité intérieure', 'cassette', 'split interieur', 'split intérieur'],
    fields: [
      f('indoorType', 'Type UI', 'choice', 'rapide', null, [
        'Murale',
        'Cassette',
        'Gainable',
        'Console',
        'Plafonnier',
        'Autre'
      ]),
      f('coolingPowerKw', 'Puissance froid', 'number', 'standard', 'kW'),
      f('heatingPowerKw', 'Puissance chaud', 'number', 'standard', 'kW'),
      f('servedZone', 'Zone desservie', 'text', 'rapide'),
      f('condensatePump', 'Pompe relevage condensats', 'choice', 'expert', null, ['Oui', 'Non', 'Non vérifié'])
    ]
  },
  {
    key: 'fan_coil',
    label: 'Ventilo-convecteur',
    group: 'Froid / Climatisation',
    aliases: ['ventilo convecteur', 'ventilo-convecteur', 'vc'],
    fields: [
      f('pipeConfiguration', 'Configuration', 'choice', 'rapide', null, [
        '2 tubes',
        '4 tubes',
        'Détente directe',
        'Autre'
      ]),
      f('heatingPowerKw', 'Puissance chaud', 'number', 'standard', 'kW'),
      f('coolingPowerKw', 'Puissance froid', 'number', 'standard', 'kW'),
      f('servedZone', 'Zone desservie', 'text', 'rapide')
    ]
  },
  {
    key: 'rooftop',
    label: 'Rooftop',
    group: 'Froid / Climatisation',
    aliases: ['rooftop'],
    fields: [
      f('airFlowM3h', 'Débit air', 'number', 'rapide', 'm³/h'),
      f('heatingPowerKw', 'Puissance chaud', 'number', 'standard', 'kW'),
      f('coolingPowerKw', 'Puissance froid', 'number', 'rapide', 'kW'),
      f('refrigerant', 'Fluide', 'text', 'standard')
    ]
  },
  {
    key: 'dry_cooler',
    label: 'Dry cooler / aéroréfrigérant',
    group: 'Froid / Climatisation',
    aliases: ['dry cooler', 'aerorefrigerant', 'aéroréfrigérant'],
    fields: [
      f('thermalPowerKw', 'Puissance rejet', 'number', 'rapide', 'kW'),
      f('fanCount', 'Nombre ventilateurs', 'number', 'standard'),
      f('fluid', 'Fluide circuit', 'text', 'standard')
    ]
  },
  {
    key: 'plc',
    label: 'Automate / régulateur',
    group: 'Régulation / GTB',
    aliases: ['automate', 'regulateur', 'régulateur', 'plc'],
    fields: [
      f('controllerType', 'Type / fonction', 'text', 'rapide'),
      f('protocol', 'Protocole communication', 'choice', 'standard', null, [
        'BACnet',
        'Modbus',
        'KNX',
        'Lon',
        'M-Bus',
        'Propriétaire',
        'Autre'
      ]),
      f('ipAddress', 'Adresse / repère réseau', 'text', 'expert'),
      f('programAvailable', 'Programme / sauvegarde disponible', 'choice', 'expert', null, [
        'Oui',
        'Non',
        'À récupérer'
      ])
    ]
  },
  {
    key: 'sensor',
    label: 'Sonde / capteur',
    group: 'Régulation / GTB',
    aliases: ['sonde', 'capteur', 'sensor'],
    fields: [
      f('measureType', 'Grandeur mesurée', 'text', 'rapide'),
      f('range', 'Plage', 'text', 'standard'),
      f('signal', 'Signal / bus', 'text', 'standard'),
      f('controlledObject', 'Objet / boucle associée', 'text', 'expert')
    ]
  },
  {
    key: 'actuator',
    label: 'Servomoteur / actionneur',
    group: 'Régulation / GTB',
    aliases: ['servomoteur', 'actionneur', 'actuator'],
    fields: [
      f('actuatorType', 'Type actionneur', 'text', 'rapide'),
      f('signal', 'Signal de commande', 'text', 'standard'),
      f('torqueNm', 'Couple', 'number', 'expert', 'Nm'),
      f('controlledObject', 'Organe commandé', 'text', 'standard')
    ]
  },
  {
    key: 'gateway',
    label: 'Passerelle / télégestion',
    group: 'Régulation / GTB',
    aliases: ['passerelle', 'gateway', 'telegestion', 'télégestion', 'modem'],
    fields: [
      f('protocolIn', 'Protocole amont', 'text', 'standard'),
      f('protocolOut', 'Protocole aval', 'text', 'standard'),
      f('communication', 'Support / abonnement / accès', 'text', 'rapide'),
      f('remoteAccess', 'Accès distant', 'choice', 'rapide', null, ['Fonctionnel', 'Indisponible', 'Non testé'])
    ]
  },
  {
    key: 'meter',
    label: 'Compteur',
    group: 'Comptage',
    aliases: ['compteur', 'meter'],
    fields: [
      f('meterType', 'Énergie / fluide', 'choice', 'rapide', null, [
        'Gaz',
        'Électricité',
        'Eau',
        'Énergie thermique',
        'Autre'
      ]),
      f('index', 'Index', 'number', 'rapide'),
      f('unit', 'Unité index', 'text', 'standard'),
      f('remoteReading', 'Télérelève', 'choice', 'standard', null, ['Oui', 'Non', 'Non vérifié']),
      f('pulseWeight', 'Poids impulsion / facteur', 'text', 'expert')
    ]
  },
  {
    key: 'water_treatment',
    label: 'Traitement d’eau',
    group: 'Traitement eau',
    aliases: ['adoucisseur', 'traitement eau', 'traitement d eau', 'filtre eau', 'doseur'],
    fields: [
      f('treatmentType', 'Type traitement', 'text', 'rapide'),
      f('capacity', 'Capacité / débit', 'text', 'standard'),
      f('consumable', 'Consommable / produit', 'text', 'standard'),
      f('setpoint', 'Réglage / consigne', 'text', 'expert')
    ]
  },
  {
    key: 'other',
    label: 'Autre équipement',
    group: 'Autre',
    aliases: [],
    fields: [f('technicalData', 'Caractéristiques principales', 'text', 'standard')]
  }
]);

const CATEGORY_BY_KEY = Object.freeze(Object.fromEntries(EQUIPMENT_CATEGORIES.map((item) => [item.key, item])));

const MISSION_OVERLAYS = Object.freeze({
  inventaire_passation: [
    f('documentExpected', 'Présence dans inventaire attendu', 'choice', 'rapide', null, ['Oui', 'Non', 'Non vérifié']),
    f('handoverDifference', 'Écart de passation', 'text', 'rapide'),
    f('accessMeans', 'Clés / moyens d’accès / accessoires remis', 'text', 'standard')
  ],
  inventaire_patrimonial: [
    f('assetTag', 'Repère patrimoine', 'text', 'rapide'),
    f('spareParts', 'Disponibilité pièces', 'text', 'standard'),
    f('obsolescence', 'Obsolescence / maintenabilité', 'text', 'standard')
  ],
  assistance_p2_p3: [
    f('p3Scope', 'Périmètre P3 pressenti / contractuel', 'text', 'rapide'),
    f('renewalHistory', 'Historique renouvellement', 'text', 'standard'),
    f('spareParts', 'Disponibilité pièces', 'text', 'standard')
  ],
  etude_renovation: [
    f('replacementConstraints', 'Contraintes de remplacement', 'text', 'rapide'),
    f('handling', 'Manutention / grutage / démontage', 'text', 'rapide'),
    f('connections', 'Raccordements à reprendre', 'text', 'standard'),
    f('associatedWorks', 'Travaux induits / autres lots', 'text', 'standard')
  ],
  etude_cvc: [
    f('designDuty', 'Point de fonctionnement / besoin projet', 'text', 'standard'),
    f('projectConstraints', 'Contraintes projet', 'text', 'standard')
  ],
  opr_reception: [
    f('plannedReference', 'Référence prévue au marché / VISA', 'text', 'rapide'),
    f('installedVsPlanned', 'Prévu ↔ installé', 'choice', 'rapide', null, [
      'Conforme à l’attendu',
      'Différent',
      'À contrôler'
    ]),
    f('commissioningPv', 'PV / essais disponibles', 'text', 'standard')
  ],
  commissioning: [
    f('expectedResponse', 'Réponse / comportement attendu', 'text', 'rapide'),
    f('observedResponse', 'Réponse observée', 'text', 'rapide'),
    f('finalSetpoint', 'Réglage / consigne finale', 'text', 'standard')
  ],
  diagnostic_chaufferie_ss: [
    f('operatingObservation', 'Fonctionnement observé', 'text', 'rapide'),
    f('visibleAnomalies', 'Anomalies / fuites / corrosion', 'text', 'standard')
  ],
  diagnostic_ventilation_cta: [
    f('airDirection', 'Sens de l’air / fonction dans le réseau', 'text', 'standard'),
    f('measuredAirFlowM3h', 'Débit mesuré', 'number', 'standard', 'm³/h')
  ],
  diagnostic_climatisation_pac: [
    f('faultCode', 'Code défaut / alarme', 'text', 'rapide'),
    f('servedZone', 'Zone desservie', 'text', 'rapide')
  ],
  diagnostic_gtb: [
    f('communicationStatus', 'Communication', 'choice', 'rapide', null, [
      'Communicant',
      'Non communicant',
      'Non testé'
    ]),
    f('accessStatus', 'Accès / supervision', 'choice', 'rapide', null, [
      'Accessible',
      'Accès inconnu',
      'Indisponible',
      'Non testé'
    ])
  ]
});

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveEquipmentCategory(typeLabel, explicitKey = null) {
  if (explicitKey && CATEGORY_BY_KEY[explicitKey]) return CATEGORY_BY_KEY[explicitKey];
  const normalized = normalize(typeLabel);
  if (!normalized) return CATEGORY_BY_KEY.other;
  for (const category of EQUIPMENT_CATEGORIES) {
    if (category.key === 'other') continue;
    if (normalize(category.label) === normalized) return category;
    if (
      (category.aliases || []).some((alias) => {
        const token = normalize(alias);
        return token && (normalized === token || normalized.includes(token));
      })
    )
      return category;
  }
  return CATEGORY_BY_KEY.other;
}

function uniqueFields(fields) {
  const map = new Map();
  for (const item of fields) map.set(item.key, item);
  return [...map.values()];
}

export function getEquipmentProfile({
  typeLabel = '',
  categoryKey = null,
  missionType = null,
  mode = 'standard'
} = {}) {
  const category = resolveEquipmentCategory(typeLabel, categoryKey);
  const maxRank = LEVEL_RANK[mode] ?? LEVEL_RANK.standard;
  const overlay = MISSION_OVERLAYS[missionType] || [];
  const fields = uniqueFields([...COMMON_FIELDS, ...(category.fields || []), ...overlay]).filter(
    (item) => (LEVEL_RANK[item.level] ?? 1) <= maxRank
  );
  return {
    category,
    mode,
    fields
  };
}

export const EQUIPMENT_PROFILE_MODES = Object.freeze([
  ['rapide', 'Rapide'],
  ['standard', 'Standard'],
  ['expert', 'Expert']
]);
