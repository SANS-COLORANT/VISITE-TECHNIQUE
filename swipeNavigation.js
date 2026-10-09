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
 * Barre d'onglets liquide. Chaque bulle est un liquide dont le bord ondule :
 * `d` = position du geste par rapport à l'onglet (0 : plein, -1 : vide à gauche,
 * +1 : vide à droite), `vel` = vitesse du doigt en onglets par seconde (signée).
 * Le creux de la vague et l'arc du bord croissent avec la vitesse et retombent
 * à l'arrêt. Retourne le tracé SVG de la zone orange (largeur W, hauteur H).
 */
export const WAVE_SPEED_GAIN = 5.5;
export const WAVE_AMPLITUDE = 7;
export const WAVE_BOW = 10;
export const WAVE_REST = 0.015;

export function cheminVague(d, W, H, vel, phase, dir = 1) {
  if (Math.abs(d) < 0.001) return `M-2,-2H${W + 2}V${H + 2}H-2Z`;
  if (Math.abs(d) >= 0.999) return 'M0,0Z';
  const force = Math.min(1, Math.abs(vel) * WAVE_SPEED_GAIN);
  const amp = force * WAVE_AMPLITUDE;
  const bow = force * WAVE_BOW * (vel < 0 ? -1 : vel > 0 ? 1 : dir);
  const xe = d >= 0 ? W * d : W * (1 + d);
  const pts = [];
  for (let y = 0; y <= H + 2; y += 2) {
    const k = Math.sin(Math.PI * Math.min(y, H) / H);
    const x = xe + bow * k + amp * Math.sin((y / H) * 6.28 * 1.1 + phase) * k;
    pts.push(`${Math.max(-12, Math.min(W + 12, x)).toFixed(1)},${y}`);
  }
  return d > 0
    ? `M${pts.join('L')}L${W + 3},${H + 2}L${W + 3},0Z`
    : `M${pts.join('L')}L-3,${H + 2}L-3,0Z`;
}

/**
 * Opacités natives (thread UI) des deux couches d'une bulle : la couche fixe
 * (orange plein, au repos) et la couche vague (pendant le mouvement).
 */
export function couchesOnglet(pagerX, pagerWidth, pageIndex) {
  const e = WAVE_REST * pagerWidth;
  const entree = [-pageIndex * pagerWidth - e, -pageIndex * pagerWidth, -pageIndex * pagerWidth + e];
  return {
    repos: pagerX.interpolate({ inputRange: entree, outputRange: [0, 1, 0], extrapolate: 'clamp' }),
    mouvement: pagerX.interpolate({ inputRange: entree, outputRange: [1, 0, 1], extrapolate: 'clamp' }),
  };
}
