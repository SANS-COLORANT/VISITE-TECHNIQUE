export const migration038 = {
  version: 38,
  name: 'intranet_structure_creation',
  sql: `
    CREATE TABLE IF NOT EXISTS api_structure_referential (
      remote_client_id INTEGER PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_structure_outbox (
      operation_id TEXT PRIMARY KEY NOT NULL,
      resource_type TEXT NOT NULL,
      creation_id TEXT NOT NULL UNIQUE,
      remote_client_id INTEGER NOT NULL,
      local_site_id TEXT,
      local_installation_id TEXT,
      depends_on_id TEXT,
      payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      last_http_status INTEGER,
      last_error_code TEXT,
      last_error_message TEXT,
      remote_id INTEGER,
      replayed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_ready
      ON api_structure_outbox(state, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_client
      ON api_structure_outbox(remote_client_id, state, created_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_site
      ON api_structure_outbox(local_site_id, resource_type, state, created_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_installation
      ON api_structure_outbox(local_installation_id, resource_type, state, created_at);
  `
};
