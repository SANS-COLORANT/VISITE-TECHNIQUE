export const migration033 = {
  version: 33,
  name: 'intranet_visit_outbox',
  sql: `
    -- Remote identity is frozen on the METRA visit. It must not be inferred
    -- later from a mutable client/site preparation cache.
    ALTER TABLE visites ADD COLUMN api_remote_client_id TEXT;
    ALTER TABLE visites ADD COLUMN api_remote_trame_id TEXT;
    ALTER TABLE visites ADD COLUMN api_source_remote_visit_id TEXT;

    -- The historical local delay remains a number of months. These dedicated
    -- fields match the Symfony visit-upload contract and avoid silently
    -- converting one business meaning into another.
    ALTER TABLE remarques ADD COLUMN intranet_date_reserve TEXT;
    ALTER TABLE remarques ADD COLUMN intranet_delai TEXT;
    ALTER TABLE remarques ADD COLUMN intranet_etat_avancement TEXT;

    CREATE TABLE IF NOT EXISTS api_visit_outbox (
      envoi_id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL UNIQUE,
      remote_client_id TEXT NOT NULL,
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
      remote_visit_id TEXT,
      replayed INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1)),
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_visit_outbox_ready
      ON api_visit_outbox(status, next_attempt_at, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_visit_outbox_client
      ON api_visit_outbox(remote_client_id, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_visites_api_remote_client
      ON visites(api_remote_client_id, api_remote_local_id);
  `,
};
