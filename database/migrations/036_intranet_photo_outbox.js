export const migration036 = {
  version: 36,
  name: 'intranet_photo_outbox',
  sql: `
    CREATE TABLE IF NOT EXISTS api_visit_photo_outbox (
      id TEXT PRIMARY KEY,
      photo_id TEXT NOT NULL,
      visite_id TEXT NOT NULL,
      remote_client_id TEXT NOT NULL,
      remote_visit_id TEXT NOT NULL,
      envoi_photo_id TEXT NOT NULL UNIQUE,
      source_uri TEXT NOT NULL,
      source_entity_key TEXT,
      snapshot_uri TEXT,
      content_type TEXT NOT NULL
        CHECK (content_type IN ('image/jpeg','image/png','image/gif','image/webp')),
      description TEXT NOT NULL DEFAULT '',
      photo_order INTEGER NOT NULL CHECK (photo_order BETWEEN 1 AND 10000),
      is_large_format INTEGER NOT NULL DEFAULT 0 CHECK (is_large_format IN (0,1)),
      categorie_id TEXT,
      sous_categorie_id TEXT,
      critere_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','retry','synced','rejected','validation_error','auth_error')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      http_status INTEGER,
      error_code TEXT,
      error_message TEXT,
      violations_json TEXT,
      remote_photo_id TEXT,
      replayed INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1)),
      queued_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      CHECK (
        (categorie_id IS NULL AND sous_categorie_id IS NULL AND critere_id IS NULL)
        OR
        (categorie_id IS NOT NULL AND sous_categorie_id IS NOT NULL AND critere_id IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_visit
      ON api_visit_photo_outbox(visite_id, remote_visit_id, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_retry
      ON api_visit_photo_outbox(status, next_attempt_at, queued_at);
    CREATE INDEX IF NOT EXISTS idx_api_visit_photo_outbox_source
      ON api_visit_photo_outbox(photo_id, remote_visit_id, source_uri);

    -- Une visite historique importée n'a pas encore d'outbox de visite METRA.
    -- Toute modification photo doit donc recréer une nouvelle visite serveur.
    -- Même règle lorsqu'une photo déjà acquittée est remplacée, déplacée vers
    -- un autre critère, renommée ou supprimée : l'API photo ne fournit pas de
    -- DELETE/UPDATE, une nouvelle visite est la seule représentation fidèle.
    CREATE TRIGGER IF NOT EXISTS trg_photo_requires_visit_revision_insert
    AFTER INSERT ON photos
    WHEN EXISTS (
      SELECT 1 FROM provenances p
      WHERE p.entite_type='visite' AND p.entite_id=NEW.visite_id AND p.origine='api_symfony'
        AND p.details_json LIKE '%"sourceType":"imported_latest_visit"%'
    )
    BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_photo_requires_visit_revision_update
    AFTER UPDATE OF uri, label, entite_key ON photos
    WHEN (
      COALESCE(OLD.uri,'') IS NOT COALESCE(NEW.uri,'')
      OR COALESCE(OLD.label,'') IS NOT COALESCE(NEW.label,'')
      OR COALESCE(OLD.entite_key,'') IS NOT COALESCE(NEW.entite_key,'')
    ) AND (
      EXISTS (
        SELECT 1 FROM provenances p
        WHERE p.entite_type='visite' AND p.entite_id=NEW.visite_id AND p.origine='api_symfony'
          AND p.details_json LIKE '%"sourceType":"imported_latest_visit"%'
      ) OR EXISTS (
        SELECT 1 FROM api_visit_photo_outbox po
        WHERE po.visite_id=NEW.visite_id AND po.photo_id=NEW.id AND po.status='synced'
      )
    )
    BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=NEW.visite_id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_photo_requires_visit_revision_delete
    AFTER DELETE ON photos
    WHEN EXISTS (
      SELECT 1 FROM provenances p
      WHERE p.entite_type='visite' AND p.entite_id=OLD.visite_id AND p.origine='api_symfony'
        AND p.details_json LIKE '%"sourceType":"imported_latest_visit"%'
    ) OR EXISTS (
      SELECT 1 FROM api_visit_photo_outbox po
      WHERE po.visite_id=OLD.visite_id AND po.photo_id=OLD.id AND po.status='synced'
    )
    BEGIN
      UPDATE visites SET api_content_revision=api_content_revision+1 WHERE id=OLD.visite_id;
    END;
  `,
};