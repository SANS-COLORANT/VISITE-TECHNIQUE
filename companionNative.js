import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const native = NativeModules.MetraCompanion || null;
const emitter = native ? new NativeEventEmitter(native) : null;

function assertAvailable() {
  if (Platform.OS !== 'android' || !native) {
    throw new Error('Le mode Compagnon local est disponible uniquement dans le build Android METRA intégrant MetraCompanion.');
  }
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

async function startCompanionHost(context = {}) {
  assertAvailable();
  const result = await native.startHost(JSON.stringify(context || {}));
  return {
    host: String(result?.host || ''),
    port: Number(result?.port || 0),
    sessionId: String(result?.sessionId || ''),
    token: String(result?.token || ''),
  };
}

async function stopCompanion() {
  if (!native) return;
  await native.stop();
}

async function disconnectCompanion() {
  if (!native) return;
  await native.disconnect();
}

async function connectCompanion({ host, port, sessionId, token }) {
  assertAvailable();
  return native.connect(String(host || ''), Number(port || 0), String(sessionId || ''), String(token || ''));
}

async function sendCompanionMessage(message) {
  assertAvailable();
  return native.sendMessage(JSON.stringify(message || {}));
}

async function sendCompanionFile(meta, uri) {
  assertAvailable();
  return native.sendFile(JSON.stringify(meta || {}), String(uri || ''));
}

async function generateCompanionQr(payload, size = 720) {
  assertAvailable();
  return native.generateQr(typeof payload === 'string' ? payload : JSON.stringify(payload || {}), Number(size || 720));
}

async function decodeCompanionQr(uri) {
  assertAvailable();
  return native.decodeQr(String(uri || ''));
}

function subscribeCompanion(listener) {
  if (!emitter || typeof listener !== 'function') return () => {};
  const sub = emitter.addListener('MetraCompanionEvent', (raw) => {
    const event = {
      ...raw,
      message: parseJson(raw?.messageJson, null),
      meta: parseJson(raw?.metaJson, null),
    };
    listener(event);
  });
  return () => sub.remove();
}

function isCompanionNativeAvailable() {
  return Platform.OS === 'android' && !!native;
}

export {
  connectCompanion,
  decodeCompanionQr,
  disconnectCompanion,
  generateCompanionQr,
  isCompanionNativeAvailable,
  sendCompanionFile,
  sendCompanionMessage,
  startCompanionHost,
  stopCompanion,
  subscribeCompanion,
};
