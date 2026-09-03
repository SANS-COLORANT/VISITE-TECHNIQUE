export const migration024 = {
  version: 24,
  name: 'site_groups',
  sql: `
    CREATE TABLE IF NOT EXISTS site_groupes (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      nom TEXT NOT NULL,
      description TEXT,
      ordre INTEGER NOT NULL DEFAULT 0,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      UNIQUE (client_id, nom COLLATE NOCASE)
    );

    CREATE TABLE IF NOT EXISTS site_groupe_membres (
      groupe_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (groupe_id, site_id),
      FOREIGN KEY (groupe_id) REFERENCES site_groupes(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_site_groupes_client
      ON site_groupes(client_id, ordre, nom);
    CREATE INDEX IF NOT EXISTS idx_site_groupe_membres_site
      ON site_groupe_membres(site_id, groupe_id);
  `,
};
