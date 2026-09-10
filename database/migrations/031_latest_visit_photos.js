export const migration031 = {
  version: 31,
  name: 'latest_visit_photos',
  sql: `
    CREATE TABLE IF NOT EXISTS api_latest_visit_photo_manifests (
      remote_client_id TEXT PRIMARY KEY,
      client_name TEXT,
      site_count INTEGER NOT NULL DEFAULT 0,
      available_photo_count INTEGER NOT NULL DEFAULT 0,
      available_bytes INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (remote_client_id) REFERENCES api_client_links(remote_client_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_latest_visit_photos (
      remote_client_id TEXT NOT NULL,
      remote_photo_id TEXT NOT NULL,
      remote_site_id TEXT,
      site_name TEXT,
      remote_local_id TEXT,
      local_designation TEXT,
      remote_visit_id TEXT,
      visit_date TEXT,
      visit_status TEXT,
      description TEXT,
      photo_order INTEGER,
      is_large_format INTEGER NOT NULL DEFAULT 0 CHECK (is_large_format IN (0, 1)),
      remote_available INTEGER NOT NULL DEFAULT 0 CHECK (remote_available IN (0, 1)),
      mime_type TEXT,
      expected_bytes INTEGER,
      width_pixels INTEGER,
      height_pixels INTEGER,
      download_path TEXT,
      local_uri TEXT,
      downloaded_bytes INTEGER,
      download_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (download_status IN ('pending', 'downloaded', 'unavailable', 'error')),
      last_error TEXT,
      manifest_present INTEGER NOT NULL DEFAULT 1 CHECK (manifest_present IN (0, 1)),
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      downloaded_at TEXT,
      PRIMARY KEY (remote_client_id, remote_photo_id),
      FOREIGN KEY (remote_client_id) REFERENCES api_client_links(remote_client_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_latest_photo_client_present
      ON api_latest_visit_photos(remote_client_id, manifest_present, remote_site_id, remote_local_id, photo_order);
    CREATE INDEX IF NOT EXISTS idx_api_latest_photo_local
      ON api_latest_visit_photos(remote_local_id, remote_visit_id);
    CREATE INDEX IF NOT EXISTS idx_api_latest_photo_download
      ON api_latest_visit_photos(remote_client_id, download_status, remote_available);
  `,
};
