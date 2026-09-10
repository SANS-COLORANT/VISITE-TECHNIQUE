export const migration032 = {
  version: 32,
  name: 'photo_reference_workflow',
  sql: `
    CREATE TABLE IF NOT EXISTS api_photo_files (
      remote_client_id TEXT NOT NULL,
      remote_photo_id TEXT NOT NULL,
      file_key TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      downloaded_bytes INTEGER NOT NULL,
      downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (remote_client_id, remote_photo_id, file_key),
      FOREIGN KEY (remote_client_id) REFERENCES api_client_links(remote_client_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS api_visit_photo_references (
      visite_id TEXT NOT NULL,
      remote_client_id TEXT NOT NULL,
      remote_site_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (visite_id, remote_client_id, remote_site_id),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      FOREIGN KEY (remote_client_id) REFERENCES api_client_links(remote_client_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS api_visit_photo_local_choices (
      visite_id TEXT NOT NULL,
      context_key TEXT NOT NULL,
      remote_client_id TEXT NOT NULL,
      remote_site_id TEXT NOT NULL,
      remote_local_id TEXT NOT NULL,
      PRIMARY KEY (visite_id, context_key, remote_client_id, remote_site_id),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE
    );
  `,
};
