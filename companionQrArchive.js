import * as FileSystem from 'expo-file-system';
import { decodeOfflineClientQrFrame, mergeOfflineClientQrFrames } from './companionOfflineQr.js';

const ROOT = `${FileSystem.documentDirectory || ''}metra-companion/`;
const ARCHIVE = `${ROOT}qr-archive.json`;
let mutationQueue = Promise.resolve();

async function ensureRoot() {
  if (!FileSystem.documentDirectory) throw new Error('Stockage local indisponible');
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

async function readArchive() {
  await ensureRoot();
  const info = await FileSystem.getInfoAsync(ARCHIVE);
  if (!info.exists) return { tabletBatches: [], phoneBatches: [] };
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(ARCHIVE));
    return {
      tabletBatches: Array.isArray(parsed?.tabletBatches) ? parsed.tabletBatches : [],
      phoneBatches: Array.isArray(parsed?.phoneBatches) ? parsed.phoneBatches : [],
    };
  } catch {
    return { tabletBatches: [], phoneBatches: [] };
  }
}

async function writeArchive(data) {
  await ensureRoot();
  await FileSystem.writeAsStringAsync(ARCHIVE, JSON.stringify(data || { tabletBatches: [], phoneBatches: [] }));
}

function serialiseMutation(worker) {
  const run = mutationQueue.then(worker, worker);
  mutationQueue = run.catch(() => {});
  return run;
}

async function saveTabletQrBatch(batch) {
  if (!batch?.batchId) throw new Error('Lot QR invalide');
  return serialiseMutation(async () => {
    const archive = await readArchive();
    const next = [batch, ...(archive.tabletBatches || []).filter((item) => item.batchId !== batch.batchId)].slice(0, 40);
    await writeArchive({ ...archive, tabletBatches: next });
    return batch;
  });
}

async function listTabletQrBatches(clientId = null) {
  const archive = await readArchive();
  const items = archive.tabletBatches || [];
  return clientId ? items.filter((item) => String(item.clientId) === String(clientId)) : items;
}

async function getTabletQrBatch(batchId) {
  const archive = await readArchive();
  return (archive.tabletBatches || []).find((item) => item.batchId === batchId) || null;
}

async function savePhoneOfflineQrFrame(raw) {
  const frame = decodeOfflineClientQrFrame(raw);
  return serialiseMutation(async () => {
    const archive = await readArchive();
    const batchId = String(frame.b);
    const existing = (archive.phoneBatches || []).find((item) => item.batchId === batchId);
    const frames = { ...(existing?.frames || {}) };
    frames[String(frame.i)] = raw;
    const payloads = Object.values(frames);
    const snapshot = mergeOfflineClientQrFrames(payloads);
    const entry = {
      batchId,
      clientId: snapshot?.client?.id || '',
      clientName: snapshot?.client?.name || 'Client',
      totalFrames: Number(frame.n || 0),
      scannedFrames: snapshot?.offlineProgress?.scannedFrames || [],
      complete: Boolean(snapshot?.offlineProgress?.complete),
      frames,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const next = [entry, ...(archive.phoneBatches || []).filter((item) => item.batchId !== batchId)].slice(0, 40);
    await writeArchive({ ...archive, phoneBatches: next });
    return { entry, snapshot, duplicate: Boolean(existing?.frames?.[String(frame.i)]) };
  });
}

async function listPhoneQrBatches() {
  const archive = await readArchive();
  return (archive.phoneBatches || []).map((entry) => ({
    ...entry,
    frames: undefined,
    scanned: Array.isArray(entry.scannedFrames) ? entry.scannedFrames.length : 0,
  }));
}

async function getPhoneQrBatch(batchId) {
  const archive = await readArchive();
  const entry = (archive.phoneBatches || []).find((item) => item.batchId === batchId);
  if (!entry) return null;
  const snapshot = mergeOfflineClientQrFrames(Object.values(entry.frames || {}));
  return { entry, snapshot };
}

export {
  getPhoneQrBatch,
  getTabletQrBatch,
  listPhoneQrBatches,
  listTabletQrBatches,
  savePhoneOfflineQrFrame,
  saveTabletQrBatch,
};
