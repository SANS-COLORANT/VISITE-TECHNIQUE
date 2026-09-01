import { PORTS_BY_TYPE } from './HydraulicEquipmentSvg.js';

const E = (id, label, group, iconType, keywords = '') => ({ id, label, defaultLabel: label, group, iconType, keywords });

export const HYDRAULIC_EQUIPMENT_TYPES = Object.freeze([
  E('technical_equipment', 'Équipement technique', 'Général', 'hydraulic_separator', 'équipement générique appareil'),
  E('boiler', 'Chaudière', 'Production', 'boiler', 'chaudière gaz fioul'),
  E('condensing_boiler', 'Chaudière à condensation', 'Production', 'boiler', 'condensation gaz'),
  E('low_temperature_boiler', 'Chaudière basse température', 'Production', 'boiler', 'basse température'),
  E('biomass_boiler', 'Chaudière biomasse', 'Production', 'boiler', 'bois granulés pellets'),
  E('electric_boiler', 'Chaudière électrique', 'Production', 'boiler', 'électrique'),
  E('burner', 'Brûleur', 'Production', 'boiler', 'bruleur gaz fioul modulant'),
  E('heat_pump_air_water', 'PAC air/eau', 'Production', 'heat_exchanger', 'pompe à chaleur pac air eau'),
  E('heat_pump_water_water', 'PAC eau/eau', 'Production', 'heat_exchanger', 'pompe à chaleur pac géothermie eau eau'),
  E('chiller', 'Groupe froid', 'Production', 'heat_exchanger', 'groupe froid chiller'),
  E('cogeneration', 'Cogénération', 'Production', 'boiler', 'cogeneration cogénérateur'),
  E('solar_exchanger', 'Échangeur solaire', 'Production', 'heat_exchanger', 'solaire thermique'),

  E('pump', 'Pompe', 'Hydraulique', 'pump', 'pompe simple'),
  E('circulator', 'Circulateur', 'Hydraulique', 'pump', 'circulateur chauffage'),
  E('twin_pump', 'Pompe double', 'Hydraulique', 'twin_pump', 'pompe jumelée double'),
  E('booster_pump', 'Surpresseur', 'Hydraulique', 'twin_pump', 'surpresseur groupe pression'),
  E('recirculation_pump', 'Pompe de bouclage ECS', 'Hydraulique', 'pump', 'bouclage ecs pompe'),
  E('condensate_pump', 'Pompe de relevage condensats', 'Hydraulique', 'pump', 'condensats relevage'),
  E('heat_exchanger', 'Échangeur thermique', 'Hydraulique', 'heat_exchanger', 'échangeur plaques'),
  E('plate_heat_exchanger', 'Échangeur à plaques', 'Hydraulique', 'heat_exchanger', 'plaques'),
  E('tubular_heat_exchanger', 'Échangeur tubulaire', 'Hydraulique', 'heat_exchanger', 'tubulaire'),
  E('hydraulic_separator', 'Bouteille de découplage', 'Hydraulique', 'hydraulic_separator', 'bouteille découplage casse pression'),
  E('manifold', 'Collecteur / nourrice', 'Hydraulique', 'hydraulic_separator', 'collecteur nourrice départ retour'),
  E('buffer_tank', 'Ballon tampon', 'Hydraulique', 'dhw_tank', 'ballon tampon inertie'),
  E('storage_tank', 'Ballon de stockage', 'Hydraulique', 'dhw_tank', 'stockage'),
  E('expansion_vessel', "Vase d'expansion", 'Hydraulique', 'expansion_vessel', 'vase expansion'),
  E('expansion_unit', "Groupe de maintien de pression", 'Hydraulique', 'expansion_vessel', 'maintien pression expansion automatique'),
  E('dirt_separator', 'Désemboueur', 'Hydraulique', 'dirt_separator', 'pot boues désemboueur'),
  E('magnetic_dirt_separator', 'Désemboueur magnétique', 'Hydraulique', 'dirt_separator', 'magnétique pot boues'),
  E('air_separator', "Séparateur d'air", 'Hydraulique', 'dirt_separator', 'séparateur air'),
  E('combined_separator', 'Séparateur air/boues', 'Hydraulique', 'dirt_separator', 'air boues'),
  E('y_filter', 'Filtre Y', 'Hydraulique', 'y_filter', 'filtre tamis y'),
  E('basket_filter', 'Filtre à panier', 'Hydraulique', 'y_filter', 'filtre panier'),
  E('magnetic_filter', 'Filtre magnétique', 'Hydraulique', 'y_filter', 'filtre magnétique'),
  E('flexible_connector', 'Manchette / flexible', 'Hydraulique', 'hydraulic_separator', 'manchette flexible antivibratile'),
  E('expansion_joint', 'Compensateur de dilatation', 'Hydraulique', 'hydraulic_separator', 'compensateur dilatation'),

  E('shutoff_valve', "Vanne d'isolement", 'Robinetterie', 'shutoff_valve', 'vanne isolement arrêt papillon boisseau'),
  E('butterfly_valve', 'Vanne papillon', 'Robinetterie', 'shutoff_valve', 'papillon'),
  E('ball_valve', 'Vanne quart de tour', 'Robinetterie', 'shutoff_valve', 'quart tour boisseau sphérique'),
  E('gate_valve', 'Vanne à opercule', 'Robinetterie', 'shutoff_valve', 'opercule'),
  E('two_way_valve', 'Vanne 2 voies motorisée', 'Robinetterie', 'two_way_valve', '2 voies deux voies motorisée'),
  E('three_way_valve', 'Vanne 3 voies motorisée', 'Robinetterie', 'three_way_valve', '3 voies trois voies motorisée mélangeuse'),
  E('mixing_valve', 'Vanne mélangeuse', 'Robinetterie', 'three_way_valve', 'mélangeuse mélange chauffage'),
  E('thermostatic_mixing_valve', 'Mitigeur thermostatique', 'Robinetterie', 'three_way_valve', 'mitigeur thermostatique ecs'),
  E('balancing_valve', "Vanne d'équilibrage", 'Robinetterie', 'balancing_valve', 'équilibrage statique'),
  E('dynamic_balancing_valve', "Vanne d'équilibrage dynamique", 'Robinetterie', 'balancing_valve', 'équilibrage dynamique picv'),
  E('control_valve', 'Vanne de régulation', 'Robinetterie', 'two_way_valve', 'régulation motorisée'),
  E('differential_pressure_valve', 'Soupape différentielle', 'Robinetterie', 'balancing_valve', 'différentielle by-pass'),
  E('pressure_reducing_valve', 'Détendeur / réducteur de pression', 'Robinetterie', 'balancing_valve', 'détendeur réducteur pression'),
  E('check_valve', 'Clapet anti-retour', 'Robinetterie', 'check_valve', 'clapet anti retour'),
  E('backflow_preventer', 'Disconnecteur', 'Robinetterie', 'check_valve', 'disconnecteur antipollution'),
  E('solenoid_valve', 'Électrovanne', 'Robinetterie', 'two_way_valve', 'électrovanne'),
  E('drain_valve', 'Vanne de vidange', 'Robinetterie', 'shutoff_valve', 'vidange purge'),
  E('safety_valve', 'Soupape de sécurité', 'Sécurité', 'safety_valve', 'soupape sécurité'),
  E('air_vent', 'Purgeur automatique', 'Sécurité', 'air_vent', 'purgeur air'),
  E('vacuum_breaker', 'Casse-vide', 'Sécurité', 'air_vent', 'casse vide'),

  E('water_meter', "Compteur d'eau", 'Mesure', 'water_meter', 'compteur eau volume'),
  E('energy_meter', "Compteur d'énergie", 'Mesure', 'water_meter', 'compteur énergie thermique calorimètre'),
  E('gas_meter', 'Compteur gaz', 'Mesure', 'water_meter', 'gaz compteur'),
  E('flow_meter', 'Débitmètre', 'Mesure', 'water_meter', 'débit débitmètre'),
  E('pressure_gauge', 'Manomètre', 'Mesure', 'pressure_gauge', 'pression mano'),
  E('thermometer', 'Thermomètre', 'Mesure', 'thermometer', 'température thermomètre'),
  E('temperature_sensor', 'Sonde de température', 'Mesure', 'thermometer', 'sonde température départ retour extérieure'),
  E('pressure_sensor', 'Capteur de pression', 'Mesure', 'pressure_gauge', 'capteur pression transmetteur'),
  E('differential_pressure_sensor', 'Capteur de pression différentielle', 'Mesure', 'pressure_gauge', 'pression différentielle delta p'),
  E('flow_switch', 'Contrôleur de débit', 'Mesure', 'water_meter', 'flow switch débitostat'),
  E('pressure_switch', 'Pressostat', 'Mesure', 'pressure_gauge', 'pressostat'),

  E('dhw_tank', 'Ballon ECS', 'ECS / Traitement', 'dhw_tank', 'ballon ecs préparateur'),
  E('calorifier', 'Préparateur ECS', 'ECS / Traitement', 'dhw_tank', 'préparateur ecs calorifier'),
  E('instant_dhw', 'Préparateur ECS instantané', 'ECS / Traitement', 'heat_exchanger', 'ecs instantané'),
  E('softener', 'Adoucisseur', 'ECS / Traitement', 'hydraulic_separator', 'adoucisseur résine saumure'),
  E('dosing_pump', 'Pompe doseuse', 'ECS / Traitement', 'pump', 'doseuse produit traitement'),
  E('water_treatment', "Unité de traitement d'eau", 'ECS / Traitement', 'hydraulic_separator', 'traitement eau'),
  E('inhibitor_pot', "Pot d'injection / inhibiteur", 'ECS / Traitement', 'dirt_separator', 'pot injection inhibiteur'),
  E('neutralizer', 'Neutraliseur de condensats', 'ECS / Traitement', 'y_filter', 'neutraliseur condensats'),
  E('degasser', 'Dégazeur', 'ECS / Traitement', 'dirt_separator', 'dégazeur vide'),

  E('vmc_box', 'Caisson VMC', 'Aéraulique', 'vmc_box', 'vmc caisson extraction'),
  E('air_handling_unit', 'Centrale de traitement d’air', 'Aéraulique', 'vmc_box', 'cta centrale traitement air'),
  E('heat_recovery_unit', 'Récupérateur de chaleur', 'Aéraulique', 'heat_exchanger', 'récupérateur chaleur double flux'),
  E('fan', 'Ventilateur', 'Aéraulique', 'fan', 'ventilateur'),
  E('extractor', 'Extracteur', 'Aéraulique', 'fan', 'extracteur air'),
  E('duct_damper', 'Registre motorisé', 'Aéraulique', 'duct_damper', 'registre clapet motorisé'),
  E('fire_damper', 'Clapet coupe-feu', 'Aéraulique', 'duct_damper', 'clapet coupe feu ccf'),
  E('air_filter', 'Filtre à air', 'Aéraulique', 'air_filter', 'filtre air'),
  E('silencer', 'Piège à son / silencieux', 'Aéraulique', 'air_filter', 'silencieux piège son'),
  E('diffuser', 'Diffuseur / bouche', 'Aéraulique', 'fan', 'diffuseur bouche soufflage extraction'),
  E('air_grille', 'Grille aéraulique', 'Aéraulique', 'fan', 'grille air'),

  E('electrical_cabinet', 'Armoire électrique', 'Électricité / Régulation', 'vmc_box', 'armoire électrique tgbt coffret'),
  E('control_panel', 'Coffret de commande', 'Électricité / Régulation', 'vmc_box', 'coffret commande'),
  E('controller', 'Régulateur', 'Électricité / Régulation', 'pressure_gauge', 'régulateur automate'),
  E('actuator', 'Servomoteur', 'Électricité / Régulation', 'two_way_valve', 'servomoteur actionneur'),
  E('motor', 'Moteur électrique', 'Électricité / Régulation', 'fan', 'moteur'),
  E('frequency_drive', 'Variateur de fréquence', 'Électricité / Régulation', 'vmc_box', 'variateur vitesse fréquence vfd'),
  E('thermostat', 'Thermostat', 'Électricité / Régulation', 'thermometer', 'thermostat aquastat'),
  E('aquastat', 'Aquastat', 'Électricité / Régulation', 'thermometer', 'aquastat sécurité'),
  E('water_leak', "Fuite d'eau", 'Défauts / Repères', 'water_leak', 'fuite eau défaut'),
]);

