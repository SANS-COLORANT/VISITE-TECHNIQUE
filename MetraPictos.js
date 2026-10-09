/**
 * Pictogrammes METRA de la refonte des onglets de visite (151 dessins, grille
 * 24, trait 1,7) : encre pour la forme, accent orange pour l'élément qui
 * parle, bleu-vert pour l'eau. Les tracés viennent de
 * docs/refonte-visite-661/pictos/ via MetraPictos.data.js (généré).
 *
 * Les fonctions `picto…` donnent le pictogramme d'un onglet, d'une rubrique,
 * d'un type de compteur, d'équipement ou de photo à partir des libellés de la
 * trame : aucune clé de données ne change, seul l'affichage s'appuie dessus.
 */
import React, { memo } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { PICTO_DATA } from './MetraPictos.data.js';

export const PICTO_COLORS = Object.freeze({ ink: '#1A1A18', accent: '#F26426', water: '#0F7C8C' });

const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function couleur(role, palette) {
  if (role === 'i') return palette.ink;
  if (role === 'a') return palette.accent;
  if (role === 'w') return palette.water;
  return 'none';
}

function rendre(elements, palette, strokeWidth, prefix) {
  return elements.map((el, i) => {
    const key = `${prefix}${i}`;
    if (el[0] === 'g') {
      const [, tx, ty, k, enfants] = el;
      return <G key={key} transform={`translate(${tx} ${ty}) scale(${k})`}>{rendre(enfants, palette, strokeWidth / k, `${key}-`)}</G>;
    }
    const [stroke, fill, opacity] = el[0] === 'p' ? el.slice(2) : el.slice(4);
    const props = {
      stroke: couleur(stroke, palette),
      fill: couleur(fill, palette),
      fillOpacity: opacity == null ? undefined : opacity,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };
    if (el[0] === 'p') return <Path key={key} d={el[1]} {...props} />;
    return <Circle key={key} cx={el[1]} cy={el[2]} r={el[3]} {...props} />;
  });
}

/**
 * `mono` force une seule couleur (pictogramme sur fond orange, onglet actif).
 */
function PictoBase({ name, size = 24, ink = PICTO_COLORS.ink, accent = PICTO_COLORS.accent, water = PICTO_COLORS.water, mono, strokeWidth = 1.7 }) {
  const data = PICTO_DATA[name];
  if (!data) return null;
  const palette = mono ? { ink: mono, accent: mono, water: mono } : { ink, accent, water };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {rendre(data, palette, strokeWidth, 'k')}
    </Svg>
  );
}

export const Picto = memo(PictoBase);

/** Éléments SVG d'un pictogramme en une seule couleur, pour les dessiner dans un autre <Svg> (viewBox 24). */
export function pictoElements(name, mono, strokeWidth = 1.7) {
  const data = PICTO_DATA[name];
  if (!data) return null;
  return rendre(data, { ink: mono, accent: mono, water: mono }, strokeWidth, 'w');
}

export function hasPicto(name) { return Boolean(name && PICTO_DATA[name]); }

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

const ONGLETS = {
  'p-distrib': 'onglets/distribution',
  'p-regulation': 'onglets/regulation',
  'p-releves': 'onglets/releves',
  'p-conf-local': 'onglets/conf-local',
  'p-conf-energie': 'onglets/conf-energie',
  'p-conf-chauffage': 'onglets/conf-chauffage',
  'p-conf-ecs': 'onglets/conf-ecs',
  'p-conf-adouc': 'onglets/conf-adoucisseur',
  'p-equip': 'onglets/equipements',
  'p-remarques': 'onglets/reserves',
  'p-photos': 'onglets/photos',
  'p-pa-batiments': 'pa/installations',
  'p-pa-compteurs': 'pa/compteurs',
  'p-pa-regulation': 'pa/regulation',
  'p-pa-chaufferie': 'pa/chaufferie',
  'p-pa-sst': 'pa/sous-stations',
  'p-pa-conclusion': 'pa/conclusion',
};

