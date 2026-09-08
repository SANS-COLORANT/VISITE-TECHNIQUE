import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

const DEFAULT_BASE_URL = 'https://intranet-energieetservice.com';
const clean = (v) => String(v ?? '').trim();
const normalize = (v) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const json = (value) => JSON.stringify(value ?? null);

async function db() { return openAppDatabase(); }

export async function getApiSyncState() {
  const database = await db();
  return (await database.getFirstAsync(`SELECT * FROM api_sync_state WHERE id=1`)) || { id: 1, base_url: DEFAULT_BASE_URL };
}

export async function updateApiSyncState(patch = {}) {
  const database = await db();
  const current = await getApiSyncState();
  await database.runAsync(
    `INSERT INTO api_sync_state(id,base_url,tablette_id,last_clients_sync_at,last_success_at,last_error,modifie_le)
     VALUES(1,?,?,?,?,?,datetime('now'))
     ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url,tablette_id=excluded.tablette_id,
       last_clients_sync_at=excluded.last_clients_sync_at,last_success_at=excluded.last_success_at,
       last_error=excluded.last_error,modifie_le=datetime('now')`,
    [patch.base_url ?? current.base_url ?? DEFAULT_BASE_URL, patch.tablette_id ?? current.tablette_id ?? null,
      patch.last_clients_sync_at ?? current.last_clients_sync_at ?? null, patch.last_success_at ?? current.last_success_at ?? null,
      Object.prototype.hasOwnProperty.call(patch, 'last_error') ? patch.last_error : (current.last_error ?? null)]
  );
}

