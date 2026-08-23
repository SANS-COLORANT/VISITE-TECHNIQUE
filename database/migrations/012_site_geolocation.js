export const migration012 = {
  version: 12,
  name: 'site_geolocation',
  sql: `
    ALTER TABLE sites ADD COLUMN latitude REAL;
    ALTER TABLE sites ADD COLUMN longitude REAL;
    ALTER TABLE sites ADD COLUMN precision_gps REAL;
    ALTER TABLE sites ADD COLUMN localisation_note TEXT;
    ALTER TABLE sites ADD COLUMN gps_modifie_le TEXT;

    CREATE INDEX IF NOT EXISTS idx_sites_client_gps
      ON sites(client_id, latitude, longitude);
  `,
};
