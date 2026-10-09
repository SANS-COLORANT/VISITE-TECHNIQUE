/**
 * Fiches d'aide par appui long (onglets et lignes de contrôle).
 *
 * Module pur : données du dossier des aides (aideReglementaireData.js),
 * recherche des fiches et petits calculs d'aide de dimensionnement.
 * Règles de conception (dossier du 9 octobre 2026, docs/AIDE_REGLEMENTAIRE.md) :
 * - ouvrir une aide ne modifie jamais un avis et ne crée jamais de réserve ;
 * - un calcul est une « aide de dimensionnement », jamais un verdict ;
 * - une donnée absente donne « données manquantes », jamais un seuil par défaut ;
 * - hors du domaine d'une méthode, on renvoie vers une note adaptée.
 */
import { AIDE_ACTIONS, AIDE_LIGNES, AIDE_ONGLETS, AIDE_SOURCES, AIDE_THEMES } from './aideReglementaireData.js';

export const APPUI_LONG_MS = 550;

/** Fiches dotées d'un schéma ou d'un calcul. */
export const VISUEL_THEME = Object.freeze({
  issues: 'issues', ventilation: 'ventilation', extincteurs: 'extincteurs', gaine: 'gaine', gazdetect: 'chaine',
  ecs_temp: 'ecs', baes: 'baes', vmc_debits: 'vmc', compteurs: 'compteurs',
});

/** En bref : formulations courtes validées pour les fiches à visuel. */
export const BREF_THEME = Object.freeze({
  ventilation: ['Amenée basse et évacuation haute permanentes (1978, art. 11).', 'En 2910 déclaration : balayage efficace du local, même après l’arrêt.', 'Pas de formule ICPE unique : la méthode ci-dessous vaut pour des ouvertures directes avec air de combustion pris dans le local.'],
  extincteurs: ['Le nombre et le type dépendent du combustible, du régime et des textes cumulés.', 'Gaz : un appareil à poudre 5 A–34 B, mention « Ne pas utiliser sur flamme gaz ».', 'Le maximum cité par un texte ne plafonne pas les besoins du site.'],
  issues: ['Moyens de retraite dans deux directions, avec des exceptions pour une seule direction selon le fluide, la situation et la puissance (1978, art. 5).', '« Deux portes pour toute chaufferie » serait inexact.'],
  gaine: ['Chaufferie en sous-sol (1978, art. 15) : section de 16 dm², plus petite dimension d’au moins 20 cm.', 'Débouché extérieur au sol, obturateur démontable sans outil, gaine repérée.'],
  ecs_temp: ['Distinguer stockage, distribution, retour et puisage, puis appliquer la limite au point concerné.', 'Puisage : 50 °C maximum pour la toilette, 60 °C dans les autres pièces.', '58–60 °C est un réglage d’exploitation à justifier, pas une limite universelle.'],
  vmc_debits: ['Arrêté de 1982 : débits par pièce, débits réduits et systèmes modulés sont distincts.', 'Le débit nominal du ventilateur ne prouve pas la conformité de chaque logement.'],
  compteurs: ['Relever l’index avec son unité, son identifiant et l’heure.', 'Un compteur remplacé ou remis à zéro se traite à part : un écart négatif n’est pas une économie.'],
});

export function getTheme(id) { return AIDE_THEMES[id] || null; }
export function getSource(id) { return AIDE_SOURCES[id] || null; }

/** Panneau de référence : les caissons VMC suivent le modèle du premier. */
export function panneauReference(panelId) {
  return /^p-vmc-c\d+$/.test(String(panelId)) ? 'p-vmc-c1' : String(panelId || '');
}

/** Fiches de l'onglet, dans l'ordre du dossier. */
export function themesDeLOnglet(trameId, panelId) {
  const ids = AIDE_ONGLETS[trameId]?.[panneauReference(panelId)] || [];
  return ids.map((id) => AIDE_THEMES[id]).filter(Boolean);
}

/** Fiche et action propres à une ligne (trame, code de section, libellé exact). */
export function ficheDeLaLigne(trameId, sectionCode, cle) {
  const hit = AIDE_LIGNES[trameId]?.[`${sectionCode}||${String(cle || '').trim()}`];
  if (!hit) return null;
  const theme = AIDE_THEMES[hit[0]];
  return theme ? { theme, action: AIDE_ACTIONS[hit[1]] || '' } : null;
}

/** Code panneau d'après le code de section de l'application (« conf-local.partie_local »). */
export function panneauDeSection(sectionCode) {
  const prefix = String(sectionCode || '').split('.')[0];
  return prefix ? `p-${prefix}` : '';
}

/** Nature affichée : une des quatre mentions du dossier. */
export function natureTheme(theme) {
  const n = String(theme?.nature || '').toLowerCase();
  if (/à déterminer/.test(n)) return { code: 'det', label: 'Règle à déterminer' };
  if (/^obligation/.test(n)) return { code: 'ob', label: /conditionnelle/.test(n) ? 'Obligation conditionnelle' : 'Obligation applicable' };
  if (/prescription/.test(n)) return { code: 'pr', label: 'Prescription technique' };
  return { code: 'co', label: 'Conseil d’exploitation' };
}

export function premiereLigne(texte) {
  const m = String(texte || '').match(/^.*?[.](\s|$)/);
  return (m ? m[0] : String(texte || '')).trim();
}

