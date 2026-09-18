const BASE = Object.freeze({
  diagnostic: {
    label: 'Rapport de diagnostic',
    order: ['contexte','inventaire','architecture','visites','mesures','essais','points','actions','calculs','scenarios','documents','photos'],
    titles: {
      inventaire: 'Inventaire et état des équipements',
      architecture: 'Architecture technique observée',
      points: 'Constats, écarts et points à suivre',
      actions: 'Plan d’actions proposé',
    },
  },
  study: {
    label: 'Rapport d’étude',
    order: ['contexte','inventaire','architecture','mesures','calculs','scenarios','points','actions','documents','visites','photos'],
    titles: {
      inventaire: 'Existant pris en compte',
      architecture: 'Architecture de l’existant',
      calculs: 'Dimensionnements et calculs',
      scenarios: 'Scénarios et variantes',
      points: 'Contraintes, hypothèses et points à confirmer',
    },
  },
  works: {
    label: 'Compte rendu de suivi de travaux',
    order: ['contexte','visites','sujets','cycle_projet','points','actions','historique_actions','essais','documents','revue_documents','inventaire','architecture','mesures','photos','calculs','scenarios'],
    titles: {
      visites: 'Interventions / visites de chantier',
      sujets: 'Sujets, constats et décisions de chantier',
      points: 'Observations, réserves et décisions',
      actions: 'Actions, responsables et échéances',
      documents: 'Documents / VISA / éléments attendus',
    },
  },
  reception: {
    label: 'Compte rendu OPR / réception',
    order: ['contexte','visites','inventaire','cycle_projet','essais','points','actions','historique_actions','documents','revue_documents','mesures','photos','architecture','calculs','scenarios'],
    titles: {
      points: 'Réserves et écarts constatés',
      actions: 'Suivi des réserves',
      essais: 'Essais et vérifications',
      documents: 'Documents de réception attendus',
    },
  },
  passation: {
    label: 'Rapport de passation',
    order: ['contexte','inventaire','cycle_projet','architecture','visites','points','mesures','essais','actions','documents','photos','calculs','scenarios'],
    titles: {
      inventaire: 'Inventaire contradictoire',
      points: 'Écarts entre attendu et terrain',
      actions: 'Actions et éléments à régulariser',
      documents: 'Documents / accès / éléments remis ou manquants',
    },
  },
  followUp: {
    label: 'Compte rendu de suivi',
    order: ['contexte','visites','sujets','points','actions','historique_actions','mesures','documents','photos','inventaire','architecture','essais','calculs','scenarios'],
    titles: {
      sujets: 'Historique des sujets suivis',
      points: 'Évolution des points à suivre',
      actions: 'Actions et prochaines étapes',
    },
  },
  campaign: {
    label: 'Rapport de campagne',
    order: ['contexte','visites','inventaire','mesures','points','actions','photos','architecture','documents','calculs','scenarios','essais'],
    titles: {
      visites: 'Progression de la campagne',
      inventaire: 'Données collectées / inventaire',
      points: 'Écarts et particularités locales',
      actions: 'Actions issues de la campagne',
    },
  },
  measurement: {
    label: 'Rapport de campagne de mesures',
    order: ['contexte','visites','mesures','points','actions','photos','documents','inventaire','architecture','calculs','scenarios','essais'],
    titles: {
      mesures: 'Résultats de la campagne de mesures',
      points: 'Valeurs / situations à contrôler',
    },
  },
  control: {
    label: 'Rapport de contrôle ciblé',
    order: ['contexte','visites','essais','points','actions','mesures','documents','photos','inventaire','architecture','calculs','scenarios'],
    titles: {
      points: 'Résultats, écarts et réserves',
      actions: 'Actions correctives / suites',
      documents: 'Références et preuves documentaires',
    },
  },
  expertise: {
    label: 'Rapport d’expertise technique',
    order: ['contexte','visites','photos','mesures','points','actions','documents','inventaire','architecture','calculs','scenarios','essais'],
    titles: {
      photos: 'Éléments factuels et preuves photographiques',
      points: 'Faits, hypothèses et investigations',
      mesures: 'Mesures et relevés',
    },
  },
});

const TYPE_GROUP = Object.freeze({
  audit_energetique: 'diagnostic',
  audit_technique: 'diagnostic',
  diagnostic_chaufferie_ss: 'diagnostic',
  diagnostic_ecs: 'diagnostic',
  diagnostic_ventilation_cta: 'diagnostic',
  diagnostic_climatisation_pac: 'diagnostic',
  diagnostic_gtb: 'diagnostic',
  diagnostic_cible: 'diagnostic',

  etude_cvc: 'study',
  etude_renovation: 'study',
  etude_ecs: 'study',
  etude_ventilation_clim: 'study',
  etude_regulation_gtb: 'study',

  amo_travaux: 'works',
  moe_travaux: 'works',
  det_chantier: 'works',
  commissioning: 'reception',
  opr_reception: 'reception',
  levee_reserves: 'reception',
  passation_travaux_exploitant: 'passation',

  suivi_technique: 'followUp',
  controle_exploitation: 'control',
  assistance_p2_p3: 'diagnostic',
  plan_action: 'followUp',
  suivi_sanitaire: 'control',
  preallumage_reprise_saison: 'control',
  expertise_sinistre: 'expertise',

  campagne_technique: 'campaign',
  campagne_mesures: 'measurement',
  inventaire_patrimonial: 'campaign',
  inventaire_passation: 'passation',
  etat_lieux_multisites: 'campaign',
  audit_multisites: 'campaign',

  controle_reglementaire: 'control',
  securite_accessibilite: 'control',
  controle_sanitaire: 'control',
  controle_technique: 'control',
});

