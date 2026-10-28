/**
 * Photos libres are local-only by default, including pre-existing free photos.
 * One additive column; no existing image, label or attachment is deleted.
 */
export const migration048 = {
  version: 48,
  name: 'free_photo_local_only',
  sql: `
    ALTER TABLE photos ADD COLUMN inclure_export INTEGER NOT NULL DEFAULT 1 CHECK (inclure_export IN (0,1));
    ALTER TABLE photos ADD COLUMN libelle_personnalise INTEGER NOT NULL DEFAULT 0 CHECK (libelle_personnalise IN (0,1));
    UPDATE photos SET inclure_export=0 WHERE entite_key IS NULL OR trim(entite_key)='';
    DELETE FROM api_visit_photo_outbox
      WHERE photo_id IN (SELECT id FROM photos WHERE inclure_export=0)
        AND status<>'synced';
    CREATE INDEX IF NOT EXISTS idx_photos_visite_export
      ON photos(visite_id,inclure_export);
  `,
};
