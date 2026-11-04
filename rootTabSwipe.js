/** Gestures limités aux trois onglets racine de METRA. Pas de changement de visite ou de données. */
export const ROOT_TAB_KEYS = Object.freeze(['home', 'clients', 'settings']);
export const ROOT_TAB_ROUTES = Object.freeze({ home: 'Home', clients: 'MetraDirectory', settings: 'Parametres' });
export const ROUTE_ROOT_TABS = Object.freeze({ Home: 'home', MetraDirectory: 'clients', Parametres: 'settings' });

export function canStartRootSwipe(key, dx, dy) {
  const index = ROOT_TAB_KEYS.indexOf(key);
  if (index < 0 || Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.55) return false;
  return (dx < 0 && index < ROOT_TAB_KEYS.length - 1) || (dx > 0 && index > 0);
}
export function rootSwipeTarget(key, dx, vx = 0) {
  if (Math.abs(dx) < 38 && Math.abs(vx) < 0.65) return null;
  const index = ROOT_TAB_KEYS.indexOf(key);
  if (index < 0) return null;
  const direction = dx < 0 ? 1 : -1;
  return ROOT_TAB_KEYS[index + direction] || null;
}
export function rootSwipeProgress(dx) {
  // 56 px suffisent à faire voyager la bulle jusqu'à l'onglet voisin.
  return Math.max(-1, Math.min(1, -Number(dx || 0) / 56));
}