const OVERRIDES = Object.freeze({
  audit_energetique: {
    label: 'Rapport d’audit énergétique',
    titles: { mesures: 'Consommations, mesures et indicateurs', scenarios: 'Scénarios d’amélioration énergétique' },
  },
  diagnostic_chaufferie_ss: {
    label: 'Rapport de diagnostic chaufferie / sous-station',
    titles: { architecture: 'Production, circuits et architecture hydraulique', mesures: 'Fonctionnement, mesures et réglages' },
  },
  diagnostic_ecs: {
    label: 'Rapport de diagnostic / audit ECS',
    titles: { architecture: 'Production, stockage, distribution et bouclage', mesures: 'Températures, débits et relevés ECS' },
  },
  diagnostic_climatisation_pac: {
    label: 'Rapport de diagnostic climatisation / PAC',
    titles: { architecture: 'Architecture UE / UI / réseaux', mesures: 'Fonctionnement et relevés climatisation / PAC' },
  },
  diagnostic_gtb: {
    label: 'Rapport de diagnostic régulation / GTB / GTC',
    titles: { architecture: 'Architecture fonctionnelle et communications', essais: 'Essais de régulation / communication' },
  },
  diagnostic_cible: {
    label: 'Rapport de diagnostic ciblé',
    titles: { points: 'Faits, hypothèses et points à vérifier' },
  },
  etude_renovation: {
    label: 'Étude de rénovation / remplacement',
    titles: { inventaire: 'Équipement / ouvrage existant', scenarios: 'Comparaison des scénarios de remplacement' },
  },
  etude_ecs: {
    label: 'Étude ECS',
    titles: { architecture: 'Existant ECS et bouclage', calculs: 'Dimensionnement ECS' },
  },
  etude_regulation_gtb: {
    label: 'Étude régulation / GTB / GTC',
    titles: { architecture: 'Architecture de régulation / supervision projetée' },
  },
  det_chantier: {
    label: 'Compte rendu de visite DET',
    titles: { points: 'Observations, réserves et décisions de chantier' },
  },
  commissioning: {
    label: 'Procès-verbal de mise en service / commissioning',
    titles: { essais: 'Essais fonctionnels et réglages', points: 'Écarts de mise en service' },
  },
  opr_reception: {
    label: 'Procès-verbal OPR / réception',
    titles: { points: 'Réserves OPR / réception' },
  },
  levee_reserves: {
    label: 'Compte rendu de levée de réserves',
    titles: { points: 'Réserves maintenues / partiellement levées', actions: 'Suivi de levée' },
  },
  passation_travaux_exploitant: {
    label: 'Procès-verbal de passation travaux → exploitant',
  },
  assistance_p2_p3: {
    label: 'Analyse exploitation / P2-P3',
    order: ['contexte','inventaire','projection_p3','architecture','visites','mesures','essais','points','actions','calculs','scenarios','documents','photos'],
    titles: {
      inventaire: 'Inventaire contractuel / patrimonial',
      projection_p3: 'Projection indicative des renouvellements P3',
      points: 'Équipements sensibles et écarts de périmètre',
      scenarios: 'Scénarios de renouvellement / P3',
    },
  },
  preallumage_reprise_saison: {
    label: 'Compte rendu de reprise de saison',
    titles: { essais: 'Essais ponctuels de reprise de saison' },
  },
  expertise_sinistre: {
    label: 'Rapport d’expertise / sinistre',
  },
  campagne_mesures: {
    label: 'Rapport de campagne de mesures',
  },
  inventaire_patrimonial: {
    label: 'Inventaire patrimonial',
    titles: { inventaire: 'Inventaire patrimonial détaillé' },
  },
  inventaire_passation: {
    label: 'Inventaire / passation contradictoire',
  },
  audit_multisites: {
    label: 'Rapport d’audit multi-sites',
  },
});

export function getMissionReportRecipe(missionType) {
  const group = TYPE_GROUP[missionType] || 'diagnostic';
  const base = BASE[group] || BASE.diagnostic;
  const override = OVERRIDES[missionType] || {};
  return {
    group,
    label: override.label || base.label,
    order: override.order || base.order,
    titles: { ...(base.titles || {}), ...(override.titles || {}) },
  };
}

export const MISSION_REPORT_RECIPE_TYPES = Object.freeze(Object.keys(TYPE_GROUP));
