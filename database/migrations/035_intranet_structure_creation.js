export const migration035 = {
  version: 35,
  name: 'intranet_structure_creation',
  sql: `
    CREATE TABLE IF NOT EXISTS api_structure_referential (
      remote_client_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_structure_outbox (
      operation_id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('site','local')),
      creation_id TEXT NOT NULL UNIQUE,
      remote_client_id TEXT NOT NULL,
      local_site_id TEXT,
      local_installation_id TEXT,
      depends_on_id TEXT,
      payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','retry','synced','conflict','validation_error','rejected','auth_error')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      http_status INTEGER,
      error_code TEXT,
      error_message TEXT,
      violations_json TEXT,
      remote_id TEXT,
      replayed INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1)),
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (local_site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (local_installation_id) REFERENCES installations(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_id) REFERENCES api_structure_outbox(operation_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_ready
      ON api_structure_outbox(status, next_attempt_at, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_client
      ON api_structure_outbox(remote_client_id, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_site
      ON api_structure_outbox(local_site_id, resource_type, status);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_installation
      ON api_structure_outbox(local_installation_id, resource_type, status);
  `,
};
