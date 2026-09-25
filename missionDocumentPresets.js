function doc(key, label, type, comment = null) {
  return { key, label, type, comment };
}

const BASE = Object.freeze({
  diagnostic: [
    doc('plans', 'Plans / schémas disponibles', 'plan', 'Source utile à confronter au terrain.'),
    doc(
      'inventaire',
      'Inventaire équipements existant',
      'inventory',
      'Conserver la source et tracer les écarts terrain.'
    ),
    doc('doe', 'DOE / notices / fiches techniques disponibles', 'doe'),
    doc('rapports', 'Rapports / comptes rendus antérieurs', 'report')
  ],
  study: [
    doc('plans', 'Plans / schémas existants', 'plan'),
    doc('doe', 'DOE / notices / fiches techniques', 'doe'),
    doc('inventaire', 'Inventaire de l’existant', 'inventory'),
    doc('contraintes', 'Documents de contraintes / accès / autres lots', 'constraint')
  ],
  works: [
    doc('plans_execution', 'Plans / documents d’exécution', 'execution_plan'),
    doc('fiches_techniques', 'Fiches techniques / matériels proposés', 'technical_sheet'),
    doc('visa', 'Documents soumis au VISA', 'visa'),
    doc('planning', 'Planning / phasage à jour', 'planning')
  ],
  reception: [
    doc('doe', 'DOE', 'doe'),
    doc('plans_recolement', 'Plans de récolement / as-built', 'as_built'),
    doc('pv_essais', 'PV d’essais / mise en service', 'test_report'),
    doc('notices', 'Notices d’exploitation / maintenance', 'manual'),
    doc('fiches', 'Fiches techniques matériels installés', 'technical_sheet')
  ],
  passation: [
    doc('inventaire', 'Inventaire contradictoire / liste équipements', 'inventory'),
    doc('doe', 'DOE / notices disponibles', 'doe'),
    doc('schemas', 'Schémas / synoptiques à jour', 'plan'),
    doc('acces', 'Accès, sauvegardes, codes ou moyens de communication à remettre', 'handover_access'),
    doc('historique', 'Historique utile des interventions / réglages', 'history')
  ],
  control: [
    doc('reference', 'Référence / exigence / document de contrôle', 'reference'),
    doc('preuve', 'Preuve / justificatif attendu', 'evidence'),
    doc('historique', 'Document / rapport antérieur utile', 'history')
  ],
  campaign: [
    doc('liste_sites', 'Liste des sites / points de campagne', 'campaign_list'),
    doc('inventaire', 'Inventaire / fichier de préparation', 'inventory'),
    doc('plans', 'Plans / fonds utiles à la campagne', 'plan')
  ],
  followUp: [
    doc('precedent', 'Compte rendu / état précédent', 'previous_report'),
    doc('devis', 'Devis / justificatifs / documents attendus', 'followup_document')
  ]
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
  expertise_sinistre: 'diagnostic',

  campagne_technique: 'campaign',
  campagne_mesures: 'campaign',
  inventaire_patrimonial: 'campaign',
  inventaire_passation: 'passation',
  etat_lieux_multisites: 'campaign',
  audit_multisites: 'campaign',

  controle_reglementaire: 'control',
  securite_accessibilite: 'control',
  controle_sanitaire: 'control',
  controle_technique: 'control'
});