export function pictoOnglet(panelId, trameId) {
  const id = String(panelId || '');
  if (ONGLETS[id]) return ONGLETS[id];
  if (id === 'p-vmc-infos') return 'onglets/informations-fiche-du-site-vmc';
  if (id === 'p-pa-infos') return 'onglets/informations-fiche-du-site-pre';
  if (id === 'p-infos') return /reseau/.test(norm(trameId)) ? 'onglets/informations-fiche-du-site-rese' : 'onglets/informations';
  const caisson = id.match(/^p-vmc-c(\d)$/);
  if (caisson) {
    const n = Number(caisson[1]);
    return n <= 3 ? `vmc/caisson-${n}-${n}` : 'vmc/caisson';
  }
  return null;
}

export function pictoTrame(trameId) {
  const t = norm(trameId);
  if (/vmc/.test(t)) return 'trames/vmc';
  if (/reseau/.test(t)) return 'trames/reseau-de-chaleur';
  if (/pre_?allumage/.test(t)) return 'trames/pre-allumage';
  return 'trames/icpe';
}

// ---------------------------------------------------------------------------
// Rubriques (sections) de toutes les trames
// ---------------------------------------------------------------------------

// [motif sur le titre normalisé, pictogramme, eau ?] — le premier qui correspond gagne.
const SECTIONS = [
  [/^general$|informations generales/, 'onglets/informations', false],
  [/principaux equipements/, 'onglets/equipements', false],
  [/distribution chauffage/, 'dist/distribution-chauffage', false],
  [/distribution ecs/, 'dist/distribution-ecs', true],
  [/cascade/, 'dist/cascade-chaudieres', false],
  [/reseau ecs/, 'dist/reseau-ecs', true],
  [/compteurs et manometres|^compteurs/, 'rel/compteurs', false],
  [/^pressions?/, 'rel/pressions', false],
  [/temperatures/, 'rel/temperatures-et-ph', false],
  [/partie local/, 'conf/partie-local', false],
  [/portes/, 'conf/portes-d-acces', false],
  [/^ventilation/, 'conf/ventilation', false],
  [/incendie/, 'conf/lutte-contre-l-incendie', false],
  [/affichage/, 'conf/affichages-reglementaires', false],
  [/evacuation/, 'conf/evacuation-des-eaux', true],
  [/combustible/, 'conf/coupure-combustible', false],
  [/coupure.*electrique/, 'conf/coupure-electrique', false],
  [/gaz/, 'conf/ligne-alimentation-gaz', false],
  [/armoire/, 'conf/armoire-electrique', false],
  [/baes/, 'conf/baes', false],
  [/conduits/, 'conf/conduits-de-fumees', false],
  [/soupape/, 'conf/soupapes', false],
  [/reseau\(x\)|alimente/, 'conf/reseau-x-alimente-s', true],
  [/^situation/, 'vmc/situation', false],
  [/^caisson/, 'vmc/caisson', false],
  [/^distribution$/, 'vmc/distribution', false],
  [/^gestion/, 'vmc/gestion', false],
  [/conclusion/, 'pa/conclusion', false],
  [/^autres?/, 'conf/autres', false],
];

/**
 * Pictogramme d'une rubrique. `panelId` distingue les rubriques homonymes
 * (« Disconnection et alimentation eau froide » en Chauffage et en ECS).
 * Retourne { name, water }.
 */
export function pictoSection(titre, panelId) {
  const t = norm(titre).trim();
  const pid = String(panelId || '');
  if (/disconnection|disconnexion/.test(t)) {
    return pid === 'p-conf-ecs' ? { name: 'conf/disconnexion-ecs', water: true } : { name: 'conf/disconnexion-chauffage', water: true };
  }
  if (/^traitement/.test(t)) {
    return pid === 'p-conf-ecs' ? { name: 'conf/traitement-ecs', water: true } : { name: 'conf/traitement-d-eau-chauffage', water: true };
  }
  if (pid === 'p-conf-ecs' && /^autres?/.test(t)) return { name: 'conf/ballon-et-points-de-controle', water: true };
  for (const [motif, name, water] of SECTIONS) {
    if (motif.test(t)) return { name, water };
  }
  if (/ecs|sanitaire/.test(t)) return { name: 'onglets/conf-ecs', water: true };
  if (/chauff/.test(t)) return { name: 'dist/distribution-chauffage', water: false };
  return { name: pictoOnglet(pid) || 'conf/autres', water: false };
}

