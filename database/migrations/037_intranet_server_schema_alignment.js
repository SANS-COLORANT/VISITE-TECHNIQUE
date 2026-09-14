export const migration037 = {
  version: 37,
  name: 'intranet_server_schema_alignment',
  sql: `
    -- Dump serveur energieetservice du 14/09/2026 : conserver localement les
    -- métadonnées réellement portées par CLIENT, SITE et LOCAL afin d'éviter
    -- de perdre des informations lors de la matérialisation offline.
    ALTER TABLE api_client_links ADD COLUMN logo_client TEXT;

    ALTER TABLE api_site_links ADD COLUMN site_principal TEXT;
    ALTER TABLE api_site_links ADD COLUMN adresse TEXT;
    ALTER TABLE api_site_links ADD COLUMN code_postal TEXT;
    ALTER TABLE api_site_links ADD COLUMN ville TEXT;
    ALTER TABLE api_site_links ADD COLUMN code_exploitant TEXT;
    ALTER TABLE api_site_links ADD COLUMN surface_batiment REAL;
    ALTER TABLE api_site_links ADD COLUMN date_batiment TEXT;
    ALTER TABLE api_site_links ADD COLUMN nombre_logements TEXT;
    ALTER TABLE api_site_links ADD COLUMN date_ajout TEXT;
    ALTER TABLE api_site_links ADD COLUMN date_supression TEXT;
    ALTER TABLE api_site_links ADD COLUMN code TEXT;
    ALTER TABLE api_site_links ADD COLUMN energie TEXT;
    ALTER TABLE api_site_links ADD COLUMN type_batiment TEXT;
    ALTER TABLE api_site_links ADD COLUMN type_marche TEXT;
    ALTER TABLE api_site_links ADD COLUMN service TEXT;
    ALTER TABLE api_site_links ADD COLUMN agence TEXT;

    ALTER TABLE api_local_links ADD COLUMN type_local TEXT;
    ALTER TABLE api_local_links ADD COLUMN situation TEXT;
    ALTER TABLE api_local_links ADD COLUMN periodicite_visite INTEGER;
    ALTER TABLE api_local_links ADD COLUMN prochaine_visite TEXT;
    ALTER TABLE api_local_links ADD COLUMN visite_planifiee TEXT;
    ALTER TABLE api_local_links ADD COLUMN ordre INTEGER;
    ALTER TABLE api_local_links ADD COLUMN remote_type_trame_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_api_site_address
      ON api_site_links(ville, code_postal, remote_present);
    CREATE INDEX IF NOT EXISTS idx_api_local_site_order
      ON api_local_links(remote_site_id, remote_present, ordre, designation);
  `,
};
