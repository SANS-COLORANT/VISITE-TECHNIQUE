const LEVEL_RANK = Object.freeze({ rapide: 0, standard: 1, expert: 2 });

function field(key, label, type = 'text', level = 'standard', options = null, unit = null) {
  return { key, label, type, level, ...(options ? { options } : {}), ...(unit ? { unit } : {}) };
}

const FAMILY_RECIPES = Object.freeze({
  etude_audit: {
    label: 'Étude / Audit',
    sections: [
      { key: 'documents', label: 'Documents & sources', fields: [
        field('docs_utiles', 'Documents utiles disponibles', 'text', 'rapide'),
        field('docs_manquants', 'Documents / informations manquants', 'text', 'rapide'),
        field('fiabilite_sources', 'Fiabilité / limites des données disponibles', 'text', 'expert'),
      ] },
      { key: 'existant', label: 'État de l’existant', fields: [
        field('synthese_existant', 'Synthèse technique de l’existant', 'text', 'rapide'),
        field('production', 'Production / générateurs', 'text', 'standard'),
        field('distribution', 'Distribution / réseaux', 'text', 'standard'),
        field('regulation', 'Régulation / GTB / GTC', 'text', 'standard'),
        field('ecs', 'ECS', 'text', 'standard'),
        field('climatisation', 'Climatisation / refroidissement', 'text', 'standard'),
        field('contraintes', 'Contraintes d’accès / implantation / exploitation', 'text', 'expert'),
      ] },
      { key: 'terrain', label: 'Terrain & investigation', fields: [
        field('mesures', 'Mesures / relevés effectués', 'text', 'rapide'),
        field('ecarts', 'Écarts document ↔ terrain', 'text', 'standard'),
        field('zones_inaccessibles', 'Zones / équipements non vérifiés ou inaccessibles', 'text', 'standard'),
        field('hypotheses', 'Hypothèses à tester / causes possibles', 'text', 'expert'),
        field('a_confirmer', 'Points à confirmer au bureau ou lors d’une autre visite', 'text', 'standard'),
      ] },
    ],
  },
  travaux_chantier: {
    label: 'Travaux / Chantier',
    sections: [
      { key: 'avancement', label: 'Avancement', fields: [
        field('niveau_avancement', 'État général des travaux', 'choice', 'rapide', ['Non commencé', 'En cours', 'Partiellement terminé', 'Terminé', 'Bloqué']),
        field('travaux_realises', 'Travaux constatés comme réalisés', 'text', 'rapide'),
        field('travaux_restants', 'Travaux restant à réaliser', 'text', 'standard'),
        field('progression', 'Avancement estimé (%)', 'number', 'standard', null, '%'),
      ] },
      { key: 'controle', label: 'Contrôles & réserves', fields: [
        field('essais', 'Essais / vérifications effectués', 'text', 'standard'),
        field('reservations', 'Réserves / défauts constatés', 'text', 'rapide'),
        field('a_recontroler', 'Éléments à recontrôler à la prochaine visite', 'text', 'standard'),
        field('ecarts_projet', 'Écarts projet ↔ réalisé', 'text', 'expert'),
      ] },
      { key: 'documents', label: 'Documents & décisions', fields: [
        field('documents_attendus', 'DOE / PV / plans / devis attendus', 'text', 'standard'),
        field('decisions', 'Décisions / arbitrages pris sur place', 'text', 'rapide'),
        field('visa', 'Documents / plans / fiches à viser ou réviser', 'text', 'expert'),
      ] },
    ],
  },
  suivi_ponctuel: {
    label: 'Suivi ponctuel',
    sections: [
      { key: 'sujet', label: 'Sujet suivi', fields: [
        field('etat_sujet', 'Évolution depuis le dernier point', 'choice', 'rapide', ['Inchangé', 'Amélioré', 'Partiellement résolu', 'Résolu', 'Aggravé', 'Non vérifiable']),
        field('constat', 'Constat actuel', 'text', 'rapide'),
        field('actions', 'Actions / prochaine étape', 'text', 'standard'),
        field('documents', 'Devis / documents reçus ou attendus', 'text', 'standard'),
        field('analyse', 'Analyse approfondie / hypothèses', 'text', 'expert'),
      ] },
    ],
  },
  campagne_multisites: {
    label: 'Campagne / Multi-sites',
    sections: [
      { key: 'site', label: 'Constat du site', fields: [
        field('etat_existant', 'État de l’existant / inventaire', 'text', 'rapide'),
        field('equipements', 'Équipements / éléments présents', 'text', 'standard'),
        field('documents_manquants', 'Documents manquants spécifiques à ce site', 'text', 'standard'),
        field('ecarts', 'Écarts / particularités locales', 'text', 'rapide'),
        field('actions_locales', 'Actions / points propres au site', 'text', 'standard'),
        field('synthese_site', 'Synthèse / qualification du site', 'text', 'expert'),
      ] },
    ],
  },
  conformite_reglementaire: {
    label: 'Contrôle / Conformité',
    sections: [
      { key: 'controle', label: 'Contrôle ciblé', fields: [
        field('resultat', 'Résultat global du contrôle', 'choice', 'rapide', ['Conforme', 'Non conforme', 'À contrôler', 'Non vérifiable', 'Non concerné']),
        field('constat', 'Constat / référence vérifiée', 'text', 'rapide'),
        field('reference', 'Référence / exigence / source', 'text', 'standard'),
        field('action_corrective', 'Action corrective éventuelle', 'text', 'standard'),
        field('preuve', 'Preuve / document attendu', 'text', 'standard'),
        field('contre_visite', 'Contre-visite / contrôle ultérieur nécessaire', 'choice', 'expert', ['Oui', 'Non', 'À décider']),
      ] },
    ],
  },
});

