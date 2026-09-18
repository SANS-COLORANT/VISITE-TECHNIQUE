import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { MetraOcr, MetraSpeech } = NativeModules;

export function ocrLocalDisponible() {
  return Platform.OS === 'android' && Boolean(MetraOcr?.recognize);
}

export async function reconnaitreTexteImageLocale(uri) {
  if (!uri) throw new Error('Image manquante.');
  if (!ocrLocalDisponible()) {
    return { text: '', blocks: [], durationMs: 0, unavailable: true };
  }
  return MetraOcr.recognize(uri);
}

export async function dicteeLocaleDisponible() {
  if (Platform.OS !== 'android' || !MetraSpeech?.isAvailable) return false;
  try { return Boolean(await MetraSpeech.isAvailable()); } catch { return false; }
}

export async function demanderPermissionMicro() {
  if (Platform.OS !== 'android') return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Dictée METRA',
    message: 'Autoriser METRA à utiliser le microphone uniquement pendant la dictée terrain.',
    buttonPositive: 'Autoriser',
    buttonNegative: 'Refuser',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function demarrerDicteeLocale(locale = 'fr-FR') {
  if (!await dicteeLocaleDisponible()) throw new Error("La reconnaissance vocale Android n'est pas disponible.");
  if (!await demanderPermissionMicro()) throw new Error("L'autorisation microphone est nécessaire pour la dictée.");
  const result = await MetraSpeech.start(locale);
  return {
    text: String(result?.text || '').trim(),
    alternatives: Array.isArray(result?.alternatives) ? result.alternatives : [],
  };
}

export async function annulerDicteeLocale() {
  if (MetraSpeech?.cancel) {
    try { await MetraSpeech.cancel(); } catch {}
  }
}