const GENERIC_PORTS = Object.freeze([
  { id: 'left', label: 'Gauche', x: 4, y: 64 },
  { id: 'right', label: 'Droite', x: 124, y: 64 },
  { id: 'top', label: 'Haut', x: 64, y: 4 },
  { id: 'bottom', label: 'Bas', x: 64, y: 124 },
]);

const TYPE_MAP = new Map(HYDRAULIC_EQUIPMENT_TYPES.map((item) => [item.id, item]));

export function hydraulicEquipmentDefinition(type) {
  return TYPE_MAP.get(type) || TYPE_MAP.get('technical_equipment');
}

export function hydraulicIconType(type) {
  return hydraulicEquipmentDefinition(type)?.iconType || 'hydraulic_separator';
}

export function hydraulicPorts(type) {
  const iconType = hydraulicIconType(type);
  const ports = PORTS_BY_TYPE[iconType];
  return ports?.length ? ports : GENERIC_PORTS;
}

export const HYDRAULIC_PORTS_BY_TYPE = Object.freeze(Object.fromEntries(
  HYDRAULIC_EQUIPMENT_TYPES.map((item) => [item.id, hydraulicPorts(item.id)])
));

export const HYDRAULIC_GROUPS = Object.freeze([...new Set(HYDRAULIC_EQUIPMENT_TYPES.map((item) => item.group))]);

