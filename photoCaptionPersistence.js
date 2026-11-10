/** Écriture durable et ordonnée des légendes photo. */
import { renommerPhotoVisite } from './photoDb.js';
import { upsertRuntimePhoto } from './photoRuntimeCache.js';

const enAttente = new Map();
const identity = (visitId, photoId) => String(visitId) + ':' + String(photoId);

export function legendePhotoValide(value) {
  const label = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return Boolean(label && label.length <= 160 && !label.includes('||'));
}

export function sauvegarderLegendePhoto(visiteId, photoId, value) {
  const label = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!visiteId || !photoId || !legendePhotoValide(label))
    return Promise.reject(new Error('Libellé photo invalide : 1 à 160 caractères, sans ||.'));
  const key = identity(visiteId, photoId);
  const previous = enAttente.get(key) || Promise.resolve();
  // Une saisie plus ancienne ne peut pas terminer après la nouvelle.
  const task = previous.catch(() => {}).then(async () => {
    const result = await renommerPhotoVisite(visiteId, photoId, label);
    upsertRuntimePhoto(visiteId, { id: photoId, label: result.label, libelle_personnalise: 1 });
    return result;
  });
  enAttente.set(key, task);
  task.finally(() => {
    if (enAttente.get(key) === task) enAttente.delete(key);
  }).catch(() => {});
  return task;
}

export async function attendreLegendesPhotos(visitIds = null) {
  const visits = visitIds ? new Set(visitIds.map(String)) : null;
  const active = [...enAttente.entries()]
    .filter(([key]) => !visits || visits.has(key.split(':')[0]))
    .map(([, task]) => task);
  const outcome = await Promise.allSettled(active);
  const error = outcome.find((x) => x.status === 'rejected');
  if (error) throw error.reason;
}
