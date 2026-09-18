const LEVEL_RANK = Object.freeze({ rapide: 0, standard: 1, expert: 2 });

function field(key, label, type = 'text', level = 'standard', options = null, unit = null) {
  return { key, label, type, level, ...(options ? { options } : {}), ...(unit ? { unit } : {}) };
}

function section(key, label, fields) {
  return { key, label, fields };
}

const FAMILY_RECIPES = Object.freeze({
  etude_audit: {
    label: 'Étude / Audit',
    sections: [
      section('documents', 'Documents & sources', [
        field('docs_utiles', 'Documents utiles disponibles', 'text', 'rapide'),
        field('docs_manquants', 'Documents / informations manquants', 'text', 'rapide'),
        field('fiabilite_sources', 'Fiabilité / limites des données disponibles', 'text', 'expert'),
      ]),
      section('existant', 'État de l’existant', [
        field('synthese_existant', 'Synthèse technique de l’existant', 'text', 'rapide'),
        field('production', 'Production / générateurs', 'text', 'standard'),
        field('distribution', 'Distribution / réseaux', 'text', 'standard'),
        field('regulation', 'Régulation / GTB / GTC', 'text', 'standard'),
        field('ecs', 'ECS', 'text', 'standard'),
        field('climatisation', 'Climatisation / refroidissement', 'text', 'standard'),
        field('contraintes', 'Contraintes d’accès / implantation / exploitation', 'text', 'expert'),
      ]),
      section('terrain', 'Terrain & investigation', [
        field('mesures', 'Mesures / relevés effectués', 'text', 'rapide'),
        field('ecarts', 'Écarts document ↔ terrain', 'text', 'standard'),
        field('zones_inaccessibles', 'Zones / équipements non vérifiés ou inaccessibles', 'text', 'standard'),
        field('hypotheses', 'Hypothèses à tester / causes possibles', 'text', 'expert'),
        field('a_confirmer', 'Points à confirmer au bureau ou lors d’une autre visite', 'text', 'standard'),
      ]),
    ],
  },

  travaux_chantier: {
    label: 'Travaux / Chantier',
    sections: [
      section('avancement', 'Avancement', [
        field('niveau_avancement', 'État général des travaux', 'choice', 'rapide', ['Non commencé', 'En cours', 'Partiellement terminé', 'Terminé', 'Bloqué']),
        field('travaux_realises', 'Travaux constatés comme réalisés', 'text', 'rapide'),
        field('travaux_restants', 'Travaux restant à réaliser', 'text', 'standard'),
        field('progression', 'Avancement estimé (%)', 'number', 'standard', null, '%'),
      ]),
      section('controle', 'Contrôles & réserves', [
        field('essais', 'Essais / vérifications effectués', 'text', 'standard'),
        field('reservations', 'Réserves / défauts constatés', 'text', 'rapide'),
        field('a_recontroler', 'Éléments à recontrôler à la prochaine visite', 'text', 'standard'),
        field('ecarts_projet', 'Écarts projet ↔ réalisé', 'text', 'expert'),
      ]),
      section('documents', 'Documents & décisions', [
        field('documents_attendus', 'DOE / PV / plans / devis attendus', 'text', 'standard'),
        field('decisions', 'Décisions / arbitrages pris sur place', 'text', 'rapide'),
        field('visa', 'Documents / plans / fiches à viser ou réviser', 'text', 'expert'),
      ]),
    ],
  },

  suivi_ponctuel: {
    label: 'Suivi ponctuel',
    sections: [
      section('sujet', 'Sujet suivi', [
        field('etat_sujet', 'Évolution depuis le dernier point', 'choice', 'rapide', ['Inchangé', 'Amélioré', 'Partiellement résolu', 'Résolu', 'Aggravé', 'Non vérifiable']),
        field('constat', 'Constat actuel', 'text', 'rapide'),
        field('actions', 'Actions / prochaine étape', 'text', 'standard'),
        field('documents', 'Devis / documents reçus ou attendus', 'text', 'standard'),
        field('analyse', 'Analyse approfondie / hypothèses', 'text', 'expert'),
      ]),
    ],
  },

  campagne_multisites: {
    label: 'Campagne / Multi-sites',
    sections: [
      section('site', 'Constat du site', [
        field('etat_existant', 'État de l’existant / inventaire', 'text', 'rapide'),
        field('equipements', 'Équipements / éléments présents', 'text', 'standard'),
        field('documents_manquants', 'Documents manquants spécifiques à ce site', 'text', 'standard'),
        field('ecarts', 'Écarts / particularités locales', 'text', 'rapide'),
        field('actions_locales', 'Actions / points propres au site', 'text', 'standard'),
        field('synthese_site', 'Synthèse / qualification du site', 'text', 'expert'),
      ]),
    ],
  },

  conformite_reglementaire: {
    label: 'Contrôle / Conformité',
    sections: [
      section('controle', 'Contrôle ciblé', [
        field('resultat', 'Résultat global du contrôle', 'choice', 'rapide', ['Conforme', 'Non conforme', 'À contrôler', 'Non vérifiable', 'Non concerné']),
        field('constat', 'Constat / référence vérifiée', 'text', 'rapide'),
        field('reference', 'Référence / exigence / source', 'text', 'standard'),
        field('action_corrective', 'Action corrective éventuelle', 'text', 'standard'),
        field('preuve', 'Preuve / document attendu', 'text', 'standard'),
        field('contre_visite', 'Contre-visite / contrôle ultérieur nécessaire', 'choice', 'expert', ['Oui', 'Non', 'À décider']),
      ]),
    ],
  },
});