const TYPE_RECIPES = Object.freeze({
  diagnostic_ecs: {
    label: 'Diagnostic / Audit ECS',
    sections: [
      { key: 'ecs_production', label: 'Production & stockage ECS', fields: [
        field('configuration', 'Configuration de production / stockage', 'text', 'rapide'),
        field('equipements', 'Équipements principaux et état', 'text', 'standard'),
        field('regulation', 'Consignes / régulation / GTC', 'text', 'standard'),
        field('historique', 'Historique entretien / incidents / analyses', 'text', 'expert'),
      ] },
      { key: 'ecs_distribution', label: 'Distribution & bouclage', fields: [
        field('schema', 'Réseau / colonnes / branches identifiés', 'text', 'rapide'),
        field('temperatures', 'Températures départ / retour / pieds de colonnes', 'text', 'standard'),
        field('equilibrage', 'Équilibrage / organes / anomalies hydrauliques', 'text', 'standard'),
        field('bras_morts', 'Bras morts / points peu utilisés / particularités', 'text', 'standard'),
        field('dimensionnement', 'Vérification pompe / débit / pertes de charge', 'text', 'expert'),
      ] },
      { key: 'ecs_sanitaire', label: 'Suivi sanitaire', fields: [
        field('analyses', 'Analyses / résultats disponibles', 'text', 'standard'),
        field('points_prelevement', 'Points de prélèvement / puisage concernés', 'text', 'standard'),
        field('avis', 'Avis / éléments à contrôler', 'text', 'expert'),
      ] },
    ],
  },
  diagnostic_climatisation_pac: {
    label: 'Diagnostic Climatisation / PAC',
    sections: [
      { key: 'clim_architecture', label: 'Architecture du système', fields: [
        field('ue_ui', 'UE / UI / zones desservies', 'text', 'rapide'),
        field('circuits', 'Circuits frigorifiques / hydrauliques associés', 'text', 'standard'),
        field('fluide', 'Fluide / charge / informations constructeur', 'text', 'standard'),
        field('condensats', 'Condensats / relevages / évacuations', 'text', 'standard'),
      ] },
      { key: 'clim_investigation', label: 'Pannes & investigation', fields: [
        field('symptome', 'Symptôme / problème principal', 'text', 'rapide'),
        field('historique', 'Historique interventions / pannes', 'text', 'standard'),
        field('controles', 'Contrôles effectués / résultats', 'text', 'standard'),
        field('hypotheses', 'Hypothèses / causes possibles', 'text', 'expert'),
        field('dimensionnement', 'Vérification dimensionnement / charge', 'text', 'expert'),
      ] },
    ],
  },
  diagnostic_gtb: {
    label: 'Diagnostic Régulation / GTB / GTC',
    sections: [
      { key: 'gtb_architecture', label: 'Architecture fonctionnelle', fields: [
        field('automates', 'Automates / régulateurs / passerelles', 'text', 'rapide'),
        field('relations', 'Sondes → régulateurs → actionneurs → équipements', 'text', 'standard'),
        field('communication', 'Communication / télégestion / supervision', 'text', 'standard'),
        field('acces', 'Accès / licences / abonnements / limites', 'text', 'standard'),
      ] },
      { key: 'gtb_reglages', label: 'Réglages & fonctionnement', fields: [
        field('consignes', 'Consignes / lois d’eau / horaires / seuils', 'text', 'standard'),
        field('alarmes', 'Alarmes / défauts / incohérences', 'text', 'rapide'),
        field('essais', 'Essais fonctionnels / commandes / retours', 'text', 'expert'),
      ] },
    ],
  },
  audit_energetique: {
    label: 'Audit énergétique',
    sections: [
      { key: 'energie_sources', label: 'Données énergétiques', fields: [
        field('factures', 'Factures / compteurs / périodes disponibles', 'text', 'rapide'),
        field('consommations', 'Consommations et indicateurs', 'text', 'standard'),
        field('qualite_donnees', 'Qualité / lacunes / incohérences', 'text', 'standard'),
        field('simulation', 'Hypothèses / simulation / données calculées', 'text', 'expert'),
      ] },
      { key: 'energie_actions', label: 'Actions & scénarios', fields: [
        field('dysfonctionnements', 'Corrections de dysfonctionnements', 'text', 'rapide'),
        field('reduction_besoins', 'Réduction des besoins', 'text', 'standard'),
        field('performances', 'Amélioration des performances', 'text', 'standard'),
        field('enr', 'ENR / substitution', 'text', 'expert'),
        field('scenarios', 'Scénarios à comparer', 'text', 'expert'),
      ] },
    ],
  },
  inventaire_passation: {
    label: 'Inventaire / Passation',
    sections: [
      { key: 'passation', label: 'Prise en charge', fields: [
        field('inventaire', 'Inventaire attendu ↔ constaté', 'text', 'rapide'),
        field('ecarts', 'Manquants / supplémentaires / différences', 'text', 'rapide'),
        field('documents', 'Documents présents / à transmettre / obsolètes', 'text', 'standard'),
        field('index_stocks', 'Index / stocks / moyens d’accès', 'text', 'standard'),
        field('essais', 'Essais de fonctionnement réalisés', 'text', 'expert'),
        field('reservations', 'Réserves de prise en charge', 'text', 'standard'),
      ] },
    ],
  },
  commissioning: {
    label: 'Mise en service / Commissioning',
    sections: [
      { key: 'commissioning', label: 'Essais fonctionnels', fields: [
        field('preconditions', 'Préconditions / installation prête', 'text', 'rapide'),
        field('essais', 'Essais exécutés et résultats', 'text', 'rapide'),
        field('mesures', 'Valeurs théoriques ↔ mesurées', 'text', 'standard'),
        field('ecarts', 'Écarts / réglages / reprises', 'text', 'standard'),
        field('sequence', 'Séquences fonctionnelles / alarmes / asservissements', 'text', 'expert'),
      ] },
    ],
  },
  opr_reception: {
    label: 'OPR / Réception',
    sections: [
      { key: 'opr', label: 'Contrôle des ouvrages', fields: [
        field('ouvrages', 'Ouvrages contrôlés', 'text', 'rapide'),
        field('reservations', 'Réserves nouvelles / maintenues', 'text', 'rapide'),
        field('essais', 'Essais dynamiques / fonctionnels', 'text', 'standard'),
        field('ecarts_projet', 'Projet prévu ↔ réalisé', 'text', 'standard'),
        field('documents', 'DOE / PV / documents attendus', 'text', 'expert'),
      ] },
    ],
  },
  levee_reserves: {
    label: 'Levée de réserves',
    sections: [
      { key: 'levee', label: 'Recontrôle', fields: [
        field('reserve_source', 'Réserve / point contrôlé', 'text', 'rapide'),
        field('resultat', 'Résultat', 'choice', 'rapide', ['Levée', 'Maintenue', 'Partiellement levée', 'Inaccessible', 'Non vérifiable']),
        field('constat', 'Constat actuel / travaux réalisés', 'text', 'standard'),
        field('suite', 'Suite / nouvelle échéance', 'text', 'standard'),
      ] },
    ],
  },
  campagne_mesures: {
    label: 'Campagne de mesures',
    sections: [
      { key: 'campagne', label: 'Campagne', fields: [
        field('protocole', 'Protocole / référentiel', 'text', 'rapide'),
        field('points', 'Points / zones mesurés', 'text', 'rapide'),
        field('conditions', 'Conditions de mesure', 'text', 'standard'),
        field('instruments', 'Instruments / références si nécessaires', 'text', 'expert'),
        field('anomalies', 'Valeurs atypiques / à contrôler', 'text', 'standard'),
      ] },
    ],
  },
  expertise_sinistre: {
    label: 'Expertise / Sinistre',
    sections: [
      { key: 'expertise', label: 'Faits & chronologie', fields: [
        field('faits', 'Faits constatés', 'text', 'rapide'),
        field('chronologie', 'Chronologie connue', 'text', 'standard'),
        field('preuves', 'Photos / mesures / documents / preuves', 'text', 'standard'),
        field('hypotheses', 'Hypothèses techniques', 'text', 'expert'),
        field('limites', 'Limites / informations manquantes', 'text', 'expert'),
      ] },
    ],
  },
});

