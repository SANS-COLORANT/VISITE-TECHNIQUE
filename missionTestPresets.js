function step(label, expectedText, referenceValue = null, unit = null, tolerancePct = null) {
  return { label, expectedText, referenceValue, unit, tolerancePct };
}

const GENERIC = Object.freeze({
  control: [
    {
      key: 'controle_cible',
      label: 'Contrôle ciblé',
      type: 'control',
      description: 'Vérification factuelle d’un point technique avec résultat attendu et observation.',
      steps: [
        step('Identifier le point contrôlé', 'Repère / équipement / zone confirmé'),
        step('Vérifier l’état ou le fonctionnement', 'État observé et traçable'),
        step('Rattacher une preuve si utile', 'Photo / mesure / document disponible'),
        step('Qualifier le résultat', 'OK, écart, non testé ou impossible'),
      ],
    },
  ],
  commissioning: [
    {
      key: 'mise_en_service_fonctionnelle',
      label: 'Mise en service fonctionnelle',
      type: 'commissioning',
      description: 'Séquence générique de mise en service ; à compléter par les essais propres à l’équipement.',
      steps: [
        step('Disponibilité / alimentation', 'Équipement disponible et alimenté'),
        step('Commande locale', 'Commande prise en compte'),
        step('Réponse de l’équipement', 'Réponse conforme à la commande'),
        step('Retour d’état / information', 'Retour cohérent ou écart identifié'),
        step('Réglage final', 'Consigne / réglage final tracé'),
      ],
    },
  ],
});

