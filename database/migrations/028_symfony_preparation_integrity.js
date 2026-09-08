export const migration028 = {
  version: 28,
  name: 'symfony_preparation_integrity',
  sql: `
    ALTER TABLE api_site_links ADD COLUMN remote_present INTEGER NOT NULL DEFAULT 1 CHECK (remote_present IN (0, 1));

    ALTER TABLE api_local_links ADD COLUMN local_installation_id TEXT;
    ALTER TABLE api_local_links ADD COLUMN remote_present INTEGER NOT NULL DEFAULT 1 CHECK (remote_present IN (0, 1));
    ALTER TABLE api_local_links ADD COLUMN criteria_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE api_local_links ADD COLUMN historical_criteria_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE api_local_links ADD COLUMN remark_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE api_local_links ADD COLUMN material_count INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_api_site_remote_present
      ON api_site_links(remote_client_id, remote_present);
    CREATE INDEX IF NOT EXISTS idx_api_local_installation
      ON api_local_links(local_installation_id);
    CREATE INDEX IF NOT EXISTS idx_api_local_latest_visit
      ON api_local_links(derniere_visite_date);
    CREATE INDEX IF NOT EXISTS idx_api_local_remote_present
      ON api_local_links(remote_site_id, remote_present);
  `,
};