/** Sous-groupes de « Lutte contre l'incendie » (préfixe « Extincteurs: … »). */
export function pictoIncendie(prefixe) {
  const t = norm(prefixe);
  if (/extincteur/.test(t)) return 'inc/extincteurs';
  if (/gaine|pompier/.test(t)) return 'inc/gaine-pompiers';
  if (/detection.*gaz|detecteur.*gaz/.test(t)) return 'inc/detection-gaz';
  if (/detection|detecteur/.test(t)) return 'inc/detection-incendie';
  if (/desenfumage/.test(t)) return 'inc/desenfumage';
  if (/sonore|sirene/.test(t)) return 'inc/alarme-sonore';
  if (/visuel|flash|gyro/.test(t)) return 'inc/alarme-visuelle';
  if (/sable|pelle/.test(t)) return 'inc/bac-a-sable-et-pelle';
  if (/sprinkl/.test(t)) return 'inc/sprinkler';
  return 'conf/lutte-contre-l-incendie';
}

/** Sous-groupes de Distribution (affichage seulement). */
export const DISTRIBUTION_GROUPES = Object.freeze([
  { key: 'reseau', label: 'Réseau', picto: 'dist/reseau', match: /materiaux|type de distribution/ },
  { key: 'organes', label: 'Organes', picto: 'dist/organes', match: /aller|retour|robinetterie|mitigeur/ },
  { key: 'emission', label: 'Émission', picto: 'dist/emission', match: /emetteur/ },
  { key: 'isolation', label: 'Isolation', picto: 'dist/isolation', match: /calorifuge/ },
  { key: 'pompe', label: 'Pompe', picto: 'dist/pompe', match: /vitesse/ },
]);

export function groupeDistribution(cle) {
  const t = norm(cle);
  return DISTRIBUTION_GROUPES.find((g) => g.match.test(t)) || null;
}

// ---------------------------------------------------------------------------
// Relevés
// ---------------------------------------------------------------------------

/** Pictogramme d'un compteur ou manomètre d'après son libellé / type. */
export function pictoCompteur(label) {
  const t = norm(label);
  if (/pression|manometre/.test(t)) return { name: /ecs|sanitaire/.test(t) ? 'rel/manometre-ecs' : 'rel/manometre-chauffage', water: /ecs|sanitaire/.test(t) };
  if (/fioul|cuve/.test(t)) return { name: 'rel/fioul', water: false };
  if (/gaz/.test(t)) return { name: 'rel/compteur-gaz', water: false };
  if (/electri/.test(t)) return { name: 'rel/electricite', water: false };
  if (/appoint/.test(t)) return { name: 'rel/eau-d-appoint-chauffage', water: true };
  if (/\bef\b|eau froide/.test(t)) return { name: /ecs/.test(t) ? 'rel/eau-froide-ecs' : 'rel/eau-froide-generale', water: true };
  if (/calorie|thermique/.test(t)) return { name: 'rel/calories', water: false };
  if (/energie|mwh|kwh/.test(t)) return /ecs/.test(t) ? { name: 'rel/energie-ecs', water: true } : { name: 'rel/energie-chauffage', water: false };
  if (/volum|debit/.test(t)) return { name: 'rel/volumetrique', water: true };
  if (/eau/.test(t)) return { name: 'rel/eau-froide-generale', water: true };
  return { name: 'rel/compteurs', water: false };
}

/** Pictogramme d'un circuit de températures (Primaire, Chauffage, ECS, Eau/pH). */
export function pictoCircuit(circuit) {
  const t = norm(circuit);
  if (/^ph|eau/.test(t)) return { name: 'rel/ph', water: true };
  if (/primaire/.test(t)) return { name: 'rel/t-primaire', water: false };
  if (/stockage|ballon/.test(t)) return { name: 'rel/t-de-stockage', water: true };
  if (/ecs|sanitaire/.test(t)) return { name: 'rel/t-ecs', water: true };
  if (/exterieur/.test(t)) return { name: 'dist/t-exterieure', water: false };
  return { name: 'rel/t-chauffage', water: false };
}

// ---------------------------------------------------------------------------
// Équipements, réserves, photos, actions
// ---------------------------------------------------------------------------