const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function mapMaterialToHydraulicType(material = {}) {
  const text = norm([material.categorie, material.designation, material.marque, material.modele].filter(Boolean).join(' '));
  const rules = [
    [['chaudiere'], 'boiler'], [['bruleur'], 'burner'], [['pac ', 'pompe a chaleur'], 'heat_pump_air_water'], [['groupe froid', 'chiller'], 'chiller'],
    [['pompe double', 'pompe jumel'], 'twin_pump'], [['circulateur'], 'circulator'], [['pompe de bouclage', 'bouclage ecs'], 'recirculation_pump'], [['pompe'], 'pump'],
    [['echangeur'], 'heat_exchanger'], [['bouteille', 'decoupl'], 'hydraulic_separator'], [['collecteur', 'nourrice'], 'manifold'], [['ballon tampon'], 'buffer_tank'],
    [['ballon ecs', 'preparateur ecs'], 'dhw_tank'], [['vase', 'expansion'], 'expansion_vessel'], [['desemboueur', 'pot a boue'], 'dirt_separator'], [['adoucisseur'], 'softener'],
    [['disconnecteur'], 'backflow_preventer'], [['detendeur', 'reducteur de pression'], 'pressure_reducing_valve'], [['clapet anti retour'], 'check_valve'], [['soupape'], 'safety_valve'],
    [['vanne 3', 'vanne trois', 'melangeuse', 'mitigeur'], 'three_way_valve'], [['vanne 2', 'vanne deux'], 'two_way_valve'], [['equilibrage'], 'balancing_valve'], [['vanne', 'robinetterie'], 'shutoff_valve'],
    [['compteur energie', 'calorimet'], 'energy_meter'], [['compteur gaz'], 'gas_meter'], [['compteur', 'debitmetre'], 'water_meter'], [['manometre'], 'pressure_gauge'], [['thermometre', 'sonde temperature'], 'thermometer'],
    [['caisson', 'vmc'], 'vmc_box'], [['ventilateur'], 'fan'], [['extracteur'], 'extractor'], [['registre'], 'duct_damper'], [['clapet coupe feu'], 'fire_damper'], [['filtre air'], 'air_filter'],
    [['armoire electrique'], 'electrical_cabinet'], [['coffret'], 'control_panel'], [['regulateur', 'automate'], 'controller'], [['servomoteur'], 'actuator'], [['variateur'], 'frequency_drive'],
    [['filtre'], 'y_filter'], [['purgeur'], 'air_vent'], [['fuite'], 'water_leak'],
  ];
  for (const [needles, type] of rules) {
    if (needles.some((needle) => text.includes(norm(needle)))) return type;
  }
  return 'technical_equipment';
}

export function searchHydraulicEquipment(query = '', group = null) {
  const q = norm(query);
  return HYDRAULIC_EQUIPMENT_TYPES.filter((item) => {
    if (group && item.group !== group) return false;
    if (!q) return true;
    return norm(`${item.label} ${item.keywords} ${item.group}`).includes(q);
  });
}
