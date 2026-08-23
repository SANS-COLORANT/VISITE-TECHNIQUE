export const migration009 = {
  version: 9,
  name: 'catalog_provenance_media',
  sql: `
    ALTER TABLE modeles_equipement ADD COLUMN image_uri TEXT;
    ALTER TABLE modeles_equipement ADD COLUMN source_uri TEXT;
    ALTER TABLE modeles_equipement ADD COLUMN data_quality TEXT NOT NULL DEFAULT 'catalogue';
    ALTER TABLE modeles_equipement ADD COLUMN verified_at TEXT;

    ALTER TABLE variantes_equipement ADD COLUMN image_uri TEXT;
    ALTER TABLE variantes_equipement ADD COLUMN source_uri TEXT;
    ALTER TABLE variantes_equipement ADD COLUMN data_quality TEXT NOT NULL DEFAULT 'catalogue';
    ALTER TABLE variantes_equipement ADD COLUMN verified_at TEXT;
  `,
};
