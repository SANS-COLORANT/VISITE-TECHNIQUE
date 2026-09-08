export const migration030 = {
  version: 30,
  name: 'large_client_performance_indexes',
  sql: `
    -- Navigation client -> sites et tri alphabétique sur les gros patrimoines.
    CREATE INDEX IF NOT EXISTS idx_sites_client_nom
      ON sites(client_id, nom_site COLLATE NOCASE);

    -- Historique / préremplissage : retrouver immédiatement la dernière visite
    -- d'un même site, d'une même trame et d'un même local technique.
    CREATE INDEX IF NOT EXISTS idx_visites_site_trame_install_date
      ON visites(site_id, trame_id, installation_id, date_visite, modifie_le);

    -- Préparation Intranet : éviter les scans complets avec plusieurs centaines
    -- de sites/locaux synchronisés pour un même client.
    CREATE INDEX IF NOT EXISTS idx_api_client_site_client_present
      ON api_client_site_links(remote_client_id, remote_present, remote_site_id);
    CREATE INDEX IF NOT EXISTS idx_api_site_links_client_nom
      ON api_site_links(remote_client_id, nom COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_api_local_links_site_present
      ON api_local_links(remote_site_id, remote_present, designation COLLATE NOCASE);
  `,
};
