function scenario(key, label, description, benefits = '', constraints = '') {
  return { key, label, description, benefits, constraints };
}

const GENERIC_STUDY = Object.freeze([
  scenario(
    'maintien_optimisation',
    'Scénario A · Maintien / optimisation',
    'Conserver autant que possible l’existant et traiter les réglages, adaptations ou renouvellements ciblés nécessaires.',
    'Investissement initial limité ; continuité avec l’existant.',
    'Dépend de l’état réel, de l’obsolescence et de la disponibilité des pièces.'
  ),
  scenario(
    'remplacement_equivalent',
    'Scénario B · Remplacement / rénovation ciblée',
    'Renouveler les ouvrages concernés avec une solution répondant au besoin actuel et aux contraintes du site.',
    'Renouvellement patrimonial ciblé ; amélioration possible des performances.',
    'Accès, raccordements, maintien de service et travaux induits à confirmer.'
  ),
  scenario(
    'renovation_plus_large',
    'Scénario C · Rénovation élargie',
    'Étudier une intervention plus globale sur le système, les réseaux, la régulation et les ouvrages associés.',
    'Permet d’étudier une amélioration globale plutôt qu’un remplacement isolé.',
    'Investissement, phasage et coordination avec les autres lots à préciser.'
  )
]);

const PRESETS = Object.freeze({
  audit_energetique: [
    scenario(
      'corriger_existant',
      'Scénario A · Optimisation de l’existant',
      'Réglages, programmation, corrections de dysfonctionnements et actions à faible impact travaux.'
    ),
    scenario(
      'renovation_ciblee',
      'Scénario B · Rénovation ciblée',
      'Renouvellements et améliorations ciblés sur les postes prioritaires.'
    ),
    scenario(
      'renovation_globale',
      'Scénario C · Rénovation globale',
      'Combinaison cohérente d’actions sur besoins, production, distribution, régulation et énergie.'
    )
  ],
  audit_technique: GENERIC_STUDY,
  diagnostic_chaufferie_ss: GENERIC_STUDY,
  diagnostic_ecs: GENERIC_STUDY,
  diagnostic_climatisation_pac: GENERIC_STUDY,
  diagnostic_gtb: GENERIC_STUDY,
  diagnostic_cible: GENERIC_STUDY,

  etude_cvc: GENERIC_STUDY,
  etude_renovation: GENERIC_STUDY,
  etude_ecs: [
    scenario(
      'ecs_optimisation',
      'Scénario A · Optimisation ECS existante',
      'Conserver la production principale et améliorer réglages, bouclage, équilibrage ou organes ciblés.'
    ),
    scenario(
      'ecs_remplacement',
      'Scénario B · Remplacement production / stockage',
      'Renouveler la production ou le stockage selon les besoins et contraintes vérifiés.'
    ),
    scenario(
      'ecs_reconfiguration',
      'Scénario C · Reconfiguration ECS',
      'Étudier une architecture ECS différente incluant production, stockage, bouclage et régulation.'
    )
  ],
  etude_ventilation_clim: GENERIC_STUDY,
  etude_regulation_gtb: [
    scenario(
      'gtb_maintien',
      'Scénario A · Maintien / remise en service',
      'Conserver l’architecture existante et restaurer les fonctions utiles.'
    ),
    scenario(
      'gtb_migration',
      'Scénario B · Migration ciblée',
      'Renouveler les automates, passerelles ou supervision nécessaires en conservant les équipements compatibles.'
    ),
    scenario(
      'gtb_refonte',
      'Scénario C · Refonte architecture',
      'Étudier une architecture de régulation / supervision renouvelée et interopérable.'
    )
  ],
  assistance_p2_p3: [
    scenario(
      'p3_prioritaire',
      'Scénario A · Renouvellements prioritaires',
      'Regrouper les renouvellements présentant la priorité patrimoniale ou d’exploitation la plus forte.'
    ),
    scenario(
      'p3_pluriannuel',
      'Scénario B · Plan pluriannuel',
      'Répartir les renouvellements sur plusieurs exercices selon état, durée de vie, coût et criticité.'
    ),
    scenario(
      'p3_renovation',
      'Scénario C · Rénovation coordonnée',
      'Regrouper certains renouvellements dans une opération de rénovation cohérente.'
    )
  ],
  audit_multisites: [
    scenario(
      'multisite_priorites',
      'Scénario A · Sites prioritaires',
      'Traiter en priorité les sites présentant les écarts ou besoins les plus significatifs.'
    ),
    scenario(
      'multisite_programme',
      'Scénario B · Programme pluriannuel',
      'Planifier les interventions par vagues et par familles techniques.'
    ),
    scenario(
      'multisite_global',
      'Scénario C · Programme global',
      'Étudier une stratégie consolidée sur l’ensemble du patrimoine audité.'
    )
  ]
});

export function getMissionScenarioPresets(missionType) {
  return PRESETS[missionType] || [];
}

export const MISSION_SCENARIO_PRESET_TYPES = Object.freeze(Object.keys(PRESETS));