const TYPE_RECIPES = Object.freeze({
  diagnostic_chaufferie_ss: {
    label: 'Diagnostic Chaufferie / Sous-station',
    sections: [
      section('chaufferie_architecture', 'Architecture de l’installation', [
        field('production', 'Production / générateurs en service', 'text', 'rapide'),
        field('circuits', 'Circuits / départs / sous-stations desservis', 'text', 'rapide'),
        field('hydraulique', 'Pompes / vannes / échangeurs / organes hydrauliques', 'text', 'standard'),
        field('expansion', 'Expansion / maintien de pression / appoint', 'text', 'standard'),
        field('traitement_eau', 'Traitement d’eau / qualité / pot à boues / dégazage', 'text', 'expert'),
      ]),
      section('chaufferie_fonctionnement', 'Fonctionnement & mesures', [
        field('temperatures', 'Températures départ / retour / ΔT', 'text', 'rapide'),
        field('pressions', 'Pressions / débits / fréquences / positions', 'text', 'standard'),
        field('consignes', 'Consignes / loi d’eau / horaires / cascade', 'text', 'standard'),
        field('combustion_ticket', 'Ticket / contrôle combustion exploitant', 'text', 'standard'),
        field('incoherences', 'Valeurs atypiques / à contrôler', 'text', 'expert'),
      ]),
      section('chaufferie_local', 'Local & exploitation', [
        field('acces', 'Accès / manutention / zones non accessibles', 'text', 'rapide'),
        field('etat_general', 'État général / propreté / fuites / corrosion', 'text', 'rapide'),
        field('securite_visible', 'Observations visibles de sécurité / exploitation', 'text', 'standard'),
        field('documents', 'Schémas / notices / rapports / contrôles disponibles', 'text', 'standard'),
      ]),
    ],
  },

  diagnostic_ecs: {
    label: 'Diagnostic / Audit ECS',
    sections: [
      section('ecs_production', 'Production & stockage ECS', [
        field('configuration', 'Configuration de production / stockage', 'text', 'rapide'),
        field('equipements', 'Équipements principaux et état', 'text', 'standard'),
        field('regulation', 'Consignes / régulation / GTC', 'text', 'standard'),
        field('historique', 'Historique entretien / incidents / analyses', 'text', 'expert'),
      ]),
      section('ecs_distribution', 'Distribution & bouclage', [
        field('schema', 'Réseau / colonnes / branches identifiés', 'text', 'rapide'),
        field('temperatures', 'Températures départ / retour / pieds de colonnes', 'text', 'rapide'),
        field('equilibrage', 'Équilibrage / organes / anomalies hydrauliques', 'text', 'standard'),
        field('bras_morts', 'Bras morts / points peu utilisés / particularités', 'text', 'standard'),
        field('dimensionnement', 'Vérification pompe / débit / pertes de charge', 'text', 'expert'),
      ]),
      section('ecs_sanitaire', 'Suivi sanitaire documentaire', [
        field('analyses', 'Analyses / résultats disponibles', 'text', 'standard'),
        field('points_prelevement', 'Points de prélèvement / puisage concernés', 'text', 'standard'),
        field('avis', 'Éléments à contrôler / compléter', 'text', 'expert'),
      ]),
    ],
  },

  diagnostic_ventilation_cta: {
    label: 'Diagnostic VMC / Ventilation / CTA',
    sections: [
      section('ventilation_systeme', 'Système & caissons', [
        field('type_ventilation', 'Type de ventilation / CTA / VMC', 'text', 'rapide'),
        field('caissons', 'Caissons / CTA présents et état', 'text', 'rapide'),
        field('filtres', 'Filtres : type / classe / dimensions / état', 'text', 'standard'),
        field('ventilateurs', 'Ventilateurs / moteurs / variateurs', 'text', 'standard'),
        field('batteries_recuperation', 'Batteries / récupération / condensats', 'text', 'expert'),
      ]),
      section('ventilation_reseaux', 'Réseaux & terminaux', [
        field('reseaux', 'Gaines / branches / sens de circulation', 'text', 'rapide'),
        field('bouches', 'Bouches / diffuseurs / terminaux vérifiés', 'text', 'rapide'),
        field('debits', 'Débits / vitesses / pressions / pertes de charge', 'text', 'standard'),
        field('equilibrage', 'Équilibrage / écarts entre branches', 'text', 'standard'),
        field('acoustique', 'Bruit / vibrations / observations', 'text', 'expert'),
      ]),
      section('ventilation_campagne', 'Campagne terrain', [
        field('zones_visitees', 'Zones / logements / locaux visités', 'text', 'rapide'),
        field('zones_non_visitees', 'Absents / refus / inaccessibles / à replanifier', 'text', 'standard'),
        field('ecarts_attendus', 'Débits attendus ↔ mesurés', 'text', 'standard'),
      ]),
    ],
  },

  diagnostic_climatisation_pac: {
    label: 'Diagnostic Climatisation / PAC',
    sections: [
      section('clim_architecture', 'Architecture du système', [
        field('ue_ui', 'UE / UI / zones desservies', 'text', 'rapide'),
        field('circuits', 'Circuits frigorifiques / hydrauliques associés', 'text', 'standard'),
        field('fluide', 'Fluide / charge / informations constructeur', 'text', 'standard'),
        field('condensats', 'Condensats / relevages / évacuations', 'text', 'standard'),
        field('regulation', 'Commandes locales / centralisées / GTB', 'text', 'expert'),
      ]),
      section('clim_investigation', 'Fonctionnement & investigation', [
        field('symptome', 'Symptôme / problème principal', 'text', 'rapide'),
        field('historique', 'Historique interventions / pannes', 'text', 'standard'),
        field('controles', 'Contrôles effectués / résultats', 'text', 'standard'),
        field('hypotheses', 'Hypothèses / causes possibles', 'text', 'expert'),
        field('dimensionnement', 'Vérification dimensionnement / charge', 'text', 'expert'),
      ]),
      section('clim_implantation', 'Implantation & remplacement', [
        field('acces', 'Accès / manutention / grutage / démontage', 'text', 'standard'),
        field('encombrements', 'Encombrements / dimensions / distances', 'text', 'expert'),
        field('nuisances', 'Bruit / vibration / voisinage / contraintes', 'text', 'standard'),
      ]),
    ],
  },

  diagnostic_gtb: {
    label: 'Diagnostic Régulation / GTB / GTC',
    sections: [
      section('gtb_architecture', 'Architecture fonctionnelle', [
        field('automates', 'Automates / régulateurs / passerelles', 'text', 'rapide'),
        field('relations', 'Sondes → régulateurs → actionneurs → équipements', 'text', 'standard'),
        field('communication', 'Communication / télégestion / supervision', 'text', 'standard'),
        field('acces', 'Accès / codes / licences / abonnements / limites', 'text', 'standard'),
      ]),
      section('gtb_reglages', 'Réglages & fonctionnement', [
        field('consignes', 'Consignes / lois d’eau / horaires / seuils', 'text', 'rapide'),
        field('alarmes', 'Alarmes / défauts / incohérences', 'text', 'rapide'),
        field('commandes', 'Commandes / retours / asservissements', 'text', 'standard'),
        field('essais', 'Essais fonctionnels détaillés', 'text', 'expert'),
      ]),
      section('gtb_passation', 'Accessibilité & passation', [
        field('communication_etat', 'Équipements communicants / non communicants', 'text', 'standard'),
        field('documentation', 'Architecture / sauvegardes / notices disponibles', 'text', 'standard'),
        field('migrations', 'Contraintes de migration / obsolescence', 'text', 'expert'),
      ]),
    ],
  },

  audit_energetique: {
    label: 'Audit énergétique',
    sections: [
      section('energie_sources', 'Données énergétiques', [
        field('factures', 'Factures / compteurs / périodes disponibles', 'text', 'rapide'),
        field('consommations', 'Consommations et indicateurs', 'text', 'rapide'),
        field('dju', 'DJU / correction climatique / périodes de comparaison', 'text', 'standard'),
        field('qualite_donnees', 'Qualité / lacunes / incohérences', 'text', 'standard'),
        field('simulation', 'Hypothèses / simulation / données calculées', 'text', 'expert'),
      ]),
      section('energie_actions', 'Actions & scénarios', [
        field('dysfonctionnements', 'Corrections de dysfonctionnements', 'text', 'rapide'),
        field('reduction_besoins', 'Réduction des besoins', 'text', 'standard'),
        field('performances', 'Amélioration des performances', 'text', 'standard'),
        field('enr', 'ENR / substitution', 'text', 'expert'),
        field('scenarios', 'Scénarios à comparer', 'text', 'expert'),
      ]),
    ],
  },

  audit_technique: {
    label: 'Audit / Diagnostic technique CVC global',
    sections: [
      section('audit_perimetre', 'Périmètre technique', [
        field('installations', 'Installations / locaux techniques audités', 'text', 'rapide'),
        field('equipements_majeurs', 'Équipements majeurs / état', 'text', 'rapide'),
        field('reseaux', 'Réseaux / distributions / terminaux', 'text', 'standard'),
        field('regulation', 'Régulation / GTC / télégestion', 'text', 'standard'),
        field('documentation', 'Inventaire / DOE / schémas / contrats disponibles', 'text', 'standard'),
      ]),
      section('audit_performance', 'État & performance', [
        field('fonctionnement', 'Fonctionnement observé', 'text', 'rapide'),
        field('mesures', 'Mesures / indicateurs utiles', 'text', 'standard'),
        field('obsolescence', 'Vétusté / obsolescence / maintenabilité', 'text', 'standard'),
        field('criticite', 'Continuité / sécurité / énergie / confort / patrimoine', 'text', 'expert'),
      ]),
      section('audit_plan_action', 'Plan d’action', [
        field('urgent', 'Actions prioritaires / immédiates', 'text', 'rapide'),
        field('court_terme', 'Court terme', 'text', 'standard'),
        field('moyen_long_terme', 'Moyen / long terme', 'text', 'standard'),
        field('ppi', 'Projection renouvellement / budget / PPI', 'text', 'expert'),
      ]),
    ],
  },

  diagnostic_cible: {
    label: 'Diagnostic problème ciblé',
    sections: [
      section('cible_symptome', 'Problème observé', [
        field('symptome', 'Symptôme / gêne / défaut rapporté', 'text', 'rapide'),
        field('localisation', 'Zone / équipement / période concernée', 'text', 'rapide'),
        field('historique', 'Historique / fréquence / interventions déjà réalisées', 'text', 'standard'),
      ]),
      section('cible_investigation', 'Investigation', [
        field('controles', 'Contrôles / mesures effectués', 'text', 'rapide'),
        field('faits', 'Faits observés', 'text', 'rapide'),
        field('hypotheses', 'Hypothèses techniques', 'text', 'standard'),
        field('essais', 'Essais complémentaires', 'text', 'expert'),
        field('limites', 'Limites / informations manquantes', 'text', 'expert'),
      ]),
    ],
  },

  etude_cvc: {
    label: 'Étude CVC / thermique / ECS',
    sections: [
      section('etude_besoins', 'Données d’entrée & besoins', [
        field('objectif', 'Objectif de l’étude', 'text', 'rapide'),
        field('existant', 'Existant conservé / modifié / déposé', 'text', 'rapide'),
        field('besoins', 'Besoins / puissances / usages / contraintes', 'text', 'standard'),
        field('hypotheses', 'Hypothèses de calcul', 'text', 'expert'),
      ]),
      section('etude_solutions', 'Solutions étudiées', [
        field('solutions', 'Solutions / variantes envisagées', 'text', 'rapide'),
        field('dimensionnement', 'Dimensionnements principaux', 'text', 'standard'),
        field('reseaux', 'Réseaux / hydraulique / aéraulique / raccordements', 'text', 'standard'),
        field('regulation', 'Régulation / séquences / GTB', 'text', 'standard'),
        field('travaux_associes', 'Travaux induits / accès / manutention', 'text', 'expert'),
      ]),
    ],
  },

  etude_renovation: {
    label: 'Étude de rénovation / remplacement',
    sections: [
      section('renovation_existant', 'Existant à renouveler', [
        field('ouvrage', 'Équipement / ouvrage concerné', 'text', 'rapide'),
        field('etat', 'État / âge / disponibilité pièces / criticité', 'text', 'rapide'),
        field('contraintes', 'Accès / dimensions / raccordements / manutention', 'text', 'standard'),
        field('reemploi', 'Éléments conservés / déposés / réemployés', 'text', 'standard'),
      ]),
      section('renovation_scenarios', 'Scénarios', [
        field('scenario_a', 'Scénario A', 'text', 'rapide'),
        field('scenario_b', 'Scénario B', 'text', 'standard'),
        field('scenario_c', 'Scénario C', 'text', 'expert'),
        field('comparaison', 'Comparaison CAPEX / OPEX / énergie / contraintes', 'text', 'expert'),
      ]),
      section('renovation_travaux', 'Préparation travaux', [
        field('phasage', 'Phasage / maintien de service', 'text', 'standard'),
        field('travaux_induits', 'Électricité / gros œuvre / désamiantage / grutage / autres lots', 'text', 'expert'),
        field('budget', 'Budget / prix de référence / date de valeur', 'text', 'standard'),
      ]),
    ],
  },

  etude_ecs: {
    label: 'Étude ECS',
    sections: [
      section('etude_ecs_existant', 'Existant ECS', [
        field('production', 'Production / stockage / puissance', 'text', 'rapide'),
        field('distribution', 'Distribution / bouclage / colonnes', 'text', 'rapide'),
        field('consommations', 'Besoins / volumes / profils / comptage', 'text', 'standard'),
      ]),
      section('etude_ecs_dimensionnement', 'Dimensionnement', [
        field('hypotheses', 'Hypothèses / simultanéité / températures', 'text', 'standard'),
        field('stockage', 'Stockage / puissance / échange', 'text', 'standard'),
        field('bouclage', 'Bouclage / pompe / pertes / équilibrage', 'text', 'expert'),
        field('scenarios', 'Variantes / solutions', 'text', 'expert'),
      ]),
    ],
  },

  etude_ventilation_clim: {
    label: 'Étude Ventilation / Climatisation',
    sections: [
      section('etude_air_besoins', 'Besoins & locaux', [
        field('locaux', 'Locaux / usages / horaires / occupation', 'text', 'rapide'),
        field('debits', 'Débits / renouvellement d’air / extractions', 'text', 'standard'),
        field('charges', 'Charges thermiques / besoins chaud-froid', 'text', 'standard'),
      ]),
      section('etude_air_solution', 'Solution', [
        field('systeme', 'Système retenu / variantes', 'text', 'rapide'),
        field('implantation', 'Implantation CTA / VMC / UE / UI / terminaux', 'text', 'standard'),
        field('reseaux', 'Réseaux / gaines / liaisons / condensats', 'text', 'standard'),
        field('acoustique', 'Contraintes acoustiques / vibrations', 'text', 'expert'),
        field('regulation', 'Régulation / programmation / GTB', 'text', 'expert'),
      ]),
    ],
  },

  etude_regulation_gtb: {
    label: 'Étude Régulation / GTB / GTC',
    sections: [
      section('etude_gtb_existant', 'Existant & architecture', [
        field('automates', 'Automates / régulateurs / bus / passerelles', 'text', 'rapide'),
        field('supervision', 'Supervision / accès / hébergement / licences', 'text', 'standard'),
        field('points', 'Points / capteurs / actionneurs / équipements', 'text', 'standard'),
      ]),
      section('etude_gtb_cible', 'Architecture cible', [
        field('synoptique', 'Architecture / synoptique cible', 'text', 'rapide'),
        field('sequences', 'Séquences fonctionnelles / asservissements', 'text', 'standard'),
        field('alarmes', 'Alarmes / historiques / tendances', 'text', 'standard'),
        field('migration', 'Migration / compatibilité / maintien de service', 'text', 'expert'),
      ]),
    ],
  },

  amo_travaux: {
    label: 'AMO Travaux',
    sections: [
      section('amo_pilotage', 'Pilotage', [
        field('avancement', 'Avancement / jalons', 'text', 'rapide'),
        field('decisions', 'Décisions / arbitrages attendus', 'text', 'rapide'),
        field('risques', 'Risques / blocages / dépendances', 'text', 'standard'),
        field('planning', 'Planning / écarts / impacts', 'text', 'standard'),
      ]),
      section('amo_qualite', 'Qualité & conformité au programme', [
        field('ecarts', 'Écarts programme / marché / travaux', 'text', 'rapide'),
        field('documents', 'Documents / VISA / validations', 'text', 'standard'),
        field('couts', 'Coûts / devis / travaux modificatifs', 'text', 'standard'),
        field('reception', 'Préparation essais / OPR / réception', 'text', 'expert'),
      ]),
    ],
  },

  moe_travaux: {
    label: 'MOE Travaux',
    sections: [
      section('moe_execution', 'Exécution', [
        field('travaux_realises', 'Travaux réalisés', 'text', 'rapide'),
        field('plans_execution', 'Plans / fiches / documents d’exécution', 'text', 'standard'),
        field('coordination', 'Interfaces / coordination autres lots', 'text', 'standard'),
        field('methodes', 'Méthodes / phasage / maintien de service', 'text', 'expert'),
      ]),
      section('moe_controle', 'Contrôle', [
        field('ecarts', 'Écarts au projet / marché', 'text', 'rapide'),
        field('reservations', 'Réserves / reprises', 'text', 'rapide'),
        field('essais', 'Essais / autocontrôles / PV', 'text', 'standard'),
        field('visa', 'VISA / documents à corriger', 'text', 'expert'),
      ]),
    ],
  },

  det_chantier: {
    label: 'Suivi chantier / DET',
    sections: [
      section('det_visite', 'Visite chantier', [
        field('avancement', 'Avancement constaté', 'text', 'rapide'),
        field('entreprises', 'Entreprises / zones / lots concernés', 'text', 'rapide'),
        field('constats', 'Constats / photos / points techniques', 'text', 'rapide'),
        field('planning', 'Planning / retard / blocage', 'text', 'standard'),
      ]),
      section('det_suites', 'Suites', [
        field('actions', 'Actions demandées', 'text', 'rapide'),
        field('responsables', 'Responsables / échéances', 'text', 'standard'),
        field('decisions', 'Décisions / arbitrages', 'text', 'standard'),
        field('documents', 'Plans / fiches / PV / devis attendus', 'text', 'expert'),
      ]),
    ],
  },

  commissioning: {
    label: 'Mise en service / Commissioning',
    sections: [
      section('commissioning', 'Essais fonctionnels', [
        field('preconditions', 'Préconditions / installation prête', 'text', 'rapide'),
        field('essais', 'Essais exécutés et résultats', 'text', 'rapide'),
        field('mesures', 'Valeurs théoriques ↔ mesurées', 'text', 'standard'),
        field('ecarts', 'Écarts / réglages / reprises', 'text', 'standard'),
        field('sequence', 'Séquences fonctionnelles / alarmes / asservissements', 'text', 'expert'),
      ]),
      section('commissioning_remise', 'Remise en exploitation', [
        field('reglages_finaux', 'Réglages finaux / consignes', 'text', 'standard'),
        field('documentation', 'PV / notices / sauvegardes / paramètres', 'text', 'standard'),
        field('formation', 'Information / formation exploitant', 'text', 'expert'),
      ]),
    ],
  },

  opr_reception: {
    label: 'OPR / Réception',
    sections: [
      section('opr', 'Contrôle des ouvrages', [
        field('ouvrages', 'Ouvrages contrôlés', 'text', 'rapide'),
        field('reservations', 'Réserves nouvelles / maintenues', 'text', 'rapide'),
        field('essais', 'Essais dynamiques / fonctionnels', 'text', 'standard'),
        field('ecarts_projet', 'Projet prévu ↔ réalisé', 'text', 'standard'),
        field('documents', 'DOE / PV / documents attendus', 'text', 'expert'),
      ]),
      section('opr_reception', 'Réception', [
        field('etat_reception', 'État proposé : réception / réserves / report', 'choice', 'rapide', ['Réceptionnable', 'Réceptionnable avec réserves', 'À reporter', 'À confirmer']),
        field('conditions', 'Conditions / points bloquants', 'text', 'standard'),
        field('remise_exploitant', 'Remise exploitant / clés / accès / sauvegardes', 'text', 'expert'),
      ]),
    ],
  },

  levee_reserves: {
    label: 'Levée de réserves',
    sections: [
      section('levee', 'Recontrôle', [
        field('reserve_source', 'Réserve / point contrôlé', 'text', 'rapide'),
        field('resultat', 'Résultat', 'choice', 'rapide', ['Levée', 'Maintenue', 'Partiellement levée', 'Inaccessible', 'Non vérifiable']),
        field('constat', 'Constat actuel / travaux réalisés', 'text', 'standard'),
        field('suite', 'Suite / nouvelle échéance', 'text', 'standard'),
        field('preuve', 'Photo après / document / PV associé', 'text', 'expert'),
      ]),
    ],
  },

  passation_travaux_exploitant: {
    label: 'Passation Travaux → Exploitant',
    sections: [
      section('passation_ouvrages', 'Ouvrages remis', [
        field('inventaire', 'Équipements / ouvrages remis', 'text', 'rapide'),
        field('etat', 'État / réserves au moment de la remise', 'text', 'rapide'),
        field('index', 'Index / compteurs / réglages / consignes', 'text', 'standard'),
      ]),
      section('passation_documents', 'Documents & accès', [
        field('doe', 'DOE / plans / notices / PV / garanties', 'text', 'rapide'),
        field('gtb_acces', 'Codes / accès / licences / télégestion', 'text', 'standard'),
        field('formation', 'Formation / démonstration / remise des moyens', 'text', 'standard'),
        field('manquants', 'Éléments restant à transmettre', 'text', 'expert'),
      ]),
    ],
  },

  suivi_technique: {
    label: 'Suivi technique ciblé',
    sections: [
      section('suivi_technique', 'Évolution technique', [
        field('objet', 'Objet suivi', 'text', 'rapide'),
        field('etat', 'État actuel / évolution', 'text', 'rapide'),
        field('mesures', 'Mesures / preuves / documents nouveaux', 'text', 'standard'),
        field('actions', 'Actions / prochaine étape', 'text', 'standard'),
        field('analyse', 'Analyse / tendance / risque', 'text', 'expert'),
      ]),
    ],
  },

  controle_exploitation: {
    label: 'Contrôle ponctuel d’exploitation',
    sections: [
      section('exploitation_service', 'Service & exploitation', [
        field('fonctionnement', 'Fonctionnement au moment du contrôle', 'text', 'rapide'),
        field('reglages', 'Réglages / consignes / programmation', 'text', 'rapide'),
        field('entretien', 'Entretien visible / nettoyage / fuites / accès', 'text', 'standard'),
        field('alarmes', 'Alarmes / défauts / indisponibilités', 'text', 'standard'),
      ]),
      section('exploitation_contrat', 'Éléments contractuels', [
        field('obligations', 'Obligations / prestations vérifiées', 'text', 'standard'),
        field('documents', 'Carnet / rapports / justificatifs / tickets', 'text', 'standard'),
        field('ecarts', 'Écarts à contrôler / clarifier', 'text', 'expert'),
      ]),
    ],
  },

  assistance_p2_p3: {
    label: 'Assistance P2 / P3',
    sections: [
      section('p2p3_inventaire', 'Inventaire & prise en charge', [
        field('inventaire', 'Équipements au périmètre', 'text', 'rapide'),
        field('ecarts', 'Inventaire documentaire ↔ terrain', 'text', 'rapide'),
        field('age_etat', 'Âge / état / obsolescence', 'text', 'standard'),
        field('criticite', 'Criticité / continuité / disponibilité pièces', 'text', 'standard'),
      ]),
      section('p2p3_analyse', 'Analyse P2 / P3', [
        field('p2', 'Prestations exploitation / entretien courant', 'text', 'standard'),
        field('p3', 'Équipements / renouvellements P3 sensibles', 'text', 'rapide'),
        field('budget', 'Coûts / projection / PPI / renouvellements', 'text', 'expert'),
        field('passation', 'Réserves / prise en charge / responsabilités', 'text', 'expert'),
      ]),
    ],
  },

  plan_action: {
    label: 'Plan d’action',
    sections: [
      section('plan_actions', 'Actions', [
        field('priorites', 'Priorités', 'text', 'rapide'),
        field('actions', 'Actions à lancer', 'text', 'rapide'),
        field('responsables', 'Responsables / entreprises', 'text', 'standard'),
        field('echeances', 'Échéances / jalons', 'text', 'standard'),
        field('budget', 'Coûts / imputation / budget', 'text', 'expert'),
      ]),
      section('plan_suivi', 'Suivi', [
        field('avancement', 'Avancement depuis le dernier point', 'text', 'rapide'),
        field('blocages', 'Blocages / dépendances', 'text', 'standard'),
        field('arbitrages', 'Arbitrages / décisions', 'text', 'expert'),
      ]),
    ],
  },

  suivi_sanitaire: {
    label: 'Suivi sanitaire ponctuel',
    sections: [
      section('sanitaire_campagne', 'Données disponibles', [
        field('analyses', 'Analyses / résultats / laboratoire', 'text', 'rapide'),
        field('points', 'Points de prélèvement / puisage', 'text', 'rapide'),
        field('temperatures', 'Températures / campagne terrain', 'text', 'standard'),
        field('historique', 'Historique / campagnes précédentes', 'text', 'standard'),
      ]),
      section('sanitaire_actions', 'Actions', [
        field('ecarts', 'Valeurs / résultats à contrôler', 'text', 'rapide'),
        field('actions', 'Actions / investigations demandées', 'text', 'standard'),
        field('limites', 'Limites de l’intervention METRA / source laboratoire', 'text', 'expert'),
      ]),
    ],
  },

  preallumage_reprise_saison: {
    label: 'Pré-allumage / Reprise de saison',
    sections: [
      section('saison_installation', 'Installation', [
        field('disponibilite', 'Installation disponible / état avant démarrage', 'choice', 'rapide', ['Prête', 'Partiellement prête', 'Non prête', 'Non vérifiable']),
        field('equipements', 'Équipements principaux vérifiés', 'text', 'rapide'),
        field('reglages', 'Consignes / loi d’eau / horaires / cascade', 'text', 'standard'),
        field('compteurs', 'Index / compteurs / données initiales', 'text', 'standard'),
      ]),
      section('saison_controles', 'Contrôles de reprise', [
        field('essais', 'Essais de fonctionnement', 'text', 'rapide'),
        field('mesures', 'Températures / pressions / débits utiles', 'text', 'standard'),
        field('reservations', 'Réserves / anomalies / actions', 'text', 'rapide'),
        field('a_recontroler', 'Points à recontrôler après montée en régime', 'text', 'expert'),
      ]),
    ],
  },

  expertise_sinistre: {
    label: 'Expertise / Sinistre',
    sections: [
      section('expertise', 'Faits & chronologie', [
        field('faits', 'Faits constatés', 'text', 'rapide'),
        field('chronologie', 'Chronologie connue', 'text', 'standard'),
        field('preuves', 'Photos / mesures / documents / preuves', 'text', 'standard'),
        field('hypotheses', 'Hypothèses techniques', 'text', 'expert'),
        field('limites', 'Limites / informations manquantes', 'text', 'expert'),
      ]),
      section('expertise_evolution', 'Évolution & investigations', [
        field('investigations', 'Investigations réalisées / demandées', 'text', 'standard'),
        field('evolution', 'Évolution depuis le constat initial', 'text', 'standard'),
        field('conclusions', 'Conclusions techniques lorsque suffisamment étayées', 'text', 'expert'),
      ]),
    ],
  },

  campagne_technique: {
    label: 'Campagne technique multi-sites',
    sections: [
      section('campagne_technique_site', 'Site / installation', [
        field('visite', 'Site / zone / installation visitée', 'text', 'rapide'),
        field('inventaire', 'Inventaire rapide / éléments clés', 'text', 'rapide'),
        field('etat', 'État / particularités / écarts', 'text', 'rapide'),
        field('mesures', 'Mesures / contrôles prévus', 'text', 'standard'),
        field('actions', 'Actions / suite locale', 'text', 'standard'),
      ]),
    ],
  },

  campagne_mesures: {
    label: 'Campagne de mesures',
    sections: [
      section('campagne', 'Campagne', [
        field('protocole', 'Protocole / référentiel', 'text', 'rapide'),
        field('points', 'Points / zones mesurés', 'text', 'rapide'),
        field('conditions', 'Conditions de mesure', 'text', 'standard'),
        field('instruments', 'Instruments / références si nécessaires', 'text', 'expert'),
        field('anomalies', 'Valeurs atypiques / à contrôler', 'text', 'standard'),
      ]),
    ],
  },

  inventaire_patrimonial: {
    label: 'Inventaire patrimonial CVC',
    sections: [
      section('inventaire_patrimoine', 'Inventaire', [
        field('locaux', 'Bâtiments / niveaux / locaux techniques', 'text', 'rapide'),
        field('equipements', 'Équipements / quantités / localisation', 'text', 'rapide'),
        field('plaques', 'Marques / modèles / séries / années', 'text', 'standard'),
        field('etat', 'État / âge / obsolescence', 'text', 'standard'),
        field('photos', 'Photos / plaques / repérage', 'text', 'standard'),
      ]),
      section('inventaire_projection', 'Projection patrimoniale', [
        field('duree_vie', 'Durée de vie indicative / année remplacement', 'text', 'standard'),
        field('couts', 'Coûts de remplacement / date de valeur', 'text', 'expert'),
        field('criticite', 'Criticité / continuité / réglementation / énergie', 'text', 'expert'),
      ]),
    ],
  },

  inventaire_passation: {
    label: 'Inventaire / Passation',
    sections: [
      section('passation', 'Prise en charge', [
        field('inventaire', 'Inventaire attendu ↔ constaté', 'text', 'rapide'),
        field('ecarts', 'Manquants / supplémentaires / différences', 'text', 'rapide'),
        field('documents', 'Documents présents / à transmettre / obsolètes', 'text', 'standard'),
        field('index_stocks', 'Index / stocks / moyens d’accès', 'text', 'standard'),
        field('essais', 'Essais de fonctionnement réalisés', 'text', 'expert'),
        field('reservations', 'Réserves de prise en charge', 'text', 'standard'),
      ]),
    ],
  },

  etat_lieux_multisites: {
    label: 'État des lieux multi-sites',
    sections: [
      section('edl_site', 'État des lieux du site', [
        field('perimetre', 'Périmètre / bâtiments / locaux', 'text', 'rapide'),
        field('etat', 'État général', 'text', 'rapide'),
        field('equipements', 'Équipements présents', 'text', 'standard'),
        field('ecarts', 'Particularités / manquants / incohérences', 'text', 'standard'),
        field('photos', 'Photos représentatives / zones à suivre', 'text', 'standard'),
      ]),
    ],
  },

  audit_multisites: {
    label: 'Audit multi-sites',
    sections: [
      section('audit_multi_site', 'Audit du site', [
        field('synthese', 'Synthèse du site', 'text', 'rapide'),
        field('points_forts', 'Points satisfaisants / conformes à l’attendu', 'text', 'standard'),
        field('points_sensibles', 'Points sensibles / à contrôler', 'text', 'rapide'),
        field('actions', 'Actions / scénarios / budget local', 'text', 'standard'),
        field('comparabilite', 'Éléments permettant la comparaison inter-sites', 'text', 'expert'),
      ]),
    ],
  },

  controle_reglementaire: {
    label: 'Contrôle réglementaire ponctuel',
    sections: [
      section('reglementaire', 'Points contrôlés', [
        field('perimetre', 'Périmètre / équipement / installation', 'text', 'rapide'),
        field('reference', 'Référence / exigence applicable fournie', 'text', 'rapide'),
        field('constat', 'Constat factuel', 'text', 'rapide'),
        field('preuve', 'Photo / mesure / document', 'text', 'standard'),
        field('ecart', 'Écart / point à confirmer', 'text', 'standard'),
        field('action', 'Action corrective / suite proposée', 'text', 'expert'),
      ]),
    ],
  },

  securite_accessibilite: {
    label: 'Sécurité / Accessibilité',
    sections: [
      section('securite_acces', 'Observations terrain', [
        field('acces', 'Accès / cheminement / moyens d’intervention', 'text', 'rapide'),
        field('risques_visibles', 'Risques visibles / obstacles / protection', 'text', 'rapide'),
        field('signalisation', 'Repérage / signalisation / identification', 'text', 'standard'),
        field('preuve', 'Photos / plans / références', 'text', 'standard'),
        field('limites', 'Limites du contrôle / besoin d’un organisme compétent', 'text', 'expert'),
      ]),
    ],
  },

  controle_sanitaire: {
    label: 'Contrôle sanitaire ponctuel',
    sections: [
      section('controle_sanitaire', 'Contrôle sanitaire documentaire / terrain', [
        field('documents', 'Analyses / protocole / laboratoire / période', 'text', 'rapide'),
        field('points', 'Points / zones concernés', 'text', 'rapide'),
        field('mesures', 'Températures / observations terrain', 'text', 'standard'),
        field('ecarts', 'Résultats / valeurs à contrôler', 'text', 'standard'),
        field('actions', 'Actions / investigations demandées', 'text', 'expert'),
      ]),
    ],
  },

  controle_technique: {
    label: 'Contrôle technique ciblé',
    sections: [
      section('controle_technique', 'Contrôle ciblé', [
        field('objet', 'Objet du contrôle', 'text', 'rapide'),
        field('attendu', 'Fonction / valeur / état attendu', 'text', 'rapide'),
        field('observe', 'Observé / mesuré', 'text', 'rapide'),
        field('essai', 'Essai / méthode / condition', 'text', 'standard'),
        field('ecart', 'Écart / incohérence / à recontrôler', 'text', 'standard'),
        field('suite', 'Suite / action / document nécessaire', 'text', 'expert'),
      ]),
    ],
  },
});