export async function cacheAuthorizedClients(clients = []) {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync(`UPDATE api_client_links SET autorise=0`);
    for (const client of clients || []) {
      const id = clean(client?.id); if (!id) continue;
      const agence = client?.agence_energie_et_service || null;
      await database.runAsync(
        `INSERT INTO api_client_links(remote_client_id,local_client_id,nom,categorie,code_everwin,adresse_postale,ville,agence_id,agence_libelle,autorise,payload_json,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
         ON CONFLICT(remote_client_id) DO UPDATE SET nom=excluded.nom,categorie=excluded.categorie,code_everwin=excluded.code_everwin,
           adresse_postale=excluded.adresse_postale,ville=excluded.ville,agence_id=excluded.agence_id,agence_libelle=excluded.agence_libelle,
           autorise=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [id, null, clean(client?.nom) || `Client ${id}`, client?.categorie ?? null, client?.code_everwin ?? null,
          client?.adresse_postale ?? null, client?.ville ?? null, agence?.id != null ? clean(agence.id) : null,
          agence?.libelle ?? null, json(client)]
      );
    }
  });
  await updateApiSyncState({ last_clients_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null });
}

export async function cachePreparation(remoteClientId, payload) {
  const clientId = clean(remoteClientId); if (!clientId) throw new Error('Client API requis');
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO api_preparation_cache(remote_client_id,payload_json,synced_at) VALUES(?,?,datetime('now'))
       ON CONFLICT(remote_client_id) DO UPDATE SET payload_json=excluded.payload_json,synced_at=datetime('now')`, [clientId, json(payload)]
    );
    await database.runAsync(`DELETE FROM api_local_links WHERE remote_site_id IN (SELECT remote_site_id FROM api_site_links WHERE remote_client_id=?)`, [clientId]);
    await database.runAsync(`DELETE FROM api_site_links WHERE remote_client_id=?`, [clientId]);
    for (const visite of payload?.visites || []) {
      const siteId = clean(visite?.site?.id); if (!siteId) continue;
      await database.runAsync(
        `INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,payload_json,synced_at) VALUES(?,?,?,?,datetime('now'))
         ON CONFLICT(remote_site_id) DO UPDATE SET remote_client_id=excluded.remote_client_id,nom=excluded.nom,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [siteId, clientId, clean(visite?.site?.nom) || `Site ${siteId}`, json(visite?.site)]
      );
      const localId = clean(visite?.local?.id); if (!localId) continue;
      await database.runAsync(
        `INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,derniere_visite_statut,reference_json,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_local_id) DO UPDATE SET remote_site_id=excluded.remote_site_id,designation=excluded.designation,
           remote_trame_id=excluded.remote_trame_id,remote_trame_nom=excluded.remote_trame_nom,derniere_visite_id=excluded.derniere_visite_id,
           derniere_visite_date=excluded.derniere_visite_date,derniere_visite_statut=excluded.derniere_visite_statut,reference_json=excluded.reference_json,synced_at=datetime('now')`,
        [localId, siteId, visite?.local?.designation ?? null, visite?.trame?.id != null ? clean(visite.trame.id) : null,
          visite?.trame?.nom ?? null, visite?.derniereVisite?.id != null ? clean(visite.derniereVisite.id) : null,
          visite?.derniereVisite?.date ?? null, visite?.derniereVisite?.statut ?? null, json(visite)]
      );
    }
  });
  await updateApiSyncState({ last_success_at: new Date().toISOString(), last_error: null });
}

export async function searchCachedDirectory(query = '') {
  const database = await db();
  const q = normalize(query);
  const clients = await database.getAllAsync(`SELECT * FROM api_client_links WHERE autorise=1 ORDER BY nom`);
  const sites = await database.getAllAsync(`SELECT s.*,c.nom AS client_nom FROM api_site_links s JOIN api_client_links c ON c.remote_client_id=s.remote_client_id WHERE c.autorise=1 ORDER BY c.nom,s.nom`);
  if (!q) return { clients, sites };
  return {
    clients: clients.filter((c) => normalize([c.nom,c.categorie,c.code_everwin,c.ville,c.agence_libelle].join(' ')).includes(q)),
    sites: sites.filter((s) => normalize([s.nom,s.client_nom].join(' ')).includes(q)),
  };
}

export async function getCachedClient(remoteClientId) {
  return (await db()).getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=?`, [clean(remoteClientId)]);
}
export async function listCachedSites(remoteClientId) {
  return (await db()).getAllAsync(`SELECT * FROM api_site_links WHERE remote_client_id=? ORDER BY nom`, [clean(remoteClientId)]);
}
export async function listCachedLocals(remoteSiteId) {
  return (await db()).getAllAsync(`SELECT * FROM api_local_links WHERE remote_site_id=? ORDER BY designation`, [clean(remoteSiteId)]);
}
export async function getCachedLocalReference(remoteLocalId) {
  const row = await (await db()).getFirstAsync(`SELECT reference_json FROM api_local_links WHERE remote_local_id=?`, [clean(remoteLocalId)]);
  if (!row?.reference_json) return null;
  try { return JSON.parse(row.reference_json); } catch { return null; }
}

export async function materializeCachedClient(remoteClientId) {
  const database = await db();
  const remote = await database.getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=?`, [clean(remoteClientId)]);
  if (!remote) throw new Error('Client API absent du cache local');
  if (remote.local_client_id) return remote.local_client_id;
  const id = createId();
  const adresse = [remote.adresse_postale, remote.ville].filter(Boolean).join(' ');
  await database.runAsync(`INSERT INTO clients(id,nom,code_exploitant,adresse) VALUES(?,?,?,?)`, [id, remote.nom, remote.code_everwin || null, adresse || null]);
  await database.runAsync(`UPDATE api_client_links SET local_client_id=?,cree_localement=1 WHERE remote_client_id=?`, [id, remote.remote_client_id]);
  return id;
}

export async function materializeCachedSite(remoteSiteId) {
  const database = await db();
  const remote = await database.getFirstAsync(`SELECT * FROM api_site_links WHERE remote_site_id=?`, [clean(remoteSiteId)]);
  if (!remote) throw new Error('Site API absent du cache local');
  if (remote.local_site_id) return remote.local_site_id;
  const clientId = await materializeCachedClient(remote.remote_client_id);
  const id = createId();
  await database.runAsync(`INSERT INTO sites(id,client_id,nom_site,statut) VALUES(?,?,?,'Actif')`, [id, clientId, remote.nom]);
  await database.runAsync(`UPDATE api_site_links SET local_site_id=?,cree_localement=1 WHERE remote_site_id=?`, [id, remote.remote_site_id]);
  return id;
}

export async function markApiError(error) {
  await updateApiSyncState({ last_error: String(error?.message || error || 'Erreur API') });
}
