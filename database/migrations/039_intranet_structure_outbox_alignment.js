export const migration039 = {
  version: 39,
  name: 'intranet_structure_outbox_alignment',
  sql: `
    DROP INDEX IF EXISTS idx_api_structure_outbox_ready;
    DROP INDEX IF EXISTS idx_api_structure_outbox_client;
    DROP INDEX IF EXISTS idx_api_structure_outbox_site;
    DROP INDEX IF EXISTS idx_api_structure_outbox_installation;

    ALTER TABLE api_structure_outbox RENAME TO api_structure_outbox_v38;

    CREATE TABLE api_structure_outbox (
      operation_id TEXT PRIMARY KEY NOT NULL,
      resource_type TEXT NOT NULL,
      creation_id TEXT NOT NULL UNIQUE,
      remote_client_id INTEGER NOT NULL,
      local_site_id TEXT,
      local_installation_id TEXT,
      depends_on_id TEXT,
      payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      http_status INTEGER,
      error_code TEXT,
      error_message TEXT,
      violations_json TEXT,
      remote_id INTEGER,
      replayed INTEGER NOT NULL DEFAULT 0,
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO api_structure_outbox(
      operation_id,resource_type,creation_id,remote_client_id,local_site_id,
      local_installation_id,depends_on_id,payload_json,payload_bytes,status,
      attempt_count,next_attempt_at,http_status,error_code,error_message,
      violations_json,remote_id,replayed,queued_at,created_at,last_attempt_at,
      synced_at,updated_at
    )
    SELECT
      operation_id,resource_type,creation_id,remote_client_id,local_site_id,
      local_installation_id,depends_on_id,payload_json,payload_bytes,
      CASE
        WHEN state IN ('pending','sending','retry','synced','conflict','validation_error','rejected','auth_error') THEN state
        ELSE 'pending'
      END,
      attempt_count,next_attempt_at,last_http_status,last_error_code,
      last_error_message,NULL,remote_id,replayed,
      COALESCE(created_at,datetime('now')),
      COALESCE(created_at,datetime('now')),
      last_attempt_at,synced_at,
      COALESCE(updated_at,created_at,datetime('now'))
    FROM api_structure_outbox_v38;

    DROP TABLE api_structure_outbox_v38;

    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_ready
      ON api_structure_outbox(status, next_attempt_at, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_client
      ON api_structure_outbox(remote_client_id, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_site
      ON api_structure_outbox(local_site_id, resource_type, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_structure_outbox_installation
      ON api_structure_outbox(local_installation_id, resource_type, status, queued_at);
  `
};
