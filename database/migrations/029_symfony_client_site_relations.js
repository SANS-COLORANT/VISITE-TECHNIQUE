export const migration029 = {
  version: 29,
  name: 'symfony_client_site_relations',
  sql: `
    CREATE TABLE IF NOT EXISTS api_client_site_links (
      remote_client_id TEXT NOT NULL,
      remote_site_id TEXT NOT NULL,
      local_site_id TEXT,
      cree_localement INTEGER NOT NULL DEFAULT 0 CHECK (cree_localement IN (0, 1)),
      remote_present INTEGER NOT NULL DEFAULT 1 CHECK (remote_present IN (0, 1)),
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (remote_client_id, remote_site_id),
      FOREIGN KEY (remote_client_id) REFERENCES api_client_links(remote_client_id) ON DELETE CASCADE,
      FOREIGN KEY (remote_site_id) REFERENCES api_site_links(remote_site_id) ON DELETE CASCADE,
      FOREIGN KEY (local_site_id) REFERENCES sites(id) ON DELETE SET NULL
    );

    INSERT OR IGNORE INTO api_client_site_links(
      remote_client_id,remote_site_id,local_site_id,cree_localement,remote_present,synced_at
    )
    SELECT remote_client_id,remote_site_id,local_site_id,cree_localement,remote_present,synced_at
    FROM api_site_links
    WHERE remote_client_id IS NOT NULL AND trim(remote_client_id)<>'';

    CREATE INDEX IF NOT EXISTS idx_api_client_site_remote_site
      ON api_client_site_links(remote_site_id, remote_present);
    CREATE INDEX IF NOT EXISTS idx_api_client_site_local_site
      ON api_client_site_links(local_site_id);
  `,
};
