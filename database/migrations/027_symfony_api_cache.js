export const migration027 = {
  version: 27,
  name: 'symfony_api_cache',
  sql: `
    CREATE TABLE IF NOT EXISTS api_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      tablette_id TEXT,
      last_clients_sync_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_client_links (
      remote_client_id TEXT PRIMARY KEY,
      local_client_id TEXT,
      nom TEXT NOT NULL,
      categorie TEXT,
      code_everwin TEXT,
      adresse_postale TEXT,
      ville TEXT,
      agence_id TEXT,
      agence_libelle TEXT,
      autorise INTEGER NOT NULL DEFAULT 1 CHECK (autorise IN (0, 1)),
      cree_localement INTEGER NOT NULL DEFAULT 0 CHECK (cree_localement IN (0, 1)),
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_site_links (
      remote_site_id TEXT PRIMARY KEY,
      remote_client_id TEXT NOT NULL,
      local_site_id TEXT,
      nom TEXT NOT NULL,
      cree_localement INTEGER NOT NULL DEFAULT 0 CHECK (cree_localement IN (0, 1)),
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_local_links (
      remote_local_id TEXT PRIMARY KEY,
      remote_site_id TEXT NOT NULL,
      designation TEXT,
      remote_trame_id TEXT,
      remote_trame_nom TEXT,
      derniere_visite_id TEXT,
      derniere_visite_date TEXT,
      derniere_visite_statut TEXT,
      reference_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_preparation_cache (
      remote_client_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO api_sync_state (id, base_url)
    VALUES (1, 'https://intranet-energieetservice.com');

    CREATE INDEX IF NOT EXISTS idx_api_client_local ON api_client_links(local_client_id);
    CREATE INDEX IF NOT EXISTS idx_api_client_search ON api_client_links(nom, code_everwin, ville);
    CREATE INDEX IF NOT EXISTS idx_api_site_client ON api_site_links(remote_client_id);
    CREATE INDEX IF NOT EXISTS idx_api_site_local ON api_site_links(local_site_id);
    CREATE INDEX IF NOT EXISTS idx_api_local_site ON api_local_links(remote_site_id);
  `,
};
