import { photoFileKey } from './latestVisitPhotoModel.js';
/** Process-wide queue: survives screen/modal navigation, not Android process death.
 * Completed files are durable. Restarting METRA requires an explicit new request
 * and reuses these files; we never silently download a whole client on startup.
 */
let tasks = [];
let active = null;
let revision = 0;
const listeners = new Set();
let snapshot = { revision: 0, tasks: [], event: null };

export function getPhotoDownloadState() { return snapshot; }
export function subscribePhotoDownloads(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish(event = null) {
  snapshot = { revision: ++revision, event, tasks: tasks.map((task) => ({
    id: task.id, clientId: task.clientId, label: task.label, status: task.status,
    progress: task.progress, error: task.error || null,
  })) };
  for (const listener of listeners) { try { listener(snapshot); } catch {} }
}

async function runNext() {
  if (active) return;
  const task = tasks.find((t) => t.status === 'queued');
  if (!task) return;
  active = task;
  task.status = 'running';
  publish();
  try {
    const { downloadClientLatestVisitPhotos } = require('./latestVisitPhotosStorage.js');
    const result = await downloadClientLatestVisitPhotos(task.clientId, task.manifest, (progress) => {
      task.progress = progress;
      publish(progress.currentPhoto ? { clientId: task.clientId, photo: { ...progress.currentPhoto } } : null);
    }, task.control);
    task.manifest = result.manifest || task.manifest;
    task.status = result.paused ? 'paused' : result.failed ? 'partial' : 'done';
    task.error = result.failed ? `${result.failed} photo(s) non récupérée(s). Relance uniquement les fichiers manquants.` : null;
    task.resolve({ ...result, taskId: task.id });
  } catch (error) {
    task.status = 'error';
    task.error = String(error?.message || error);
    task.resolve({ taskId: task.id, failed: 1, error: task.error });
  } finally {
    active = null;
    publish();
    void runNext();
  }
}

export function startPhotoDownload({ clientId, manifest, label = 'Photos de référence' }) {
  if (!clientId || !manifest || String(manifest.client?.id) !== String(clientId)) throw new Error('Client des photos incohérent.');
  const key = JSON.stringify([String(clientId), manifest.sites.map((s) => [String(s.site?.id), s.locaux.map((l) =>
    [String(l.local?.id), String(l.derniereVisite?.id), l.photos.map((p) => photoFileKey({ ...p, site: s.site, local: l.local, derniereVisite: l.derniereVisite }))])])]);
  const existing = tasks.find((t) => t.key === key && ['queued', 'running', 'pausing'].includes(t.status));
  if (existing) return { id: existing.id, completion: existing.completion };
  const task = { id: `photo-${Date.now()}-${++revision}`, clientId: String(clientId), manifest, label,
    key, control: { paused: false }, status: 'queued', progress: null };
  task.completion = new Promise((resolve) => { task.resolve = resolve; });
  // Keep unresolved work, but bound completed in-memory history on long rounds.
  tasks = tasks.filter((t) => t.status !== 'done');
  tasks.push(task);
  publish();
  void runNext();
  return { id: task.id, completion: task.completion };
}

export function pausePhotoDownload(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !['queued', 'running'].includes(task.status)) return;
  task.control.paused = true;
  if (task.status === 'queued') {
    task.status = 'paused'; task.resolve({ paused: true, taskId });
  } else task.status = 'pausing';
  publish();
}

export function resumePhotoDownload(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !['paused', 'partial', 'error'].includes(task.status)) return null;
  const request = { clientId: task.clientId, manifest: task.manifest, label: task.label };
  tasks = tasks.filter((t) => t.id !== taskId);
  return startPhotoDownload(request);
}

export function dismissPhotoDownload(taskId) {
  tasks = tasks.filter((t) => t.id !== taskId || ['queued', 'running', 'pausing'].includes(t.status));
  publish();
}