const OVERRIDES = Object.freeze({
  audit_energetique: [
    doc('factures', 'Factures / historiques de consommations', 'energy_bills'),
    doc('comptage', 'Relevés / exports de comptage', 'metering'),
    doc('dju', 'Données climatiques / DJU utilisées', 'weather_data')
  ],
  diagnostic_chaufferie_ss: [
    doc('schema_hydraulique', 'Schéma hydraulique / synoptique', 'plan'),
    doc('combustion', 'Tickets / contrôles combustion exploitant', 'operator_test'),
    doc('contrat', 'Éléments contractuels d’exploitation utiles', 'contract')
  ],
  diagnostic_ecs: [
    doc('schema_ecs', 'Schéma ECS / bouclage / colonnes', 'plan'),
    doc('analyses', 'Analyses sanitaires / laboratoire disponibles', 'sanitary_analysis'),
    doc('suivi_temp', 'Relevés / historiques de températures', 'temperature_log')
  ],
  diagnostic_climatisation_pac: [
    doc('schema_froid', 'Schéma / implantation UE-UI / circuits', 'plan'),
    doc('fluide', 'Informations fluide frigorigène / charge', 'refrigerant'),
    doc('maintenance', 'Historique maintenance / défauts', 'maintenance_history')
  ],
  diagnostic_gtb: [
    doc('architecture_gtb', 'Architecture régulation / GTB / GTC', 'gtb_architecture'),
    doc('sauvegardes', 'Sauvegardes / programmes / exports disponibles', 'backup'),
    doc('acces', 'Informations accès / licences / abonnements / communications', 'access')
  ],
  etude_renovation: [
    doc('prix', 'Prix / devis / références budgétaires', 'cost_reference'),
    doc('contraintes', 'Contraintes manutention / grutage / accès', 'constraint')
  ],
  det_chantier: [
    doc('cr_precedent', 'Compte rendu chantier précédent', 'previous_report'),
    doc('planning', 'Planning chantier à jour', 'planning')
  ],
  commissioning: [
    doc('protocole', 'Protocoles de mise en service / essais', 'test_protocol'),
    doc('reglages', 'Réglages / consignes / paramètres finaux', 'settings')
  ],
  opr_reception: [doc('liste_opr', 'Liste des ouvrages / prestations à contrôler', 'opr_list')],
  levee_reserves: [
    doc('liste_reserves', 'Liste des réserves à recontrôler', 'reserve_list'),
    doc('preuves_initiales', 'Photos / preuves initiales', 'evidence')
  ],
  passation_travaux_exploitant: [
    doc('formation', 'Support de formation / prise en main exploitant', 'training'),
    doc('coordonnees', 'Contacts / interlocuteurs / garanties utiles', 'handover_contact')
  ],
  controle_exploitation: [
    doc('contrat', 'Contrat / obligations d’exploitation utiles', 'contract'),
    doc('journal', 'Journal / relevés / historiques exploitant', 'operator_log')
  ],
  assistance_p2_p3: [
    doc('contrat_p2p3', 'Contrat P2 / P3 et annexes', 'contract'),
    doc('inventaire_p3', 'Inventaire P3 / garantie totale', 'inventory'),
    doc('historique_renouvellement', 'Historique renouvellements / travaux P3', 'renewal_history'),
    doc('budget_p3', 'Éléments budgétaires / dépenses / devis', 'cost_reference')
  ],
  suivi_sanitaire: [
    doc('analyses', 'Analyses sanitaires / laboratoire', 'sanitary_analysis'),
    doc('plan_prelevement', 'Plan / liste des points de prélèvement', 'sampling_plan')
  ],
  preallumage_reprise_saison: [
    doc('consignes_saison', 'Consignes / programmation de reprise', 'settings'),
    doc('historique_incidents', 'Incidents / actions avant reprise', 'history')
  ],
  expertise_sinistre: [
    doc('etat_initial', 'Photos / constat initial disponible', 'evidence'),
    doc('declarations', 'Déclarations / courriers / éléments chronologiques', 'chronology'),
    doc('interventions', 'Rapports d’interventions antérieures', 'history')
  ],
  campagne_mesures: [
    doc('liste_points', 'Liste des points de mesure', 'campaign_list'),
    doc('references_mesure', 'Valeurs attendues / consignes / références', 'reference')
  ],
  inventaire_patrimonial: [
    doc('inventaire_source', 'Inventaire source à contrôler', 'inventory'),
    doc('nomenclature', 'Nomenclature / repérage patrimoine', 'asset_reference')
  ],
  inventaire_passation: [doc('inventaire_attendu', 'Inventaire attendu avant passation', 'inventory')],
  audit_multisites: [doc('synthese_sites', 'Synthèse / liste des sites', 'campaign_list')],
  controle_reglementaire: [
    doc('reference_reglementaire', 'Référence réglementaire / exigence applicable', 'regulatory_reference')
  ],
  securite_accessibilite: [
    doc('reference_securite', 'Référence / plan / exigence sécurité-accessibilité', 'reference')
  ],
  controle_sanitaire: [doc('reference_sanitaire', 'Références / analyses sanitaires utiles', 'sanitary_analysis')]
});

function merge(base = [], extra = []) {
  const seen = new Set();
  const out = [];
  for (const item of [...extra, ...base]) {
    const key = String(item.key || item.label || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function getMissionExpectedDocumentPresets(missionType) {
  const group = TYPE_GROUP[missionType] || 'diagnostic';
  return merge(BASE[group] || [], OVERRIDES[missionType] || []);
}

export const MISSION_DOCUMENT_PRESET_TYPES = Object.freeze(Object.keys(TYPE_GROUP));
