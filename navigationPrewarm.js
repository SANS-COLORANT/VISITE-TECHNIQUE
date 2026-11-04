import { BoundedLruMap } from './boundedCache.js';
import { getDb, listerSitesClient, listerVisitesLocal, listerVisitesSite } from './db.js';
import { listerAppartenancesClient } from './siteOrganizationDb.js';
import { materializeCachedLocalForSite } from './apiLatestVisitImportDb.js';
import { getSiteLocalisation } from './siteGeoDb.js';

const clientSites = new BoundedLruMap(3);
const siteLocals = new BoundedLruMap(3);
const localVisits = new BoundedLruMap(3);
const pending = new Map();

function coalesce(key, worker, { force = false } = {}) {
  if (!force && pending.has(key)) return pending.get(key);
  // An invalidation or a forced refresh supersedes the old worker. The old
  // finally must never remove the newer promise, even when it finishes last.
  let promise;
  const latest = () => pending.get(key) || coalesce(key, worker);
  promise = Promise.resolve()
    .then(() => worker(() => pending.get(key) === promise))
    .then((result) => pending.get(key) === promise ? result : latest())
    .catch((error) => {
      if (pending.get(key) !== promise) return latest();
      throw error;
    })
    .finally(() => { if (pending.get(key) === promise) pending.delete(key); });
  pending.set(key, promise);
  return promise;
}

export function peekClientSites(clientId) {
  return clientSites.get(String(clientId || '')) || null;
}

export async function prewarmClientSites(clientId, { force = false } = {}) {
  const key = String(clientId || '');
  if (!key) return { sites: [], memberships: [] };
  if (!force) {
    const cached = clientSites.get(key);
    if (cached) return cached;
  }
  return coalesce(`client:${key}`, async (isCurrent) => {
    const [sites, memberships] = await Promise.all([
      listerSitesClient(key),
      listerAppartenancesClient(key),
    ]);
    const bundle = { sites: sites || [], memberships: memberships || [], loadedAt: Date.now() };
    if (isCurrent()) clientSites.set(key, bundle);
    return bundle;
  }, { force });
}

async function materialiserLocauxManquants(siteId, db) {
  const rows = await db.getAllAsync(
    `SELECT l.remote_local_id
     FROM api_local_links l
     JOIN api_site_links s ON s.remote_site_id=l.remote_site_id
     WHERE s.local_site_id=? AND l.remote_present=1
       AND (l.local_installation_id IS NULL OR trim(l.local_installation_id)='')`,
    [String(siteId)]
  );
  for (const row of rows || []) {
    await materializeCachedLocalForSite(siteId, row.remote_local_id);
  }
}

export function peekSiteLocals(siteId) {
  return siteLocals.get(String(siteId || '')) || null;
}

