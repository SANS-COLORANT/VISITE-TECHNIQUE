import * as FileSystem from 'expo-file-system';

const ROOT = `${FileSystem.documentDirectory || ''}metra-companion/outbox/`;
const MANIFEST = `${ROOT}queue.json`;

function id() {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureRoot() {
  if (!FileSystem.documentDirectory) throw new Error('Stockage local indisponible');
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

async function readQueue() {
  await ensureRoot();
  const info = await FileSystem.getInfoAsync(MANIFEST);
  if (!info.exists) return [];
  try {
    const raw = await FileSystem.readAsStringAsync(MANIFEST);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items) {
  await ensureRoot();
  await FileSystem.writeAsStringAsync(MANIFEST, JSON.stringify(items || []));
}

async function enqueueCompanionPhoto({ uri, meta }) {
  await ensureRoot();
  const transferId = id();
  const extension = String(uri || '').toLowerCase().includes('.png') ? '.png' : '.jpg';
  const destination = `${ROOT}${transferId}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  const items = await readQueue();
  const item = { transferId, uri: destination, meta: { ...(meta || {}), transferId }, createdAt: new Date().toISOString() };
  items.push(item);
  await writeQueue(items);
  return item;
}

async function removeCompanionOutboxItem(transferId) {
  const items = await readQueue();
  const item = items.find((x) => x.transferId === transferId);
  const next = items.filter((x) => x.transferId !== transferId);
  await writeQueue(next);
  if (item?.uri) FileSystem.deleteAsync(item.uri, { idempotent: true }).catch(() => {});
  return next;
}

export { enqueueCompanionPhoto, readQueue as listCompanionOutbox, removeCompanionOutboxItem };
