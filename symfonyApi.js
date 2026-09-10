import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';
import { cacheAuthorizedClients, cachePreparation, getApiSyncState, markApiError, updateApiSyncState } from './symfonyApiCacheDb.js';

export const METRA_API_BASE_URL = 'https://intranet-energieetservice.com';

// Les access tokens sont volontairement éphémères et restent uniquement en mémoire.
// Ces deux clés sont conservées seulement pour nettoyer les anciennes versions de METRA.
const LEGACY_ACCESS_KEY = 'metra.api.access_token';
const LEGACY_ACCESS_EXP_KEY = 'metra.api.access_expires_at';
const REFRESH_KEY = 'metra.api.refresh_token';
const REFRESH_EXP_KEY = 'metra.api.refresh_expires_at';
const TABLET_KEY = 'metra.api.tablette_id';

const NativeDpop = NativeModules.MetraDpop;
let accessMemory = null;
let refreshPromise = null;

function ensureNativeDpop() {
  if (!NativeDpop?.createProof) {
    throw new Error('Le module de sécurité Android METRA n’est pas disponible dans ce build. Installe un APK natif METRA récent.');
  }
  return NativeDpop;
}

async function hasNativeDpopKey() {
  const native = ensureNativeDpop();
  if (!native.hasKey) return true;
  return Boolean(await native.hasKey());
}

function endpoint(path) {
  return `${METRA_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function urlEncoded(data) {
  return Object.entries(data).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ''))}`).join('&');
}

