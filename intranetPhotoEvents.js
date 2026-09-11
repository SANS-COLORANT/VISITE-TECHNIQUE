const listeners = new Set();
let revision = 0;

/**
 * Bus mémoire volontairement minuscule : une capture/remplacement/suppression
 * de photo peut rafraîchir les badges Intranet sans charger le moteur réseau ni
 * déclencher une requête par bouton.
 */
export function notifyIntranetPhotoChanged() {
  revision += 1;
  for (const listener of listeners) {
    try { listener(revision); } catch {}
  }
}

export function subscribeIntranetPhotoChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getIntranetPhotoRevision() {
  return revision;
}
