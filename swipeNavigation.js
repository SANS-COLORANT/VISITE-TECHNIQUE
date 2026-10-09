// Balayage horizontal entre onglets : décisions pures (testables), sans dépendance React Native.
// Objectifs : un geste court suffit, la page suit le doigt, la fin du geste prolonge la vitesse du doigt.

/** Le geste démarre dès qu'il est un peu plus horizontal que vertical (un pouce n'est jamais droit). */
export const SWIPE_START_DISTANCE = 6;
export const SWIPE_START_DOMINANCE = 0.9;
/** Distance de validation : courte (3,5 % de la largeur, au moins 22 px). */
export const SWIPE_COMMIT_RATIO = 0.035;
export const SWIPE_COMMIT_MIN = 22;
/** Un petit coup de doigt rapide suffit (px/ms) ; la position est projetée 150 ms plus loin. */
export const SWIPE_FLICK_VELOCITY = 0.22;
export const SWIPE_FLICK_MIN_DISTANCE = 8;
export const SWIPE_PROJECTION_MS = 150;
/** Au bord (première/dernière page) la page résiste : elle ne suit que 24 % du doigt. */
export const SWIPE_EDGE_RESISTANCE = 0.24;

export function shouldStartSwipe(dx, dy) {
  const ax = Math.abs(dx);
  return ax > SWIPE_START_DISTANCE && ax > Math.abs(dy) * SWIPE_START_DOMINANCE;
}

/** 1 = page suivante (doigt vers la gauche), -1 = page précédente, 0 = on reste. */
export function swipeDirection(dx, vx, width) {
  const distance = Math.max(SWIPE_COMMIT_MIN, (Number(width) || 0) * SWIPE_COMMIT_RATIO);
  // Un doigt qui revient franchement en arrière annule le geste.
  if (dx * vx < 0 && Math.abs(vx) > 0.25) return 0;
  if (Math.abs(vx) >= SWIPE_FLICK_VELOCITY && Math.abs(dx) >= SWIPE_FLICK_MIN_DISTANCE) return vx < 0 ? 1 : -1;
  const projected = dx + vx * SWIPE_PROJECTION_MS;
  if (projected < -distance) return 1;
  if (projected > distance) return -1;
  return 0;
}

export function rubberBand(dx, atEdge) {
  return atEdge ? dx * SWIPE_EDGE_RESISTANCE : dx;
}

/**
 * Ressort de fin de geste (Animated.spring, pilote natif) : critique, sans rebond, qui reprend la
 * vitesse du doigt (px/s). Se pose en environ 0,2 s.
 */
export function settleSpring(vx = 0) {
  const velocity = Math.max(-3500, Math.min(3500, (Number(vx) || 0) * 1000));
  return { stiffness: 600, damping: 48, mass: 1, velocity, overshootClamping: true, restDisplacementThreshold: 0.4, restSpeedThreshold: 0.4 };
}

/** Pages voisines légèrement estompées pendant le glissé (interpolation native). */
export const SWIPE_NEIGHBOUR_OPACITY = 0.6;
export const SWIPE_NEIGHBOUR_SCALE = 0.975;

/**
 * Barre d'onglets liquide, 100 % native : la bulle est découpée en bandes
 * horizontales ; chaque bande est un liquide dont le bord est décalé selon la
 * position du geste. Tout est interpolé sur la valeur animée du pager (thread
 * natif) : aucun calcul JavaScript pendant le geste, donc aucun retard.
 *
 * `d` = position du geste par rapport à l'onglet (0 : plein, -1 : vide à
 * gauche, +1 : vide à droite). La vague est calme quand la bulle est pleine ou
 * vide et ondule au maximum à mi-remplissage.
 */
export const WAVE_ROWS = 16;
export const WAVE_AMP = 7;
export const WAVE_EDGE = WAVE_AMP + 4;       // marge du liquide de part et d'autre de la bulle
export const WAVE_SAMPLES = 80;               // échantillons de d entre +1 et -1
const WAVE_BLEND = 0.04;                      // zone où le liquide passe d'un bord à l'autre

export function echantillonsD() {
  const out = [];
  for (let j = 0; j <= WAVE_SAMPLES; j += 1) out.push(Math.round((1 - (2 * j) / WAVE_SAMPLES) * 10000) / 10000);
  return out;
}

/** Bord gauche du liquide de la bande k, dans le repère de la bulle (largeur W). */
export function bordBande(d, k, W, rows = WAVE_ROWS, amp = WAVE_AMP, edge = WAVE_EDGE) {
  const ad = Math.min(1, Math.abs(d));
  const enveloppe = Math.sin(Math.PI * ad);
  const onde = amp * enveloppe * Math.sin(2 * Math.PI * 1.1 * ((k + 0.5) / rows) + 2 * Math.PI * 2.2 * d);
  const bascule = Math.max(0, Math.min(1, (WAVE_BLEND - d) / (2 * WAVE_BLEND)));
  return W * Math.max(-1, Math.min(1, d)) + onde - 2 * edge * bascule;
}

/** Valeurs de sortie (translation du liquide) pour chaque échantillon de d. */
export function profilBande(k, W, rows = WAVE_ROWS) {
  return echantillonsD().map((d) => bordBande(d, k, W, rows));
}

/** Opacité de la icône blanche (point, pictogramme) : visible quand l'orange la recouvre. */
export function profilIcone(xCentre, W) {
  const c = xCentre / W;
  return echantillonsD().map((d) => (d >= 0
    ? Math.max(0, Math.min(1, (c + 0.05 - d) / 0.1))
    : Math.max(0, Math.min(1, (d - (c - 1) + 0.05) / 0.1))));
}

/** Plages d'entrée du pager (croissantes) correspondant aux échantillons de d. */
export function entreesPager(pageIndex, pagerWidth) {
  return echantillonsD().map((d) => -(pageIndex + d) * pagerWidth);
}