function mergeSections(baseSections, extraSections) {
  const out = baseSections.map((item) => ({ ...item, fields: [...item.fields] }));
  for (const extra of extraSections || []) {
    const index = out.findIndex((item) => item.key === extra.key);
    if (index >= 0) out[index] = { ...out[index], ...extra, fields: [...out[index].fields, ...(extra.fields || [])] };
    else out.push({ ...extra, fields: [...(extra.fields || [])] });
  }
  return out;
}

const BASE_CAPABILITIES = Object.freeze({
  workflow: true,
  structure: true,
  technicalStructure: true,
  equipment: true,
  measurements: true,
  plans: true,
  map: false,
  actions: true,
  tests: false,
  calculations: true,
  scenarios: false,
  documents: true,
  inbox: true,
  excelMapping: true,
  photoAnnotations: true,
  synoptic: true,
  signature: false,
  package: true,
  reserveClearance: false,
  subjects: false,
  p3Dashboard: false,
  receptionBoard: false,
});

const FAMILY_CAPABILITIES = Object.freeze({
  etude_audit: { scenarios: true },
  travaux_chantier: { tests: true, subjects: true },
  campagne_multisites: { map: true },
  conformite_reglementaire: { tests: true },
});

const TYPE_CAPABILITIES = Object.freeze({
  diagnostic_chaufferie_ss: { scenarios: true, tests: true },
  diagnostic_ecs: { scenarios: true },
  diagnostic_ventilation_cta: { scenarios: true, tests: true },
  diagnostic_climatisation_pac: { scenarios: true, tests: true },
  diagnostic_gtb: { scenarios: true, tests: true },
  audit_energetique: { scenarios: true },
  audit_technique: { scenarios: true },
  diagnostic_cible: { scenarios: true, tests: true },
  etude_cvc: { scenarios: true },
  etude_renovation: { scenarios: true },
  etude_ecs: { scenarios: true },
  etude_ventilation_clim: { scenarios: true },
  etude_regulation_gtb: { scenarios: true },
  amo_travaux: { tests: true, subjects: true },
  moe_travaux: { tests: true, subjects: true },
  det_chantier: { tests: true, subjects: true },
  commissioning: { tests: true, receptionBoard: true },
  opr_reception: { tests: true, signature: true, receptionBoard: true },
  levee_reserves: { tests: true, signature: true, reserveClearance: true },
  passation_travaux_exploitant: { tests: true, signature: true, receptionBoard: true },
  controle_exploitation: { tests: true },
  assistance_p2_p3: { scenarios: true, tests: true, p3Dashboard: true },
  preallumage_reprise_saison: { tests: true },
  campagne_technique: { map: true },
  campagne_mesures: { map: true },
  inventaire_patrimonial: { map: true },
  inventaire_passation: { map: true, tests: true, signature: true },
  etat_lieux_multisites: { map: true },
  audit_multisites: { map: true, scenarios: true },
  controle_reglementaire: { tests: true },
  securite_accessibilite: { tests: true },
  controle_sanitaire: { tests: true },
  controle_technique: { tests: true },
});

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
      .map((item) => ({ ...item, fields: item.fields.filter((entry) => (LEVEL_RANK[entry.level] ?? 1) <= maxRank) }))
      .filter((item) => item.fields.length),
  };
}

export function getMissionCapabilities(family, missionType = null) {
  return {
    ...BASE_CAPABILITIES,
    ...(FAMILY_CAPABILITIES[family] || {}),
    ...(TYPE_CAPABILITIES[missionType] || {}),
  };
}

export function hasMissionTypeRecipe(missionType) {
  return Boolean(TYPE_RECIPES[missionType]);
}

export const MISSION_CAPTURE_MODES = Object.freeze([
  ['rapide', 'Rapide'],
  ['standard', 'Standard'],
  ['expert', 'Expert'],
]);

export const MISSION_RECIPE_TYPES = Object.freeze(Object.keys(TYPE_RECIPES));
