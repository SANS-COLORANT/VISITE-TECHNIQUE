import * as SecureStore from 'expo-secure-store';
import { NativeModules } from 'react-native';
import { cacheAuthorizedClients, cachePreparation, getApiSyncState, markApiError, updateApiSyncState } from './symfonyApiCacheDb.js';

export const METRA_API_BASE_URL = 'https://intranet-energieetservice.com';
const ACCESS_KEY = 'metra.api.access_token';
const ACCESS_EXP_KEY = 'metra.api.access_expires_at';
const REFRESH_KEY = 'metra.api.refresh_token';
const REFRESH_EXP_KEY = 'metra.api.refresh_expires_at';
const TABLET_KEY = 'metra.api.tablette_id';
const NativeDpop = NativeModules.MetraDpop;
let accessMemory = null;
let refreshPromise = null;

function ensureNativeDpop() {
  if (!NativeDpop?.createProof) throw new Error('Le module de sécurité Android METRA n’est pas disponible dans ce build. Installe un APK natif METRA récent.');
  return NativeDpop;
}
function endpoint(path) { return `${METRA_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`; }
function urlEncoded(data) { return Object.entries(data).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v ?? ''))}`).join('&'); }
async function parseResponse(response) {
  const text = await response.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(body?.error_description || body?.message || body?.error || `Erreur API HTTP ${response.status}`);
    error.status = response.status; error.code = body?.error || body?.code || null; error.retryAfter = response.headers?.get?.('Retry-After') || null; throw error;
  }
  return body;
}
async function storeTokens(tokens) {
  const now = Date.now();
  accessMemory = { token: tokens.access_token, expiresAt: now + Math.max(0, Number(tokens.expires_in || 0) * 1000 - 10000) };
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, String(tokens.access_token || '')),
    SecureStore.setItemAsync(ACCESS_EXP_KEY, String(accessMemory.expiresAt)),
    SecureStore.setItemAsync(REFRESH_KEY, String(tokens.refresh_token || '')),
    SecureStore.setItemAsync(REFRESH_EXP_KEY, String(now + Number(tokens.refresh_expires_in || 0) * 1000)),
    SecureStore.setItemAsync(TABLET_KEY, String(tokens.tablette_id ?? '')),
  ]);
  await updateApiSyncState({ tablette_id: String(tokens.tablette_id ?? ''), last_success_at: new Date().toISOString(), last_error: null });
}
async function getStoredAccess() {
  if (accessMemory?.token && accessMemory.expiresAt > Date.now()) return accessMemory.token;
  const [token, exp] = await Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(ACCESS_EXP_KEY)]);
  if (token && Number(exp || 0) > Date.now()) { accessMemory = { token, expiresAt: Number(exp) }; return token; }
  return null;
}
export async function getActivationStatus() {
  const [refresh, refreshExp, tablet, state] = await Promise.all([SecureStore.getItemAsync(REFRESH_KEY), SecureStore.getItemAsync(REFRESH_EXP_KEY), SecureStore.getItemAsync(TABLET_KEY), getApiSyncState()]);
  return { activated: Boolean(refresh && Number(refreshExp || 0) > Date.now()), tabletteId: tablet || state?.tablette_id || null, lastSyncAt: state?.last_success_at || null, lastError: state?.last_error || null };
}
export async function deactivateTablet() {
  accessMemory = null;
  await Promise.all([ACCESS_KEY, ACCESS_EXP_KEY, REFRESH_KEY, REFRESH_EXP_KEY, TABLET_KEY].map((key) => SecureStore.deleteItemAsync(key)));
  await updateApiSyncState({ tablette_id: null, last_error: null });
}
async function createProof(method, url, accessToken = null) {
  const target = new URL(url); target.search = ''; target.hash = '';
  return ensureNativeDpop().createProof(String(method).toUpperCase(), target.toString(), accessToken || null);
}
async function rawRequest(method, url, { accessToken = null, body = null, headers = {} } = {}) {
  const proof = await createProof(method, url, accessToken);
  const response = await fetch(url, { method, redirect: 'manual', headers: { Accept: 'application/json', DPoP: proof, ...(accessToken ? { Authorization: `DPoP ${accessToken}` } : {}), ...headers }, body });
  if (response.status >= 300 && response.status < 400) { const e = new Error('Redirection HTTP refusée pour protéger la preuve DPoP.'); e.status = response.status; throw e; }
  return parseResponse(response);
}
export async function activateTablet(code) {
  const activationCode = String(code || '').trim();
  if (activationCode.length !== 48) throw new Error('Le code d’activation doit contenir exactement 48 caractères.');
  const url = endpoint('/api/tablettes/activation');
  const tokens = await rawRequest('POST', url, { body: urlEncoded({ code: activationCode }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  await storeTokens(tokens); return tokens;
}
async function refreshTokens() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refresh) throw new Error('Tablette non activée ou session expirée.');
    const url = endpoint('/api/tablettes/jeton');
    const tokens = await rawRequest('POST', url, { body: urlEncoded({ grant_type: 'refresh_token', refresh_token: refresh }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await storeTokens(tokens); return tokens.access_token;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function validAccessToken() { return (await getStoredAccess()) || refreshTokens(); }
export async function protectedRequest(method, path) {
  const url = endpoint(path); let token = await validAccessToken();
  try { return await rawRequest(method, url, { accessToken: token }); }
  catch (error) {
    if (error.status !== 401 || error.code === 'invalid_dpop_proof') throw error;
    token = await refreshTokens();
    return rawRequest(method, url, { accessToken: token });
  }
}
export async function syncAuthorizedClients() {
  try { const payload = await protectedRequest('GET', '/api/clients'); await cacheAuthorizedClients(payload?.clients || []); return payload?.clients || []; }
  catch (error) { await markApiError(error); throw error; }
}
export async function syncClientPreparation(remoteClientId, trameId = null) {
  const id = encodeURIComponent(String(remoteClientId)); const suffix = trameId != null ? `?trame=${encodeURIComponent(String(trameId))}` : '';
  try { const payload = await protectedRequest('GET', `/api/clients/${id}/preparation-visites${suffix}`); await cachePreparation(remoteClientId, payload); return payload; }
  catch (error) { await markApiError(error); throw error; }
}
