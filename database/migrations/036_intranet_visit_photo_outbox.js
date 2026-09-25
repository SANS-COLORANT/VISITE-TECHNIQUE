export const migration036 = {
  version: 36,
  name: 'intranet_visit_photo_outbox',
  sql: `
    CREATE TABLE IF NOT EXISTS api_visit_photo_outbox (
      photo_id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL,
      envoi_photo_id TEXT NOT NULL UNIQUE,
      remote_client_id TEXT NOT NULL,
      remote_visit_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      ordre INTEGER NOT NULL CHECK (ordre >= 1 AND ordre <= 10000),
      grand_format INTEGER NOT NULL DEFAULT 0 CHECK (grand_format IN (0,1)),
      categorie_id TEXT,
      sous_categorie_id TEXT,
      critere_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','retry','synced','validation_error','rejected','auth_error')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      http_status INTEGER,
      error_code TEXT,
      error_message TEXT,
      violations_json TEXT,
      remote_photo_id TEXT,
      replayed INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1)),
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_attempt_at TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_ready
      ON api_visit_photo_outbox(status, next_attempt_at, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_visit
      ON api_visit_photo_outbox(visite_id, status, ordre);
    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_remote
      ON api_visit_photo_outbox(remote_client_id, remote_visit_id, ordre);
  `
};
