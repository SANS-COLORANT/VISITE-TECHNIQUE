import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';

const PENDING_PREFIX = 'photo_pending::';
const recoveryByVisit = new Map();

function pendingId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function photoId() {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export async function journaliserPhotoEnAttente({ visiteId, entiteKey = null, uri, labelDb = null }) {
  if (!visiteId || !uri) return null;
  const db = await openAppDatabase();
  const key = `${PENDING_PREFIX}${pendingId()}`;
  const value = JSON.stringify({
    visiteId: String(visiteId),
    entiteKey: entiteKey || null,
    uri: String(uri),
    labelDb: labelDb || null,
    createdAt: new Date().toISOString()
  });
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value]
  );
  return key;
}

export async function confirmerPhotoJournalisee(key) {
  if (!key) return;
  const db = await openAppDatabase();
  await db.runAsync('DELETE FROM _meta WHERE key=?', [key]);
}

async function recupererInterne(visiteId) {
  const db = await openAppDatabase();
  const rows = await db.getAllAsync(`SELECT key,value FROM _meta WHERE key LIKE ? ORDER BY key`, [
    `${PENDING_PREFIX}%`
  ]);
  let recovered = 0;
  for (const row of rows || []) {
    let payload = null;
    try {
      payload = JSON.parse(row.value || '{}');
    } catch {}
    if (!payload || String(payload.visiteId || '') !== String(visiteId || '')) continue;

    const uri = String(payload.uri || '');
    let exists = false;
    try {
      exists = Boolean((await FileSystem.getInfoAsync(uri))?.exists);
    } catch {}

    if (!exists) {
      await db.runAsync('DELETE FROM _meta WHERE key=?', [row.key]);
      continue;
    }

    const already = await db.getFirstAsync('SELECT id FROM photos WHERE visite_id=? AND uri=? LIMIT 1', [
      String(visiteId),
      uri
    ]);
    if (!already?.id) {
      await db.runAsync(`INSERT INTO photos(id,visite_id,entite_key,uri,label) VALUES(?,?,?,?,?)`, [
        photoId(),
        String(visiteId),
        payload.entiteKey || null,
        uri,
        payload.labelDb || null
      ]);
      recovered += 1;
    }
    await db.runAsync('DELETE FROM _meta WHERE key=?', [row.key]);
  }
  return recovered;
}

export function recupererPhotosEnAttente(visiteId) {
  const key = String(visiteId || '');
  if (!key) return Promise.resolve(0);
  const current = recoveryByVisit.get(key);
  if (current) return current;
  const promise = recupererInterne(key).finally(() => recoveryByVisit.delete(key));
  recoveryByVisit.set(key, promise);
  return promise;
}