/** En bref : formulation validée si elle existe, sinon le texte court du dossier. */
export function enBref(theme) {
  if (BREF_THEME[theme.id]) return BREF_THEME[theme.id];
  const premiere = premiereLigne(theme.popup);
  const reste = String(theme.popup).slice(premiere.length).trim();
  return [premiere, reste].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Calculs d'aide
// ---------------------------------------------------------------------------

/** Nombre lu dans une saisie libre (« 1 245 », « 2,5 »). NaN si illisible. */
export function nombre(texte) {
  const brut = String(texte ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!brut) return NaN;
  return /^[-+]?\d+(\.\d+)?$/.test(brut) ? Number(brut) : NaN;
}

/** Arrondi vers le haut (une section retenue ne se réduit jamais par arrondi). */
export function arrondiSuperieur(valeur, decimales = 2) {
  const k = 10 ** decimales;
  return Math.ceil(Math.round(valeur * k * 1e6) / 1e6) / k;
}

/**
 * Sections libres de ventilation, DTU 65.4 (synthèse GRDF Cegibat) : ouvertures
 * directes à travers une paroi, air de combustion pris dans le local, P < 2 000 kW.
 *   SVB ≥ max(P / 23 ; 2,5) dm²    SVH ≥ max(A / 10 ; 2,5) dm²
 */
export function sectionsVentilation({ kw, surface, passageLibrePct } = {}) {
  const P = nombre(kw); const A = nombre(surface); const g = nombre(passageLibrePct);
  if (!(P > 0) || !(A > 0)) return { statut: 'manquantes' };
  if (P >= 2000) return { statut: 'hors', raison: 'Puissance de 2 000 kW ou plus : demander une note aéraulique.' };
  const vb = Math.max(P / 23, 2.5);
  const vh = Math.max(A / 10, 2.5);
  const coef = g > 0 && g <= 100 ? g / 100 : null;
  return {
    statut: 'aide', vb, vh, vbM2: vb / 100, vhM2: vh / 100,
    brutVbM2: coef ? vb / coef / 100 : null, brutVhM2: coef ? vh / coef / 100 : null, coefficientConnu: Boolean(coef),
  };
}

/** Débits de l'arrêté de 1982 (logements) : cuisine, salle de bains, total réduit, en m³/h. */
export const DEBITS_VMC = Object.freeze({
  1: [75, 15, 35], 2: [90, 15, 60], 3: [105, 30, 75], 4: [120, 30, 90], 5: [135, 30, 105], 6: [135, 30, 120], 7: [135, 30, 135],
});

/** Q (m³/h) = 3 600 × v (m/s) × S (m²) */
export function debitDepuisVitesse(v, s) {
  const V = nombre(v); const S = nombre(s);
  if (!(V > 0) || !(S > 0)) return null;
  return 3600 * V * S;
}

/** Écart d'index = actuel − précédent ; négatif : remplacement ou remise à zéro à vérifier. */
export function ecartIndex(actuel, precedent) {
  const a = nombre(actuel); const b = nombre(precedent);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { ecart: a - b, negatif: a < b };
}

/** P (kW) ≈ 1,163 × q (m³/h) × ΔT (K), eau dans un domaine usuel : approximation, pas un seuil légal. */
export function puissanceHydraulique(q, dt) {
  const Q = nombre(q); const D = nombre(dt);
  if (!(Q > 0) || !(D > 0)) return null;
  return 1.163 * Q * D;
}

/**
 * Repère de température ECS (arrêté de 1978, art. 36) : jamais un avis.
 * point : 'sto' (sortie stockage ≥ 400 L), 'dis' (distribution, points à risque),
 * 'toi' (puisage toilette), 'aut' (puisage autres pièces).
 */
export function repereEcs(point, temperature) {
  const t = nombre(temperature);
  if (!Number.isFinite(t)) return null;
  if (point === 'sto') return t >= 55
    ? 'Au-dessus de 55 °C : repère atteint pour un stockage de 400 L ou plus (hors préchauffage).'
    : 'Sous 55 °C : vérifier le traitement thermique quotidien conforme à l’annexe.';
  if (point === 'dis') return t >= 50
    ? 'À 50 °C ou plus : repère atteint pour un réseau avec points à risque.'
    : 'Sous 50 °C : vérifier le volume de distribution et les tubes terminaux (3 L).';
  if (point === 'toi') return t <= 50
    ? 'À 50 °C ou moins : limite de puisage pour la toilette respectée.'
    : 'Au-dessus de 50 °C : limite de puisage pour la toilette dépassée.';
  return t <= 60
    ? 'À 60 °C ou moins : limite de puisage des autres pièces respectée.'
    : 'Au-dessus de 60 °C : limite de puisage des autres pièces dépassée (cas particuliers ERP à vérifier).';
}

/** Cas d'extincteurs : texte, appareils, précisions. */
export const EXTINCTEURS_CAS = Object.freeze({
  gaz: { label: 'Gaz', lignes: [['Texte', '1978, art. 20'], ['Appareil', '1 poudre 5 A–34 B'], ['Mention', '« Ne pas utiliser sur flamme gaz »']] },
  liq: { label: 'Liquide ou solide', lignes: [['Texte', '1978, art. 20'], ['Appareils', '2 par brûleur, maximum exigible 4'], ['Sable', '0,10 m³ et pelle']] },
  dc: { label: 'ICPE 2910 DC', lignes: [['Texte', '2910 DC, point 4.2'], ['Appareils', 'au moins 1 par appareil de combustion'], ['Maximum exigible', '2, adapté aux risques']] },
  trav: { label: 'Lieu de travail', lignes: [['Texte', 'Code du travail'], ['Eau pulvérisée', '6 L par 200 m²'], ['Niveaux', '1 appareil par niveau']] },
});

/** Puissance totale installée de la visite, lue dans une saisie libre. null si absente ou ambiguë. */
export function puissanceDeLaVisite(valeur) {
  const n = nombre(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}
