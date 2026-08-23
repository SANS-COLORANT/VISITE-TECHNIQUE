export const migration011 = {
  version: 11,
  name: 'catalog_experience',
  sql: `
    ALTER TABLE modeles_equipement ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'actuel';
    ALTER TABLE modeles_equipement ADD COLUMN replacement_note TEXT;
    ALTER TABLE modeles_equipement ADD COLUMN aliases TEXT;

    ALTER TABLE documents_equipement ADD COLUMN langue TEXT;
    ALTER TABLE documents_equipement ADD COLUMN version_document TEXT;
    ALTER TABLE documents_equipement ADD COLUMN date_document TEXT;

    CREATE TABLE IF NOT EXISTS catalogue_usage (
      modele_id TEXT PRIMARY KEY,
      favori INTEGER NOT NULL DEFAULT 0 CHECK (favori IN (0,1)),
      ouvertures INTEGER NOT NULL DEFAULT 0,
      dernier_acces TEXT,
      FOREIGN KEY (modele_id) REFERENCES modeles_equipement(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_catalogue_usage_favori ON catalogue_usage(favori, dernier_acces);
    CREATE INDEX IF NOT EXISTS idx_models_lifecycle ON modeles_equipement(lifecycle_status, actif);
  `,
};