export async function prewarmSiteLocals(siteId, { force = false } = {}) {
  const key = String(siteId || '');
  if (!key) return { rows: [], legacyCount: 0 };
  if (!force) {
    const cached = siteLocals.get(key);
    if (cached) return cached;
  }
  return coalesce(`site:${key}`, async (isCurrent) => {
    const db = await getDb();
    await materialiserLocauxManquants(key, db);
    const [rows, legacy] = await Promise.all([
      db.getAllAsync(
        `SELECT
           i.id AS installation_id,
           i.nom,
           i.description,
           i.type_code,
           (SELECT l.remote_local_id FROM api_local_links l
             WHERE l.local_installation_id=i.id AND l.remote_present=1
             ORDER BY l.synced_at DESC LIMIT 1) AS remote_local_id,
           (SELECT l.remote_site_id FROM api_local_links l
             WHERE l.local_installation_id=i.id AND l.remote_present=1
             ORDER BY l.synced_at DESC LIMIT 1) AS remote_site_id,
           (SELECT l.designation FROM api_local_links l
             WHERE l.local_installation_id=i.id AND l.remote_present=1
             ORDER BY l.synced_at DESC LIMIT 1) AS remote_designation,
           (SELECT l.remote_trame_id FROM api_local_links l
             WHERE l.local_installation_id=i.id AND l.remote_present=1
             ORDER BY l.synced_at DESC LIMIT 1) AS remote_trame_id,
           (SELECT l.remote_trame_nom FROM api_local_links l
             WHERE l.local_installation_id=i.id AND l.remote_present=1
             ORDER BY l.synced_at DESC LIMIT 1) AS remote_trame_nom,
           (SELECT cs.remote_client_id
              FROM api_local_links l2
              JOIN api_client_site_links cs ON cs.remote_site_id=l2.remote_site_id AND cs.remote_present=1
              WHERE l2.local_installation_id=i.id AND l2.remote_present=1
              ORDER BY cs.synced_at DESC LIMIT 1) AS remote_client_id,
           (SELECT COUNT(*) FROM visites v WHERE v.installation_id=i.id) AS visit_count,
           (SELECT v.date_visite FROM visites v
             WHERE v.installation_id=i.id
             ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC LIMIT 1) AS latest_visit_date,
           (SELECT v.trame_id FROM visites v
             WHERE v.installation_id=i.id
             ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC LIMIT 1) AS latest_trame_id
         FROM installations i
         WHERE i.site_id=? AND i.actif=1
         ORDER BY COALESCE(i.nom,'') COLLATE NOCASE,i.cree_le`,
        [key]
      ),
      db.getFirstAsync(`SELECT COUNT(*) AS n FROM visites WHERE site_id=? AND installation_id IS NULL`, [key]),
    ]);
    const bundle = { rows: rows || [], legacyCount: Number(legacy?.n || 0), loadedAt: Date.now() };
    if (isCurrent()) siteLocals.set(key, bundle);
    return bundle;
  }, { force });
}

function visitScopeKey(siteId, installationId, legacyOnly) {
  return `${String(siteId || '')}::${legacyOnly ? 'legacy' : String(installationId || 'site')}`;
}

export function peekLocalVisits(siteId, installationId, legacyOnly = false) {
  return localVisits.get(visitScopeKey(siteId, installationId, legacyOnly)) || null;
}

export async function prewarmLocalVisits({ siteId, installationId = null, legacyOnly = false, force = false }) {
  const key = visitScopeKey(siteId, installationId, legacyOnly);
  if (!String(siteId || '')) return { visits: [], site: null, intranetClientImported: false };
  if (!force) {
    const cached = localVisits.get(key);
    if (cached) return cached;
  }
  return coalesce(`visits:${key}`, async (isCurrent) => {
    const visitsPromise = legacyOnly
      ? listerVisitesLocal(siteId, null, { legacyOnly: true })
      : installationId
        ? listerVisitesLocal(siteId, installationId)
        : listerVisitesSite(siteId);

    const [visits, site] = await Promise.all([visitsPromise, getSiteLocalisation(siteId)]);
    const db = await getDb();
    const importedClient = site?.client_id
      ? await db.getFirstAsync('SELECT remote_client_id FROM api_client_links WHERE local_client_id=? LIMIT 1', [site.client_id])
      : null;
    const bundle = {
      visits: visits || [],
      site: site || null,
      intranetClientImported: Boolean(importedClient?.remote_client_id),
      loadedAt: Date.now(),
    };
    if (isCurrent()) localVisits.set(key, bundle);
    return bundle;
  }, { force });
}

export function invalidateClientSites(clientId) {
  const key = String(clientId || '');
  clientSites.delete(key);
  pending.delete(`client:${key}`);
}

export function invalidateSiteLocals(siteId) {
  const key = String(siteId || '');
  siteLocals.delete(key);
  pending.delete(`site:${key}`);
}

export function invalidateLocalVisits(siteId, installationId = null, legacyOnly = false) {
  const key = visitScopeKey(siteId, installationId, legacyOnly);
  localVisits.delete(key);
  pending.delete(`visits:${key}`);
}

export function navigationPrewarmStats() {
  return {
    clientSites: clientSites.size,
    siteLocals: siteLocals.size,
    localVisits: localVisits.size,
    inflight: pending.size,
  };
}
