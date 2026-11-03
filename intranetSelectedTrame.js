/**
 * Preparation d'une visite Intranet pour la trame Symfony selectionnee.
 * La preparation filtree est propre a cette creation : elle ne remplace pas
 * la reference globale du local et ne reimporte pas une ancienne visite.
 */
import { getCachedLocalReference, normalizePreparationPayload } from './symfonyApiCacheDb.js';
import { getCachedStructureReferential, syncStructureReferential } from './intranetStructureDb.js';
import { syncClientPreparation } from './symfonyApi.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';

function id(value) { return value == null ? '' : String(value).trim(); }
function validId(value) {
  const v = id(value);
  return /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
}
function preparationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function criterionCount(trame) {
  return (Array.isArray(trame?.categories) ? trame.categories : []).reduce((sum, category) =>
    sum + (Array.isArray(category?.sousCategories) ? category.sousCategories : []).reduce((n, sub) =>
      n + (Array.isArray(sub?.criteres) ? sub.criteres.length : 0), 0), 0);
}

// Un GET ponctuel, lancé pendant le choix de trame, peut être réutilisé
// une seule fois lors de la création, sans remplacer le cache officiel du local.
const PREPARE_WINDOW_MS = 45000;
const pendingPreparations = new Map();
function preparationKey({ remoteClientId, remoteLocalId, remoteTrameId, localTrameId } = {}) {
  if (![remoteClientId, remoteLocalId, remoteTrameId].every(validId) || !localTrameId) return null;
  return JSON.stringify([id(remoteClientId), id(remoteLocalId), id(remoteTrameId), String(localTrameId)]);
}

/** Anticiper la préparation sans créer de visite ni écrire dans le cache local.
 * Échec silencieux ici : le bouton Créer effectuera sa validation habituelle.
 */
export function prewarmIntranetSelectedTrame(args = {}) {
  const key = preparationKey(args);
  if (!key) return Promise.resolve(null);
  const current = pendingPreparations.get(key);
  if (current && Date.now() - current.startedAt < PREPARE_WINDOW_MS) return current.promise;
  if (current) pendingPreparations.delete(key);
  // Ne conserver que quelques choix de la modale en mémoire.
  while (pendingPreparations.size >= 4) pendingPreparations.delete(pendingPreparations.keys().next().value);
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = prepareIntranetSelectedTrameFresh(args).catch(error => {
    if (pendingPreparations.get(key) === entry) pendingPreparations.delete(key);
    throw error;
  });
  pendingPreparations.set(key, entry);
  return entry.promise;
}

/** Réutiliser seulement un GET validé datant de moins de 45 secondes.
 * Jamais de cache persistant : trame, site et local sont revalidés par le GET.
 */
export async function prepareIntranetSelectedTrame(args = {}) {
  const key = preparationKey(args);
  const cached = key && pendingPreparations.get(key);
  if (cached) {
    pendingPreparations.delete(key);
    if (Date.now() - cached.startedAt < PREPARE_WINDOW_MS) return cached.promise;
  }
  return prepareIntranetSelectedTrameFresh(args);
}

/**
 * Valide les identifiants client/local/trame et renvoie exactement la reference
 * demandee. Si la trame change, aucune copie locale de la derniere visite
 * n'est autorisee en cas de reseau indisponible ou de reponse ambigue.
 */
async function prepareIntranetSelectedTrameFresh({ remoteClientId, remoteLocalId, remoteTrameId, localTrameId } = {}) {
  const clientId = id(remoteClientId);
  const localId = id(remoteLocalId);
  const selectedId = id(remoteTrameId);
  if (![clientId, localId, selectedId].every(validId)) {
    throw preparationError('Client, local et identifiant de trame Intranet requis. Actualise le referentiel du client.', 'selected_trame_invalid_id');
  }

  const referential = await getCachedStructureReferential(clientId) || await syncStructureReferential(clientId);
  const possibilities = (Array.isArray(referential?.trames) ? referential.trames : [])
    .filter((trame) => id(trame?.id) === selectedId);
  if (possibilities.length !== 1 || mapRemoteTrameToLocal(possibilities[0]) !== localTrameId) {
    throw preparationError('La trame Intranet selectionnee est absente du referentiel ou incompatible avec la trame METRA. Actualise le referentiel.', 'selected_trame_not_in_referential');
  }

  const existing = await getCachedLocalReference(localId);
  if (!existing || id(existing?.local?.id) !== localId || !id(existing?.site?.id)) {
    throw preparationError('Reference du local Intranet manquante ou incoherente. Actualise le client avant de creer une visite.', 'selected_trame_local_missing');
  }
  if (id(existing?.trame?.id) === selectedId) {
    return { reference: existing, different: false, remoteTrameId: selectedId };
  }

  // Le GET filtre est volontairement non cache : api_local_links represente
  // le referentiel courant du local, et non la trame ponctuelle de cette visite.
  const payload = await syncClientPreparation(clientId, selectedId, { cacheResult: false });
  if (id(payload?.client?.id) && id(payload.client.id) !== clientId) {
    throw preparationError('La preparation Symfony ne correspond pas au client choisi.', 'selected_trame_wrong_client');
  }
  const matches = (Array.isArray(payload?.visites) ? payload.visites : [])
    .filter((entry) => id(entry?.local?.id) === localId);
  if (matches.length !== 1) {
    throw preparationError('La preparation Symfony ne contient pas un local unique correspondant a la selection.', 'selected_trame_wrong_local');
  }
  const selected = matches[0];
  if (id(selected?.site?.id) && id(selected.site.id) !== id(existing.site.id)) {
    throw preparationError('La preparation Symfony pointe vers un autre site.', 'selected_trame_wrong_site');
  }
  if (id(selected?.trame?.id) !== selectedId || !Array.isArray(selected?.trame?.categories) || !criterionCount(selected.trame)) {
    throw preparationError('La preparation Symfony ne contient pas la trame demandee et sa structure complete.', 'selected_trame_incomplete');
  }

  // L'API identifie le local via visites[].local.id. Certains contrats peuvent
  // omettre le site pour un GET filtre : reutiliser seulement son identite deja
  // verifiee, jamais une trame ni des controles issus du cache precedent.
  const normalized = normalizePreparationPayload({
    ...payload,
    visites: [{ ...selected, site: selected.site || existing.site }],
  });
  const reference = normalized.visites?.[0];
  if (!reference || id(reference?.local?.id) !== localId || id(reference?.trame?.id) !== selectedId) {
    throw preparationError('Le format de preparation Symfony est invalide pour le local choisi.', 'selected_trame_invalid_payload');
  }
  return { reference, different: true, remoteTrameId: selectedId };
}
