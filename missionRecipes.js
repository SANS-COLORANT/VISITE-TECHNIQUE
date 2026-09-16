export const MISSION_VISIT_RECIPES = Object.freeze({
  etude_audit: {
    label: 'Étude / Audit',
    sections: [
      { key: 'documents', label: 'Documents & informations disponibles', fields: [
        { key: 'docs_utiles', label: 'Documents utiles disponibles', type: 'text' },
        { key: 'docs_manquants', label: 'Documents / informations manquants', type: 'text' },
      ] },
      { key: 'existant', label: 'État de l’existant', fields: [
        { key: 'production', label: 'Production / générateurs', type: 'text' },
        { key: 'distribution', label: 'Distribution / réseaux', type: 'text' },
        { key: 'emission', label: 'Émission', type: 'text' },
        { key: 'regulation', label: 'Régulation', type: 'text' },
        { key: 'ecs', label: 'ECS', type: 'text' },
        { key: 'ventilation', label: 'Ventilation / aéraulique', type: 'text' },
        { key: 'climatisation', label: 'Climatisation / refroidissement', type: 'text' },
      ] },
      { key: 'terrain', label: 'Terrain', fields: [
        { key: 'mesures', label: 'Mesures / relevés effectués', type: 'text' },
        { key: 'zones_inaccessibles', label: 'Zones / équipements non vérifiés ou inaccessibles', type: 'text' },
        { key: 'a_confirmer', label: 'Points à confirmer au bureau ou lors d’une autre visite', type: 'text' },
      ] },
    ],
  },
  travaux_chantier: {
    label: 'Travaux / Chantier',
    sections: [
      { key: 'avancement', label: 'Avancement', fields: [
        { key: 'niveau_avancement', label: 'État général des travaux', type: 'choice', options: ['Non commencé', 'En cours', 'Partiellement terminé', 'Terminé', 'Bloqué'] },
        { key: 'travaux_realises', label: 'Travaux constatés comme réalisés', type: 'text' },
        { key: 'travaux_restants', label: 'Travaux restant à réaliser', type: 'text' },
      ] },
      { key: 'controle', label: 'Contrôles & réserves', fields: [
        { key: 'essais', label: 'Essais / vérifications effectués', type: 'text' },
        { key: 'reservations', label: 'Réserves / défauts constatés', type: 'text' },
        { key: 'a_recontroler', label: 'Éléments à recontrôler à la prochaine visite', type: 'text' },
      ] },
      { key: 'documents', label: 'Documents & décisions', fields: [
        { key: 'documents_attendus', label: 'DOE / PV / plans / devis attendus', type: 'text' },
        { key: 'decisions', label: 'Décisions / arbitrages pris sur place', type: 'text' },
      ] },
    ],
  },
  suivi_ponctuel: {
    label: 'Suivi ponctuel',
    sections: [
      { key: 'sujet', label: 'Sujet suivi', fields: [
        { key: 'etat_sujet', label: 'Évolution depuis le dernier point', type: 'choice', options: ['Inchangé', 'Amélioré', 'Partiellement résolu', 'Résolu', 'Aggravé', 'Non vérifiable'] },
        { key: 'constat', label: 'Constat actuel', type: 'text' },
        { key: 'actions', label: 'Actions / prochaine étape', type: 'text' },
        { key: 'documents', label: 'Devis / documents reçus ou attendus', type: 'text' },
      ] },
    ],
  },
  campagne_multisites: {
    label: 'Campagne / Multi-sites',
    sections: [
      { key: 'site', label: 'Constat du site', fields: [
        { key: 'etat_existant', label: 'État de l’existant / inventaire', type: 'text' },
        { key: 'equipements', label: 'Équipements / éléments présents', type: 'text' },
        { key: 'documents_manquants', label: 'Documents manquants spécifiques à ce site', type: 'text' },
        { key: 'ecarts', label: 'Écarts / particularités locales', type: 'text' },
        { key: 'actions_locales', label: 'Actions / points propres au site', type: 'text' },
      ] },
    ],
  },
  conformite_reglementaire: {
    label: 'Contrôle / Conformité',
    sections: [
      { key: 'controle', label: 'Contrôle ciblé', fields: [
        { key: 'resultat', label: 'Résultat global du contrôle', type: 'choice', options: ['Conforme', 'Non conforme', 'Non vérifiable', 'Non concerné'] },
        { key: 'constat', label: 'Constat / référence vérifiée', type: 'text' },
        { key: 'action_corrective', label: 'Action corrective éventuelle', type: 'text' },
        { key: 'preuve', label: 'Preuve / document attendu', type: 'text' },
        { key: 'contre_visite', label: 'Contre-visite / contrôle ultérieur nécessaire', type: 'choice', options: ['Oui', 'Non', 'À décider'] },
      ] },
    ],
  },
});

export function getMissionVisitRecipe(family) {
  return MISSION_VISIT_RECIPES[family] || { label: 'Mission libre', sections: [] };
}