const EQUIPEMENTS = [
  [/chaudiere|bruleur|generateur/, 'eq/chaudiere'],
  [/circulateur/, 'eq/circulateur'],
  [/pompe/, 'eq/pompe'],
  [/echangeur/, 'eq/echangeur'],
  [/vase/, 'eq/vase-d-expansion'],
  [/ballon|preparateur|ecs/, 'eq/ballon-ecs'],
  [/adoucisseur/, 'eq/adoucisseur'],
  [/armoire|tableau|electri/, 'eq/armoire-electrique'],
  [/compteur/, 'eq/compteur'],
  [/manometre|pression/, 'eq/manometre'],
  [/soupape/, 'eq/soupape'],
  [/detendeur/, 'eq/detendeur'],
  [/vanne|servomoteur|robinet/, 'eq/vanne'],
  [/filtre/, 'eq/filtre'],
  [/desemboueur/, 'eq/desemboueur'],
  [/cta|traitement d.air/, 'eq/cta'],
  [/tourelle/, 'eq/tourelle'],
  [/vmc|caisson|extracteur/, 'eq/vmc'],
  [/ventil/, 'eq/ventilateur'],
  [/regul|automate|sonde/, 'onglets/regulation'],
];

export function pictoEquipement(type) {
  const t = norm(type);
  const hit = EQUIPEMENTS.find(([m]) => m.test(t));
  return hit ? hit[1] : 'onglets/equipements';
}

/** État constaté (valeurs acceptées par l'Intranet) ou statut de pointage. */
export function pictoEtatEquipement(etat) {
  const t = norm(etat);
  if (/hors/.test(t)) return 'eqs/hors-service';
  if (/vetuste/.test(t)) return 'eqs/vetuste';
  if (/moyen/.test(t)) return 'eqs/moyen';
  if (/neuf/.test(t)) return 'eqs/neuf';
  if (/bon/.test(t)) return 'eqs/bon';
  if (/nouveau/.test(t)) return 'eqs/nouveau';
  if (/present|confirm/.test(t)) return 'eqs/present';
  return 'eqs/a-voir';
}

const CRITICITES = ['res/information', 'res/mineur', 'res/a-programmer', 'res/important', 'res/prioritaire', 'res/critique'];
export function pictoCriticite(niveau) {
  const n = Math.max(0, Math.min(5, Number(niveau) || 0));
  return CRITICITES[n];
}

export function pictoPoste(poste) {
  const t = norm(poste);
  if (/p2|entretien/.test(t)) return 'res/entretien-p2';
  if (/amelioration/.test(t)) return 'res/travaux-d-amelioration';
  return 'res/travaux-de-conformite';
}

/** Origine d'une photo d'après sa `entite_key`. */
export function originePhoto(entiteKey) {
  const k = String(entiteKey || '');
  if (!k) return 'generale';
  if (/^(equipement|materiel|equipement_site)\|\|/.test(k)) return 'equipement';
  if (/^(compteur|compteur_site|point_mesure)\|\|/.test(k)) return 'compteur';
  if (/^remarque\|\|/.test(k)) return 'reserve';
  if (/^(reseau|reseau_site)\|\|/.test(k)) return 'generale';
  return 'conformite';
}

export const PHOTO_ORIGINES = Object.freeze([
  { key: 'generale', label: 'Générales', picto: 'ph/generale' },
  { key: 'equipement', label: 'Équipements', picto: 'ph/equipement' },
  { key: 'compteur', label: 'Compteurs', picto: 'ph/compteur' },
  { key: 'reserve', label: 'Réserves', picto: 'ph/reserve' },
  { key: 'conformite', label: 'Conformité', picto: 'ph/conformite' },
]);

export const ACTION_PICTOS = Object.freeze({
  rechercher: 'act/rechercher',
  compagnon: 'act/compagnon',
  photosReference: 'act/photos-de-reference',
  telecharger: 'act/telecharger',
  terminer: 'act/terminer',
  note: 'act/note',
  anomalie: 'act/anomalie',
  synchronisation: 'act/synchronisation',
  enregistre: 'act/enregistre',
  horsConnexion: 'act/hors-connexion',
  modePhoto: 'ph/mode-photo',
  plaque: 'ph/plaque-signaletique',
  levee: 'res/levee',
  reprise: 'res/reprise',
  primaire: 'res/primaire',
  secondaire: 'res/secondaire',
});
