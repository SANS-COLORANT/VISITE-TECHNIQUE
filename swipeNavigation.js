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