const PRESETS = Object.freeze({
  diagnostic_chaufferie_ss: [
    {
      key: 'pompe_circulateur',
      label: 'Essai pompe / circulateur',
      type: 'hydraulic',
      description: 'Essai ponctuel de fonctionnement sans conclure automatiquement au diagnostic.',
      steps: [
        step('Commande marche', 'La pompe démarre'),
        step('Retour marche / défaut', 'Retour cohérent avec la commande'),
        step('Vibration / bruit visible', 'Aucune anomalie manifeste'),
        step('Fréquence / vitesse', 'Valeur relevée si disponible', null, 'Hz'),
        step('Pression / débit disponible', 'Valeur relevée si disponible'),
      ],
    },
    {
      key: 'vanne_motorisee',
      label: 'Essai vanne motorisée',
      type: 'regulation',
      description: 'Contrôle commande → mouvement → retour / effet sur le circuit.',
      steps: [
        step('Commande ouverture', 'La vanne s’ouvre'),
        step('Commande fermeture', 'La vanne se ferme'),
        step('Retour de position', 'Retour cohérent si disponible'),
        step('Effet sur le circuit', 'Variation cohérente observée'),
      ],
    },
    {
      key: 'regulation_chauffage',
      label: 'Essai régulation chauffage',
      type: 'regulation',
      description: 'Chaîne simple consigne → régulateur → actionneur → effet.',
      steps: [
        step('Consigne affichée', 'Consigne identifiée'),
        step('Valeur sonde', 'Valeur cohérente / écart tracé'),
        step('Commande actionneur', 'Commande cohérente'),
        step('Réponse installation', 'Effet observé ou non vérifiable'),
      ],
    },
  ],

  diagnostic_climatisation_pac: [
    {
      key: 'fonctionnement_ue_ui',
      label: 'Essai fonctionnel UE ↔ UI',
      type: 'climatisation',
      description: 'Contrôle visuel et fonctionnel d’une liaison UE / UI.',
      steps: [
        step('Demande chaud / froid', 'Demande prise en compte'),
        step('Démarrage unité intérieure', 'UI en fonctionnement'),
        step('Démarrage unité extérieure', 'UE en fonctionnement'),
        step('Soufflage / reprise', 'Écart de température observé'),
        step('Condensats', 'Évacuation observée sans anomalie manifeste'),
        step('Défaut / alarme', 'Aucun défaut ou défaut tracé'),
      ],
    },
  ],

  diagnostic_gtb: [
    {
      key: 'chaine_regulation',
      label: 'Chaîne sonde → régulateur → actionneur',
      type: 'gtb',
      description: 'Essai fonctionnel d’une chaîne de régulation complète.',
      steps: [
        step('Valeur sonde', 'Valeur disponible et plausible'),
        step('Consigne régulateur', 'Consigne identifiée'),
        step('Sortie / commande', 'Commande cohérente'),
        step('Actionneur / vanne', 'Mouvement observé ou retour disponible'),
        step('Effet process', 'Réponse observée ou non vérifiable'),
      ],
    },
    {
      key: 'communication_gtb',
      label: 'Communication / télégestion',
      type: 'gtb',
      description: 'Contrôle d’accessibilité et communication sans modifier la configuration existante.',
      steps: [
        step('Accès supervision', 'Accès disponible ou statut tracé'),
        step('Équipement communicant', 'Communication disponible ou écart tracé'),
        step('Valeurs remontées', 'Valeurs utiles disponibles'),
        step('Commande distante', 'Testée uniquement si autorisée'),
        step('Alarmes', 'Alarmes visibles / acquittements tracés'),
      ],
    },
  ],

  commissioning: [
    ...GENERIC.commissioning,
    {
      key: 'commissioning_securites',
      label: 'Sécurités / asservissements',
      type: 'commissioning',
      description: 'Essai des séquences et asservissements prévus, lorsque le test est autorisé.',
      steps: [
        step('Condition de départ', 'Condition initiale tracée'),
        step('Déclenchement / sollicitation', 'Sollicitation réalisée ou impossible'),
        step('Réaction attendue', 'Réponse conforme à l’attendu'),
        step('Réarmement', 'Retour à l’état normal'),
      ],
    },
  ],

  opr_reception: [
    {
      key: 'opr_equipement',
      label: 'OPR équipement',
      type: 'opr',
      description: 'Contrôle rapide prévu ↔ installé ↔ fonctionnel.',
      steps: [
        step('Équipement installé', 'Présent et identifié'),
        step('Conformité au prévu', 'Conforme, différent ou à contrôler'),
        step('État / finition', 'État observable acceptable ou réserve créée'),
        step('Essai fonctionnel', 'Fonctionnement vérifié ou statut tracé'),
        step('Document / repérage', 'Document / étiquetage disponible si attendu'),
      ],
    },
    {
      key: 'opr_regulation',
      label: 'OPR régulation / commande',
      type: 'opr',
      description: 'Vérification simple de commande et retour d’état.',
      steps: [
        step('Commande', 'Commande prise en compte'),
        step('Réponse équipement', 'Réponse cohérente'),
        step('Retour / information', 'Retour disponible ou écart tracé'),
        step('Consigne finale', 'Consigne finale tracée'),
      ],
    },
  ],

  levee_reserves: [
    {
      key: 'recontrole_reserve',
      label: 'Recontrôle d’une réserve',
      type: 'reserve',
      description: 'Vérification factuelle avant décision levée / maintien / partielle.',
      steps: [
        step('Réserve initiale identifiée', 'Réserve et preuve initiales retrouvées'),
        step('Correction observée', 'Correction réalisée ou non'),
        step('Essai si nécessaire', 'Essai réalisé ou non applicable'),
        step('Photo après', 'Preuve après disponible si utile'),
        step('Statut final', 'Levée, maintenue, partielle ou inaccessible'),
      ],
    },
  ],

  passation_travaux_exploitant: [
    {
      key: 'passation_fonctionnelle',
      label: 'Passation fonctionnelle',
      type: 'handover',
      description: 'Contrôle de fonctionnement représentatif lors de la passation.',
      steps: [
        step('Équipement identifié', 'Équipement / repère confirmé'),
        step('Commande / fonctionnement', 'Fonctionnement démontré'),
        step('Régulation / consignes', 'Réglages accessibles et expliqués'),
        step('Alarmes / défauts', 'État des alarmes tracé'),
        step('Documents / accès', 'Éléments remis ou manquants tracés'),
      ],
    },
  ],

  controle_exploitation: [
    {
      key: 'controle_exploitation',
      label: 'Contrôle exploitation',
      type: 'operation',
      description: 'Contrôle ponctuel des réglages, état, actions exploitant et éléments documentaires.',
      steps: [
        step('État / disponibilité', 'Équipement disponible ou écart tracé'),
        step('Réglages / consignes', 'Valeurs relevées'),
        step('Entretien visible', 'État observé'),
        step('Actions connues', 'Actions en cours / à lancer tracées'),
        step('Documents / relevés', 'Éléments disponibles ou manquants'),
      ],
    },
  ],

  assistance_p2_p3: [
    {
      key: 'controle_p3',
      label: 'Contrôle équipement P3',
      type: 'p3',
      description: 'Lecture patrimoniale : présence, état, âge, maintenabilité et besoin de renouvellement.',
      steps: [
        step('Équipement identifié', 'Identification confirmée'),
        step('Périmètre / inventaire', 'Présence dans l’inventaire contractuel vérifiée'),
        step('État / vétusté', 'État tracé'),
        step('Disponibilité pièces', 'Information disponible ou à récupérer'),
        step('Renouvellement', 'Besoin / échéance / coût à analyser'),
      ],
    },
  ],

  preallumage_reprise_saison: [
    {
      key: 'reprise_saison_mission',
      label: 'Essai ponctuel de reprise de saison',
      type: 'season_restart_mission',
      description: 'Protocole Mission ponctuel, distinct des points de Visite technique récurrente.',
      steps: [
        step('Disponibilité installation', 'Installation accessible et disponible'),
        step('Mise en fonctionnement', 'Démarrage possible ou écart tracé'),
        step('Pression / température', 'Valeurs relevées si disponibles'),
        step('Régulation / consigne', 'Consigne et réponse observées'),
        step('Réserve avant exploitation', 'Aucune réserve ou réserve Mission créée'),
      ],
    },
  ],

  controle_reglementaire: GENERIC.control,
  securite_accessibilite: GENERIC.control,
  controle_sanitaire: GENERIC.control,
  controle_technique: GENERIC.control,
  diagnostic_cible: GENERIC.control,
});

export function getMissionTestPresets(missionType) {
  return PRESETS[missionType] || [];
}

export const MISSION_TEST_PRESET_TYPES = Object.freeze(Object.keys(PRESETS));
