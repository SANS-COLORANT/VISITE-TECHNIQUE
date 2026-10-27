/** Non-destructive per-photo publishing choice, local SQLite only.
 * No change to the historical photos schema or existing file paths.
 * A free photo (entite_key NULL) is private by default, even for older visits.
 */
import { getDb } from './db.js';

let initPromise = null;
async function ready(db) {
  if (!initPromise) initPromise = db.runAsync(`CREATE TABLE IF NOT EXISTS photo_publication (
    photo_id TEXT PRIMARY KEY,
    included INTEGER NOT NULL DEFAULT 0 CHECK(included IN (0,1))
  )`).catch((error) => { initPromise = null; throw error; });
  await initPromise;
}
export function isFreePhoto(photo) {
  return photo?.entite_key == null || String(photo.entite_key).trim() === '';
}
export function canPublishPhoto(photo) {
  if (!photo) return false;
  if (photo.included != null) return Number(photo.included) === 1;
  return !isFreePhoto(photo);
}
export async function getPhotoPublication(photoId) {
  const db = await getDb();
  await ready(db);
  const photo = await db.getFirstAsync('SELECT id,entite_key FROM photos WHERE id=?', [String(photoId)]);
  if (!photo) throw new Error('Photo introuvable');
  const record = await db.getFirstAsync('SELECT included FROM photo_publication WHERE photo_id=?', [String(photoId)]);
  return { ...photo, included: record ? Number(record.included) : (isFreePhoto(photo) ? 0 : 1) };
}
export async function setPhotoPublication(photoId, included) {
  const db = await getDb();
  await ready(db);
  const photo = await db.getFirstAsync('SELECT id,entite_key FROM photos WHERE id=?', [String(photoId)]);
  if (!photo) throw new Error('Photo introuvable');
  const flag = included ? 1 : 0;
  // Never delete uploaded files; for unsent jobs prevent any further upload.
  await db.runAsync(`INSERT INTO photo_publication(photo_id,included) VALUES(?,?)
    ON CONFLICT(photo_id) DO UPDATE SET included=excluded.included`, [String(photoId), flag]);
  if (!flag) await db.runAsync(`DELETE FROM api_visit_photo_outbox
    WHERE photo_id=? AND status IN ('pending','retry','auth_error','validation_error','rejected')`, [String(photoId)]);
  return { ...photo, included: flag };
}
export async function listPhotoPublication(visiteId) {
  const db = await getDb();
  await ready(db);
  const rows = await db.getAllAsync(`SELECT p.id,p.entite_key,pp.included
    FROM photos p LEFT JOIN photo_publication pp ON pp.photo_id=p.id WHERE p.visite_id=?`, [String(visiteId)]);
  return new Map(rows.map((photo) => [String(photo.id), canPublishPhoto(photo)]));
}
export async function renameVisitPhoto(photoId, label) {
  const cleaned = String(label || '').replace(/[\r\n|]/g, ' ').trim().slice(0, 240);
  if (!cleaned) throw new Error('Le libellé de la photo ne peut pas être vide.');
  const db = await getDb();
  const photo = await db.getFirstAsync('SELECT id,visite_id,label FROM photos WHERE id=?', [String(photoId)]);
  if (!photo) throw new Error('Photo introuvable');
  // The part after || is the immutable physical filename; never rename files.
  const suffix = String(photo.label || '').split('||').slice(1).join('||');
  const newLabel = suffix ? cleaned + '||' + suffix : cleaned;
  await db.runAsync('UPDATE photos SET label=? WHERE id=?', [newLabel, String(photoId)]);
  await db.runAsync(`UPDATE api_visit_photo_outbox SET description=?
    WHERE photo_id=? AND status IN ('pending','retry','auth_error','validation_error','rejected')`, [cleaned, String(photoId)]);
  return { ...photo, label: newLabel };
}
