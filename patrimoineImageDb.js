import { getDb } from './db.js';

const listeners = new Set();

function notifier(type, id, uri) {
  for (const listener of [...listeners]) {
    try {
      listener({ type, id, uri: uri || null });
    } catch {}
  }
}

export function onPatrimoineImageChanged(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getClientPatrimoine(clientId) {
  if (!clientId) return null;
  return (await getDb()).getFirstAsync(`SELECT id,nom,code_exploitant,adresse,image_uri FROM clients WHERE id=?`, [
    clientId
  ]);
}

export async function getSitePatrimoine(siteId) {
  if (!siteId) return null;
  return (await getDb()).getFirstAsync(`SELECT id,client_id,nom_site,adresse,statut,image_uri FROM sites WHERE id=?`, [
    siteId
  ]);
}

export async function enregistrerImageClient(clientId, uri) {
  if (!clientId) throw new Error('Client introuvable.');
  await (await getDb()).runAsync(`UPDATE clients SET image_uri=? WHERE id=?`, [uri || null, clientId]);
  notifier('client', clientId, uri);
}

export async function enregistrerImageSite(siteId, uri) {
  if (!siteId) throw new Error('Site introuvable.');
  await (await getDb()).runAsync(`UPDATE sites SET image_uri=? WHERE id=?`, [uri || null, siteId]);
  notifier('site', siteId, uri);
}

export async function lireImagePatrimoine(type, id) {
  if (type === 'client') return (await getClientPatrimoine(id))?.image_uri || null;
  if (type === 'site') return (await getSitePatrimoine(id))?.image_uri || null;
  throw new Error('Type de patrimoine invalide.');
}

export async function enregistrerImagePatrimoine(type, id, uri) {
  if (type === 'client') return enregistrerImageClient(id, uri);
  if (type === 'site') return enregistrerImageSite(id, uri);
  throw new Error('Type de patrimoine invalide.');
}
