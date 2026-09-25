const PRESETS = Object.freeze({
  assistance_p2_p3: [
    {
      kind: 'exploitation',
      label: 'Exploitation',
      description: 'Suivi du contrat, visites, écarts d’exploitation, réglages, maintenance et actions récurrentes.'
    },
    {
      kind: 'energie',
      label: 'Énergie',
      description: 'Consommations, dérives, bilans, indicateurs, données climatiques et actions d’optimisation.'
    },
    {
      kind: 'p3',
      label: 'P3 / renouvellements',
      description:
        'Inventaire, état, propositions de renouvellement, chiffrages, validation et historique des remplacements.'
    },
    {
      kind: 'ppi',
      label: 'PPI / patrimoine',
      description: 'Projection pluriannuelle, durées de vie, priorités patrimoniales et programmation budgétaire.'
    },
    {
      kind: 'reunions',
      label: 'Réunions & pilotage',
      description: 'Réunions périodiques, décisions, actions, responsables, échéances et suivi des engagements.'
    },
    {
      kind: 'reception',
      label: 'Travaux / OPR / réception',
      description: 'Suivi des opérations, OPR, réserves, réception et passation vers l’exploitation.'
    }
  ],
  controle_exploitation: [
    {
      kind: 'exploitation',
      label: 'Exploitation',
      description: 'Contrôles ponctuels, réglages, maintenance visible et actions exploitant.'
    },
    {
      kind: 'actions',
      label: 'Actions correctives',
      description: 'Actions demandées, responsables, échéances, preuves et recontrôles.'
    }
  ],
  suivi_technique: [
    {
      kind: 'suivi',
      label: 'Suivi technique',
      description: 'État du sujet, constats successifs et évolution entre occurrences.'
    },
    {
      kind: 'actions',
      label: 'Actions',
      description: 'Responsables, échéances, relances et clôture.'
    }
  ]
});

export function getMissionWorkstreamPresets(missionType) {
  return PRESETS[missionType] || [];
}

export const MISSION_WORKSTREAM_PRESET_TYPES = Object.freeze(Object.keys(PRESETS));
