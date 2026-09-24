import { getVisite } from './db.js';
import { prechargerDonneesTrameGenerique } from './TrameGenericPanel.js';
import { prechargerRegulation } from './OptimizedRegulationPanel.js';
import { markVisitHot } from './visitRuntimeCache.js';
import { prewarmPreviousVisitSnapshot } from './visitPreviousSnapshot.js';

const inFlight = new Map();

function keyOf(id) {
  return String(id || '').trim();
}

export async function prewarmVisit(visiteOrId, { force = false, preview = null } = {}) {
  const id = keyOf(typeof visiteOrId === 'string' ? visiteOrId : visiteOrId?.id);
  if (!id) return null;

  const currentPreview = preview || (typeof visiteOrId === 'object' ? visiteOrId : null);
  if (!force && inFlight.has(id)) return inFlight.get(id);

  const promise = Promise.all([
    getVisite(id),
    prechargerDonneesTrameGenerique(id, force),
    prechargerRegulation(id, force),
  ]).then(([visite]) => {
    const merged = { ...(currentPreview || {}), ...(visite || {}), id };
    markVisitHot(id, { preview: merged });
    // La comparaison historique est une référence séparée. Elle ne bloque pas
    // l'ouverture et ne recopie jamais réserves/photos dans la visite courante.
    prewarmPreviousVisitSnapshot(id).catch(() => {});
    return merged;
  }).finally(() => inFlight.delete(id));

  inFlight.set(id, promise);
  return promise;
}

export function prewarmVisitInBackground(visiteOrId, options = {}) {
  return prewarmVisit(visiteOrId, options).catch(() => null);
}