function localAuthError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; }
  catch { body = { message: text }; }

  if (!response.ok) {
    const error = new Error(body?.error_description || body?.message || body?.error || `Erreur API HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.error || body?.code || null;
    error.retryAfter = response.headers?.get?.('Retry-After') || null;
    error.body = body;
    error.violations = Array.isArray(body?.violations) ? body.violations : [];
    throw error;
  }
  return body;
}

function protectedDownloadUrl(path) {
  const value = String(path || '').trim();
  if (!/^\/api\/clients\/[^/?#]+\/dernieres-visites\/photos\/[^/?#]+$/.test(value)) {
    throw new Error('Chemin de téléchargement de photo refusé.');
  }
  return endpoint(value);
}

function blobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier téléchargé impossible.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separator = dataUrl.indexOf(',');
      if (separator < 0) reject(new Error('Encodage de la photo téléchargée invalide.'));
      else resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function downloadAttempt(path, destinationUri, accessToken) {
  const url = protectedDownloadUrl(path);
  const proof = await createProof('GET', url, accessToken);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'image/*',
      DPoP: proof,
      Authorization: `DPoP ${accessToken}`,
    },
  });
  if (response.status >= 300 && response.status < 400) {
    const error = new Error('Redirection HTTP refusée pour protéger la preuve DPoP.');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    let body = null;
    try { const text = await response.text(); body = text ? JSON.parse(text) : null; } catch {}
    const error = new Error(body?.error_description || body?.message || body?.error || `Erreur API HTTP ${response.status}`);
    error.status = response.status;
    error.code = body?.error || body?.code || null;
    error.retryAfter = response.headers?.get?.('Retry-After') || null;
    error.body = body;
    error.violations = Array.isArray(body?.violations) ? body.violations : [];
    throw error;
  }

  const blob = await response.blob();
  try {
    const base64 = await blobAsBase64(blob);
    await FileSystem.writeAsStringAsync(destinationUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  } finally { blob.close?.(); }
  const headers = {};
  response.headers?.forEach?.((value, key) => { headers[key] = value; });
  return {
    uri: destinationUri,
    status: response.status,
    headers,
    mimeType: response.headers?.get?.('Content-Type') || blob.type || null,
  };
}

async function clearLegacyAccessStorage() {
  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY),
    SecureStore.deleteItemAsync(LEGACY_ACCESS_EXP_KEY),
  ]);
}

async function clearSecureSession() {
  accessMemory = null;
  await Promise.all([
    LEGACY_ACCESS_KEY,
    LEGACY_ACCESS_EXP_KEY,
    REFRESH_KEY,
    REFRESH_EXP_KEY,
    TABLET_KEY,
  ].map((key) => SecureStore.deleteItemAsync(key)));
  await updateApiSyncState({ tablette_id: null, last_error: null });
}

async function storeTokens(tokens) {
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error('Réponse d’authentification incomplète : jetons manquants.');
  }

  const now = Date.now();
  accessMemory = {
    token: String(tokens.access_token),
    expiresAt: now + Math.max(0, Number(tokens.expires_in || 0) * 1000 - 10000),
  };

  await Promise.all([
    SecureStore.setItemAsync(REFRESH_KEY, String(tokens.refresh_token)),
    SecureStore.setItemAsync(REFRESH_EXP_KEY, String(now + Number(tokens.refresh_expires_in || 0) * 1000)),
    SecureStore.setItemAsync(TABLET_KEY, String(tokens.tablette_id ?? '')),
    clearLegacyAccessStorage(),
  ]);

  await updateApiSyncState({
    tablette_id: String(tokens.tablette_id ?? ''),
    last_success_at: new Date().toISOString(),
    last_error: null,
  });
}

async function getStoredAccess() {
  if (accessMemory?.token && accessMemory.expiresAt > Date.now()) return accessMemory.token;
  accessMemory = null;
  return null;
}

export async function getActivationStatus() {
  const [refresh, refreshExp, tablet, state, keyPresent] = await Promise.all([
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(REFRESH_EXP_KEY),
    SecureStore.getItemAsync(TABLET_KEY),
    getApiSyncState(),
    hasNativeDpopKey().catch(() => false),
  ]);

  const refreshExpiry = Number(refreshExp || 0);
  // Une ancienne version peut avoir un refresh token sans date locale exploitable.
  // Dans ce cas on laisse le serveur décider lors du prochain renouvellement.
  const refreshUsable = Boolean(refresh && (!refreshExp || !refreshExpiry || refreshExpiry > Date.now()));
  const activated = Boolean(refreshUsable && keyPresent);

  let needsActivationReason = null;
  if (!refresh) needsActivationReason = 'missing_refresh_token';
  else if (refreshExp && refreshExpiry > 0 && refreshExpiry <= Date.now()) needsActivationReason = 'refresh_token_expired';
  else if (!keyPresent) needsActivationReason = 'android_keystore_key_missing';

  return {
    activated,
    keyPresent,
    hasRefreshToken: Boolean(refresh),
    needsActivationReason,
    tabletteId: tablet || state?.tablette_id || null,
    lastSyncAt: state?.last_success_at || null,
    lastError: state?.last_error || null,
  };
}

export async function deactivateTablet() {
  await clearSecureSession();
}

async function createProof(method, url, accessToken = null) {
  const target = new URL(url);
  target.search = '';
  target.hash = '';
  return ensureNativeDpop().createProof(String(method).toUpperCase(), target.toString(), accessToken || null);
}

async function rawRequest(method, url, { accessToken = null, body = null, headers = {} } = {}) {
  const proof = await createProof(method, url, accessToken);
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      DPoP: proof,
      ...(accessToken ? { Authorization: `DPoP ${accessToken}` } : {}),
      ...headers,
    },
    body,
  });

  if (response.status >= 300 && response.status < 400) {
    const error = new Error('Redirection HTTP refusée pour protéger la preuve DPoP.');
    error.status = response.status;
    throw error;
  }
  return parseResponse(response);
}

export async function activateTablet(code) {
  const activationCode = String(code || '').trim();
  if (activationCode.length !== 48) throw new Error('Le code d’activation doit contenir exactement 48 caractères.');

  const url = endpoint('/api/tablettes/activation');
  const tokens = await rawRequest('POST', url, {
    body: urlEncoded({ code: activationCode }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  await storeTokens(tokens);
  return tokens;
}

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refresh) {
      throw localAuthError('Tablette non activée ou session expirée.', 'reactivation_required');
    }

    if (!(await hasNativeDpopKey())) {
      throw localAuthError(
        'L’identité sécurisée Android de cette tablette n’est plus disponible. Une nouvelle activation est nécessaire.',
        'dpop_key_missing'
      );
    }

    const url = endpoint('/api/tablettes/jeton');
    try {
      const tokens = await rawRequest('POST', url, {
        body: urlEncoded({ grant_type: 'refresh_token', refresh_token: refresh }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      await storeTokens(tokens);
      return tokens.access_token;
    } catch (error) {
      // Un refresh token refusé définitivement ne doit pas provoquer une boucle.
      // Une erreur réseau, 429 ou 503 conserve en revanche l’activation locale et le cache offline.
      if (error?.code === 'invalid_grant') await clearSecureSession();
      throw error;
    }
  })().finally(() => { refreshPromise = null; });

  return refreshPromise;
}

async function validAccessToken() {
  return (await getStoredAccess()) || refreshTokens();
}

export async function initializeApiSession() {
  const status = await getActivationStatus();
  if (!status.activated) return status;
  if (await getStoredAccess()) return status;

  try {
    // Après un redémarrage ou une mise à jour, l'access token n'est pas requis :
    // la session est restaurée avec le refresh token et la même clé Android Keystore.
    await refreshTokens();
    return { ...(await getActivationStatus()), sessionRestored: true };
  } catch (error) {
    if (error?.code === 'invalid_grant' || error?.code === 'reactivation_required' || error?.code === 'dpop_key_missing') {
      return { ...(await getActivationStatus()), sessionRestoreError: error.code };
    }
    // Hors connexion : ne jamais transformer une tablette activée en tablette à réactiver.
    return { ...status, sessionRestoreDeferred: true };
  }
}

export async function protectedRequest(method, path, { body = null, headers = {} } = {}) {
  const url = endpoint(path);
  let token = await validAccessToken();
  let refreshed = false;
  let proofRetried = false;

  // Every rawRequest creates a fresh DPoP proof. The request body object is
  // intentionally NOT rebuilt here: an idempotent visit upload retries the
  // exact same serialized JSON bytes with the same envoiId.
  while (true) {
    try {
      return await rawRequest(method, url, { accessToken: token, body, headers });
    } catch (error) {
      if (error.status !== 401) throw error;
      if (error.code === 'invalid_dpop_proof' && !proofRetried) {
        proofRetried = true;
        continue;
      }
      if (!refreshed) {
        token = await refreshTokens();
        refreshed = true;
        proofRetried = false;
        continue;
      }
      throw error;
    }
  }
}

export async function createIntranetUploadId() {
  const native = ensureNativeDpop();
  if (!native.randomUuid) throw new Error('Ce build METRA ne peut pas créer un identifiant sécurisé d’envoi.');
  const value = String(await native.randomUuid());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Identifiant d’envoi UUID v4 invalide.');
  }
  return value;
}

export async function sendClientVisits(remoteClientId, serializedPayload) {
  const id = encodeURIComponent(String(remoteClientId));
  const body = typeof serializedPayload === 'string' ? serializedPayload : JSON.stringify(serializedPayload);
  try {
    return await protectedRequest('POST', `/api/clients/${id}/visites`, {
      body,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await markApiError(error).catch(() => {});
    throw error;
  }
}

export async function downloadProtectedPhoto(path, destinationUri) {
  let token = await validAccessToken();
  try {
    return await downloadAttempt(path, destinationUri, token);
  } catch (error) {
    if (error.status !== 401) throw error;
    if (error.code === 'invalid_dpop_proof') {
      try {
        // Une nouvelle tentative produit obligatoirement un nouveau htu/jti/signature.
        return await downloadAttempt(path, destinationUri, token);
      } catch (retryError) {
        if (retryError.status !== 401) throw retryError;
      }
    }
    token = await refreshTokens();
    return downloadAttempt(path, destinationUri, token);
  }
}

export async function syncAuthorizedClients() {
  try {
    const payload = await protectedRequest('GET', '/api/clients');
    await cacheAuthorizedClients(payload?.clients || []);
    return payload?.clients || [];
  } catch (error) {
    await markApiError(error);
    throw error;
  }
}

export async function syncClientPreparation(remoteClientId, trameId = null) {
  const id = encodeURIComponent(String(remoteClientId));
  const suffix = trameId != null ? `?trame=${encodeURIComponent(String(trameId))}` : '';
  try {
    const payload = await protectedRequest('GET', `/api/clients/${id}/preparation-visites${suffix}`);
    await cachePreparation(remoteClientId, payload);
    return payload;
  } catch (error) {
    await markApiError(error);
    throw error;
  }
}

export async function fetchClientLatestVisitPhotosManifest(remoteClientId) {
  const id = encodeURIComponent(String(remoteClientId));
  try {
    return await protectedRequest('GET', `/api/clients/${id}/dernieres-visites/photos`);
  } catch (error) {
    await markApiError(error);
    throw error;
  }
}