function mergeSections(baseSections, extraSections) {
  const out = baseSections.map((section) => ({ ...section, fields: [...section.fields] }));
  for (const extra of extraSections || []) {
    const index = out.findIndex((section) => section.key === extra.key);
    if (index >= 0) out[index] = { ...out[index], ...extra, fields: [...out[index].fields, ...(extra.fields || [])] };
    else out.push({ ...extra, fields: [...(extra.fields || [])] });
  }
  return out;
}

export function getMissionVisitRecipe(family, missionType = null, mode = 'standard') {
  const familyRecipe = FAMILY_RECIPES[family] || { label: 'Mission libre', sections: [] };
  const typeRecipe = missionType ? TYPE_RECIPES[missionType] : null;
  const maxRank = LEVEL_RANK[mode] ?? LEVEL_RANK.standard;
  const merged = {
    label: typeRecipe?.label || familyRecipe.label,
    sections: mergeSections(familyRecipe.sections || [], typeRecipe?.sections || []),
  };
  return {
    ...merged,
    mode,
    sections: merged.sections
      .map((section) => ({ ...section, fields: section.fields.filter((item) => (LEVEL_RANK[item.level] ?? 1) <= maxRank) }))
      .filter((section) => section.fields.length),
  };
}

export const MISSION_CAPTURE_MODES = Object.freeze([
  ['rapide', 'Rapide'],
  ['standard', 'Standard'],
  ['expert', 'Expert'],
]);
