function action(key, label, kind, extras = {}) {
  return { key, label, kind, ...extras };
}

function measure(type, unit, label = null, extras = {}) {
  return { type, unit, label: label || type, ...extras };
}

function point(label, pointType = 'information', extras = {}) {
  return { label, pointType, ...extras };
}

const BASE = Object.freeze({
  diagnostic: {
    defaultMode: 'standard',
    defaultVisitType: 'diagnostic terrain',
    objective: 'Observer l’existant, vérifier les documents, mesurer ce qui est utile et tracer les écarts sans ressaisie.',
    steps: ['Contexte', 'Existant', 'Mesures', 'Écarts', 'Synthèse'],
    quickActions: [
      action('equipment', 'Inventaire', 'navigate', { route: 'MissionEquipment' }),
      action('measure', 'Mesure', 'measure'),
      action('difference', 'Écart constaté', 'point', { preset: point('Écart document ↔ terrain', 'control', { priority: 'À contrôler' }) }),
      action('photo', 'Photo', 'photo'),
      action('plan', 'Plan / synoptique', 'navigate', { route: 'MissionPlan' }),
    ],
    pointPresets: [
      point('Écart document ↔ terrain', 'control', { priority: 'À contrôler' }),
      point('Équipement non retrouvé', 'control', { priority: 'À vérifier' }),
      point('Information manquante', 'request'),
      point('Action corrective proposée', 'action'),
    ],
  },

  study: {
    defaultMode: 'standard',
    defaultVisitType: 'relevé / étude terrain',
    objective: 'Partir de l’existant réel pour construire des scénarios, dimensionnements, contraintes et livrables sans recréer les données.',
    steps: ['Existant', 'Contraintes', 'Mesures', 'Scénarios', 'Solution'],
    quickActions: [
      action('equipment', 'Existant', 'navigate', { route: 'MissionEquipment' }),
      action('constraints', 'Contrainte', 'point', { preset: point('Contrainte de projet / remplacement', 'information') }),
      action('measure', 'Mesure', 'measure'),
      action('scenario', 'Scénarios', 'navigate', { route: 'MissionScenarios' }),
      action('calculation', 'Calculs 🧮', 'navigate', { route: 'MissionCalculation' }),
      action('plan', 'Plan', 'navigate', { route: 'MissionPlan' }),
    ],
    pointPresets: [
      point('Contrainte d’accès / manutention', 'information'),
      point('Travaux induits / autre lot', 'information'),
      point('Information nécessaire au dimensionnement', 'request'),
      point('Hypothèse à confirmer', 'control', { priority: 'À confirmer' }),
    ],
  },

  works: {
    defaultMode: 'rapide',
    defaultVisitType: 'visite chantier',
    objective: 'Tracer ce qui est réellement constaté sur chantier, qui doit agir et ce qui devra être recontrôlé à la visite suivante.',
    steps: ['Avancement', 'Constat', 'Réserve', 'Responsable', 'Suivi'],
    quickActions: [
      action('reserve', 'Réserve', 'point', { preset: point('Réserve chantier', 'reserve', { priority: 'À traiter' }) }),
      action('decision', 'Décision', 'point', { preset: point('Décision / arbitrage chantier', 'decision') }),
      action('photo', 'Photo', 'photo'),
      action('actions', 'Actions ouvertes', 'navigate', { route: 'MissionActions' }),
      action('documents', 'Documents / VISA', 'navigate', { route: 'MissionDocuments' }),
      action('plan', 'Plan', 'navigate', { route: 'MissionPlan' }),
    ],
    pointPresets: [
      point('Réserve chantier', 'reserve', { priority: 'À traiter' }),
      point('Travaux restant à réaliser', 'action'),
      point('Écart projet ↔ réalisé', 'control', { priority: 'À contrôler' }),
      point('Décision / arbitrage chantier', 'decision'),
    ],
  },

  reception: {
    defaultMode: 'rapide',
    defaultVisitType: 'OPR / réception',
    objective: 'Comparer le prévu et le réalisé, créer les réserves en quelques gestes et préparer immédiatement OPR, réception ou levée.',
    steps: ['Ouvrage', 'Contrôle', 'Réserve', 'Preuve', 'Statut'],
    quickActions: [
      action('reserve', '＋ Réserve', 'point', { preset: point('Réserve OPR / réception', 'reserve', { priority: 'À lever' }) }),
      action('photo', '📷 Preuve', 'photo'),
      action('tests', 'Essais', 'navigate', { route: 'MissionTests' }),
      action('actions', 'Réserves / actions', 'navigate', { route: 'MissionActions' }),
      action('signature', 'Signature', 'navigate', { route: 'MissionSignature' }),
      action('plan', 'Plan', 'navigate', { route: 'MissionPlan' }),
    ],
    pointPresets: [
      point('Réserve OPR / réception', 'reserve', { priority: 'À lever' }),
      point('Écart prévu ↔ installé', 'control', { priority: 'À contrôler' }),
      point('Document / PV manquant', 'request'),
      point('Réglage / reprise nécessaire', 'action'),
    ],
  },

  passation: {
    defaultMode: 'rapide',
    defaultVisitType: 'passation contradictoire',
    equipmentVerificationStatuses: [
      ['confirme', 'Confirmé'],
      ['different', 'Différent'],
      ['non_retrouve', 'Non retrouvé'],
      ['remplace', 'Remplacé'],
      ['inaccessible', 'Inaccessible'],
      ['a_verifier', 'À vérifier'],
    ],
    objective: 'Comparer l’inventaire attendu au terrain, conserver les différences et produire une passation contradictoire sans ressaisie.',
    steps: ['Attendu', 'Trouvé', 'Différence', 'Photo', 'Validation'],
    quickActions: [
      action('equipment', 'Inventaire', 'navigate', { route: 'MissionEquipment' }),
      action('difference', 'Différence', 'point', { preset: point('Différence inventaire / terrain', 'control', { priority: 'À confirmer' }) }),
      action('photo', 'Photo', 'photo'),
      action('technical', 'Architecture', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('signature', 'Signature', 'navigate', { route: 'MissionSignature' }),
    ],
    pointPresets: [
      point('Équipement attendu non retrouvé', 'control', { priority: 'À confirmer' }),
      point('Équipement présent non inventorié', 'information'),
      point('Équipement différent / remplacé', 'control'),
      point('Document ou moyen d’accès manquant', 'request'),
    ],
  },

  campaign: {
    defaultMode: 'rapide',
    defaultVisitType: 'campagne terrain',
    objective: 'Préparer en masse, saisir très vite site par site et consolider automatiquement la progression et les écarts.',
    steps: ['Préparation', 'Site', 'Saisie rapide', 'Statut', 'Consolidation'],
    quickActions: [
      action('map', 'Carte / progression', 'navigate', { route: 'MissionMap' }),
      action('equipment', 'Inventaire', 'navigate', { route: 'MissionEquipment' }),
      action('measurementCampaign', 'Campagne mesures', 'navigate', { route: 'MissionMeasurementCampaign' }),
      action('point', 'Écart / point', 'point', { preset: point('Écart campagne', 'control') }),
      action('photo', 'Photo', 'photo'),
    ],
    pointPresets: [
      point('Écart campagne', 'control'),
      point('Site / zone inaccessible', 'information'),
      point('Information à récupérer', 'request'),
      point('Action locale', 'action'),
    ],
  },

  measurementCampaign: {
    defaultMode: 'rapide',
    defaultVisitType: 'campagne de mesures',
    objective: 'Préparer les points puis utiliser une saisie terrain valeur → suivant avec statuts d’accès et comparaison avant / après.',
    steps: ['Liste', 'Point', 'Valeur', 'Statut', 'Suivant'],
    quickActions: [
      action('measurementCampaign', 'Valeur → suivant', 'navigate', { route: 'MissionMeasurementCampaign' }),
      action('photo', 'Photo', 'photo'),
      action('point', 'Point à traiter', 'point', { preset: point('Valeur / situation à contrôler', 'control', { priority: 'À contrôler' }) }),
      action('map', 'Carte', 'navigate', { route: 'MissionMap' }),
    ],
    pointPresets: [
      point('Valeur / situation à contrôler', 'control', { priority: 'À contrôler' }),
      point('Point inaccessible', 'information'),
      point('Mesure à refaire', 'action'),
    ],
  },

  control: {
    defaultMode: 'rapide',
    defaultVisitType: 'contrôle terrain',
    objective: 'Contrôler un point précis, rattacher la preuve et créer immédiatement l’action utile sans transformer METRA en organisme certificateur.',
    steps: ['Référence', 'Contrôle', 'Preuve', 'Écart', 'Action'],
    quickActions: [
      action('tests', 'Contrôles / essais', 'navigate', { route: 'MissionTests' }),
      action('control', 'Écart', 'point', { preset: point('Écart / contrôle à traiter', 'control', { priority: 'À traiter' }) }),
      action('photo', 'Preuve photo', 'photo'),
      action('document', 'Document', 'document'),
      action('actions', 'Actions', 'navigate', { route: 'MissionActions' }),
    ],
    pointPresets: [
      point('Écart / contrôle à traiter', 'control', { priority: 'À traiter' }),
      point('Preuve documentaire manquante', 'request'),
      point('Contrôle impossible / non vérifiable', 'information'),
      point('Action corrective demandée', 'action'),
    ],
  },

  followUp: {
    defaultMode: 'rapide',
    defaultVisitType: 'suivi terrain',
    objective: 'Reprendre le sujet au même endroit, voir ce qui a changé et ne saisir que l’évolution utile.',
    steps: ['Dernier état', 'Évolution', 'Preuve', 'Action', 'Prochaine étape'],
    quickActions: [
      action('actions', 'Actions ouvertes', 'navigate', { route: 'MissionActions' }),
      action('point', 'Évolution / point', 'point', { preset: point('Évolution du sujet', 'information') }),
      action('photo', 'Photo', 'photo'),
      action('measure', 'Mesure', 'measure'),
    ],
    pointPresets: [
      point('Évolution du sujet', 'information'),
      point('Action non réalisée', 'action', { priority: 'À relancer' }),
      point('Situation aggravée', 'control', { priority: 'À contrôler' }),
      point('Sujet résolu', 'information'),
    ],
  },
});

const TYPES = Object.freeze({
  audit_energetique: {
    base: 'diagnostic',
    label: 'Audit énergétique',
    measures: [
      measure('Index énergie', 'kWh'),
      measure('Puissance instantanée', 'kW'),
      measure('Température extérieure', '°C'),
      measure('Température ambiante', '°C'),
    ],
    quickActions: [
      action('calculation', 'Indicateurs / DJU', 'navigate', { route: 'MissionCalculation' }),
      action('scenario', 'Scénarios énergie', 'navigate', { route: 'MissionScenarios' }),
    ],
  },
  audit_technique: {
    base: 'diagnostic',
    label: 'Audit CVC global',
    measures: [
      measure('Température départ', '°C'), measure('Température retour', '°C'),
      measure('Pression', 'bar'), measure('Débit', 'm³/h'), measure('Puissance', 'kW'),
    ],
    quickActions: [
      action('technical', 'Architecture', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('calculation', 'Calculs 🧮', 'navigate', { route: 'MissionCalculation' }),
    ],
  },
  diagnostic_chaufferie_ss: {
    base: 'diagnostic',
    label: 'Diagnostic chaufferie / sous-station',
    measures: [
      measure('Température départ', '°C'), measure('Température retour', '°C'),
      measure('Pression', 'bar'), measure('Débit', 'm³/h'),
      measure('Fréquence pompe', 'Hz'), measure('Index énergie', 'kWh'),
    ],
    quickActions: [
      action('technical', 'Circuits / réseaux', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('graph', 'Synoptique', 'navigate', { route: 'MissionTechnicalGraph' }),
    ],
    pointPresets: [
      point('Fuite / corrosion / état dégradé', 'control', { priority: 'À contrôler' }),
      point('Valeur ou réglage à vérifier', 'control'),
      point('Équipement non inventorié', 'information'),
    ],
  },
  diagnostic_ecs: {
    base: 'diagnostic',
    label: 'Diagnostic / audit ECS',
    measures: [
      measure('Température production ECS', '°C'),
      measure('Température départ ECS', '°C'),
      measure('Température retour bouclage', '°C'),
      measure('Température pied de colonne', '°C'),
      measure('Température point de puisage', '°C'),
      measure('Pression ECS', 'bar'),
      measure('Débit ECS', 'L/min'),
    ],
    quickActions: [
      action('measurementCampaign', 'Campagne températures', 'navigate', { route: 'MissionMeasurementCampaign' }),
      action('technical', 'Bouclage / réseaux', 'navigate', { route: 'MissionTechnicalStructure' }),
    ],
  },

  // VMC / CTA volontairement laissés sur le socle générique pour respecter la décision projet actuelle.
  diagnostic_ventilation_cta: {
    base: 'diagnostic',
    label: 'Diagnostic VMC / ventilation / CTA',
    measures: [measure('Débit air', 'm³/h'), measure('Vitesse air', 'm/s'), measure('Pression', 'Pa')],
  },

  diagnostic_climatisation_pac: {
    base: 'diagnostic',
    label: 'Diagnostic climatisation / PAC',
    measures: [
      measure('Température soufflage', '°C'), measure('Température reprise', '°C'),
      measure('Intensité', 'A'), measure('Puissance électrique', 'kW'),
      measure('Fréquence variateur', 'Hz'), measure('Niveau sonore', 'dB(A)'),
    ],
    quickActions: [
      action('technical', 'UE ↔ UI / réseaux', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('graph', 'Synoptique UE ↔ UI', 'navigate', { route: 'MissionTechnicalGraph' }),
    ],
  },
  diagnostic_gtb: {
    base: 'diagnostic',
    label: 'Diagnostic régulation / GTB / GTC',
    measures: [
      measure('Consigne', '°C'), measure('Valeur sonde', '°C'),
      measure('Position vanne', '%'), measure('Fréquence variateur', 'Hz'),
    ],
    quickActions: [
      action('technical', 'Architecture régulation', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('graph', 'Chaînes fonctionnelles', 'navigate', { route: 'MissionTechnicalGraph' }),
      action('tests', 'Essais fonctionnels', 'navigate', { route: 'MissionTests' }),
    ],
  },
  diagnostic_cible: {
    base: 'diagnostic',
    label: 'Diagnostic ciblé',
    quickActions: [
      action('fact', 'Fait observé', 'point', { preset: point('Fait observé', 'information') }),
      action('hypothesis', 'Hypothèse à tester', 'point', { preset: point('Hypothèse à tester', 'control', { priority: 'À vérifier' }) }),
      action('tests', 'Essais', 'navigate', { route: 'MissionTests' }),
    ],
  },

  etude_cvc: {
    base: 'study', label: 'Étude CVC / thermique',
    measures: [measure('Température', '°C'), measure('Débit', 'm³/h'), measure('Pression', 'bar'), measure('Puissance', 'kW')],
    quickActions: [action('technical', 'Architecture existante', 'navigate', { route: 'MissionTechnicalStructure' })],
  },
  etude_renovation: {
    base: 'study', label: 'Étude rénovation / remplacement',
    quickActions: [
      action('constraint', 'Contrainte remplacement', 'point', { preset: point('Contrainte de remplacement', 'information') }),
      action('scenario', 'Comparer scénarios', 'navigate', { route: 'MissionScenarios' }),
    ],
  },
  etude_ecs: {
    base: 'study', label: 'Étude ECS',
    measures: [measure('Température ECS', '°C'), measure('Débit ECS', 'L/min'), measure('Pression ECS', 'bar')],
    quickActions: [
      action('technical', 'Production / bouclage', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('calculation', 'Dimensionnement ECS', 'navigate', { route: 'MissionCalculation' }),
    ],
  },
  etude_ventilation_clim: {
    base: 'study',
    label: 'Étude ventilation / climatisation',
    measures: [measure('Débit air', 'm³/h'), measure('Température', '°C')],
  },
  etude_regulation_gtb: {
    base: 'study', label: 'Étude régulation / GTB / GTC',
    quickActions: [
      action('technical', 'Architecture fonctionnelle', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('graph', 'Synoptique régulation', 'navigate', { route: 'MissionTechnicalGraph' }),
    ],
  },

  amo_travaux: { base: 'works', label: 'AMO travaux' },
  moe_travaux: { base: 'works', label: 'MOE travaux' },
  det_chantier: {
    base: 'works', label: 'Suivi chantier / DET',
    quickActions: [
      action('subjects', 'Sujets chantier', 'navigate', { route: 'MissionSubjects' }),
      action('reserve', 'Réserve / observation', 'point', { preset: point('Observation / réserve chantier', 'reserve', { priority: 'À traiter' }) }),
      action('decision', 'Décision rapide', 'point', { preset: point('Décision chantier', 'decision') }),
      action('actions', 'À recontrôler', 'navigate', { route: 'MissionActions' }),
    ],
  },
  commissioning: {
    base: 'reception',
    label: 'Mise en service / commissioning',
    objective: 'Tracer les essais, réglages finaux, écarts et valeurs obtenues sans ressaisir l’inventaire ni les caractéristiques déjà connues.',
    steps: ['Équipement', 'Protocole', 'Essai', 'Mesures', 'Réglage final', 'Écart / validation'],
    measures: [measure('Consigne', '°C'), measure('Température', '°C'), measure('Débit', 'm³/h'), measure('Pression', 'bar'), measure('Fréquence', 'Hz')],
    equipmentVerificationStatuses: [
      ['confirme', 'Conforme / présent'],
      ['different', 'Différent'],
      ['inaccessible', 'Inaccessible'],
      ['a_verifier', 'À vérifier'],
    ],
    equipmentLifecycleStatuses: [
      ['installe', 'Installé'],
      ['controle', 'Contrôlé'],
      ['avec_reserve', 'Avec réserve'],
      ['mis_en_service', 'Mis en service'],
    ],
    quickActions: [
      action('receptionBoard', 'Tableau mise en service', 'navigate', { route: 'MissionReceptionBoard' }),
      action('tests', 'Essai fonctionnel', 'navigate', { route: 'MissionTests' }),
      action('measure', 'Mesure', 'measure'),
      action('equipment', 'Équipement / réglages', 'navigate', { route: 'MissionEquipment' }),
      action('documents', 'PV / documents', 'navigate', { route: 'MissionDocuments' }),
      action('graph', 'Synoptique', 'navigate', { route: 'MissionTechnicalGraph' }),
      action('actions', 'Écarts à reprendre', 'navigate', { route: 'MissionActions' }),
    ],
    pointPresets: [
      point('Réponse différente de l’attendu', 'control', { priority: 'À régler' }),
      point('Essai impossible / non réalisé', 'information'),
      point('Réglage final à confirmer', 'action'),
    ],
  },
  opr_reception: {
    base: 'reception',
    label: 'OPR / réception',
    objective: 'Comparer rapidement le prévu, l’installé et le fonctionnement constaté puis créer les réserves au fil du contrôle.',
    steps: ['Prévu', 'Installé', 'Contrôle', 'Essai', 'Réserve / preuve', 'Validation'],
    equipmentVerificationStatuses: [
      ['confirme', 'Conforme au prévu'],
      ['different', 'Différent'],
      ['non_retrouve', 'Non retrouvé'],
      ['inaccessible', 'Inaccessible'],
      ['a_verifier', 'À vérifier'],
    ],
    equipmentLifecycleStatuses: [
      ['installe', 'Installé'],
      ['controle', 'Contrôlé'],
      ['avec_reserve', 'Avec réserve'],
      ['receptionne', 'Réceptionné'],
    ],
    quickActions: [
      action('receptionBoard', 'Tableau OPR', 'navigate', { route: 'MissionReceptionBoard' }),
      action('equipment', 'Ouvrages / équipements', 'navigate', { route: 'MissionEquipment' }),
      action('tests', 'Essais OPR', 'navigate', { route: 'MissionTests' }),
      action('reserve', '＋ Réserve OPR', 'point', { preset: point('Réserve OPR / réception', 'reserve', { priority: 'À lever' }) }),
      action('actions', 'Réserves / actions', 'navigate', { route: 'MissionActions' }),
      action('reserveClearance', 'Levée / recontrôle', 'navigate', { route: 'MissionReserveClearance' }),
      action('documents', 'DOE / PV / récolement', 'navigate', { route: 'MissionDocuments' }),
      action('signature', 'Signature / PV', 'navigate', { route: 'MissionSignature' }),
    ],
  },
  levee_reserves: {
    base: 'reception', label: 'Levée de réserves',
    objective: 'Reprendre les réserves existantes, constater seulement leur évolution et produire la preuve avant / après.',
    steps: ['Réserve initiale', 'Contrôle', 'Photo après', 'Levée / maintien', 'Suite'],
    quickActions: [
      action('reserveClearance', 'Recontrôle rapide', 'navigate', { route: 'MissionReserveClearance' }),
      action('actions', 'Réserves / actions', 'navigate', { route: 'MissionActions' }),
      action('photo', 'Photo libre', 'photo'),
      action('point', 'Nouvelle réserve', 'point', { preset: point('Nouvelle réserve constatée au recontrôle', 'reserve', { priority: 'À traiter' }) }),
    ],
  },
  passation_travaux_exploitant: {
    base: 'passation',
    label: 'Passation travaux → exploitant',
    objective: 'Passer de l’ouvrage réceptionné à une prise en main exploitable : inventaire, démonstration, réglages, accès, documents et éléments restant à remettre.',
    steps: ['Inventaire', 'Fonctionnement', 'Réglages', 'Documents / accès', 'Écarts', 'Signature'],
    equipmentLifecycleStatuses: [
      ['receptionne', 'Réceptionné'],
      ['avec_reserve', 'Avec réserve'],
      ['mis_en_service', 'Mis en service'],
    ],
    quickActions: [
      action('receptionBoard', 'Tableau passation', 'navigate', { route: 'MissionReceptionBoard' }),
      action('equipment', 'Inventaire contradictoire', 'navigate', { route: 'MissionEquipment' }),
      action('tests', 'Démonstration / essais', 'navigate', { route: 'MissionTests' }),
      action('documents', 'DOE / accès / notices', 'navigate', { route: 'MissionDocuments' }),
      action('actions', 'Éléments manquants', 'navigate', { route: 'MissionActions' }),
      action('signature', 'Signature passation', 'navigate', { route: 'MissionSignature' }),
    ],
    pointPresets: [
      point('Équipement différent de l’inventaire remis', 'control', { priority: 'À clarifier' }),
      point('Document / accès restant à remettre', 'request', { priority: 'À transmettre' }),
      point('Réglage / fonctionnement à reprendre', 'action', { priority: 'À traiter' }),
    ],
  },

  suivi_technique: { base: 'followUp', label: 'Suivi technique ciblé' },
  controle_exploitation: {
    base: 'control', label: 'Contrôle ponctuel d’exploitation',
    measures: [measure('Température', '°C'), measure('Pression', 'bar'), measure('Débit', 'm³/h'), measure('Consigne', '°C')],
    pointPresets: [
      point('Écart d’exploitation observé', 'control', { priority: 'À traiter' }),
      point('Action exploitant attendue', 'action'),
      point('Réglage à contrôler', 'control'),
      point('Document / relevé exploitant manquant', 'request'),
    ],
  },
  assistance_p2_p3: {
    base: 'diagnostic',
    label: 'Assistance exploitation / P2-P3',
    objective: 'Croiser inventaire, état, historique, obligations et renouvellements pour préparer une lecture contractuelle et patrimoniale exploitable.',
    steps: ['Inventaire', 'Périmètre', 'État', 'Historique', 'P3 / budget'],
    quickActions: [
      action('equipment', 'Inventaire P2/P3', 'navigate', { route: 'MissionEquipment' }),
      action('p3Dashboard', 'Projection P2 / P3', 'navigate', { route: 'MissionP3Dashboard' }),
      action('sensitive', 'Équipement sensible', 'point', { preset: point('Équipement sensible / renouvellement à anticiper', 'control', { priority: 'À analyser' }) }),
      action('scenario', 'Scénarios renouvellement', 'navigate', { route: 'MissionScenarios' }),
      action('calculation', 'Calculs / coûts', 'navigate', { route: 'MissionCalculation' }),
    ],
  },
  plan_action: {
    base: 'followUp', label: 'Plan d’action',
    quickActions: [
      action('actions', 'Tableau actions', 'navigate', { route: 'MissionActions' }),
      action('action', 'Nouvelle action', 'point', { preset: point('Nouvelle action', 'action') }),
      action('decision', 'Décision', 'point', { preset: point('Décision / arbitrage', 'decision') }),
    ],
  },
  suivi_sanitaire: {
    base: 'control', label: 'Suivi sanitaire ponctuel',
    measures: [measure('Température ECS', '°C'), measure('Température retour bouclage', '°C')],
    pointPresets: [
      point('Résultat / document sanitaire à analyser', 'control', { priority: 'À contrôler' }),
      point('Point de prélèvement / accès à confirmer', 'information'),
      point('Action à demander', 'action'),
    ],
  },
  preallumage_reprise_saison: {
    base: 'control',
    label: 'Pré-allumage / reprise de saison',
    objective: 'Vérifier ponctuellement la disponibilité de l’installation pour la reprise de saison sans réutiliser la trame de Visite technique récurrente.',
    steps: ['Disponibilité', 'Équipements', 'Réglages', 'Essais', 'Réserves'],
    measures: [measure('Température départ', '°C'), measure('Température retour', '°C'), measure('Pression', 'bar')],
    quickActions: [
      action('equipment', 'Équipements Mission', 'navigate', { route: 'MissionEquipment' }),
      action('tests', 'Essais reprise', 'navigate', { route: 'MissionTests' }),
      action('point', 'Réserve reprise', 'point', { preset: point('Point à traiter avant / pendant reprise de saison', 'control', { priority: 'À traiter' }) }),
    ],
  },
  expertise_sinistre: {
    base: 'diagnostic',
    label: 'Expertise / sinistre',
    objective: 'Séparer strictement les faits, preuves, hypothèses, investigations et conclusions pour conserver une chronologie exploitable et opposable.',
    steps: ['État initial', 'Faits', 'Preuves', 'Mesures', 'Hypothèses', 'Conclusion'],
    quickActions: [
      action('expertiseBoard', 'Chronologie expertise', 'navigate', { route: 'MissionExpertise' }),
      action('photo', 'Photo horodatée', 'photo'),
      action('measure', 'Mesure', 'measure'),
      action('documents', 'Document / preuve', 'navigate', { route: 'MissionDocuments' }),
      action('plan', 'Localiser', 'navigate', { route: 'MissionPlan' }),
    ],
    pointPresets: [
      point('Élément factuel à compléter', 'request', { priority: 'À documenter' }),
      point('Investigation complémentaire', 'action', { priority: 'À investiguer' }),
      point('Information tierce à confirmer', 'control', { priority: 'À confirmer' }),
    ],
  },

  campagne_technique: { base: 'campaign', label: 'Campagne technique' },
  campagne_mesures: { base: 'measurementCampaign', label: 'Campagne de mesures' },
  inventaire_patrimonial: {
    base: 'campaign',
    label: 'Inventaire patrimonial',
    equipmentVerificationStatuses: [
      ['confirme', 'Confirmé'],
      ['different', 'Différent'],
      ['inaccessible', 'Inaccessible'],
      ['a_verifier', 'À vérifier'],
    ],
    objective: 'Créer un inventaire rapide mais structuré, enrichissable ensuite sans refaire le terrain.',
    steps: ['Site', 'Local', 'Équipement', 'Plaque / photo', 'État'],
    quickActions: [
      action('equipment', '＋ Équipement', 'navigate', { route: 'MissionEquipment' }),
      action('photo', 'Photo', 'photo'),
      action('technical', 'Architecture', 'navigate', { route: 'MissionTechnicalStructure' }),
      action('map', 'Carte', 'navigate', { route: 'MissionMap' }),
    ],
  },
  inventaire_passation: { base: 'passation', label: 'Inventaire / passation' },
  etat_lieux_multisites: { base: 'campaign', label: 'État des lieux multi-sites' },
  audit_multisites: {
    base: 'campaign',
    label: 'Audit multi-sites',
    quickActions: [
      action('map', 'Carte / progression', 'navigate', { route: 'MissionMap' }),
      action('scenario', 'Scénarios consolidés', 'navigate', { route: 'MissionScenarios' }),
      action('equipment', 'Inventaire', 'navigate', { route: 'MissionEquipment' }),
    ],
  },

  controle_reglementaire: { base: 'control', label: 'Contrôle réglementaire ponctuel' },
  securite_accessibilite: {
    base: 'control',
    label: 'Sécurité / accessibilité',
    pointPresets: [
      point('Écart visible à traiter', 'control', { priority: 'À traiter' }),
      point('Situation non vérifiable', 'information'),
      point('Preuve / document attendu', 'request'),
    ],
  },
  controle_sanitaire: { base: 'control', label: 'Contrôle sanitaire ponctuel' },
  controle_technique: { base: 'control', label: 'Contrôle technique ciblé' },
});

function mergeUnique(base = [], extra = [], keyGetter = (item) => item.key || item.label) {
  const out = [];
  const seen = new Set();
  for (const item of [...extra, ...base]) {
    const key = keyGetter(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function getMissionFieldPlaybook(missionType) {
  const type = TYPES[missionType] || null;
  const base = BASE[type?.base] || BASE.diagnostic;
  return {
    type: missionType || null,
    label: type?.label || 'Mission terrain',
    defaultMode: type?.defaultMode || base.defaultMode || 'standard',
    defaultVisitType: type?.defaultVisitType || base.defaultVisitType || 'visite terrain',
    objective: type?.objective || base.objective,
    steps: type?.steps || base.steps,
    quickActions: mergeUnique(base.quickActions, type?.quickActions, (item) => item.key),
    measures: mergeUnique(base.measures || [], type?.measures || [], (item) => item.type + '|' + item.unit),
    pointPresets: mergeUnique(base.pointPresets || [], type?.pointPresets || [], (item) => item.label),
    equipmentVerificationStatuses: type?.equipmentVerificationStatuses || base.equipmentVerificationStatuses || [],
    equipmentLifecycleStatuses: type?.equipmentLifecycleStatuses || base.equipmentLifecycleStatuses || [],
  };
}

export const MISSION_FIELD_PLAYBOOK_TYPES = Object.freeze(Object.keys(TYPES));
